package main

import (
	"os"
	"strings"
	"path/filepath"
	"testing"
)

func row(h, sub, ver, act, diff, class string, skills ...string) map[string]string {
	r := map[string]string{"Hireling": h, "SubType": sub, "Version": ver, "Act": act, "Difficulty": diff, "Class": class}
	for i, s := range skills {
		r["Skill"+string(rune('1'+i))] = s
	}
	return r
}

// The QOL mod's shape: one aura per Act 2 kind in every difficulty, sub-types with the difficulty in them.
func TestParseHirelingQOL(t *testing.T) {
	ids := map[string]int{"fire arrow": 7, "cold arrow": 11, "blessed aim": 108, "meditation": 120, "prayer": 99, "might": 98, "jab": 10, "dodge": 13}
	rows := []map[string]string{
		row("Rogue Scout", "Fire - Normal", "100", "1", "1", "271", "Blessed Aim", "Fire Arrow", "Dodge"),
		row("Rogue Scout", "Ice - Normal", "100", "1", "1", "271", "Meditation", "Cold Arrow", "Dodge"),
		row("Rogue Scout", "Fire - Hell", "100", "1", "3", "271", "Blessed Aim", "Fire Arrow", "Dodge"),
		row("Desert Mercenary", "Comb-Normal", "100", "2", "1", "338", "Blessed Aim", "Jab"),
		row("Desert Mercenary", "Def-Normal", "100", "2", "1", "338", "Prayer", "Jab"),
		row("Desert Mercenary", "Def-Nightmare", "100", "2", "2", "338", "Prayer", "Jab"),
		row("Desert Mercenary", "Off-Normal", "100", "2", "1", "338", "Might", "Jab"),
		row("Barbarian", "1hs-Normal", "100", "5", "1", "561", "Might"),
		row("Barbarian", "1hs-Normal", "100", "5", "1", "560", "Might"),
		row("Rogue Scout", "Fire - Normal", "0", "1", "1", "271", "Fire Arrow"), // classic row: ignored
	}
	k := parseHireling(rows, ids)
	want := map[string][3]int{"a1-fire": {108, 0, 108}, "a1-ice": {120, 0, 0}, "a2-comb": {108, 0, 0}, "a2-def": {99, 99, 0}, "a2-off": {98, 0, 0}, "a5-1hs": {}}
	if len(k) != len(want) {
		t.Fatalf("kinds %+v", k)
	}
	for _, x := range k {
		if w, ok := want[x.ID]; !ok || w != x.Tell {
			t.Errorf("%s tell %v, want %v", x.ID, x.Tell, w)
		}
	}
	if k[len(k)-1].ID != "a5-1hs" || len(k[len(k)-1].Classids) != 2 {
		t.Errorf("barbarian %+v", k[len(k)-1])
	}
	if k[3].Label != "Act 2 Desert Mercenary: Def (Prayer, Jab)" {
		t.Errorf("label %q", k[3].Label)
	}
}

// No Hireling.txt: the 1.13d table; qol.ini counts only with "Using QOL?" on.
func TestMercTableVanillaAndQolIni(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "qol.ini"), []byte("[mercenary]\r\n; x\r\nequip=1\r\ndrop_items=1\r\n"), 0o644)
	m := &Manager{cfg: Config{GameDir: dir}}
	mt := m.mercTable()
	if len(mt.Kinds) != len(vanillaMercs) || mt.QolEquip {
		t.Fatalf("vanilla table %+v", mt)
	}
	if e, d := qolMercIni(dir); !e || !d {
		t.Errorf("qol.ini equip %v drop %v", e, d)
	}
}

// The user's own game, when QOLBOT_GAMEDIR points at it (read only): prints the kinds.
func TestMercTableRealGame(t *testing.T) {
	dir := os.Getenv("QOLBOT_GAMEDIR")
	if dir == "" {
		t.Skip("QOLBOT_GAMEDIR not set")
	}
	m := &Manager{cfg: Config{GameDir: dir}}
	mt := m.mercTable()
	t.Logf("source: %s", mt.Source)
	for _, k := range mt.Kinds {
		t.Logf("%-10s %v %v %s", k.ID, k.Classids, k.Tell, k.Label)
	}
	for k, v := range mt.Candidates {
		t.Logf("hire roll %s: %v", k, v)
	}
}

// The rows a hire list entry is rolled among: the first row of the act and difficulty, then only rows of its Level.
func TestHireCandidates(t *testing.T) {
	r := func(sub, act, diff, lvl string) map[string]string {
		return map[string]string{"SubType": sub, "Version": "100", "Act": act, "Difficulty": diff, "Level": lvl}
	}
	rows := []map[string]string{
		r("Fire - Normal", "1", "1", "3"), r("Fire - Normal", "1", "1", "25"), r("Ice - Normal", "1", "1", "3"), r("Ice - Normal", "1", "1", "25"),
		r("Fire - Hell", "1", "3", "60"), r("Ice - Hell", "1", "3", "60"),
		{"SubType": "Fire - Normal", "Version": "0", "Act": "1", "Difficulty": "1", "Level": "3"}, // classic: not a candidate
	}
	c := hireCandidates(rows)
	if got := strings.Join(c["1-0"], ","); got != "a1-fire,a1-ice" {
		t.Errorf("Normal %q", got)
	}
	if got := strings.Join(c["1-2"], ","); got != "a1-fire,a1-ice" {
		t.Errorf("Hell %q", got)
	}
}

// The built-in vanilla table must be what the reader makes of the stock 1.13 Hireling.txt and Skills.txt. QOLBOT_STOCKDIR=<a folder with
// Data/global/excel/Hireling.txt and Skills.txt of the stock game>; the files are Blizzard's and not in this repo.
func TestVanillaMercsMatchStock(t *testing.T) {
	dir := os.Getenv("QOLBOT_STOCKDIR")
	if dir == "" {
		t.Skip("QOLBOT_STOCKDIR not set")
	}
	mt := (&Manager{cfg: Config{GameDir: dir}}).mercTable()
	if len(mt.Kinds) != len(vanillaMercs) {
		t.Fatalf("%d kinds, built-in %d", len(mt.Kinds), len(vanillaMercs))
	}
	for i, k := range mt.Kinds {
		v := vanillaMercs[i]
		if k.ID != v.ID || k.Tell != v.Tell || k.Act != v.Act {
			t.Errorf("stock %s %v, built-in %s %v", k.ID, k.Tell, v.ID, v.Tell)
		}
	}
	vc := vanillaCandidates()
	for key, c := range mt.Candidates {
		if strings.Join(c, ",") != strings.Join(vc[key], ",") {
			t.Errorf("%s: stock %v, built-in %v", key, c, vc[key])
		}
	}
}
