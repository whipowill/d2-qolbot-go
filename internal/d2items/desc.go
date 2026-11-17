package d2items

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// the game's text colours, as the tooltip uses them (ÿc and a digit; the web page reads them)
const (
	cWhite  = "ÿc0"
	cRed    = "ÿc1"
	cGreen  = "ÿc2"
	cBlue   = "ÿc3"
	cGold   = "ÿc4"
	cGrey   = "ÿc5"
	cOrange = "ÿc8"
	cYellow = "ÿc9"
)

// Desc is an item described: its name (one line, "Griffon's Eye Diadem"), its base name and its tooltip text (lines, top first, with colours).
type Desc struct {
	Name  string
	Base  string
	Lines []string
}

// Line is the name and the stat lines on one line, without colours (tests and logs).
func (d Desc) Line() string {
	s := d.Name
	if len(d.Lines) > 1 {
		s += " | " + strings.Join(d.Lines[1:], " | ")
	}
	r := strings.NewReplacer("ÿc0", "", "ÿc1", "", "ÿc2", "", "ÿc3", "", "ÿc4", "", "ÿc5", "", "ÿc8", "", "ÿc9", "")
	return r.Replace(s)
}

var classNames = map[string]string{"ama": "Amazon", "sor": "Sorceress", "nec": "Necromancer", "pal": "Paladin", "bar": "Barbarian", "dru": "Druid", "ass": "Assassin"}
var classByID = []string{"Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"}

// the skill tabs by class and tab (the game's order)
var skillTabs = [7][3]string{
	{"Bow and Crossbow", "Passive and Magic", "Javelin and Spear"},
	{"Fire", "Lightning", "Cold"},
	{"Curses", "Poison and Bone", "Summoning"},
	{"Combat", "Offensive Aura", "Defensive Aura"},
	{"Combat", "Masteries", "Warcries"},
	{"Summoning", "Shape Shifting", "Elemental"},
	{"Traps", "Shadow Disciplines", "Martial Arts"},
}

var lowNames = []string{"Crude", "Cracked", "Damaged", "Low Quality"}

func (t *Tables) baseName(it *Item) string {
	if it.Ear {
		return it.EarName + "'s Ear"
	}
	if b := t.Bases[it.Code]; b != nil {
		return t.Str(b.NameKey)
	}
	return it.Code
}

// Describe gives the item's name and tooltip. clvl is the character's level (the stats that grow with it).
func Describe(it *Item, t *Tables, clvl int) Desc {
	base := t.baseName(it)
	d := Desc{Base: base}
	var head []string // the name lines, top first
	switch {
	case it.Ear:
		d.Name = base
		head = []string{cWhite + base, fmt.Sprintf("Level %d", it.EarLevel)}
	case it.Runeword && it.Identified:
		rw := t.Str(t.Runewords[it.RunewordID])
		if rw == "" {
			rw = "Runeword"
		}
		d.Name = rw + " " + base
		head = []string{cGold + rw, cGrey + base}
	case !it.Identified && it.Quality >= 4:
		d.Name = base
		head = []string{qualityColour(it.Quality) + base}
	case it.Quality == 7:
		u := t.Str(t.Uniques[it.UniqueID])
		d.Name = u + " " + base
		head = []string{cGold + u, cGold + base}
	case it.Quality == 5:
		s := t.Str(t.SetItems[it.SetID])
		d.Name = s + " " + base
		head = []string{cGreen + s, cGreen + base}
	case it.Quality == 6 || it.Quality == 8:
		n := strings.TrimSpace(t.Str(t.RareNames[it.RareName1]) + " " + t.Str(t.RareNames[it.RareName2]))
		d.Name = n + " " + base
		c := cYellow
		if it.Quality == 8 {
			c = cOrange
		}
		head = []string{c + n, c + base}
	case it.Quality == 4:
		n := base
		if it.Prefix > 0 {
			n = t.Str(t.Prefixes[it.Prefix]) + " " + n
		}
		if it.Suffix > 0 {
			n += " " + t.Str(t.Suffixes[it.Suffix])
		}
		d.Name = n
		head = []string{cBlue + n}
	case it.Quality == 3:
		d.Name = "Superior " + base
		head = []string{cWhite + d.Name}
	case it.Quality == 1:
		q := "Low Quality"
		if it.LowQuality < len(lowNames) {
			q = lowNames[it.LowQuality]
		}
		d.Name = q + " " + base
		head = []string{cWhite + d.Name}
	default:
		d.Name = base
		c := cWhite
		if it.Socketed || it.Ethereal {
			c = cGrey
		}
		head = []string{c + base}
	}
	if it.Personalized && it.Owner != "" {
		head[0] = head[0][:5] + it.Owner + "'s " + head[0][5:]
		d.Name = it.Owner + "'s " + d.Name
	}
	d.Lines = append(d.Lines, head...)
	if it.Simple || it.Ear {
		if it.Simple {
			d.Lines = append(d.Lines, t.propLines(socketedProps(it, t), clvl)...)
		}
		return d
	}
	if it.Defense > 0 {
		d.Lines = append(d.Lines, cWhite+fmt.Sprintf("Defense: %d", it.Defense))
	}
	if it.MaxDur > 0 {
		max := it.MaxDur
		for _, p := range it.Props {
			if p.ID == 75 { // item_maxdurability_percent
				max += it.MaxDur * p.Values[0] / 100
			}
		}
		d.Lines = append(d.Lines, cWhite+fmt.Sprintf("Durability: %d of %d", it.Durability, max))
	}
	if it.Quantity > 0 {
		d.Lines = append(d.Lines, cWhite+fmt.Sprintf("Quantity: %d", it.Quantity))
	}
	if !it.Identified {
		d.Lines = append(d.Lines, cRed+"Unidentified")
		return d
	}
	props := append([]Prop{}, it.Props...)
	props = append(props, it.RunewordProp...)
	for _, c := range it.Children {
		props = append(props, socketedProps(c, t)...)
	}
	d.Lines = append(d.Lines, t.propLines(props, clvl)...)
	for _, list := range it.SetProps {
		for _, l := range t.propLines(list, clvl) {
			d.Lines = append(d.Lines, cGreen+strings.TrimPrefix(l, cBlue))
		}
	}
	var tags []string
	if it.Ethereal {
		tags = append(tags, "Ethereal (Cannot be Repaired)")
	}
	if it.Socketed {
		tags = append(tags, fmt.Sprintf("Socketed (%d)", it.Sockets))
	}
	if len(tags) > 0 {
		d.Lines = append(d.Lines, cBlue+strings.Join(tags, ", "))
	}
	if len(it.Children) > 0 {
		var in []string
		for _, c := range it.Children {
			in = append(in, Describe(c, t, clvl).Name)
		}
		d.Lines = append(d.Lines, cGrey+"In the sockets: "+strings.Join(in, ", "))
	}
	return d
}

func qualityColour(q int) string {
	switch q {
	case 4:
		return cBlue
	case 5:
		return cGreen
	case 6:
		return cYellow
	case 7:
		return cGold
	case 8:
		return cOrange
	}
	return cWhite
}

// What a gem, rune or jewel adds where it sits: a jewel carries its own stats; a gem's or rune's stats depend on the item it is in (Gems.txt),
// which this reader does not know yet, so they are not shown.
func socketedProps(it *Item, t *Tables) []Prop {
	return it.Props
}

// propLines turns stats into tooltip lines, highest description priority first, the stats the game shows as one line joined (damage
// ranges, all resistances).
func (t *Tables) propLines(props []Prop, clvl int) []string {
	type line struct {
		prio int
		text string
	}
	var out []line
	byID := map[int]*Prop{}
	for i := range props {
		p := &props[i]
		if q, ok := byID[p.ID]; ok && p.Param == q.Param && len(p.Values) == len(q.Values) { // the same stat twice (gems, set bonuses): add up
			for j := range p.Values {
				q.Values[j] += p.Values[j]
			}
			continue
		}
		cp := Prop{ID: p.ID, Param: p.Param, Values: append([]int{}, p.Values...)}
		byID[p.ID] = &cp
	}
	// all resistances the same: one line
	if r := byID[39]; r != nil && byID[41] != nil && byID[43] != nil && byID[45] != nil &&
		r.Values[0] == byID[41].Values[0] && r.Values[0] == byID[43].Values[0] && r.Values[0] == byID[45].Values[0] {
		out = append(out, line{t.prio(39), fmt.Sprintf("All Resistances %+d", r.Values[0])})
		delete(byID, 39)
		delete(byID, 41)
		delete(byID, 43)
		delete(byID, 45)
	}
	for id, p := range byID {
		if s := t.propText(*p, clvl); s != "" {
			out = append(out, line{t.prio(id), s})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].prio != out[j].prio {
			return out[i].prio > out[j].prio
		}
		return out[i].text < out[j].text
	})
	var lines []string
	seen := map[string]bool{}
	for _, l := range out {
		if seen[l.text] { // the game saves some stats twice (minimum and maximum damage for one- and two-handed use): one line
			continue
		}
		seen[l.text] = true
		if strings.HasPrefix(l.text, "\u00ffc") { // a line with its own colour (a mod's "Corrupted" is red)
			lines = append(lines, l.text)
			continue
		}
		lines = append(lines, cBlue+l.text)
	}
	return lines
}

func (t *Tables) prio(id int) int {
	if d := t.Stats[id]; d != nil {
		return d.DescPriority
	}
	return 0
}

func (t *Tables) skillName(id int) string {
	if s, ok := t.Skills[id]; ok {
		return t.Str(s.NameKey)
	}
	return "skill " + strconv.Itoa(id)
}

// propText is one stat's line, after ItemStatCost.txt's descfunc/descval/descstrpos (the game's tooltip rules, the common ones).
func (t *Tables) propText(p Prop, clvl int) string {
	def := t.Stats[p.ID]
	if def == nil {
		return fmt.Sprintf("stat %d: %v", p.ID, p.Values)
	}
	v := p.Values[0]
	// the damage the game shows as a range
	switch p.ID {
	case 17:
		return fmt.Sprintf("+%d%% Enhanced Damage", v)
	case 48:
		return rangeText(v, p.Values[1], "Fire Damage")
	case 50:
		return rangeText(v, p.Values[1], "Lightning Damage")
	case 52:
		return rangeText(v, p.Values[1], "Magic Damage")
	case 54:
		return rangeText(v, p.Values[1], "Cold Damage")
	case 57:
		frames := p.Values[2]
		lo, hi := v*frames/256, p.Values[1]*frames/256
		if lo == hi {
			return fmt.Sprintf("+%d Poison Damage Over %d Seconds", lo, frames/25)
		}
		return fmt.Sprintf("Adds %d-%d Poison Damage Over %d Seconds", lo, hi, frames/25)
	}
	if def.DescFunc == 0 {
		return "" // the game shows nothing for it (the thrown-weapon copies of the damage stats, internal stats)
	}
	str := def.DescPos
	if v < 0 && def.DescNeg != "" {
		str = def.DescNeg
	}
	s1, s2 := t.Str(str), t.Str(def.Desc2)
	if str == "" {
		s1 = def.Name
	}
	val := ""
	switch def.DescFunc {
	case 1, 12:
		val = fmt.Sprintf("%+d", v)
	case 2:
		val = fmt.Sprintf("%d%%", v)
	case 3:
		val = strconv.Itoa(v)
	case 4:
		val = fmt.Sprintf("%+d%%", v)
	case 5:
		val = fmt.Sprintf("%d%%", v*100/128)
	case 6:
		return fmt.Sprintf("%+d %s %s", v*clvl/8, s1, s2)
	case 7:
		return fmt.Sprintf("%d%% %s %s", v*clvl/8, s1, s2)
	case 8:
		return fmt.Sprintf("%+d%% %s %s", v*clvl/8, s1, s2)
	case 9:
		return fmt.Sprintf("%d %s %s", v*clvl/8, s1, s2)
	case 10:
		return fmt.Sprintf("%d%% %s %s", v*clvl/8*100/128, s1, s2)
	case 11:
		if v > 0 {
			return fmt.Sprintf("Repairs 1 Durability in %d Seconds", 100/v)
		}
		return ""
	case 13:
		c := "Class"
		if p.Param < len(classByID) {
			c = classByID[p.Param]
		}
		return fmt.Sprintf("%+d to %s Skill Levels", v, c)
	case 14:
		cls, tab := (p.Param>>3)&7, p.Param&7
		if cls < 7 && tab < 3 {
			return fmt.Sprintf("%+d to %s Skills (%s Only)", v, skillTabs[cls][tab], classByID[cls])
		}
		return fmt.Sprintf("%+d to skill tab %d", v, p.Param)
	case 15:
		if !strings.Contains(s1, "%") { // a mod's own wording, a whole sentence ("Melee Attacks Deal Splash Damage")
			return s1
		}
		lvl, sk := p.Param&63, p.Param>>6
		return fmt.Sprintf("%d%% Chance to cast level %d %s %s", v, lvl, t.skillName(sk), strings.TrimSpace(eventText(s1)))
	case 16:
		return fmt.Sprintf("Level %d %s Aura When Equipped", v, t.skillName(p.Param))
	case 19:
		return cformat(s1, v)
	case 20:
		val = fmt.Sprintf("%d%%", -v)
	case 21:
		val = strconv.Itoa(-v)
	case 24:
		lvl, sk := p.Param&63, p.Param>>6
		return fmt.Sprintf("Level %d %s (%d/%d Charges)", lvl, t.skillName(sk), v&255, v>>8)
	case 27:
		cls := ""
		if s, ok := t.Skills[p.Param]; ok {
			cls = classNames[s.Class]
		}
		if cls != "" {
			return fmt.Sprintf("%+d to %s (%s Only)", v, t.skillName(p.Param), cls)
		}
		return fmt.Sprintf("%+d to %s", v, t.skillName(p.Param))
	case 28:
		return fmt.Sprintf("%+d to %s", v, t.skillName(p.Param))
	default:
		val = strconv.Itoa(v)
	}
	switch def.DescVal {
	case 0:
		return s1
	case 2:
		return s1 + " " + val
	}
	return val + " " + s1
}

func rangeText(lo, hi int, what string) string {
	if lo == hi {
		return fmt.Sprintf("+%d %s", lo, what)
	}
	return fmt.Sprintf("Adds %d-%d %s", lo, hi, what)
}

// The chance-to-cast strings are "%d%% Chance to cast level %d %s on attack": keep only what follows the skill.
func eventText(s string) string {
	if i := strings.LastIndex(s, "%s"); i >= 0 {
		return s[i+2:]
	}
	return s
}

// cformat fills a string's %d / %+d with the value.
func cformat(s string, v int) string {
	s = strings.ReplaceAll(s, "%+d", fmt.Sprintf("%+d", v))
	s = strings.ReplaceAll(s, "%d", strconv.Itoa(v))
	return strings.ReplaceAll(s, "%%", "%")
}
