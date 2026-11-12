package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadQuestDone(t *testing.T) {
	b := make([]byte, 345+96*3+10)
	copy(b[335:], "Woo!")
	binary.LittleEndian.PutUint16(b[345+1*2:], 0x0001)       // Normal: Den of Evil complete
	binary.LittleEndian.PutUint16(b[345+4*2:], 0x8010)       // Normal: Search for Cain not complete
	binary.LittleEndian.PutUint16(b[345+96*2+40*2:], 0x0001) // Hell: Eve of Destruction complete
	p := filepath.Join(t.TempDir(), "x.d2s")
	os.WriteFile(p, b, 0o644)
	done, ok := readQuestDone(p)
	if !ok || len(done[0]) != 1 || done[0][0] != 1 || len(done[1]) != 0 || len(done[2]) != 1 || done[2][0] != 40 {
		t.Fatalf("got %v %v", done, ok)
	}
}

func TestIniCarriesTheDifficulty(t *testing.T) {
	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, "d2bs"), 0o755)
	m := &Manager{root: root, cfg: Config{ScriptPath: "kolbot", HostIP: "localhost", Difficulty: "Nightmare"}, states: map[string]*State{"A": {Profile: Profile{Name: "A", Character: "A"}}}}
	if ini := iniFor(t, m); !strings.Contains(ini, "SPDifficulty=1\r\n") {
		t.Errorf("Nightmare must be SPDifficulty=1:\n%s", ini)
	}
	m.cfg.Difficulty = ""
	if ini := iniFor(t, m); !strings.Contains(ini, "SPDifficulty=2\r\n") {
		t.Errorf("the default must be Hell (2):\n%s", ini)
	}
}
