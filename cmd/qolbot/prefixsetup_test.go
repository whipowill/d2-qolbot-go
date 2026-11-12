package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Regression: the prefix in ~/.qolbot_wine_prefix was treated as "not ours" by setupPrefix, so it was never set to
// Windows 7 and the game crashed at start (Fog.dll stack overflow).
func TestSetupPrefixRunsForTheDefaultPrefix(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	root := t.TempDir()
	calls := filepath.Join(root, "calls.txt")
	fake := filepath.Join(root, "fakewine")
	os.WriteFile(fake, []byte("#!/bin/sh\necho \"$@\" >> "+calls+"\n"), 0o755)
	m := &Manager{root: root, cfg: Config{Wine: fake, WinVersion: "win7"}, logSubs: nil}
	prefix := m.defaultPrefix()
	os.MkdirAll(filepath.Join(prefix, "drive_c", "windows", "system32"), 0o755)
	if err := m.setupPrefix(prefix, os.Environ()); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(calls)
	if !strings.Contains(string(b), "Version /t REG_SZ /d win7") {
		t.Fatalf("the Windows version was never set; wine was called with:\n%s", b)
	}
	if _, err := os.Stat(filepath.Join(prefix, ".d2botd-ready")); err != nil {
		t.Fatal("no ready marker")
	}
}
