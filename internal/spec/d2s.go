// Package spec reads a Diablo II character save (read-only), detects what kind of
// character it is (class, skill tree, build), and produces a long-term skill and stat
// build order in the format kolbot's AutoSkill / AutoStat already understand.
package spec

import (
	"encoding/binary"
	"fmt"
	"os"
	"strings"
)

// ClassNames is indexed by the class byte in the save header.
var ClassNames = []string{"Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"}

// classSkillBase is the skill id of the first of the 30 class skills (the save stores
// 30 bytes of hard points in id order starting here).
var classSkillBase = []int{6, 36, 66, 96, 126, 221, 251}

// Save is what we need from a .d2s file.
type Save struct {
	Name          string
	Class         int
	Level         int
	Hardcore      bool
	Expansion     bool
	Str, Ene      int
	Dex, Vit      int
	UnspentStats  int
	UnspentSkills int
	Skills        map[int]int // skill id -> hard points (only skills with points)
}

type bitReader struct {
	b   []byte
	pos int
	err bool
}

// read returns n bits, least significant bit first (the .d2s attribute section layout).
func (r *bitReader) read(n int) uint32 {
	var v uint32
	for i := 0; i < n; i++ {
		by := r.pos >> 3
		if by >= len(r.b) {
			r.err = true
			return 0
		}
		v |= uint32((r.b[by]>>(uint(r.pos)&7))&1) << uint(i)
		r.pos++
	}
	return v
}

// attribute bit widths by stat id (0..15): str ene dex vit unstats unskills hp mhp mana mmana stam mstam lvl exp gold stash
var attrBits = []int{10, 10, 10, 10, 10, 8, 21, 21, 21, 21, 21, 21, 7, 32, 25, 25}

// ReadSave parses a 1.10 to 1.14 character file (version 0x60).
func ReadSave(path string) (*Save, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ParseSave(b)
}

// ParseSave parses the bytes of a .d2s file.
func ParseSave(b []byte) (*Save, error) {
	if len(b) < 800 || binary.LittleEndian.Uint32(b) != 0xaa55aa55 {
		return nil, fmt.Errorf("not a .d2s file")
	}
	if v := binary.LittleEndian.Uint32(b[4:]); v < 0x60 {
		return nil, fmt.Errorf("unsupported save version 0x%x", v)
	}
	s := &Save{Skills: map[int]int{}}
	name := string(b[20:36])
	if i := strings.IndexByte(name, 0); i >= 0 {
		name = name[:i]
	}
	s.Name = name
	if int(b[40]) >= len(ClassNames) {
		return nil, fmt.Errorf("unknown class %d", b[40])
	}
	s.Class = int(b[40])
	s.Hardcore = b[36]&0x04 != 0
	s.Expansion = b[36]&0x20 != 0
	s.Level = int(b[43])

	// attributes: "gf" marker, then (9-bit id, value) pairs until id 0x1ff
	gf := -1
	for i := 700; i+1 < len(b) && i < 900; i++ {
		if b[i] == 'g' && b[i+1] == 'f' {
			gf = i
			break
		}
	}
	if gf < 0 {
		return nil, fmt.Errorf("attribute section not found")
	}
	r := &bitReader{b: b, pos: (gf + 2) * 8}
	for {
		id := int(r.read(9))
		if r.err {
			return nil, fmt.Errorf("truncated attribute section")
		}
		if id == 0x1ff {
			break
		}
		if id >= len(attrBits) {
			return nil, fmt.Errorf("unexpected attribute id %d", id)
		}
		v := int(r.read(attrBits[id]))
		switch id {
		case 0:
			s.Str = v
		case 1:
			s.Ene = v
		case 2:
			s.Dex = v
		case 3:
			s.Vit = v
		case 4:
			s.UnspentStats = v
		case 5:
			s.UnspentSkills = v
		case 12:
			if v > 0 {
				s.Level = v
			}
		}
	}

	// skills: "if" marker on the next byte boundary, then 30 bytes
	at := (r.pos + 7) / 8
	if at+32 > len(b) || b[at] != 'i' || b[at+1] != 'f' {
		return nil, fmt.Errorf("skill section not found")
	}
	for i := 0; i < 30; i++ {
		if p := int(b[at+2+i]); p > 0 {
			s.Skills[classSkillBase[s.Class]+i] = p
		}
	}
	return s, nil
}

// Invested is the total number of skill points spent.
func (s *Save) Invested() int {
	n := 0
	for _, p := range s.Skills {
		n += p
	}
	return n
}
