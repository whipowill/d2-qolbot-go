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
	sv, err := spec.ReadSave(m.savePath(character))
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
	p.HardStats = []int{sv.Str, sv.Dex, sv.Vit, sv.Ene}
	p.HardStatsAt = time.Now().UnixMilli()
	p.SkillPoints = map[string]int{}
	for id, n := range sv.Skills {
		p.SkillPoints[strconv.Itoa(id)] = n
	}
	m.mu.Lock()
	p.SafeMode = m.cfg.SafeMode
	p.Protect = m.protectLocked()
	p.Storage = m.storageLocked()
	p.Plugy = m.usesPlugy()
	p.Quartermaster = m.cfg.Effective().Quartermaster
	p.QOL = m.cfg.Effective().QOL
	eff := m.cfg.Effective()
	p.AutoTown = eff.AutoTown
	p.Gamble = eff.Gamble
	if st := m.states[profile]; st != nil && m.roleOf(st) == "host" && st.Role == "" { // the leader bot farms: its own lists
		p.Pickit = m.leaderLists(p.Class)
		if m.pickitRules().any() {
			m.writeGeneratedNIP()
			p.Pickit = append(p.Pickit, generatedNIP)
		}
		// The leader loads GoldSell.nip only on a gold hunt (the user, 2026-11-13): normally it picks up everything that might be a keeper or an upgrade and
		// sells what turns out to be neither, so it makes gold anyway. The followers load it always (below).
		if m.levelUp != nil && m.levelUp.Kind == "gold" {
			p.Pickit = append(p.Pickit, "GoldSell.nip") // after every keep list; a keeper that does not fit sends the leader to town to sell these first
		}
	} else {
		p.Pickit = baselinePickit(p.Class)
		if m.pickitRules().any() { // the Keeper tab's rules too, BEFORE GoldSell.nip: a follower must know a keeper (every unique and set, say) when one comes off it or turns up in
			m.writeGeneratedNIP() // its pack, else it is "junk" and gets sold once the Equipment protection is off. What a follower PICKS UP is still limited (questOnly, below).
			p.Pickit = append(p.Pickit, generatedNIP)
		}
		p.Pickit = append(p.Pickit, "GoldSell.nip")
		p.NoPickup = true // with a bot leader it picks up the keepers, and with you playing you do (the user, 2026-11-17: "in real player mode, bots should only pick sale items not potentially keepers"); a follower takes quest consumables and the gold items of GoldSell.nip (Pickit.sellItem), nothing else
	}
	// The leader bot (the one that hosts because you are not playing) runs the goal; every other bot is a follower. Nobody picks a
	// script by hand.
	p.TeamGoal = m.goalNow() // followers need it too (their quest hand-ins: Follower.js, Chores "quest talk"); "goal" below stays the leader's alone
	if st := m.states[profile]; st != nil && st.Role == "" && m.roleOf(st) == "host" {
		p.Script = "Goal"
		p.Goal = m.goalNow()
		p.Farm = m.farmSelection()
	}
	if m.levelUp != nil {
		p.Hunt = m.levelUp.Kind
		p.HuntAreas = m.levelUp.Areas // a level hunt of a team still in act 1 clears zones too
		if m.levelUp.Kind == "gold" {
			p.HuntGoal = m.levelUp.Goal
		}
	}
	p.PartySync = m.cfg.NotPlaying // "always together" only while nobody plays: with a human in the game a bot that needs town goes alone and comes back by its own portal
	p.ReportTasks = m.reportTasks()
	p.ReportProblems = eff.ReportProblems
	if _, every, available := m.saveSettingsLocked(); available && m.usesPlugy() { // the lock is held here: the Locked variant must be used
		p.AutoSaveMinutes = every
		p.SaveOnChicken = eff.SaveOnChicken
	}
	if !m.usesPlugy() || !m.plugyCommands {
		p.Storage.AddStashPages = false // cannot be done: the bot will stop with an error instead of trying /insertpage
	}
	p.Banter = eff.Banter
	p.BanterBubble = eff.BanterBubble
	// The three automation switches (Automation tab); Safe mode (Bots page) overrides all of them.
	p.AutoEquip = !p.SafeMode && eff.AutoEquip
	p.AutoStat = !p.SafeMode && eff.AutoStat
	p.AutoSkill = !p.SafeMode && eff.AutoSkill
	p.Respec = p.AutoSkill && eff.AutoRespec && (p.Plugy || p.QOL) // taking points back needs Auto Skill to spend them again, and PlugY's button
	if st := m.states[profile]; st != nil {
		p.Merc = st.Profile.Merc
	}
	mt := m.mercTable()
	p.MercKinds, p.MercCandidates, p.MercQolEquip, p.MercDropOnHire = mt.Kinds, mt.Candidates, mt.QolEquip, mt.DropOnHire
	p.RespecForce = p.Respec && force != ""
	p.StatButtons = statButtonsKnown() || p.QOL                       // with the chat command no button position is needed
	p.RespecStat = p.AutoStat && eff.AutoRespec && (p.Plugy || p.QOL) // the same setting governs the stats (the user, 2026-11-13); they need Auto Stat to spend the points again
	if m.cfg.MercWear != nil {
		p.MercWear = *m.cfg.MercWear
	}
	p.QuestClearAll = eff.QuestClearAll
	p.QuestWaypoints = eff.QuestWaypoints
	p.InventoryLayout = eff.InventoryLayout
	p.RegroupSeconds = eff.RegroupSeconds
	p.Regroup = eff.Regroup
	p.TeleportTeam = eff.TeleportTeam
	p.WatchKills = eff.WatchKills
	m.mu.Unlock()
	if err := p.WriteFile(filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "data"), profile); err != nil {
		m.logf(9, profile, "auto-spec: cannot write plan: %v", err)
		return
	}
	m.logf(0, profile, "auto-spec: %s (%s): %s%s", p.Mode, p.Spec, p.Reason, map[bool]string{true: " [SAFE MODE: no auto-equip, no stat points, no skill points]"}[p.SafeMode])
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
	path := m.savePath(character)
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
