package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeQuestSave(t *testing.T, path string, normal map[int]uint16, mod time.Time) {
	b := make([]byte, 345+96*3+10)
	copy(b[335:], "Woo!")
	for id, w := range normal {
		binary.LittleEndian.PutUint16(b[345+id*2:], w)
	}
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatal(err)
	}
	os.Chtimes(path, mod, mod)
}

func TestEveryBotsQuestCompletionsReachTheActivityList(t *testing.T) {
	oldT, oldA := questTable, questAll
	defer func() { questTable, questAll = oldT, oldA }()
	questTable = []questRow{{1, 1, "Den of Evil"}, {1, 6, "Sisters to the Slaughter"}}
	questAll = questTable
	dir := t.TempDir()
	m := &Manager{cfg: Config{SaveDir: dir}, logSubs: map[chan LogLine]bool{}, states: map[string]*State{
		"Lead":  {Profile: Profile{Name: "Lead", Character: "Lead"}, Difficulty: "Normal"},
		"Other": {Profile: Profile{Name: "Other", Character: "Other"}, Difficulty: "Normal"},
	}}
	t0 := time.Now().Add(-time.Hour)
	writeQuestSave(t, filepath.Join(dir, "Lead.d2s"), map[int]uint16{1: 1}, t0)
	writeQuestSave(t, filepath.Join(dir, "Other.d2s"), map[int]uint16{1: 1}, t0)
	m.noteQuestCompletions() // the first look only remembers
	if len(m.recentEvents(10)) != 0 {
		t.Fatalf("the first look must not report anything: %+v", m.recentEvents(10))
	}
	// the leader said so itself; both saves now have Sisters to the Slaughter
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Lead", Kind: "quest", Name: "Sisters to the Slaughter", Detail: "Act 1"})
	t1 := t0.Add(time.Minute)
	writeQuestSave(t, filepath.Join(dir, "Lead.d2s"), map[int]uint16{1: 1, 6: 1}, t1)
	writeQuestSave(t, filepath.Join(dir, "Other.d2s"), map[int]uint16{1: 1, 6: 1}, t1)
	m.noteQuestCompletions()
	evs := m.recentEvents(10)
	leads, others := 0, 0
	for _, e := range evs {
		if e.Kind == "quest" && e.Name == "Sisters to the Slaughter" {
			if e.Bot == "Lead" {
				leads++
			}
			if e.Bot == "Other" {
				others++
			}
		}
	}
	if leads != 1 || others != 1 {
		t.Errorf("the leader keeps its one entry and the other bot gets its own: leader %d, other %d (%+v)", leads, others, evs)
	}
	m.noteQuestCompletions() // nothing changed: nothing new
	if len(m.recentEvents(10)) != len(evs) {
		t.Error("an unchanged save adds nothing")
	}
}

func TestSilentBotIsTakenForHung(t *testing.T) {
	now := time.Now()
	s := &State{Wanted: true, Status: "running", OutputAt: now.Add(-5 * time.Minute), GameAt: now.Add(-9 * time.Minute)}
	s.Info = "Game:  (00:09:00)"
	if !silentTooLong(s, now) {
		t.Error("five silent minutes in a game is hung")
	}
	s.OutputAt = now.Add(-30 * time.Second)
	if silentTooLong(s, now) {
		t.Error("a bot that printed half a minute ago is fine")
	}
	s.OutputAt, s.Info = now.Add(-10*time.Minute), "Join Game"
	if silentTooLong(s, now) {
		t.Error("a bot at the menu prints nothing: not hung")
	}
	s.Info, s.Wanted = "Game:  (00:01:00)", false
	if silentTooLong(s, now) {
		t.Error("a bot that is not wanted is not restarted")
	}
}
