package main

import (
	"os"
	"path/filepath"
	"testing"
)

// The tests read the real quest table of the repository, the same file the bots read.
func init() {
	if err := loadQuestTable(filepath.Join("..", "..", "d2bs", "kolbot", "libs", "common", "QuestTable.json")); err != nil {
		panic(err)
	}
}

func TestQuestTableMatchesWhatTheQuesterPlays(t *testing.T) {
	if len(questTable) != 25 {
		t.Errorf("the Quester plays 25 quests, the table has %d", len(questTable))
	}
	for _, id := range []int{20, 21} {
		for _, q := range questTable {
			if q.ID == id {
				t.Errorf("quest %d is in the table but not played: it must not be on the sheets", id)
			}
		}
	}
	got := map[int]string{}
	for _, p := range pointQuests {
		got[p.ID] = p.Title
	}
	for _, id := range []int{1, 9, 17, 20, 25} {
		if got[id] == "" {
			t.Errorf("quest %d has a reward in the table", id)
		}
	}
	if len(pointQuests) != 5 {
		t.Errorf("five quests give skill points, stat points or life, got %d", len(pointQuests))
	}
}

func TestLoadQuestTableRefusesABrokenFile(t *testing.T) {
	keepT, keepP, keepA, keepL := questTable, pointQuests, questAliases, questAll
	defer func() { questTable, pointQuests, questAliases, questAll = keepT, keepP, keepA, keepL }()
	dir := t.TempDir()
	for name, content := range map[string]string{"empty.json": `{"quests":[]}`, "bad.json": `{`} {
		os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644)
		if err := loadQuestTable(filepath.Join(dir, name)); err == nil {
			t.Errorf("%s must be refused", name)
		}
	}
	if len(questTable) != len(keepT) {
		t.Error("a refused file must leave the loaded table alone")
	}
}
