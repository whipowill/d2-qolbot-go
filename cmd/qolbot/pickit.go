package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// The Pickit tab: which .nip item lists a bot loads. Followers and the leader bot (the one that farms when you are not
// playing) have a list each; a list is a file under d2bs/<scriptPath>/pickit/, named the way Config.PickitFiles names it
// ("QOL/Misc.nip").

type PickitSel struct {
	Follow []string `json:"follow,omitempty"` // no longer used: only the leader bot picks things up
	Lead   []string `json:"lead"`
}

// PickitRules are the simple choices on the Pickit tab. They are turned into one generated list (Generated.nip) that the
// leader bot loads next to the lists it has checked.
type PickitRules struct {
	Unique       bool         `json:"unique"`               // every unique item (see UniqueBase)
	UniqueBase   string       `json:"uniqueBase,omitempty"` // base tier or better: "" or "normal" (any), "exceptional" or "elite"
	Set          bool         `json:"set"`                  // every set item
	SetBase      string       `json:"setBase,omitempty"`
	RuneMin      string       `json:"runeMin"`                // this rune and every higher one ("" = no runes)
	GemMin       string       `json:"gemMin"`                 // this grade of gem and every higher one ("" = no gems)
	PerfectGems  bool         `json:"perfectGems,omitempty"`  // old setting, same as gemMin Perfect
	Pandemonium  bool         `json:"pandemonium"`            // keys, organs, the token and the essences
	Rejuv        bool         `json:"rejuv"`                  // rejuvenation potions
	CircletMin   string       `json:"circletMin,omitempty"`   // base tier or better for the circlets: "" or "normal", "exceptional" (coronet and up) or "elite" (tiara and diadem)
	Circlets     bool         `json:"circlets"`               // every plain (normal quality) circlet, coronet, tiara and diadem: raw material for Charsi's imbue
	EthHelm      bool         `json:"ethHelm"`                // every ethereal helm of the base tier below or better
	EthHelmTier  string       `json:"ethHelmTier,omitempty"`  // that base tier: "normal", "exceptional" (default) or "elite"
	EthArmor     bool         `json:"ethArmor"`               // every ethereal body armor of the base tier below or better (merc material)
	EthArmorTier string       `json:"ethArmorTier,omitempty"` // that base tier: "normal", "exceptional" (default) or "elite"
	MagicOn      bool         `json:"magicOn"`                // pick up the magic, rare and crafted entries below
	Magic        []MagicEntry `json:"magic,omitempty"`        // Magic & Rares: entries per item type, each a primary and a secondary pool of stats
	Trophy       string       `json:"trophy,omitempty"`       // Magic & Rares: trophy items, typed in as raw pickit lines
	ClassItems   bool         `json:"classItems"`             // pick up the desirable class items below
	ClassTier    string       `json:"classTier,omitempty"`    // their base tier or better: "normal", "exceptional" (default) or "elite"
	Class        []ClassRule  `json:"class,omitempty"`        // per kind of class item: the skill trees that make it worth keeping
	Lenient      bool         `json:"lenient"`                // a low-level character accepts lower numbers: it asks for its level in percent of each minimum
	MagicV       int          `json:"magicV,omitempty"`       // 2 = the entries use the column layout and stat codes (older ones are replaced by the starter list)
	AllJewels    bool         `json:"allJewels"`              // every jewel
	BasesOn      bool         `json:"basesOn"`                // pick up the base items below
	Bases        []BaseRule   `json:"bases,omitempty"`        // base items to pick up, one rule each
	BaseMin      string       `json:"baseMin,omitempty"`      // base tier or better for the base items below: "" or "normal", "exceptional" or "elite"
	BasesSeeded  bool         `json:"basesSeeded,omitempty"`  // the list has been saved once: stop offering the starter list
}

// runeNames in order, lowest to highest.
var runeNames = []string{"El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul", "Amn", "Sol", "Shael", "Dol", "Hel", "Io", "Lum", "Ko", "Fal", "Lem", "Pul", "Um", "Mal", "Ist", "Gul", "Vex", "Ohm", "Lo", "Sur", "Ber", "Jah", "Cham", "Zod"}

const generatedNIP = "Generated.nip"

// customPickitLists switches the hand-made .nip lists (and their half of the Pickit tab) on or off. Off for now, to see how far the
// simple choices alone get: the leader then loads only the lists it cannot do without (the auto-equip tiers, potions and quest
// items) plus the generated one.
const customPickitLists = false

// autoequipFile is the gear-ranking list for a class: casters (Sorceress, Necromancer, Druid) value skills and cast rate, the rest
// value attack speed, leech and damage. See the headers of the two files.
func autoequipFile(class string) string {
	switch class {
	case "Sorceress", "Necromancer", "Druid":
		return "Autoequip/caster.nip"
	}
	return "Autoequip/melee.nip"
}

// baselinePickit is what every bot loads: the gear ranking for its class, the mercenary's ranking, potions and quest items.
func baselinePickit(class string) []string {
	return []string{autoequipFile(class), "Autoequip/merc.nip", "QOL/Potions.nip", "QOL/Quest.nip"}
}

// leaderLists is what the leader bot loads, before the generated list.
func (m *Manager) leaderLists(class string) []string {
	if !customPickitLists {
		return baselinePickit(class)
	}
	return append([]string{}, m.pickitSelection().Lead...)
}

// generate is generatePickitNIP plus the base items chosen on the Pickit tab.
func (m *Manager) generate(r PickitRules) string {
	var b strings.Builder
	b.WriteString(generatePickitNIP(r))
	if r.BasesOn && len(r.Bases) > 0 {
		b.WriteString("\n// base items chosen on the Keeper tab\n")
		for _, x := range r.Bases {
			b.WriteString(r.noOne(withTier(x.nip(), r.BaseMin)) + "\n")
		}
	}
	return b.String()
}

// generatePickitNIP writes the rules as NIP lines (one per line, the syntax the rest of the lists use).
func generatePickitNIP(r PickitRules) string {
	var b strings.Builder
	b.WriteString("// Generated by Qolbot from the Keeper tab. Do not edit: your changes are overwritten every time the rules are saved.\n")
	if r.Unique {
		b.WriteString(qualityRule("unique", r.UniqueBase))
	}
	if r.Set {
		b.WriteString(qualityRule("set", r.SetBase))
	}
	if r.RuneMin != "" {
		on := false
		for _, n := range runeNames {
			on = on || n == r.RuneMin
			if on {
				b.WriteString("[name] == " + strings.ToLower(n) + "rune\n")
			}
		}
	}
	if g := r.gemMin(); g != "" {
		on := false
		for _, grade := range gemGrades {
			on = on || grade.Name == g
			if on {
				for _, kind := range gemKinds {
					b.WriteString("[name] == " + grade.Prefix + kind + "\n")
				}
			}
		}
	}
	if r.Pandemonium {
		for _, n := range []string{"keyofterror", "keyofhate", "keyofdestruction", "diablo'shorn", "mephisto'sbrain", "baal'seye", "tokenofabsolution",
			"twistedessenceofsuffering", "chargedessenceofhatred", "burningessenceofterror", "festeringessenceofdestruction"} {
			b.WriteString("[name] == " + n + "\n")
		}
	}
	if r.Rejuv {
		b.WriteString("[name] == rejuvenationpotion\n[name] == fullrejuvenationpotion\n")
	}
	b.WriteString(statRules(r))
	return b.String()
}

// gemMin is the lowest gem grade wanted ("Perfect" for the old yes/no setting).
func (r PickitRules) gemMin() string {
	if r.GemMin == "" && r.PerfectGems {
		return "Perfect"
	}
	return r.GemMin
}

var gemGrades = []struct{ Name, Prefix string }{{"Chipped", "chipped"}, {"Flawed", "flawed"}, {"Normal", ""}, {"Flawless", "flawless"}, {"Perfect", "perfect"}}
var gemKinds = []string{"amethyst", "topaz", "sapphire", "emerald", "ruby", "diamond", "skull"}

func (r PickitRules) any() bool {
	return r.Unique || r.Set || r.RuneMin != "" || r.gemMin() != "" || r.Pandemonium || r.Rejuv || r.EthArmor || r.EthHelm || r.Circlets || r.AllJewels || r.ClassItems || (r.MagicOn && len(r.Magic) > 0) || len(trophyLines(r.Trophy)) > 0 || (r.BasesOn && len(r.Bases) > 0)
}

// BaseRule is one desirable base item: a name (as the game data names it, "archonplate"), and optionally its quality, whether it
// is ethereal and its sockets ("4" = exactly four, "4+" = at least four). Empty means "any".
type BaseRule struct {
	Nickname string `json:"nickname,omitempty"` // your own label for the row ("thresher")
	Code     string `json:"code,omitempty"`     // the item code ("7s8"); Name is worked out from it
	Name     string `json:"name"`
	Quality  string `json:"quality"`  // "", "normal" or "superior"
	Ethereal string `json:"ethereal"` // "", "yes" or "no"
	Sockets  string `json:"sockets"`  // "", "0".."6" or "0+".."6+"
}

var reSockets = regexp.MustCompile(`^[0-6]\+?$`)

func (b BaseRule) validate(names map[string]bool) error {
	if !names[b.Name] {
		if b.Code != "" {
			return fmt.Errorf("%q is not an item code of a weapon, armor, shield or helm", b.Code)
		}
		return fmt.Errorf("%q is not a base item the keeper rules know", b.Name)
	}
	if b.Quality != "" && b.Quality != "normal" && b.Quality != "superior" {
		return fmt.Errorf("%q is not a quality for a base (normal or superior)", b.Quality)
	}
	if b.Ethereal != "" && b.Ethereal != "yes" && b.Ethereal != "no" {
		return fmt.Errorf("%q is not an ethereal choice (yes, no or empty)", b.Ethereal)
	}
	if b.Sockets != "" && !reSockets.MatchString(b.Sockets) {
		return fmt.Errorf("%q is not a socket count (0 to 6, or 0+ to 6+)", b.Sockets)
	}
	return nil
}

// nip is the rule as one line of NIP.
func (b BaseRule) nip() string {
	l := "[name] == " + b.Name
	if b.Quality != "" {
		l += " && [quality] == " + b.Quality
	}
	switch b.Ethereal {
	case "yes":
		l += " && [flag] == ethereal"
	case "no":
		l += " && [flag] != ethereal"
	}
	if b.Sockets != "" {
		if strings.HasSuffix(b.Sockets, "+") {
			l += " # [sockets] >= " + strings.TrimSuffix(b.Sockets, "+")
		} else {
			l += " # [sockets] == " + b.Sockets
		}
	}
	return l
}

var reAliasClass = regexp.MustCompile(`NTIPAliasClassID\["([^"]+)"\] = (\d+);`)

// baseNames returns the names of the base items (weapons, armor, shields, helms ...) in the game data, for choosing from and for checking.
func (m *Manager) baseNames() map[string]bool {
	out := map[string]bool{}
	b, err := os.ReadFile(filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "libs", "NTItemAlias.dbl"))
	if err != nil {
		return out
	}
	longest := map[int]string{}
	for _, mm := range reAliasClass.FindAllStringSubmatch(string(b), -1) {
		id, _ := strconv.Atoi(mm[2])
		if id < 513 && len(mm[1]) > len(longest[id]) { // below 513 are the weapons, armor, shields, helms ...; each has a three letter code and a name
			longest[id] = mm[1]
		}
	}
	for _, n := range longest {
		out[n] = true
	}
	return out
}

// pickitRules returns the saved rules (none by default).
func (m *Manager) pickitRules() PickitRules {
	if m.cfg.PickitRules != nil {
		r := *m.cfg.PickitRules
		if !r.BasesSeeded && len(r.Bases) == 0 {
			r.Bases = defaultBases()
			r.BasesOn = true
		}
		if r.MagicV < 2 { // the starter entries are offered switched off: nothing is picked up until the master box is checked
			r.Magic = defaultMagic()
		}
		if len(r.Class) == 0 {
			r.Class = defaultClass()
		}
		r.Magic = migrateMagic(r.Magic)
		r.Bases = append([]BaseRule{}, r.Bases...)
		m.resolveBases(r.Bases)
		return r
	}
	return PickitRules{Bases: defaultBases(), Magic: defaultMagic(), Class: defaultClass()}
}

// pickitDefaults is what the "Reset to defaults" buttons on the Magic & Rares and Base Items pages put back.
func (m *Manager) pickitDefaults() map[string]any {
	bases := defaultBases()
	m.resolveBases(bases)
	return map[string]any{"magic": defaultMagic(), "bases": bases, "class": defaultClass()}
}

// writeGeneratedNIP keeps pickit/Generated.nip in step with the rules.
func (m *Manager) writeGeneratedNIP() {
	r := m.pickitRules()
	path := filepath.Join(m.pickitDir(), generatedNIP)
	if !r.any() {
		os.Remove(path)
		return
	}
	os.MkdirAll(m.pickitDir(), 0o755)
	os.WriteFile(path, []byte(m.generate(r)), 0o644)
}

// setPickitRules saves the simple rules and regenerates their list.
func (m *Manager) setPickitRules(r PickitRules) error {
	if r.RuneMin != "" {
		ok := false
		for _, n := range runeNames {
			ok = ok || n == r.RuneMin
		}
		if !ok {
			return fmt.Errorf("%q is not a rune", r.RuneMin)
		}
	}
	if r.GemMin != "" {
		ok := false
		for _, g := range gemGrades {
			ok = ok || g.Name == r.GemMin
		}
		if !ok {
			return fmt.Errorf("%q is not a gem grade", r.GemMin)
		}
	}
	m.resolveBases(r.Bases)
	names := m.baseNames()
	for _, b := range r.Bases {
		if err := b.validate(names); err != nil {
			return err
		}
	}
	r.PerfectGems = false
	for _, b := range []string{r.UniqueBase, r.SetBase, r.BaseMin, r.CircletMin, r.EthArmorTier, r.EthHelmTier, r.ClassTier} {
		if b != "" && b != "normal" && b != "exceptional" && b != "elite" {
			return fmt.Errorf("%q is not a base tier (normal, exceptional or elite)", b)
		}
	}
	for _, c := range r.Class {
		if err := c.validate(); err != nil {
			return err
		}
	}
	r.Magic = migrateMagic(r.Magic)
	for _, e := range r.Magic {
		if err := e.validate(); err != nil {
			return err
		}
	}
	if err := m.validateTrophy(r.Trophy); err != nil {
		return err
	}
	r.MagicV = 2
	r.BasesSeeded = true
	m.mu.Lock()
	m.cfg.PickitRules = &r
	m.mu.Unlock()
	m.writeGeneratedNIP()
	m.logf(0, "", "keeper rules saved (the leader bot loads %s the next time it starts)", generatedNIP)
	return m.saveConfig()
}

var (
	defaultPickitLead = []string{"Autoequip/melee.nip", "Autoequip/merc.nip", "QOL/Potions.nip", "QOL/Quest.nip", "QOL/Misc.nip", "QOL/Jewelry.nip",
		"QOL/Rares.nip", "QOL/Ladder.nip", "QOL/Bases.nip", "QOL/Custom.nip"}
	reLoadedNIP = regexp.MustCompile(`Loaded NIP: (\S+?)\. Lines: (\d+)\. Valid entries: (\d+)/(\d+)`)
)

func (m *Manager) pickitDir() string {
	return filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "pickit")
}

// pickitSelection returns the configured lists, or the defaults.
func (m *Manager) pickitSelection() PickitSel {
	sel := PickitSel{Lead: defaultPickitLead}
	if m.cfg.Pickit != nil {
		sel.Lead = m.cfg.Pickit.Lead
	}
	return sel
}

type pickitList struct {
	Path   string `json:"path"`
	Lines  int    `json:"lines"`
	Lead   bool   `json:"lead"`
	Loaded string `json:"loaded,omitempty"` // "valid/total" from the bots' last "Loaded NIP" line
}

// listPickit finds every .nip file and marks where it is used.
func (m *Manager) listPickit() []pickitList {
	m.mu.Lock()
	sel := m.pickitSelection()
	m.mu.Unlock()
	in := func(l []string, p string) bool {
		for _, x := range l {
			if x == p {
				return true
			}
		}
		return false
	}
	loaded := m.loadedNIPs()
	var out []pickitList
	root := m.pickitDir()
	filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(strings.ToLower(d.Name()), ".nip") || d.Name() == generatedNIP {
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		n := 0
		if b, err := os.ReadFile(p); err == nil {
			n = strings.Count(string(b), "\n")
			if len(b) > 0 && !strings.HasSuffix(string(b), "\n") {
				n++
			}
		}
		out = append(out, pickitList{Path: rel, Lines: n, Lead: in(sel.Lead, rel), Loaded: loaded[filepath.Base(rel)]})
		return nil
	})
	rank := func(p string) int {
		switch {
		case strings.HasPrefix(p, "Autoequip/"):
			return 0
		case strings.HasPrefix(p, "QOL/"):
			return 1
		}
		return 2
	}
	sort.Slice(out, func(i, j int) bool {
		if ri, rj := rank(out[i].Path), rank(out[j].Path); ri != rj {
			return ri < rj
		}
		return out[i].Path < out[j].Path
	})
	return out
}

// loadedNIPs reads the newest "Loaded NIP" line per list from the tail of d2bs/d2bs.log.
func (m *Manager) loadedNIPs() map[string]string {
	res := map[string]string{}
	f, err := os.Open(filepath.Join(m.root, "d2bs", "d2bs.log"))
	if err != nil {
		return res
	}
	defer f.Close()
	fi, _ := f.Stat()
	size := int64(2 << 20)
	if fi != nil && fi.Size() < size {
		size = fi.Size()
	}
	buf := make([]byte, size)
	if fi != nil {
		f.ReadAt(buf, fi.Size()-size)
	}
	for _, l := range strings.Split(string(buf), "\n") {
		if _, text, ok := parseD2BSLine(l); ok {
			if mm := reLoadedNIP.FindStringSubmatch(text); mm != nil {
				if _, err := strconv.Atoi(mm[3]); err == nil {
					res[mm[1]] = mm[3] + "/" + mm[4]
				}
			}
		}
	}
	return res
}

// pickitPath resolves a list name to a file inside the pickit folder, or fails.
func (m *Manager) pickitPath(rel string) (string, error) {
	rel = filepath.ToSlash(rel)
	if rel == "" || strings.Contains(rel, "..") || strings.HasPrefix(rel, "/") || !strings.HasSuffix(strings.ToLower(rel), ".nip") {
		return "", fmt.Errorf("%q is not a keeper list", rel)
	}
	return filepath.Join(m.pickitDir(), filepath.FromSlash(rel)), nil
}

// setPickit saves which lists followers and the leader bot load.
func (m *Manager) setPickit(lead []string) error {
	for _, l := range [][]string{lead} {
		for _, p := range l {
			full, err := m.pickitPath(p)
			if err != nil {
				return err
			}
			if _, err := os.Stat(full); err != nil {
				return fmt.Errorf("%s does not exist", p)
			}
		}
	}
	m.mu.Lock()
	m.cfg.Pickit = &PickitSel{Lead: lead}
	m.mu.Unlock()
	m.logf(0, "", "keeper lists saved: %d for the leader (it uses them the next time it starts)", len(lead))
	return m.saveConfig()
}

func (m *Manager) readPickitFile(rel string) (string, error) {
	full, err := m.pickitPath(rel)
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(full)
	return string(b), err
}

// writePickitFile saves an edited list. The old text is kept next to it as <name>.nip.bak.
func (m *Manager) writePickitFile(rel, text string) error {
	full, err := m.pickitPath(rel)
	if err != nil {
		return err
	}
	if len(text) > 1<<20 {
		return fmt.Errorf("that list is too large")
	}
	if old, err := os.ReadFile(full); err == nil {
		os.WriteFile(full+".bak", old, 0o644)
	}
	if err := os.WriteFile(full, []byte(text), 0o644); err != nil {
		return err
	}
	m.logf(0, "", "keeper list %s saved (%d bytes; the old text is in %s.bak)", rel, len(text), filepath.Base(full))
	return nil
}

func (m *Manager) baseNamesSorted() []string {
	var out []string
	for n := range m.baseNames() {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

// qualityRule is the rule line for "every unique/set item" from a base tier or better. The item level of a drop is no help (in
// Hell nearly everything drops at 80+), but the base tier separates an Arctic Binding from a Harlequin Crest.
func qualityRule(quality, base string) string {
	l := "[quality] == " + quality
	switch base {
	case "exceptional":
		l += " && ([class] == exceptional || [class] == elite)"
	case "elite":
		l += " && [class] == elite"
	}
	return l + "\n"
}

var skillTabs = []string{"barbcombat", "bowandcrossbow", "cold", "curses", "defensiveauras", "druidsummoning", "elemental", "fire", "javelinandspear", "lightning",
	"martialarts", "masteries", "necromancersummoning", "offensiveauras", "palicombat", "passiveandmagic", "poisonandbone", "shadowdisciplines", "shapeshifting", "traps", "warcries"}

// statRules are the choices that are about what is ON an item (resists, skills, speeds), written as NIP for Generated.nip.
func statRules(r PickitRules) string {
	var b strings.Builder
	line := func(s string) { b.WriteString(s + "\n") }
	if r.EthArmor {
		line(r.noOne(withTier("[type] == armor && [flag] == ethereal && [quality] >= normal && [quality] <= superior", tierOr(r.EthArmorTier))))
	}
	if r.Circlets {
		line(withTier("[type] == circlet && [quality] == normal", r.CircletMin))
	}
	if r.EthHelm {
		line(r.noOne(withTier("[type] == helm && [flag] == ethereal && [quality] >= normal && [quality] <= superior", tierOr(r.EthHelmTier))))
	}
	if r.AllJewels {
		line("[type] == jewel")
	}
	b.WriteString(classRules(r))
	b.WriteString(magicRules(r))
	return b.String()
}

// defaultBases is the starting list of desirable bases: the plain (white) items the author's loot filter keeps visible at filter
// level 1 and up: light armors, good shields, good polearms, swords and axes. Ethereal exceptional armor has its own checkbox.
func defaultBases() []BaseRule {
	var out []BaseRule
	// every base is listed in all three forms (normal, exceptional, elite), grouped by kind and then by family; the tier is in the nickname
	for _, b := range [][3]string{
		{"brs", "breastplate", "Breast Plate (Normal)"},
		{"xrs", "cuirass", "Cuirass (Exceptional)"},
		{"urs", "greathauberk", "Great Hauberk (Elite)"},
		{"ltp", "lightplate", "Light Plate (Normal)"},
		{"xtp", "mageplate", "Mage Plate (Exceptional)"},
		{"utp", "archonplate", "Archon Plate (Elite)"},
		{"uui", "duskshroud", "Dusk Shroud (Elite)"},
		{"stu", "studdedleather", "Studded Leather (Normal)"},
		{"xtu", "trellisedarmor", "Trellised Armor (Exceptional)"},
		{"utu", "wirefleece", "Wire Fleece (Elite)"},
		{"bhm", "bonehelm", "Bone Helm (Normal)"},
		{"xh9", "grimhelm", "Grim Helm (Exceptional)"},
		{"uh9", "bonevisage", "Bone Visage (Elite)"},
		{"bsh", "boneshield", "Bone Shield (Normal)"},
		{"xsh", "grimshield", "Grim Shield (Exceptional)"},
		{"ush", "trollnest", "Troll Nest (Elite)"},
		{"kit", "kiteshield", "Kite Shield (Normal)"},
		{"xit", "dragonshield", "Dragon Shield (Exceptional)"},
		{"uit", "monarch", "Monarch (Elite)"},
		{"wax", "waraxe", "War Axe (Normal)"},
		{"9wa", "naga", "Naga (Exceptional)"},
		{"7wa", "berserkeraxe", "Berserker Axe (Elite)"},
		{"crs", "crystalsword", "Crystal Sword (Normal)"},
		{"9cr", "dimensionalblade", "Dimensional Blade (Exceptional)"},
		{"7cr", "phaseblade", "Phase Blade (Elite)"},
		{"flb", "flamberge", "Flamberge (Normal)"},
		{"9fb", "zweihander", "Zweihander (Exceptional)"},
		{"7fb", "colossussword", "Colossal Sword (Elite)"},
		{"gsd", "greatsword", "Great Sword (Normal)"},
		{"9gd", "executionersword", "Executioner Sword (Exceptional)"},
		{"7gd", "colossusblade", "Colossus Blade (Elite)"},
		{"2hs", "twohandedsword", "Two-Handed Sword (Normal)"},
		{"92h", "espandon", "Espadon (Exceptional)"},
		{"72h", "legendsword", "Legend Sword (Elite)"},
		{"hal", "halberd", "Halberd (Normal)"},
		{"9h9", "becdecorbin", "Bec-de-Corbin (Exceptional)"},
		{"7h7", "greatpoleaxe", "Great Poleaxe (Elite)"},
		{"pax", "poleaxe", "Poleaxe (Normal)"},
		{"9pa", "partizan", "Partizan (Exceptional)"},
		{"7pa", "crypticaxe", "Cryptic Axe (Elite)"},
		{"scy", "scythe", "Scythe (Normal)"},
		{"9s8", "battlescythe", "Battle Scythe (Exceptional)"},
		{"7s8", "thresher", "Thresher (Elite)"},
		{"wsc", "warscythe", "War Scythe (Normal)"},
		{"9wc", "grimscythe", "Grim Scythe (Exceptional)"},
		{"7wc", "giantthresher", "Giant Thresher (Elite)"},
		{"pik", "pike", "Pike (Normal)"},
		{"9p9", "lance", "Lance (Exceptional)"},
		{"7p7", "warpike", "War Pike (Elite)"},
		{"fla", "flail", "Flail (Normal)"},
		{"9fl", "knout", "Knout (Exceptional)"},
		{"7fl", "scourge", "Scourge (Elite)"},
		{"cbw", "compositebow", "Composite Bow (Normal)"},
		{"8cb", "doublebow", "Double Bow (Exceptional)"},
		{"6cb", "greatbow", "Great Bow (Elite)"},
		{"lwb", "longwarbow", "Long War Bow (Normal)"},
		{"8lw", "gothicbow", "Gothic Bow (Exceptional)"},
		{"6lw", "hydrabow", "Hydra Bow (Elite)"},
	} {
		out = append(out, BaseRule{Code: b[0], Name: b[1], Nickname: b[2], Quality: "normal"})
	}
	return out
}

// codeNames maps the item codes ("utp") to the base names the pickit uses ("archonplate"), from the game data.
func (m *Manager) codeNames() map[string]string {
	out := map[string]string{}
	b, err := os.ReadFile(filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "libs", "NTItemAlias.dbl"))
	if err != nil {
		return out
	}
	byID := map[int][]string{}
	for _, mm := range reAliasClass.FindAllStringSubmatch(string(b), -1) {
		id, _ := strconv.Atoi(mm[2])
		if id < 513 {
			byID[id] = append(byID[id], mm[1])
		}
	}
	for _, keys := range byID {
		name, code := "", ""
		for _, k := range keys {
			if len(k) == 3 {
				code = k
			} else if len(k) > len(name) {
				name = k
			}
		}
		if name == "" {
			name = code
		}
		if code != "" {
			out[code] = name
		}
	}
	return out
}

// resolveBases fills in Name from Code (and Code from Name, for rows saved before codes existed).
func (m *Manager) resolveBases(rows []BaseRule) {
	codes := m.codeNames()
	byName := map[string]string{}
	for c, n := range codes {
		byName[n] = c
	}
	for i := range rows {
		b := &rows[i]
		b.Code = strings.ToLower(strings.TrimSpace(b.Code))
		if n, ok := codes[b.Code]; ok {
			b.Name = n
		} else if b.Code == "" {
			b.Code = byName[b.Name]
		}
	}
}

// tierOr is the base tier a rule names ("normal", "exceptional" or "elite"), exceptional when none was chosen.
func tierOr(t string) string {
	if t == "" {
		return "exceptional"
	}
	return t
}

// withTier narrows a base rule to a base tier or better (the rule's own "#" part, if any, is kept at the end).
func withTier(rule, base string) string {
	clause := ""
	switch base {
	case "exceptional":
		clause = " && ([class] == exceptional || [class] == elite)"
	case "elite":
		clause = " && [class] == elite"
	}
	if clause == "" {
		return rule
	}
	if i := strings.Index(rule, " # "); i >= 0 {
		return rule[:i] + clause + rule[i:]
	}
	return rule + clause
}

// noOne adds "not exactly one socket" to a base item rule always (a one-socket base is no use for most runewords).
func (r PickitRules) noOne(rule string) string {
	if strings.Contains(rule, " # ") {
		return rule + " && [sockets] != 1"
	}
	return rule + " # [sockets] != 1"
}
