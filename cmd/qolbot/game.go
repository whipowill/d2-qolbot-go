package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// gameProblem returns "" when bots can be launched, otherwise a sentence telling the user what to fix.
// Every launch goes through it (web page, command line and autoStart), so nothing starts before the
// path to Game.exe is set.
func (m *Manager) gameProblem() string {
	m.mu.Lock()
	exe := m.cfg.GameExe
	m.mu.Unlock()
	if strings.TrimSpace(exe) == "" {
		return "The path to Diablo II's Game.exe is not set. Set it on the web page's Settings tab first."
	}
	if st, err := os.Stat(exe); err != nil || st.IsDir() {
		return fmt.Sprintf("Game.exe was not found at %s. Fix the path on the web page's Settings tab.", exe)
	}
	return plugyProblem(filepath.Dir(exe))
}

// setGameExe validates and stores a new Game.exe path (from the web page), rebuilds the bot game folder and
// looks for characters. It refuses while bots are running, because they are using the old folder.
func (m *Manager) setGameExe(path string) error {
	path = strings.Trim(strings.TrimSpace(path), "\"'")
	if path == "" {
		return fmt.Errorf("enter the full path to Game.exe")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	st, err := os.Stat(abs)
	if err != nil {
		return fmt.Errorf("nothing found at %s", abs)
	}
	if st.IsDir() {
		// be forgiving: they pasted the game folder
		if _, err := os.Stat(filepath.Join(abs, "Game.exe")); err == nil {
			abs = filepath.Join(abs, "Game.exe")
		} else {
			return fmt.Errorf("%s is a folder with no Game.exe in it", abs)
		}
	}
	if !strings.HasSuffix(strings.ToLower(abs), ".exe") {
		return fmt.Errorf("%s does not look like Game.exe", abs)
	}
	m.mu.Lock()
	for _, s := range m.states {
		if s.Wanted || s.Status == "running" || s.Status == "starting" {
			m.mu.Unlock()
			return fmt.Errorf("stop all bots before changing the game path")
		}
	}
	m.cfg.GameExe = abs
	m.mu.Unlock()
	m.checkGameFiles()
	if n := m.scanCharacters(); n > 0 {
		m.logf(0, "", "game path set: found %d character(s)", n)
	}
	m.logf(0, "", "game path set to %s", abs)
	return m.saveConfig()
}
