package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Party analysis: which quests each checked bot has done, read from the character files (.d2s), so it works for bots that are
// stopped and shows all three difficulties. The file holds what the character last saved, not what a running game has in memory.

// questRow is one quest of Quester.quests (d2bs/kolbot/libs/common/Quester.js): the same ids, in the same order.
type questRow struct {
	Act   int    `json:"act"`
	ID    int    `json:"id"`
	Title string `json:"title"`
}

var questTable = []questRow{
	{1, 1, "Den of Evil"}, {1, 2, "Sisters' Burial Grounds"}, {1, 4, "Search for Cain"}, {1, 5, "Forgotten Tower"}, {1, 3, "Tools of the Trade"}, {1, 6, "Sisters to the Slaughter"},
	{2, 9, "Radament's Lair"}, {2, 10, "Horadric Staff"}, {2, 11, "Tainted Sun"}, {2, 12, "Arcane Sanctuary"}, {2, 13, "Summoner"}, {2, 14, "Seven Tombs"},
	{3, 19, "Blade of the Old Religion"}, {3, 18, "Khalim's Will"}, {3, 17, "Lam Esen's Tome"}, {3, 22, "The Guardian"},
	{4, 25, "Fallen Angel"}, {4, 27, "Hell's Forge"}, {4, 26, "Terror's End"},
	{5, 35, "Siege on Harrogath"}, {5, 36, "Rescue on Mount Arreat"}, {5, 37, "Prison of Ice"}, {5, 38, "Betrayal of Harrogath"}, {5, 39, "Rite of Passage"}, {5, 40, "Eve of Destruction"},
}

// readQuestDone returns, for Normal, Nightmare and Hell, the ids of the quests whose "complete" bit is set (the bit Quester.getQuestProgress
// tests with me.getQuest(id, 0)). The quest block follows the "Woo!" marker: 6 bytes, then 96 bytes (48 words, indexed by quest id) per difficulty.
func readQuestDone(path string) (done [3][]int, ok bool) {
	b, err := os.ReadFile(path)
	if err != nil || len(b) < 345+96*3 || string(b[335:339]) != "Woo!" {
		return
	}
	for d := 0; d < 3; d++ {
		blk := b[345+96*d : 345+96*(d+1)]
		done[d] = []int{}
		for _, q := range questTable {
			if binary.LittleEndian.Uint16(blk[q.ID*2:])&1 != 0 {
				done[d] = append(done[d], q.ID)
			}
		}
	}
	return done, true
}

// BotQuests is one bot's row of the party analysis.
type BotQuests struct {
	Name    string   `json:"name"`
	Char    string   `json:"char"`
	Level   int      `json:"level"`
	Done    [3][]int `json:"done"`
	SavedAt string   `json:"savedAt,omitempty"`
	Problem string   `json:"problem,omitempty"`
}

// partyQuests reads the saves of the named profiles.
func (m *Manager) partyQuests(names []string) map[string]any {
	m.mu.Lock()
	type who struct{ name, char string }
	var ws []who
	for _, n := range names {
		if s := m.states[n]; s != nil {
			ws = append(ws, who{n, s.Character})
		}
	}
	m.mu.Unlock()
	dir := m.saveDir()
	bots := []BotQuests{}
	for _, w := range ws {
		bq := BotQuests{Name: w.name, Char: w.char, Done: [3][]int{{}, {}, {}}}
		p := filepath.Join(dir, w.char+".d2s")
		if dir == "" {
			bq.Problem = "the save folder is not known (set the path to Game.exe first)"
		} else if fi, err := os.Stat(p); err != nil {
			bq.Problem = "no save file for " + w.char
		} else if d, ok := readQuestDone(p); !ok {
			bq.Problem = "could not read the quests from " + w.char + ".d2s"
		} else {
			bq.Done, bq.SavedAt = d, fi.ModTime().Format(time.RFC3339)
			if _, ci, ok := readD2S(p); ok {
				bq.Level = ci.Level
			}
		}
		bots = append(bots, bq)
	}
	return map[string]any{"quests": questTable, "bots": bots}
}

func splitNames(s string) []string {
	var out []string
	for _, n := range strings.Split(s, ",") {
		if n = strings.TrimSpace(n); n != "" {
			out = append(out, n)
		}
	}
	return out
}
