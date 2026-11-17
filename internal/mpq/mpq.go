// Package mpq reads files out of a Blizzard MPQ archive (format 0, the Diablo II one), read only: the data tables a game or a mod keeps
// inside its .mpq (data\global\excel\Hireling.txt and so on). Compression: PKWARE DCL (implode), zlib and bzip2; encrypted files too.
package mpq

import (
	"bytes"
	"compress/bzip2"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const (
	flagImplode    = 0x00000100
	flagCompress   = 0x00000200
	flagEncrypted  = 0x00010000
	flagFixKey     = 0x00020000
	flagSingleUnit = 0x01000000
	flagExists     = 0x80000000
)

var cryptTable [0x500]uint32

func init() {
	seed := uint32(0x00100001)
	for i1 := 0; i1 < 0x100; i1++ {
		for i, i2 := 0, i1; i < 5; i, i2 = i+1, i2+0x100 {
			seed = (seed*125 + 3) % 0x2AAAAB
			t1 := (seed & 0xFFFF) << 16
			seed = (seed*125 + 3) % 0x2AAAAB
			cryptTable[i2] = t1 | (seed & 0xFFFF)
		}
	}
}

func hashString(s string, kind uint32) uint32 {
	s1, s2 := uint32(0x7FED7FED), uint32(0xEEEEEEEE)
	for _, c := range []byte(strings.ToUpper(strings.ReplaceAll(s, "/", `\`))) {
		s1 = cryptTable[kind*0x100+uint32(c)] ^ (s1 + s2)
		s2 = uint32(c) + s1 + s2 + (s2 << 5) + 3
	}
	return s1
}

// decrypt works on whole 32-bit words, in place; trailing bytes stay as they are.
func decrypt(b []byte, key uint32) {
	seed := uint32(0xEEEEEEEE)
	for i := 0; i+4 <= len(b); i += 4 {
		seed += cryptTable[0x400+(key&0xFF)]
		v := binary.LittleEndian.Uint32(b[i:]) ^ (key + seed)
		key = ((^key << 0x15) + 0x11111111) | (key >> 0x0B)
		seed = v + seed + (seed << 5) + 3
		binary.LittleEndian.PutUint32(b[i:], v)
	}
}

type hashEntry struct {
	a, b  uint32
	block uint32
}

type blockEntry struct {
	pos, csize, size, flags uint32
}

// Archive is an open MPQ.
type Archive struct {
	f          *os.File
	base       int64
	sectorSize int
	hashes     []hashEntry
	blocks     []blockEntry
}

// Open reads the archive's header and tables.
func Open(path string) (*Archive, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	a := &Archive{f: f}
	if err := a.load(); err != nil {
		f.Close()
		return nil, fmt.Errorf("%s: %w", filepath.Base(path), err)
	}
	return a, nil
}

// Close closes the file.
func (a *Archive) Close() error { return a.f.Close() }

func (a *Archive) load() error {
	hdr := make([]byte, 32)
	for off := int64(0); ; off += 512 { // the header may follow other data, at a multiple of 512
		if _, err := a.f.ReadAt(hdr, off); err != nil {
			return errors.New("no MPQ header")
		}
		if string(hdr[:4]) == "MPQ\x1a" {
			a.base = off
			break
		}
		if off > 1<<26 {
			return errors.New("no MPQ header")
		}
	}
	le := binary.LittleEndian
	a.sectorSize = 512 << le.Uint16(hdr[14:])
	hashOff, blockOff := int64(le.Uint32(hdr[16:])), int64(le.Uint32(hdr[20:]))
	nHash, nBlock := int(le.Uint32(hdr[24:])), int(le.Uint32(hdr[28:]))
	if nHash > 1<<20 || nBlock > 1<<20 {
		return errors.New("tables too large")
	}
	hb := make([]byte, nHash*16)
	if _, err := a.f.ReadAt(hb, a.base+hashOff); err != nil {
		return err
	}
	decrypt(hb, hashString("(hash table)", 3))
	for i := 0; i < nHash; i++ {
		e := hb[i*16:]
		a.hashes = append(a.hashes, hashEntry{le.Uint32(e), le.Uint32(e[4:]), le.Uint32(e[12:])})
	}
	bb := make([]byte, nBlock*16)
	if _, err := a.f.ReadAt(bb, a.base+blockOff); err != nil {
		return err
	}
	decrypt(bb, hashString("(block table)", 3))
	for i := 0; i < nBlock; i++ {
		e := bb[i*16:]
		a.blocks = append(a.blocks, blockEntry{le.Uint32(e), le.Uint32(e[4:]), le.Uint32(e[8:]), le.Uint32(e[12:])})
	}
	return nil
}

func (a *Archive) find(name string) (blockEntry, bool) {
	n := uint32(len(a.hashes))
	if n == 0 {
		return blockEntry{}, false
	}
	start := hashString(name, 0) & (n - 1)
	ha, hb := hashString(name, 1), hashString(name, 2)
	for i := uint32(0); i < n; i++ {
		e := a.hashes[(start+i)%n]
		if e.block == 0xFFFFFFFF {
			break
		}
		if e.a == ha && e.b == hb && e.block < uint32(len(a.blocks)) {
			b := a.blocks[e.block]
			if b.flags&flagExists != 0 {
				return b, true
			}
		}
	}
	return blockEntry{}, false
}

// Has says whether the archive holds the file (a path like data\global\excel\hireling.txt, any case).
func (a *Archive) Has(name string) bool {
	_, ok := a.find(name)
	return ok
}

// ReadFile returns a file's contents.
func (a *Archive) ReadFile(name string) ([]byte, error) {
	b, ok := a.find(name)
	if !ok {
		return nil, os.ErrNotExist
	}
	raw := make([]byte, b.csize)
	if _, err := a.f.ReadAt(raw, a.base+int64(b.pos)); err != nil {
		return nil, err
	}
	var key uint32
	if b.flags&flagEncrypted != 0 {
		base := name
		if i := strings.LastIndexAny(name, `\/`); i >= 0 {
			base = name[i+1:]
		}
		key = hashString(base, 3)
		if b.flags&flagFixKey != 0 {
			key = (key + b.pos) ^ b.size
		}
	}
	compressed := b.flags&(flagImplode|flagCompress) != 0
	if b.flags&flagSingleUnit != 0 {
		if b.flags&flagEncrypted != 0 {
			decrypt(raw, key)
		}
		if compressed && b.csize < b.size {
			return decompress(raw, int(b.size), b.flags)
		}
		return raw, nil
	}
	nSect := (int(b.size) + a.sectorSize - 1) / a.sectorSize
	var offs []uint32
	if compressed {
		if len(raw) < (nSect+1)*4 {
			return nil, errors.New("short sector table")
		}
		t := make([]byte, (nSect+1)*4)
		copy(t, raw)
		if b.flags&flagEncrypted != 0 {
			decrypt(t, key-1)
		}
		for i := 0; i <= nSect; i++ {
			offs = append(offs, binary.LittleEndian.Uint32(t[i*4:]))
		}
	} else {
		for i := 0; i <= nSect; i++ {
			o := i * a.sectorSize
			if o > int(b.size) {
				o = int(b.size)
			}
			offs = append(offs, uint32(o))
		}
	}
	out := make([]byte, 0, b.size)
	for i := 0; i < nSect; i++ {
		if offs[i] > offs[i+1] || int(offs[i+1]) > len(raw) {
			return nil, errors.New("bad sector offsets")
		}
		s := append([]byte(nil), raw[offs[i]:offs[i+1]]...)
		if b.flags&flagEncrypted != 0 {
			decrypt(s, key+uint32(i))
		}
		want := a.sectorSize
		if rest := int(b.size) - len(out); rest < want {
			want = rest
		}
		if compressed && len(s) < want {
			d, err := decompress(s, want, b.flags)
			if err != nil {
				return nil, fmt.Errorf("sector %d: %w", i, err)
			}
			s = d
		}
		out = append(out, s...)
	}
	return out, nil
}

func decompress(s []byte, want int, flags uint32) ([]byte, error) {
	if flags&flagImplode != 0 {
		return explode(s, want)
	}
	if len(s) == 0 {
		return nil, errors.New("empty sector")
	}
	mask, data := s[0], s[1:]
	switch mask {
	case 0x08:
		return explode(data, want)
	case 0x02:
		r, err := zlib.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		return io.ReadAll(r)
	case 0x10:
		return io.ReadAll(bzip2.NewReader(bytes.NewReader(data)))
	}
	return nil, fmt.Errorf("compression 0x%02x is not supported", mask)
}
