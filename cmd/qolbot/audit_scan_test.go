package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"d2qolbot/internal/spec"
)

// TestScanRealSaves prints the audit of every save in QOLBOT_SAVES (a folder); skipped when it is not set.
func TestScanRealSaves(t *testing.T) {
	dir := os.Getenv("QOLBOT_SAVES")
	if dir == "" {
		t.Skip("QOLBOT_SAVES not set")
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.d2s"))
	for _, f := range files {
		sv, err := spec.ReadSave(f)
		if err != nil {
			continue
		}
		words, ok := readQuestWords(f)
		if !ok {
			continue
		}
		a := auditPoints(sv, words)
		fmt.Printf("%-10s lvl %d  skill %d/%d  stat %d/%d  life %d/%d  problem=%v\n", sv.Name, sv.Level, a.Skill.Have, a.Skill.Expect, a.Stat.Have, a.Stat.Expect, a.Life.Have, a.Life.Expect, a.Problem)
		if a.Problem {
			fmt.Println("   " + strings.Join(a.Lines, "\n   "))
		}
	}
}
