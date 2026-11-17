package main

import (
	"fmt"
	"slices"
	"sort"
	"strings"
	"time"
)

// Hunts (2026-11-13, user). In Quest mode (nobody playing) the team sometimes has to stop questing for a while and go and get something, then
// carries on with the quests:
//
//   - LEVEL HUNT: the chicken limit tripped ("if chickens are an issue, the team needs to level for a while before it is safe to progress"). The
//     team is stopped and saved, then restarted on a leveling Farm run until its weakest bot has gained levelUpGain levels.
//   - GOLD HUNT: the team is broke (under goldLow gold per bot, pack plus stash, from the bots' purse files, see purse.go). A broke team cannot buy
//     town portal scrolls, and without them nothing works (the loop of 2026-11-13). It runs the same easy Farm list until EVERY bot holds at
//     least goldGoal (the user's rule, 2026-11-13: "until every bot has 10k at least"). There is no time limit: a hunt that earns nothing ends in a
//     fatal event (chickens, no scrolls), not by giving up.
//
// The saved objective never changes: while a hunt lasts `m.levelUp` overrides the goal and the farm list (goalNow, farmSelection), and the leader's
// card says "Leading level hunt" / "Leading gold hunt". If the chicken limit trips DURING a level hunt, everything stops for good (a fatal event,
// nothing loops); during a gold hunt it turns into a level hunt.

const (
	levelUpGain  = 3                // levels the weakest bot must gain before the quests go on
	levelUpMax   = 3 * time.Hour    // a level hunt ends after this long whatever the levels are
	goldLow      = 1000             // gold per bot (pack plus stash, the team's total divided by its bots) under which a gold hunt starts (the user, 2026-11-13)
	huntGrace    = 5 * time.Minute  // a gold hunt that the start-of-game sales make unnecessary ends within this long
	goldGoal     = 10000            // gold EVERY bot must hold (pack plus stash) before a gold hunt is over
	goldHuntWait = 60 * time.Minute // no new gold hunt this soon after one
)

type levelUpState struct {
	Kind   string    // "level" or "gold"
	Names  []string  // the team that goes on the hunt
	Target int       // level hunt: the weakest bot's level at which the quests go on
	Goal   int       // gold hunt: the gold every bot must hold before the quests go on
	Farm   []string  // the farm scripts that run meanwhile
	Place  string    // gold hunt: the place chosen (huntplaces.go)
	Areas  []int     // gold hunt: the area ids the leader clears, in order
	Act    int       // the act of the hunt's first place: the whole team goes there first (bots.json "firstAct", Team.firstActHop)
	Since  time.Time // when the hunt began
	Diff   string    // the difficulty the hunt plays in when it is not the quests' one ("" = the same): the one before, for a team in act 1 of Nightmare or Hell
	Lowest int       // level hunt: the weakest bot's level as of the last look (0 before the first)
	Gold   int       // gold hunt: the poorest bot's gold as of the last look (-1 before the first)
}

// levelTarget is the level the weakest of the levels must reach.
func levelTarget(levels []int) int {
	if len(levels) == 0 {
		return 0
	}
	lo := levels[0]
	for _, l := range levels {
		if l < lo {
			lo = l
		}
	}
	return lo + levelUpGain
}

// levelUpFarm is what the team farms on a hunt, from the scripts that exist. Easy places the team has cleared before: the bosses of act 1
// (Countess, Andariel) on Normal and Nightmare, the late bosses on Hell. A guess, not measured: change the lists if the pay is poor.
// 2026-11-13 (the user: "tombs would prob be better in Normal"): Normal starts with Tal Rasha's Tombs and the Ancient Tunnels, whose monsters are far
// higher level than the act 1 bosses (better drops, better jewelry), then Countess and the Catacombs (levels 2 and 3: the user, "replace
// Andariel with catacombs for gold runs"; Level 4, Andariel's room, is left out since 2026-11-15, "make a catacombs farm not do catacombs 4"). Every run's pay is logged ("hunt pay:", huntpay.go), so the worst
// place can be dropped from this list once there are numbers.
func levelUpFarm(diff string, have []farmRun, skip func(string) bool) []string {
	want := []string{"Tombs", "AncientTunnels", "Countess", "Catacombs", "Andariel"} // Andariel back after the Catacombs (the user, 2026-11-15: "you can add andariel to the level hunt list")
	if diff == "Hell" {
		want = []string{"Mephisto", "Pindleskin"}
	}
	exists := map[string]bool{}
	for _, f := range have {
		exists[f.Name] = true
	}
	var out []string
	for _, w := range want {
		if exists[w] && (skip == nil || !skip(w)) { // skip: a place that has chickened the bots too often (huntpay.go)
			out = append(out, w)
		}
	}
	return out
}

// levelHuntFarm is what a level hunt runs (the user, 2026-11-14): the final zone(s) of the act BELOW the one the team has reached, over and over: a team
// in act 2 runs act 1's end (Catacombs, Andariel), act 3 runs Tal Rasha's Tombs and Duriel, act 4 runs Travincal and Mephisto, act 5 runs the Chaos Sanctuary (Diablo); act 5's own end, Worldstone Keep and Baal, is for a team above it. Nothing
// (nil) for a team still in act 1 or an act the table does not know: the caller keeps its own list then.
func levelHuntFarm(highestAct int, have []farmRun, skip func(string) bool) []string {
	var want []string
	switch highestAct {
	case 2:
		want = []string{"Catacombs", "Andariel"}
	case 3:
		want = []string{"Tombs", "Duriel"}
	case 4:
		want = []string{"Travincal", "Mephisto"}
	case 5:
		want = []string{"Diablo"} // act 4's end: the Chaos Sanctuary (Diablo's run)
	case 6: // nothing above act 5 yet; kept for the table's sake: act 5's end is Worldstone Keep and Baal
		want = []string{"Worldstone", "Baal"}
	}
	exists := map[string]bool{}
	for _, f := range have {
		exists[f.Name] = true
	}
	var out []string
	for _, w := range want {
		if exists[w] && (skip == nil || !skip(w)) {
			out = append(out, w)
		}
	}
	return out
}

// levelHuntAct is the act of a level hunt's first stop: 1 for whole zones from the Rogue Encampment (a team still in act 1), else the act of the first farm
// script (farmAll), 0 when it is not known (then nobody hops first).
func levelHuntAct(farm []string, areas []int) int {
	if len(areas) > 0 {
		return 1
	}
	if len(farm) > 0 {
		for _, f := range farmAll {
			if f.Name == farm[0] {
				return f.Act
			}
		}
	}
	return 0
}

// huntLabel is what the leader's card says it is leading ("Leading level hunt").
func huntLabel(kind string) string {
	if kind == "gold" {
		return "gold hunt"
	}
	return "level hunt"
}

// detourLocked describes a running hunt for the Activity page (nil when there is none). Caller holds m.mu.
func (m *Manager) detourLocked() map[string]any {
	lu := m.levelUp
	if lu == nil {
		return nil
	}
	if lu.Kind == "gold" {
		now := "?"
		if lu.Gold >= 0 {
			now = fmt.Sprint(lu.Gold)
		}
		return map[string]any{
			"kind":  "gold",
			"label": huntLabel("gold"),
			"title": "Gold hunt: the quests go on afterwards",
			"text":  fmt.Sprintf("The team is short of gold, and without it no town portal scrolls, so it is running %s to earn some. The poorest bot holds %s gold; the quests resume when every bot has %d.", strings.Join(lu.Farm, " and "), now, lu.Goal),
			"since": lu.Since,
		}
	}
	now := "?"
	if lu.Lowest > 0 {
		now = fmt.Sprint(lu.Lowest)
	}
	return map[string]any{
		"kind":  "levelup",
		"label": huntLabel("level"),
		"title": "Level hunt: the quests go on afterwards",
		"text":  fmt.Sprintf("The team chickened too often, so it is running %s to gain levels. The weakest bot is level %s; the quests resume at level %d.", strings.Join(lu.Farm, " and "), now, lu.Target),
		"since": lu.Since,
	}
}

// runningTeam is the bots that are wanted and running, sorted.
func (m *Manager) runningTeam() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	var names []string
	for n, s := range m.states {
		if s.Wanted && (s.Status == "running" || s.Status == "starting") {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	return names
}

// beginLevelUp is called when the chicken limit has tripped. It returns true when it takes over (the caller must NOT stop everybody then).
func (m *Manager) beginLevelUp() bool {
	m.mu.Lock()
	if !(m.cfg.Goal == "Quest" && m.cfg.NotPlaying) || !m.cfg.Effective().LevelUpFirst {
		m.mu.Unlock()
		return false
	}
	if m.levelUp != nil && m.levelUp.Kind != "gold" { // it chickened again while leveling: the hunt did not help, stop for real
		m.levelUp = nil
		m.mu.Unlock()
		m.logf(9, "", "level hunt: the team chickened again while leveling, stopping for good")
		return false
	}
	m.levelUp = nil // a gold hunt that chickens turns into a level hunt
	diff := m.difficultyNow()
	farm := levelUpFarm(diff, m.farmCatalog(), nil) // never a learned skip: the selection is the user's (2026-11-14)
	catalog := m.farmCatalog()
	m.mu.Unlock()
	names := m.runningTeam()
	var act1Areas []int
	huntDiff := ""
	if _, highest, ok := m.teamWaypoints(names); ok { // the act below the team's highest: its last zone(s), over and over
		if hf := levelHuntFarm(6, catalog, nil); highest <= 1 && (diff == "Nightmare" || diff == "Hell") && slices.Contains(hf, "Baal") {
			// a team still in act 1 of Nightmare or Hell levels on Baal of the difficulty before (the user, 2026-11-14: "nightmare and hell level hunt in
			// act 1 sends them back to baal the difficulty before"): it has finished that one, so the Throne of Destruction is open to it
			farm, huntDiff = []string{"Baal"}, map[string]string{"Nightmare": "Normal", "Hell": "Nightmare"}[diff]
		} else if hf := levelHuntFarm(highest, catalog, nil); len(hf) > 0 {
			farm = hf
		} else if highest <= 1 { // still in act 1: full clears from the Rogue Encampment, as a gold hunt does (the user, 2026-11-14)
			m.mu.Lock()
			exe := m.cfg.GameExe
			m.mu.Unlock()
			if weakest := m.weakestLevel(names); weakest > 0 {
				if p, _, okZ := act1Zones(loadLevels(exe), diffIndex(diff), weakest); okZ {
					farm, act1Areas = []string{"ClearAnyArea"}, p.Areas
				}
			}
		}
	}
	if len(names) == 0 || len(farm) == 0 {
		return false
	}
	var levels []int
	for _, bq := range m.partyQuests(names)["bots"].([]BotQuests) {
		if bq.Problem == "" {
			levels = append(levels, bq.Level)
		}
	}
	target := levelTarget(levels)
	if target == 0 {
		return false
	}
	m.mu.Lock()
	m.levelUp = &levelUpState{Kind: "level", Names: names, Target: target, Farm: farm, Areas: act1Areas, Act: levelHuntAct(farm, act1Areas), Since: time.Now(), Diff: huntDiff}
	m.mu.Unlock()
	if huntDiff != "" {
		diff = huntDiff
	}
	msg := fmt.Sprintf("Too many chickens: a level hunt (%s on %s) until the weakest bot is level %d.", strings.Join(farm, ", "), diff, target)
	m.logf(0, "", "level hunt: %s", msg)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "", Kind: "restart", Name: "Level hunt", Detail: msg})
	go func() {
		best, _ := m.pickLeader(names) // the furthest behind in the quests, the sturdier one on a tie (fewer chickens), one with scrolls
		if best == "" {
			best, _ = m.pickFarmLeader(names)
		}
		m.handOverWhy(best, names, "level hunt")
	}()
	return true
}

// maybeGoldHunt starts a gold hunt when the team is broke (Quest mode, nobody playing, no hunt running, none lately).
func (m *Manager) maybeGoldHunt() {
	if !m.dynamicLeaderOn() {
		return
	}
	m.mu.Lock()
	recent := !m.goldHuntEnded.IsZero() && time.Since(m.goldHuntEnded) < goldHuntWait
	diff := m.difficultyNow()
	m.mu.Unlock()
	names := m.runningTeam()
	if recent || len(names) == 0 || !m.huntScriptExists() {
		return
	}
	// The team the leader was started for must all be up first: with only the leader running (the followers are started a few seconds later) the "team" is
	// one bot, and a leader with 34 gold started a gold hunt of one (2026-11-13 16:37).
	m.mu.Lock()
	expected := append([]string(nil), m.expectTeam...)
	m.mu.Unlock()
	if !teamIsUp(names, expected) {
		return
	}
	total, known := m.teamGold(names)
	if known < len(names) || total >= goldLow*len(names) { // some bot has not reported yet, or the team is not broke
		return
	}
	weakest := m.weakestLevel(names)
	if weakest < huntMinLevel { // the user: no gold hunt before level 10, the characters quest and level instead
		return
	}
	place, why, okPlace := m.pickHuntPlace(names, diffIndex(diff))
	if !okPlace {
		if m.huntNoteAt.IsZero() || time.Since(m.huntNoteAt) > 10*time.Minute {
			m.huntNoteAt = time.Now()
			m.logf(0, "", "gold hunt: the team is broke but no place can be chosen: %s", why)
		}
		return
	}
	best, _ := m.pickLeader(names)
	if best == "" {
		return
	}
	if p, ok := m.readPurse(best); ok && !p.canLead() { // nobody has scrolls or the gold for any: nothing can be done by the bots
		if m.raiseFatal("noscrolls", best, "Out of town portal scrolls", fmt.Sprintf("The whole team is broke (%d gold together) and nobody has town portal scrolls. Everybody is stopped: put some gold in a bot's pack or stash, then start again.", total)) {
			go m.stopForNotReady()
		}
		return
	}
	poorest, _ := m.poorestGold(names)
	goal := huntGoal(weakest)
	m.mu.Lock()
	m.levelUp = &levelUpState{Kind: "gold", Names: names, Goal: goal, Farm: []string{"ClearAnyArea"}, Place: place.Name, Areas: place.Areas, Act: place.Act, Since: time.Now(), Gold: poorest}
	m.mu.Unlock()
	msg := fmt.Sprintf("The team is broke (%d gold together): a gold hunt, full clears in %s, until every bot has %d. (%s)", total, place.Name, goal, why)
	m.logf(0, "", "gold hunt: %s", msg)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: best, Kind: "restart", Name: "Gold hunt", Detail: msg})
	go m.handOverWhy(best, names, "gold hunt")
}

// levelUpLoop watches the hunts, every 30 seconds: it starts a gold hunt when the team is broke, and ends a hunt when its goal is reached (read
// from the saves and the purse files) or its time is up, and goes back to the quests.
func (m *Manager) levelUpLoop() {
	for range time.Tick(30 * time.Second) {
		m.mu.Lock()
		lu := m.levelUp
		m.mu.Unlock()
		if lu == nil {
			m.maybeGoldHunt()
			continue
		}
		var msg string
		if lu.Kind == "gold" {
			// (No re-pick during a hunt: a place that has gone bad is NOT given up. The selections are the user's and are never changed by the program, 2026-11-14.)
			poorest, known := m.poorestGold(lu.Names)
			m.mu.Lock()
			lu.Gold = poorest
			m.mu.Unlock()
			// The hunt was judged from the purse files of the LAST session, before this session's start-of-game chores sold the gear in the packs
			// (user, 2026-11-13: "do this chore before the gold run, it helps solve the gold problem"). In the first minutes, if the sales brought the team
			// back above the threshold it was never broke: end the hunt.
			if since := time.Since(lu.Since); since > 90*time.Second && since < huntGrace {
				if total, kn := m.teamGold(lu.Names); kn == len(lu.Names) && total >= goldLow*len(lu.Names) {
					m.mu.Lock()
					m.goldHuntEnded = time.Now()
					m.levelUp = nil
					m.mu.Unlock()
					m.setQuestDifficulty(m.questDifficulty(lu.Names))
					best, _ := m.pickLeader(lu.Names)
					if best == "" {
						best = lu.Names[0]
					}
					msg = fmt.Sprintf("The start-of-game chores (selling gear) lifted the team to %d gold: the hunt is not needed, back to the quests.", total)
					m.logf(0, "", "gold hunt: %s", msg)
					m.addEvent(ActivityEvent{Time: time.Now(), Bot: best, Kind: "restart", Name: "Back to the quests", Detail: msg})
					m.handOverWhy(best, lu.Names, "back to the quests")
					continue
				}
			}
			if known < len(lu.Names) || poorest < lu.Goal { // somebody has not reported, or somebody is still short: carry on hunting
				continue
			}
			msg = fmt.Sprintf("Every bot holds at least %d gold (the poorest has %d): back to the quests.", lu.Goal, poorest)
			m.mu.Lock()
			m.goldHuntEnded = time.Now()
			m.mu.Unlock()
		} else {
			var levels []int
			for _, bq := range m.partyQuests(lu.Names)["bots"].([]BotQuests) {
				if bq.Problem == "" {
					levels = append(levels, bq.Level)
				}
			}
			lo := 0
			if len(levels) > 0 {
				lo = levels[0]
				for _, l := range levels {
					if l < lo {
						lo = l
					}
				}
			}
			m.mu.Lock()
			lu.Lowest = lo
			m.mu.Unlock()
			if lo < lu.Target && time.Since(lu.Since) < levelUpMax {
				continue
			}
			msg = fmt.Sprintf("The weakest bot is level %d (target %d): back to the quests.", lo, lu.Target)
		}
		m.mu.Lock()
		m.levelUp = nil
		m.mu.Unlock()
		m.setQuestDifficulty(m.questDifficulty(lu.Names))
		best, _ := m.pickLeader(lu.Names)
		if best == "" {
			best = lu.Names[0]
		}
		m.logf(0, "", "%s hunt: %s", lu.Kind, msg)
		m.addEvent(ActivityEvent{Time: time.Now(), Bot: best, Kind: "restart", Name: "Back to the quests", Detail: msg})
		m.handOverWhy(best, lu.Names, "back to the quests")
	}
}

// huntAtStart is asked when the user starts a Quest team (/api/pickleader, before any bot is launched). A team that is already broke goes on a gold
// hunt FIRST, from the purse files the bots left (any age), so that the first game is a farm run and not a waypoint sharing that needs scrolls
// nobody can pay for (2026-11-13, user: "the gold hunt needs to occur before a waypoint hunt"). It returns a message when nothing can be done
// (nobody has scrolls or the gold for any): then the fatal event is up and the start is refused.
func (m *Manager) huntAtStart(names []string, leader string) string {
	if len(names) == 0 || !m.dynamicLeaderOn() {
		return ""
	}
	m.mu.Lock()
	recent := !m.goldHuntEnded.IsZero() && time.Since(m.goldHuntEnded) < goldHuntWait
	diff := m.difficultyNow()
	m.mu.Unlock()
	total, known := 0, 0
	for _, n := range names {
		if p, ok := m.readPurse(n); ok {
			total += p.total()
			known++
		}
	}
	if recent || known < len(names) || !m.huntScriptExists() || total >= goldLow*len(names) {
		return ""
	}
	weakest := m.weakestLevel(names)
	if weakest < huntMinLevel { // no gold hunt before level 10
		return ""
	}
	place, why, okPlace := m.pickHuntPlace(names, diffIndex(diff))
	if !okPlace {
		m.logf(0, "", "gold hunt: the team is broke but no place can be chosen: %s", why)
		return ""
	}
	if p, ok := m.readPurse(leader); ok && !p.canLead() {
		msg := fmt.Sprintf("The whole team is broke (%d gold together) and nobody has town portal scrolls. Put some gold in a bot's pack or stash, then start again.", total)
		m.raiseFatal("noscrolls", leader, "Out of town portal scrolls", msg)
		return msg
	}
	least := -1
	for _, n := range names {
		if p, ok := m.readPurse(n); ok && (least < 0 || p.total() < least) {
			least = p.total()
		}
	}
	m.mu.Lock()
	goal := huntGoal(weakest)
	m.levelUp = &levelUpState{Kind: "gold", Names: names, Goal: goal, Farm: []string{"ClearAnyArea"}, Place: place.Name, Areas: place.Areas, Act: place.Act, Since: time.Now(), Gold: least}
	m.mu.Unlock()
	msg := fmt.Sprintf("The team is broke (%d gold together): starting with a gold hunt, full clears in %s, until every bot has %d. (%s)", total, place.Name, goal, why)
	m.logf(0, "", "gold hunt: %s", msg)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: leader, Kind: "restart", Name: "Gold hunt", Detail: msg})
	return ""
}

// teamIsUp: every bot the leader was started for (expected) is among the running ones.
func teamIsUp(running, expected []string) bool {
	up := map[string]bool{}
	for _, n := range running {
		up[n] = true
	}
	for _, n := range expected {
		if !up[n] {
			return false
		}
	}
	return true
}
