package main

import (
	"strings"
	"testing"
)

func TestMagicEntryNIP(t *testing.T) {
	e := MagicEntry{Category: "helm", Rare: true, Crafted: true, Primary: []MagicStat{{Key: "classskills", Min: 2}, {Key: "skilltree", Min: 3}},
		Secondary: []MagicStat{{Key: "fcr", Min: 20}, {Key: "fhr", Min: 10}}}
	if err := e.validate(); err != nil {
		t.Fatal(err)
	}
	n := e.nip(false)
	for _, want := range []string{"[type] == helm", "[type] == primalhelm", "[type] == pelt", "([quality] == rare || [quality] == crafted) # ", "[itemallskills] >= 2", "[sorceressskills] >= 2",
		"[fireskilltab] >= 3", "(([fcr]) >= 20 || ([fhr]) >= 10)"} {
		if !strings.Contains(n, want) {
			t.Errorf("missing %q in %s", want, n)
		}
	}
	// two of three: every pair, joined with OR
	e = MagicEntry{Category: "belt", Magic: true, Secondary: []MagicStat{{Key: "fhr", Min: 10}, {Key: "str", Min: 15}, {Key: "life", Min: 30}}, SecondaryNeed: 2}
	n = e.nip(false)
	if strings.Count(n, " || ") != 2 || !strings.Contains(n, "(([fhr]) >= 10 && ([strength]) >= 15)") || !strings.Contains(n, "(([strength]) >= 15 && ([maxhp]) >= 30)") {
		t.Errorf("need 2 of 3 wrong: %s", n)
	}
	// all of the primary stats; sums
	e = MagicEntry{Category: "gloves", Rare: true, Primary: []MagicStat{{Key: "ias", Min: 20}, {Key: "strdex", Min: 25}}, PrimaryNeed: 2}
	if n = e.nip(false); !strings.Contains(n, "(([ias]) >= 20 && ([strength]+[dexterity]) >= 25)") {
		t.Errorf("all-of / sum wrong: %s", n)
	}
	// weapons spell out every weapon type; stats without a number
	e = MagicEntry{Category: "weapon", Rare: true, Primary: []MagicStat{{Key: "ed", Min: 250}}, Secondary: []MagicStat{{Key: "durability"}, {Key: "perlevel"}}}
	n = e.nip(false)
	for _, want := range []string{"[type] == axe", "[type] == orb", "[type] == assassinclaw", "[itemreplenishdurability] >= 1", "[itemtohitpercentperlevel] >= 1"} {
		if !strings.Contains(n, want) {
			t.Errorf("missing %q in %s", want, n)
		}
	}
}

func TestMagicEntryValidation(t *testing.T) {
	bad := []MagicEntry{
		{Category: "hat", Rare: true, Primary: []MagicStat{{Key: "fcr"}}},
		{Category: "helm", Primary: []MagicStat{{Key: "fcr"}}},                      // no quality
		{Category: "helm", Rare: true},                                              // no stat
		{Category: "helm", Rare: true, Primary: []MagicStat{{Key: "nonsense"}}},     // unknown code
		{Category: "helm", Rare: true, Primary: []MagicStat{{Key: "ed", Min: 200}}}, // damage on a helm
		{Category: "helm", Rare: true, Type: "axe", Primary: []MagicStat{{Key: "fcr"}}},
		{Category: "helm", Rare: true, Primary: []MagicStat{{Key: "fcr"}}, PrimaryNeed: 2},
		{Category: "helm", Rare: true, Primary: []MagicStat{{Key: "fcr"}, {Key: "fcr"}}},
		{Category: "charm", Type: "huge", Magic: true, Primary: []MagicStat{{Key: "res", Min: 5}}},
	}
	for i, e := range bad {
		if e.validate() == nil {
			t.Errorf("entry %d should be refused: %+v", i, e)
		}
	}
	seen := map[string]bool{}
	for _, e := range defaultMagic() {
		if err := e.validate(); err != nil {
			t.Errorf("starter entry %+v: %v", e, err)
		}
		seen[e.Category+"/"+e.Type] = true
	}
	for _, c := range magicCols {
		if !seen[c.Category+"/"+c.Type] {
			t.Errorf("no starter entry for column %s", c.Key)
		}
	}
}

func TestTrophyLines(t *testing.T) {
	m := pickitManager(t)
	if err := m.validateTrophy("// comment\n\n[name] == jeweledmonarch && [quality] == magic # [sockets] == 4 && [maxhp] >= 50\n"); err != nil {
		t.Error(err)
	}
	if err := m.validateTrophy("[type] == ring # [maxhp]*100 >= 30*[charlevel]"); err != nil {
		t.Error(err)
	}
	for _, bad := range []string{"[name == x", "[name] == x # ([fcr] >= 20", "[name] == x # [fcr] >= 20 # [ias] >= 10"} {
		if m.validateTrophy(bad) == nil {
			t.Errorf("%q should be refused", bad)
		}
	}
	r := PickitRules{Trophy: "// c\n[name] == x # [fcr] >= 20\n"}
	if !r.any() || !strings.Contains(generatePickitNIP(r), "[name] == x # [fcr] >= 20") {
		t.Error("typed lines must be written")
	}
	g := generatePickitNIP(PickitRules{MagicOn: false, Magic: defaultMagic()})
	if strings.Contains(g, "good magic") {
		t.Error("entries are not written while the master box is off")
	}
	if g = generatePickitNIP(PickitRules{MagicOn: true, Magic: defaultMagic()}); !strings.Contains(g, "good magic") || strings.Count(g, "\n[type]")+strings.Count(g, "\n(") < 5 {
		t.Error("entries must be written when the master box is on")
	}
}

func TestCharmSizes(t *testing.T) {
	small := MagicEntry{Category: "charm", Type: "small", Magic: true, Primary: []MagicStat{{Key: "res", Min: 12}}}
	grand := MagicEntry{Category: "charm", Type: "grand", Magic: true, Primary: []MagicStat{{Key: "res", Min: 40}}}
	for _, e := range []MagicEntry{small, grand} {
		if err := e.validate(); err != nil {
			t.Fatal(err)
		}
	}
	if n := small.nip(false); !strings.HasPrefix(n, "[name] == cm1 &&") || !strings.Contains(n, ">= 12") {
		t.Errorf("small: %s", n)
	}
	if n := grand.nip(false); !strings.HasPrefix(n, "[name] == cm3 &&") || !strings.Contains(n, ">= 40") {
		t.Errorf("grand: %s", n)
	}
}

func TestLenientAsksForTheCharacterLevel(t *testing.T) {
	e := MagicEntry{Category: "ring", Rare: true, Primary: []MagicStat{{Key: "fcr", Min: 10}, {Key: "sockets", Min: 2}, {Key: "classskills", Min: 2}}, Secondary: []MagicStat{{Key: "strdex", Min: 25}, {Key: "allres", Min: 5}}}
	n := e.nip(true)
	for _, want := range []string{"([fcr])*100 >= 10*[charlevel]", "([strength]+[dexterity])*100 >= 25*[charlevel]", "[fireresist]*100 >= 5*[charlevel]"} {
		if !strings.Contains(n, want) {
			t.Errorf("missing %q in %s", want, n)
		}
	}
	for _, want := range []string{"([sockets]) >= 2", "[itemallskills] >= 2"} { // counts are not scaled
		if !strings.Contains(n, want) {
			t.Errorf("a count stays fixed: missing %q in %s", want, n)
		}
	}
	if strings.Contains(e.nip(false), "[charlevel]") {
		t.Error("without leniency the numbers are plain")
	}
	if !strings.Contains(generatePickitNIP(PickitRules{MagicOn: true, Lenient: true, Magic: []MagicEntry{e}}), "lenient") {
		t.Error("the list says when it is lenient")
	}
}

func TestJewelsCheckbox(t *testing.T) {
	r := PickitRules{AllJewels: true}
	if !r.any() || !strings.Contains(generatePickitNIP(r), "[type] == jewel\n") {
		t.Error("the jewels box writes a jewel rule")
	}
}

func TestCircletsHaveTheirOwnColumn(t *testing.T) {
	c := MagicEntry{Category: "circlet", Rare: true, Primary: []MagicStat{{Key: "fcr", Min: 20}}}
	if n := c.nip(false); !strings.HasPrefix(n, "[type] == circlet &&") || strings.Contains(n, "[type] == helm") {
		t.Errorf("circlet: %s", n)
	}
	h := MagicEntry{Category: "helm", Rare: true, Primary: []MagicStat{{Key: "fcr", Min: 20}}}
	if n := h.nip(false); strings.Contains(n, "[type] == circlet") {
		t.Errorf("helms no longer include circlets: %s", n)
	}
	// a list saved before has only a helm entry: circlets start as a copy of it
	got := migrateMagic([]MagicEntry{h, {Category: "ring", Rare: true}})
	if len(got) != 3 || got[2].Category != "circlet" || len(got[2].Primary) != 1 {
		t.Fatalf("migration: %+v", got)
	}
	got[2].Primary[0].Min = 5
	if h.Primary[0].Min != 20 {
		t.Error("the copy must not share its stats with the helm entry")
	}
	if again := migrateMagic(got); len(again) != 3 {
		t.Errorf("a list that already has circlets is left alone: %+v", again)
	}
}
