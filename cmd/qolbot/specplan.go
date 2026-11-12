package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"d2qolbot/internal/spec"
)

// libsDir is the kolbot libs folder (templates live under config/Templates).
func (m *Manager) libsDir() string { return filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "libs") }

// planFor reads a character's save and decides what it is and what it should keep doing.
func (m *Manager) planFor(character string) (spec.Plan, *spec.Save, error) {
	sv, err := spec.ReadSave(filepath.Join(m.saveDir(), character+".d2s"))
	if err != nil {
		return spec.Plan{}, nil, err
	}
	return spec.Detect(sv, spec.LoadTemplates(m.libsDir(), sv.Class)), sv, nil
}

// writeSpec stores data/<profile>.spec.json for AutoSpec.js to read when the game starts.
// A failure is only logged: the bot still starts, it just keeps whatever its config says.
func (m *Manager) writeSpec(profile, character, force string) {
	p, sv, err := m.planFor(character)
	if err != nil {
		m.logf(9, profile, "auto-spec: cannot read %s.d2s: %v", character, err)
		return
	}
	if force != "" {
		if fp, ok := spec.Forced(sv, spec.LoadTemplates(m.libsDir(), sv.Class), force); ok {
			p = fp
		} else {
			m.logf(9, profile, "auto-spec: no %s template called %q, using detection instead", p.Class, force)
		}
	}
	p.SkillPoints = map[string]int{}
	for id, n := range sv.Skills {
		p.SkillPoints[strconv.Itoa(id)] = n
	}
	m.mu.Lock()
	p.SafeMode = m.cfg.SafeMode
	p.Protect = m.protectLocked()
	p.Storage = m.storageLocked()
	p.Plugy = m.usesPlugy()
	p.AutoTown = m.cfg.AutoTown == nil || *m.cfg.AutoTown
	p.Gamble = m.cfg.Gamble == nil || *m.cfg.Gamble
	if st := m.states[profile]; st != nil && m.roleOf(st) == "host" && st.Role == "" { // the leader bot farms: its own lists
		p.Pickit = m.leaderLists(p.Class)
		if m.pickitRules().any() {
			m.writeGeneratedNIP()
			p.Pickit = append(p.Pickit, generatedNIP)
		}
	} else {
		p.Pickit = baselinePickit(p.Class)
		p.NoPickup = m.cfg.NotPlaying // the leader alone picks things up; the followers are support
	}
	// The leader bot (the one that hosts because you are not playing) runs the goal; every other bot is a follower. Nobody picks a
	// script by hand.
	if st := m.states[profile]; st != nil && st.Role == "" && m.roleOf(st) == "host" {
		p.Script = "Goal"
		p.Goal = m.goalNow()
		p.Farm = m.farmSelection()
	}
	p.ReportTasks = m.reportTasks()
	p.ReportProblems = m.cfg.ReportProblems == nil || *m.cfg.ReportProblems
	if _, every, available := m.saveSettingsLocked(); available && m.usesPlugy() { // the lock is held here: the Locked variant must be used
		p.AutoSaveMinutes = every
	}
	if !m.usesPlugy() || !m.plugyCommands {
		p.Storage.AddStashPages = false // cannot be done: the bot will stop with an error instead of trying /insertpage
	}
	p.Banter = m.cfg.Banter == nil || *m.cfg.Banter
	p.BanterBubble = m.cfg.BanterBubble
	// The three automation switches (Automation tab); Safe mode (Bots page) overrides all of them.
	p.AutoEquip = !p.SafeMode && (m.cfg.AutoEquip == nil || *m.cfg.AutoEquip)
	p.AutoStat = !p.SafeMode && (m.cfg.AutoStat == nil || *m.cfg.AutoStat)
	p.AutoSkill = !p.SafeMode && (m.cfg.AutoSkill == nil || *m.cfg.AutoSkill)
	if m.cfg.MercWear != nil {
		p.MercWear = *m.cfg.MercWear
	}
	p.QuestClearAll = m.cfg.QuestClearAll == nil || *m.cfg.QuestClearAll
	p.WatchKills = m.cfg.WatchKills == nil || *m.cfg.WatchKills
	m.mu.Unlock()
	if err := p.WriteFile(filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "data"), profile); err != nil {
		m.logf(9, profile, "auto-spec: cannot write plan: %v", err)
		return
	}
	m.logf(0, profile, "auto-spec: %s (%s): %s%s", p.Mode, p.Spec, p.Reason, map[bool]string{true: " [SAFE MODE: no auto-equip, no stat points, no skill points, consumables and quest items only]"}[p.SafeMode])
}

// cliSpec prints the detection for one character or all of them. It only reads save files.
func (m *Manager) cliSpec(args []string) {
	m.scanCharacters()
	var names []string
	if len(args) > 0 {
		names = args
	} else {
		m.mu.Lock()
		for n := range m.states {
			names = append(names, m.states[n].Character)
		}
		m.mu.Unlock()
		sort.Strings(names)
	}
	for _, c := range names {
		p, sv, err := m.planFor(c)
		if err != nil {
			fmt.Fprintf(os.Stderr, "%-10s %v\n", c, err)
			continue
		}
		fmt.Printf("%-10s %-12s L%-2d unspent skills=%d stats=%d  ->  %-8s %-10s %s\n", c, p.Class, sv.Level, sv.UnspentSkills, sv.UnspentStats, p.Mode, p.Spec, p.Reason)
	}
}

// ---- spec label for the web page ----

type specLabelEntry struct {
	mtime      time.Time
	force      string
	label, why string
}

var (
	specCacheMu sync.Mutex
	specCache   = map[string]specLabelEntry{}
	skillNames  map[int]string
	namesOnce   sync.Once
)

func (m *Manager) loadSkillNames() {
	namesOnce.Do(func() {
		skillNames = map[int]string{}
		b, err := os.ReadFile(filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "sdk", "skills.txt"))
		if err != nil {
			return
		}
		for _, l := range strings.Split(string(b), "\n") {
			if f := strings.Split(strings.TrimRight(l, "\r"), "\t"); len(f) >= 2 {
				if id, err := strconv.Atoi(f[0]); err == nil {
					skillNames[id] = f[1]
				}
			}
		}
	})
}

// specLabel is the short build name shown in the web page, cached until the save file changes.
func (m *Manager) specLabel(character, force string) (label, why string) {
	path := filepath.Join(m.saveDir(), character+".d2s")
	st, err := os.Stat(path)
	if err != nil {
		return "", ""
	}
	specCacheMu.Lock()
	e, ok := specCache[character]
	specCacheMu.Unlock()
	if ok && e.mtime.Equal(st.ModTime()) && e.force == force {
		return e.label, e.why
	}
	p, sv, err := m.planFor(character)
	if err != nil {
		return "?", err.Error()
	}
	if force != "" {
		if fp, ok := spec.Forced(sv, spec.LoadTemplates(m.libsDir(), sv.Class), force); ok {
			p = fp
		}
	}
	switch p.Mode {
	case "fresh":
		label = p.Spec + " (new)"
	case "custom":
		label = "custom"
		if p.Main > 0 {
			m.loadSkillNames()
			if n := skillNames[p.Main]; n != "" {
				label = "custom: " + n
			}
		}
	default:
		label = p.Spec
	}
	if force != "" && p.Mode == "template" {
		label += " (set)"
	}
	specCacheMu.Lock()
	specCache[character] = specLabelEntry{st.ModTime(), force, label, p.Reason}
	specCacheMu.Unlock()
	return label, p.Reason
}

// protectLocked returns the configured protected-item rules or the defaults. Caller holds m.mu.
func (m *Manager) protectLocked() spec.Protect {
	if m.cfg.Protect == nil {
		return spec.DefaultProtect()
	}
	return *m.cfg.Protect
}

// storageLocked returns the configured container sizes or the default sizes. Caller holds m.mu.
func (m *Manager) storageLocked() spec.Storage {
	if m.cfg.Storage == nil {
		return spec.DefaultStorage()
	}
	return m.cfg.Storage.Normalize()
}
