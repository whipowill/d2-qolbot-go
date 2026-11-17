package mpq

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// QOLBOT_GAMEDIR=<game folder>: which .mpq holds the merc table, read only. QOLBOT_STOCKDIR=<folder with the stock Data/global/excel/Hireling.txt>:
// the one read out of Patch_D2.mpq must be the same bytes.
func TestRealArchives(t *testing.T) {
	dir := os.Getenv("QOLBOT_GAMEDIR")
	if dir == "" {
		t.Skip("QOLBOT_GAMEDIR not set")
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.mpq"))
	files2, _ := filepath.Glob(filepath.Join(dir, "*.MPQ"))
	files = append(files, files2...)
	for _, f := range files {
		a, err := Open(f)
		if err != nil {
			t.Logf("%s: %v", filepath.Base(f), err)
			continue
		}
		for _, n := range []string{`data\global\excel\hireling.txt`, `data\global\excel\skills.txt`, `data\global\excel\hireling.bin`} {
			if !a.Has(n) {
				continue
			}
			b, err := a.ReadFile(n)
			t.Logf("%s: %s %d bytes, err %v, starts %q", filepath.Base(f), n, len(b), err, string(b[:min(len(b), 40)]))
			if stock := os.Getenv("QOLBOT_STOCKDIR"); stock != "" && err == nil && n == `data\global\excel\hireling.txt` {
				want, _ := os.ReadFile(filepath.Join(stock, "Data", "global", "excel", "Hireling.txt"))
				t.Logf("   same as the stock file: %v", bytes.Equal(b, want))
			}
		}
		a.Close()
	}
}

// The table keys every MPQ reader agrees on.
func TestHashString(t *testing.T) {
	if h := hashString("(hash table)", 3); h != 0xC3AF3770 {
		t.Errorf("hash table key %08x", h)
	}
	if h := hashString("(block table)", 3); h != 0xEC83B3A3 {
		t.Errorf("block table key %08x", h)
	}
}

// blast.c's own test: these 8 bytes explode to "AIAIAIAIAIAIA".
func TestExplode(t *testing.T) {
	out, err := explode([]byte{0x00, 0x04, 0x82, 0x24, 0x25, 0x8f, 0x80, 0x7f}, 13)
	if err != nil || string(out) != "AIAIAIAIAIAIA" {
		t.Errorf("%q %v", out, err)
	}
}
