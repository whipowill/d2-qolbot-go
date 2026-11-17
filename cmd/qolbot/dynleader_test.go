package main

import "testing"

func TestNextQuestIndex(t *testing.T) {
	oldT, oldM := questTable, manualQuest
	defer func() { questTable, manualQuest = oldT, oldM }()
	questTable = []questRow{{1, 1, "A"}, {1, 2, "B"}, {1, 3, "C"}, {1, 4, "D"}}
	manualQuest = map[int]bool{3: true}
	if got := nextQuestIndex(nil); got != 0 {
		t.Errorf("nothing done: %d, want 0", got)
	}
	if got := nextQuestIndex([]int{1, 2}); got != 3 {
		t.Errorf("the manual quest C holds nobody back: %d, want 3", got)
	}
	if got := nextQuestIndex([]int{1, 2, 4}); got != 4 {
		t.Errorf("everything done: %d, want 4", got)
	}
	if got := nextQuestIndex([]int{2, 4}); got != 0 {
		t.Errorf("A missing: %d, want 0", got)
	}
}

func TestLowestOpenDifficulty(t *testing.T) {
	oldT, oldM := questTable, manualQuest
	defer func() { questTable, manualQuest = oldT, oldM }()
	questTable = []questRow{{1, 1, "A"}, {1, 2, "B"}}
	manualQuest = map[int]bool{}
	all := [3][]int{{1, 2}, {1, 2}, {1, 2}}
	if got := lowestOpenDifficulty([]BotQuests{{Done: all}}); got != "Hell" {
		t.Errorf("everything done: %s, want Hell", got)
	}
	if got := lowestOpenDifficulty([]BotQuests{{Done: all}, {Done: [3][]int{{1, 2}, {1}, {}}}}); got != "Nightmare" {
		t.Errorf("one bot still has Nightmare to do: %s", got)
	}
	if got := lowestOpenDifficulty([]BotQuests{{Done: all}, {Done: [3][]int{{1}, {}, {}}}}); got != "Normal" {
		t.Errorf("one bot has not finished Normal: %s", got)
	}
	if got := lowestOpenDifficulty([]BotQuests{{Problem: "no save", Done: [3][]int{{}, {}, {}}}, {Done: all}}); got != "Hell" {
		t.Errorf("a bot whose save cannot be read does not count: %s", got)
	}
}

func TestLeaderShown(t *testing.T) {
	m := &Manager{states: map[string]*State{
		"Darius": {Profile: Profile{Name: "Darius", Character: "Darius"}, Status: "stopped"},
		"Xena":   {Profile: Profile{Name: "Xena", Character: "Xena"}, Status: "stopped"},
	}}
	m.cfg.Player, m.cfg.NotPlaying = "Darius", true
	if got := m.leaderShownLocked(); got != "" {
		t.Errorf("a name left in the settings, nobody in play: %q, want none", got)
	}
	m.states["Darius"].Wanted = true
	if got := m.leaderShownLocked(); got != "Darius" {
		t.Errorf("the chosen leader is in play: %q", got)
	}
	m.states["Darius"].Wanted, m.states["Darius"].Status = false, "stopped"
	m.cfg.Player = "Xena" // the lead was passed on
	m.states["Xena"].Wanted = true
	if got := m.leaderShownLocked(); got != "Xena" {
		t.Errorf("the flag follows the lead: %q", got)
	}
	m.cfg.NotPlaying = false
	m.cfg.Player = "Darius"
	if got := m.leaderShownLocked(); got != "Darius" {
		t.Errorf("playing: the flag is you: %q", got)
	}
}
