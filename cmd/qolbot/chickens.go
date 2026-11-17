package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// Who runs away from fights (2026-11-13). The leader choice prefers the bot that has chickened less (dynleader.go), but the count used to live in memory
// and a restart of the manager forgot it, so the richest bot was handed the lead again right after three chickens. Every chicken is now kept with its time
// in d2bs/kolbot/data/chickens.json (git-ignored), and only the last chickenMemory counts.

const (
	chickenMemory = 3 * time.Hour // a chicken counts for the leader choice this long
	chickenKeep   = 6 * time.Hour // and is kept in the file this long
)

type chickenEntry struct {
	Bot string    `json:"bot"`
	At  time.Time `json:"at"`
}

func (m *Manager) chickenFile() string {
	return filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "data", "chickens.json")
}

// loadChickens reads the file at startup (a missing or broken file is an empty history).
func (m *Manager) loadChickens() {
	b, err := os.ReadFile(m.chickenFile())
	if err != nil {
		return
	}
	var list []chickenEntry
	if json.Unmarshal(b, &list) != nil {
		return
	}
	m.mu.Lock()
	m.chickenLog = pruneChickens(list, time.Now())
	m.mu.Unlock()
}

// pruneChickens drops what is older than chickenKeep.
func pruneChickens(list []chickenEntry, now time.Time) []chickenEntry {
	var out []chickenEntry
	for _, e := range list {
		if now.Sub(e.At) < chickenKeep {
			out = append(out, e)
		}
	}
	return out
}

// noteChickenTime records one chicken of a bot and saves the history.
func (m *Manager) noteChickenTime(bot string) {
	now := time.Now()
	m.mu.Lock()
	m.chickenLog = append(pruneChickens(m.chickenLog, now), chickenEntry{Bot: bot, At: now})
	b, _ := json.Marshal(m.chickenLog)
	path := m.chickenFile()
	m.mu.Unlock()
	if os.MkdirAll(filepath.Dir(path), 0o755) == nil {
		os.WriteFile(path, b, 0o660)
	}
}

// countChickens is how many of the log's chickens belong to bot within chickenMemory of now.
func countChickens(list []chickenEntry, bot string, now time.Time) int {
	n := 0
	for _, e := range list {
		if e.Bot == bot && now.Sub(e.At) < chickenMemory {
			n++
		}
	}
	return n
}
