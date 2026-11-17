package main

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// Quest mode runs by what the team needs, and nobody is asked (the Bots page has no Difficulty and no leader switch for it):
//   - the DIFFICULTY is the lowest one on which any of the bots still has a quest to do (questDifficulty);
//   - the LEADER is the bot that is furthest BEHIND, the one whose first quest not done comes first in the quest table. When it has caught up with the next bot, that bot leads, and so on, so the whole team
// gets everything done. What a bot has done is read from its save (the Quest Progress sheet's source), so it is as fresh as the last save
// (a finished quest is saved at once, see Saver.now).

// nextQuestIndex is the place in the quest table of the first quest in done[] that is not done. The quests whose last step is a reward only the
// player can choose (Charsi, Larzuk, Anya) do not hold anybody back. A bot that has done everything gets len(questTable).
func nextQuestIndex(done []int) int {
	have := map[int]bool{}
	for _, id := range done {
		have[id] = true
	}
	for i, q := range questTable {
		if !have[q.ID] && !manualQuest[q.ID] {
			return i
		}
	}
	return len(questTable)
}

// questProgress is, for each of the names, the index of the first quest not done on the objective's difficulty (and the level, for breaking ties).
func (m *Manager) questProgress(names []string) (idx map[string]int, level map[string]int) {
	idx, level = map[string]int{}, map[string]int{}
	diff := map[string]int{"Normal": 0, "Nightmare": 1, "Hell": 2}[m.difficultyNow()]
	for _, bq := range m.partyQuests(names)["bots"].([]BotQuests) {
		if bq.Problem != "" {
			continue // no save to read: not a candidate
		}
		// a quest with only the hand-in left counts as done here: the bot finishes it at its next visit to the NPC (its chores, or the first thing its
		// Quester does), so it does not have to lead the team back through the whole quest (the user, 2026-11-14: Xena led Burial Grounds again because
		// her save had Blood Raven dead and Kashya not yet talked to)
		idx[bq.Name], level[bq.Name] = nextQuestIndex(append(append([]int{}, bq.Done[diff]...), bq.Pending[diff]...)), bq.Level
		// A bot that has done the Horadric Staff quest (it has been to Act 2) but holds no Horadric Cube is "behind": the Cube is picked up once, by
		// the bot that ran that quest, and the others (credited with it) never had one (the user, 2026-11-14). It counts as standing at that quest,
		// so it leads until the Cube hunt (Quester.cubeHunt) has given it one.
		if hi := horadricStaffIndex(); hi >= 0 && idx[bq.Name] > hi && !m.hasCube(bq.Name) {
			idx[bq.Name] = hi
		}
	}
	return
}

// horadricStaffIndex is the place of the Horadric Staff quest (id 10) in the quest table, -1 when it is not there.
func horadricStaffIndex() int {
	for i, q := range questTable {
		if q.ID == 10 {
			return i
		}
	}
	return -1
}

// hasCube says whether the character has a Horadric Cube ("box") anywhere: carried, in the cube's place or in a stash page, read from its save
// (saveinv.go). A save that cannot be read counts as having one: nobody is held back on a guess.
func (m *Manager) hasCube(name string) bool {
	m.mu.Lock()
	s := m.states[name]
	character := ""
	if s != nil {
		character = s.Character
	}
	m.mu.Unlock()
	if character == "" {
		return true
	}
	rep, _, _ := m.saveInventory(character)
	if rep.Items == nil {
		return true
	}
	for _, it := range rep.Items {
		if it.C == "box" {
			return true
		}
	}
	for _, p := range rep.Pages {
		for _, it := range p.Items {
			if it.C == "box" {
				return true
			}
		}
	}
	return false
}

// chickenCounts is how often each bot has chickened in the last three hours (a bot that keeps running from its fights is a poor leader).
func (m *Manager) chickenCounts(names []string) map[string]int {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]int{}
	now := time.Now()
	for _, n := range names {
		out[n] = countChickens(m.chickenLog, n, now) // from the saved history: it survives a restart of the manager (chickens.go)
	}
	return out
}

// pickLeader returns the bot to lead among names: the one furthest behind (lowest first-quest-not-done), the higher level first on a tie, then
// by name. It also says why. "" when no save could be read.
func (m *Manager) pickLeader(names []string) (string, string) {
	idx, level := m.questProgress(names)
	var cands []string
	for n := range idx {
		cands = append(cands, n)
	}
	if len(cands) == 0 {
		return "", "no save file could be read"
	}
	// a bot with no scrolls and no gold to buy any cannot lead (unless nobody can: then the usual order decides and the fatal event says why)
	var able []string
	for _, n := range cands {
		if p, ok := m.readPurse(n); !ok || p.canLead() {
			able = append(able, n)
		}
	}
	if len(able) > 0 {
		cands = able
	}
	chick := m.chickenCounts(cands)
	sturdy := map[string]int{} // base maximum life in steps of 100: the sturdier bot leads and takes the first hits (2026-11-14: Xena, 278 life, led the Spider Cavern)
	for _, bq := range m.partyQuests(cands)["bots"].([]BotQuests) {
		sturdy[bq.Name] = bq.MaxLife / 100
	}
	stocked := map[string]bool{} // a leader with a few scrolls in its tome can open portals all game; one with a single scroll cannot
	solvent := map[string]bool{} // 2,000+ gold: can pay for repairs and potions while leading (Xena, 759 gold, chickened every 3 minutes: 2026-11-14)
	rich := map[string]int{}     // gold in steps of 500: a leader that can pay for its own potions and repairs
	for _, n := range cands {
		p, ok := m.readPurse(n)
		stocked[n] = !ok || p.Scrolls >= 4 || p.total() >= 3000 // gold buys the scrolls (2026-11-14: Xena, 693 gold, led on her 4 scrolls, could not repair or buy potions and chickened every 3 minutes; Barabas had 10,000)
		rich[n] = p.total() / 500
		solvent[n] = p.total() >= 2000
	}
	sort.Slice(cands, func(i, j int) bool {
		a, b := cands[i], cands[j]
		if idx[a] != idx[b] {
			return idx[a] < idx[b]
		}
		if stocked[a] != stocked[b] {
			return stocked[a]
		}
		if solvent[a] != solvent[b] {
			return solvent[a]
		}
		if chick[a] != chick[b] { // the sturdier bot leads: the one that has chickened less since Qolbot started (2026-11-13: Xena kept leading after three chickens because she was the richest)
			return chick[a] < chick[b]
		}
		if sturdy[a] != sturdy[b] {
			return sturdy[a] > sturdy[b]
		}
		if rich[a] != rich[b] {
			return rich[a] > rich[b]
		}
		if level[a] != level[b] {
			return level[a] > level[b]
		}
		return a < b
	})
	best := cands[0]
	why := "has everything done"
	if idx[best] < len(questTable) {
		why = fmt.Sprintf("is the furthest behind: next is %s", questTable[idx[best]].Title)
	}
	return best, why
}

// questDifficulty is the lowest difficulty on which one of the bots still has a quest to do ("Hell" when everything is done everywhere). A bot whose
// save cannot be read does not count.
func (m *Manager) questDifficulty(names []string) string {
	return lowestOpenDifficulty(m.partyQuests(names)["bots"].([]BotQuests))
}

func lowestOpenDifficulty(bots []BotQuests) string {
	for d, name := range []string{"Normal", "Nightmare", "Hell"} {
		for _, bq := range bots {
			if bq.Problem == "" && nextQuestIndex(bq.Done[d]) < len(questTable) {
				return name
			}
		}
	}
	return "Hell"
}

// dynamicLeaderOn: the objective is Quest and the leader bot hosts (nobody is playing): the leader and the difficulty follow the quests.
func (m *Manager) dynamicLeaderOn() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.cfg.Goal == "Quest" && m.cfg.NotPlaying && m.levelUp == nil
}

// setQuestDifficulty makes `diff` the difficulty of the objective. It reports whether that changed anything.
func (m *Manager) setQuestDifficulty(diff string) bool {
	m.mu.Lock()
	changed := m.cfg.Difficulty != diff
	m.cfg.Difficulty = diff
	m.mu.Unlock()
	if changed {
		m.saveConfig()
	}
	return changed
}

// dynamicLeaderLoop passes the lead on while the bots run: when another running bot is further behind than the leader has become, the team is
// restarted with that bot leading. Checked every 20 seconds, it costs only a look at the saves.
func (m *Manager) dynamicLeaderLoop() {
	for range time.Tick(20 * time.Second) {
		if !m.dynamicLeaderOn() {
			continue
		}
		m.mu.Lock()
		var running []string
		for n, s := range m.states {
			if s.Wanted && (s.Status == "running" || s.Status == "starting") {
				running = append(running, n)
			}
		}
		cur := m.cfg.Player
		m.mu.Unlock()
		sort.Strings(running)
		if len(running) < 2 {
			continue
		}
		// Everybody has finished this difficulty: NOTHING happens. The bots idle where they are until the user restarts them (the user, 2026-11-17: "i
		// want the bots to idle when all quests are complete in a difficulty, forcing me to restart them"). A new run picks the difficulty (apiPickLeader).
		if diff := m.questDifficulty(running); diff != m.difficultyNow() {
			if !m.idleSaid {
				m.idleSaid = true
				m.logf(0, "", "quests: nothing left to do on %s; the bots wait until you restart them (next would be %s)", m.difficultyNow(), diff)
			}
			continue
		}
		m.idleSaid = false
		idx, _ := m.questProgress(running)
		best, _ := m.pickLeader(running)
		ci, ok := idx[cur]
		if best == "" || best == cur || !ok || idx[best] >= ci {
			continue // only a bot strictly further behind takes the lead: no flip-flopping on ties
		}
		m.handOver(best, running)
	}
}

// handOver restarts the running bots with `next` leading: the others leave first, the old leader last, then the new leader hosts and they join.
func (m *Manager) handOver(next string, running []string) {
	m.handOverWhy(next, running, "furthest behind in the quests")
}

func (m *Manager) handOverWhy(next string, running []string, why string) {
	m.logf(0, "", "dynamic leader: %s takes over (%s)", next, why)
	if why == "furthest behind in the quests" {
		m.addEvent(ActivityEvent{Time: time.Now(), Bot: next, Kind: "restart", Name: "New Leader", Detail: "the furthest behind leads"})
	}
	m.stopMany(running)
	m.waitStopped(running, 150*time.Second)
	m.mu.Lock()
	m.cfg.Player = next
	var team []string
	for _, n := range running {
		if n != next {
			team = append(team, n)
		}
	}
	m.expectTeam = team
	m.mu.Unlock()
	m.writeBotNames()
	m.saveConfig()
	if err := m.startProfile(next); err != nil {
		m.logf(9, "", "dynamic leader: cannot start %s: %v", next, err)
		return
	}
	time.Sleep(6 * time.Second)
	for _, n := range team {
		if err := m.startProfile(n); err != nil {
			m.logf(9, n, "dynamic leader: cannot start: %v", err)
		}
		time.Sleep(3 * time.Second)
	}
	m.logf(0, "", "dynamic leader: %s leads %s", next, strings.Join(team, ", "))
}

// pickFarmLeader chooses who hosts a Farm run when nobody is playing: the highest level (the sturdiest host), the name deciding a tie. Which bot hosts
// hardly matters there, so nobody is asked.
func (m *Manager) pickFarmLeader(names []string) (string, string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	best, level := "", -1
	for _, n := range names {
		s := m.states[n]
		if s == nil {
			continue
		}
		lv := 0
		if s.Char != nil {
			lv = s.Char.Level
		}
		if lv > level || (lv == level && n < best) {
			best, level = n, lv
		}
	}
	if best == "" {
		return "", "no such bot"
	}
	return best, fmt.Sprintf("the highest level (%d)", level)
}

// leaderShownLocked is the character the page marks with the flag. When you play, that is you. When nobody plays there is a leader only once one
// has been chosen and is in play (it is wanted or running): the flag is not shown for a name left over in the settings, and it moves when the lead
// is passed on (cfg.Player changes with it). Caller holds m.mu.
func (m *Manager) leaderShownLocked() string {
	if !m.cfg.NotPlaying {
		return m.cfg.Player
	}
	for _, s := range m.states {
		if s.Character == m.cfg.Player && m.cfg.Player != "" && (s.Wanted || s.Status == "running" || s.Status == "starting" || s.Status == "stopping") {
			return m.cfg.Player
		}
	}
	return ""
}
