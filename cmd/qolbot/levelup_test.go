package main

import (
	"reflect"
	"strings"
	"testing"
)

func TestLevelTarget(t *testing.T) {
	if got := levelTarget([]int{26, 24, 25}); got != 24+levelUpGain {
		t.Errorf("target = %d, want %d", got, 24+levelUpGain)
	}
	if got := levelTarget(nil); got != 0 {
		t.Errorf("no levels: target = %d, want 0", got)
	}
}

func TestLevelUpFarm(t *testing.T) {
	have := []farmRun{{"Countess", "Countess", 1}, {"Andariel", "Andariel", 1}, {"Mephisto", "Mephisto", 3}}
	if got := levelUpFarm("Normal", have, nil); !reflect.DeepEqual(got, []string{"Countess", "Andariel"}) { // Andariel is on the list again, after the Catacombs (which stop at Level 3)
		t.Errorf("Normal: %v", got)
	}
	all := append([]farmRun{{"Tombs", "Tombs", 2}, {"AncientTunnels", "Ancient Tunnels", 2}, {"Catacombs", "Catacombs", 1}}, have...)
	if got := levelUpFarm("Normal", all, nil); !reflect.DeepEqual(got, []string{"Tombs", "AncientTunnels", "Countess", "Catacombs", "Andariel"}) {
		t.Errorf("Normal with the tombs: %v", got)
	}
	if got := levelUpFarm("Hell", have, nil); !reflect.DeepEqual(got, []string{"Mephisto"}) {
		t.Errorf("Hell (Pindleskin missing): %v", got)
	}
	if got := levelUpFarm("Normal", nil, nil); len(got) != 0 {
		t.Errorf("no scripts: %v", got)
	}
}

func TestHuntLabelsAndPurse(t *testing.T) {
	if huntLabel("gold") != "gold hunt" || huntLabel("level") != "level hunt" {
		t.Error("labels")
	}
	if (purse{Scrolls: 0, Gold: 100, Stash: 49}).canLead() {
		t.Error("no scrolls and 149 gold cannot lead")
	}
	if !(purse{Scrolls: 0, Gold: 100, Stash: 50}).canLead() || !(purse{Scrolls: 1}).canLead() {
		t.Error("150 gold, or a scroll, can lead")
	}
}

func TestLevelUpOverridesGoal(t *testing.T) {
	m := &Manager{cfg: Config{Goal: "Quest", NotPlaying: true}}
	if m.goalNow() != "Quest" || !m.dynamicLeaderOn() {
		t.Fatal("before the detour: Quest, dynamic leader on")
	}
	m.levelUp = &levelUpState{Farm: []string{"Countess"}}
	if m.goalNow() != "Farm" || m.dynamicLeaderOn() || !reflect.DeepEqual(m.farmSelection(), []string{"Countess"}) {
		t.Fatal("during the detour: Farm with its own list, dynamic leader off")
	}
	if m.cfg.Goal != "Quest" {
		t.Fatal("the saved goal must not change")
	}
}

func TestTeamIsUp(t *testing.T) {
	if teamIsUp([]string{"Barabas"}, []string{"Xena", "Sankt"}) {
		t.Error("only the leader is up: the team is not")
	}
	if !teamIsUp([]string{"Barabas", "Sankt", "Xena"}, []string{"Xena", "Sankt"}) {
		t.Error("everybody is up")
	}
	if !teamIsUp([]string{"Barabas"}, nil) {
		t.Error("a leader started alone is its own team")
	}
}

func TestLevelHuntFarm(t *testing.T) {
	have := []farmRun{{"Catacombs", "Catacombs", 1}, {"Andariel", "Andariel", 1}, {"Tombs", "Tal Rasha's Tombs", 2}, {"Duriel", "Duriel", 2}, {"Travincal", "Travincal", 3}, {"Mephisto", "Mephisto", 3}, {"Diablo", "Diablo", 4}, {"Worldstone", "Worldstone Keep", 5}, {"Baal", "Baal", 5}}
	cases := map[int][]string{1: nil, 2: {"Catacombs", "Andariel"}, 3: {"Tombs", "Duriel"}, 4: {"Travincal", "Mephisto"}, 5: {"Diablo"}, 6: {"Worldstone", "Baal"}, 7: nil}
	for act, want := range cases {
		got := levelHuntFarm(act, have, nil)
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("act %d: got %v, want %v", act, got, want)
		}
	}
	if got := levelHuntFarm(3, have, func(n string) bool { return n == "Duriel" }); strings.Join(got, ",") != "Tombs" {
		t.Errorf("a place that went bad is skipped: %v", got)
	}
}

func TestLevelHuntAct(t *testing.T) {
	if levelHuntAct(nil, []int{2, 3}) != 1 {
		t.Error("act 1 zones from town: act 1")
	}
	if levelHuntAct([]string{"Tombs", "Duriel"}, nil) != 2 {
		t.Error("the Tombs are act 2")
	}
	if levelHuntAct([]string{"Travincal"}, nil) != 3 {
		t.Error("Travincal is act 3")
	}
	if levelHuntAct([]string{"Nonsense"}, nil) != 0 || levelHuntAct(nil, nil) != 0 {
		t.Error("unknown: 0")
	}
}

func TestFirstActNow(t *testing.T) {
	m := &Manager{states: map[string]*State{}, cfg: Config{Goal: "Farm", NotPlaying: true}}
	if got := m.firstActNow(nil); got != 0 {
		t.Errorf("farm with no runs chosen: %d", got)
	}
	m.cfg.NotPlaying = false
	m.levelUp = &levelUpState{Act: 3}
	if got := m.firstActNow(nil); got != 0 {
		t.Errorf("a human plays: nobody hops first, got %d", got)
	}
	m.cfg.NotPlaying = true
	if got := m.firstActNow(nil); got != 3 {
		t.Errorf("a hunt starts in its first place's act: %d", got)
	}
}
