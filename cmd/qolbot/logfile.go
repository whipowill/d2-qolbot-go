package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"d2qolbot/internal/wire"
)

const maxLogSize = 5 << 20 // a log file is rotated to .1 at this size (at start, and while qolbot runs)

const keepOldLogsFor = 7 * 24 * time.Hour

// openLog opens logs/qolbot.log (rotating it to .1 when it passes 5 MB).
func (m *Manager) openLog() {
	dir := filepath.Join(m.root, "logs")
	os.MkdirAll(dir, 0o755)
	path := filepath.Join(dir, "qolbot.log")
	if fi, err := os.Stat(path); err == nil && fi.Size() > maxLogSize {
		os.Rename(path, path+".1")
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o660)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot open log file:", err)
		return
	}
	m.mu.Lock()
	m.logFile = f
	m.mu.Unlock()
	m.logf(0, "", "---- Qolbot starting (log: %s) ----", path)
	m.recycleLogs()
}

// recycleLogs keeps the logs from growing forever: stray old qolbot*.log copies go after a week, and the game's own
// console log (d2bs/d2bs.log, written by D2BS) is rotated to .1 when it is large.
func (m *Manager) recycleLogs() {
	dir := filepath.Join(m.root, "logs")
	old, _ := filepath.Glob(filepath.Join(dir, "qolbot.*"))
	for _, f := range old {
		if fi, err := os.Stat(f); err == nil && time.Since(fi.ModTime()) > keepOldLogsFor {
			os.Remove(f)
		}
	}
	d2 := filepath.Join(m.root, "d2bs", "d2bs.log")
	if fi, err := os.Stat(d2); err == nil && fi.Size() > maxLogSize {
		os.Rename(d2, d2+".1")
	}
}

// clearLogs empties every log file qolbot writes (the web page's Clear logs button). Open files are truncated in
// place, so the running bots and the bridge keep writing to them. The loot history (ItemLog.txt) is left alone.
func (m *Manager) clearLogs() int {
	dir := filepath.Join(m.root, "logs")
	n := 0
	for _, pat := range []string{"qolbot.*.log", "qolbot.log.1", "wine.log.1", "bot-*.log", "bot-*.log.1", filepath.Join("..", "d2bs", "d2bs.log.1")} {
		files, _ := filepath.Glob(filepath.Join(dir, pat))
		for _, f := range files {
			if os.Remove(f) == nil {
				n++
			}
		}
	}
	for _, f := range []string{filepath.Join(dir, "qolbot.log"), filepath.Join(dir, "wine.log"), filepath.Join(m.root, "d2bs", "d2bs.log")} {
		if os.Truncate(f, 0) == nil {
			n++
		}
	}
	m.mu.Lock()
	m.logs = nil
	m.logBytes = 0
	m.mu.Unlock()
	m.logf(0, "", "logs cleared (%d file(s))", n)
	return n
}

// wineLog is where everything Wine and the bridge print goes (also shown on the terminal).
func (m *Manager) wineLog() *os.File {
	path := filepath.Join(m.root, "logs", "wine.log")
	if fi, err := os.Stat(path); err == nil && fi.Size() > maxLogSize {
		os.Rename(path, path+".1")
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o660)
	if err != nil {
		return os.Stderr
	}
	fmt.Fprintf(f, "\n==== %s Qolbot started the bridge ====\n", time.Now().Format(time.RFC3339))
	return f
}

// writeLogLocked appends one line to the log file. Caller holds m.mu.
func (m *Manager) writeLogLocked(l LogLine, level string) {
	if m.logFile == nil {
		return
	}
	if level == "" {
		level = "INFO"
		if l.Color == 9 || l.Color == 1 {
			level = "WARN"
		}
	}
	who := ""
	if l.Profile != "" {
		who = "[" + l.Profile + "] "
	}
	n, _ := fmt.Fprintf(m.logFile, "%s %-5s %s%s\n", l.Time.Format("2006-01-02 15:04:05.000"), level, who, l.Msg)
	m.logBytes += int64(n)
	if m.logBytes > maxLogSize*2 { // a long session: start a fresh file, keep the previous one as .1
		path := m.logFile.Name()
		m.logFile.Close()
		os.Rename(path, path+".1")
		if f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o660); err == nil {
			m.logFile = f
		} else {
			m.logFile = nil
		}
		m.logBytes = 0
	}
}

func envGet(env []string, key string) string {
	v := ""
	for _, e := range env { // later entries win, like exec does
		if strings.HasPrefix(e, key+"=") {
			v = e[len(key)+1:]
		}
	}
	return v
}

// describe renders a wire message for the log without dumping huge payloads.
func describe(m wire.Msg) string {
	var b strings.Builder
	b.WriteString(m.T)
	add := func(k, v string) {
		if v != "" {
			fmt.Fprintf(&b, " %s=%.200s", k, v)
		}
	}
	add("exe", m.Exe)
	add("dir", m.Dir)
	add("dll", m.Dll)
	if len(m.Args) > 0 {
		add("args", strings.Join(m.Args, " "))
	}
	if m.Hwnd != 0 {
		fmt.Fprintf(&b, " hwnd=%d", m.Hwnd)
	}
	if m.Pid != 0 {
		fmt.Fprintf(&b, " pid=%d", m.Pid)
	}
	if m.T == "exited" {
		fmt.Fprintf(&b, " code=%d", m.Code)
	}
	if m.T == "send" {
		fmt.Fprintf(&b, " mode=%d", m.Mode)
	}
	add("data", m.Data)
	return b.String()
}

// preflight logs the effective configuration and warns about anything missing,
// so the first lines of a log explain most "it won't start" problems.
func (m *Manager) preflight() (problems []string) {
	c := m.cfg
	need := func(what, path, hint string) {
		if path == "" {
			problems = append(problems, fmt.Sprintf("%s is not set. %s", what, hint))
		} else if _, err := os.Stat(path); err != nil {
			problems = append(problems, fmt.Sprintf("%s not found: %s. %s", what, path, hint))
		} else {
			m.dbgf("", "ok %s: %s", what, path)
		}
	}
	m.logf(0, "", "platform %s/%s, config %s", runtime.GOOS, runtime.GOARCH, m.cfgPath)
	m.logf(0, "", "gameExe=%s", c.GameExe)
	m.logf(0, "", "saveDir=%s wine=%s winePrefix=%q bridge=%s web=%q headless=%v profiles=%d",
		m.saveDir(), c.Wine, c.WinePrefix, c.BridgeAddr, c.Web, m.headless(), len(c.Profiles))
	if why := m.gameProblem(); why != "" { // not fatal: the web page still opens so the path can be set there
		m.logf(9, "", "NOTE: %s Bots will not start until then.", why)
	}
	need("D2BS.dll", c.D2BSDll, "It ships in this folder under d2bs/; check \"d2bsDll\" in qolbot.json.")
	need("d2bridge.exe", filepath.Join(m.root, "d2bridge.exe"), "Run ./build.sh (needs Go) or restore it from the download.")
	need("kolbot script folder", filepath.Join(m.root, "d2bs", c.ScriptPath), `Check "scriptPath" in qolbot.json.`)
	if runtime.GOOS != "windows" {
		if path, err := exec.LookPath(c.Wine); err != nil {
			problems = append(problems, fmt.Sprintf("Wine not found (%q). %s Or set \"wine\" in qolbot.json to its full path.", c.Wine, wineInstallHint(runtime.GOOS)))
		} else if out, err := exec.Command(path, "--version").Output(); err != nil {
			problems = append(problems, fmt.Sprintf("%q does not run (%v). Reinstall Wine or set \"wine\" in qolbot.json.", path, err))
		} else {
			m.logf(0, "", "wine: %s (%s)", strings.TrimSpace(string(out)), path)
		}
		if runtime.GOOS == "linux" && m.headless() {
			if _, err := exec.LookPath("Xvfb"); err != nil {
				problems = append(problems, xvfbMissing)
			}
		}
	}
	m.logf(0, "", "game output: d2bs/d2bs.log (D2BS console), d2bs/kolbot/logs, logs/wine.log (Wine)")
	return problems
}

// fatalf logs to the log file as well as the terminal, then exits.
func (m *Manager) fatalf(f string, a ...any) {
	m.logf(9, "", "FATAL: "+f, a...)
	if m.wineOwned { // never when the failure is "another qolbot is already running"
		m.stopWine() // do not leave Wine processes behind when giving up
	}
	m.killHelpers()
	os.Exit(1)
}

// logLastD2BS copies the last few lines D2BS wrote for a game process (d2bs/d2bs.log)
// into the manager log, so a crash or drop is explained next to the exit message.
func (m *Manager) logLastD2BS(profile string, pid uint32) {
	b, err := os.ReadFile(filepath.Join(m.root, "d2bs", "d2bs.log"))
	if err != nil || pid == 0 {
		return
	}
	text := strings.ReplaceAll(string(b), "\x00", "")
	tag := fmt.Sprintf("D2BS %d: ", pid)
	var lines []string
	for _, l := range strings.Split(text, "\n") {
		if i := strings.Index(l, tag); i >= 0 {
			l = strings.TrimSpace(l[:i][strings.IndexByte(l[:i]+"[", '[')+0:] + l[i+len(tag):])
			lines = append(lines, stripColors(l))
		}
	}
	if len(lines) > 8 {
		lines = lines[len(lines)-8:]
	}
	for _, l := range lines {
		m.logf(9, profile, "last D2BS output: %s", l)
	}
}

// stripColors removes Diablo II color codes (the \xff 'c' + digit pairs D2BS prints).
func stripColors(s string) string {
	var b strings.Builder
	r := []rune(s)
	for i := 0; i < len(r); i++ {
		if (r[i] == 0xFFFD || r[i] == 0xFF || r[i] == 'ÿ') && i+2 < len(r) && r[i+1] == 'c' {
			i += 2
			continue
		}
		b.WriteRune(r[i])
	}
	return b.String()
}

// memSampler logs each running game's memory use every 2 minutes (Linux). A game that leaks or
// balloons before a crash shows up as a rising VmRSS next to the exit message.
func (m *Manager) memSampler() {
	if runtime.GOOS != "linux" {
		return
	}
	for range time.Tick(2 * time.Minute) {
		m.mu.Lock()
		var names []string
		for n, s := range m.states {
			if s.Status == "running" || s.Status == "starting" {
				names = append(names, n)
			}
		}
		m.mu.Unlock()
		for _, n := range names {
			if rss, peak, ok := gameMemory(n); ok {
				m.dbgf(n, "memory: %d MB resident (peak %d MB)", rss/1024, peak/1024)
			}
		}
	}
}

// gameMemory finds the Game.exe process started with -profile <name> and returns its
// VmRSS and VmHWM in kB.
func gameMemory(profile string) (rss, peak int, ok bool) {
	dirs, _ := filepath.Glob("/proc/[0-9]*")
	for _, d := range dirs {
		cl, err := os.ReadFile(filepath.Join(d, "cmdline"))
		if err != nil {
			continue
		}
		args := strings.Split(string(cl), "\x00")
		found := false
		for i, a := range args {
			if a == "-profile" && i+1 < len(args) && strings.Trim(args[i+1], `"`) == profile {
				found = true
			}
		}
		if !found {
			continue
		}
		st, err := os.ReadFile(filepath.Join(d, "status"))
		if err != nil {
			continue
		}
		for _, l := range strings.Split(string(st), "\n") {
			var v int
			if strings.HasPrefix(l, "VmRSS:") {
				fmt.Sscanf(strings.TrimPrefix(l, "VmRSS:"), "%d", &v)
				rss = v
			} else if strings.HasPrefix(l, "VmHWM:") {
				fmt.Sscanf(strings.TrimPrefix(l, "VmHWM:"), "%d", &v)
				peak = v
			}
		}
		return rss, peak, rss > 0
	}
	return 0, 0, false
}

// wineInstallHint says how to get Wine on this system.
func wineInstallHint(goos string) string {
	if goos == "darwin" {
		return "Install it with Homebrew: brew tap gcenx/wine && brew install --cask wine-stable (the README has the full macOS steps)."
	}
	return "Install it with your package manager (Debian/Ubuntu: sudo apt install wine; Fedora: sudo dnf install wine; Arch: sudo pacman -S wine)."
}

const xvfbMissing = `Xvfb not found. Install it so the bots run on a hidden display (Debian/Ubuntu: sudo apt install xvfb; Fedora: sudo dnf install xorg-x11-server-Xvfb; Arch: sudo pacman -S xorg-server-xvfb), or set "headless": false to let their windows show on your desktop.`
