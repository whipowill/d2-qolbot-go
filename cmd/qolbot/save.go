package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"d2qolbot/internal/wire"
)

// A Diablo II character is only written to disk when the game saves it. Killing a game process saves nothing, and
// tests showed that leaving a TCP/IP game with quit() does not save it either. The one thing that does is PlugY's
// /save chat command, so that is what bots use, both on a timer and (here) right before they are stopped.
// It needs ActiveCommands=1 in PlugY.ini; with that off, /save does nothing at all.

var (
	rePlugyOn       = regexp.MustCompile(`(?m)^ActivePlugin=1`)
	rePlugyCommands = regexp.MustCompile(`(?m)^ActiveCommands=1`)
)

// saveAcks lets stopProfile wait for the script's "saved" call.
var (
	saveAckMu sync.Mutex
	saveAcks  = map[string]chan struct{}{}
)

// detectPlugyCommands records whether the bots' PlugY.ini has PlugY and its chat commands switched on.
func (m *Manager) detectPlugyCommands() {
	ini := ""
	for _, dir := range []string{filepath.Dir(m.cfg.GameExe)} {
		if dir == "" || dir == "." {
			continue
		}
		if b, err := os.ReadFile(filepath.Join(dir, "PlugY.ini")); err == nil {
			ini = string(b)
			break
		}
	}
	ok := rePlugyOn.MatchString(ini) && rePlugyCommands.MatchString(ini)
	m.mu.Lock()
	m.plugyCommands = ok
	m.mu.Unlock()
	if ok {
		m.logf(0, "", "saving: PlugY commands are on, so bots can save with /save")
	} else {
		m.logf(9, "", "saving: PlugY's commands are OFF (or there is no PlugY.ini): bots cannot save and lose their progress when stopped. Set ActiveCommands=1 in PlugY.ini.")
	}
}

// saveSettings returns whether to save before stopping and how often to save while running (minutes, 0 = never).
func (m *Manager) saveSettings() (onStop bool, everyMin int, available bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	onStop = m.cfg.SaveOnStop == nil || *m.cfg.SaveOnStop
	everyMin = 5
	if m.cfg.AutoSaveMinutes != nil {
		everyMin = *m.cfg.AutoSaveMinutes
	}
	return onStop, everyMin, m.plugyCommands
}

// inGame reports whether the profile's starter script has reported a running game in the last few seconds.
func (m *Manager) inGame(name string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.states[name]
	return s != nil && time.Since(s.GameAt) < 8*time.Second
}

// markSaved is called when a script reports that it has saved.
func (m *Manager) markSaved(name string) {
	saveAckMu.Lock()
	ch := saveAcks[name]
	saveAckMu.Unlock()
	if ch != nil {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// prepExitWait is how long to wait for the script to close its panels before pressing Escape (a variable so tests can shorten it).
var prepExitWait = 4 * time.Second

// request sends a message to a bot's script and waits (up to timeout) for the script's "saved" answer.
func (m *Manager) request(name, data string, timeout time.Duration) bool {
	ch := make(chan struct{}, 1)
	saveAckMu.Lock()
	saveAcks[name] = ch
	saveAckMu.Unlock()
	defer func() {
		saveAckMu.Lock()
		delete(saveAcks, name)
		saveAckMu.Unlock()
	}()
	m.sendBridge(wire.Msg{T: "send", Profile: name, Mode: 0, Data: data})
	select {
	case <-ch:
		return true
	case <-time.After(timeout):
		return false
	}
}

// botSaveDir is where the bots' characters are written: the Save folder of your game.
func (m *Manager) botSaveDir() string {
	return m.saveDir()
}

// saveStamp identifies the current state of a character file, so a save can be recognised by the file changing.
func (m *Manager) saveStamp(character string) (time.Time, int64, bool) {
	st, err := os.Stat(filepath.Join(m.botSaveDir(), character+".d2s"))
	if err != nil {
		return time.Time{}, 0, false
	}
	return st.ModTime(), st.Size(), true
}

// saveAndExit leaves the game the way a player does, which saves the character without any help from PlugY: the
// script closes any open panels, then the bridge presses Escape and clicks "Save and Exit Game". The proof that it
// worked is the character file changing. (Tested: quit() and quitGame() from a script do NOT save; this does.)
func (m *Manager) saveAndExit(name string, timeout time.Duration) bool {
	m.mu.Lock()
	char := name
	if s := m.states[name]; s != nil && s.Character != "" {
		char = s.Character
	}
	m.mu.Unlock()
	t0, s0, ok := m.saveStamp(char)
	if !ok {
		m.dbgf(name, "cannot see %s.d2s, so a Save and Exit could not be confirmed", char)
		return false
	}
	m.request(name, "prepexit", prepExitWait) // closes panels; a missing answer only means we try anyway
	m.sendBridge(wire.Msg{T: "input", Profile: name, Data: "savequit"})
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(300 * time.Millisecond)
		if t, sz, ok := m.saveStamp(char); ok && (!t.Equal(t0) || sz != s0) {
			return true
		}
	}
	return false
}

// saveAndWait saves the character of a bot that is in a game, so that stopping it loses nothing. It first does what a
// player does (Save and Exit, no PlugY needed) and, only if the file does not change, tries PlugY's /save. It returns
// true when a save was confirmed. It does nothing for a bot that is not in a game, or when saving on stop is off.
func (m *Manager) saveAndWait(name string, timeout time.Duration) bool {
	onStop, _, plugy := m.saveSettings()
	if !onStop || !m.inGame(name) {
		return false
	}
	m.logf(0, name, "saving the character before stopping (Save and Exit)")
	if m.saveAndExit(name, 12*time.Second) {
		m.logf(0, name, "saved")
		return true
	}
	if plugy {
		m.logf(9, name, "Save and Exit did not write the character; trying PlugY's /save")
		if m.request(name, "save", 8*time.Second) {
			m.logf(0, name, "saved (PlugY /save)")
			return true
		}
	}
	m.logf(9, name, "could not confirm a save; stopping it anyway (its progress since the last save is lost)")
	return false
}

// saveAllAndWait does saveAndWait for every bot that is in a game: the followers in parallel first, then the leader (it has to leave last).
func (m *Manager) saveAllAndWait(timeout time.Duration) {
	m.mu.Lock()
	var names []string
	for n, s := range m.states {
		if s.Status == "running" || s.Status == "starting" {
			names = append(names, n)
		}
	}
	m.mu.Unlock()
	others, hosts := m.hostsLast(names)
	for _, group := range [][]string{others, hosts} { // the leader saves and leaves last
		var wg sync.WaitGroup
		for _, n := range group {
			wg.Add(1)
			go func(n string) { defer wg.Done(); m.saveAndWait(n, timeout) }(n)
		}
		done := make(chan struct{})
		go func() { wg.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(timeout + 2*time.Second):
		}
	}
}

// stopGracefully saves (when it can) and then kills the game. It is what the Stop button uses.
func (m *Manager) stopGracefully(name string) {
	m.saveAndWait(name, 26*time.Second)
	m.sendBridge(wire.Msg{T: "kill", Profile: name})
}

func describeSaving(onStop bool, every int, available bool) string {
	if !available {
		return "unavailable: PlugY's commands are off"
	}
	return fmt.Sprintf("on stop: %v, every %d min", onStop, every)
}

var _ = strings.TrimSpace

// saveSettingsLocked is saveSettings for callers that already hold m.mu.
func (m *Manager) saveSettingsLocked() (onStop bool, everyMin int, available bool) {
	onStop = m.cfg.SaveOnStop == nil || *m.cfg.SaveOnStop
	everyMin = 5
	if m.cfg.AutoSaveMinutes != nil {
		everyMin = *m.cfg.AutoSaveMinutes
	}
	return onStop, everyMin, m.plugyCommands
}

// usesPlugy is the "my game uses PlugY" setting (default true).
func (m *Manager) usesPlugy() bool { return m.cfg.Plugy == nil || *m.cfg.Plugy }

// plugyReport describes what is known about PlugY: what the user said, and what the bots' PlugY.ini says.
type plugyReport struct {
	Says      bool `json:"says"`      // the setting
	Installed bool `json:"installed"` // PlugY.dll / PlugY.ini found next to the game
	Commands  bool `json:"commands"`  // ActivePlugin=1 and ActiveCommands=1 (needed for /save and /insertpage)
}

func (m *Manager) plugyReportLocked() plugyReport {
	installed := false
	for _, dir := range []string{filepath.Dir(m.cfg.GameExe)} {
		if dir == "" || dir == "." {
			continue
		}
		if _, err := os.Stat(filepath.Join(dir, "PlugY.dll")); err == nil {
			installed = true
			break
		}
	}
	return plugyReport{Says: m.usesPlugy(), Installed: installed, Commands: m.plugyCommands}
}

// plugyProblems lists settings that need PlugY but PlugY is not available. They are errors, not silent no-ops.
func (m *Manager) plugyProblems(autoSave int, addPages bool) []string {
	var out []string
	if !m.usesPlugy() {
		if autoSave > 0 {
			out = append(out, fmt.Sprintf("saving every %d minutes needs PlugY (its /save command), but \"My game uses PlugY\" is off", autoSave))
		}
		if addPages {
			out = append(out, "adding a stash page when the stash is full needs PlugY (its /insertpage command), but \"My game uses PlugY\" is off")
		}
		return out
	}
	if !m.plugyCommands {
		if autoSave > 0 {
			out = append(out, fmt.Sprintf("saving every %d minutes needs PlugY's commands, but PlugY.ini has ActiveCommands=0 (or no PlugY.ini was found)", autoSave))
		}
		if addPages {
			out = append(out, "adding a stash page when the stash is full needs PlugY's commands, but PlugY.ini has ActiveCommands=0 (or no PlugY.ini was found)")
		}
	}
	return out
}

// reportPlugyProblems logs, as errors, every saved setting that needs PlugY when PlugY is not available.
func (m *Manager) reportPlugyProblems() {
	m.mu.Lock()
	_, every, _ := m.saveSettingsLocked()
	pages := m.storageLocked().AddStashPages
	problems := m.plugyProblems(every, pages)
	m.mu.Unlock()
	for _, p := range problems {
		m.logf(1, "", "SETTING CANNOT WORK: %s. Bots will not do it (and stop with an error if they need to).", p)
	}
}
