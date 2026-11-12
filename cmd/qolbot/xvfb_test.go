package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"testing"
	"time"
)

// Regression test: after about 50 runs that were killed hard, every display number from 90 to 139 had a stale
// socket and lock file, the old code treated them all as taken, and bots silently showed up on the real desktop.
func TestStartXvfbSurvivesStaleDisplayFiles(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Xvfb is Linux only")
	}
	if _, err := exec.LookPath("Xvfb"); err != nil {
		t.Skip("no Xvfb installed")
	}
	var made []string
	for n := 90; n < 140; n++ {
		for _, p := range []string{fmt.Sprintf("/tmp/.X%d-lock", n), fmt.Sprintf("/tmp/.X11-unix/X%d", n)} {
			if _, err := os.Stat(p); err == nil {
				continue // never overwrite something real
			}
			body := []byte("4194303\n") // a PID that cannot be alive
			if err := os.WriteFile(p, body, 0o644); err == nil {
				made = append(made, p)
			}
		}
	}
	defer func() {
		for _, p := range made {
			os.Remove(p)
		}
	}()
	dir := t.TempDir()
	m := &Manager{root: dir, logSubs: map[chan LogLine]bool{}}
	display, err := m.startXvfb()
	if err != nil {
		t.Fatalf("startXvfb with stale files present: %v", err)
	}
	defer m.killHelpers()
	if len(display) < 2 || display[0] != ':' {
		t.Fatalf("odd display %q", display)
	}
	if m.xvfb == nil || m.xvfb.Process == nil {
		t.Fatal("Xvfb process not recorded")
	}
	time.Sleep(300 * time.Millisecond)
	if err := m.xvfb.Process.Signal(syscallZero()); err != nil {
		t.Errorf("Xvfb is not running: %v", err)
	}
	if b, err := os.ReadFile(m.xvfbPidFile()); err != nil || len(b) == 0 {
		t.Errorf("pid file missing: %v", err)
	}
}

func syscallZero() os.Signal { return syscallSignal0 }
