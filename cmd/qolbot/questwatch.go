package main

import (
	"fmt"
	"os"
	"time"
)

// Quest completions of EVERY bot in the Activity list. The Quester only says "Act 1 - #6 - ... is complete" for the bot that plays the quest (the
// leader); the others get theirs by talking to the quest NPCs, a moment later, and nobody says so. The saves know: this watches every character's save
// file and, when a quest is complete in it that was not before, adds the entry for that bot.

// questSnap is, per profile, the quests (difficulty -> id) that were complete the last time its save was read, and the save's time stamp then.
type questSnap struct {
	done [3]map[int]bool
	mod  time.Time
}

func (m *Manager) questWatchLoop() {
	for range time.Tick(10 * time.Second) {
		m.noteQuestCompletions()
	}
}

// noteQuestCompletions reads the saves that changed since the last look and adds an entry for each quest that became complete. The first look at a
// character only remembers what is there.
func (m *Manager) noteQuestCompletions() {
	if m.saveDir() == "" {
		return
	}
	type who struct{ name, char, diff string }
	var ws []who
	m.mu.Lock()
	if m.questSeen == nil {
		m.questSeen = map[string]*questSnap{}
	}
	for n, s := range m.states {
		if s.Character != "" {
			ws = append(ws, who{n, s.Character, s.Difficulty})
		}
	}
	m.mu.Unlock()
	for _, w := range ws {
		path := m.savePath(w.char)
		fi, err := os.Stat(path)
		if err != nil {
			continue
		}
		m.mu.Lock()
		prev := m.questSeen[w.name]
		m.mu.Unlock()
		if prev != nil && fi.ModTime().Equal(prev.mod) {
			continue
		}
		done, ok := readQuestDone(path)
		if !ok {
			continue
		}
		cur := &questSnap{mod: fi.ModTime()}
		for d := range done {
			cur.done[d] = map[int]bool{}
			for _, id := range done[d] {
				cur.done[d][id] = true
			}
		}
		m.mu.Lock()
		m.questSeen[w.name] = cur
		m.mu.Unlock()
		if prev == nil {
			continue
		}
		for d := range done {
			for _, id := range done[d] {
				if prev.done[d][id] {
					continue
				}
				m.addQuestFromSave(w.name, w.diff, d, id)
			}
		}
	}
}

// addQuestFromSave adds the entry, unless the bot's own report of it (the Quester's line) is already in the list.
func (m *Manager) addQuestFromSave(bot, botDiff string, d, id int) {
	var q *questRow
	for i := range questAll {
		if questAll[i].ID == id {
			q = &questAll[i]
		}
	}
	if q == nil {
		return
	}
	detail := fmt.Sprintf("Act %d", q.Act)
	if difficultyNames[d] != botDiff && botDiff != "" {
		detail += " · " + difficultyNames[d]
	}
	m.mu.Lock()
	for i := len(m.events) - 1; i >= 0 && i >= len(m.events)-120; i-- {
		e := m.events[i]
		if e.Kind == "quest" && e.Bot == bot && e.Name == q.Title && e.Detail == detail && time.Since(e.Time) < 10*time.Minute {
			m.mu.Unlock()
			return
		}
	}
	m.mu.Unlock()
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: bot, Kind: "quest", Name: q.Title, Detail: detail, Verified: "saved"})
}
