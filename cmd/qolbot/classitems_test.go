package main

import (
	"strings"
	"testing"
)

func TestClassRuleNIP(t *testing.T) {
	c := ClassRule{Kind: "primalhelm", Skills: []MagicStat{{Key: "battleorders", Min: 3}, {Key: "shout", Min: 2}}}
	if err := c.validate(); err != nil {
		t.Fatal(err)
	}
	n := c.nip("exceptional")
	for _, want := range []string{"[type] == primalhelm", "([class] == exceptional || [class] == elite)", "([quality] == magic || [quality] == rare || [quality] == crafted)",
		"([skillbattleorders] >= 3 || [skillshout] >= 2)"} {
		if !strings.Contains(n, want) {
			t.Errorf("missing %q in %s", want, n)
		}
	}
	both := ClassRule{Kind: "orb", Need: 2, Skills: []MagicStat{{Key: "frozenorb", Min: 3}, {Key: "meteor", Min: 3}}}
	if n = both.nip("normal"); strings.Contains(n, "[class]") || !strings.Contains(n, "([skillfrozenorb] >= 3 && [skillmeteor] >= 3)") {
		t.Errorf("all of both, no class test at normal: %s", n)
	}
	if n = (ClassRule{Kind: "claws", Skills: []MagicStat{{Key: "lightningsentry", Min: 3}}}).nip(""); !strings.Contains(n, "[type] == assassinclaw") || !strings.Contains(n, "[type] == handtohand") {
		t.Errorf("claws cover both claw types: %s", n)
	}
}

func TestClassRuleValidation(t *testing.T) {
	bad := []ClassRule{
		{Kind: "sword", Skills: []MagicStat{{Key: "cold", Min: 3}}},
		{Kind: "orb", Skills: []MagicStat{{Key: "battleorders", Min: 3}}}, // a Barbarian skill on an orb
		{Kind: "orb", Skills: []MagicStat{{Key: "frozenorb", Min: 9}}},    // no item has +9 to a skill
		{Kind: "orb", Skills: []MagicStat{{Key: "frozenorb", Min: 3}, {Key: "frozenorb", Min: 2}}},
		{Kind: "orb", Need: 2, Skills: []MagicStat{{Key: "frozenorb", Min: 3}}},
	}
	for i, c := range bad {
		if c.validate() == nil {
			t.Errorf("rule %d should be refused: %+v", i, c)
		}
	}
	for _, c := range defaultClass() {
		if err := c.validate(); err != nil {
			t.Errorf("default %s: %v", c.Kind, err)
		}
	}
}

func TestClassRulesInTheList(t *testing.T) {
	r := PickitRules{ClassItems: true, Class: defaultClass()}
	if !r.any() {
		t.Error("class items count as a rule")
	}
	g := generatePickitNIP(r)
	if strings.Count(g, "[skill") < 10 || !strings.Contains(g, "[type] == pelt") || !strings.Contains(g, "[type] == auricshields") {
		t.Errorf("every kind is written:\n%s", g)
	}
	if strings.Contains(generatePickitNIP(PickitRules{Class: defaultClass()}), "desirable class items") {
		t.Error("nothing is written while the box is off")
	}
	if err := pickitManager(t).setPickitRules(PickitRules{ClassItems: true, ClassTier: "godly"}); err == nil {
		t.Error("an unknown class tier must be refused")
	}
}
