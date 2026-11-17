package main

// What each farm place PAYS (2026-11-13, the user: "can you choose better locations ... tombs would prob be better in Normal"). The leader's log says
// "Starting script: <place>" when a farm run begins and "Run duration" when it ends. Qolbot takes the team's gold (pack plus stash, from the purse files)
// at the start and at the end and logs the difference: `hunt pay: Tombs 12m: +3400 gold (283/min); Tombs so far: 2 runs, 25m, +6100 (244/min)`.
// It is the NET gold (what potions, scrolls and repairs cost is already taken off), which is what matters.
//
// LEARNING (2026-11-13, overnight): the Ancient Tunnels paid -72 gold a minute over two runs because Barabas chickened twice there, and a chicken costs
// repairs, potions and portal scrolls. The tallies are kept (logs/huntpay.json, so a restart does not forget them) with the chickens that happened during
// each place's runs, and `placeBad` skips a place that lost gold over two runs or chickened three times in the last day: the gold hunt chooser and the
// level hunt list both ask it.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type payMark struct {
	Script string
	At     time.Time
	Gold   int
	Names  []string
}

type payTally struct {
	Runs     int           `json:"runs"`
	Dur      time.Duration `json:"dur"`
	Gold     int           `json:"gold"`
	Chickens int           `json:"chickens"`
	Updated  time.Time     `json:"updated"`
}

const (
	payStaleAfter = 24 * time.Hour // a tally older than this is forgotten: a place gets another chance the next day
	payBadPerMin  = -30            // two or more runs at less than this many gold a minute make a place bad
	payBadChicken = 3              // this many chickens during a place's runs make it bad, UNLESS the place clearly pays (payOKPerMin)
	payOKPerMin   = 60             // a place at or above this many gold a minute is never bad for its chickens (the Catacombs: 3 chickens, +176 a minute)
)

// badPlace is the rule on a tally (pure, for the tests).
func badPlace(t payTally, now time.Time) bool {
	if now.Sub(t.Updated) > payStaleAfter {
		return false
	}
	if t.Chickens >= payBadChicken && !(t.Runs >= 2 && perMinute(t.Gold, t.Dur) >= payOKPerMin) {
		return true
	}
	return t.Runs >= 2 && t.Gold < 0 && perMinute(t.Gold, t.Dur) < payBadPerMin
}

// payNorm: lower case, letters and digits only.
func payNorm(label string) string {
	var b []rune
	for _, r := range strings.ToLower(label) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b = append(b, r)
		}
	}
	return string(b)
}

// payAlias: the farm SCRIPT names a level hunt runs, and the PLACE names a gold hunt runs, are the same places: one tally for both (the place names come
// from huntPlaces, so they cannot drift apart).
var payAlias = map[string]string{
	"tombs":          payNorm("Tal Rasha's Tombs"),
	"ancienttunnels": payNorm("Ancient Tunnels"),
	"countess":       payNorm("The Countess's tower"),
	"catacombs":      payNorm("Catacombs"),
}

// payKey is the tally key of a label: normalised, and a script name turned into its place's key.
func payKey(label string) string {
	k := payNorm(label)
	if a, ok := payAlias[k]; ok {
		return a
	}
	return k
}

func (m *Manager) payFile() string { return filepath.Join(m.root, "logs", "huntpay.json") }

// payLoadLocked reads the saved tallies once. Caller holds m.mu.
func (m *Manager) payLoadLocked() {
	if m.payTotals != nil {
		return
	}
	m.payTotals = map[string]*payTally{}
	if b, err := os.ReadFile(m.payFile()); err == nil {
		raw := map[string]*payTally{}
		json.Unmarshal(b, &raw)
		for k, t := range raw { // an older file may use script names or place names: fold them into the canonical keys
			if t == nil {
				continue
			}
			ck := payKey(k)
			if have := m.payTotals[ck]; have != nil {
				have.Runs, have.Dur, have.Gold, have.Chickens = have.Runs+t.Runs, have.Dur+t.Dur, have.Gold+t.Gold, have.Chickens+t.Chickens
				if t.Updated.After(have.Updated) {
					have.Updated = t.Updated
				}
			} else {
				c := *t
				m.payTotals[ck] = &c
			}
		}
	}
}

// paySaveLocked writes the tallies. Caller holds m.mu.
func (m *Manager) paySaveLocked() {
	if b, err := json.MarshalIndent(m.payTotals, "", " "); err == nil {
		os.WriteFile(m.payFile(), b, 0o644)
	}
}

// placeBad: the hunts skip this place (its label is the place's name, or the farm script's name on a level hunt).
func (m *Manager) placeBad(label string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.payLoadLocked()
	t := m.payTotals[payKey(label)]
	return t != nil && badPlace(*t, time.Now())
}

// placeBadLocked is placeBad for a caller that already holds m.mu.
func (m *Manager) placeBadLocked(label string) bool {
	m.payLoadLocked()
	t := m.payTotals[payKey(label)]
	return t != nil && badPlace(*t, time.Now())
}

// huntPayChicken: a bot chickened while the leader is on a farm place: it counts against that place.
func (m *Manager) huntPayChicken() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.payMark == nil {
		return
	}
	m.payLoadLocked()
	t := m.payTotals[payKey(m.payMark.Script)]
	if t == nil {
		t = &payTally{}
		m.payTotals[payKey(m.payMark.Script)] = t
	}
	if time.Since(t.Updated) > payStaleAfter {
		*t = payTally{}
	}
	t.Chickens++
	t.Updated = time.Now()
	m.paySaveLocked()
}

func isFarmName(script string) bool {
	if script == "ClearAnyArea" { // a gold hunt's generic clear run
		return true
	}
	for _, f := range farmAll {
		if f.Name == script {
			return true
		}
	}
	return false
}

// perMinute is the gold per minute for a net gain over a time; 0 for no time.
func perMinute(gold int, d time.Duration) int {
	if d <= 0 {
		return 0
	}
	return int(float64(gold) / d.Minutes())
}

func (m *Manager) isLeaderBot(bot string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	st := m.states[bot]
	return st != nil && st.Role == "" && m.roleOf(st) == "host"
}

// huntPayStart: the leader started a script. Closes the run before it and, for a farm place, opens a new one.
func (m *Manager) huntPayStart(bot, script string) {
	if !m.isLeaderBot(bot) {
		return
	}
	m.huntPayClose(bot)
	if !isFarmName(script) {
		return
	}
	names := m.runningTeam()
	total, known := m.teamGold(names)
	if len(names) == 0 || known != len(names) { // somebody has not reported: no honest starting figure
		return
	}
	m.mu.Lock()
	label := script
	if script == "ClearAnyArea" && m.levelUp != nil && m.levelUp.Place != "" {
		label = m.levelUp.Place // the place the hunt chose, so each place gets its own tally
	}
	m.payMark = &payMark{Script: label, At: time.Now(), Gold: total, Names: names}
	m.mu.Unlock()
}

// huntPayClose: the leader's run ended (the next script started, or "Run duration"). Logs what the place paid.
func (m *Manager) huntPayClose(bot string) {
	if !m.isLeaderBot(bot) {
		return
	}
	m.mu.Lock()
	mk := m.payMark
	m.payMark = nil
	m.mu.Unlock()
	if mk == nil {
		return
	}
	dur := time.Since(mk.At)
	if dur < 30*time.Second {
		return
	}
	total, known := m.teamGold(mk.Names)
	if known != len(mk.Names) {
		return
	}
	delta := total - mk.Gold
	m.mu.Lock()
	m.payLoadLocked()
	t := m.payTotals[payKey(mk.Script)]
	if t == nil {
		t = &payTally{}
		m.payTotals[payKey(mk.Script)] = t
	}
	if time.Since(t.Updated) > payStaleAfter && t.Updated != (time.Time{}) { // yesterday's numbers are forgotten
		*t = payTally{}
	}
	t.Runs++
	t.Dur += dur
	t.Gold += delta
	t.Updated = time.Now()
	runs, td, tg, ch := t.Runs, t.Dur, t.Gold, t.Chickens
	m.paySaveLocked()
	m.mu.Unlock()
	m.logf(0, "", "%s", fmt.Sprintf("hunt pay: %s %dm: %+d gold (%d/min); %s so far: %d run(s), %dm, %+d (%d/min)",
		mk.Script, int(dur.Minutes()+0.5), delta, perMinute(delta, dur), mk.Script, runs, int(td.Minutes()+0.5), tg, perMinute(tg, td))+fmt.Sprintf(", %d chicken(s)", ch))
}
