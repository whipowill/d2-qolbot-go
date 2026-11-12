package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// The bots run straight from your own Diablo II folder. Nothing is copied or linked: the game's settings files are
// yours to set up (PlugY.ini and BaseMod.ini must have the World Event off, because it crashes bots; see the README).
// qolbot only READS them here, to warn when something is wrong.

var (
	rePlugyEvent = regexp.MustCompile(`(?m)^(ActiveWorldEvent|ActiveAutoSell)\s*=\s*1`)
	reBaseModWE  = regexp.MustCompile(`(?ms)^\[WorldEvent\][^\n]*\n(.*?)(^\[|\z)`)
	reBaseModOn  = regexp.MustCompile(`(?m)^Enabled\s*=\s*1`)
)

// checkGameFiles runs at start and whenever the game path changes.
func (m *Manager) checkGameFiles() {
	m.migrateBotGame()
	m.detectPlugyCommands()
	dir := filepath.Dir(m.cfg.GameExe)
	if strings.TrimSpace(m.cfg.GameExe) == "" || dir == "." {
		return
	}
	if b, err := os.ReadFile(filepath.Join(dir, "PlugY.ini")); err == nil && rePlugyEvent.Match(b) {
		m.logf(9, "", "PlugY.ini has ActiveWorldEvent or ActiveAutoSell set to 1: that crashes bots a few minutes into a game. Set both to 0.")
	}
	if b, err := os.ReadFile(filepath.Join(dir, "BaseMod.ini")); err == nil {
		if sec := reBaseModWE.FindSubmatch(b); sec != nil && reBaseModOn.Match(sec[1]) {
			m.logf(9, "", "BaseMod.ini has the World Event enabled: it crashes bots a few minutes into a game. Set Enabled=0 in [WorldEvent].")
		}
	}
}

// migrateBotGame: older versions built a ./botgame folder of links next to the program and a config may still name
// botgame/Game.exe. Point it at the real game. The folder itself is left alone (it is unused; delete it when you like).
func (m *Manager) migrateBotGame() {
	if m.root == "" {
		return
	}
	old := filepath.Join(m.root, "botgame")
	if _, err := os.Lstat(old); err != nil {
		return
	}
	if strings.HasPrefix(m.cfg.GameExe, old+string(filepath.Separator)) {
		real, err := filepath.EvalSymlinks(m.cfg.GameExe)
		if err != nil {
			m.logf(9, "", "the game path points into the old botgame folder and its link is broken: set the game path on the Settings tab")
			return
		}
		m.mu.Lock()
		m.cfg.GameExe = real
		m.mu.Unlock()
		m.saveConfig()
		m.logf(0, "", "game path now points at your real game: %s", real)
	}
	m.logf(0, "", "the old ./botgame folder is not used any more (bots run from your game folder); you can delete it")
}
