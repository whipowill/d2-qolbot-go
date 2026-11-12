package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// fakeD2S builds the smallest character file the parser accepts: a level 5 Paladin with no skills.
func fakeD2S(name string) []byte {
	b := make([]byte, 810)
	copy(b[0:], []byte{0x55, 0xaa, 0x55, 0xaa})
	b[4] = 0x60 // version
	copy(b[20:], name)
	b[40] = 3 // Paladin
	b[43] = 5 // level
	b[765], b[766] = 'g', 'f'
	b[767], b[768] = 0xff, 0x01 // the 9-bit attribute terminator 0x1ff
	b[769], b[770] = 'i', 'f'   // skills: 30 bytes of zero follow
	return b
}

// Regression test for a deadlock: writeSpec holds the manager's lock while it gathers settings, and once called a
// function that takes the same lock again. Starting any bot then froze the whole manager. It runs under a timeout so a
// repeat fails instead of hanging.
func TestWriteSpecDoesNotDeadlockAndWritesTheSettings(t *testing.T) {
	root := t.TempDir()
	save := filepath.Join(root, "Save")
	os.MkdirAll(save, 0o755)
	os.WriteFile(filepath.Join(save, "Tester.d2s"), fakeD2S("Tester"), 0o644)
	exe := filepath.Join(root, "Game.exe")
	os.WriteFile(exe, []byte("x"), 0o644)
	m := &Manager{root: root, plugyCommands: true, cfg: Config{GameExe: exe, SaveDir: save, ScriptPath: "kolbot"}, logSubs: map[chan LogLine]bool{}}
	every := 7
	m.cfg.AutoSaveMinutes = &every

	done := make(chan struct{})
	go func() { m.writeSpec("Tester", "Tester", ""); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("writeSpec did not return: deadlock on the manager lock")
	}
	b, err := os.ReadFile(filepath.Join(root, "d2bs", "kolbot", "data", "Tester.spec.json"))
	if err != nil {
		t.Fatalf("no plan file written: %v", err)
	}
	var plan struct {
		AutoSaveMinutes int `json:"autoSaveMinutes"`
		Storage         struct {
			Inventory [2]int `json:"inventory"`
		} `json:"storage"`
		Banter bool `json:"banter"`
	}
	if err := json.Unmarshal(b, &plan); err != nil {
		t.Fatal(err)
	}
	if plan.AutoSaveMinutes != 7 || plan.Storage.Inventory[0] == 0 || !plan.Banter {
		t.Errorf("plan lost settings: %s", b)
	}

	// with PlugY's commands off there is no way to save, so the plan must say 0
	m.plugyCommands = false
	m.writeSpec("Tester", "Tester", "")
	b, _ = os.ReadFile(filepath.Join(root, "d2bs", "kolbot", "data", "Tester.spec.json"))
	json.Unmarshal(b, &plan)
	if plan.AutoSaveMinutes != 0 {
		t.Errorf("autoSaveMinutes should be 0 when PlugY commands are off, got %d", plan.AutoSaveMinutes)
	}
}

// The kill watcher is on unless qolbot.json turns it off.
func TestWatchKillsIsOnByDefault(t *testing.T) {
	root := t.TempDir()
	save := filepath.Join(root, "Save")
	os.MkdirAll(save, 0o755)
	os.WriteFile(filepath.Join(save, "Tester.d2s"), fakeD2S("Tester"), 0o644)
	exe := filepath.Join(root, "Game.exe")
	os.WriteFile(exe, []byte("x"), 0o644)
	m := &Manager{root: root, plugyCommands: true, cfg: Config{GameExe: exe, SaveDir: save, ScriptPath: "kolbot"}, logSubs: map[chan LogLine]bool{}}
	watch := func() bool {
		m.writeSpec("Tester", "Tester", "")
		b, _ := os.ReadFile(filepath.Join(root, "d2bs", "kolbot", "data", "Tester.spec.json"))
		var plan struct {
			WatchKills bool `json:"watchKills"`
		}
		json.Unmarshal(b, &plan)
		return plan.WatchKills
	}
	if !watch() {
		t.Error("watchKills should be on by default")
	}
	off := false
	m.cfg.WatchKills = &off
	if watch() {
		t.Error("watchKills false in qolbot.json must turn it off")
	}
}
