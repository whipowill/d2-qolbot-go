package spec

import (
	"bytes"
	"encoding/binary"
	"testing"
)

// fakeSave builds the smallest file ReadSave accepts: a Sorceress, level 5, with the given attributes.
func fakeSave(unspentSkills, vit, maxLife int) []byte {
	b := make([]byte, 900)
	binary.LittleEndian.PutUint32(b, 0xaa55aa55)
	binary.LittleEndian.PutUint32(b[4:], 0x60)
	binary.LittleEndian.PutUint32(b[8:], uint32(len(b)))
	copy(b[20:], "Test")
	b[40], b[43] = 1, 5
	pos := 752 * 8
	copy(b[750:], "gf")
	put := func(id, v int) {
		if v == 0 { // a real save stores only the attributes that are not zero
			return
		}
		writeBits(b, pos, 9, uint32(id))
		pos += 9
		writeBits(b, pos, attrBits[id], uint32(v))
		pos += attrBits[id]
	}
	put(3, vit)
	put(5, unspentSkills)
	put(6, maxLife)
	put(7, maxLife)
	put(12, 5)
	writeBits(b, pos, 9, 0x1ff)
	pos += 9
	at := (pos + 7) / 8
	copy(b[at:], "if")
	binary.LittleEndian.PutUint32(b[12:], Checksum(b))
	return b
}

func TestPatchAttributesInsertsAnAttributeThatIsNotThereYet(t *testing.T) {
	b := fakeSave(0, 20, 60*256) // no unspent skill points: the save has no entry for them
	if s, _ := ParseSave(b); s.UnspentSkills != 0 {
		t.Fatal("setup")
	}
	out, err := PatchAttributes(b, map[int]int{AttrUnspentSkills: 1, AttrMaxLife: 20 * 256, AttrLife: 20 * 256})
	if err != nil {
		t.Fatal(err)
	}
	s, err := ParseSave(out)
	if err != nil {
		t.Fatal(err)
	}
	if s.UnspentSkills != 1 || s.MaxLifeRaw != 80*256 || s.Vit != 20 || s.Level != 5 {
		t.Errorf("got %+v", s)
	}
	if binary.LittleEndian.Uint32(out[12:]) != Checksum(out) {
		t.Error("the checksum must be right")
	}
	if int(binary.LittleEndian.Uint32(out[8:])) != len(out) {
		t.Errorf("the size field must be the file size: %d vs %d", binary.LittleEndian.Uint32(out[8:]), len(out))
	}
	// everything after the attribute block (the skills marker and what follows) is untouched, only moved
	at := bytes.Index(out[750:], []byte("if")) + 750
	was := bytes.Index(b[750:], []byte("if")) + 750
	if !bytes.Equal(out[at:], b[was:]) && !bytes.Equal(out[at:at+30], b[was:was+30]) {
		t.Error("the sections after the attributes must be unchanged")
	}
}

func TestPatchAttributesAddsToOneThatIsThere(t *testing.T) {
	b := fakeSave(7, 20, 60*256)
	out, err := PatchAttributes(b, map[int]int{AttrUnspentSkills: 3})
	if err != nil {
		t.Fatal(err)
	}
	if s, err := ParseSave(out); err != nil || s.UnspentSkills != 10 {
		t.Errorf("%v %+v", err, s)
	}
	if len(out) != len(b) {
		t.Errorf("no attribute was added, the file keeps its length: %d vs %d", len(out), len(b))
	}
}

func TestPatchAttributesRefusals(t *testing.T) {
	b := fakeSave(250, 20, 60*256)
	if _, err := PatchAttributes(b, map[int]int{AttrUnspentSkills: 10}); err == nil {
		t.Error("250 + 10 does not fit 8 bits")
	}
	bad := append([]byte(nil), b...)
	bad[100] ^= 1
	if _, err := PatchAttributes(bad, map[int]int{AttrUnspentSkills: 1}); err == nil {
		t.Error("a file with a wrong checksum is not touched")
	}
	if _, err := PatchAttributes(b, map[int]int{99: 1}); err == nil {
		t.Error("an attribute that does not exist must be refused")
	}
}
