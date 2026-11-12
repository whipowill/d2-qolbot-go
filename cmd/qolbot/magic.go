package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// The Magic & Rares section of the Keeper tab: one entry per column (an item type, or one charm size). An entry keeps an item when it
// is of that type and quality, has at least PrimaryNeed of its primary stats and at least SecondaryNeed of its secondary stats. Each stat
// is a short code and a minimum ("ias 20"). Anything else is typed in by hand as raw NIP lines (the Anything Else box).

// MagicStat is one stat in a pool: its code and its minimum value (ignored for stats that have none).
type MagicStat struct {
	Key string `json:"key"`
	Min int    `json:"min,omitempty"`
}

// MagicEntry is what to keep for one item type.
type MagicEntry struct {
	Category      string      `json:"category"`       // key from magicCats
	Type          string      `json:"type,omitempty"` // charms: one size (small, large, grand)
	Magic         bool        `json:"magic"`          // blue items qualify
	Rare          bool        `json:"rare"`           // yellow items qualify
	Crafted       bool        `json:"crafted"`        // orange items qualify
	Primary       []MagicStat `json:"primary,omitempty"`
	PrimaryNeed   int         `json:"primaryNeed,omitempty"` // how many of the primary stats are needed (default 1)
	Secondary     []MagicStat `json:"secondary,omitempty"`
	SecondaryNeed int         `json:"secondaryNeed,omitempty"` // how many of the secondary stats are needed (default 1)
}

type magicCat struct {
	Key, Label string
	nip        string // the NIP test for the item type; items are matched by their exact type, so groups are spelled out
}

func typeAny(types ...string) string {
	var p []string
	for _, t := range types {
		p = append(p, "[type] == "+t)
	}
	return "(" + strings.Join(p, " || ") + ")"
}

// charmSizes are the three charm sizes by their item code, so a small charm can want different numbers than a grand one.
var charmSizes = []struct{ Key, Label, Code string }{{"small", "Small Charms", "cm1"}, {"large", "Large Charms", "cm2"}, {"grand", "Grand Charms", "cm3"}}

var anyWeapon = typeAny("axe", "mace", "sword", "hammer", "knife", "polearm", "spear", "amazonspear", "scepter", "club", "wand", "staff", "bow", "crossbow",
	"throwingknife", "throwingaxe", "javelin", "amazonjavelin", "orb", "assassinclaw", "handtohand")

var magicCats = []magicCat{
	{"weapon", "Weapons", anyWeapon},
	{"shield", "Shields", typeAny("shield", "voodooheads", "auricshields")},
	{"armor", "Body Armor", "[type] == armor"},
	{"circlet", "Circlets", "[type] == circlet"},
	{"helm", "Helms", typeAny("helm", "primalhelm", "pelt")},
	{"gloves", "Gloves", "[type] == gloves"},
	{"boots", "Boots", "[type] == boots"},
	{"belt", "Belts", "[type] == belt"},
	{"ring", "Rings", "[type] == ring"},
	{"amulet", "Amulets", "[type] == amulet"},
	{"charm", "Charms", "([name] == cm1 || [name] == cm2 || [name] == cm3)"},
	{"jewel", "Jewels", "[type] == jewel"},
}

// magicCol is one column of the page: an item type, or one charm size.
type magicCol struct{ Key, Label, Category, Type, Group string }

// magicGroups are the buttons on the page; each opens the columns that belong to it.
var magicGroups = []struct{ Key, Label string }{{"armor", "Armor"}, {"weapons", "Weapons"}, {"jewelry", "Jewelry"}, {"accessories", "Accessories"}, {"charms", "Charms"}}

var magicCols = []magicCol{
	{"circlet", "Circlets", "circlet", "", "armor"}, {"helm", "Helms", "helm", "", "armor"}, {"armor", "Body Armor", "armor", "", "armor"},
	{"gloves", "Gloves", "gloves", "", "accessories"}, {"boots", "Boots", "boots", "", "accessories"}, {"belt", "Belts", "belt", "", "accessories"},
	{"weapon", "Weapons", "weapon", "", "weapons"}, {"shield", "Shields", "shield", "", "weapons"},
	{"ring", "Rings", "ring", "", "jewelry"}, {"amulet", "Amulets", "amulet", "", "jewelry"}, {"jewel", "Jewels", "jewel", "", "jewelry"},
	{"charm-small", "Small Charms", "charm", "small", "charms"}, {"charm-large", "Large Charms", "charm", "large", "charms"}, {"charm-grand", "Grand Charms", "charm", "grand", "charms"},
}

func findMagicCat(key string) *magicCat {
	for i := range magicCats {
		if magicCats[i].Key == key {
			return &magicCats[i]
		}
	}
	return nil
}

type magicStat struct {
	Key, Label string
	Def        int      // the minimum offered first (0 = the stat has no number)
	Unit       string   // "%" or ""
	Only       []string // categories that offer it (nil = all)
	Expr       string   // the stat (or sum of stats) as a NIP expression; compared with >= the minimum
	Fixed      bool     // a count or limit that is never scaled down for a low-level character
	special    func(min int, lenient bool) string
}

// clause is the NIP test for this stat at this minimum. With lenient on, a character's level decides how much of the minimum it asks for:
// level 10 asks for 10% of it (at least a point of the stat), level 99 for all of it. [charlevel] is read by the pickit parser.
func (s magicStat) clause(min int, lenient bool) string {
	if s.special != nil {
		return s.special(min, lenient)
	}
	if lenient && !s.Fixed && min > 0 {
		return fmt.Sprintf("(%s)*100 >= %d*[charlevel]", s.Expr, min)
	}
	return fmt.Sprintf("(%s) >= %d", s.Expr, min)
}

func classSkills(n int, _ bool) string {
	var any []string
	any = append(any, fmt.Sprintf("[itemallskills] >= %d", n))
	for _, c := range []string{"amazon", "sorceress", "necromancer", "paladin", "barbarian", "druid", "assassin"} {
		any = append(any, fmt.Sprintf("[%sskills] >= %d", c, n))
	}
	return "(" + strings.Join(any, " || ") + ")"
}

func skillTree(n int, _ bool) string {
	var any []string
	for _, t := range skillTabs {
		any = append(any, fmt.Sprintf("[%sskilltab] >= %d", t, n))
	}
	return "(" + strings.Join(any, " || ") + ")"
}

// magicStats is the catalog of stats the pools pick from (the page gets it from /api/pickit, so there is one list). Key is the code typed on the page.
var magicStats = []magicStat{
	{Key: "classskills", Label: "+ to a class's skills (or all skills)", Def: 2, Fixed: true, special: classSkills},
	{Key: "skilltree", Label: "+ to a skill tree", Def: 3, Fixed: true, special: skillTree},
	{Key: "fcr", Label: "Faster cast rate", Def: 20, Unit: "%", Expr: "[fcr]"},
	{Key: "ias", Label: "Increased attack speed", Def: 20, Unit: "%", Expr: "[ias]"},
	{Key: "frw", Label: "Faster run/walk", Def: 30, Unit: "%", Expr: "[frw]"},
	{Key: "fhr", Label: "Faster hit recovery", Def: 10, Unit: "%", Expr: "[fhr]"},
	{Key: "fbr", Label: "Faster block rate", Def: 30, Unit: "%", Only: []string{"shield"}, Expr: "[fbr]"},
	{Key: "block", Label: "Chance to block", Def: 20, Unit: "%", Only: []string{"shield"}, Expr: "[toblock]"},
	{Key: "res", Label: "Total of the four resists", Def: 60, Expr: "[fireresist]+[lightresist]+[coldresist]+[poisonresist]"},
	{Key: "res3", Label: "Fire + cold + lightning resist", Def: 60, Expr: "[fireresist]+[lightresist]+[coldresist]"},
	{Key: "allres", Label: "Every resist at least", Def: 5, special: func(n int, lenient bool) string {
		var t []string
		for _, r := range []string{"fireresist", "coldresist", "lightresist", "poisonresist"} {
			if lenient {
				t = append(t, fmt.Sprintf("[%s]*100 >= %d*[charlevel]", r, n))
			} else {
				t = append(t, fmt.Sprintf("[%s] >= %d", r, n))
			}
		}
		return "(" + strings.Join(t, " && ") + ")"
	}},
	{Key: "fire", Label: "Fire resist", Def: 30, Expr: "[fireresist]"},
	{Key: "cold", Label: "Cold resist", Def: 30, Expr: "[coldresist]"},
	{Key: "light", Label: "Lightning resist", Def: 30, Expr: "[lightresist]"},
	{Key: "poison", Label: "Poison resist", Def: 30, Expr: "[poisonresist]"},
	{Key: "life", Label: "Life", Def: 40, Expr: "[maxhp]"},
	{Key: "mana", Label: "Mana", Def: 60, Expr: "[maxmana]"},
	{Key: "str", Label: "Strength", Def: 15, Expr: "[strength]"},
	{Key: "dex", Label: "Dexterity", Def: 15, Expr: "[dexterity]"},
	{Key: "strdex", Label: "Strength + dexterity", Def: 25, Expr: "[strength]+[dexterity]"},
	{Key: "vit", Label: "Vitality", Def: 15, Expr: "[vitality]"},
	{Key: "energy", Label: "Energy", Def: 15, Expr: "[energy]"},
	{Key: "leech", Label: "Life stolen per hit", Def: 5, Unit: "%", Expr: "[lifeleech]"},
	{Key: "manaleech", Label: "Mana stolen per hit", Def: 5, Unit: "%", Expr: "[manaleech]"},
	{Key: "leechsum", Label: "Life steal + mana steal", Def: 10, Unit: "%", Expr: "[lifeleech]+[manaleech]"},
	{Key: "hpregen", Label: "Replenish life", Def: 5, Expr: "[hpregen]"},
	{Key: "manarec", Label: "Regenerate mana", Def: 10, Unit: "%", Expr: "[manarecoverybonus]"},
	{Key: "mf", Label: "Better chance of magic items", Def: 25, Unit: "%", Expr: "[itemmagicbonus]"},
	{Key: "gold", Label: "Extra gold from monsters", Def: 50, Unit: "%", Expr: "[itemgoldbonus]"},
	{Key: "ar", Label: "Attack rating", Def: 75, Expr: "[attackrate]"},
	{Key: "ed", Label: "Enhanced damage", Def: 200, Unit: "%", Only: []string{"weapon", "jewel"}, Expr: "[enhanceddamage]"},
	{Key: "edef", Label: "Enhanced defense", Def: 150, Unit: "%", Only: []string{"armor", "helm", "circlet", "gloves", "boots", "belt", "shield"}, Expr: "[enhanceddefense]"},
	{Key: "crush", Label: "Crushing blow", Def: 8, Unit: "%", Only: []string{"weapon", "gloves"}, Expr: "[itemcrushingblow]"},
	{Key: "perlevel", Label: "Attack rating or damage per character level", Fixed: true, special: func(int, bool) string {
		return "([itemtohitpercentperlevel] >= 1 || [itemtohitperlevel] >= 1 || [itemmaxdamageperlevel] >= 1)"
	}},
	{Key: "sockets", Label: "Sockets", Def: 2, Fixed: true, Expr: "[sockets]"},
	{Key: "durability", Label: "Repairs itself (+1 durability)", Fixed: true, special: func(int, bool) string { return "[itemreplenishdurability] >= 1" }},
	{Key: "reqlevel", Label: "Required level at most", Def: 30, Fixed: true, special: func(n int, _ bool) string { return fmt.Sprintf("[itemlevelreq] <= %d", n) }},
}

func findMagicStat(key string) *magicStat {
	for i := range magicStats {
		if magicStats[i].Key == key {
			return &magicStats[i]
		}
	}
	return nil
}

func (s magicStat) offeredIn(cat string) bool {
	if s.Only == nil {
		return true
	}
	for _, c := range s.Only {
		if c == cat {
			return true
		}
	}
	return false
}

// validate rejects an entry the generator could not turn into NIP.
func (e MagicEntry) validate() error {
	cat := findMagicCat(e.Category)
	if cat == nil {
		return fmt.Errorf("%q is not an item type", e.Category)
	}
	if e.Type != "" {
		ok := false
		if e.Category == "charm" {
			for _, c := range charmSizes {
				ok = ok || c.Key == e.Type
			}
		}
		if !ok {
			return fmt.Errorf("%q is not a kind of %s", e.Type, strings.ToLower(cat.Label))
		}
	}
	if !e.Magic && !e.Rare && !e.Crafted {
		return fmt.Errorf("an entry needs at least one quality (magic, rare or crafted)")
	}
	if len(e.Primary) == 0 && len(e.Secondary) == 0 {
		return fmt.Errorf("an entry needs at least one stat")
	}
	for _, pool := range []struct {
		name  string
		stats []MagicStat
		need  int
	}{{"primary", e.Primary, e.PrimaryNeed}, {"secondary", e.Secondary, e.SecondaryNeed}} {
		seen := map[string]bool{}
		for _, s := range pool.stats {
			def := findMagicStat(s.Key)
			if def == nil || !def.offeredIn(e.Category) {
				return fmt.Errorf("%q is not a stat code for %s", s.Key, strings.ToLower(cat.Label))
			}
			if seen[s.Key] {
				return fmt.Errorf("%q is in the %s stats twice", s.Key, pool.name)
			}
			seen[s.Key] = true
			if def.Def > 0 && (s.Min < 0 || s.Min > 2000) {
				return fmt.Errorf("%d is not a sensible minimum for %s", s.Min, def.Label)
			}
		}
		if len(pool.stats) > 0 && (pool.need < 0 || pool.need > len(pool.stats)) {
			return fmt.Errorf("the %s stats need %d of only %d", pool.name, pool.need, len(pool.stats))
		}
		if len(pool.stats) > 8 {
			return fmt.Errorf("at most 8 %s stats", pool.name)
		}
	}
	return nil
}

// poolClause is "at least need of these": OR for 1, AND for all, every combination in between.
func poolClause(stats []MagicStat, need int, lenient bool) string {
	if len(stats) == 0 {
		return ""
	}
	if need <= 0 {
		need = 1
	}
	terms := make([]string, 0, len(stats))
	for _, s := range stats {
		def := findMagicStat(s.Key)
		min := s.Min
		if min == 0 {
			min = def.Def
		}
		terms = append(terms, def.clause(min, lenient))
	}
	if need >= len(terms) {
		return "(" + strings.Join(terms, " && ") + ")"
	}
	if need == 1 {
		return "(" + strings.Join(terms, " || ") + ")"
	}
	var combos []string
	var pick func(start int, chosen []string)
	pick = func(start int, chosen []string) {
		if len(chosen) == need {
			combos = append(combos, "("+strings.Join(chosen, " && ")+")")
			return
		}
		for i := start; i < len(terms); i++ {
			pick(i+1, append(append([]string{}, chosen...), terms[i]))
		}
	}
	pick(0, nil)
	return "(" + strings.Join(combos, " || ") + ")"
}

// nip is the entry as one NIP line.
func (e MagicEntry) nip(lenient bool) string {
	test := findMagicCat(e.Category).nip
	if e.Category == "charm" {
		for _, c := range charmSizes {
			if c.Key == e.Type {
				test = "[name] == " + c.Code
			}
		}
	}
	var q []string
	for _, p := range []struct {
		on   bool
		name string
	}{{e.Magic, "magic"}, {e.Rare, "rare"}, {e.Crafted, "crafted"}} {
		if p.on {
			q = append(q, "[quality] == "+p.name)
		}
	}
	var need []string
	for _, c := range []string{poolClause(e.Primary, e.PrimaryNeed, lenient), poolClause(e.Secondary, e.SecondaryNeed, lenient)} {
		if c != "" {
			need = append(need, c)
		}
	}
	return test + " && (" + strings.Join(q, " || ") + ") # " + strings.Join(need, " && ")
}

// magicRules writes every entry, then the typed lines, as NIP.
func magicRules(r PickitRules) string {
	var b strings.Builder
	if r.MagicOn && len(r.Magic) > 0 {
		b.WriteString("// good magic, rare and crafted gear chosen on the Keeper tab (Magic & Rares)\n")
		if r.Lenient {
			b.WriteString("// lenient: a character asks for its level in percent of each minimum ([charlevel])\n")
		}
		for _, e := range r.Magic {
			b.WriteString(e.nip(r.Lenient) + "\n")
		}
	}
	if t := trophyLines(r.Trophy); len(t) > 0 {
		b.WriteString("// anything else, typed in on the Keeper tab\n")
		for _, l := range t {
			b.WriteString(l + "\n")
		}
	}
	return b.String()
}

// trophyLines are the usable lines of the trophy text: blanks and // comments are dropped.
func trophyLines(text string) []string {
	var out []string
	for _, l := range strings.Split(strings.ReplaceAll(text, "\r", ""), "\n") {
		l = strings.TrimSpace(l)
		if l != "" && !strings.HasPrefix(l, "//") {
			out = append(out, l)
		}
	}
	return out
}

var (
	reNipAlias   = regexp.MustCompile(`NTIPAlias(?:Stat|Type|Class|Quality|Flag|Color)\["(\w+)"\]`)
	reNipBracket = regexp.MustCompile(`\[(\w+)\]`)
	nipNames     map[string]bool
	nipNamesOnce sync.Once
	nipPropsFor  = []string{"type", "name", "class", "quality", "flag", "level", "color", "prefix", "suffix", "europe", "classid", "wsm", "distance", "charlevel"}
)

// knownNIPNames reads the property names the pickit parser understands from NTItemAlias.dbl (nil if the file cannot be read).
func (m *Manager) knownNIPNames() map[string]bool {
	nipNamesOnce.Do(func() {
		b, err := os.ReadFile(filepath.Join(m.libsDir(), "NTItemAlias.dbl"))
		if err != nil {
			return
		}
		nipNames = map[string]bool{}
		for _, x := range reNipAlias.FindAllStringSubmatch(string(b), -1) {
			nipNames[x[1]] = true
		}
		for _, p := range nipPropsFor {
			nipNames[p] = true
		}
	})
	return nipNames
}

// validateTrophy checks the typed NIP lines well enough to catch typos before the bots load them: brackets and parentheses match,
// and every [name] is something the pickit parser knows. It returns the first problem with its line number.
func (m *Manager) validateTrophy(text string) error {
	if len(text) > 64<<10 {
		return fmt.Errorf("the trophy lines are too long (64 KB at most)")
	}
	names := m.knownNIPNames()
	for i, l := range strings.Split(strings.ReplaceAll(text, "\r", ""), "\n") {
		l = strings.TrimSpace(l)
		if l == "" || strings.HasPrefix(l, "//") {
			continue
		}
		paren, brack := 0, 0
		for _, c := range l {
			switch c {
			case '(':
				paren++
			case ')':
				paren--
			case '[':
				brack++
			case ']':
				brack--
			}
			if paren < 0 || brack < 0 || brack > 1 {
				return fmt.Errorf("trophy line %d: brackets do not match", i+1)
			}
		}
		if paren != 0 || brack != 0 {
			return fmt.Errorf("trophy line %d: brackets do not match", i+1)
		}
		if strings.Count(l, "#") > 1 {
			return fmt.Errorf("trophy line %d: only one # is allowed (it separates the item from its stats)", i+1)
		}
		if names != nil {
			for _, x := range reNipBracket.FindAllStringSubmatch(l, -1) {
				if _, num := parseSmallInt(x[1]); num { // [225]-style stat numbers are fine
					continue
				}
				if !names[x[1]] {
					return fmt.Errorf("trophy line %d: [%s] is not a property the pickit knows", i+1, x[1])
				}
			}
		}
	}
	return nil
}

func parseSmallInt(s string) (int, bool) {
	n := 0
	if s == "" {
		return 0, false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, false
		}
		n = n*10 + int(c-'0')
	}
	return n, true
}

// magicCatalog is what the page needs to draw the columns and offer stat codes.
func magicCatalog() map[string]any {
	var cols, stats, groups []map[string]any
	for _, c := range magicCols {
		cols = append(cols, map[string]any{"key": c.Key, "label": c.Label, "category": c.Category, "type": c.Type, "group": c.Group})
	}
	for _, s := range magicStats {
		stats = append(stats, map[string]any{"key": s.Key, "label": s.Label, "def": s.Def, "unit": s.Unit, "only": s.Only})
	}
	for _, g := range magicGroups {
		groups = append(groups, map[string]any{"key": g.Key, "label": g.Label})
	}
	return map[string]any{"cols": cols, "stats": stats, "groups": groups}
}

func st(key string, min int) MagicStat { return MagicStat{Key: key, Min: min} }

// migrateMagic gives circlets their own entry: older saved lists had one helm entry that covered circlets too, so the circlet entry
// starts as a copy of it.
func migrateMagic(entries []MagicEntry) []MagicEntry {
	out := make([]MagicEntry, len(entries))
	copy(out, entries)
	var helm *MagicEntry
	for i := range out {
		switch out[i].Category {
		case "circlet":
			return out
		case "helm":
			helm = &out[i]
		}
	}
	if helm != nil {
		c := *helm
		c.Category = "circlet"
		c.Primary = append([]MagicStat{}, helm.Primary...)
		c.Secondary = append([]MagicStat{}, helm.Secondary...)
		out = append(out, c)
	}
	return out
}

// defaultMagic is the starting list: one entry per column, from the good-gear rules the author wrote down and the short pickits they compared.
func defaultMagic() []MagicEntry {
	rare := func(e MagicEntry) MagicEntry { e.Rare, e.Crafted = true, true; return e }
	magic := func(e MagicEntry) MagicEntry { e.Magic = true; return e }
	return []MagicEntry{
		rare(MagicEntry{Category: "circlet", Primary: []MagicStat{st("classskills", 2), st("skilltree", 3)},
			Secondary: []MagicStat{st("fcr", 20), st("fhr", 10), st("life", 30), st("strdex", 20), st("frw", 20), st("sockets", 2)}}),
		// helms: the skill bonuses are for primal helms and pelts only (a plain helm cannot have them), so a plain helm has to qualify another way
		rare(MagicEntry{Category: "helm", Primary: []MagicStat{st("classskills", 2), st("skilltree", 3), st("sockets", 2)},
			Secondary: []MagicStat{st("life", 30), st("fhr", 10), st("res", 50), st("edef", 150)}}),
		rare(MagicEntry{Category: "weapon", Primary: []MagicStat{st("ed", 250)}, Secondary: []MagicStat{st("ias", 20), st("sockets", 2), st("durability", 0), st("perlevel", 0)}}),
		rare(MagicEntry{Category: "shield", Primary: []MagicStat{st("sockets", 4), st("fbr", 30)}, Secondary: []MagicStat{st("block", 20), st("edef", 150), st("fhr", 17), st("life", 35)}}),
		rare(MagicEntry{Category: "armor", Primary: []MagicStat{st("res", 60), st("edef", 190)}, Secondary: []MagicStat{st("life", 40), st("sockets", 2), st("durability", 0), st("fhr", 10)}}),
		rare(MagicEntry{Category: "gloves", Primary: []MagicStat{st("ias", 20)}, Secondary: []MagicStat{st("strdex", 25), st("crush", 8), st("leechsum", 6), st("res", 50)}}),
		rare(MagicEntry{Category: "boots", Primary: []MagicStat{st("frw", 30), st("fhr", 10)}, Secondary: []MagicStat{st("res3", 60), st("mana", 15), st("durability", 0)}}),
		rare(MagicEntry{Category: "belt", Primary: []MagicStat{st("fhr", 24)}, Secondary: []MagicStat{st("str", 20), st("life", 40), st("fcr", 10)}}),
		rare(MagicEntry{Category: "ring", Primary: []MagicStat{st("fcr", 10), st("mf", 25), st("strdex", 25), st("leechsum", 10)},
			Secondary: []MagicStat{st("life", 30), st("res", 40), st("mana", 60), st("ar", 90), st("hpregen", 7)}}),
		rare(MagicEntry{Category: "amulet", Primary: []MagicStat{st("classskills", 2), st("skilltree", 3)},
			Secondary: []MagicStat{st("fcr", 10), st("life", 40), st("mana", 60), st("res", 50), st("strdex", 25), st("mf", 25)}}),
		magic(MagicEntry{Category: "charm", Type: "small", Primary: []MagicStat{st("res", 12), st("life", 20), st("fhr", 5)}}),
		magic(MagicEntry{Category: "charm", Type: "large", Primary: []MagicStat{st("res", 20), st("life", 30)}}),
		magic(MagicEntry{Category: "charm", Type: "grand", Primary: []MagicStat{st("res", 40), st("life", 40), st("skilltree", 1)}}),
		{Category: "jewel", Magic: true, Rare: true, Primary: []MagicStat{st("ias", 15), st("ed", 40)}, PrimaryNeed: 2},
	}
}
