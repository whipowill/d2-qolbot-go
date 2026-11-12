package spec

import (
	"os"
	"path/filepath"
	"testing"
)

// saveDir is the user's real Save folder; tests that need it are skipped when it is absent.
func saveDir(t *testing.T) string {
	d := os.Getenv("D2_SAVE_DIR")
	if d == "" {
		t.Skip("set D2_SAVE_DIR to a Diablo II Save folder to run this test")
	}
	if _, err := os.Stat(filepath.Join(d, "Darius.d2s")); err != nil {
		t.Skip("no real saves available")
	}
	return d
}

// Ground truth for Darius comes from the in-game probe (SPEC: lines in d2bs.log, 2026-11-08):
// level 14, str 31 ene 15 dex 50 vit 61, 0 unspent, Sacrifice 1, Smite 1, Might 8, Zeal 3, Charge 1.
func TestReadSaveMatchesInGameProbe(t *testing.T) {
	s, err := ReadSave(filepath.Join(saveDir(t), "Darius.d2s"))
	if err != nil {
		t.Fatal(err)
	}
	if s.Name != "Darius" || ClassNames[s.Class] != "Paladin" {
		t.Fatalf("header: %+v", s)
	}
	if s.Level != 14 {
		t.Skipf("Darius has progressed past the recorded probe (level %d); ground truth no longer applies", s.Level)
	}
	// The save holds BASE stats; the in-game numbers include gear (+6 str, +1 dex on Darius).
	if s.Str != 25 || s.Ene != 15 || s.Dex != 49 || s.Vit != 61 {
		t.Errorf("base stats str=%d ene=%d dex=%d vit=%d, want 25 15 49 61", s.Str, s.Ene, s.Dex, s.Vit)
	}
	if s.UnspentStats != 0 || s.UnspentSkills != 0 {
		t.Errorf("unspent stats=%d skills=%d, want 0 0", s.UnspentStats, s.UnspentSkills)
	}
	want := map[int]int{96: 1, 97: 1, 98: 8, 106: 3, 107: 1}
	if len(s.Skills) != len(want) {
		t.Errorf("skills %v, want %v", s.Skills, want)
	}
	for id, p := range want {
		if s.Skills[id] != p {
			t.Errorf("skill %d = %d, want %d", id, s.Skills[id], p)
		}
	}
}
