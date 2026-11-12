package main

import (
	"d2qolbot/internal/spec"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (m *Manager) serveWeb() {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(m.page())
	})
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
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
		safe := m.cfg.SafeMode
		protect := m.protectLocked()
		gameExe := m.cfg.GameExe
		hostIP, wineBin := m.cfg.HostIP, m.cfg.Wine
		storage := m.storageLocked()
		saveOnStop, saveEvery, saveAvail := m.saveSettingsLocked()
		plugy := m.plugyReportLocked()
		autoTown := m.cfg.AutoTown == nil || *m.cfg.AutoTown
		gamble := m.cfg.Gamble == nil || *m.cfg.Gamble
		goal := m.goalNow()
		difficulty := m.difficultyNow()
		playing := !m.cfg.NotPlaying
		farmSel := m.farmSelection()
		reportTasks := m.reportTasks()
		reportProblems := m.cfg.ReportProblems == nil || *m.cfg.ReportProblems
		banter := m.cfg.Banter == nil || *m.cfg.Banter
		bubble := m.cfg.BanterBubble
		autoEquip := m.cfg.AutoEquip == nil || *m.cfg.AutoEquip
		autoStat := m.cfg.AutoStat == nil || *m.cfg.AutoStat
		autoSkill := m.cfg.AutoSkill == nil || *m.cfg.AutoSkill
		questClearAll := m.cfg.QuestClearAll == nil || *m.cfg.QuestClearAll
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
		json.NewEncoder(w).Encode(map[string]any{"demo": devDemo(), "cpu": cpuInfo, "mercWear": mercWear, "profiles": list, "events": m.recentEvents(60), "logs": logs, "player": player, "safeMode": safe, "protect": protect, "autoEquip": autoEquip, "autoStat": autoStat, "autoSkill": autoSkill, "questClearAll": questClearAll,
			"plugy": plugy, "autoTown": autoTown, "gamble": gamble, "goal": goal, "difficulty": difficulty, "playing": playing, "farmRuns": farmSel, "farmCatalog": m.farmCatalog(), "reportTasks": reportTasks, "reportProblems": reportProblems, "saveOnStop": saveOnStop, "autoSaveMinutes": saveEvery, "saveAvailable": saveAvail,
			"storage": storage, "banter": banter, "banterBubble": bubble,
			"hostIp": hostIP, "headless": m.headlessValue(), "wine": wineBin,
			"gameExe": gameExe, "gameOK": gameProblem == "", "gameProblem": gameProblem})
	})
	// GET /api/partyquests?names=a,b,c: the quests those bots' saved characters have done (Party analysis on the Bots tab).
	mux.HandleFunc("/api/partyquests", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(m.partyQuests(splitNames(r.URL.Query().Get("names"))))
	})
	// POST /api/player?name=<character> sets who you are playing ("" = auto-detect).
	mux.HandleFunc("/api/player", post(func(r *http.Request) error {
		name := r.URL.Query().Get("name")
		m.mu.Lock()
		found := name == ""
		for _, s := range m.states {
			if s.Character == name {
				found = true
				if s.Wanted {
					m.mu.Unlock()
					return fmt.Errorf("%s is running as a bot; stop it first", name)
				}
			}
		}
		if !found {
			m.mu.Unlock()
			return fmt.Errorf("unknown character %q", name)
		}
		m.cfg.Player = name
		m.mu.Unlock()
		if name == "" {
			m.logf(0, "", "leader: auto-detect (first player in the game who is not a bot)")
		} else {
			m.logf(0, "", "leader: bots will follow %s", name)
		}
		m.writeBotNames()
		return m.saveConfig()
	}))
	// POST /api/playing?on=1|0: are you playing (bots join your game) or not (the leader bot hosts)?
	mux.HandleFunc("/api/playing", post(func(r *http.Request) error {
		return m.setPlaying(r.URL.Query().Get("on") != "0")
	}))
	// POST /api/goal with {"goal": "Follow|Quest|Farm", "farm": ["Mephisto", ...]}.
	mux.HandleFunc("/api/goal", func(w http.ResponseWriter, r *http.Request) {
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
	})
	// POST /api/spec?profile=X&spec=Name forces a build for one character ("" = automatic).
	mux.HandleFunc("/api/spec", post(func(r *http.Request) error {
		return m.setProfileSpec(r.URL.Query().Get("profile"), r.URL.Query().Get("spec"))
	}))
	// POST /api/play with {"storage": {...}, "banter": bool, "banterBubble": bool}: how bots handle space and talk.
	mux.HandleFunc("/api/play", func(w http.ResponseWriter, r *http.Request) {
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
			Plugy          *bool         `json:"plugy"`
			AutoTown       *bool         `json:"autoTown"`
			Gamble         *bool         `json:"gamble"`
			ReportTasks    *bool         `json:"reportTasks"`
			ReportProblems *bool         `json:"reportProblems"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
			http.Error(w, "bad JSON: "+err.Error(), 400)
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
		if in.Storage != nil {
			m.cfg.Storage = in.Storage
		}
		if in.Banter != nil {
			m.cfg.Banter = in.Banter
		}
		if in.BanterBubble != nil {
			m.cfg.BanterBubble = *in.BanterBubble
		}
		m.mu.Unlock()
		m.logf(0, "", "inventory/stash/chat settings updated from the web page (apply to bots started from now on)")
		if err := m.saveConfig(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Write([]byte("ok"))
	})
	// POST /api/settings with {"hostIp": "...", "headless": bool, "wine": "..."}.
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
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
	})
	// POST /api/game with {"gameExe": "/path/to/Game.exe"} sets where Diablo II is. Nothing can be launched before this.
	mux.HandleFunc("/api/game", func(w http.ResponseWriter, r *http.Request) {
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
	})
	// POST /api/config with a JSON body {"protect": {...}, "autoEquip": bool, "autoStat": bool, "autoSkill": bool} edits the gear rules and the automation switches.
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var in struct {
			Protect       *spec.Protect  `json:"protect"`
			AutoEquip     *bool          `json:"autoEquip"`
			AutoStat      *bool          `json:"autoStat"`
			AutoSkill     *bool          `json:"autoSkill"`
			QuestClearAll *bool          `json:"questClearAll"`
			MercWear      *spec.MercWear `json:"mercWear"`
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
		if in.MercWear != nil {
			m.cfg.MercWear = in.MercWear
		}
		if in.QuestClearAll != nil {
			m.cfg.QuestClearAll = in.QuestClearAll
		}
		m.mu.Unlock()
		m.logf(0, "", "gear rules and automation switches updated from the web page (applies to bots started from now on)")
		if err := m.saveConfig(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Write([]byte("ok"))
	})
	// POST /api/safemode?on=1|0: bots started afterwards are prohibited from AutoEquip, AutoStat and AutoSkill and pick up only consumables and quest items.
	mux.HandleFunc("/api/safemode", post(func(r *http.Request) error {
		on := r.URL.Query().Get("on") == "1"
		m.mu.Lock()
		m.cfg.SafeMode = on
		m.mu.Unlock()
		m.logf(0, "", "safe mode %v: bots started from now on %s", on, map[bool]string{true: "not auto-equip, spend no stat or skill points, and pick up only consumables and quest items", false: "follow the Automation tab"}[on])
		return m.saveConfig()
	}))
	mux.HandleFunc("/api/rescan", post(func(r *http.Request) error {
		n := m.scanCharacters()
		gone := m.dropMissingCharacters()
		if n > 0 || len(gone) > 0 {
			m.saveConfig()
		}
		m.logf(0, "", "scanned %s: %d new character(s), %d removed (no save file any more)%s", m.saveDir(), n, len(gone), map[bool]string{true: ": " + strings.Join(gone, ", "), false: ""}[len(gone) > 0])
		return nil
	}))
	// POST /api/start?profile=X[&team=A,B]: team names the followers the leader will wait for before it starts its run.
	mux.HandleFunc("/api/start", post(func(r *http.Request) error {
		if t, ok := r.URL.Query()["team"]; ok {
			var names []string
			for _, n := range strings.Split(strings.Join(t, ","), ",") {
				if n = strings.TrimSpace(n); n != "" {
					names = append(names, n)
				}
			}
			m.mu.Lock()
			m.expectTeam = names
			m.mu.Unlock()
			m.writeBotNames()
		}
		return m.startProfile(r.URL.Query().Get("profile"))
	}))
	mux.HandleFunc("/api/stop", post(func(r *http.Request) error {
		n := r.URL.Query().Get("profile")
		m.mu.Lock()
		_, ok := m.states[n]
		m.mu.Unlock()
		if !ok {
			return fmt.Errorf("unknown profile %q", n)
		}
		if err := m.stopBlocked([]string{n}); err != nil {
			return err
		}
		m.stopMany([]string{n})
		return nil
	}))
	// POST /api/stopmany?names=a,b,c: Stop selected. The leader is stopped last, after the others have saved and left.
	mux.HandleFunc("/api/stopmany", post(func(r *http.Request) error {
		var names []string
		m.mu.Lock()
		for _, n := range strings.Split(r.URL.Query().Get("names"), ",") {
			if _, ok := m.states[n]; ok {
				names = append(names, n)
			}
		}
		m.mu.Unlock()
		if len(names) == 0 {
			return fmt.Errorf("no such profiles")
		}
		if err := m.stopBlocked(names); err != nil {
			return err
		}
		m.stopMany(names)
		m.logf(0, "", "stop selected: %d bot(s) stopping, the leader last", len(names))
		return nil
	}))
	mux.HandleFunc("/api/stopall", post(func(r *http.Request) error {
		m.mu.Lock()
		var names []string
		for n, st := range m.states {
			if st.Status == "running" || st.Status == "starting" {
				names = append(names, n)
			}
		}
		m.mu.Unlock()
		sort.Strings(names)
		m.stopMany(names)
		m.logf(0, "", "stop all: %d bot(s) stopping, the leader last", len(names))
		return nil
	}))
	mux.HandleFunc("/api/clearlogs", post(func(r *http.Request) error {
		m.clearLogs()
		return nil
	}))
	// The Pickit tab: GET /api/pickit lists every .nip file and where it is used; POST saves the selection
	// ({"follow": [...], "lead": [...]}). /api/pickitfile?path=QOL/Misc.nip reads a list, POST {"path","text"} saves it.
	mux.HandleFunc("/api/pickit", func(w http.ResponseWriter, r *http.Request) {
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
	})
	// GET /api/inventory?name=Meir: what the bot carries, as last reported from the game (the JSON is passed through as it came).
	mux.HandleFunc("/api/inventory", func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		s := m.states[r.URL.Query().Get("name")]
		var inv string
		var at time.Time
		if s != nil {
			inv, at = s.Inv, s.InvAt
		}
		m.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if inv == "" || !json.Valid([]byte(inv)) {
			fmt.Fprint(w, `{"known":false}`)
			return
		}
		fmt.Fprintf(w, `{"known":true,"at":%q,"inventory":%s}`, at.Format(time.RFC3339), inv)
	})
	mux.HandleFunc("/api/pickitfile", func(w http.ResponseWriter, r *http.Request) {
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
	})
	mux.HandleFunc("/botlog", func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		m.mu.Lock()
		_, ok := m.states[name]
		m.mu.Unlock()
		if !ok {
			http.Error(w, "unknown bot", 404)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		http.ServeFile(w, r, m.botLogPath(name))
	})
	mux.HandleFunc("/log", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		http.ServeFile(w, r, filepath.Join(m.root, "logs", "qolbot.log"))
	})
	// Bind to loopback by default: this UI can launch processes.
	log.Fatal(http.ListenAndServe(m.cfg.Web, m.logRequests(mux)))
}

// post wraps an action: POST only, an error becomes a 400 with the message.
func post(f func(*http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		if err := f(r); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		fmt.Fprint(w, "ok")
	}
}

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (r *statusRecorder) WriteHeader(c int) { r.code = c; r.ResponseWriter.WriteHeader(c) }

// logRequests records every action (POST) and every failure; the 2s state
// polling is left out. It also keeps a handler panic from killing the manager.
func (m *Manager) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, code: 200}
		defer func() {
			if e := recover(); e != nil {
				m.logf(9, "", "web: panic handling %s %s: %v", r.Method, r.URL.Path, e)
				http.Error(rec, "internal error", 500)
			}
			if r.Method != http.MethodGet || rec.code >= 400 {
				m.dbgf("", "web: %s %s?%s -> %d (from %s)", r.Method, r.URL.Path, r.URL.RawQuery, rec.code, r.RemoteAddr)
			}
		}()
		next.ServeHTTP(rec, r)
	})
}

//go:embed web/index.html
var indexHTML string

// page serves the web page. Normally it is the copy built into the program. With QOLBOT_DEV=1 in the environment it is
// read from cmd/qolbot/web/index.html on every request instead, so edits show up on a browser reload without
// rebuilding or restarting (the API behind it is the running program's).
func (m *Manager) page() []byte {
	if os.Getenv("QOLBOT_DEV") != "" {
		if b, err := os.ReadFile(filepath.Join(m.root, "cmd", "qolbot", "web", "index.html")); err == nil {
			return b
		}
	}
	return []byte(indexHTML)
}
