package main

import (
	"strings"
	"testing"
	"time"
)

func TestNotReadyMessage(t *testing.T) {
	now := time.Now()
	sb := []setback{
		{At: now.Add(-17 * time.Minute), Kind: "chicken", Zone: "Claw Viper Temple Level 1", Diff: "Hell"},
		{At: now.Add(-9 * time.Minute), Kind: "chicken", Zone: "Tal Rashas Tomb #1", Diff: "Hell"},
		{At: now.Add(-3 * time.Minute), Kind: "death", Zone: "Tal Rashas Tomb #1", Diff: "Hell"},
		{At: now, Kind: "chicken", Zone: "Tal Rashas Tomb #1", Diff: "Hell", Detail: "Life Chicken (164/811) to Champion Apparition in Tal Rashas Tomb #1. Ping: 29"},
	}
	msg := notReadyMessage("Meir", sb)
	for _, want := range []string{"Meir stopped: 3 chickens and 1 death in 17 minutes in Hell (Claw Viper Temple Level 1, Tal Rashas Tomb #1).", "Last: Life Chicken (164/811) to Champion Apparition", "may not be ready for these monsters"} {
		if !strings.Contains(msg, want) {
			t.Errorf("missing %q in:\n%s", want, msg)
		}
	}
	if notReadyMessage("Meir", nil) != "" {
		t.Error("no setbacks, no message")
	}
}

func TestRecentSetbacks(t *testing.T) {
	now := time.Now()
	all := []setback{{At: now.Add(-40 * time.Minute)}, {At: now.Add(-29 * time.Minute)}, {At: now}}
	if got := recentSetbacks(all, now, 30*time.Minute); len(got) != 2 {
		t.Errorf("only the two within 30 minutes stay, got %d", len(got))
	}
}

func readinessManager(t *testing.T) *Manager {
	m := stopTestManager(t) // Lead hosts, Aaa and Zed follow
	return m
}

func TestAFollowerThatKeepsChickeningStopsEverybody(t *testing.T) {
	m := readinessManager(t)
	for i := 0; i < 2; i++ {
		m.update("Aaa", func(s *State) { s.Zone, s.Difficulty = "Tal Rashas Tomb #1", "Hell" })
		m.noteSetback("Aaa", "chicken")
	}
	if st := m.states["Aaa"].Status; st != "running" {
		t.Fatalf("two chickens are not enough: %s", st)
	}
	m.update("Aaa", func(s *State) { s.lastChicken = "Life Chicken (6/811) to Devil Jade in Tal Rashas Tomb #1. Ping: 30" })
	m.noteSetback("Aaa", "chicken")
	if st := m.states["Aaa"].Status; st != "stopping" {
		t.Fatalf("the third must stop it: %s", st)
	}
	if st := m.states["Zed"].Status; st != "stopping" {
		t.Errorf("the limit is a full shutdown, the others stop too: %s", st)
	}
	evs := m.recentEvents(10)
	if len(evs) == 0 || evs[0].Kind != "fatal" || evs[0].Bot != "Aaa" || !strings.Contains(evs[0].Detail, "Life Chicken (6/811)") {
		t.Errorf("the Activity list must say why: %+v", evs)
	}
	if len(m.states["Aaa"].setbacks) != 0 {
		t.Error("the count starts again after a stop")
	}
}

func TestALeaderThatKeepsDyingStopsEverybody(t *testing.T) {
	m := readinessManager(t)
	for i := 0; i < 3; i++ {
		m.noteSetback("Lead", "death")
	}
	for n, s := range m.states {
		if s.Status != "stopping" && s.Status != "running" { // the leader waits for the others (stopMany), so it may still show running
			t.Errorf("%s: %s", n, s.Status)
		}
	}
	if m.states["Aaa"].Status != "stopping" || m.states["Zed"].Status != "stopping" {
		t.Errorf("the followers must be stopping: Aaa %s, Zed %s", m.states["Aaa"].Status, m.states["Zed"].Status)
	}
}

func TestChickenLimitCanBeSwitchedOff(t *testing.T) {
	m := readinessManager(t)
	zero := 0
	m.cfg.ChickenLimit = &zero
	for i := 0; i < 10; i++ {
		m.noteSetback("Aaa", "chicken")
	}
	if m.states["Aaa"].Status != "running" {
		t.Error("limit 0 never stops a bot")
	}
}

func TestChickenLimitFromTheSettings(t *testing.T) {
	m := readinessManager(t)
	if l, w := m.readinessLimits(); l != 3 || w != 30*time.Minute {
		t.Errorf("default is 3 within 30 minutes, got %d within %v", l, w)
	}
	five, ten := 5, 10
	m.cfg.ChickenLimit, m.cfg.ChickenWindowMin = &five, &ten
	if l, w := m.readinessLimits(); l != 5 || w != 10*time.Minute {
		t.Errorf("settings: %d within %v", l, w)
	}
	for i := 0; i < 4; i++ {
		m.noteSetback("Aaa", "chicken")
	}
	if m.states["Aaa"].Status != "running" {
		t.Error("with the limit at 5, four chickens do not stop it")
	}
}

func TestEffectiveDefaults(t *testing.T) {
	var c Config
	e := c.Effective()
	if !e.AutoTown || !e.Gamble || !e.Banter || !e.ReportProblems || !e.WatchKills || !e.AutoEquip || !e.AutoStat || !e.AutoSkill || !e.TeleportTeam || !e.BanterBubble || !e.SaveOnStop || !e.Plugy || !e.Headless {
		t.Errorf("everything is on unless switched off (Quick Travel and the banter bubble included): %+v", e)
	}
	if e.QuestClearAll || e.SaveOnChicken {
		t.Error("Full Clear and the save before a chicken are off unless switched on")
	}
	no, yes := false, true
	c = Config{AutoTown: &no, TeleportTeam: &no, QuestClearAll: &yes}
	e = c.Effective()
	if e.AutoTown || e.TeleportTeam || !e.QuestClearAll || !e.Gamble {
		t.Errorf("explicit values win, the rest keep their default: %+v", e)
	}
	five := 5
	if intOr(nil, 7) != 7 || intOr(&five, 7) != 5 {
		t.Error("intOr")
	}
}
