package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestClearLogs(t *testing.T) {
	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, "logs"), 0o755)
	os.MkdirAll(filepath.Join(root, "d2bs"), 0o755)
	w := func(p, c string) { os.WriteFile(filepath.Join(root, p), []byte(c), 0o644) }
	w("logs/qolbot.log", "live")
	w("logs/qolbot.prev3.log", "old")
	w("logs/qolbot.log.1", "old")
	w("logs/wine.log", "wine")
	w("d2bs/d2bs.log", "d2bs")
	os.MkdirAll(filepath.Join(root, "backups"), 0o755)
	w("backups/Meir-20261112-090000.d2s", "a character")
	m := &Manager{root: root}
	m.clearLogs()
	for _, f := range []string{"logs/qolbot.prev3.log", "logs/qolbot.log.1"} {
		if _, err := os.Stat(filepath.Join(root, f)); err == nil {
			t.Errorf("%s should be gone", f)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "backups")); err == nil {
		t.Error("the restore backups (and their empty folder) should be gone")
	}
	for _, f := range []string{"logs/qolbot.log", "logs/wine.log", "d2bs/d2bs.log"} {
		if fi, err := os.Stat(filepath.Join(root, f)); err != nil || fi.Size() != 0 {
			t.Errorf("%s should exist and be empty", f)
		}
	}
}
