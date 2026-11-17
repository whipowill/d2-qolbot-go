package d2items

import (
	"encoding/binary"
	"fmt"
	"strings"
)

// Item is one item of a save. The bit layout is the game's 1.10-1.13 one (checked against nokka/d2s, MIT); every width that the game's
// tables decide (the stats, the defense) comes from ItemStatCost.txt.
type Item struct {
	Code         string
	Identified   bool
	Socketed     bool
	Ear          bool
	Simple       bool
	Ethereal     bool
	Personalized bool
	Runeword     bool
	Location     int // 0 stored, 1 equipped, 2 belt, 4 cursor, 6 in a socket
	Body         int // 1 head ... 12 (BodyLocs: the slot it is worn in)
	X, Y         int
	Store        int // where a stored item is: 1 inventory, 4 cube, 5 stash
	Filled       int // items in its sockets
	ID           uint32
	Level        int
	Picture      int // which of its type's pictures (ItemTypes.txt InvGfx1-6), for the types that have several
	Quality      int // 1 low, 2 normal, 3 superior, 4 magic, 5 set, 6 rare, 7 unique, 8 crafted
	LowQuality   int
	Prefix       int
	Suffix       int
	RareName1    int
	RareName2    int
	RareAffixes  [6]int
	SetID        int
	UniqueID     int
	RunewordID   int
	Owner        string // personalized
	Defense      int
	Durability   int
	MaxDur       int
	Quantity     int
	Sockets      int
	Props        []Prop
	SetProps     [][]Prop
	RunewordProp []Prop
	Children     []*Item
	EarName      string
	EarLevel     int
}

// Prop is one stat: the stat id, its parameter (a skill, a class...) and its value; the stats the game saves together (fire damage min and
// max, poison min, max and length...) are one Prop with Values in their order.
type Prop struct {
	ID     int
	Param  int
	Values []int
}

type bits struct {
	b   []byte
	pos int
	bad bool
}

func (r *bits) read(n int) int {
	v := 0
	for i := 0; i < n; i++ {
		by := r.pos >> 3
		if by >= len(r.b) {
			r.bad = true
			return 0
		}
		v |= int((r.b[by]>>(uint(r.pos)&7))&1) << uint(i)
		r.pos++
	}
	return v
}

func (r *bits) align() { r.pos = (r.pos + 7) &^ 7 }

// the stats saved right after another one, without an id of their own
var followers = map[int][]int{17: {18}, 48: {49}, 50: {51}, 52: {53}, 54: {55, 56}, 57: {58, 59}}

// ReadList reads an item list ("JM", a 16-bit count, the items) starting at byte off; it returns the items and the byte after the list.
// The items in sockets come right after their item and are not in the count; they go in its Children.
func ReadList(b []byte, off int, t *Tables) ([]*Item, int, error) {
	if off+4 > len(b) || b[off] != 'J' || b[off+1] != 'M' {
		return nil, off, fmt.Errorf("no item list at byte %d", off)
	}
	n := int(binary.LittleEndian.Uint16(b[off+2:]))
	r := &bits{b: b, pos: (off + 4) * 8}
	var out []*Item
	for i := 0; i < n; i++ {
		it, err := readItem(r, t)
		if err != nil {
			return out, r.pos / 8, fmt.Errorf("item %d of %d: %w", i+1, n, err)
		}
		for j := 0; j < it.Filled && !it.Simple; j++ {
			c, err := readItem(r, t)
			if err != nil {
				return out, r.pos / 8, fmt.Errorf("item %d of %d, socket %d: %w", i+1, n, j+1, err)
			}
			it.Children = append(it.Children, c)
		}
		out = append(out, it)
	}
	return out, r.pos / 8, nil
}

func readItem(r *bits, t *Tables) (*Item, error) {
	r.align()
	start := r.pos
	if r.read(8) != 'J' || r.read(8) != 'M' {
		return nil, fmt.Errorf("no item at byte %d", start/8)
	}
	flags := r.read(32)
	it := &Item{Identified: flags&(1<<4) != 0, Socketed: flags&(1<<11) != 0, Ear: flags&(1<<16) != 0, Simple: flags&(1<<21) != 0,
		Ethereal: flags&(1<<22) != 0, Personalized: flags&(1<<24) != 0, Runeword: flags&(1<<26) != 0}
	r.read(10) // version, and 2 bits
	it.Location = r.read(3)
	it.Body = r.read(4)
	it.X = r.read(4)
	it.Y = r.read(4)
	it.Store = r.read(3)
	if it.Ear {
		r.read(3) // the class
		it.EarLevel = r.read(7)
		it.EarName = readName(r)
		it.Code = "ear"
		r.align()
		return it, nil
	}
	var code [4]byte
	for i := range code {
		code[i] = byte(r.read(8))
	}
	it.Code = strings.TrimSpace(string(code[:]))
	it.Filled = r.read(3)
	base := t.Bases[it.Code]
	if base == nil {
		return nil, fmt.Errorf("unknown item code %q at byte %d", it.Code, start/8)
	}
	if it.Simple {
		r.align()
		return it, nil
	}
	it.ID = uint32(r.read(32))
	it.Level = r.read(7)
	it.Quality = r.read(4)
	if r.read(1) == 1 { // more than one picture: which (rings, amulets, charms, jewels)
		it.Picture = r.read(3)
	}
	if r.read(1) == 1 { // class specific: its automatic affix
		r.read(11)
	}
	switch it.Quality {
	case 1:
		it.LowQuality = r.read(3)
	case 3:
		r.read(3)
	case 4:
		it.Prefix = r.read(11)
		it.Suffix = r.read(11)
	case 5:
		it.SetID = r.read(12)
	case 7:
		it.UniqueID = r.read(12)
	case 6, 8:
		it.RareName1 = r.read(8)
		it.RareName2 = r.read(8)
		for i := range it.RareAffixes {
			if r.read(1) == 1 {
				it.RareAffixes[i] = r.read(11)
			}
		}
	}
	if it.Runeword {
		it.RunewordID = r.read(12)
		r.read(4)
	}
	if it.Personalized {
		it.Owner = readName(r)
	}
	if it.Code == "tbk" || it.Code == "ibk" {
		r.read(5)
	}
	r.read(1) // timestamp
	// armor and weapons by their TYPE (ItemTypes.txt: "armo", "weap"), as the game decides, not by the file they are in: the QOL mod's gas potions
	// are in Weapons.txt with the type "misc", and their saves have no durability (Darius, 2026-11-15)
	isArmor, isWeapon := base.Kind == kindArmor, base.Kind == kindWeapon
	if len(t.TypeEquiv) > 0 {
		isArmor, isWeapon = t.isType(base.Type, "armo"), t.isType(base.Type, "weap")
	}
	if isArmor {
		def := t.Stats[31]
		if def == nil {
			return nil, fmt.Errorf("ItemStatCost.txt has no stat 31 (armorclass)")
		}
		it.Defense = r.read(def.SaveBits) - def.SaveAdd
	}
	if isArmor || isWeapon {
		it.MaxDur = r.read(8)
		if it.MaxDur > 0 {
			it.Durability = r.read(8)
			r.read(1)
		}
	}
	if base.Stackable {
		it.Quantity = r.read(9)
	}
	if it.Socketed {
		it.Sockets = r.read(4)
	}
	setLists := 0
	if it.Quality == 5 {
		setLists = r.read(5)
	}
	var err error
	if it.Props, err = readProps(r, t); err != nil {
		return nil, fmt.Errorf("%s (quality %d, level %d, stats read before it %v): %w", it.Code, it.Quality, it.Level, it.Props, err)
	}
	for i := 0; i < 5; i++ {
		if setLists&(1<<i) != 0 {
			p, err := readProps(r, t)
			if err != nil {
				return nil, err
			}
			it.SetProps = append(it.SetProps, p)
		}
	}
	if it.Runeword {
		if it.RunewordProp, err = readProps(r, t); err != nil {
			return nil, err
		}
	}
	if r.bad {
		return nil, fmt.Errorf("the save ends inside an item")
	}
	r.align()
	return it, nil
}

// a personalized name or an ear's name: 7-bit characters up to a zero
func readName(r *bits) string {
	var s []byte
	for i := 0; i < 16; i++ {
		c := r.read(7)
		if c == 0 {
			break
		}
		s = append(s, byte(c))
	}
	return string(s)
}

func readProps(r *bits, t *Tables) ([]Prop, error) {
	var out []Prop
	for n := 0; n < 200; n++ {
		id := r.read(9)
		if id == 0x1ff {
			return out, nil
		}
		def := t.Stats[id]
		if def == nil || def.SaveBits == 0 {
			return out, fmt.Errorf("stat %d is not in ItemStatCost.txt (or is not saved)", id)
		}
		p := Prop{ID: id}
		if def.ParamBits > 0 {
			p.Param = r.read(def.ParamBits)
		}
		p.Values = append(p.Values, r.read(def.SaveBits)-def.SaveAdd)
		for _, f := range followers[id] {
			fd := t.Stats[f]
			if fd == nil {
				return out, fmt.Errorf("stat %d is not in ItemStatCost.txt", f)
			}
			p.Values = append(p.Values, r.read(fd.SaveBits)-fd.SaveAdd)
		}
		if r.bad {
			return out, fmt.Errorf("the save ends inside a stat list")
		}
		out = append(out, p)
	}
	return out, fmt.Errorf("stat list without an end")
}

// Character is what a save holds: the character's items, its mercenary's, and the gold.
type Character struct {
	Items    []*Item
	Corpse   []*Item
	Merc     []*Item
	MercID   uint32
	MercName int
	MercType int
	MercDead bool
}

// ReadSave reads the item lists of a .d2s file: they start after the skills ("if" and 30 bytes).
func ReadSave(b []byte, t *Tables) (*Character, error) {
	if len(b) < 800 || binary.LittleEndian.Uint32(b) != 0xaa55aa55 {
		return nil, fmt.Errorf("not a .d2s file")
	}
	c := &Character{MercDead: binary.LittleEndian.Uint16(b[177:]) != 0, MercID: binary.LittleEndian.Uint32(b[179:]),
		MercName: int(binary.LittleEndian.Uint16(b[183:])), MercType: int(binary.LittleEndian.Uint16(b[185:]))}
	at := -1
	for i := 765; i+31 < len(b); i++ {
		if b[i] == 'i' && b[i+1] == 'f' && b[i+32] == 'J' && b[i+33] == 'M' {
			at = i + 32
			break
		}
	}
	if at < 0 {
		return nil, fmt.Errorf("item list not found")
	}
	var err error
	if c.Items, at, err = ReadList(b, at, t); err != nil {
		return c, err
	}
	// the corpse: "JM", a count (0 or 1); with a corpse, 12 bytes and its own item list
	if at+4 <= len(b) && b[at] == 'J' && b[at+1] == 'M' {
		if binary.LittleEndian.Uint16(b[at+2:]) > 0 {
			if c.Corpse, at, err = ReadList(b, at+16, t); err != nil {
				return c, err
			}
		} else {
			at += 4
		}
	}
	// the mercenary (expansion): "jf", then its item list when it has been hired
	if at+2 <= len(b) && b[at] == 'j' && b[at+1] == 'f' {
		at += 2
		if c.MercID != 0 {
			if c.Merc, _, err = ReadList(b, at, t); err != nil {
				return c, err
			}
		}
	}
	return c, nil
}

// StashPage is one page of a PlugY stash.
type StashPage struct {
	Name  string
	Items []*Item
}

// ReadPlugY reads a PlugY stash file: a .d2x (the character's own pages, "CSTM") or the shared .sss ("SSS"): pages, each "ST", a flags
// word, a name, and an item list.
func ReadPlugY(b []byte, t *Tables) ([]StashPage, error) {
	var pages []StashPage
	if len(b) < 10 || !(strings.HasPrefix(string(b), "CSTM") || strings.HasPrefix(string(b), "SSS")) {
		return nil, fmt.Errorf("not a PlugY stash file")
	}
	// the first page after the file's header ("CSTM01" has an "ST" in it: look from byte 6), each next one right where the last one ended
	st := strings.Index(string(b[6:]), "ST")
	if st < 0 {
		return nil, nil
	}
	at := st + 6
	for at+2 <= len(b) && b[at] == 'S' && b[at+1] == 'T' {
		st := at
		jm := strings.Index(string(b[st:]), "JM")
		if jm < 0 || jm > 64 {
			break
		}
		jm += st
		// the flags word (4 bytes) when the page has one, then the name and its zero
		head := b[st+2 : jm]
		name := string(head)
		if len(head) >= 5 {
			name = string(head[4:])
		}
		name = strings.TrimRight(name, "\x00")
		items, end, err := ReadList(b, jm, t)
		pages = append(pages, StashPage{Name: name, Items: items})
		if err != nil {
			return pages, fmt.Errorf("stash page %d: %w", len(pages), err)
		}
		at = end
	}
	return pages, nil
}
