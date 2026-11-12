package spec

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

// Attribute ids in a .d2s (the first 16 stats of the character), as parsed by ReadSave.
const (
	AttrUnspentStats  = 4
	AttrUnspentSkills = 5
	AttrLife          = 6 // current life, 1/256 points
	AttrMaxLife       = 7 // base maximum life, 1/256 points
)

// Checksum is the file checksum a character file carries at byte 12 (computed with those four bytes zero): for every byte, rotate the
// running sum left by one bit and add the byte.
func Checksum(b []byte) uint32 {
	var sum uint32
	for i, x := range b {
		if i >= 12 && i < 16 {
			x = 0
		}
		sum = (sum<<1 | sum>>31) + uint32(x)
	}
	return sum
}

// PatchAttributes returns a copy of a character file with the given amounts ADDED to attributes of the attribute section, the file size and
// the checksum put right. A save stores only the attributes that are not zero (a character with no unspent skill points has no such entry),
// as (9-bit id, value) pairs in id order: an attribute that is not there yet is inserted in its place, which moves everything after the
// block by a few bytes (the sections that follow are found by their markers, so only the size field has to be corrected).
// It refuses a value that would not fit its field, a file it cannot read, a checksum that was wrong to begin with, and an attribute block
// that does not read back to the very same bytes before anything is changed.
func PatchAttributes(b []byte, add map[int]int) ([]byte, error) {
	if len(b) < 800 || binary.LittleEndian.Uint32(b) != 0xaa55aa55 {
		return nil, fmt.Errorf("not a .d2s file")
	}
	if binary.LittleEndian.Uint32(b[12:]) != Checksum(b) {
		return nil, fmt.Errorf("the file's checksum is wrong already: not touching it")
	}
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
	start := gf + 2
	r := &bitReader{b: b, pos: start * 8}
	type pair struct{ id, val int }
	var pairs []pair
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
		pairs = append(pairs, pair{id, int(r.read(attrBits[id]))})
	}
	end := (r.pos + 7) / 8 // the next section starts on a byte boundary

	encode := func(ps []pair) []byte {
		out := make([]byte, 8+(len(ps)*(9+32)+9+7)/8) // room enough; trimmed below
		pos := 0
		for _, p := range ps {
			writeBits(out, pos, 9, uint32(p.id))
			pos += 9
			writeBits(out, pos, attrBits[p.id], uint32(p.val))
			pos += attrBits[p.id]
		}
		writeBits(out, pos, 9, 0x1ff)
		pos += 9
		return out[:(pos+7)/8]
	}
	if !bytes.Equal(encode(pairs), b[start:end]) {
		return nil, fmt.Errorf("the attribute block does not read back to the same bytes: not touching it")
	}

	for id, n := range add {
		if n == 0 {
			continue
		}
		if id < 0 || id >= len(attrBits) {
			return nil, fmt.Errorf("attribute %d does not exist", id)
		}
		found := false
		for k := range pairs {
			if pairs[k].id == id {
				pairs[k].val += n
				found = true
				if pairs[k].val < 0 || pairs[k].val >= 1<<uint(attrBits[id]) {
					return nil, fmt.Errorf("attribute %d: %d does not fit its field", id, pairs[k].val)
				}
			}
		}
		if !found {
			if n < 0 || n >= 1<<uint(attrBits[id]) {
				return nil, fmt.Errorf("attribute %d: %d does not fit its field", id, n)
			}
			at := len(pairs)
			for k, p := range pairs {
				if p.id > id {
					at = k
					break
				}
			}
			pairs = append(pairs, pair{})
			copy(pairs[at+1:], pairs[at:])
			pairs[at] = pair{id, n}
		}
	}

	out := append(append(append([]byte(nil), b[:start]...), encode(pairs)...), b[end:]...)
	binary.LittleEndian.PutUint32(out[8:], uint32(len(out)))
	binary.LittleEndian.PutUint32(out[12:], Checksum(out))
	return out, nil
}

// writeBits stores the n low bits of v at bit position pos, least significant bit first (the reverse of bitReader.read).
func writeBits(b []byte, pos, n int, v uint32) {
	for i := 0; i < n; i++ {
		by, bit := (pos+i)>>3, uint((pos+i)&7)
		if v>>uint(i)&1 == 1 {
			b[by] |= 1 << bit
		} else {
			b[by] &^= 1 << bit
		}
	}
}
