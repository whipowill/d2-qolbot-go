package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// Each bot writes data/<profile>.purse.json every 30 seconds while it is in a game (ToolsThread.js): its gold in the pack and in the stash, and
// the town portal scrolls in its tome. Qolbot reads the file (the last known state stays there when the bot is stopped) to pick a leader that can
// leave the field and to decide that the team needs a gold hunt (levelup.go).

type purse struct {
	Gold    int       `json:"gold"`
	Stash   int       `json:"stash"`
	Scrolls int       `json:"scrolls"`
	At      time.Time `json:"-"`
}

func (p purse) total() int { return p.Gold + p.Stash }

// canLead: a leader without scrolls cannot make a portal (no way back to town, no waypoint sharing, quests and farm scripts throw), so it needs
// a scroll or the gold to buy some.
func (p purse) canLead() bool { return p.Scrolls > 0 || p.total() >= 150 }

// readPurse is what the bot last wrote about itself; ok is false when it never has.
func (m *Manager) readPurse(profile string) (p purse, ok bool) {
	path := filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "data", profile+".purse.json")
	b, err := os.ReadFile(path)
	if err != nil {
		return purse{}, false
	}
	var raw struct {
		purse
		AtMs int64 `json:"at"`
	}
	if json.Unmarshal(b, &raw) != nil {
		return purse{}, false
	}
	p = raw.purse
	p.At = time.UnixMilli(raw.AtMs)
	return p, true
}

// teamGold is the gold the bots hold together (pack plus stash) and how many of them have a fresh report (at most 5 minutes old).
func (m *Manager) teamGold(names []string) (total, known int) {
	for _, n := range names {
		if p, ok := m.readPurse(n); ok && time.Since(p.At) < 5*time.Minute {
			total += p.total()
			known++
		}
	}
	return
}

// poorestGold is the least gold (pack plus stash) any of the bots holds, and how many of them have a fresh report. With a bot that has not
// reported, `known` is lower than len(names): the caller must not conclude anything yet.
func (m *Manager) poorestGold(names []string) (least, known int) {
	least = -1
	for _, n := range names {
		if p, ok := m.readPurse(n); ok && time.Since(p.At) < 5*time.Minute {
			known++
			if least < 0 || p.total() < least {
				least = p.total()
			}
		}
	}
	return
}
