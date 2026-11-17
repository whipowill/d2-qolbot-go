// Package d2items reads the items of a Diablo II 1.13 character save (.d2s) and of PlugY's stash files (.d2x), read only, and describes
// them the way the game's tooltip does, as far as the game's own tables allow. Every name and every stat comes from the game's tables
// (the mod's own .txt and .tbl files first, so a mod's items read right), never from a list built into this program.
package d2items

import (
	"encoding/binary"
	"fmt"
	"strconv"
	"strings"
)

// Source returns the contents of one of the game's files by its base name ("UniqueItems.txt", "patchstring.tbl"), or nil when there is none.
type Source func(name string) []byte

// table is a tab-separated .txt file: a header row, then the rows.
type table struct {
	col  map[string]int
	rows [][]string
}

func readTable(b []byte) *table {
	t := &table{col: map[string]int{}}
	lines := strings.Split(strings.ReplaceAll(string(b), "\r", ""), "\n")
	if len(lines) == 0 {
		return t
	}
	for i, h := range strings.Split(lines[0], "\t") {
		k := strings.ToLower(strings.TrimSpace(h))
		if _, dup := t.col[k]; !dup {
			t.col[k] = i
		}
	}
	for _, l := range lines[1:] {
		if l == "" {
			continue
		}
		t.rows = append(t.rows, strings.Split(l, "\t"))
	}
	return t
}

func (t *table) has(col string) bool { _, ok := t.col[strings.ToLower(col)]; return ok }

func (t *table) str(row []string, col string) string {
	i, ok := t.col[strings.ToLower(col)]
	if !ok || i >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[i])
}

func (t *table) num(row []string, col string) int {
	n, _ := strconv.Atoi(t.str(row, col))
	return n
}

// ids gives each row its id: its place in the table, as the game numbers them. NOT an id column: the game ignores those (the QOL mod's
// ItemStatCost.txt says 361 and 362 for its last two rows, and the compiled itemstatcost.bin the game loads has them as stats 359 and 360,
// which is what the saves hold; Skills.txt likewise). A row named "Expansion"
// (the separator between the classic and the expansion rows) takes no id when skipExpansion is set (UniqueItems, SetItems: checked against
// nokka/d2s, "Coldkill" is unique 129 and row 129 is the separator) and an id of its own when not (the affix tables keep every row).
func (t *table) ids(nameCol string, skipExpansion bool) map[int][]string {
	out := map[int][]string{}
	n := 0
	for _, r := range t.rows {
		if skipExpansion && strings.EqualFold(t.str(r, nameCol), "Expansion") {
			continue
		}
		out[n] = r
		n++
	}
	return out
}

// readTbl reads a .tbl string table (key -> text).
func readTbl(b []byte, into map[string]string) {
	if len(b) < 21 {
		return
	}
	n := int(binary.LittleEndian.Uint16(b[2:]))
	hashSize := int(binary.LittleEndian.Uint32(b[4:]))
	at := 21 + 2*n
	for i := 0; i < hashSize; i++ {
		e := at + 17*i
		if e+17 > len(b) {
			break
		}
		if b[e] == 0 {
			continue
		}
		keyOff := int(binary.LittleEndian.Uint32(b[e+7:]))
		strOff := int(binary.LittleEndian.Uint32(b[e+11:]))
		strLen := int(binary.LittleEndian.Uint16(b[e+15:]))
		key := cstr(b, keyOff)
		if key == "" || strOff <= 0 || strOff >= len(b) {
			continue
		}
		end := strOff + strLen
		if end > len(b) {
			end = len(b)
		}
		s := string(latin1(b[strOff:end]))
		s = strings.ReplaceAll(strings.TrimRight(s, "\x00"), "\u00c3\u00bf", "\u00ff") // a mod's strings with the colour byte written as UTF-8
		if _, seen := into[key]; !seen {
			into[key] = s
		}
	}
}

func cstr(b []byte, off int) string {
	if off <= 0 || off >= len(b) {
		return ""
	}
	end := off
	for end < len(b) && b[end] != 0 {
		end++
	}
	return string(latin1(b[off:end]))
}

// latin1 turns the game's 8-bit text into UTF-8 runes (the colour code byte 0xFF becomes 'ÿ', which the web page knows).
func latin1(b []byte) []rune {
	r := make([]rune, len(b))
	for i, c := range b {
		r[i] = rune(c)
	}
	return r
}

// Base is an item type from Armor.txt, Weapons.txt or Misc.txt.
type Base struct {
	Code, NameKey string
	Kind          int // 1 armor, 2 weapon, 3 misc
	W, H          int
	Type          string // ItemTypes code
	Stackable     bool
	NoDurability  bool
	// the inventory picture: its .dc6 file (data\global\items), the ones for a unique and a set item of this base, and the palette
	// shift the game recolours it with (InvTrans: 1 grey ... 8 invgreybrown, 0 none)
	InvFile, UniqueInv, SetInv string
	InvTrans                   int
}

const (
	kindArmor = 1 + iota
	kindWeapon
	kindMisc
)

// StatDef is a row of ItemStatCost.txt.
type StatDef struct {
	ID                           int
	Name                         string
	SaveBits, SaveAdd, ParamBits int
	Encode                       int
	DescPriority, DescFunc       int
	DescVal                      int
	DescPos, DescNeg, Desc2      string
	Signed                       bool
}

// Tables holds what reading and describing items needs.
type Tables struct {
	Bases     map[string]*Base
	Stats     map[int]*StatDef
	Uniques   map[int]string // id -> name string key
	SetItems  map[int]string
	Prefixes  map[int]string
	Suffixes  map[int]string
	RareNames map[int]string // 1-based: RareSuffix.txt rows, then RarePrefix.txt rows (nokka/d2s: 1 is "Bite", the first suffix)
	Runewords map[int]string // id -> name string key ("Runeword1"), the id is the number in it plus 26 (nokka/d2s: Ancient's Pledge is 27)
	Skills    map[int]skill
	TypeEquiv map[string][]string
	Hirelings map[int]hireling // merc type (the save's) -> row
	strs      map[string]string

	// pictures
	UniquePic   map[int]pic         // unique id -> its own picture and colour
	SetPic      map[int]pic         // set item id -> the same
	PrefixColor map[int]string      // magic prefix id -> its colour (colors.txt code), when it recolours the item
	SuffixColor map[int]string      // the same for suffixes
	TypeGfx     map[string][]string // item type -> its pictures, picked by the item's picture number (rings, amulets, charms, jewels)
	Colors      map[string]int      // colors.txt code -> its number (the row of the palette shift tables)
}

type pic struct {
	File, Color string
}

type skill struct {
	NameKey  string
	Class    string
	ReqLevel int // Skills.txt reqlevel
	Page     int // SkillDesc.txt skillpage: the tab of the skill tree (1-3), 0 for a skill that is not in a tree
	Row, Col int // its place in the tree
}

type hireling struct {
	NameFirst, NameLast string
	Label               string // "Desert Mercenary (Combat)"
}

// Str is the text of a string key, else the key itself.
func (t *Tables) Str(key string) string {
	if s, ok := t.strs[key]; ok {
		return s
	}
	return key
}

// Load reads the tables through src. The string tables are looked up in the game's order: patchstring, expansionstring, string (a mod's
// BaseMod.tbl first).
func Load(src Source) *Tables {
	t := &Tables{Bases: map[string]*Base{}, Stats: map[int]*StatDef{}, Skills: map[int]skill{}, TypeEquiv: map[string][]string{}, Hirelings: map[int]hireling{}, strs: map[string]string{},
		UniquePic: map[int]pic{}, SetPic: map[int]pic{}, PrefixColor: map[int]string{}, SuffixColor: map[int]string{}, TypeGfx: map[string][]string{}, Colors: map[string]int{}}
	for _, f := range []string{"BaseMod.tbl", "patchstring.tbl", "expansionstring.tbl", "string.tbl"} {
		readTbl(src(f), t.strs)
	}
	for kind, f := range map[int]string{kindArmor: "Armor.txt", kindWeapon: "Weapons.txt", kindMisc: "Misc.txt"} {
		tb := readTable(src(f))
		for _, r := range tb.rows {
			code := tb.str(r, "code")
			if code == "" {
				continue
			}
			t.Bases[code] = &Base{Code: code, NameKey: tb.str(r, "namestr"), Kind: kind, W: tb.num(r, "invwidth"), H: tb.num(r, "invheight"),
				Type: tb.str(r, "type"), Stackable: tb.num(r, "stackable") == 1, NoDurability: tb.num(r, "nodurability") == 1,
				InvFile: tb.str(r, "invfile"), UniqueInv: tb.str(r, "uniqueinvfile"), SetInv: tb.str(r, "setinvfile"), InvTrans: tb.num(r, "invtrans")}
		}
	}
	isc := readTable(src("ItemStatCost.txt"))
	for id, r := range isc.ids("stat", false) {
		t.Stats[id] = &StatDef{ID: id, Name: isc.str(r, "stat"), SaveBits: isc.num(r, "save bits"), SaveAdd: isc.num(r, "save add"),
			ParamBits: isc.num(r, "save param bits"), Encode: isc.num(r, "encode"), DescPriority: isc.num(r, "descpriority"),
			DescFunc: isc.num(r, "descfunc"), DescVal: isc.num(r, "descval"), DescPos: isc.str(r, "descstrpos"), DescNeg: isc.str(r, "descstrneg"),
			Desc2: isc.str(r, "descstr2"), Signed: isc.num(r, "signed") == 1}
	}
	for _, x := range []struct {
		f     string
		names *map[int]string
		pics  map[int]pic
	}{{"UniqueItems.txt", &t.Uniques, t.UniquePic}, {"SetItems.txt", &t.SetItems, t.SetPic}} {
		tb := readTable(src(x.f))
		*x.names = names(tb, "index", true)
		for id, r := range tb.ids("index", true) {
			if f, c := tb.str(r, "invfile"), tb.str(r, "invtransform"); f != "" || c != "" {
				x.pics[id] = pic{File: f, Color: c}
			}
		}
	}
	for _, x := range []struct {
		f      string
		names  *map[int]string
		colors map[int]string
	}{{"MagicPrefix.txt", &t.Prefixes, t.PrefixColor}, {"MagicSuffix.txt", &t.Suffixes, t.SuffixColor}} {
		tb := readTable(src(x.f))
		*x.names = shift(names(tb, "name", false), 1)
		for id, r := range tb.ids("name", false) {
			if tb.num(r, "transform") == 1 && tb.str(r, "transformcolor") != "" {
				x.colors[id+1] = tb.str(r, "transformcolor")
			}
		}
	}
	for i, r := range readTable(src("colors.txt")).rows {
		if len(r) > 1 {
			t.Colors[strings.TrimSpace(r[1])] = i
		}
	}
	t.RareNames = map[int]string{}
	n := 1
	for _, f := range []string{"RareSuffix.txt", "RarePrefix.txt"} {
		tb := readTable(src(f))
		for _, r := range tb.rows {
			t.RareNames[n] = tb.str(r, "name")
			n++
		}
	}
	t.Runewords = map[int]string{}
	rw := readTable(src("Runes.txt"))
	for _, r := range rw.rows {
		key := rw.str(r, "name")
		if num, err := strconv.Atoi(strings.TrimPrefix(key, "Runeword")); err == nil && strings.HasPrefix(key, "Runeword") {
			name := key
			if _, ok := t.strs[key]; !ok && rw.str(r, "rune name") != "" {
				name = rw.str(r, "rune name")
			}
			t.Runewords[num+26] = name
		}
	}
	sd := readTable(src("SkillDesc.txt"))
	descName := map[string]string{}
	for _, r := range sd.rows {
		descName[sd.str(r, "skilldesc")] = sd.str(r, "str name")
	}
	descAt := map[string][3]int{} // skilldesc -> page, row, column
	for _, r := range sd.rows {
		descAt[sd.str(r, "skilldesc")] = [3]int{sd.num(r, "skillpage"), sd.num(r, "skillrow"), sd.num(r, "skillcolumn")}
	}
	sk := readTable(src("Skills.txt"))
	for id, r := range sk.ids("skill", false) {
		key := descName[sk.str(r, "skilldesc")]
		if key == "" {
			key = sk.str(r, "skill")
		}
		at := descAt[sk.str(r, "skilldesc")]
		t.Skills[id] = skill{NameKey: key, Class: sk.str(r, "charclass"), ReqLevel: sk.num(r, "reqlevel"), Page: at[0], Row: at[1], Col: at[2]}
	}
	it := readTable(src("ItemTypes.txt"))
	for _, r := range it.rows {
		if c := it.str(r, "code"); c != "" {
			t.TypeEquiv[c] = []string{it.str(r, "equiv1"), it.str(r, "equiv2")}
			for i := 1; i <= it.num(r, "varinvgfx") && i <= 6; i++ {
				t.TypeGfx[c] = append(t.TypeGfx[c], it.str(r, fmt.Sprintf("invgfx%d", i)))
			}
		}
	}
	hl := readTable(src("Hireling.txt"))
	for _, r := range hl.rows {
		id := hl.num(r, "id")
		if _, ok := t.Hirelings[id]; !ok && hl.str(r, "namefirst") != "" {
			label := hl.str(r, "hireling")
			if sub := hl.str(r, "subtype"); sub != "" {
				label += " (" + sub + ")"
			}
			t.Hirelings[id] = hireling{NameFirst: hl.str(r, "namefirst"), NameLast: hl.str(r, "namelast"), Label: label}
		}
	}
	return t
}

func names(tb *table, col string, skipExpansion bool) map[int]string {
	out := map[int]string{}
	for id, r := range tb.ids(col, skipExpansion) {
		out[id] = tb.str(r, col)
	}
	return out
}

// shift: the affix tables number their rows from 1 (0 is "no affix").
func shift(m map[int]string, by int) map[int]string {
	out := make(map[int]string, len(m))
	for k, v := range m {
		out[k+by] = v
	}
	return out
}

// isType: is the item type code (or one it counts as, through ItemTypes.txt's Equiv columns) the wanted one?
func (t *Tables) isType(code, want string) bool {
	seen := map[string]bool{}
	var walk func(c string) bool
	walk = func(c string) bool {
		if c == "" || seen[c] {
			return false
		}
		if c == want {
			return true
		}
		seen[c] = true
		for _, e := range t.TypeEquiv[c] {
			if walk(e) {
				return true
			}
		}
		return false
	}
	return walk(code)
}

// MercName is a mercenary's name from the save's merc type (Hireling.txt's Id) and name number: the string key NameFirst counted on by the
// number ("merca201" + 3 -> "merca204"). Also its kind ("Desert Mercenary (Combat)").
func (t *Tables) MercName(mercType, nameNum int) (name, kind string) {
	h, ok := t.Hirelings[mercType]
	if !ok {
		return "", ""
	}
	key := h.NameFirst
	i := len(key)
	for i > 0 && key[i-1] >= '0' && key[i-1] <= '9' {
		i--
	}
	if n, err := strconv.Atoi(key[i:]); err == nil {
		key = fmt.Sprintf("%s%0*d", key[:i], len(key)-i, n+nameNum)
	}
	return t.Str(key), h.Label
}
