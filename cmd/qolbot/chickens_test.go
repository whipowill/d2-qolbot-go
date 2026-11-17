package main

import (
	"testing"
	"time"
)

func TestChickenMemory(t *testing.T) {
	now := time.Now()
	list := []chickenEntry{
		{"Xena", now.Add(-10 * time.Minute)}, {"Xena", now.Add(-2 * time.Hour)}, {"Xena", now.Add(-4 * time.Hour)},
		{"Sankt", now.Add(-30 * time.Minute)}, {"Barabas", now.Add(-7 * time.Hour)},
	}
	if got := countChickens(list, "Xena", now); got != 2 {
		t.Errorf("Xena: the 4-hour-old chicken must not count: %d", got)
	}
	if got := countChickens(list, "Barabas", now); got != 0 {
		t.Errorf("Barabas: %d", got)
	}
	if got := len(pruneChickens(list, now)); got != 4 {
		t.Errorf("the 7-hour-old one is dropped, 4 are kept: %d", got)
	}
}

func TestChickensSurviveARestart(t *testing.T) {
	m := &Manager{root: t.TempDir(), cfg: Config{ScriptPath: "kolbot"}}
	m.noteChickenTime("Xena")
	m.noteChickenTime("Xena")
	m2 := &Manager{root: m.root, cfg: Config{ScriptPath: "kolbot"}}
	m2.loadChickens()
	if got := m2.chickenCounts([]string{"Xena", "Sankt"}); got["Xena"] != 2 || got["Sankt"] != 0 {
		t.Errorf("after a restart: %v", got)
	}
}
