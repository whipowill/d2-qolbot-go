package main

import (
	"d2qolbot/internal/spec"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
)

// The web page's API handlers (registered in serveWeb): one method each.

func (m *Manager) apiState(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	list := make([]*State, 0, len(m.states))
	for _, s := range m.states {
		if !s.Hidden {
			c := *s
			list = append(list, &c)
		}
	}
	logs := append([]LogLine(nil), m.logs...)
	player := m.cfg.Player
	leader := m.leaderShownLocked()
	safe := m.cfg.SafeMode
	protect := m.protectLocked()
	gameExe := m.cfg.GameExe
	hostIP, wineBin := m.cfg.HostIP, m.cfg.Wine
	storage := m.storageLocked()
	saveOnStop, saveEvery, saveAvail := m.saveSettingsLocked()
	plugy := m.plugyReportLocked()
	eff := m.cfg.Effective()
	autoTown, gamble := eff.AutoTown, eff.Gamble
	goal := m.goalNow()
	difficulty := m.difficultyNow()
	playing := !m.cfg.NotPlaying
	farmSel := m.farmSelection()
	detour := m.detourLocked()
	fatal := m.fatalLocked()
	notice := m.notice
	reportTasks := m.reportTasks()
	reportProblems, banter := eff.ReportProblems, eff.Banter
	bubble := eff.BanterBubble
	autoEquip, autoStat, autoSkill, autoRespec := eff.AutoEquip, eff.AutoStat, eff.AutoSkill, eff.AutoRespec
	questClearAll, teleportTeam, questWaypoints := eff.QuestClearAll, eff.TeleportTeam, eff.QuestWaypoints
	chickenLimit, chickenWindow := m.readinessLimits()
	var mercWear spec.MercWear
	if m.cfg.MercWear != nil {
		mercWear = *m.cfg.MercWear
	}
	m.mu.Unlock()
	gameProblem := m.gameProblem()
	var cpuInfo any // null where it cannot be measured (only Linux can)
	if pct, cores, ok := m.cpu.average(); ok {
		cpuInfo = map[string]any{"percent": pct, "cores": cores}
	}
	for _, c := range list { // outside the lock: reads save files (cached by file time)
		c.Forced = c.Profile.Spec
		if c.Char != nil {
			c.SpecOptions = m.specOptions(c.Char.Class)
		}
		c.Audit = m.auditFor(c.Character) // runs once, on the first page load
		c.Spec, c.SpecWhy = m.specLabel(c.Character, c.Profile.Spec)
		c.SpecAuto = c.Spec
		if c.Forced != "" {
			c.SpecAuto, _ = m.specLabel(c.Character, "")
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	if len(logs) > 200 {
		logs = logs[len(logs)-200:]
	}
	json.NewEncoder(w).Encode(map[string]any{"demo": devDemo(), "cpu": cpuInfo, "mercWear": mercWear, "mercTable": m.mercTable(), "profiles": list, "events": m.recentEvents(60), "chat": m.recentChat(8), "leader": leader, "logs": logs, "player": player, "safeMode": safe, "protect": protect, "autoEquip": autoEquip, "autoStat": autoStat, "autoSkill": autoSkill, "autoRespec": autoRespec, "detour": detour, "fatal": fatal, "notice": notice, "questClearAll": questClearAll, "questWaypoints": questWaypoints, "inventoryLayout": eff.InventoryLayout, "regroupSeconds": eff.RegroupSeconds, "regroup": eff.Regroup, "teleportTeam": teleportTeam, "saveOnChicken": eff.SaveOnChicken, "chickenLimit": chickenLimit, "chickenWindowMinutes": int(chickenWindow / time.Minute),
		"plugy": plugy, "quartermaster": eff.Quartermaster, "qol": eff.QOL, "autoTown": autoTown, "gamble": gamble, "goal": goal, "difficulty": difficulty, "playing": playing, "farmRuns": farmSel, "farmCatalog": m.farmCatalog(), "reportTasks": reportTasks, "reportProblems": reportProblems, "saveOnStop": saveOnStop, "autoSaveMinutes": saveEvery, "saveAvailable": saveAvail,
		"storage": storage, "banter": banter, "banterBubble": bubble,
		"hostIp": hostIP, "headless": m.headlessValue(), "wine": wineBin,
		"gameExe": gameExe, "gameOK": gameProblem == "", "gameProblem": gameProblem})
}

// POST /api/restorepoints?profile=<bot>: puts back the skill points, stat points and life the audit found missing (audit.go). The bot must
// be stopped. The answer is the sentence to show the player.
func (m *Manager) apiRestorePoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", 405)
		return
	}
	msg, err := m.restorePoints(r.URL.Query().Get("profile"))
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	fmt.Fprint(w, msg)
}

// POST /api/goal with {"goal": "Follow|Quest|Farm", "farm": ["Mephisto", ...]}.
func (m *Manager) apiGoal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", 405)
		return
	}
	var in struct {
		Goal       string   `json:"goal"`
		Difficulty string   `json:"difficulty"`
		Farm       []string `json:"farm"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
		http.Error(w, "bad JSON: "+err.Error(), 400)
		return
	}
	if err := m.setGoal(in.Goal, in.Difficulty, in.Farm); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	fmt.Fprint(w, "ok")
}

// POST /api/play with {"storage": {...}, "banter": bool, "banterBubble": bool}: how bots handle space and talk.
func (m *Manager) apiPlay(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", 405)
		return
	}
	var in struct {
		Storage        *spec.Storage `json:"storage"`
		Banter         *bool         `json:"banter"`
		BanterBubble   *bool         `json:"banterBubble"`
		SaveOnStop     *bool         `json:"saveOnStop"`
		AutoSaveMin    *int          `json:"autoSaveMinutes"`
		SaveOnChicken  *bool         `json:"saveOnChicken"`
		Plugy          *bool         `json:"plugy"`
		Quartermaster  *bool         `json:"quartermaster"`
		QOL            *bool         `json:"qol"`
		AutoTown       *bool         `json:"autoTown"`
		Gamble         *bool         `json:"gamble"`
		ReportTasks    *bool         `json:"reportTasks"`
		ReportProblems *bool         `json:"reportProblems"`
		ChickenLimit   *int          `json:"chickenLimit"`
		ChickenWindow  *int          `json:"chickenWindowMinutes"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
		http.Error(w, "bad JSON: "+err.Error(), 400)
		return
	}
	if in.ChickenLimit != nil && (*in.ChickenLimit < 0 || *in.ChickenLimit > 99) {
		http.Error(w, "chickens before a bot is stopped must be 0 (never) to 99", 400)
		return
	}
	if in.ChickenWindow != nil && (*in.ChickenWindow < 1 || *in.ChickenWindow > 240) {
		http.Error(w, "the chicken window must be 1 to 240 minutes", 400)
		return
	}
	if in.Storage != nil {
		n := in.Storage.Normalize()
		in.Storage = &n
		if err := in.Storage.Validate(); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
	}
	if in.AutoSaveMin != nil && (*in.AutoSaveMin < 0 || *in.AutoSaveMin > 240) {
		http.Error(w, "save every N minutes must be 0 (off) to 240", 400)
		return
	}
	// Settings that need PlugY are refused, not silently ignored, when PlugY is not available.
	m.mu.Lock()
	wasPlugy := m.cfg.Plugy
	if in.Plugy != nil {
		m.cfg.Plugy = in.Plugy
	}
	_, curEvery, _ := m.saveSettingsLocked()
	every := curEvery
	if in.AutoSaveMin != nil {
		every = *in.AutoSaveMin
	}
	pages := m.storageLocked().AddStashPages
	if in.Storage != nil {
		pages = in.Storage.AddStashPages
	}
	problems := m.plugyProblems(every, pages)
	m.cfg.Plugy = wasPlugy // undo the trial value; it is applied below only if everything passes
	m.mu.Unlock()
	if len(problems) > 0 {
		http.Error(w, strings.Join(problems, "; "), 400)
		return
	}
	m.mu.Lock()
	if in.Plugy != nil {
		m.cfg.Plugy = in.Plugy
	}
	if in.Quartermaster != nil {
		m.cfg.Quartermaster = in.Quartermaster
	}
	if in.QOL != nil {
		m.cfg.QOL = in.QOL
	}
	if in.AutoTown != nil {
		m.cfg.AutoTown = in.AutoTown
	}
	if in.Gamble != nil {
		m.cfg.Gamble = in.Gamble
	}
	if in.ReportTasks != nil {
		m.cfg.ReportTasks = in.ReportTasks
		m.cfg.QuietChat = false
	}
	if in.ReportProblems != nil {
		m.cfg.ReportProblems = in.ReportProblems
	}
	if in.SaveOnStop != nil {
		m.cfg.SaveOnStop = in.SaveOnStop
	}
	if in.AutoSaveMin != nil {
		m.cfg.AutoSaveMinutes = in.AutoSaveMin
	}
	if in.SaveOnChicken != nil {
		m.cfg.SaveOnChicken = in.SaveOnChicken
	}
	if in.Storage != nil {
		m.cfg.Storage = in.Storage
	}
	if in.ChickenLimit != nil {
		m.cfg.ChickenLimit = in.ChickenLimit
	}
	if in.ChickenWindow != nil {
		m.cfg.ChickenWindowMin = in.ChickenWindow
	}
	if in.Banter != nil {
		m.cfg.Banter = in.Banter
	}
	if in.BanterBubble != nil {
		m.cfg.BanterBubble = in.BanterBubble
	}
	m.mu.Unlock()
	m.logf(0, "", "inventory/stash/chat settings updated from the web page (apply to bots started from now on)")
	if err := m.saveConfig(); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Write([]byte("ok"))
}

// POST /api/settings with {"hostIp": "...", "headless": bool, "wine": "..."}.
func (m *Manager) apiSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", 405)
		return
	}
	var in struct {
		HostIP   string `json:"hostIp"`
		Headless bool   `json:"headless"`
		Wine     string `json:"wine"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
		http.Error(w, "bad JSON: "+err.Error(), 400)
		return
	}
	if err := m.setSettings(in.HostIP, in.Headless, in.Wine); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Write([]byte("ok"))
}

// POST /api/game with {"gameExe": "/path/to/Game.exe"} sets where Diablo II is. Nothing can be launched before this.
func (m *Manager) apiGame(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", 405)
		return
	}
	var in struct {
		GameExe string `json:"gameExe"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
		http.Error(w, "bad JSON: "+err.Error(), 400)
		return
	}
	if err := m.setGameExe(in.GameExe); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Write([]byte("ok"))
}

// POST /api/config with a JSON body {"protect": {...}, "autoEquip": bool, "autoStat": bool, "autoSkill": bool} edits the gear rules and the automation switches.
func (m *Manager) apiConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", 405)
		return
	}
	var in struct {
		Protect         *spec.Protect  `json:"protect"`
		AutoEquip       *bool          `json:"autoEquip"`
		AutoStat        *bool          `json:"autoStat"`
		AutoSkill       *bool          `json:"autoSkill"`
		AutoRespec      *bool          `json:"autoRespec"`
		QuestClearAll   *bool          `json:"questClearAll"`
		QuestWaypoints  *bool          `json:"questWaypoints"`
		InventoryLayout *bool          `json:"inventoryLayout"`
		Regroup         *bool          `json:"regroup"`
		RegroupSeconds  *int           `json:"regroupSeconds"`
		TeleportTeam    *bool          `json:"teleportTeam"`
		MercWear        *spec.MercWear `json:"mercWear"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
		http.Error(w, "bad JSON: "+err.Error(), 400)
		return
	}
	m.mu.Lock()
	if in.Protect != nil {
		if in.Protect.ClassIDs == nil { // the page has no box for these; keep what is there (default: Khalim's Will)
			in.Protect.ClassIDs = m.protectLocked().ClassIDs
		}
		m.cfg.Protect = in.Protect
	}
	if in.AutoEquip != nil {
		m.cfg.AutoEquip = in.AutoEquip
	}
	if in.AutoStat != nil {
		m.cfg.AutoStat = in.AutoStat
	}
	if in.AutoSkill != nil {
		m.cfg.AutoSkill = in.AutoSkill
	}
	if in.AutoRespec != nil {
		m.cfg.AutoRespec = in.AutoRespec
	}
	if in.MercWear != nil {
		m.cfg.MercWear = in.MercWear
	}
	if in.Regroup != nil {
		m.cfg.Regroup = in.Regroup
	}
	if in.RegroupSeconds != nil {
		if *in.RegroupSeconds < 10 || *in.RegroupSeconds > 600 {
			m.mu.Unlock()
			http.Error(w, "the regroup time must be 10 to 600 seconds", 400)
			return
		}
		m.cfg.RegroupSeconds = in.RegroupSeconds
	}
	if in.InventoryLayout != nil {
		m.cfg.InventoryLayout = in.InventoryLayout
	}
	if in.QuestWaypoints != nil {
		m.cfg.QuestWaypoints = in.QuestWaypoints
	}
	if in.QuestClearAll != nil {
		m.cfg.QuestClearAll = in.QuestClearAll
	}
	if in.TeleportTeam != nil {
		m.cfg.TeleportTeam = in.TeleportTeam
	}
	m.mu.Unlock()
	m.logf(0, "", "gear rules and automation switches updated from the web page (applies to bots started from now on)")
	if err := m.saveConfig(); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Write([]byte("ok"))
}

// The Pickit tab: GET /api/pickit lists every .nip file and where it is used; POST saves the selection
// ({"follow": [...], "lead": [...]}). /api/pickitfile?path=QOL/Misc.nip reads a list, POST {"path","text"} saves it.
func (m *Manager) apiPickit(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var in struct {
			Lead  []string    `json:"lead"`
			Rules PickitRules `json:"rules"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
			http.Error(w, "bad JSON: "+err.Error(), 400)
			return
		}
		if err := m.setPickit(in.Lead); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if err := m.setPickitRules(in.Rules); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		fmt.Fprint(w, "ok")
		return
	}
	m.mu.Lock()
	rules := m.pickitRules()
	m.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"lists": m.listPickit(), "listsEnabled": customPickitLists, "rules": rules, "runes": runeNames, "bases": m.baseNamesSorted(), "codes": m.codeNames(), "magic": magicCatalog(), "classKinds": classCatalog(), "defaults": m.pickitDefaults(), "gems": []string{"Chipped", "Flawed", "Normal", "Flawless", "Perfect"}})
}

// GET /api/inventory?name=Meir: what the character carries, read from its save file (saveinv.go: no bot needs to run).
func (m *Manager) apiInventory(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	s := m.states[r.URL.Query().Get("name")]
	character := ""
	if s != nil {
		character = s.Character
	}
	m.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if character == "" {
		json.NewEncoder(w).Encode(map[string]any{"known": false, "problem": "unknown profile"})
		return
	}
	rep, saved, problem := m.saveInventory(character)
	if rep.Items == nil {
		json.NewEncoder(w).Encode(map[string]any{"known": false, "problem": problem})
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"known": true, "at": saved.Format(time.RFC3339), "source": "save", "problem": problem, "inventory": rep, "char": m.charSheet(character)})
}

func (m *Manager) apiPickitFile(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var in struct {
			Path string `json:"path"`
			Text string `json:"text"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(&in); err != nil {
			http.Error(w, "bad JSON: "+err.Error(), 400)
			return
		}
		if err := m.writePickitFile(in.Path, in.Text); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		fmt.Fprint(w, "ok")
		return
	}
	text, err := m.readPickitFile(r.URL.Query().Get("path"))
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprint(w, text)
}
