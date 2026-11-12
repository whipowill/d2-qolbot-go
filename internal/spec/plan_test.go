package spec

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

const libsDir = "../../d2bs/kolbot/libs"

func TestEveryTemplateHasSkills(t *testing.T) {
	if _, err := os.Stat(libsDir); err != nil {
		t.Skip("no kolbot libs")
	}
	total := 0
	for c := range ClassNames {
		ts := LoadTemplates(libsDir, c)
		if len(ts) == 0 {
			t.Errorf("%s: no templates found", ClassNames[c])
		}
		for _, tp := range ts {
			total++
			if len(tp.Key) == 0 {
				t.Errorf("%s/%s: parsed no AutoSkill.Build entries", ClassNames[c], tp.Name)
			}
		}
		found := false
		for _, tp := range ts {
			found = found || tp.Name == DefaultTemplate[c]
		}
		if !found {
			t.Errorf("%s: default template %q does not exist", ClassNames[c], DefaultTemplate[c])
		}
	}
	t.Logf("%d templates parsed", total)
}

// Runs the planner on every real character (read-only) and logs the decision.
func TestDetectRealCharacters(t *testing.T) {
	dir := saveDir(t)
	files, _ := filepath.Glob(filepath.Join(dir, "*.d2s"))
	want := map[string]string{ // expectations we are sure of
		"Darius": "Zeal", // Zeal 3, Might 8, Sacrifice 1
	}
	for _, f := range files {
		s, err := ReadSave(f)
		if err != nil {
			t.Logf("%-10s skipped: %v", filepath.Base(f), err)
			continue
		}
		p := Detect(s, LoadTemplates(libsDir, s.Class))
		t.Logf("%-8s %-12s L%-2d pts=%-3d unspent(sk=%d st=%d) -> %-8s %-14s | %s",
			s.Name, p.Class, s.Level, s.Invested(), s.UnspentSkills, s.UnspentStats, p.Mode, p.Spec, p.Reason)
		if w, ok := want[s.Name]; ok && p.Spec != w {
			t.Errorf("%s: got spec %q, want %q", s.Name, p.Spec, w)
		}
	}
}

func TestFreshCharacterGetsDefault(t *testing.T) {
	for c := range ClassNames {
		s := &Save{Name: "X", Class: c, Level: 1, Skills: map[int]int{}}
		p := Detect(s, LoadTemplates(libsDir, c))
		if p.Mode != "fresh" || p.Spec != DefaultTemplate[c] {
			t.Errorf("%s: %+v", ClassNames[c], p)
		}
	}
}

// Every class has 30 skills, each in exactly one tree.
func TestTreesCoverEverySkillOnce(t *testing.T) {
	for c := range ClassNames {
		seen := map[int]int{}
		for tab := range trees[c] {
			for _, id := range trees[c][tab].Skills {
				seen[id]++
			}
		}
		for i := 0; i < 30; i++ {
			id := classSkillBase[c] + i
			if seen[id] != 1 {
				t.Errorf("%s: skill %d appears in %d trees", ClassNames[c], id, seen[id])
			}
		}
		if len(seen) != 30 {
			t.Errorf("%s: %d distinct skills in trees, want 30", ClassNames[c], len(seen))
		}
	}
}

var statEntry = regexp.MustCompile(`\[\s*"(\w+)"\s*,\s*("all"|\d+)\s*\]`)

// Structural checks on every template file (the game is the only real JS engine we have,
// so this catches the mistakes a generator or a hand edit can make before a bot loads it).
func TestTemplatesAreWellFormed(t *testing.T) {
	if _, err := os.Stat(libsDir); err != nil {
		t.Skip("no kolbot libs")
	}
	for c := range ClassNames {
		for _, tp := range LoadTemplates(libsDir, c) {
			b, err := os.ReadFile(filepath.Join(libsDir, tp.Path))
			if err != nil {
				t.Fatal(err)
			}
			src := string(b)
			name := ClassNames[c] + "/" + tp.Name
			// brackets balance
			for _, pair := range [][2]rune{{'{', '}'}, {'(', ')'}, {'[', ']'}} {
				depth := 0
				for _, r := range src {
					if r == pair[0] {
						depth++
					} else if r == pair[1] {
						depth--
					}
				}
				if depth != 0 {
					t.Errorf("%s: unbalanced %c%c (%d)", name, pair[0], pair[1], depth)
				}
			}
			if !strings.Contains(src, "function LoadTemplate()") {
				t.Errorf("%s: no LoadTemplate()", name)
			}
			if !strings.Contains(src, "Config.AutoSkill.Enabled = true;") {
				t.Errorf("%s: AutoSkill not enabled", name)
			}
			if len(tp.Key) == 0 {
				t.Errorf("%s: empty AutoSkill build", name)
			}
			for id, n := range tp.Key {
				if id < classSkillBase[c] || id >= classSkillBase[c]+30 || TreeOf(c, id) < 0 {
					t.Errorf("%s: skill %d is not a %s skill", name, id, ClassNames[c])
				}
				if n < 1 || n > 100 {
					t.Errorf("%s: skill %d count %d out of range", name, id, n)
				}
			}
			m := regexp.MustCompile(`(?s)Config\.AutoStat\.Build\s*=\s*\[(.*?)\n\s*\];`).FindStringSubmatch(src)
			if m == nil {
				t.Errorf("%s: no AutoStat.Build", name)
				continue
			}
			st := statEntry.FindAllStringSubmatch(m[1], -1)
			if len(st) == 0 || st[len(st)-1][2] != `"all"` {
				t.Errorf("%s: stat plan should end with an \"all\" entry", name)
			}
		}
	}
}

func TestForcedSpecOverridesDetection(t *testing.T) {
	s := &Save{Name: "X", Class: 3, Level: 5, Skills: map[int]int{}}
	p, ok := Forced(s, LoadTemplates(libsDir, 3), "hammerdin")
	if !ok || p.Spec != "Hammerdin" || p.Mode != "template" {
		t.Fatalf("%+v ok=%v", p, ok)
	}
	if _, ok := Forced(s, LoadTemplates(libsDir, 3), "nope"); ok {
		t.Error("unknown template should not match")
	}
}

func TestStorageDefaultsAndValidation(t *testing.T) {
	d := DefaultStorage()
	if d.Inventory != [2]int{10, 6} || d.Stash != [2]int{10, 10} || d.Cube != [2]int{3, 4} || !d.AddStashPages {
		t.Errorf("defaults changed: %+v", d)
	}
	if err := d.Validate(); err != nil {
		t.Errorf("defaults must be valid: %v", err)
	}
	for _, bad := range []Storage{
		{Inventory: [2]int{0, 6}, Stash: [2]int{10, 10}, Cube: [2]int{3, 4}},
		{Inventory: [2]int{10, 6}, Stash: [2]int{10, 31}, Cube: [2]int{3, 4}},
		{Inventory: [2]int{10, 6}, Stash: [2]int{10, 10}, Cube: [2]int{-1, 4}},
	} {
		if bad.Validate() == nil {
			t.Errorf("%+v should be rejected", bad)
		}
	}
}

// The plan file is what the in-game loader reads, so the key names must match AutoSpec.js exactly.
func TestPlanJSONCarriesStorageAndChat(t *testing.T) {
	p := Plan{Name: "X", Storage: DefaultStorage(), Banter: true, BanterBubble: true, Protect: DefaultProtect()}
	b, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]json.RawMessage
	json.Unmarshal(b, &m)
	for _, k := range []string{"storage", "banter", "banterBubble", "protect", "safeMode", "autoEquip", "autoStat", "autoSkill", "questClearAll", "watchKills", "autoSaveMinutes", "plugy", "autoTown"} {
		if _, ok := m[k]; !ok {
			t.Errorf("plan JSON has no %q key: %s", k, b)
		}
	}
	var st map[string]json.RawMessage
	json.Unmarshal(m["storage"], &st)
	for _, k := range []string{"inventory", "stash", "cube", "addStashPages"} {
		if _, ok := st[k]; !ok {
			t.Errorf("storage JSON has no %q key: %s", k, m["storage"])
		}
	}
}

func TestStorageDefaultsAndRules(t *testing.T) {
	d := DefaultStorage()
	if d.ClearOnLoad == nil || !*d.ClearOnLoad {
		t.Errorf("storage defaults: %+v", d)
	}
	// an older config that only has sizes must come out with working defaults
	old := Storage{Inventory: [2]int{10, 6}, Stash: [2]int{10, 10}, Cube: [2]int{3, 4}}.Normalize()
	if err := old.Validate(); err != nil || old.ClearOnLoad == nil || !*old.ClearOnLoad {
		t.Errorf("normalized old config: %+v err=%v", old, err)
	}
	bad := d
	bad.Inventory = [2]int{0, 6}
	if bad.Validate() == nil {
		t.Error("a zero-width inventory must be rejected")
	}
	f := false
	off := d
	off.ClearOnLoad = &f
	if off.Normalize().ClearOnLoad == nil || *off.Normalize().ClearOnLoad {
		t.Error("an explicit false for clearOnLoad must survive Normalize")
	}
}
