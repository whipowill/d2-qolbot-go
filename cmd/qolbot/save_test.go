package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeIni(t *testing.T, dir, body string) {
	if err := os.WriteFile(filepath.Join(dir, "PlugY.ini"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// /save only works when PlugY and its commands are on; the settings page warns when they are not.
func TestDetectPlugyCommands(t *testing.T) {
	dir := t.TempDir()
	m := &Manager{root: dir, cfg: Config{GameExe: filepath.Join(dir, "Game.exe")}, logSubs: map[chan LogLine]bool{}}
	cases := []struct {
		name, ini string
		want      bool
	}{
		{"both on", "[GENERAL]\r\nActivePlugin=1\r\nActiveCommands=1\r\n", true},
		{"commands off", "[GENERAL]\r\nActivePlugin=1\r\nActiveCommands=0\r\n", false},
		{"plugin off", "[GENERAL]\r\nActivePlugin=0\r\nActiveCommands=1\r\n", false},
		{"empty", "", false},
	}
	for _, c := range cases {
		writeIni(t, dir, c.ini)
		m.detectPlugyCommands()
		if m.plugyCommands != c.want {
			t.Errorf("%s: plugyCommands=%v, want %v", c.name, m.plugyCommands, c.want)
		}
	}
	os.Remove(filepath.Join(dir, "PlugY.ini"))
	m.detectPlugyCommands()
	if m.plugyCommands {
		t.Error("no PlugY.ini must mean saving is unavailable")
	}
}

func TestSaveSettingsDefaults(t *testing.T) {
	m := &Manager{plugyCommands: true}
	onStop, every, avail := m.saveSettings()
	if !onStop || every != 5 || !avail {
		t.Errorf("defaults: onStop=%v every=%d avail=%v", onStop, every, avail)
	}
	off, zero := false, 0
	m.cfg.SaveOnStop, m.cfg.AutoSaveMinutes = &off, &zero
	if onStop, every, _ := m.saveSettings(); onStop || every != 0 {
		t.Errorf("explicit off must survive: onStop=%v every=%d", onStop, every)
	}
}

// A bot that is not in a game must be stopped at once (nothing to wait for), whatever PlugY says.
func TestSaveAndWaitSkipsABotThatIsNotInAGame(t *testing.T) {
	m := &Manager{states: map[string]*State{"A": {Status: "running"}}, logSubs: map[chan LogLine]bool{}}
	if m.saveAndWait("A", 0) {
		t.Error("a bot that is not in a game has nothing to save")
	}
	m.plugyCommands = true
	if m.saveAndWait("A", 0) {
		t.Error("a bot that is not in a game has nothing to save, with PlugY too")
	}
}

// saveAndExit proves a save by the character file changing.
func TestSaveAndExitRecognisesTheFileChanging(t *testing.T) {
	prepExitWait = 20 * time.Millisecond
	defer func() { prepExitWait = 4 * time.Second }()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "Save"), 0o755)
	file := filepath.Join(dir, "Save", "Tester.d2s")
	os.WriteFile(file, []byte("before"), 0o644)
	m := &Manager{cfg: Config{GameExe: filepath.Join(dir, "Game.exe")}, states: map[string]*State{"Tester": {Profile: Profile{Name: "Tester", Character: "Tester"}, Status: "running"}}, logSubs: map[chan LogLine]bool{}}

	// nothing writes the file: not confirmed
	if m.saveAndExit("Tester", 1200*time.Millisecond) {
		t.Error("an unchanged file must not count as saved")
	}
	// the game "saves" shortly after the request
	go func() {
		time.Sleep(900 * time.Millisecond)
		os.WriteFile(file, []byte("after the save, a bit longer"), 0o644)
	}()
	if !m.saveAndExit("Tester", 6*time.Second) {
		t.Error("a changed file must count as saved")
	}
	// a character file that cannot be seen cannot be confirmed
	if (&Manager{states: map[string]*State{}, logSubs: map[chan LogLine]bool{}}).saveAndExit("X", time.Second) {
		t.Error("a missing file must not count as saved")
	}
}

// "My game uses PlugY" decides which features exist. Anything that needs PlugY is an error when PlugY is not available.
func TestPlugyProblems(t *testing.T) {
	no, yes := false, true
	cases := []struct {
		name     string
		says     *bool
		commands bool
		every    int
		pages    bool
		want     int
	}{
		{"plugy, commands on, everything on", &yes, true, 5, true, 0},
		{"default (nil) is plugy", nil, true, 5, true, 0},
		{"plugy off, nothing needing it", &no, false, 0, false, 0},
		{"plugy off, periodic save", &no, false, 5, false, 1},
		{"plugy off, stash pages", &no, false, 0, true, 1},
		{"plugy off, both", &no, true, 5, true, 2},
		{"plugy on but commands off, both", &yes, false, 5, true, 2},
		{"plugy on but commands off, nothing needing them", &yes, false, 0, false, 0},
	}
	for _, c := range cases {
		m := &Manager{plugyCommands: c.commands}
		m.cfg.Plugy = c.says
		if got := m.plugyProblems(c.every, c.pages); len(got) != c.want {
			t.Errorf("%s: %d problem(s) %v, want %d", c.name, len(got), got, c.want)
		}
	}
}

func TestPlugyReportAndPlanCoercion(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "PlugY.dll"), []byte("x"), 0o644)
	m := &Manager{plugyCommands: true, cfg: Config{GameExe: filepath.Join(dir, "Game.exe")}}
	r := m.plugyReportLocked()
	if !r.Says || !r.Installed || !r.Commands {
		t.Errorf("report: %+v", r)
	}
	no := false
	m.cfg.Plugy = &no
	if m.plugyReportLocked().Says {
		t.Error("Says must follow the setting")
	}
}
