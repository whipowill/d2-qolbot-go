package main

import (
	"d2qolbot/internal/spec"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// a small Levels.txt: monster levels for Normal, Nightmare, Hell, and the density (the real numbers of the places in huntPlaces)
func testLevels() map[int]areaInfo {
	m := map[int]areaInfo{
		2: {[3]int{1, 36, 67}, 520}, 3: {[3]int{2, 36, 68}, 520}, 4: {[3]int{4, 37, 68}, 520}, 5: {[3]int{5, 38, 68}, 520}, 6: {[3]int{6, 38, 69}, 520},
		35: {[3]int{11, 42, 85}, 680}, 36: {[3]int{12, 43, 85}, 680}, 37: {[3]int{12, 43, 85}, 680},
		65: {[3]int{17, 46, 85}, 680}, 83: {[3]int{24, 54, 82}, 325}, 101: {[3]int{25, 55, 85}, 800}, 102: {[3]int{25, 55, 85}, 800},
		108: {[3]int{28, 58, 85}, 800}, 129: {[3]int{40, 65, 85}, 700}, 130: {[3]int{42, 66, 85}, 700},
	}
	for id := 21; id <= 25; id++ {
		m[id] = areaInfo{[3]int{7, 38 + id - 21, 85}, 1024}
	}
	for id := 66; id <= 72; id++ {
		m[id] = areaInfo{[3]int{17, 49, 85}, 2200}
	}
	return m
}

func set(ids ...int) map[int]bool {
	m := map[int]bool{}
	for _, i := range ids {
		m[i] = true
	}
	return m
}

func names(r []scoredPlace) []string {
	var out []string
	for _, sp := range r {
		out = append(out, sp.Place.Name)
	}
	return out
}

func TestChooseHuntPlaces(t *testing.T) {
	lv := testLevels()
	all := set(1, 6, 35, 40, 44, 46, 75, 83, 101, 107, 129)
	// act 3 reached (acts 1 and 2 allowed), level 26: the tombs (density 2200, monster level 17) first, the Ancient Tunnels next
	if got := names(chooseHuntPlaces(huntPlaces, lv, 0, 26, 3, all, 2, nil)); !reflect.DeepEqual(got, []string{"Tal Rasha's Tombs", "Ancient Tunnels"}) {
		t.Errorf("act 3: %v", got)
	}
	// without the canyon waypoint the tombs are out: the Ancient Tunnels and the Catacombs
	if got := names(chooseHuntPlaces(huntPlaces, lv, 0, 26, 3, set(1, 6, 35, 40, 44, 75), 2, nil)); !reflect.DeepEqual(got, []string{"Ancient Tunnels", "Catacombs"}) {
		t.Errorf("act 3 without the canyon waypoint: %v", got)
	}
	// act 2 reached: act 1 only
	if got := names(chooseHuntPlaces(huntPlaces, lv, 0, 20, 2, set(1, 6, 35, 40), 2, nil)); !reflect.DeepEqual(got, []string{"Catacombs", "The Countess's tower"}) {
		t.Errorf("act 2: %v", got)
	}
	// act 4 reached: act 3 opens (Mephisto's lair beats Travincal and the Catacombs)
	if got := names(chooseHuntPlaces(huntPlaces, lv, 0, 30, 4, all, 2, nil)); !reflect.DeepEqual(got, []string{"Tal Rasha's Tombs", "Mephisto's lair"}) {
		t.Errorf("act 4: %v", got)
	}
	// act 3 reached, but the team lacks every waypoint of acts 1 and 2: nothing (the act below must be used)
	if got := chooseHuntPlaces(huntPlaces, lv, 0, 26, 3, set(1, 75, 83, 101), 2, nil); len(got) != 0 {
		t.Errorf("only act 3 waypoints: %v", names(got))
	}
	// a level 8 team: the tombs and the tunnels (17) are not safe (8+4 < 17), the Catacombs (12) and the tower (7) are
	if got := names(chooseHuntPlaces(huntPlaces, lv, 0, 8, 3, all, 2, nil)); !reflect.DeepEqual(got, []string{"Catacombs", "The Countess's tower"}) {
		t.Errorf("level 8: %v", got)
	}
	// the last act counts itself: the Worldstone Keep (its levels are monster level 40 and 42) needs a weakest bot of 38 or more
	if got := names(chooseHuntPlaces(huntPlaces, lv, 0, 30, 5, all, 3, nil)); len(got) == 0 || got[len(got)-1] == "Worldstone Keep" {
		t.Errorf("act 5, level 30: %v", got)
	}
	if got := names(chooseHuntPlaces(huntPlaces, lv, 0, 38, 5, all, 8, nil)); !contains(got, "Worldstone Keep") || !contains(got, "Chaos Sanctuary") {
		t.Errorf("act 5, level 38: %v", got)
	}
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}

func TestJoinPlaces(t *testing.T) {
	r := chooseHuntPlaces(huntPlaces, testLevels(), 0, 26, 3, set(1, 6, 35, 40, 44, 46, 75), 2, nil)
	j := joinPlaces(r)
	if j.Name != "Tal Rasha's Tombs and Ancient Tunnels" || !reflect.DeepEqual(j.Areas, []int{66, 67, 68, 69, 70, 71, 72, 65}) {
		t.Errorf("joined: %+v", j)
	}
}

func TestAct1Zones(t *testing.T) {
	lv := testLevels()
	// level 10: zones with monster level 1, 2, 4, 5, 6 are all safe (10+4); Blood Moor (1) and Cold Plains (2) are too easy (below 10-6=4), the rest is cleared in order
	p, _, ok := chooseHuntPlace(huntPlaces, lv, 0, 10, 1, set(1))
	if !ok || p.Name != "Act 1 zones from town" || !reflect.DeepEqual(p.Areas, []int{4, 5, 6}) {
		t.Errorf("level 10, act 1: %+v ok=%v", p, ok)
	}
	// level 3: Black Marsh (6) is safe (3+4 >= 6? no: 7 >= 6 yes), Blood Moor to Black Marsh are all within reach; nothing too easy (>= 3-6)
	p, _, ok = chooseHuntPlace(huntPlaces, lv, 0, 3, 1, set(1))
	if !ok || !reflect.DeepEqual(p.Areas, []int{2, 3, 4, 5, 6}) {
		t.Errorf("level 3: %+v", p)
	}
	// level 30 in act 1 (a strange state): every zone is too easy: the deepest safe zone is taken
	p, _, ok = chooseHuntPlace(huntPlaces, lv, 0, 30, 1, set(1))
	if !ok || !reflect.DeepEqual(p.Areas, []int{6}) {
		t.Errorf("level 30: %+v", p)
	}
}

func TestSharedWaypointsAndGoal(t *testing.T) {
	sh, act, ok := sharedWaypoints([][]int{{1, 3, 35, 40, 46}, {1, 3, 40, 46, 75}, {1, 40, 46}})
	if !ok || act != 2 || !sh[46] || sh[35] || sh[75] {
		t.Errorf("shared %v act %d", sh, act)
	}
	if _, _, ok := sharedWaypoints(nil); ok {
		t.Error("no lists")
	}
	if huntGoal(12) != 6000 || huntGoal(30) != 10000 || huntGoal(20) != 10000 {
		t.Errorf("goals %d %d %d", huntGoal(12), huntGoal(30), huntGoal(20))
	}
}

// TestRealHuntChoice runs the chooser on the real Levels.txt and the real waypoint files. Only when QOLBOT_GAME_EXE (the game's Game.exe) is set.
func TestRealHuntChoice(t *testing.T) {
	exe := os.Getenv("QOLBOT_GAME_EXE")
	if exe == "" {
		t.Skip("QOLBOT_GAME_EXE not set")
	}
	lv := loadLevels(exe)
	if lv == nil {
		t.Fatal("Levels.txt not read")
	}
	var lists [][]int
	for _, n := range []string{"Barabas", "Xena", "Sankt", "Darius"} {
		b, err := os.ReadFile(filepath.Join("..", "..", "d2bs", "kolbot", "data", "waypoints-"+n+".json"))
		if err != nil {
			t.Skip("no waypoint files")
		}
		var l []int
		if json.Unmarshal(b, &l) != nil {
			t.Fatal("bad json")
		}
		lists = append(lists, l)
	}
	sh, act, _ := sharedWaypoints(lists)
	for _, weakest := range []int{10, 20, 26, 28} {
		r := chooseHuntPlaces(huntPlaces, lv, 0, weakest, act, sh, 2, nil)
		t.Logf("highest act %d, weakest level %d -> %v (%d places)", act, weakest, names(r), len(r))
	}
	if r := chooseHuntPlaces(huntPlaces, lv, 0, 26, act, sh, 2, nil); len(r) == 0 {
		t.Error("nothing chosen for the real team")
	}
}

func TestBadPlaceAndSkip(t *testing.T) {
	now := time.Now()
	fresh := now.Add(-time.Hour)
	if badPlace(payTally{Runs: 1, Dur: 5 * time.Minute, Gold: -2000, Updated: fresh}, now) {
		t.Error("one run is not enough")
	}
	if !badPlace(payTally{Runs: 2, Dur: 8 * time.Minute, Gold: -608, Updated: fresh}, now) { // the Ancient Tunnels of 2026-11-13: -72 a minute
		t.Error("two runs at -72 a minute is bad")
	}
	if badPlace(payTally{Runs: 2, Dur: 8 * time.Minute, Gold: 400, Updated: fresh}, now) {
		t.Error("a place that pays is not bad")
	}
	if !badPlace(payTally{Runs: 1, Chickens: 3, Updated: fresh}, now) {
		t.Error("three chickens make a place bad")
	}
	if badPlace(payTally{Runs: 13, Dur: 130 * time.Minute, Gold: 23063, Chickens: 3, Updated: fresh}, now) { // the Catacombs of 2026-11-14: 176 a minute
		t.Error("a place that clearly pays is not bad for three chickens")
	}
	if !badPlace(payTally{Runs: 1, Dur: 8 * time.Minute, Gold: -1285, Chickens: 4, Updated: fresh}, now) { // the tombs
		t.Error("the tombs are bad")
	}
	if badPlace(payTally{Runs: 2, Dur: 8 * time.Minute, Gold: -608, Chickens: 5, Updated: now.Add(-25 * time.Hour)}, now) {
		t.Error("yesterday's numbers are forgotten")
	}
	// the chooser skips a place the rule calls bad and takes the next one
	lv := testLevels()
	all := set(1, 6, 35, 40, 44, 46, 75)
	got := names(chooseHuntPlaces(huntPlaces, lv, 0, 26, 3, all, 1, func(n string) bool { return n == "Tal Rasha's Tombs" }))
	if !reflect.DeepEqual(got, []string{"Ancient Tunnels"}) {
		t.Errorf("tombs skipped: %v", got)
	}
}

func TestPayKey(t *testing.T) {
	if payKey("AncientTunnels") != payKey("Ancient Tunnels") || payKey("Tombs") != payKey("Tal Rasha's Tombs") || payKey("Countess") != payKey("The Countess's tower") {
		t.Errorf("a script name and its place must share a key: %q %q | %q %q | %q %q", payKey("AncientTunnels"), payKey("Ancient Tunnels"), payKey("Tombs"), payKey("Tal Rasha's Tombs"), payKey("Countess"), payKey("The Countess's tower"))
	}
	if payKey("Catacombs") == payKey("Tombs") {
		t.Error("different places must not share a key")
	}
}

// TestRealMaxLife prints the base maximum life the leader choice sees for the real saves. Only when QOLBOT_SAVE_DIR is set.
func TestRealMaxLife(t *testing.T) {
	dir := os.Getenv("QOLBOT_SAVE_DIR")
	if dir == "" {
		t.Skip("QOLBOT_SAVE_DIR not set")
	}
	for _, n := range []string{"Barabas", "Xena", "Sankt", "Darius"} {
		raw, err := os.ReadFile(filepath.Join(dir, n+".d2s"))
		if err != nil {
			t.Skip("no save")
		}
		sv, err := spec.ParseSave(raw)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("%s level %d max life %d (bucket %d)", n, sv.Level, sv.MaxLifeRaw/256, sv.MaxLifeRaw/256/100)
	}
}

func TestFixedHuntPlaces(t *testing.T) {
	all := map[int]bool{6: true, 35: true, 44: true, 46: true, 83: true, 101: true, 107: true, 129: true}
	names := func(p []huntPlace) string {
		var n []string
		for _, h := range p {
			n = append(n, h.Name)
		}
		return strings.Join(n, " | ")
	}
	want := map[int]string{
		2: "The Countess's tower | Catacombs",
		3: "The Countess's tower | Tal Rasha's Tombs",
		4: "The Countess's tower | Travincal | Mephisto's lair",
		5: "The Countess's tower | Chaos Sanctuary",
		6: "The Countess's tower | Worldstone Keep",
	}
	for act, w := range want {
		if got := names(fixedHuntPlaces(huntPlaces, act, all)); got != w {
			t.Errorf("act %d: %q, want %q", act, got, w)
		}
	}
	if got := fixedHuntPlaces(huntPlaces, 1, all); len(got) != 0 {
		t.Errorf("act 1 has no fixed list (full clears from town): %v", got)
	}
	// the tombs also clear Duriel's lair
	for _, p := range fixedHuntPlaces(huntPlaces, 3, all) {
		if p.Name == "Tal Rasha's Tombs" && p.Areas[len(p.Areas)-1] != 73 {
			t.Errorf("tombs+ ends with Duriel's lair (73): %v", p.Areas)
		}
	}
	// no waypoint, no place (the user's earlier rule)
	delete(all, 6)
	if got := names(fixedHuntPlaces(huntPlaces, 2, all)); got != "Catacombs" {
		t.Errorf("without the Black Marsh waypoint: %q", got)
	}
	// the selection does not depend on anything learned: no skip function exists in it
}
