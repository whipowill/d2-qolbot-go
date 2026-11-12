package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// wineserverPath finds the wineserver that belongs to the configured Wine.
func (m *Manager) wineserverPath() string {
	if w, err := exec.LookPath(m.cfg.Wine); err == nil {
		if r, err := filepath.EvalSymlinks(w); err == nil {
			w = r
		}
		if ws := filepath.Join(filepath.Dir(w), "wineserver"); fileExists(ws) {
			return ws
		}
	}
	if ws, err := exec.LookPath("wineserver"); err == nil {
		return ws
	}
	return ""
}

func fileExists(p string) bool { st, err := os.Stat(p); return err == nil && !st.IsDir() }

// prefixPids lists processes (other than this one) that run in the given Wine prefix, found by their
// WINEPREFIX environment variable. Linux only; elsewhere it returns nil and wineserver -k has to do the job.
func prefixPids(prefix string) []int {
	if runtime.GOOS != "linux" {
		return nil
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil
	}
	want := "WINEPREFIX=" + prefix
	var pids []int
	for _, e := range entries {
		pid, err := strconv.Atoi(e.Name())
		if err != nil || pid == os.Getpid() {
			continue
		}
		env, err := os.ReadFile("/proc/" + e.Name() + "/environ")
		if err != nil {
			continue
		}
		for _, kv := range strings.Split(string(env), "\x00") {
			if kv == want {
				pids = append(pids, pid)
				break
			}
		}
	}
	return pids
}

// stopWine makes sure nothing of ours is left running in the app's Wine prefix: game processes, d2bridge.exe,
// wineserver and Wine's helper services. It first asks the prefix's wineserver to shut everything down, then
// kills whatever is still there. It only ever acts on its own prefix (~/.qolbot_wine_prefix or one inside the app folder), never on one of yours.
func (m *Manager) stopWine() int {
	if runtime.GOOS == "windows" {
		return 0
	}
	prefix, err := filepath.Abs(m.prefixPath())
	if err != nil || !m.ownsPrefix(prefix) {
		return 0
	}
	killed := len(prefixPids(prefix))
	if ws := m.wineserverPath(); ws != "" && killed > 0 {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		cmd := exec.CommandContext(ctx, ws, "-k")
		cmd.Env = append(os.Environ(), "WINEPREFIX="+prefix, "WINEDEBUG=-all")
		cmd.Run()
		cancel()
	}
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		pids := prefixPids(prefix)
		if len(pids) == 0 {
			return killed
		}
		if time.Until(deadline) < 4*time.Second { // had its chance to exit politely
			for _, pid := range pids {
				if p, err := os.FindProcess(pid); err == nil {
					p.Kill()
				}
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return killed
}

// xvfbPidFile remembers the hidden display this program started, so a later start can remove it if this one is
// killed so hard (kill -9, power loss) that it could not clean up after itself.
func (m *Manager) xvfbPidFile() string { return filepath.Join(m.root, ".qolbot-xvfb.pid") }

// killStaleXvfb kills the display recorded by an earlier run, but only if that PID still is an Xvfb.
func (m *Manager) killStaleXvfb() int {
	b, err := os.ReadFile(m.xvfbPidFile())
	if err != nil {
		return 0
	}
	os.Remove(m.xvfbPidFile())
	pid, err := strconv.Atoi(strings.TrimSpace(string(b)))
	if err != nil || pid <= 1 {
		return 0
	}
	cmdline, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/cmdline")
	if err != nil || !strings.HasPrefix(string(cmdline), "Xvfb") {
		return 0 // already gone, or the number now belongs to something else: leave it alone
	}
	if p, err := os.FindProcess(pid); err == nil && p.Kill() == nil {
		return 1
	}
	return 0
}
