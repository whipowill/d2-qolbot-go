package main

import "testing"

func TestKeeperDefaultsAreTheAuthorsChoices(t *testing.T) {
	m := &Manager{}
	r := m.pickitRules()
	if !r.Unique || !r.Set || r.RuneMin != "Hel" || r.GemMin != "Flawless" || !r.Pandemonium || !r.Rejuv {
		t.Errorf("simple choices: %+v", r)
	}
	if len(r.Bases) == 0 || len(r.Magic) == 0 || len(r.Class) == 0 || !r.any() {
		t.Errorf("an unset qolbot.json gives the default rules, with their lists: bases %d, magic %d, class %d", len(r.Bases), len(r.Magic), len(r.Class))
	}
	if len(defaultKeeperLead()) != 9 || defaultKeeperLead()[0] != "Autoequip/merc.nip" {
		t.Errorf("default lists: %v", defaultKeeperLead())
	}
	r.Bases[0].Nickname = "changed"
	if m.pickitRules().Bases[0].Nickname == "changed" {
		t.Error("the defaults must be handed out as copies")
	}
	own := PickitRules{Unique: true}
	m.cfg.PickitRules = &own
	if m.pickitRules().Set {
		t.Error("a qolbot.json that sets its own rules keeps them")
	}
}
