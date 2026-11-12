package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func pickitManager(t *testing.T) *Manager {
	root := t.TempDir()
	dir := filepath.Join(root, "d2bs", "kolbot", "pickit")
	os.MkdirAll(filepath.Join(dir, "QOL"), 0o755)
	os.MkdirAll(filepath.Join(dir, "Autoequip"), 0o755)
	os.WriteFile(filepath.Join(dir, "QOL", "Misc.nip"), []byte("[name] == gold\n[type] == ring"), 0o644)
	os.WriteFile(filepath.Join(dir, "QOL", "Potions.nip"), []byte("[name] == healingpotion\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "Autoequip", "melee.nip"), []byte("x\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "kolton.nip"), []byte("y\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "READ.txt"), []byte("not a list"), 0o644)
	os.MkdirAll(filepath.Join(root, "d2bs"), 0o755)
	os.WriteFile(filepath.Join(root, "d2bs", "d2bs.log"), []byte("[11/09/26 21:11:05] D2BS 304: \xffc4Loaded NIP: \xffc2Misc.nip\xffc4. Lines: \xffc22\xffc4. Valid entries: \xffc22/2\xffc4. Time: \xffc21 ms\n"), 0o644)
	return &Manager{root: root, cfgPath: filepath.Join(root, "q.json"), cfg: Config{ScriptPath: "kolbot"}, logSubs: map[chan LogLine]bool{}}
}

func TestListPickit(t *testing.T) {
	m := pickitManager(t)
	got := m.listPickit()
	if len(got) != 4 || got[0].Path != "Autoequip/melee.nip" || got[1].Path != "QOL/Misc.nip" || got[3].Path != "kolton.nip" {
		t.Fatalf("lists (Autoequip, QOL, the rest; only .nip): %+v", got)
	}
	if !got[0].Lead || !got[1].Lead || got[3].Lead {
		t.Errorf("defaults: the leader loads melee.nip and Misc.nip, not kolton.nip: %+v", got)
	}
	if got[1].Lines != 2 || got[1].Loaded != "2/2" {
		t.Errorf("lines and the bots' last report: %+v", got[1])
	}
}

func TestSetPickitAndFiles(t *testing.T) {
	m := pickitManager(t)
	if err := m.setPickit([]string{"QOL/Nope.nip"}); err == nil {
		t.Error("a list that does not exist must be refused")
	}
	if err := m.setPickit([]string{"../../etc/passwd.nip"}); err == nil {
		t.Error("a path leaving the pickit folder must be refused")
	}
	if err := m.setPickit([]string{"QOL/Misc.nip", "kolton.nip"}); err != nil {
		t.Fatal(err)
	}
	if sel := m.pickitSelection(); len(sel.Lead) != 2 {
		t.Errorf("selection %+v", sel)
	}
	if err := m.writePickitFile("QOL/Misc.nip", "[name] == rune\n"); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(m.pickitDir(), "QOL", "Misc.nip.bak")); string(b) != "[name] == gold\n[type] == ring" {
		t.Errorf("the old text must be kept as .bak: %q", b)
	}
	if text, _ := m.readPickitFile("QOL/Misc.nip"); text != "[name] == rune\n" {
		t.Errorf("saved text %q", text)
	}
	if err := m.writePickitFile("READ.txt", "x"); err == nil {
		t.Error("only .nip files may be written")
	}
}

func TestGeneratedPickitRules(t *testing.T) {
	m := pickitManager(t)
	alias, err := os.ReadFile(filepath.Join("..", "..", "d2bs", "kolbot", "libs", "NTItemAlias.dbl"))
	if err != nil {
		t.Skip("no alias file")
	}
	r := PickitRules{Unique: true, Set: true, RuneMin: "Pul", GemMin: "Flawless", Pandemonium: true, Rejuv: true}
	text := generatePickitNIP(r)
	for _, want := range []string{"[quality] == unique", "[quality] == set", "[name] == pulrune", "[name] == zodrune", "[name] == perfectskull", "[name] == flawlesstopaz", "[name] == keyofhate", "[name] == fullrejuvenationpotion"} {
		if !strings.Contains(text, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(text, "[name] == lemrune") || strings.Contains(text, "[name] == flawedruby") || strings.Contains(text, "[name] == ruby\n") {
		t.Error("runes and gems below the minimum must not be listed")
	}
	if !strings.Contains(generatePickitNIP(PickitRules{PerfectGems: true}), "[name] == perfectruby") {
		t.Error("the old perfect-gems setting must still work")
	}
	if !strings.Contains(generatePickitNIP(PickitRules{GemMin: "Normal"}), "[name] == ruby\n") {
		t.Error("Normal grade gems have no prefix")
	}
	for _, l := range strings.Split(text, "\n") { // every item name has to exist in the game data the pickit parser reads
		if strings.HasPrefix(l, "[name] == ") {
			if name := strings.TrimPrefix(l, "[name] == "); !strings.Contains(string(alias), name) {
				t.Errorf("%q is not an item name the keeper rules know", name)
			}
		}
	}
	if err := m.setPickitRules(PickitRules{RuneMin: "Banana"}); err == nil {
		t.Error("an unknown rune must be refused")
	}
	if err := m.setPickitRules(PickitRules{GemMin: "Shiny"}); err == nil {
		t.Error("an unknown gem grade must be refused")
	}
	if err := m.setPickitRules(r); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(m.pickitDir(), "Generated.nip")); !strings.Contains(string(b), "[quality] == unique") {
		t.Error("Generated.nip was not written")
	}
	if got := m.listPickit(); len(got) != 4 {
		t.Errorf("Generated.nip must not be listed as a list of its own: %+v", got)
	}
	if err := m.setPickitRules(PickitRules{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(m.pickitDir(), "Generated.nip")); err == nil {
		t.Error("with no rules the generated list must be removed")
	}
}

func TestBaseRules(t *testing.T) {
	root := filepath.Join("..", "..")
	m := &Manager{root: root, cfg: Config{ScriptPath: "kolbot"}}
	names := m.baseNames()
	for _, n := range []string{"archonplate", "duskshroud", "monarch"} {
		if !names[n] {
			t.Errorf("%s must be a known base", n)
		}
	}
	if names["ring"] || names["perfectruby"] || names["utp"] {
		t.Error("jewelry, gems and the three letter codes are not base names")
	}
	good := BaseRule{Name: "archonplate", Quality: "normal", Ethereal: "no", Sockets: "4"}
	if good.validate(names) != nil || good.nip() != "[name] == archonplate && [quality] == normal && [flag] != ethereal # [sockets] == 4" {
		t.Errorf("rule: %v %s", good.validate(names), good.nip())
	}
	if got := (BaseRule{Name: "monarch", Sockets: "3+"}).nip(); got != "[name] == monarch # [sockets] >= 3" {
		t.Errorf("at least: %s", got)
	}
	if got := (BaseRule{Name: "duskshroud"}).nip(); got != "[name] == duskshroud" {
		t.Errorf("any: %s", got)
	}
	for _, bad := range []BaseRule{{Name: "nonsense"}, {Name: "monarch", Quality: "unique"}, {Name: "monarch", Ethereal: "maybe"}, {Name: "monarch", Sockets: "9"}, {Name: "monarch", Sockets: "4++"}} {
		if bad.validate(names) == nil {
			t.Errorf("must be refused: %+v", bad)
		}
	}
}

func TestGenerateStatRules(t *testing.T) {
	m := pickitManager(t)
	text := m.generate(PickitRules{EthArmor: true, BasesOn: true, Bases: []BaseRule{{Name: "monarch", Sockets: "4"}}})
	for _, want := range []string{
		"[type] == armor && [flag] == ethereal && [quality] >= normal && [quality] <= superior && ([class] == exceptional || [class] == elite)",
		"[name] == monarch # [sockets] == 4"} {
		if !strings.Contains(text, want) {
			t.Errorf("missing %q in:\n%s", want, text)
		}
	}
	if g := m.generate(PickitRules{EthArmor: true}); strings.Contains(g, "skilltab") || strings.Contains(g, "magic") {
		t.Error("only the chosen rules are written")
	}
	if !(PickitRules{BasesOn: true, Bases: []BaseRule{{Name: "monarch"}}}).any() || (PickitRules{Bases: []BaseRule{{Name: "monarch"}}}).any() || (PickitRules{}).any() {
		t.Error("the new choices must count as rules")
	}
}

func TestDefaultBases(t *testing.T) {
	m := pickitManager(t)
	names := (&Manager{root: filepath.Join("..", ".."), cfg: Config{ScriptPath: "kolbot"}}).baseNames()
	if len(names) > 0 {
		for _, b := range defaultBases() {
			if err := b.validate(names); err != nil {
				t.Errorf("default base: %v", err)
			}
		}
	}
	real := &Manager{root: filepath.Join("..", ".."), cfg: Config{ScriptPath: "kolbot"}}
	if codes := real.codeNames(); len(codes) > 0 {
		for _, b := range defaultBases() {
			if codes[b.Code] != b.Name {
				t.Errorf("code %s is %q in the game data, not %q", b.Code, codes[b.Code], b.Name)
			}
		}
	}
	if len(m.pickitRules().Bases) != len(defaultBases()) {
		t.Error("a new setup starts with the starter list")
	}
	if err := m.setPickitRules(PickitRules{}); err != nil {
		t.Fatal(err)
	}
	if len(m.pickitRules().Bases) != 0 {
		t.Error("once saved, an empty list stays empty")
	}
}

func TestUniqueAndSetFilters(t *testing.T) {
	m := pickitManager(t)
	text := generatePickitNIP(PickitRules{Unique: true, UniqueBase: "exceptional", Set: true, SetBase: "elite"})
	for _, want := range []string{"[quality] == unique && ([class] == exceptional || [class] == elite)\n", "[quality] == set && [class] == elite\n"} {
		if !strings.Contains(text, want) {
			t.Errorf("missing %q in:\n%s", want, text)
		}
	}
	if plain := generatePickitNIP(PickitRules{Unique: true}); !strings.Contains(plain, "[quality] == unique\n") {
		t.Errorf("no filter, no clause: %s", plain)
	}
	if err := m.setPickitRules(PickitRules{Unique: true, UniqueBase: "godly"}); err == nil {
		t.Error("an unknown base tier must be refused")
	}
	if plain := generatePickitNIP(PickitRules{Unique: true, UniqueBase: "normal"}); !strings.Contains(plain, "[quality] == unique\n") {
		t.Errorf("Normal means any base: %s", plain)
	}
}

func TestBaseTierFilter(t *testing.T) {
	if got := withTier("[name] == monarch && [quality] == normal # [sockets] == 4", "elite"); got != "[name] == monarch && [quality] == normal && [class] == elite # [sockets] == 4" {
		t.Errorf("elite: %s", got)
	}
	if got := withTier("[name] == monarch", "exceptional"); got != "[name] == monarch && ([class] == exceptional || [class] == elite)" {
		t.Errorf("exceptional: %s", got)
	}
	if got := withTier("[name] == monarch", ""); got != "[name] == monarch" {
		t.Errorf("normal: %s", got)
	}
}

func TestNoOneSocket(t *testing.T) {
	r := PickitRules{EthArmor: true, BasesOn: true, Bases: []BaseRule{{Name: "monarch", Sockets: "4+"}, {Name: "cuirass"}}}
	text := generatePickitNIP(r)
	if !strings.Contains(text, "[class] == elite) # [sockets] != 1\n") {
		t.Errorf("ethereal armor rule: %s", text)
	}
	m := pickitManager(t)
	g := m.generate(r)
	if !strings.Contains(g, "[name] == monarch # [sockets] >= 4 && [sockets] != 1\n") || !strings.Contains(g, "[name] == cuirass # [sockets] != 1\n") {
		t.Errorf("rows: %s", g)
	}
	if !strings.Contains(m.generate(PickitRules{EthArmor: true}), "# [sockets] != 1") {
		t.Error("the rule is always on")
	}
}

func TestBaseCirclets(t *testing.T) {
	if !strings.Contains(generatePickitNIP(PickitRules{Circlets: true}), "[type] == circlet && [quality] == normal\n") || !(PickitRules{Circlets: true}).any() {
		t.Error("base circlets rule")
	}
}

func TestCircletQuality(t *testing.T) {
	if got := generatePickitNIP(PickitRules{Circlets: true, CircletMin: "elite"}); !strings.Contains(got, "[type] == circlet && [quality] == normal && [class] == elite\n") {
		t.Errorf("elite circlets: %s", got)
	}
	if err := pickitManager(t).setPickitRules(PickitRules{Circlets: true, CircletMin: "godly"}); err == nil {
		t.Error("an unknown tier must be refused")
	}
}

// The ethereal armor and helm rules take a base tier (exceptional unless chosen).
func TestEtherealBaseTier(t *testing.T) {
	m := pickitManager(t)
	text := m.generate(PickitRules{EthArmor: true, EthHelm: true})
	for _, want := range []string{"[type] == armor && [flag] == ethereal", "[type] == helm && [flag] == ethereal", "([class] == exceptional || [class] == elite)"} {
		if !strings.Contains(text, want) {
			t.Errorf("default tier should be exceptional or better, missing %q", want)
		}
	}
	text = m.generate(PickitRules{EthArmor: true, EthArmorTier: "elite", EthHelm: true, EthHelmTier: "normal"})
	if !strings.Contains(text, "[type] == armor && [flag] == ethereal") || !strings.Contains(text, " && [class] == elite") || !strings.Contains(text, "[type] == helm && [flag] == ethereal") {
		t.Errorf("chosen tiers missing:\n%s", text)
	}
	if strings.Contains(strings.Split(text, "[type] == helm")[1], "[class]") {
		t.Errorf("normal or better adds no class test:\n%s", text)
	}
	if err := m.setPickitRules(PickitRules{EthArmor: true, EthArmorTier: "godly"}); err == nil {
		t.Error("an unknown tier was accepted for the armor")
	}
	if err := m.setPickitRules(PickitRules{EthHelm: true, EthHelmTier: "godly"}); err == nil {
		t.Error("an unknown tier was accepted for the helm")
	}
	if err := m.setPickitRules(PickitRules{EthArmor: true, EthArmorTier: "elite", EthHelm: true, EthHelmTier: "normal"}); err != nil {
		t.Errorf("valid tiers rejected: %v", err)
	}
}
