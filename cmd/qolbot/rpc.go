package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"d2qolbot/internal/wire"
)

type LogLine struct {
	Time    time.Time `json:"time"`
	Profile string    `json:"profile"`
	Color   int       `json:"color"`
	Msg     string    `json:"msg"`
}

func (m *Manager) logf(color int, profile, f string, a ...any) {
	l := LogLine{time.Now(), profile, color, fmt.Sprintf(f, a...)}
	fmt.Printf("%s [%s] %s\n", l.Time.Format("15:04:05"), profile, l.Msg)
	m.mu.Lock()
	m.writeLogLocked(l, "")
	m.logs = append(m.logs, l)
	if len(m.logs) > 2000 {
		m.logs = m.logs[len(m.logs)-1000:]
	}
	for ch := range m.logSubs {
		select {
		case ch <- l:
		default:
		}
	}
	m.mu.Unlock()
}

// dbgf records a line in the log file only (not the console or web UI).
func (m *Manager) dbgf(profile, f string, a ...any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dbgfLocked(profile, f, a...)
}

func (m *Manager) dbgfLocked(profile, f string, a ...any) {
	m.writeLogLocked(LogLine{time.Now(), profile, 0, fmt.Sprintf(f, a...)}, "DEBUG")
}

// rpc is the JSON envelope kolbot's OOG.js sends in sendCopyData to the manager.
type rpc struct {
	Profile string   `json:"profile"`
	Func    string   `json:"func"`
	Args    []string `json:"args"`
}

func (m *Manager) reply(profile string, mode uint32, data string) {
	m.sendBridge(wire.Msg{T: "send", Profile: profile, Mode: mode, Data: data})
}

// noteStarterStatus records what the bot's starter script says ("Game: ...", "Join Game" ...). A bot that was in a game and is back at the menu
// while it should be running was disconnected (the host's game crashed or closed): that is an Activity entry, and the card says what it is
// doing now instead of keeping the last thing it did in the game. It returns true when it saw a disconnect.
func (m *Manager) noteStarterStatus(p, info string) bool {
	dc, zone, joined := false, "", false
	m.update(p, func(s *State) {
		was := strings.HasPrefix(s.Info, "Game:")
		now := strings.HasPrefix(info, "Game:")
		s.Info = info
		if now {
			s.GameAt = time.Now()
			joined = !was && s.Status == "running" // from the menu into a game
			return
		}
		if act := menuActivity(info); act != "" && s.Status == "running" {
			if was && s.Wanted {
				dc, zone = true, s.Zone
				act = "Disconnected"
			}
			s.Activity, s.ActivityAt = act, time.Now()
			s.Zone = "Menu"
		}
	})
	if joined {
		m.addEvent(ActivityEvent{Time: time.Now(), Bot: p, Kind: "connect", Name: "Connected"})
	}
	if dc {
		m.addEvent(ActivityEvent{Time: time.Now(), Bot: p, Kind: "disconnect", Name: "Disconnected", Zone: zone})
	}
	return dc
}

func (m *Manager) handleCopyData(msg wire.Msg) {
	var r rpc
	if err := json.Unmarshal([]byte(msg.Data), &r); err != nil || r.Func == "" {
		m.logf(0, "", "unparsed copydata mode=%d from=%d: %.200s", msg.Mode, msg.From, msg.Data)
		return
	}
	arg := func(i int) string {
		if i < len(r.Args) {
			return r.Args[i]
		}
		return ""
	}
	p := r.Profile
	m.update(p, func(s *State) { s.rpcSeen = true })
	switch r.Func {
	case "heartBeat", "setProfile":
		// heartbeats are too frequent to log; setProfile carries a password
	case "inventory":
		// a big JSON list of items: not worth a log line
	case "updateStatus":
		if !strings.HasPrefix(arg(0), "Game:") { // the in-game clock ticks every second: not worth a log line
			m.dbgf(p, "D2Bot.%s %.300v", r.Func, r.Args)
		}
	default:
		m.dbgf(p, "D2Bot.%s %.300v", r.Func, r.Args)
	}
	switch r.Func {
	case "heartBeat":
		m.update(p, func(s *State) { s.Heartbeat = time.Now() })
	case "inventory":
		if len(arg(0)) < 1<<20 { // a bot carries at most a few hundred items
			m.update(p, func(s *State) { s.Inv, s.InvAt = arg(0), time.Now() })
		}
	case "printToConsole":
		var o struct {
			Msg   string `json:"msg"`
			Color int    `json:"color"`
		}
		json.Unmarshal([]byte(arg(0)), &o)
		m.logf(o.Color, p, "%s", o.Msg)
	case "printToItemLog", "saveItem":
		m.appendFile("logs/items-"+p+".log", arg(0))
		if r.Func == "printToItemLog" {
			m.noteItemDesc(p, arg(0))
		}
	case "writeToFile":
		m.appendFile(filepath.Join("logs", filepath.Base(arg(0))), arg(1))
	case "updateStatus":
		if arg(0) == "Join Game" {
			m.watchJoin(p)
		}
		m.noteStarterStatus(p, arg(0))
	case "zone":
		m.update(p, func(s *State) {
			if s.Zone != "" && s.Zone != arg(0) { // what the bot was last reported doing belongs to the place it left
				s.Activity, s.ActivityAt = "Just arrived", time.Now()
			}
			s.Zone, s.ZoneAt = arg(0), time.Now()
			if d := arg(1); d != "" {
				s.Difficulty = d
			}
		})
	case "saved":
		m.markSaved(p)
	case "updateRuns":
		m.update(p, func(s *State) { s.Runs++ })
	case "updateChickens":
		zone := ""
		m.update(p, func(s *State) { s.Chickens++; zone = s.Zone })
		m.addEvent(ActivityEvent{Time: time.Now(), Bot: p, Kind: "chicken", Name: "Chickened", Detail: zone})
	case "updateDeaths":
		dzone := ""
		m.update(p, func(s *State) { s.Deaths++; dzone = s.Zone })
		m.addEvent(ActivityEvent{Time: time.Now(), Bot: p, Kind: "death", Name: "Died", Detail: dzone})
	case "setTag":
		m.update(p, func(s *State) { s.Tag = arg(0) })
	case "getProfile":
		m.mu.Lock()
		s := m.states[p]
		var tag string
		if s != nil {
			tag = s.Tag
		}
		m.mu.Unlock()
		b, _ := json.Marshal(map[string]any{"Tag": tag})
		m.reply(p, 1638, string(b))
	case "setProfile":
		// account/realm settings: not used when only joining TCP/IP games
	case "requestGameInfo":
		// The starter waits for this reply before it starts. Nothing in it matters
		// for joining a TCP/IP game (the host's address is typed in the game).
		b, _ := json.Marshal(map[string]any{"gameName": "", "gamePass": "", "mpq": "", "difficulty": m.difficultyNow(), "hostIp": m.cfg.HostIP})
		m.reply(p, 2, string(b))
	case "restartProfile":
		m.logf(0, p, "restart requested by script")
		m.stopProfileKeepWanted(p)
	case "start":
		m.startProfile(arg(0))
	case "stop":
		m.stopProfile(arg(0))
	case "updateCount", "store", "retrieve", "delete":
		// D2Bot# kept a per-profile crash-info cache here; kolbot also keeps its own
		// copy in data/<profile>.json, so there is nothing to do.
	case "winmsg":
		// UI-state pings D2Bot.exe used to track window state; not needed.
	case "CDKeyInUse", "CDKeyDisabled", "CDKeyRD":
		m.logf(6, p, "%s", r.Func)
	default:
		m.logf(0, p, "unhandled D2Bot call %q %.200v", r.Func, r.Args)
	}
}

func (m *Manager) stopProfileKeepWanted(name string) {
	m.sendBridge(wire.Msg{T: "kill", Profile: name}) // onExit restarts because Wanted stays true
}

func (m *Manager) appendFile(rel, text string) {
	path := filepath.Join(m.root, "d2bs", "kolbot", rel)
	os.MkdirAll(filepath.Dir(path), 0o755)
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintln(f, strings.TrimRight(text, "\r\n"))
}
