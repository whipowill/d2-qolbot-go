package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"d2qolbot/internal/spec"
)

var (
	tplMu    sync.Mutex
	tplCache = map[int][]string{}
)

// specOptions lists the build templates available for a class (cached; they only change when files are edited).
func (m *Manager) specOptions(class string) []string {
	idx := -1
	for i, n := range spec.ClassNames {
		if n == class {
			idx = i
		}
	}
	if idx < 0 {
		return nil
	}
	tplMu.Lock()
	defer tplMu.Unlock()
	if o, ok := tplCache[idx]; ok {
		return o
	}
	var names []string
	for _, t := range spec.LoadTemplates(m.libsDir(), idx) {
		names = append(names, t.Name)
	}
	tplCache[idx] = names
	return names
}

// setProfileSpec forces (or, with "", un-forces) the build for one character.
func (m *Manager) setProfileSpec(profile, name string) error {
	m.mu.Lock()
	s := m.states[profile]
	if s == nil {
		m.mu.Unlock()
		return fmt.Errorf("unknown profile %q", profile)
	}
	class := ""
	if s.Char != nil {
		class = s.Char.Class
	}
	m.mu.Unlock()
	if name != "" {
		ok := false
		for _, o := range m.specOptions(class) {
			ok = ok || strings.EqualFold(o, name)
		}
		if !ok {
			return fmt.Errorf("%s has no %q build", class, name)
		}
	}
	m.mu.Lock()
	s.Profile.Spec = name
	m.mu.Unlock()
	m.logf(0, profile, "build %s", map[bool]string{true: "set to " + name + " (applies the next time it starts)", false: "back to automatic"}[name != ""])
	return m.saveConfig()
}

// setSettings changes the handful of connection settings that used to mean editing the config file by hand.
func (m *Manager) setSettings(hostIP string, headless bool, wine string) error {
	hostIP, wine = strings.TrimSpace(hostIP), strings.TrimSpace(wine)
	if hostIP == "" {
		return fmt.Errorf("the host address cannot be empty (use localhost when you host on this computer)")
	}
	if wine != "" {
		if _, err := exec.LookPath(wine); err != nil {
			return fmt.Errorf("Wine program %q was not found", wine)
		}
	}
	m.mu.Lock()
	m.cfg.HostIP = hostIP
	m.cfg.Headless = &headless
	if wine != "" {
		m.cfg.Wine = wine
	}
	m.mu.Unlock()
	if err := m.writeD2BSIni(); err != nil { // the host address lives in d2bs.ini
		return err
	}
	m.logf(0, "", "settings saved: host %s, headless=%v, wine=%s (wine and headless apply from the next start of Qolbot)", hostIP, headless, m.cfg.Wine)
	return m.saveConfig()
}

// farmCatalog is every farm run a bot can be asked to do, in the order they run (by act). Only scripts that exist in the
// kolbot folder are offered.
type farmRun struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	Act   int    `json:"act"`
}

var farmAll = []farmRun{
	{"Corpsefire", "Corpsefire", 1}, {"Mausoleum", "Blood Raven", 1}, {"Pit", "The Pit", 1},
	{"Countess", "Countess", 1}, {"Andariel", "Andariel", 1}, {"Cows", "Secret Cow Level", 1},
	{"Radament", "Radament", 2}, {"AncientTunnels", "Ancient Tunnels", 2}, {"Summoner", "The Summoner", 2}, {"Duriel", "Duriel", 2},
	{"Travincal", "Travincal", 3}, {"Mephisto", "Mephisto", 3},
	{"Izual", "Izual", 4}, {"Hephasto", "Hephasto", 4}, {"Diablo", "Diablo", 4},
	{"Pindleskin", "Pindleskin", 5}, {"Eldritch", "Eldritch & Shenk", 5}, {"Nihlathak", "Nihlathak", 5}, {"Worldstone", "Worldstone Keep", 5}, {"Baal", "Baal", 5},
}

func (m *Manager) farmCatalog() []farmRun {
	var out []farmRun
	for _, f := range farmAll {
		if _, err := os.Stat(filepath.Join(m.libsDir(), "bots", f.Name+".js")); err == nil {
			out = append(out, f)
		}
	}
	return out
}

// farmSelection returns the chosen farm runs that exist, in running order.
func (m *Manager) farmSelection() []string {
	chosen := map[string]bool{}
	for _, n := range m.cfg.FarmRuns {
		chosen[n] = true
	}
	var out []string
	for _, f := range m.farmCatalog() {
		if chosen[f.Name] {
			out = append(out, f.Name)
		}
	}
	return out
}

// setGoal saves the goal ("Quest" or "Farm") and the farm runs. The goal only matters when you are not playing.
func (m *Manager) setGoal(goal, difficulty string, farm []string) error {
	switch goal {
	case "Quest", "Farm":
	default:
		return fmt.Errorf("%q is not a goal (Quest or Farm)", goal)
	}
	switch difficulty {
	case "Normal", "Nightmare", "Hell":
	case "":
		difficulty = "Hell"
	default:
		return fmt.Errorf("%q is not a difficulty (Normal, Nightmare or Hell)", difficulty)
	}
	known := map[string]bool{}
	for _, f := range m.farmCatalog() {
		known[f.Name] = true
	}
	var keep []string
	for _, n := range farm {
		if !known[n] {
			return fmt.Errorf("%q is not a farm run", n)
		}
		keep = append(keep, n)
	}
	m.mu.Lock()
	m.cfg.Goal = goal
	m.cfg.Difficulty = difficulty
	m.cfg.FarmRuns = keep
	m.mu.Unlock()
	m.logf(0, "", "objective set to %s on %s (%d farm run(s)); the leader bot uses it the next time it starts", goal, difficulty, len(keep))
	return m.saveConfig()
}

// roleOf is how a bot starts: "" = joins a game, "host" = hosts one. The leader bot hosts when you are not playing; every
// other bot joins it. (A profile can also be given a role by hand in qolbot.json, for testing.) Caller holds m.mu.
func (m *Manager) roleOf(s *State) string {
	if s.Role != "" {
		return s.Role
	}
	if m.cfg.NotPlaying && m.cfg.Player != "" && s.Character == m.cfg.Player {
		return "host"
	}
	return ""
}

// setPlaying switches between "you are playing" (bots join your game) and "you are not playing" (the leader bot hosts).
func (m *Manager) setPlaying(playing bool) error {
	m.mu.Lock()
	for _, s := range m.states {
		if s.Wanted || s.Status == "running" || s.Status == "starting" {
			m.mu.Unlock()
			return fmt.Errorf("stop all bots before changing whether you are playing")
		}
	}
	m.cfg.NotPlaying = !playing
	if !playing { // the leader must be one of the bots now
		known := false
		for _, s := range m.states {
			known = known || s.Character == m.cfg.Player
		}
		if !known {
			m.cfg.Player = ""
		}
	}
	m.mu.Unlock()
	m.logf(0, "", "you are %s", map[bool]string{true: "playing: bots join your game", false: "not playing: the leader bot hosts the game and the others join it"}[playing])
	m.writeBotNames()
	return m.saveConfig()
}

// goalNow is the goal the leader bot plays when you are not playing: Quest or Farm, and Farm until one is chosen.
func (m *Manager) goalNow() string {
	if m.cfg.Goal == "Quest" {
		return "Quest"
	}
	return "Farm"
}

// difficultyNow is the difficulty the leader bot hosts in.
func (m *Manager) difficultyNow() string {
	switch m.cfg.Difficulty {
	case "Normal", "Nightmare":
		return m.cfg.Difficulty
	}
	return "Hell"
}
