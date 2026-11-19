package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"d2qolbot/internal/wire"
)

func (m *Manager) serveWeb() {
	log.Fatal(http.ListenAndServe(m.cfg.Web, m.logRequests(m.webMux())))
}

// webMux holds every route of the web page and its API (separate from serveWeb so the tests can use it).
func (m *Manager) webMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(m.page())
	})
	mux.HandleFunc("/api/state", m.apiState)
	mux.HandleFunc("/api/music", m.apiMusic)     // the music button: the leader's zone's track, read from the game's archives into memory (music.go)
	mux.HandleFunc("/api/grail", m.apiGrail)     // the Grail tab (needs "Using Quartermaster?")
	mux.HandleFunc("/api/storage", m.apiStorage) // the Gems and Runes tabs (the same)
	// GET /api/partyquests?names=a,b,c: the quests those bots' saved characters have done (Party analysis on the Bots tab).
	mux.HandleFunc("/api/partyquests", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(m.partyQuests(splitNames(r.URL.Query().Get("names"))))
	})
	mux.HandleFunc("/api/restorepoints", m.apiRestorePoints)
	// POST /api/pickleader?names=a,b,c: who leads when nobody is playing, so nobody is asked: for Quest the bot furthest behind in the quests (and
	// the difficulty follows), for Farm the highest level. It becomes the leader (as if chosen in the list) and its name is returned.
	mux.HandleFunc("/api/pickleader", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		names := splitNames(r.URL.Query().Get("names"))
		m.mu.Lock()
		quest := m.cfg.Goal == "Quest"
		m.mu.Unlock()
		var best, why string
		if quest {
			m.setQuestDifficulty(m.questDifficulty(names))
			best, why = m.pickLeader(names)
		} else {
			best, why = m.pickFarmLeader(names)
		}
		if best == "" {
			http.Error(w, "cannot choose a leader: "+why, 400)
			return
		}
		m.mu.Lock()
		if s := m.states[best]; s != nil {
			m.cfg.Player = s.Character
		}
		m.mu.Unlock()
		m.logf(0, "", "quests: %s leads (%s), difficulty %s", best, why, m.difficultyNow())
		if quest {
			if msg := m.huntAtStart(names, best); msg != "" { // a broke team goes gold hunting BEFORE anything else (user: the gold hunt comes before the waypoint hunt)
				http.Error(w, msg, 400)
				return
			}
		}
		m.writeBotNames()
		m.saveConfig()
		json.NewEncoder(w).Encode(map[string]string{"leader": best, "why": why, "difficulty": m.difficultyNow()})
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
	mux.HandleFunc("/api/goal", m.apiGoal)
	// POST /api/spec?profile=X&spec=Name forces a build for one character ("" = automatic).
	mux.HandleFunc("/api/spec", post(func(r *http.Request) error {
		return m.setProfileSpec(r.URL.Query().Get("profile"), r.URL.Query().Get("spec"))
	}))
	mux.HandleFunc("/api/merc", post(func(r *http.Request) error {
		return m.setProfileMerc(r.URL.Query().Get("profile"), r.URL.Query().Get("merc"))
	}))
	mux.HandleFunc("/api/play", m.apiPlay)
	mux.HandleFunc("/api/settings", m.apiSettings)
	mux.HandleFunc("/api/game", m.apiGame)
	mux.HandleFunc("/api/config", m.apiConfig)
	// POST /api/safemode?on=1|0: bots started afterwards are prohibited from AutoEquip, AutoStat and AutoSkill.
	mux.HandleFunc("/api/safemode", post(func(r *http.Request) error {
		on := r.URL.Query().Get("on") == "1"
		m.mu.Lock()
		m.cfg.SafeMode = on
		m.mu.Unlock()
		m.logf(0, "", "safe mode %v: bots started from now on %s", on, map[bool]string{true: "not auto-equip, spend no stat or skill points", false: "follow the Automation tab"}[on])
		return m.saveConfig()
	}))
	mux.HandleFunc("/api/rescan", post(func(r *http.Request) error {
		m.auditReset() // look at the saves again on the next page load
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
		m.clearFatal() // starting a bot is the answer to a fatal event: the red box goes away
		return m.startProfile(r.URL.Query().Get("profile"))
	}))
	// POST /api/notice/clear: dismiss the yellow box at the top of the Activity page.
	mux.HandleFunc("/api/notice/clear", post(func(r *http.Request) error {
		m.clearNotice()
		return nil
	}))
	// POST /api/fatal/clear: dismiss the red box at the top of the Activity page.
	mux.HandleFunc("/api/fatal/clear", post(func(r *http.Request) error {
		m.clearFatal()
		return nil
	}))
	// POST /api/input?profile=X&data=key 84 | click 320 240 | respec X Y: testing aid, posts a key press or a click to that bot's game window through
	// the bridge (what the Save and Exit click uses). Used to measure where things sit on screen.
	mux.HandleFunc("/api/input", post(func(r *http.Request) error {
		p, d := r.URL.Query().Get("profile"), r.URL.Query().Get("data")
		if p == "" || d == "" {
			return fmt.Errorf("profile and data are needed")
		}
		m.sendBridge(wire.Msg{T: "input", Profile: p, Data: d})
		return nil
	}))
	// POST /api/say?profile=X&text=.storage: testing aid, the bot says that text in the game chat (say(), the way it sends PlugY's /save): used to see
	// what a mod's chat command does. The bot must run a default.dbj that knows "say:".
	mux.HandleFunc("/api/say", post(func(r *http.Request) error {
		p, t := r.URL.Query().Get("profile"), r.URL.Query().Get("text")
		if p == "" || t == "" {
			return fmt.Errorf("profile and text are needed")
		}
		m.sendBridge(wire.Msg{T: "send", Profile: p, Mode: 0, Data: "say:" + t})
		return nil
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
	// POST /api/levelhunt: start a level hunt now, as if the chicken limit had tripped (Quest mode, nobody playing, the team running). A hunt lives only in
	// memory, so after a restart of Qolbot this starts it again.
	mux.HandleFunc("/api/levelhunt", post(func(r *http.Request) error {
		if !m.beginLevelUp() {
			return fmt.Errorf("no level hunt: it needs Quest mode with nobody playing, the team running, and no level hunt already on")
		}
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
	mux.HandleFunc("/api/pickit", m.apiPickit)
	mux.HandleFunc("/api/inventory", m.apiInventory)
	mux.HandleFunc("/api/itempic", m.apiItemPicture)
	mux.HandleFunc("/font/", m.apiFont)
	mux.HandleFunc("/api/pickitfile", m.apiPickitFile)
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
	return mux
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
