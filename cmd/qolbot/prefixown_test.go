package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOwnsPrefix(t *testing.T) {
	root := t.TempDir()
	m := &Manager{root: root}
	home, _ := os.UserHomeDir()
	if got := m.defaultPrefix(); got != filepath.Join(home, ".qolbot_wine_prefix") {
		t.Fatalf("default prefix %s", got)
	}
	if !m.ownsPrefix(m.defaultPrefix()) || !m.ownsPrefix(filepath.Join(root, "wineprefix")) {
		t.Error("the default prefix and one inside the app must be owned")
	}
	for _, p := range []string{filepath.Join(home, ".wine"), filepath.Join(home, "Games"), home, root} {
		if m.ownsPrefix(p) {
			t.Errorf("%s must not be owned", p)
		}
	}
}
