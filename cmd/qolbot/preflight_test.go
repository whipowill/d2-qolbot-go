package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// A machine without Wine or Xvfb must be told so by name, and Qolbot must not start (main refuses to start on any problem).
func TestPreflightReportsMissingWineAndXvfb(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("the Xvfb requirement is Linux only")
	}
	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, "d2bs", "kolbot"), 0o755)
	t.Setenv("PATH", t.TempDir()) // nothing installed
	m := &Manager{root: root, cfgPath: filepath.Join(root, "q.json"), cfg: Config{Wine: "wine", ScriptPath: "kolbot", GameExe: filepath.Join(root, "Game.exe")}, logSubs: map[chan LogLine]bool{}}
	problems := strings.Join(m.preflight(), "\n")
	if !strings.Contains(problems, "Wine not found") || !strings.Contains(problems, "apt install wine") {
		t.Errorf("Wine must be reported with how to install it:\n%s", problems)
	}
	if !strings.Contains(problems, "Xvfb not found") || !strings.Contains(problems, "xvfb") {
		t.Errorf("Xvfb must be reported with how to install it:\n%s", problems)
	}
	headless := false
	m.cfg.Headless = &headless
	if strings.Contains(strings.Join(m.preflight(), "\n"), "Xvfb not found") {
		t.Error("with visible windows Xvfb is not needed")
	}
}

func TestInstallHints(t *testing.T) {
	if !strings.Contains(wineInstallHint("darwin"), "brew") || !strings.Contains(wineInstallHint("linux"), "apt install wine") {
		t.Error("hints per system")
	}
}
