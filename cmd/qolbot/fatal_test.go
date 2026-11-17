package main

import (
	"strings"
	"testing"
	"time"
)

func TestFatalFromLog(t *testing.T) {
	kind, title, msg, ok := fatalFromLog("Barabas", "TownChicken: problem: I am out of town portal scrolls and I cannot pay for any (35 gold). Carrying on without them.")
	if !ok || kind != "noscrolls" || title == "" || !strings.Contains(msg, "Barabas") {
		t.Errorf("no scrolls and no gold must be fatal: %q %q %q %v", kind, title, msg, ok)
	}
	// leaving the game to restock is NOT fatal: the bot can pay
	if _, _, _, ok := fatalFromLog("Barabas", "TownChicken: problem: I am out of town portal scrolls. Leaving the game to restock in town."); ok {
		t.Error("restocking is not fatal")
	}
	if _, _, _, ok := fatalFromLog("Barabas", "Quester: quest skipped: Den of Evil (already complete)"); ok {
		t.Error("an ordinary line is not fatal")
	}
}

func TestRaiseFatalOnce(t *testing.T) {
	m := &Manager{states: map[string]*State{}}
	m.fatal = &fatalState{Kind: "noscrolls"}
	m.fatal.At = time.Now()
	if m.raiseFatal("noscrolls", "Xena", "again", "x") || m.fatal.Title == "again" { // the same kind within two minutes: ignored
		t.Error("a repeated fatal event must not replace the first")
	}
	m.clearFatal()
	if m.fatalLocked() != nil {
		t.Error("clearFatal must clear")
	}
}

func TestFatalStashFull(t *testing.T) {
	kind, title, msg, ok := fatalFromLog("Barabas", "Stash is full: no room for Grand Charm of Life and no page can be added (PlugY allows one page): stopping.")
	if !ok || kind != "stashfull" || title == "" || !strings.Contains(msg, "Barabas") || !strings.Contains(msg, "Grand Charm of Life") {
		t.Errorf("stash full: %q %q %q %v", kind, title, msg, ok)
	}
	if _, _, _, ok := fatalFromLog("Barabas", "Stashed Chain Gloves"); ok {
		t.Error("an ordinary stash line is not fatal")
	}
}
