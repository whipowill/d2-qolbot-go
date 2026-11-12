package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRescanDropsDeletedCharacters(t *testing.T) {
	m := pickitManager(t)
	dir := t.TempDir()
	m.cfg.GameExe = filepath.Join(filepath.Dir(dir), "Game.exe")
	save := m.saveDir()
	if err := os.MkdirAll(save, 0o755); err != nil {
		t.Skip(err)
	}
	os.WriteFile(filepath.Join(save, "Keeper.d2s"), []byte("x"), 0o644)
	m.states = map[string]*State{
		"Keeper":  {Profile: Profile{Name: "Keeper", Character: "Keeper"}, Status: "stopped"},
		"Deleted": {Profile: Profile{Name: "Deleted", Character: "Deleted"}, Status: "stopped"},
		"Running": {Profile: Profile{Name: "Running", Character: "Running"}, Status: "running", Wanted: true},
	}
	gone := m.dropMissingCharacters()
	if len(gone) != 1 || gone[0] != "Deleted" {
		t.Fatalf("removed %v, want only Deleted", gone)
	}
	if m.states["Keeper"] == nil || m.states["Running"] == nil {
		t.Error("a character with a save, and a running bot, are kept")
	}
	os.Remove(filepath.Join(save, "Keeper.d2s")) // an empty save folder removes nothing
	if gone = m.dropMissingCharacters(); len(gone) != 0 {
		t.Errorf("an empty save folder must not wipe the list: %v", gone)
	}
}
