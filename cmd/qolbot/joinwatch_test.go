package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHostLogErrors(t *testing.T) {
	dir := t.TempDir()
	log := "17:25:03.213  [PLAYER LOAD]  ClientAddPlayerToGame()  Error Loading:Vanity  Error:14=nError\r\n" +
		"17:36:32.584  [PLAYER LOAD]  ClientAddPlayerToGame()  Error Loading:Meir  Error:14=nError\r\n" +
		"17:37:05.185  [PLAYER LOAD]  ClientAddPlayerToGame()  Error Loading:Vanity  Error:14=nError\r\n"
	os.WriteFile(filepath.Join(dir, "D2261109.txt"), []byte(log), 0o644)
	os.WriteFile(filepath.Join(dir, "D2261108.txt"), []byte("17:40:00.000  [PLAYER LOAD]  Error Loading:Vanity\n"), 0o644)
	since := time.Date(2026, 11, 9, 17, 30, 0, 0, time.Local)
	got := hostLogErrors(dir, "Vanity", since)
	if len(got) != 1 || got[0][:8] != "17:37:05" {
		t.Fatalf("got %v", got)
	}
}
