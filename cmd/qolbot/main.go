// qolbot is the cross-platform replacement for D2Bot.exe. It has no GUI
// toolkit and no .NET: it supervises profiles, answers the D2Bot.* calls that
// kolbot's OOG.js makes, and serves a web UI. The Windows-only work (message
// window, launching Game.exe, injecting D2BS.dll) is delegated to d2bridge.exe.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"d2qolbot/internal/spec"
	"d2qolbot/internal/wire"
)

// Profile is one bot: a character that joins your TCP/IP game.
type Profile struct {
	Name      string `json:"name"`      // profile / window title; defaults to the character name
	Character string `json:"character"` // character to log in with
	Info      string `json:"info"`      // status text reported by the scripts
	Hidden    bool   `json:"hidden,omitempty"`
	Spec      string `json:"spec,omitempty"` // force a build template for this character, e.g. "Hammerdin" (default: auto-detect)
	Role      string `json:"role,omitempty"` // "" = join the user's TCP/IP game (default); "host" = host one (testing)
}

// starter is the only starter script: join a TCP/IP game hosted by the user.
const starter = "D2BotTcpIpJoin.dbj"

// hostStarter / hostGameScript: a profile with role "host" creates the TCP/IP game and
// then just idles in it, so the other bots can be tested with no human host.
const (
	hostStarter    = "D2BotTcpIpHost.dbj"
	hostGameScript = "hostidle.dbj"
)

type Config struct {
	GameExe         string         `json:"gameExe"`               // path to Game.exe; set it on the web page (Settings tab) or here (unix path ok under Wine)
	GameDir         string         `json:"gameDir"`               // working dir (defaults to Game.exe's dir)
	D2BSDll         string         `json:"d2bsDll"`               // default: ./d2bs/D2BS.dll
	ScriptPath      string         `json:"scriptPath"`            // kolbot folder name relative to d2bs/
	SafeMode        bool           `json:"safeMode"`              // Bots page checkbox: bots are prohibited from AutoEquip, AutoStat and AutoSkill (whatever the Automation tab says) and pick up only consumables and quest items
	Plugy           *bool          `json:"plugy"`                 // the game uses PlugY (default true): turns on the features that need it
	QuietChat       bool           `json:"quietChat,omitempty"`   // old setting: same as reportTasks=false
	ReportTasks     *bool          `json:"reportTasks"`           // bots say what task they are starting ("Ready", "Running town chores", ...) (default true)
	ReportProblems  *bool          `json:"reportProblems"`        // bots say when they have a problem or cannot do something (default true)
	Goal            string         `json:"goal,omitempty"`        // what a bot given the script "From goal" does: "Quest", "Farm" ("" = Follow)
	FarmRuns        []string       `json:"farmRuns,omitempty"`    // the farm runs chosen for the goal Farm (kolbot script names)
	Difficulty      string         `json:"difficulty,omitempty"`  // difficulty the leader bot hosts in: Normal, Nightmare or Hell (Hell when empty; the highest it has unlocked below that)
	Pickit          *PickitSel     `json:"pickit,omitempty"`      // which .nip lists followers and the leader bot load (defaults when absent)
	PickitRules     *PickitRules   `json:"pickitRules,omitempty"` // the simple choices on the Keeper tab (turned into Generated.nip)
	Gamble          *bool          `json:"gamble"`                // bots may gamble when rich (default true; they say so in chat first)
	AutoTown        *bool          `json:"autoTown"`              // bots follow the leader between town and the field by themselves (default true)
	SaveOnStop      *bool          `json:"saveOnStop"`            // save a bot's character before stopping it (default true; needs PlugY commands)
	AutoSaveMinutes *int           `json:"autoSaveMinutes"`       // bots also save every N minutes while running (default 5, 0 = off)
	Storage         *spec.Storage  `json:"storage"`               // inventory/stash/cube sizes and the full-stash policy (default: a 10x6 inventory, a 10x10 stash and a 3x4 cube)
	Banter          *bool          `json:"banter"`                // bots speak their quotes (default true)
	BanterBubble    bool           `json:"banterBubble"`          // speak with a leading "!" so the quote shows over the bot's head
	Protect         *spec.Protect  `json:"protect"`               // equipped items auto-equip must never replace (default: unique, set, crafted, socketed/runeword, Khalim's Will)
	AutoEquip       *bool          `json:"autoEquip"`             // Automation tab: let bots equip better gear (default true; never touches the protected kinds)
	AutoStat        *bool          `json:"autoStat"`              // Automation tab: let bots spend their stat points (default true)
	WatchKills      *bool          `json:"watchKills"`            // bots report the bosses, uniques and champions they see die (default true; set false if it costs too much CPU)
	MercWear        *spec.MercWear `json:"mercWear"`              // Automation tab: extra slots the mercenary can wear in this game (default none, as in the base game)
	QuestClearAll   *bool          `json:"questClearAll"`         // Quests tab: clear every area a quest passes through (default true: slower, but levels the bots)
	AutoSkill       *bool          `json:"autoSkill"`             // Automation tab: let bots spend their skill points (default true)
	Wine            string         `json:"wine"`                  // wine binary; ignored on Windows
	WinVersion      string         `json:"winVersion"`            // Windows version for a new private Wine prefix (default win7)
	GameArgs        string         `json:"gameArgs"`              // extra Game.exe arguments (default "-direct -txt", as the QOL launcher uses)
	HostIP          string         `json:"hostIp"`                // address of the TCP/IP game to join (default localhost)
	Player          string         `json:"player"`                // character you are playing; bots follow this one ("" = auto-detect)
	NotPlaying      bool           `json:"notPlaying,omitempty"`  // true: you are not playing, the leader is a bot that hosts the game and the others join it
	SaveDir         string         `json:"saveDir"`               // character saves (default: <Game.exe dir>/Save)
	WinePrefix      string         `json:"winePrefix"`            // WINEPREFIX (default ~/.qolbot_wine_prefix, kept apart from other Wine apps)
	Web             string         `json:"web"`                   // web UI listen addr
	BridgeAddr      string         `json:"bridgeAddr"`            // TCP addr for d2bridge
	HeartbeatTO     int            `json:"heartbeatTimeoutSec"`
	Headless        *bool          `json:"headless"`  // no visible game windows (default true)
	AutoStart       []string       `json:"autoStart"` // profiles started by `run`
	Profiles        []Profile      `json:"profiles"`
}

type State struct {
	Profile
	Status       string    `json:"status"` // stopped|starting|running|stopping
	Pid          uint32    `json:"pid"`
	Zone         string    `json:"zone,omitempty"` // the area the bot is in (reported by its ToolsThread)
	ZoneAt       time.Time `json:"-"`
	Inv          string    `json:"-"` // what the bot carries, as the JSON its ToolsThread reports (shown when you click its card)
	InvAt        time.Time `json:"-"`
	Activity     string    `json:"activity,omitempty"`   // the last line the bot reported (not a clock tick or a warning)
	ActivityAt   time.Time `json:"activityAt,omitempty"` // when
	Doing        string    `json:"doing,omitempty"`      // the script a bot is running (from its own output)
	Hwnd         uint64    `json:"hwnd"`
	Runs         int       `json:"runs"`
	Chickens     int       `json:"chickens"`
	Deaths       int       `json:"deaths"`
	Heartbeat    time.Time `json:"heartbeat"`
	Tag          string    `json:"tag"`
	Wanted       bool      `json:"-"` // should be running; supervisor restarts on crash
	GameAt       time.Time `json:"-"` // last time the starter script reported a game in progress
	Restarts     int       `json:"restarts"`
	Char         *CharInfo `json:"char,omitempty"`        // from the .d2s save, if one exists
	SpecOptions  []string  `json:"specOptions,omitempty"` // builds available for this character's class
	Forced       string    `json:"forced"`                // build chosen by hand for this character ("" = automatic)
	SpecAuto     string    `json:"specAuto,omitempty"`    // what automatic detection picks, whether or not a build is chosen by hand
	Spec         string    `json:"spec,omitempty"`        // detected build, e.g. "Zeal" (see internal/spec)
	SpecWhy      string    `json:"specWhy,omitempty"`     // why
	joinWatching bool      // a watchJoin goroutine is pending for this bot
	rpcSeen      bool      // the starter script has called us at least once (so it has the handle)
	startedAt    time.Time // when the current Game.exe was launched
	fastFails    int       // consecutive launches that died within 30s
}

type Manager struct {
	plugyCommands bool // PlugY and its chat commands are on in the bots' PlugY.ini (needed for /save)
	shuttingDown  atomic.Bool
	cpu           cpuMeter
	wineOwned     bool // this process has claimed the Wine prefix (set once the bridge port is ours)
	mu            sync.Mutex
	cfg           Config
	cfgPath       string
	root          string // directory containing d2bs/
	states        map[string]*State
	expectTeam    []string // the followers the Start button started the leader for (the leader waits for them)
	bridge        net.Conn
	bridgeW       *json.Encoder
	hwnd          uint64
	logs          []LogLine
	pendingDesc   map[string]pendingDesc // an item log entry that arrived before its Activity entry, per bot
	events        []ActivityEvent        // newest items picked up, bosses killed and quests completed, for the Status tab
	logSubs       map[chan LogLine]bool
	xvfb          *exec.Cmd
	logFile       *os.File
	logBytes      int64 // bytes written to logFile since it was opened or rotated
}

func main() {
	cfgPath := flag.String("config", "qolbot.json", "config file")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, `usage: qolbot [-config file] <command>

  run [profile...]   run the manager + web UI in the foreground (default command).
                     Starts autoStart profiles or the ones named; with neither,
                     profiles are launched from the web UI. Ctrl-C stops everything
  start <profile>    ask a running manager to start a profile
  stop  <profile>    ask a running manager to stop a profile
  prefix [--rebuild] create (or rebuild) the app's own Wine prefix inside its folder, ready for Diablo II.
                     The bots always run in that prefix, never in the one your own games use
  spec [character]   show what the auto-spec detects for each character (read-only)
  status             show profile states
  logs               follow the manager console`)
	}
	flag.Parse()
	// A config still named d2bot.json (this program's old name) keeps working until it is renamed.
	if *cfgPath == "qolbot.json" {
		if _, err := os.Stat("qolbot.json"); err != nil {
			if _, err := os.Stat("d2bot.json"); err == nil {
				*cfgPath = "d2bot.json"
				fmt.Fprintln(os.Stderr, "note: using d2bot.json; rename it to qolbot.json")
			}
		}
	}
	args := flag.Args()
	if len(args) == 0 {
		args = []string{"run"} // default: manager + web UI
	}
	root, _ := os.Getwd()
	m := &Manager{cfgPath: *cfgPath, root: root, states: map[string]*State{}, logSubs: map[chan LogLine]bool{}}
	if err := m.loadConfig(); err != nil {
		log.Fatal(err)
	}
	switch args[0] {
	case "run":
		m.run(args[1:])
	case "start", "stop":
		if len(args) < 2 {
			flag.Usage()
			os.Exit(2)
		}
		m.cliPost(args[0], args[1])
	case "spec":
		m.cliSpec(args[1:])
	case "prefix":
		m.cliPrefix(args[1:])
	case "status":
		m.cliStatus()
	case "logs":
		m.cliLogs()
	default:
		flag.Usage()
		os.Exit(2)
	}
}

func (m *Manager) headless() bool { return m.cfg.Headless == nil || *m.cfg.Headless }

func (m *Manager) run(profiles []string) {
	m.openLog()
	if problems := m.preflight(); len(problems) > 0 {
		for _, p := range problems {
			m.logf(9, "", "PROBLEM: %s", p)
		}
		m.fatalf("%d problem(s) above. Fix them in qolbot.json or install what is missing, then start again.", len(problems))
	}
	m.checkGameFiles()
	m.noteOldPrefix()
	m.reportPlugyProblems()
	m.writeBotNames() // nobody is running yet, so everyone is a potential leader
	if err := m.writeD2BSIni(); err != nil {
		m.fatalf("writing d2bs.ini: %v", err)
	}
	ln, err := net.Listen("tcp", m.cfg.BridgeAddr)
	if err != nil {
		m.fatalf("cannot listen on bridge address %s: %v (is another Qolbot or a leftover d2bridge.exe still running?)", m.cfg.BridgeAddr, err)
	}
	m.wineOwned = true                                // the bridge port is ours, so no other qolbot is running: the prefix is ours to clean
	if n := m.stopWine() + m.killStaleXvfb(); n > 0 { // leftovers of an earlier run that was killed hard
		m.logf(0, "", "cleaned up %d leftover Wine/display process(es) from an earlier run", n)
	}
	go m.acceptBridge(ln)
	if err := m.spawnBridge(); err != nil {
		m.fatalf("cannot start d2bridge.exe: %v", err)
	}
	go m.watchdog()
	go m.memSampler()
	go m.cpuSampler()
	go m.followBotLogs()
	if m.cfg.Web != "" {
		go m.serveWeb()
	}
	m.logf(0, "", "Qolbot ready (headless=%v, web=%q)", m.headless(), m.cfg.Web)
	if m.cfg.Web != "" {
		log.Printf("web UI: http://%s", m.cfg.Web)
	}

	if len(profiles) == 0 {
		profiles = m.cfg.AutoStart
	}
	go func() {
		for i := 0; i < 1200 && m.hwndValue() == 0; i++ { // wait for the bridge (first Wine start creates a prefix)
			time.Sleep(100 * time.Millisecond)
		}
		for _, p := range profiles {
			if err := m.startProfile(p); err != nil {
				m.logf(9, p, "%v", err)
			}
		}
	}()

	// Ctrl-C, kill and closing the terminal all end up here. Everything this program started (games, the
	// bridge, wineserver, the hidden display) is stopped before it exits. A second Ctrl-C does it at once.
	sig := make(chan os.Signal, 2)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	<-sig
	m.shuttingDown.Store(true)
	m.logf(0, "", "shutting down (press Ctrl-C again to force)")
	done := make(chan struct{})
	go func() {
		m.saveAllAndWait(26 * time.Second) // while the bridge still works: ask every bot in a game to save
		m.mu.Lock()
		var names []string
		for n, s := range m.states {
			s.Wanted = false
			names = append(names, n)
		}
		m.mu.Unlock()
		for _, n := range names {
			m.sendBridge(wire.Msg{T: "kill", Profile: n})
		}
		time.Sleep(time.Second)
		m.stopWine()
		m.killHelpers()
		close(done)
	}()
	select {
	case <-done:
	case <-sig: // second signal: skip the polite part
		m.stopWine()
		m.killHelpers()
	case <-time.After(35 * time.Second): // longer than the 26 s the characters get to save
		m.logf(9, "", "shutdown is taking too long, forcing it")
		m.stopWine()
		m.killHelpers()
	}
	if n := len(prefixPids(m.absPrefix())); n > 0 {
		m.logf(9, "", "WARNING: %d Wine process(es) are still running in %s", n, m.absPrefix())
	} else {
		m.logf(0, "", "stopped; no Wine processes left")
	}
}

func (m *Manager) loadConfig() error {
	c := Config{Web: "127.0.0.1:8080", BridgeAddr: "127.0.0.1:8765", ScriptPath: "kolbot", Wine: "wine", HeartbeatTO: 180}
	b, err := os.ReadFile(m.cfgPath)
	switch {
	case os.IsNotExist(err):
		// No config file is fine: start with defaults and create it when something is saved from the web page.
		fmt.Fprintf(os.Stderr, "note: no %s yet; starting with defaults. Set the path to Game.exe on the web page's Settings tab.\n", m.cfgPath)
	case err != nil:
		return err
	default:
		if err := json.Unmarshal(b, &c); err != nil {
			return fmt.Errorf("%s: %w", m.cfgPath, err)
		}
	}
	if c.WinVersion == "" {
		c.WinVersion = "win7"
	}
	if c.GameArgs == "" {
		c.GameArgs = "-direct -txt" // load the mod's Data folder, or joining a modded host desyncs and crashes
	}
	if c.HostIP == "" {
		c.HostIP = "localhost"
	}
	if c.D2BSDll == "" {
		c.D2BSDll = filepath.Join(m.root, "d2bs", "D2BS.dll")
	}
	m.cfg = c
	for _, p := range c.Profiles {
		if p.Character == "" {
			p.Character = p.Name
		}
		m.states[p.Name] = &State{Profile: p, Status: "stopped"}
	}
	m.scanCharacters()
	return nil
}

// toWin converts a host path into the form Game.exe/d2bridge see. Under Wine
// the host filesystem is the Z: drive.
func toWin(p string) string {
	if runtime.GOOS == "windows" || p == "" {
		return p
	}
	if abs, err := filepath.Abs(p); err == nil {
		p = abs
	}
	return `Z:` + strings.ReplaceAll(p, "/", `\`)
}

func (m *Manager) spawnBridge() error {
	exe := filepath.Join(m.root, "d2bridge.exe")
	args := []string{"-addr", m.cfg.BridgeAddr}
	env := os.Environ()
	prefixPending := ""
	if os.Getenv("WINEDEBUG") == "" {
		env = append(env, "WINEDEBUG=fixme-all") // keep Wine's errors, drop its "fixme" noise
	}
	if runtime.GOOS != "windows" {
		prefix := m.prefixPath()
		// Always set WINEPREFIX explicitly. If we left it out, Wine would use whatever WINEPREFIX the parent
		// shell has (for many people that is the prefix their own games use), and the bots would share it.
		env = append(env, "WINEPREFIX="+prefix) // later entries win
		prefixPending = prefix
	}
	if m.headless() {
		if runtime.GOOS == "linux" {
			// Run Wine inside a virtual X display: the game renders normally
			// but no window ever appears on the user's desktop.
			display, err := m.startXvfb()
			if err != nil {
				// Not a silent fallback: showing the bots' windows on your desktop is not what "headless" promises.
				return fmt.Errorf("cannot start the hidden display: %v (install Xvfb, or set \"headless\": false to let the bot windows show on your desktop)", err)
			} else {
				env = append(env, "DISPLAY="+display, "WINEDLLOVERRIDES=winemenubuilder.exe=d")
			}
		} else {
			args = append(args, "-hidden") // start Game.exe minimized without activation
		}
	}
	if prefixPending != "" {
		if err := m.setupPrefix(prefixPending, env); err != nil {
			m.fatalf("cannot set up the Wine prefix %s:\n%v\nFix that and start again, or run ./qolbot prefix to retry by itself.", prefixPending, err)
		}
	}
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command(exe, args...)
	} else {
		cmd = exec.Command(m.cfg.Wine, append([]string{exe}, args...)...)
	}
	cmd.Env = env
	ownGroup(cmd) // so a terminal Ctrl-C reaches only this program, which then saves the characters
	wl := m.wineLog()
	cmd.Stdout, cmd.Stderr = io.MultiWriter(os.Stdout, wl), io.MultiWriter(os.Stderr, wl)
	m.dbgf("", "spawning bridge: %s (WINEPREFIX=%s DISPLAY=%s)", cmd.String(), envGet(env, "WINEPREFIX"), envGet(env, "DISPLAY"))
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() {
		err := cmd.Wait()
		if m.shuttingDown.Load() { // we stopped it on purpose; the shutdown code finishes and exits
			return
		}
		m.logf(9, "", "bridge process exited (%v); see logs/wine.log for Wine's output", err)
		if m.wineOwned {
			m.stopWine() // it died on its own: do not leave its Wine processes behind
		}
		m.killHelpers()
		os.Exit(1)
	}()
	return nil
}

func (m *Manager) startXvfb() (string, error) {
	if _, err := exec.LookPath("Xvfb"); err != nil {
		return "", fmt.Errorf("headless mode needs Xvfb (apt install xvfb) or set \"headless\": false")
	}
	// Best way: let Xvfb choose a free display itself (-displayfd). It copes with stale socket and lock files left
	// behind by earlier runs that were killed, which the old "skip any number whose socket exists" loop did not:
	// after about 50 such runs every number looked taken.
	if d, err := m.startXvfbAuto(); err == nil {
		return d, nil
	} else {
		m.dbgf("", "Xvfb -displayfd did not work (%v); trying numbered displays", err)
	}
	for n := 90; n < 140; n++ {
		lock := fmt.Sprintf("/tmp/.X%d-lock", n)
		if b, err := os.ReadFile(lock); err == nil { // in use only if that server is really alive
			if pid, err := strconv.Atoi(strings.TrimSpace(string(b))); err == nil && pid > 1 {
				if p, err := os.FindProcess(pid); err == nil && p.Signal(syscall.Signal(0)) == nil {
					continue
				}
			}
			os.Remove(lock)
			os.Remove(fmt.Sprintf("/tmp/.X11-unix/X%d", n))
		}
		d := fmt.Sprintf(":%d", n)
		cmd := exec.Command("Xvfb", d, "-screen", "0", "800x600x16", "-nolisten", "tcp")
		ownGroup(cmd)
		if err := cmd.Start(); err != nil {
			return "", err
		}
		for i := 0; i < 50; i++ { // wait for the socket
			if _, err := os.Stat(fmt.Sprintf("/tmp/.X11-unix/X%d", n)); err == nil {
				m.xvfb = cmd
				os.WriteFile(m.xvfbPidFile(), []byte(strconv.Itoa(cmd.Process.Pid)), 0o644)
				return d, nil
			}
			time.Sleep(100 * time.Millisecond)
		}
		cmd.Process.Kill()
	}
	return "", fmt.Errorf("no free X display number")
}

// startXvfbAuto starts Xvfb with -displayfd so the server picks the display number and reports it.
func (m *Manager) startXvfbAuto() (string, error) {
	r, w, err := os.Pipe()
	if err != nil {
		return "", err
	}
	defer r.Close()
	cmd := exec.Command("Xvfb", "-displayfd", "3", "-screen", "0", "800x600x16", "-nolisten", "tcp")
	cmd.ExtraFiles = []*os.File{w} // becomes file descriptor 3 in the child
	ownGroup(cmd)
	if err := cmd.Start(); err != nil {
		w.Close()
		return "", err
	}
	w.Close()
	type res struct {
		line string
		err  error
	}
	ch := make(chan res, 1)
	go func() { l, err := bufio.NewReader(r).ReadString('\n'); ch <- res{l, err} }()
	select {
	case got := <-ch:
		n := strings.TrimSpace(got.line)
		if got.err != nil || n == "" {
			cmd.Process.Kill()
			cmd.Wait()
			return "", fmt.Errorf("Xvfb did not report a display (%v)", got.err)
		}
		m.xvfb = cmd
		os.WriteFile(m.xvfbPidFile(), []byte(strconv.Itoa(cmd.Process.Pid)), 0o644)
		return ":" + n, nil
	case <-time.After(8 * time.Second):
		cmd.Process.Kill()
		cmd.Wait()
		return "", fmt.Errorf("Xvfb did not report a display within 8 seconds")
	}
}

func (m *Manager) killHelpers() {
	if m.xvfb != nil && m.xvfb.Process != nil {
		// Ask Xvfb to quit (SIGTERM) so it removes its own socket and lock file; SIGKILL leaves them behind, and enough
		// of those used to make every display number look taken. Kill it only if it ignores the request.
		m.xvfb.Process.Signal(syscall.SIGTERM)
		done := make(chan struct{})
		go func() { m.xvfb.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			m.xvfb.Process.Kill()
		}
		os.Remove(m.xvfbPidFile())
		m.xvfb = nil
	}
}

func (m *Manager) acceptBridge(ln net.Listener) {
	for {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		m.mu.Lock()
		m.bridge, m.bridgeW = c, json.NewEncoder(c)
		m.mu.Unlock()
		m.dbgf("", "bridge TCP connection from %s", c.RemoteAddr())
		go m.readBridge(c)
	}
}

func (m *Manager) sendBridge(msg wire.Msg) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.bridgeW == nil {
		m.dbgfLocked(msg.Profile, "dropped manager -> bridge %s: bridge not connected", msg.T)
		return
	}
	if err := m.bridgeW.Encode(msg); err != nil {
		m.dbgfLocked(msg.Profile, "write to bridge failed: %v", err)
	} else if msg.T != "send" || msg.Data != "pingrep" {
		m.dbgfLocked(msg.Profile, "manager -> bridge: %s", describe(msg))
	}
}

func (m *Manager) readBridge(c net.Conn) {
	sc := bufio.NewScanner(c)
	sc.Buffer(make([]byte, 1<<20), 1<<24)
	for sc.Scan() {
		var msg wire.Msg
		if json.Unmarshal(sc.Bytes(), &msg) != nil {
			m.dbgf("", "bridge sent unparseable line: %.200s", sc.Text())
			continue
		}
		if msg.T != "copydata" { // copydata is logged by the RPC handler
			m.dbgf(msg.Profile, "bridge -> manager: %s", describe(msg))
		}
		switch msg.T {
		case "hello":
			m.mu.Lock()
			m.hwnd = msg.Hwnd
			m.mu.Unlock()
			m.logf(0, "", "bridge connected (hwnd %d)", msg.Hwnd)
		case "copydata":
			m.handleCopyData(msg)
		case "started":
			m.update(msg.Profile, func(s *State) { s.Pid = msg.Pid; s.Status = "starting"; s.Heartbeat = time.Now() })
			m.logf(0, msg.Profile, "Game.exe started (pid %d)", msg.Pid)
		case "attached":
			m.update(msg.Profile, func(s *State) { s.Hwnd = msg.Hwnd; s.Status = "running"; s.Heartbeat = time.Now(); s.fastFails = 0 })
			m.logf(0, msg.Profile, "D2BS attached")
			// Tell the starter script which window to report to. The script may not have
			// registered its listener yet, so repeat until it answers with its first call.
			go func(name string, hwnd uint64) {
				for i := 0; i < 60; i++ {
					m.mu.Lock()
					s := m.states[name]
					done := s == nil || s.rpcSeen || s.Hwnd != hwnd
					m.mu.Unlock()
					if done {
						m.dbgf(name, "script answered after %d Handle message(s)", i)
						return
					}
					m.sendBridge(wire.Msg{T: "send", Profile: name, Hwnd: hwnd, Mode: uint32(m.hwndValue()), Data: "Handle"})
					time.Sleep(2 * time.Second)
				}
				m.logf(9, name, "the starter script never answered the Handle message (120s); D2BS may not be receiving messages")
			}(msg.Profile, msg.Hwnd)
		case "exited":
			m.onExit(msg)
		case "note":
			m.dbgf(msg.Profile, "bridge: %s", msg.Data)
		case "error":
			m.logf(9, msg.Profile, "bridge: %s", msg.Data)
		default:
			m.logf(9, msg.Profile, "unknown bridge message type %q", msg.T)
		}
	}
	m.logf(9, "", "bridge connection closed (%v)", sc.Err())
}

func (m *Manager) hwndValue() uint64 { m.mu.Lock(); defer m.mu.Unlock(); return m.hwnd }

func (m *Manager) update(name string, f func(*State)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s := m.states[name]; s != nil {
		f(s)
	}
}

func (m *Manager) onExit(msg wire.Msg) {
	var restart bool
	var quick bool
	m.update(msg.Profile, func(s *State) {
		s.Pid, s.Hwnd, s.Status, s.Doing, s.Activity, s.Zone = 0, 0, "stopped", "", "", ""
		restart = s.Wanted
		quick = s.Wanted && time.Since(s.startedAt) < 90*time.Second
		if quick {
			s.fastFails++
		} else {
			s.fastFails = 0
		}
		if restart && s.fastFails >= 3 {
			s.Wanted = false
			restart = false
		}
	})
	if t := m.startedAtOf(msg.Profile); t.IsZero() { // a profile that never ran (the bridge reports every stopped process at shutdown)
		return
	}
	m.logf(9, msg.Profile, "Game.exe exited (code 0x%X) after %s in-game/loading", msg.Code, time.Since(m.startedAtOf(msg.Profile)).Round(time.Second))
	m.logLastD2BS(msg.Profile, msg.Pid)
	if !restart && quick {
		m.logf(9, msg.Profile, "GIVING UP: Game.exe died within 90s of starting 3 times in a row. Check logs/wine.log and d2bs/d2bs.log, then press Start to try again.")
		m.addEvent(ActivityEvent{Time: time.Now(), Bot: msg.Profile, Kind: "problem", Name: "Gave up: the game died 3 times within 90 seconds of starting", Detail: "Press Start to try again"})
		m.writeBotNames()
	}
	if restart {
		m.logf(9, msg.Profile, "window unexpectedly exited... restarting profile")
		m.addEvent(ActivityEvent{Time: time.Now(), Bot: msg.Profile, Kind: "restart", Name: "Closed", Detail: fmt.Sprintf("restarting, exit code 0x%X", msg.Code)})
		go func() { time.Sleep(5 * time.Second); m.startProfile(msg.Profile) }()
	}
}

func (m *Manager) startProfile(name string) error {
	if why := m.gameProblem(); why != "" {
		return errors.New(why)
	}
	m.mu.Lock()
	s := m.states[name]
	if s == nil {
		m.mu.Unlock()
		return fmt.Errorf("unknown profile %q", name)
	}
	if s.Status == "running" || s.Status == "starting" {
		m.dbgfLocked(name, "start ignored: already %s", s.Status)
		m.mu.Unlock()
		return nil
	}
	if m.cfg.NotPlaying && m.cfg.Player == "" {
		m.mu.Unlock()
		return fmt.Errorf("you are not playing: choose which bot is going to be the leader first")
	}
	if !m.cfg.NotPlaying && m.cfg.Player != "" && s.Character == m.cfg.Player && s.Role != "host" {
		m.mu.Unlock()
		return fmt.Errorf("%s is the character you are playing as; pick someone else in \"Who is going to be leader?\" first", name)
	}
	if m.cfg.NotPlaying && s.Role == "" && s.Character != m.cfg.Player { // a follower has nothing to join until the leader hosts
		leaderUp := false
		for _, o := range m.states {
			if o.Character == m.cfg.Player && (o.Wanted || o.Status == "running" || o.Status == "starting") {
				leaderUp = true
			}
		}
		if !leaderUp {
			m.mu.Unlock()
			return fmt.Errorf("start the leader (%s) first: %s has no game to join until the leader hosts one", m.cfg.Player, name)
		}
	}
	if m.hwnd == 0 || m.bridgeW == nil {
		m.mu.Unlock()
		return fmt.Errorf("bridge not connected yet (is Wine up? see logs/wine.log)")
	}
	s.Status, s.Wanted, s.Heartbeat, s.startedAt, s.rpcSeen = "starting", true, time.Now(), time.Now(), false
	hw := m.hwnd
	m.mu.Unlock()
	m.writeBotNames()
	m.writeSpec(name, s.Character, s.Profile.Spec)

	exe := m.cfg.GameExe
	dir := m.cfg.GameDir
	if dir == "" {
		dir = filepath.Dir(exe)
	}
	// Same shape D2Bot.exe used: -w -handle N -cachefix -title NAME -profile NAME.
	// D2BS only reads a switch's value from inside double quotes (found by reading its
	// command-line parser), so every value must be quoted or it comes out empty.
	args := []string{"-w", "-handle", `"` + fmt.Sprint(hw) + `"`, "-cachefix", "-title", `"` + name + `"`, "-profile", `"` + name + `"`}
	args = append(args, strings.Fields(m.cfg.GameArgs)...)
	m.sendBridge(wire.Msg{T: "launch", Profile: name, Exe: toWin(exe), Dir: toWin(dir), Args: args, Dll: toWin(m.cfg.D2BSDll)})
	m.logf(0, name, "starting profile (character %s)", s.Character)
	m.dbgf(name, "launch: exe=%s dir=%s args=%v dll=%s", toWin(exe), toWin(dir), args, toWin(m.cfg.D2BSDll))
	return nil
}

func (m *Manager) stopProfile(name string) {
	m.update(name, func(s *State) {
		s.Wanted, s.Status = false, "stopping"
		if s.Character == m.cfg.Player { // the leader is going: the team it was waiting for no longer applies
			m.expectTeam = nil
		}
	})
	m.writeBotNames()
	m.logf(0, name, "stopping profile")
	go m.stopGracefully(name) // saves the character first when the bot is in a game, then kills it
}

// hostsLast splits bots into the ones that are not the leader and the leader itself. The leader hosts the game, so it has to be the last
// to leave: when the host leaves, every follower still in the game loses what it has not saved.
func (m *Manager) hostsLast(names []string) (others, hosts []string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, n := range names {
		if s := m.states[n]; s != nil && m.roleOf(s) == "host" {
			hosts = append(hosts, n)
		} else {
			others = append(others, n)
		}
	}
	return others, hosts
}

// waitStopped waits (up to timeout) until none of the bots is still running.
func (m *Manager) waitStopped(names []string, timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		m.mu.Lock()
		all := true
		for _, n := range names {
			if s := m.states[n]; s != nil && s.Status != "stopped" {
				all = false
			}
		}
		m.mu.Unlock()
		if all {
			return
		}
		time.Sleep(300 * time.Millisecond)
	}
}

// stopBlocked refuses a stop that would take the leader out of a game other bots are still in (the followers would lose what they have not
// saved). Stop all, or stopping the others first, is fine. It returns the sentence the page shows.
func (m *Manager) stopBlocked(names []string) error {
	_, hosts := m.hostsLast(names)
	if len(hosts) == 0 {
		return nil
	}
	in := map[string]bool{}
	for _, n := range names {
		in[n] = true
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	var still []string
	for n, s := range m.states {
		if !in[n] && m.roleOf(s) != "host" && (s.Status == "running" || s.Status == "starting" || s.Status == "stopping") {
			still = append(still, n)
		}
	}
	if len(still) == 0 {
		return nil
	}
	sort.Strings(still)
	return fmt.Errorf("The leader (%s) hosts the game, so it has to leave last. Still in the game: %s.\n\nStop those bots first, or use Stop all bots (it stops the leader last).", hosts[0], strings.Join(still, ", "))
}

// stopMany stops bots with the leader last: the others are saved and gone first, then the leader goes.
func (m *Manager) stopMany(names []string) {
	others, hosts := m.hostsLast(names)
	for _, n := range others {
		m.stopProfile(n)
	}
	if len(hosts) == 0 {
		return
	}
	for _, n := range hosts {
		m.update(n, func(s *State) { s.Wanted = false }) // no restart while it waits for the others
	}
	go func() {
		m.waitStopped(others, 90*time.Second)
		for _, n := range hosts {
			m.stopProfile(n)
		}
	}()
}

// watchdog restarts profiles whose D2BS stopped sending heartbeats.
func (m *Manager) watchdog() {
	warned := map[string]int64{}
	for range time.Tick(10 * time.Second) {
		var stale, stuck []string
		m.mu.Lock()
		for n, s := range m.states {
			if s.Status == "starting" && time.Since(s.Heartbeat) > 90*time.Second && warned[n] != s.Heartbeat.UnixNano() {
				warned[n] = s.Heartbeat.UnixNano()
				stuck = append(stuck, fmt.Sprintf("%s (pid %d)", n, s.Pid))
			}
			if s.Wanted && s.Status == "running" && time.Since(s.Heartbeat) > time.Duration(m.cfg.HeartbeatTO)*time.Second {
				stale = append(stale, n)
			}
		}
		m.mu.Unlock()
		for _, n := range stuck {
			m.logf(9, "", "%s has been 'starting' for 90s and D2BS has not attached: the game may be stuck, or injection failed (see logs/wine.log and d2bs/d2bs.log)", n)
		}
		for _, n := range stale {
			m.logf(9, n, "D2BS is not responding... restarting profile")
			m.addEvent(ActivityEvent{Time: time.Now(), Bot: n, Kind: "restart", Name: "Not Responding", Detail: "restarting"})
			m.update(n, func(s *State) { s.Restarts++; s.Heartbeat = time.Now() })
			m.sendBridge(wire.Msg{T: "kill", Profile: n}) // onExit restarts (Wanted stays true)
		}
	}
}

// setupPrefix prepares a private Wine prefix the first time it is used. What the game
// needs (found by trial; same idea as the winetricks + `winecfg -v win7` rebuild script):
//  1. let Wine build the prefix itself (wineboot),
//  2. add the runner's vkd3d libraries if it ships them (Proton/GE-Proton builds do, and
//     their wined3d will not load without them, which crashes the game's graphics layer),
//  3. set the Windows version to win7 (the default newer one crashes the game).
func (m *Manager) setupPrefix(prefix string, env []string) error {
	// Only ever touch a prefix this tool owns (~/.qolbot_wine_prefix or inside its own folder). A prefix you pointed
	// "winePrefix" at (e.g. the one your own games use) is used as it is, never modified.
	if !m.ownsPrefix(prefix) {
		m.dbgf("", "using Wine prefix %s as is (not managed by Qolbot)", prefix)
		return nil
	}
	marker := filepath.Join(prefix, ".d2botd-ready")
	if _, err := os.Stat(marker); err == nil {
		return nil
	}
	run := func(what string, timeout time.Duration, args ...string) error {
		cmd := exec.Command(m.cfg.Wine, args...)
		cmd.Env = append(append([]string{}, env...), "WINEDEBUG=-all")
		out := &strings.Builder{}
		cmd.Stdout, cmd.Stderr = out, out
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("%s: cannot run %q: %v (is Wine installed? e.g. sudo apt install wine, or set \"wine\" in qolbot.json)", what, m.cfg.Wine, err)
		}
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		select {
		case err := <-done:
			m.dbgf("", "prefix setup: %s: %v %s", what, err, strings.TrimSpace(out.String()))
			if err != nil {
				tail := strings.TrimSpace(out.String())
				if len(tail) > 400 {
					tail = tail[len(tail)-400:]
				}
				return fmt.Errorf("%s failed: %v\n%s", what, err, tail)
			}
			return nil
		case <-time.After(timeout):
			cmd.Process.Kill()
			return fmt.Errorf("%s timed out after %s", what, timeout)
		}
	}
	m.logf(0, "", "setting up Wine prefix %s (first run only, about a minute)", prefix)
	if err := run("wineboot", 180*time.Second, "wineboot", "-i"); err != nil {
		return err
	}
	if w, err := exec.LookPath(m.cfg.Wine); err == nil {
		if r, err := filepath.EvalSymlinks(w); err == nil {
			w = r
		}
		vk := filepath.Join(filepath.Dir(w), "..", "lib", "vkd3d")
		for src, dst := range map[string]string{"x86_64-windows": "system32", "i386-windows": "syswow64"} {
			files, _ := filepath.Glob(filepath.Join(vk, src, "*.dll"))
			for _, f := range files {
				if b, err := os.ReadFile(f); err == nil {
					os.WriteFile(filepath.Join(prefix, "drive_c", "windows", dst, filepath.Base(f)), b, 0o644)
				}
			}
			if len(files) > 0 {
				m.dbgf("", "prefix setup: copied %d vkd3d libraries into %s", len(files), dst)
			}
		}
	}
	if err := run("setting the Windows version", 120*time.Second, "reg", "add", `HKCU\Software\Wine`, "/v", "Version", "/t", "REG_SZ", "/d", m.cfg.WinVersion, "/f"); err != nil {
		return err
	}
	run("wineserver shutdown", 30*time.Second, "wineboot", "-s") // best effort
	if err := os.WriteFile(marker, []byte(time.Now().Format(time.RFC3339)+"\n"), 0o644); err != nil {
		return fmt.Errorf("cannot write %s: %v", marker, err)
	}
	m.logf(0, "", "Wine prefix ready (Windows %s)", m.cfg.WinVersion)
	return nil
}

func (m *Manager) startedAtOf(name string) time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s := m.states[name]; s != nil {
		return s.startedAt
	}
	return time.Now()
}

// headlessValue is the effective headless setting (default true).
func (m *Manager) headlessValue() bool { return m.headless() }
