package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The auto-equip lists are owned by this project: every rule line must be well formed, because a broken line is silently dropped
// by the pickit parser and the bot would just stop upgrading that slot.
func TestAutoequipListsAreWellFormed(t *testing.T) {
	dir := filepath.Join("..", "..", "d2bs", "kolbot", "pickit", "Autoequip")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Skip("no autoequip folder")
	}
	want := map[string]string{"caster.nip": "[tier] ==", "melee.nip": "[tier] ==", "merc.nip": "[merctier] =="}
	for _, e := range entries {
		key, ok := want[e.Name()]
		if !ok {
			t.Errorf("unexpected file in Autoequip: %s (only caster.nip, melee.nip and merc.nip are used)", e.Name())
			continue
		}
		b, _ := os.ReadFile(filepath.Join(dir, e.Name()))
		rules := 0
		for n, line := range strings.Split(strings.ReplaceAll(string(b), "\r", ""), "\n") {
			l := strings.TrimSpace(line)
			if l == "" || strings.HasPrefix(l, "//") {
				continue
			}
			rules++
			if !strings.Contains(l, "# # "+key) {
				t.Errorf("%s:%d does not end in a %s rule: %.80s", e.Name(), n+1, key, l)
			}
			if i := strings.Index(l, "# # "+key); i >= 0 {
				expr := l[i+len("# # "+key):]
				for _, bad := range []string{"#", "==", "[", "]", ";"} {
					if strings.Contains(expr, bad) {
						t.Errorf("%s:%d: the tier expression must not contain %q (the pickit parser splits on it): %.80s", e.Name(), n+1, bad, expr)
					}
				}
			}
			if strings.Count(l, "(") != strings.Count(l, ")") || strings.Count(l, "[") != strings.Count(l, "]") {
				t.Errorf("%s:%d has unbalanced brackets: %.80s", e.Name(), n+1, l)
			}
		}
		if rules == 0 {
			t.Errorf("%s has no rules", e.Name())
		}
	}
}

// Casters and attackers are ranked differently: the two lists must really differ in what they count.
func TestAutoequipCasterVersusMelee(t *testing.T) {
	dir := filepath.Join("..", "..", "d2bs", "kolbot", "pickit", "Autoequip")
	c, err1 := os.ReadFile(filepath.Join(dir, "caster.nip"))
	a, err2 := os.ReadFile(filepath.Join(dir, "melee.nip"))
	if err1 != nil || err2 != nil {
		t.Skip("no autoequip folder")
	}
	if !strings.Contains(string(c), "getStatEx(105)") || strings.Contains(string(c), "getStatEx(93)") {
		t.Error("casters count fast cast rate and ignore attack speed")
	}
	if !strings.Contains(string(a), "getStatEx(93)") || strings.Contains(string(a), "getStatEx(105)") {
		t.Error("attackers count attack speed and ignore fast cast rate")
	}
	for class, want := range map[string]string{"Sorceress": "caster", "Necromancer": "caster", "Druid": "caster", "Amazon": "melee", "Paladin": "melee", "Barbarian": "melee", "Assassin": "melee"} {
		if got := autoequipFile(class); got != "Autoequip/"+want+".nip" {
			t.Errorf("%s uses %s", class, got)
		}
	}
}
