package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Bots refuse to start while PlugY is active with the shared stash in multiplayer, the World Event or AutoSell on.
// Every launch goes through gameProblem.
func TestPlugyBlocksBots(t *testing.T) {
	dir := t.TempDir()
	exe := filepath.Join(dir, "Game.exe")
	os.WriteFile(exe, []byte("x"), 0o644)
	m := &Manager{root: dir, cfg: Config{GameExe: exe}}
	cases := []struct {
		name, ini string
		blocked   bool
		names     []string // settings the message must name
	}{
		{"shared stash on", "[GENERAL]\r\nActivePlugin=1\r\nActiveSharedStashInMultiPlayer=1\r\n", true, []string{"ActiveSharedStashInMultiPlayer"}},
		{"spaces and case", "ActivePlugin=1\r\n activesharedstashinmultiplayer = 1 ; note\r\n", true, []string{"ActiveSharedStashInMultiPlayer"}},
		{"world event and auto sell on", "ActivePlugin=1\r\nActiveWorldEvent=1\r\nActiveAutoSell=1\r\n", true, []string{"ActiveWorldEvent=1", "ActiveAutoSell=1"}},
		{"world event alone is fine", "ActivePlugin=1\r\nActiveWorldEvent=1\r\nActiveAutoSell=0\r\n", false, nil},
		{"auto sell alone is fine", "ActivePlugin=1\r\nActiveWorldEvent=0\r\nActiveAutoSell=1\r\n", false, nil},
		{"auto sell with no world event line", "ActivePlugin=1\r\nActiveAutoSell=1\r\n", false, nil},
		{"all off", "ActivePlugin=1\r\nActiveSharedStashInMultiPlayer=0\r\nActiveWorldEvent=0\r\nActiveAutoSell=0\r\n", false, nil},
		{"options absent", "ActivePlugin=1\r\n", false, nil},
		{"plugy itself off", "ActivePlugin=0\r\nActiveWorldEvent=1\r\nActiveAutoSell=1\r\nActiveSharedStashInMultiPlayer=1\r\n", false, nil},
		{"other value", "ActivePlugin=1\r\nActiveSharedStashInMultiPlayer=10\r\n", false, nil},
	}
	for _, c := range cases {
		os.WriteFile(filepath.Join(dir, "PlugY.ini"), []byte(c.ini), 0o644)
		got := m.gameProblem()
		if (got != "") != c.blocked {
			t.Errorf("%s: gameProblem=%q, blocked want %v", c.name, got, c.blocked)
		}
		for _, n := range c.names {
			if !strings.Contains(got, n) {
				t.Errorf("%s: message must name %s: %q", c.name, n, got)
			}
		}
		if c.blocked {
			if err := m.startProfile("Anyone"); err == nil || !strings.Contains(err.Error(), c.names[0]) {
				t.Errorf("%s: startProfile must refuse with the reason, got %v", c.name, err)
			}
		}
	}
	os.Remove(filepath.Join(dir, "PlugY.ini"))
	if got := m.gameProblem(); got != "" {
		t.Errorf("no PlugY.ini must not block: %q", got)
	}
}
