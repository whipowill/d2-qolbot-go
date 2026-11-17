package main

// WHERE a gold hunt goes (2026-11-13, the user's rules after a long debate; the fixed list "Tombs, Ancient Tunnels, Countess, Catacombs" was my guess):
//   - full clears only (the leader runs ClearAnyArea over the chosen levels), no boss-only runs;
//   - only places in an act BELOW the team's highest act (highest act 3: act 2 or 1; highest 1: act 1), where the dangerous content is not;
//   - the run starts at a waypoint EVERY bot has (a bot never walks to an area without one), then walks that dungeon's neighbouring levels
//     (Halls of the Dead 2 and 3, the Canyon and its tombs ...);
//   - safe: the monster level of every level of the place is at most huntSafety above the WEAKEST bot's level;
//   - the best of what is left: density times monster level, both from the game's own Levels.txt (read only), for the difficulty being played.
// The measured pay ("hunt pay:" lines, huntpay.go) is the next refinement: this ranks by the game's numbers until there is data.

import (
	"encoding/csv"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	huntMinLevel = 10  // no gold hunt while the weakest bot is below this level (the user): the characters quest and level instead
	huntGoldPer  = 500 // the gold goal of a hunt: this much per level of the weakest bot, at most goldGoal
	huntSafety   = 4   // a place is safe when its monster level is at most the weakest bot's level plus this
	huntTooEasy  = 6   // act 1 zones whose monster level is more than this below the weakest bot's level are not cleared (they are only walked through)
)

// huntPlace is one place a gold hunt may clear: the waypoint area the run starts from, then the levels to clear in order.
type huntPlace struct {
	Name  string
	Act   int
	Wp    int   // the waypoint area every bot must have (Pather.wpAreas ids)
	Areas []int // area ids cleared in order (the first is reached from the waypoint)
}

// huntPlaces: the places a gold hunt may clear once the team is past act 1, the user's own picks (2026-11-13): the Countess's tower and the Catacombs in act 1,
// the Ancient Tunnels and Tal Rasha's tombs in act 2, Travincal and Mephisto's lair (Durance of Hate 2 and 3) in act 3, the Chaos Sanctuary in act 4 and the
// Worldstone Keep in act 5. Each starts at a waypoint every bot must have (Pather.wpAreas ids) and clears the levels listed (ids from the game's Levels.txt).
var huntPlaces = []huntPlace{
	{"The Countess's tower", 1, 6, []int{21, 22, 23, 24, 25}}, // Tower Cellar 1 to 5, entered from Black Marsh; the Countess is on level 5
	{"Catacombs", 1, 35, []int{35, 36, 37}},
	{"Ancient Tunnels", 2, 44, []int{65}},
	{"Tal Rasha's Tombs", 2, 46, []int{66, 67, 68, 69, 70, 71, 72}},
	{"Travincal", 3, 83, []int{83}},
	{"Mephisto's lair", 3, 101, []int{101, 102}}, // Durance of Hate 2 (the waypoint) and 3
	{"Chaos Sanctuary", 4, 107, []int{108}},      // from the River of Flame waypoint
	{"Worldstone Keep", 5, 129, []int{129, 130}},
}

// areaInfo is what Levels.txt says about one level: the monster level for each difficulty (expansion columns) and the monster density.
type areaInfo struct {
	MLvl    [3]int
	Density int
}

// loadLevels reads the game's Levels.txt (read only). nil when it cannot be read.
func loadLevels(gameExe string) map[int]areaInfo {
	if strings.TrimSpace(gameExe) == "" {
		return nil
	}
	f, err := os.Open(filepath.Join(filepath.Dir(gameExe), "Data", "global", "excel", "Levels.txt"))
	if err != nil {
		return nil
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.Comma, r.LazyQuotes, r.FieldsPerRecord = '\t', true, -1
	rows, err := r.ReadAll()
	if err != nil || len(rows) < 2 {
		return nil
	}
	col := map[string]int{}
	for i, h := range rows[0] {
		col[h] = i
	}
	need := []string{"Id", "MonLvl1Ex", "MonLvl2Ex", "MonLvl3Ex", "MonDen"}
	for _, n := range need {
		if _, ok := col[n]; !ok {
			return nil
		}
	}
	out := map[int]areaInfo{}
	for _, row := range rows[1:] {
		if len(row) <= col["MonDen"] {
			continue
		}
		id, err := strconv.Atoi(row[col["Id"]])
		if err != nil {
			continue
		}
		var a areaInfo
		a.MLvl[0], _ = strconv.Atoi(row[col["MonLvl1Ex"]])
		a.MLvl[1], _ = strconv.Atoi(row[col["MonLvl2Ex"]])
		a.MLvl[2], _ = strconv.Atoi(row[col["MonLvl3Ex"]])
		a.Density, _ = strconv.Atoi(row[col["MonDen"]])
		out[id] = a
	}
	return out
}

// chooseHuntPlaces is the rule above, as a pure function. diff is 0 Normal, 1 Nightmare, 2 Hell; shared is the set of waypoint areas every bot has;
// highestAct is the highest act every bot has reached. It returns up to n places, best first (each with its score); empty when nothing qualifies.
// The act rule: only acts BELOW the highest (highest 3: acts 1 and 2); in act 1 there is none, so whole zones from town (act1Zones); in the last act
// (5) nothing lies above it, so it counts itself.
func chooseHuntPlaces(places []huntPlace, levels map[int]areaInfo, diff, weakest, highestAct int, shared map[int]bool, n int, skip func(string) bool) []scoredPlace {
	if diff < 0 || diff > 2 {
		diff = 0
	}
	if highestAct <= 1 { // still in act 1: no lower act to hunt in, and no waypoints to rely on: whole zones, from town (the user, 2026-11-13)
		if p, sc, ok := act1Zones(levels, diff, weakest); ok {
			return []scoredPlace{{p, sc}}
		}
		return nil
	}
	maxAct := highestAct - 1
	if highestAct >= 5 {
		maxAct = 5
	}
	var out []scoredPlace
	for _, p := range places {
		if p.Act > maxAct || !shared[p.Wp] || len(p.Areas) == 0 || (skip != nil && skip(p.Name)) { // skip: a place that has lost gold or chickened too often
			continue
		}
		sum, safe := 0, true
		for _, id := range p.Areas {
			a, found := levels[id]
			if !found || a.MLvl[diff] <= 0 || a.Density <= 0 || a.MLvl[diff] > weakest+huntSafety {
				safe = false
				break
			}
			sum += a.Density * a.MLvl[diff]
		}
		if safe {
			out = append(out, scoredPlace{p, sum / len(p.Areas)})
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	if n > 0 && len(out) > n {
		out = out[:n]
	}
	return out
}

type scoredPlace struct {
	Place huntPlace
	Score int
}

// chooseHuntPlace is the single best place (see chooseHuntPlaces).
func chooseHuntPlace(places []huntPlace, levels map[int]areaInfo, diff, weakest, highestAct int, shared map[int]bool) (best huntPlace, score int, ok bool) {
	r := chooseHuntPlaces(places, levels, diff, weakest, highestAct, shared, 1, nil)
	if len(r) == 0 {
		return huntPlace{}, 0, false
	}
	return r[0].Place, r[0].Score, true
}

// act1ZoneChain is act 1's outdoors in the order a walk from the Rogue Encampment meets them: Blood Moor, Cold Plains, Stony Field, Dark Wood, Black Marsh.
var act1ZoneChain = []int{2, 3, 4, 5, 6}

// act1Zones: while the team is in act 1 (no waypoints to count on, no lower act), a gold hunt clears whole zones from town. It takes the zones of the chain
// that are safe (monster level at most huntSafety above the weakest bot) and not far below the weakest bot (huntTooEasy under: a level 12 team gains nothing
// from Blood Moor); with none left it takes the deepest safe zone. ok is false when not even the first zone is safe.
func act1Zones(levels map[int]areaInfo, diff, weakest int) (best huntPlace, score int, ok bool) {
	var areas []int
	deepest := 0
	for _, id := range act1ZoneChain {
		a, found := levels[id]
		if !found || a.MLvl[diff] <= 0 || a.MLvl[diff] > weakest+huntSafety {
			break // the zones go deeper and deeper: the first unsafe one ends the chain
		}
		deepest = id
		if a.MLvl[diff] >= weakest-huntTooEasy {
			areas = append(areas, id)
			score += a.Density * a.MLvl[diff]
		}
	}
	if deepest == 0 {
		return huntPlace{}, 0, false
	}
	if len(areas) == 0 {
		a := levels[deepest]
		areas, score = []int{deepest}, a.Density*a.MLvl[diff]
	}
	return huntPlace{Name: "Act 1 zones from town", Act: 1, Wp: 0, Areas: areas}, score / len(areas), true
}

// huntGoal is the gold every bot must hold for a gold hunt to end: 500 per level of the weakest bot, at most goldGoal.
func huntGoal(weakest int) int {
	g := weakest * huntGoldPer
	if g > goldGoal {
		g = goldGoal
	}
	return g
}

// actOfTown: the act a town waypoint area belongs to (0 for any other area).
func actOfTown(area int) int {
	switch area {
	case 1:
		return 1
	case 40:
		return 2
	case 75:
		return 3
	case 103:
		return 4
	case 109:
		return 5
	}
	return 0
}

// teamWaypoints reads each bot's waypoint list (data/waypoints-<bot>.json, written by the bots) and returns the waypoint areas ALL of them have and the
// highest act ALL of them have reached (the highest town waypoint they share). ok is false when a list is missing.
func (m *Manager) teamWaypoints(names []string) (shared map[int]bool, highestAct int, ok bool) {
	var lists [][]int
	for _, n := range names {
		b, err := os.ReadFile(filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "data", "waypoints-"+n+".json"))
		if err != nil {
			return nil, 0, false
		}
		var l []int
		if json.Unmarshal(b, &l) != nil {
			return nil, 0, false
		}
		lists = append(lists, l)
	}
	return sharedWaypoints(lists)
}

// sharedWaypoints: the waypoint areas every list has, and the highest act whose town waypoint every list has (act 1 at least: the first town's waypoint
// is taken from the start).
func sharedWaypoints(lists [][]int) (shared map[int]bool, highestAct int, ok bool) {
	if len(lists) == 0 {
		return nil, 0, false
	}
	count := map[int]int{}
	for _, l := range lists {
		seen := map[int]bool{}
		for _, a := range l {
			if !seen[a] {
				seen[a] = true
				count[a]++
			}
		}
	}
	shared = map[int]bool{}
	highestAct = 1
	var areas []int
	for a, c := range count {
		if c == len(lists) {
			shared[a] = true
			areas = append(areas, a)
		}
	}
	sort.Ints(areas)
	for _, a := range areas {
		if act := actOfTown(a); act > highestAct {
			highestAct = act
		}
	}
	return shared, highestAct, true
}

// weakestLevel is the lowest level among the bots (from their saves); 0 when unknown.
func (m *Manager) weakestLevel(names []string) int {
	lo := 0
	for _, bq := range m.partyQuests(names)["bots"].([]BotQuests) {
		if bq.Problem == "" && (lo == 0 || bq.Level < lo) {
			lo = bq.Level
		}
	}
	return lo
}

// FIXED HUNT SELECTION (the user, 2026-11-14, and "you are never allowed to change these selections for gold and level hunts"): a gold hunt clears the
// final zone(s) of the act BELOW the team's highest shared act, the same as the level hunt (levelHuntFarm), plus the Countess: team in act 2: the
// Countess's tower and the Catacombs ("catacombs+"), act 3: the Countess and Tal Rasha's tombs with Duriel's lair ("tombs+"), act 4: the Countess,
// Travincal and Mephisto's lair ("trav+"), act 5: the Countess and the Chaos Sanctuary; above act 5: the Countess and the Worldstone Keep. A team still in
// act 1 does full clears from the Rogue Encampment (act1Zones). The only filter is the one the user made earlier: a place is only used when every
// bot has its waypoint. No scoring, no safety margin, no learned avoidance (huntpay.go only keeps the numbers): the list is not touched by the program.
var fixedHuntNames = map[int][]string{
	2: {"The Countess's tower", "Catacombs"},
	3: {"The Countess's tower", "Tal Rasha's Tombs"},
	4: {"The Countess's tower", "Travincal", "Mephisto's lair"},
	5: {"The Countess's tower", "Chaos Sanctuary"},
	6: {"The Countess's tower", "Worldstone Keep"},
}

// fixedHuntPlaces returns the fixed places for the team's highest act, in order, leaving out one whose waypoint not every bot has.
func fixedHuntPlaces(places []huntPlace, highestAct int, shared map[int]bool) []huntPlace {
	var out []huntPlace
	for _, name := range fixedHuntNames[highestAct] {
		for _, p := range places {
			if p.Name != name || !shared[p.Wp] {
				continue
			}
			if name == "Tal Rasha's Tombs" { // "tombs+": Duriel's lair (area 73) is cleared after the seven tombs
				p.Areas = append(append([]int(nil), p.Areas...), 73)
			}
			out = append(out, p)
		}
	}
	return out
}

// huntPlacesPerRun: a gold hunt clears the best place that qualifies. ONE place per run, so that its pay and its chickens belong to that place alone
// (with two the pay line could not say which of them earned or cost what); a place that goes bad is skipped and the next best takes over.
const huntPlacesPerRun = 1

// pickHuntPlace picks where a gold hunt for these bots goes (the best huntPlacesPerRun places, joined into one) and says why in one line. ok is false (with
// the reason) when it cannot.
func (m *Manager) pickHuntPlace(names []string, diff int) (huntPlace, string, bool) {
	weakest := m.weakestLevel(names)
	if weakest == 0 {
		return huntPlace{}, "the bots' levels are not known yet", false
	}
	m.mu.Lock()
	exe := m.cfg.GameExe
	m.mu.Unlock()
	levels := loadLevels(exe)
	if levels == nil {
		return huntPlace{}, "the game's Levels.txt could not be read", false
	}
	shared, highest, ok := m.teamWaypoints(names)
	if !ok {
		return huntPlace{}, "the bots' waypoint lists are not all there yet", false
	}
	if highest <= 1 { // act 1 still: full clears from town (act1Zones), the only place the safety rule is still applied (there is no table for it)
		r := chooseHuntPlaces(huntPlaces, levels, diff, weakest, highest, shared, huntPlacesPerRun, nil)
		if len(r) == 0 {
			return huntPlace{}, "no act 1 zone is safe for the weakest bot (level " + strconv.Itoa(weakest) + ")", false
		}
		return joinPlaces(r), "weakest bot level " + strconv.Itoa(weakest) + ", still in act 1", true
	}
	fixed := fixedHuntPlaces(huntPlaces, highest, shared)
	if len(fixed) == 0 {
		return huntPlace{}, "no place of the fixed list has a waypoint every bot has (highest act " + strconv.Itoa(highest) + ")", false
	}
	r := make([]scoredPlace, 0, len(fixed))
	for _, p := range fixed {
		r = append(r, scoredPlace{Place: p})
	}
	return joinPlaces(r), "the fixed list for a team in act " + strconv.Itoa(highest), true
}

// joinPlaces turns the chosen places into one: their names joined, their areas in order.
func joinPlaces(r []scoredPlace) huntPlace {
	var names []string
	var areas []int
	for _, sp := range r {
		names = append(names, sp.Place.Name)
		areas = append(areas, sp.Place.Areas...)
	}
	return huntPlace{Name: strings.Join(names, " and "), Act: r[0].Place.Act, Wp: r[0].Place.Wp, Areas: areas}
}

// diffIndex: 0 Normal, 1 Nightmare, 2 Hell.
func diffIndex(diff string) int {
	switch diff {
	case "Nightmare":
		return 1
	case "Hell":
		return 2
	}
	return 0
}

// huntScriptExists: the generic clear script a gold hunt runs is in the kolbot folder.
func (m *Manager) huntScriptExists() bool {
	_, err := os.Stat(filepath.Join(m.libsDir(), "bots", "ClearAnyArea.js"))
	return err == nil
}
