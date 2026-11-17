package main

import (
	"d2qolbot/internal/spec"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Party analysis: which quests each checked bot has done, read from the character files (.d2s), so it works for bots that are
// stopped and shows all three difficulties. The file holds what the character last saved, not what a running game has in memory.

// questRow is one quest of the quest table: the quests the sheets show (the ones the Quester plays).
type questRow struct {
	Act   int    `json:"act"`
	ID    int    `json:"id"`
	Title string `json:"title"`
}

// questFileRow is a row of d2bs/kolbot/libs/common/QuestTable.json, the one table the Quester (libs/common/QuestTable.js) and Qolbot both read.
type questFileRow struct {
	Act     int      `json:"act"`
	ID      int      `json:"id"`
	Title   string   `json:"title"`
	Play    *bool    `json:"play"`
	Manual  bool     `json:"manual"`
	Aliases []string `json:"aliases"`
	Reward  *struct {
		Skill int    `json:"skill"`
		Stat  int    `json:"stat"`
		Life  int    `json:"life"`
		How   string `json:"how"`
	} `json:"reward"`
}

var (
	questTable   []questRow          // the quests the Quester plays, in the table's order
	pointQuests  []pointQuest        // the quests whose reward is skill points, stat points or life (audit.go)
	questAliases map[string][]string // title -> other spellings in older logs
	questAll     []questRow          // every row, played or not (for finding a quest by its title)
	manualQuest  = map[int]bool{}    // the quests whose last step is a reward only the player can choose
)

// loadQuestTable reads the quest table. Without it the sheets and the audit have nothing to show, so a missing or broken file is an error.
func loadQuestTable(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var doc struct {
		Quests []questFileRow `json:"quests"`
	}
	if err := json.Unmarshal(b, &doc); err != nil {
		return fmt.Errorf("%s: %v", path, err)
	}
	if len(doc.Quests) == 0 {
		return fmt.Errorf("%s: no quests in it", path)
	}
	table, points, all, aliases := []questRow{}, []pointQuest{}, []questRow{}, map[string][]string{}
	manual := map[int]bool{}
	for _, q := range doc.Quests {
		if q.Manual {
			manual[q.ID] = true
		}
		row := questRow{q.Act, q.ID, q.Title}
		all = append(all, row)
		aliases[q.Title] = q.Aliases
		if q.Play == nil || *q.Play {
			table = append(table, row)
		}
		if q.Reward != nil {
			points = append(points, pointQuest{ID: q.ID, Title: q.Title, Skill: q.Reward.Skill, Stat: q.Reward.Stat, Life: q.Reward.Life, How: q.Reward.How})
		}
	}
	questTable, pointQuests, questAll, questAliases, manualQuest = table, points, all, aliases, manual
	return nil
}

// questTablePath is where the table lives under the Qolbot folder.
func (m *Manager) questTablePath() string {
	return filepath.Join(m.root, "d2bs", "kolbot", "libs", "common", "QuestTable.json")
}

// readQuestWords returns the raw quest words of a character file for Normal, Nightmare and Hell, indexed by quest id (the quest block follows
// the "Woo!" marker: 6 bytes, then 96 bytes = 48 words per difficulty). Bit 0 of a word is "complete", the bit Quester.getQuestProgress tests
// with me.getQuest(id, 0); bit 1 set with bit 0 clear is a reward waiting.
func readQuestWords(path string) (words [3][48]uint16, ok bool) {
	b, err := os.ReadFile(path)
	if err != nil || len(b) < 345+96*3 || string(b[335:339]) != "Woo!" {
		return
	}
	for d := 0; d < 3; d++ {
		for q := 0; q < 48; q++ {
			words[d][q] = binary.LittleEndian.Uint16(b[345+96*d+q*2:])
		}
	}
	return words, true
}

// readQuestDone returns, for Normal, Nightmare and Hell, the ids of the quests of questTable whose "complete" bit is set.
func readQuestDone(path string) (done [3][]int, ok bool) {
	words, ok := readQuestWords(path)
	if !ok {
		return
	}
	for d := 0; d < 3; d++ {
		done[d] = []int{}
		for _, q := range questAll { // every quest of the game: the sheet shows the ones the bots do not play too
			if words[d][q.ID]&1 != 0 {
				done[d] = append(done[d], q.ID)
			}
		}
	}
	return done, true
}

// readQuestPending returns, per difficulty, the quests whose only step left is the hand-in: bit 1 set, bit 0 not (the game's "reward pending", what
// Quester.questPending checks in a game).
func readQuestPending(path string) (pending [3][]int, ok bool) {
	words, ok := readQuestWords(path)
	if !ok {
		return
	}
	for d := 0; d < 3; d++ {
		pending[d] = []int{}
		for _, q := range questAll {
			if w := words[d][q.ID]; w&1 == 0 && w&2 != 0 {
				pending[d] = append(pending[d], q.ID)
			}
		}
	}
	return pending, true
}

// BotQuests is one bot's row of the party analysis.
type BotQuests struct {
	Name    string   `json:"name"`
	Char    string   `json:"char"`
	Level   int      `json:"level"`
	MaxLife int      `json:"maxLife,omitempty"` // the base maximum life in the save (level, class and vitality; no gear): who is sturdy enough to lead
	Done    [3][]int `json:"done"`
	Pending [3][]int `json:"pending,omitempty"` // only the hand-in left (readQuestPending): the bot finishes it at its next visit to the NPC
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
			if pd, ok := readQuestPending(p); ok {
				bq.Pending = pd
			}
			if _, ci, ok := readD2S(p); ok {
				bq.Level = ci.Level
			}
			if raw, err := os.ReadFile(p); err == nil {
				if sv, err := spec.ParseSave(raw); err == nil {
					bq.MaxLife = sv.MaxLifeRaw / 256
				}
			}
		}
		bots = append(bots, bq)
	}
	return map[string]any{"quests": questAll, "bots": bots} // every quest of the game, played or not: all of them have to get done
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

func normTitle(s string) string {
	var b []rune
	for _, r := range strings.ToLower(s) {
		if r >= 'a' && r <= 'z' {
			b = append(b, r)
		}
	}
	return string(b)
}

// questIDByTitle finds the quest id for a title as the bots print it ("Radament's Lair" in act 2), whatever the spelling.
func questIDByTitle(act int, title string) (int, bool) {
	want := normTitle(title)
	for _, q := range questAll {
		if q.Act != act {
			continue
		}
		if normTitle(q.Title) == want {
			return q.ID, true
		}
		for _, a := range questAliases[q.Title] {
			if normTitle(a) == want {
				return q.ID, true
			}
		}
	}
	return 0, false
}

// how often verifyQuest looks at the file, how long it waits for a save to show the quest, and how long it tries (variables for the tests)
var (
	verifyPoll     = 3 * time.Second
	verifyPatience = 20 * time.Second
	verifyDeadline = 2 * time.Minute
)

// verifyQuest checks a "Quest Complete" entry against the character file. The Quester says "complete" when the game's own quest check says
// so, and that check can be ahead of what the server wrote (it was for Radament's Lair twice). After the bot has saved, the file is the truth:
// the entry is marked "saved" when the quest's complete bit is set in it and "notsaved" when it is not. It waits up to two minutes for the save.
func (m *Manager) verifyQuest(profile string, ev ActivityEvent) {
	var act int
	fmt.Sscanf(ev.Detail, "Act %d", &act)
	id, ok := questIDByTitle(act, ev.Name)
	m.mu.Lock()
	st := m.states[profile]
	var character, diff string
	if st != nil {
		character, diff = st.Character, st.Difficulty
	}
	m.mu.Unlock()
	d := -1
	for i, n := range difficultyNames {
		if n == diff {
			d = i
		}
	}
	if !ok || character == "" || d < 0 {
		return // cannot tell which quest or difficulty: leave the entry as it is
	}
	path := m.savePath(character)
	deadline := time.Now().Add(verifyDeadline)
	var seenAt, seenMod time.Time // when a save after the entry was first seen, and its time stamp
	for time.Now().Before(deadline) {
		time.Sleep(verifyPoll)
		fi, err := os.Stat(path)
		if err != nil || fi.ModTime().Before(ev.Time.Add(-3*time.Second)) {
			continue // the bot has not saved since it said so
		}
		words, ok := readQuestWords(path)
		if !ok {
			continue
		}
		if words[d][id]&1 != 0 {
			m.setQuestVerified(profile, ev, "saved")
			return
		}
		if seenAt.IsZero() {
			seenAt, seenMod = time.Now(), fi.ModTime()
		}
		// a save after the entry that still says not complete: a later save has not fixed it either, or a while has gone by
		if !fi.ModTime().Equal(seenMod) || time.Since(seenAt) > verifyPatience {
			m.setQuestVerified(profile, ev, "notsaved")
			m.logf(9, profile, "%q is reported complete, but the saved character does not have it as complete", ev.Name)
			return
		}
	}
}

func (m *Manager) setQuestVerified(profile string, ev ActivityEvent, v string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := len(m.events) - 1; i >= 0; i-- {
		if e := &m.events[i]; e.Kind == "quest" && e.Bot == profile && e.Name == ev.Name && e.Detail == ev.Detail {
			e.Verified = v
			return
		}
	}
}

// logQuestWordsAtStart writes what the character file says about the quests that give points, just before the bot starts, to Qolbot's log.
// The bot logs the same quests as the game sees them once it has loaded (Quester.logBits at the start of a run): when a quest is complete in the
// file and not complete in the game, the game took the completion back when the character loaded.
func (m *Manager) logQuestWordsAtStart(profile, character string) {
	words, ok := readQuestWords(m.savePath(character))
	if !ok {
		return
	}
	var parts []string
	for _, q := range pointQuests {
		var w []string
		for d := 0; d < 3; d++ {
			w = append(w, fmt.Sprintf("%04x", words[d][q.ID]))
		}
		parts = append(parts, fmt.Sprintf("%s %s", q.Title, strings.Join(w, "/")))
	}
	m.logf(0, profile, "saved file before start, quest words Normal/Nightmare/Hell (bit 0 = complete): %s", strings.Join(parts, "; "))
}
