package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPageDevMode(t *testing.T) {
	root := t.TempDir()
	m := &Manager{root: root}
	t.Setenv("QOLBOT_DEV", "")
	if !strings.Contains(string(m.page()), "Qolbot for Diablo II") {
		t.Fatal("the built-in page must be served normally")
	}
	os.MkdirAll(filepath.Join(root, "cmd", "qolbot", "web"), 0o755)
	os.WriteFile(filepath.Join(root, "cmd", "qolbot", "web", "index.html"), []byte("EDITED"), 0o644)
	if string(m.page()) == "EDITED" {
		t.Fatal("the file on disk must be ignored unless QOLBOT_DEV is set")
	}
	t.Setenv("QOLBOT_DEV", "1")
	if string(m.page()) != "EDITED" {
		t.Fatal("with QOLBOT_DEV the page must come from the file, fresh on every call")
	}
	os.WriteFile(filepath.Join(root, "cmd", "qolbot", "web", "index.html"), []byte("EDITED AGAIN"), 0o644)
	if string(m.page()) != "EDITED AGAIN" {
		t.Fatal("a second edit must show without a restart")
	}
	os.Remove(filepath.Join(root, "cmd", "qolbot", "web", "index.html"))
	if !strings.Contains(string(m.page()), "Qolbot for Diablo II") {
		t.Fatal("a missing file must fall back to the built-in page")
	}
}

func TestGoalAndFarmRuns(t *testing.T) {
	root := t.TempDir()
	bots := filepath.Join(root, "d2bs", "kolbot", "libs", "bots")
	os.MkdirAll(bots, 0o755)
	for _, n := range []string{"Mephisto", "Baal", "Andariel"} {
		os.WriteFile(filepath.Join(bots, n+".js"), []byte("x"), 0o644)
	}
	m := &Manager{root: root, cfgPath: filepath.Join(root, "q.json"), cfg: Config{ScriptPath: "kolbot"},
		states: map[string]*State{"Bot": {Profile: Profile{Name: "Bot", Role: "host"}}}, logSubs: map[chan LogLine]bool{}}
	if got := m.farmCatalog(); len(got) != 3 || got[0].Name != "Andariel" || got[2].Name != "Baal" {
		t.Fatalf("catalog (by act, only scripts that exist): %v", got)
	}
	if err := m.setGoal("Farm", "Nightmare", []string{"Baal", "Andariel"}); err != nil {
		t.Fatal(err)
	}
	if got := m.farmSelection(); len(got) != 2 || got[0] != "Andariel" || got[1] != "Baal" {
		t.Errorf("selection must run in act order: %v", got)
	}
	if m.difficultyNow() != "Nightmare" {
		t.Errorf("the difficulty was not saved: %s", m.difficultyNow())
	}
	if err := m.setGoal("Farm", "Impossible", nil); err == nil {
		t.Error("an unknown difficulty must be refused")
	}
	if err := m.setGoal("Farm", "Hell", []string{"Nonsense"}); err == nil {
		t.Error("an unknown farm run must be refused")
	}
	if err := m.setGoal("Dance", "Hell", nil); err == nil {
		t.Error("an unknown goal must be refused")
	}
}

func iniFor(t *testing.T, m *Manager) string {
	t.Helper()
	if err := m.writeD2BSIni(); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(m.root, "d2bs", "d2bs.ini"))
	var r []rune
	for i := 2; i+1 < len(b); i += 2 {
		r = append(r, rune(uint16(b[i])|uint16(b[i+1])<<8))
	}
	return string(r)
}

func TestLeaderBotHostsAndRunsTheObjective(t *testing.T) {
	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, "d2bs"), 0o755)
	m := &Manager{root: root, cfg: Config{ScriptPath: "kolbot", HostIP: "localhost", Player: "Lead", NotPlaying: true}, logSubs: map[chan LogLine]bool{},
		states: map[string]*State{"Lead": {Profile: Profile{Name: "Lead", Character: "Lead"}}, "Fol": {Profile: Profile{Name: "Fol", Character: "Fol"}},
			"Test": {Profile: Profile{Name: "Test", Character: "Test", Role: "host"}}}}
	ini := iniFor(t, m)
	if !strings.Contains(ini, "character=Lead\r\nScriptPath=kolbot\r\nDefaultGameScript=default.dbj\r\nDefaultStarterScript=D2BotTcpIpHost.dbj") {
		t.Errorf("the leader bot hosts and plays the objective:\n%s", ini)
	}
	if !strings.Contains(ini, "character=Fol\r\nScriptPath=kolbot\r\nDefaultGameScript=default.dbj\r\nDefaultStarterScript=D2BotTcpIpJoin.dbj") {
		t.Errorf("a follower keeps the join starter:\n%s", ini)
	}
	if !strings.Contains(ini, "character=Test\r\nScriptPath=kolbot\r\nDefaultGameScript=hostidle.dbj\r\nDefaultStarterScript=D2BotTcpIpHost.dbj") {
		t.Errorf("a test host still idles:\n%s", ini)
	}
	m.cfg.NotPlaying = false
	if ini = iniFor(t, m); strings.Contains(ini, "character=Lead\r\nScriptPath=kolbot\r\nDefaultGameScript=default.dbj\r\nDefaultStarterScript=D2BotTcpIpHost.dbj") {
		t.Errorf("when you are playing nobody hosts for you:\n%s", ini)
	}
	if m.goalNow() != "Farm" {
		t.Error("Farm is the default objective")
	}
	if err := m.setGoal("Follow", "Hell", nil); err == nil {
		t.Error("Follow is not an objective any more")
	}
}

func TestDevDemoOnlyInDevMode(t *testing.T) {
	t.Setenv("QOLBOT_DEV", "")
	if devDemo() != nil {
		t.Error("no demo data outside dev mode")
	}
	t.Setenv("QOLBOT_DEV", "1")
	d := devDemo()
	if d == nil || len(d["profiles"].([]map[string]any)) == 0 || len(d["events"].([]map[string]any)) == 0 {
		t.Error("dev mode fills the Status tab")
	}
}
