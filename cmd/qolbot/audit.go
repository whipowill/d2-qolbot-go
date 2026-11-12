package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"d2qolbot/internal/spec"
)

// Point audit: does a character have the skill points, stat points and life its level and its finished quests should have given it?
// A quest can be marked complete (a party member gets the credit) while the reward was never taken: the Book of Skill that Radament
// drops has to be picked up and read by the character itself, and so on. This reads each character's save once, adds up what the
// rules say it should hold, and reports a shortage. The player can then have the shortage put back (restorePoints).
//
// What a save can and cannot show (Diablo II 1.13 quest rewards that change the character for good):
//   checked   skill points: Den of Evil 1, Radament's Lair 1 (the Book of Skill), Fallen Angel 2, each per difficulty
//   checked   stat points: Lam Esen's Tome 5 per difficulty
//   checked   life: Alkor's Potion of Life (The Golden Bird) +20 maximum life per difficulty
//   not seen  Scroll of Resistance (Prison of Ice, +10 resistances per difficulty): kept in no attribute and in no quest bit that differs
//             between characters; Malah's Potion only cures frostbite; Charsi's imbue, Larzuk's socket and Anya's naming are item
//             choices (the quest word shows "reward waiting", the Quest Progress sheet lists them)

// pointQuest is a quest whose reward is skill points, stat points or life: the rows of the quest table (quests.go) that have a "reward".
type pointQuest struct {
	ID                int
	Title             string
	Skill, Stat, Life int
	How               string // what the character has to do for the reward
}

// startStats is the total of Strength, Dexterity, Vitality and Energy a new character of each class starts with (spec.ClassNames order).
var startStats = []int{80, 80, 80, 85, 85, 80, 85}

// lifeClass: the base life of a new character, the life per level, the life per point of Vitality and the Vitality it starts with.
// Checked against eight real saves (exact for Barbarian, Paladin, Necromancer, Assassin, Sorceress, Druid; Amazon to 1 point).
var lifeClass = []struct {
	Start, PerLevel, PerVit float64
	StartVit                int
}{
	{50, 2, 3, 20},   // Amazon
	{40, 1, 2, 10},   // Sorceress
	{45, 1.5, 2, 15}, // Necromancer
	{55, 2, 3, 25},   // Paladin
	{55, 2, 4, 25},   // Barbarian
	{55, 1.5, 2, 25}, // Druid
	{50, 2, 3, 20},   // Assassin
}

var difficultyNames = []string{"Normal", "Nightmare", "Hell"}

// PointCheck is one kind of point: what the character holds against what it should hold.
type PointCheck struct {
	Have    int `json:"have"`
	Expect  int `json:"expect"`
	Missing int `json:"missing"`
}

// PointAudit is the result for one character. Problem is true when something is missing.
type PointAudit struct {
	Problem bool       `json:"problem"`
	Skill   PointCheck `json:"skill"`
	Stat    PointCheck `json:"stat"`
	Life    PointCheck `json:"life"`
	Lines   []string   `json:"lines"` // what to tell the player
}

// owedQuest is a finished quest whose reward the character should hold.
type owedQuest struct {
	q    pointQuest
	diff int
}

// auditPoints works out the audit from a parsed save and its raw quest words.
func auditPoints(sv *spec.Save, words [3][48]uint16) *PointAudit {
	a := &PointAudit{}
	skillQ, statQ, lifeQ := 0, 0, 0
	var owing []owedQuest
	for d := 0; d < 3; d++ {
		for _, q := range pointQuests {
			if words[d][q.ID]&1 != 0 {
				skillQ += q.Skill
				statQ += q.Stat
				lifeQ += q.Life
				owing = append(owing, owedQuest{q, d})
			}
		}
	}
	levels := sv.Level - 1
	known := sv.Class >= 0 && sv.Class < len(startStats)
	a.Skill = PointCheck{Have: sumSkills(sv) + sv.UnspentSkills, Expect: levels + skillQ}
	a.Stat = PointCheck{Have: sv.Str + sv.Dex + sv.Vit + sv.Ene + sv.UnspentStats}
	if known {
		a.Stat.Expect = startStats[sv.Class] + 5*levels + statQ
		lc := lifeClass[sv.Class]
		a.Life = PointCheck{Have: sv.MaxLifeRaw / 256, Expect: int(lc.Start+float64(levels)*lc.PerLevel+float64(sv.Vit-lc.StartVit)*lc.PerVit+0.5) + lifeQ}
	}
	a.Skill.Missing = max0(a.Skill.Expect - a.Skill.Have)
	a.Stat.Missing = max0(a.Stat.Expect - a.Stat.Have)
	if known && sv.MaxLifeRaw > 0 {
		// whole potions only (20 each): a point or two of difference is rounding in the class tables, not a missing potion
		a.Life.Missing = 20 * ((max0(a.Life.Expect-a.Life.Have) + 10) / 20)
	}
	a.Problem = a.Skill.Missing > 0 || a.Stat.Missing > 0 || a.Life.Missing > 0
	if !a.Problem {
		return a
	}

	if a.Skill.Missing > 0 {
		a.Lines = append(a.Lines, fmt.Sprintf("Skill points: %d found, %d expected (level %d gives %d, finished quests give %d). %d missing.",
			a.Skill.Have, a.Skill.Expect, sv.Level, levels, skillQ, a.Skill.Missing))
		a.Lines = append(a.Lines, rewardLines(owing, "skill points", func(q pointQuest) int { return q.Skill })...)
	}
	if a.Stat.Missing > 0 {
		a.Lines = append(a.Lines, fmt.Sprintf("Stat points: %d found, %d expected (a new character starts with %d, level %d gives %d, finished quests give %d). %d missing.",
			a.Stat.Have, a.Stat.Expect, startStats[sv.Class], sv.Level, 5*levels, statQ, a.Stat.Missing))
		a.Lines = append(a.Lines, rewardLines(owing, "stat points", func(q pointQuest) int { return q.Stat })...)
	}
	if a.Life.Missing > 0 {
		a.Lines = append(a.Lines, fmt.Sprintf("Life: %d found, %d expected from level, Vitality and %d Potion(s) of Life. %d missing (%d potion(s)).",
			a.Life.Have, a.Life.Expect, lifeQ/20, a.Life.Missing, a.Life.Missing/20))
		a.Lines = append(a.Lines, rewardLines(owing, "life", func(q pointQuest) int { return q.Life })...)
	}
	a.Lines = append(a.Lines, "A quest is marked complete when anyone in the party finishes it, but the reward only counts when this character takes it itself. A respec, a mod or a character edited elsewhere can also change the totals.")
	return a
}

// rewardLines lists the finished quests that count towards one kind of point, so the player knows which reward to look for.
func rewardLines(owing []owedQuest, unit string, points func(pointQuest) int) []string {
	lines := []string{"Quests counted:"}
	for _, o := range owing {
		if n := points(o.q); n > 0 {
			lines = append(lines, fmt.Sprintf("  %s (%s): %d %s: %s", o.q.Title, difficultyNames[o.diff], n, unit, o.q.How))
		}
	}
	return lines
}

func sumSkills(sv *spec.Save) int {
	n := 0
	for _, v := range sv.Skills {
		n += v
	}
	return n
}

func max0(n int) int {
	if n < 0 {
		return 0
	}
	return n
}

// auditFile reads a character file and audits it.
func auditFile(path string) (*PointAudit, *spec.Save, error) {
	sv, err := spec.ReadSave(path)
	if err != nil {
		return nil, nil, err
	}
	words, ok := readQuestWords(path)
	if !ok {
		return nil, nil, fmt.Errorf("no quest data in %s", path)
	}
	return auditPoints(sv, words), sv, nil
}

var (
	auditMu   sync.Mutex
	auditData = map[string]*PointAudit{} // character -> result
	auditRan  bool
)

// auditAll audits every character the manager knows. It runs once, on the first page load: the saves do not change under it
// in a way that matters until the next "Rescan characters" or a restore (which run it again).
func (m *Manager) auditAll() {
	m.mu.Lock()
	var chars []string
	for _, s := range m.states {
		if s.Character != "" {
			chars = append(chars, s.Character)
		}
	}
	m.mu.Unlock()
	sort.Strings(chars)
	dir := m.saveDir()
	out := map[string]*PointAudit{}
	for _, c := range chars {
		if a, _, err := auditFile(filepath.Join(dir, c+".d2s")); err == nil {
			out[c] = a
		}
	}
	auditMu.Lock()
	auditData, auditRan = out, true
	auditMu.Unlock()
}

// auditFor returns the audit of a character (nil when it has none or nothing is missing); the first call runs the audit for everybody.
func (m *Manager) auditFor(character string) *PointAudit {
	auditMu.Lock()
	ran := auditRan
	auditMu.Unlock()
	if !ran {
		m.auditAll()
	}
	auditMu.Lock()
	defer auditMu.Unlock()
	if a := auditData[character]; a != nil && a.Problem {
		return a
	}
	return nil
}

func (m *Manager) auditReset() {
	auditMu.Lock()
	auditRan = false
	auditMu.Unlock()
}

// restorePoints puts back what the audit found missing from a stopped bot's character: it adds the skill points, the stat points and the
// life to the character file. It reads the file fresh, refuses a bot that is running (the game rewrites the file), keeps a copy of the file
// in <qolbot folder>/backups first, checks that the new file reads back as complete, and replaces the file in one step.
func (m *Manager) restorePoints(profile string) (string, error) {
	m.mu.Lock()
	st := m.states[profile]
	var character, status string
	if st != nil {
		character, status = st.Character, st.Status
	}
	m.mu.Unlock()
	if st == nil || character == "" {
		return "", fmt.Errorf("there is no bot called %q", profile)
	}
	if status != "stopped" {
		return "", fmt.Errorf("%s is %s: stop the bot first (a running game rewrites the character file)", profile, status)
	}
	path := m.savePath(character)
	a, _, err := auditFile(path)
	if err != nil {
		return "", err
	}
	if !a.Problem {
		return "", fmt.Errorf("nothing is missing from %s", character)
	}
	orig, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	add := map[int]int{}
	var did []string
	if a.Skill.Missing > 0 {
		add[spec.AttrUnspentSkills] = a.Skill.Missing
		did = append(did, fmt.Sprintf("%d skill point(s)", a.Skill.Missing))
	}
	if a.Stat.Missing > 0 {
		add[spec.AttrUnspentStats] = a.Stat.Missing
		did = append(did, fmt.Sprintf("%d stat point(s)", a.Stat.Missing))
	}
	if a.Life.Missing > 0 {
		add[spec.AttrMaxLife] = a.Life.Missing * 256
		add[spec.AttrLife] = a.Life.Missing * 256
		did = append(did, fmt.Sprintf("%d life", a.Life.Missing))
	}
	patched, err := spec.PatchAttributes(orig, add)
	if err != nil {
		return "", err
	}
	// the new file must read back, and the audit must have nothing left to say about it
	tmp := path + ".qolbot-new"
	if err := os.WriteFile(tmp, patched, 0o644); err != nil {
		return "", err
	}
	defer os.Remove(tmp)
	if again, _, err := auditFile(tmp); err != nil || again.Problem {
		return "", fmt.Errorf("the restored file did not check out (%v): nothing was changed", err)
	}
	backups := filepath.Join(m.root, "backups")
	if err := os.MkdirAll(backups, 0o755); err != nil {
		return "", err
	}
	backup := filepath.Join(backups, fmt.Sprintf("%s-%s.d2s", character, time.Now().Format("20060102-150405")))
	if err := os.WriteFile(backup, orig, 0o644); err != nil {
		return "", fmt.Errorf("could not keep a backup, nothing was changed: %v", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return "", err
	}
	m.logf(0, profile, "restored points in %s: %s (backup %s)", path, joinAnd(did), backup)
	m.auditReset()
	return fmt.Sprintf("Added %s to %s. The old file is kept as %s.", joinAnd(did), character, backup), nil
}

func joinAnd(parts []string) string {
	switch len(parts) {
	case 0:
		return ""
	case 1:
		return parts[0]
	}
	s := parts[0]
	for i := 1; i < len(parts)-1; i++ {
		s += ", " + parts[i]
	}
	return s + " and " + parts[len(parts)-1]
}
