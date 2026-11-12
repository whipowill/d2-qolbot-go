package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Nobody watches the bots' screens, so everything a bot prints is kept per bot, and what looks like a problem is raised in
// the console. d2bs/d2bs.log (one file, every game process mixed together, lines tagged "D2BS <pid>:") is followed live:
//   - every line of a running bot goes to logs/bot-<profile>.log (the "log" link next to the bot on the Bots tab),
//   - "Starting script: X" tells the Bots tab what the bot is doing,
//   - lines that report an error are written to the console as warnings, once a minute at most per message.

var (
	reD2BSLine    = regexp.MustCompile(`^\[([^\]]*)\] D2BS (\d+): (.*)$`)
	reScriptName  = regexp.MustCompile(`Starting script: (\S+)`)
	reConfigProbe = regexp.MustCompile(`^\w+\.\w+\.js not found!$`)
	reCount       = regexp.MustCompile(`\(\d+/\d+\)$`)
	reIlvl        = regexp.MustCompile(`^(.*?) \(ilvl (\d+)\)(?: \((.+)\))?`)
	reProblem     = regexp.MustCompile(`(?i)(\berror in \S|^error:|\bERROR:|exception|failed to include|invalid script|unhandled|not found!|cannot (?:read|load|include|find))`)
)

// parseD2BSLine splits a d2bs.log line into the process id and the text (colour codes removed).
func parseD2BSLine(line string) (pid uint32, text string, ok bool) {
	m := reD2BSLine.FindStringSubmatch(strings.TrimRight(strings.ReplaceAll(line, "\x00", ""), "\r\n"))
	if m == nil {
		return 0, "", false
	}
	n, err := strconv.Atoi(m[2])
	if err != nil {
		return 0, "", false
	}
	return uint32(n), strings.TrimSpace(stripColors(m[3])), true
}

// rawD2BSText is the text of a D2BS log line with its colour codes still in it. Item pickups need them: the colour is the item's quality.
func rawD2BSText(line string) string {
	m := reD2BSLine.FindStringSubmatch(strings.TrimRight(strings.ReplaceAll(line, "\x00", ""), "\r\n"))
	if m == nil {
		return ""
	}
	return strings.TrimSpace(m[3])
}

// isProblemLine reports whether a bot's output line says something went wrong.
func isProblemLine(text string) bool {
	if reConfigProbe.MatchString(text) { // Kolbot looks for <Class>.<Profile>.js first and falls back to <Class>.js: not a problem
		return false
	}
	if strings.Contains(text, "Strict Warning") { // D2BS's own style warnings: noisy and harmless, kept in the file only
		return false
	}
	return reProblem.MatchString(text)
}

// scriptStarted returns the script name from "Starting script: X".
func scriptStarted(text string) string {
	if m := reScriptName.FindStringSubmatch(text); m != nil {
		return m[1]
	}
	return ""
}

// ActivityEvent is one entry of the Status tab's Activity list: an item picked up, a boss killed or a quest completed.
type ActivityEvent struct {
	Time    time.Time `json:"time"`
	Bot     string    `json:"bot"`
	Kind    string    `json:"kind"` // item, kill, quest
	Name    string    `json:"name"`
	Detail  string    `json:"detail,omitempty"`
	Key     string    `json:"-"`               // what the event is about (a monster's id): the same key within two minutes is shown once, however many bots saw it
	Count   int       `json:"count,omitempty"` // skill points: how many were spent in one go (a reset character spends dozens in a row)
	skills  []string  // the distinct skills of a merged Auto Skill entry, in order
	Zone    string    `json:"zone,omitempty"` // where the bot was when it picked the item up or put gear on
	Ilvl    int       `json:"ilvl,omitempty"`
	Quality string    `json:"quality,omitempty"` // items: unique, set, rare, magic, crafted, rune, potion, normal
	Title   string    `json:"title,omitempty"`   // the item's full name as the bot saw it, when its details were reported
	Desc    string    `json:"desc,omitempty"`    // the item's stat text (colour codes included); empty if it was never reported (not identified, or not logged)
}

// parsePicked reads the pickit's "Picked up <colour><name> (ilvl N)" line. Gold, keys and scrolls (counts like "(3/12)") are not items
// worth showing. It returns the item as an event.
func parsePicked(text string) (ActivityEvent, bool) { return parseItemLine(text, "Picked up ", "item") }

// parseStashed reads "Stashed <item>": a bot put an item in its stash (the town chores, or clearing the pickup area when it joins).
func parseStashed(text string) (ActivityEvent, bool) {
	if !strings.HasPrefix(stripColors(text), "Stashed ") {
		return ActivityEvent{}, false
	}
	it, ok := parseItemLine(text, "Stashed ", "stash")
	if ok {
		it.Detail = "Stashed"
	}
	return it, ok
}

func parseItemLine(text, marker, kind string) (ActivityEvent, bool) {
	i := strings.Index(text, marker)
	if i < 0 {
		return ActivityEvent{}, false
	}
	rest := text[i+len(marker):]
	var col byte
	for _, p := range []string{"\xef\xbf\xbd", "\xff", "\xc3\xbf"} { // the colour marker comes through as U+FFFD, a raw 0xFF byte or "ÿ"
		if strings.HasPrefix(rest, p+"c") && len(rest) > len(p)+1 {
			col = rest[len(p)+1]
			break
		}
	}
	clean := strings.TrimSpace(stripColors(rest))
	if clean == "" || (clean[0] >= '0' && clean[0] <= '9') || reCount.MatchString(clean) {
		return ActivityEvent{}, false
	}
	it := ActivityEvent{Kind: kind, Name: clean, Quality: "normal"}
	if mm := reIlvl.FindStringSubmatch(clean); mm != nil {
		it.Name = mm[1]
		it.Ilvl, _ = strconv.Atoi(mm[2])
		it.Detail = mm[3] // the pickit line that wanted it, if any
	}
	switch col {
	case '3':
		it.Quality = "magic"
	case '2':
		it.Quality = "set"
	case '9':
		it.Quality = "rare"
	case '4':
		it.Quality = "unique"
	case '8':
		it.Quality = "crafted"
		if strings.HasSuffix(it.Name, " Rune") {
			it.Quality = "rune"
		}
	case '1', ';':
		it.Quality = "potion"
	}
	return it, true
}

// quietLine reports lines that say nothing about what a bot is doing (they never become its "last activity").
func quietLine(text string) bool {
	return strings.Contains(text, "Strict Warning") || strings.HasPrefix(text, "Loaded NIP") || strings.HasPrefix(text, "Game:")
}

func (m *Manager) botLogPath(profile string) string {
	return filepath.Join(m.root, "logs", "bot-"+filepath.Base(profile)+".log")
}

// followBotLogs tails d2bs/d2bs.log for as long as the program runs.
func (m *Manager) followBotLogs() {
	path := filepath.Join(m.root, "d2bs", "d2bs.log")
	var offset int64
	if fi, err := os.Stat(path); err == nil {
		offset = fi.Size() // start with what is written from now on
	}
	var carry string
	files := map[string]*os.File{}
	seen := map[string]time.Time{} // problem text -> last raised
	for range time.Tick(time.Second) {
		fi, err := os.Stat(path)
		if err != nil {
			continue
		}
		if fi.Size() < offset { // the log was cleared or rotated
			offset, carry = 0, ""
		}
		if fi.Size() == offset {
			continue
		}
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		f.Seek(offset, io.SeekStart)
		buf, _ := io.ReadAll(io.LimitReader(f, 4<<20))
		f.Close()
		offset += int64(len(buf))
		lines := strings.Split(carry+string(buf), "\n")
		carry = lines[len(lines)-1]
		lines = lines[:len(lines)-1]

		m.mu.Lock()
		byPid := map[uint32]string{}
		for n, s := range m.states {
			if s.Pid != 0 {
				byPid[s.Pid] = n
			}
		}
		m.mu.Unlock()
		for _, l := range lines {
			pid, text, ok := parseD2BSLine(l)
			if !ok || text == "" {
				continue
			}
			name := byPid[pid]
			if name == "" {
				continue
			}
			fh := files[name]
			if fh == nil {
				os.MkdirAll(filepath.Join(m.root, "logs"), 0o755)
				if st, err := os.Stat(m.botLogPath(name)); err == nil && st.Size() > maxLogSize {
					os.Rename(m.botLogPath(name), m.botLogPath(name)+".1")
				}
				fh, _ = os.OpenFile(m.botLogPath(name), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o660)
				files[name] = fh
			}
			if fh != nil {
				fmt.Fprintf(fh, "%s %s\n", time.Now().Format("2006-01-02 15:04:05"), text)
			}
			ev, ok := parseEvent(rawD2BSText(l)) // the raw line first: an item's colour says what quality it is
			if !ok {
				ev, ok = parseEvent(text)
			}
			if ok {
				ev.Time, ev.Bot = time.Now(), name
				m.addEvent(ev)
				if ev.Kind == "level" {
					m.noteLevel(name, ev.Name)
				}
			}
			if act, ok := friendlyActivity(text); ok {
				m.update(name, func(s *State) {
					if !staleStatus(act, s.Zone) { // e.g. "Waiting for a portal" arriving after the bot already walked out
						s.Activity, s.ActivityAt = act, time.Now()
					}
				})
			}
			if sc := scriptStarted(text); sc != "" {
				m.update(name, func(s *State) { s.Doing = sc })
			}
			if isProblemLine(text) {
				if t, ok := seen[name+text]; !ok || time.Since(t) > time.Minute {
					seen[name+text] = time.Now()
					m.logf(9, name, "script problem: %s", text)
					m.addEvent(ActivityEvent{Time: time.Now(), Bot: name, Kind: "problem", Name: shorten(text, 140)})
				}
			}
		}
		if len(seen) > 500 {
			seen = map[string]time.Time{}
		}
	}
}

// addEvent keeps the newest events in memory (they are gone after a restart: the bots' own logs keep the full history).
func (m *Manager) addEvent(it ActivityEvent) {
	m.mu.Lock()
	if it.Key != "" { // several bots report the same kill or drop: show it once
		for i := len(m.events) - 1; i >= 0 && i >= len(m.events)-80; i-- {
			if m.events[i].Key == it.Key && time.Since(m.events[i].Time) < 2*time.Minute {
				m.mu.Unlock()
				return
			}
		}
	}
	if it.Kind == "kill" { // the leader's script prints no id: the same boss in the same place within 30 seconds is the same kill
		for i := len(m.events) - 1; i >= 0 && i >= len(m.events)-80; i-- {
			if e := m.events[i]; e.Kind == "kill" && e.Name == it.Name && e.Detail == it.Detail && (e.Key == "" || it.Key == "") && time.Since(e.Time) < 30*time.Second {
				m.mu.Unlock()
				return
			}
		}
	}
	if it.Kind == "skill" { // a run of skill points from one bot is one entry: "Telekinesis, Teleport, Fire Ball and 6 more · 12 points"
		for i := len(m.events) - 1; i >= 0 && i >= len(m.events)-80; i-- {
			if e := &m.events[i]; e.Kind == "skill" && e.Bot == it.Bot {
				if time.Since(e.Time) < time.Minute {
					if e.Count == 0 {
						e.Count, e.skills = 1, []string{e.Name}
					}
					e.Count++
					e.Time = it.Time
					seen := false
					for _, n := range e.skills {
						seen = seen || n == it.Name
					}
					if !seen {
						e.skills = append(e.skills, it.Name)
					}
					e.Name = skillList(e.skills)
					m.mu.Unlock()
					return
				}
				break
			}
		}
	}
	if st := m.states[it.Bot]; st != nil && it.Detail == "" && (it.Kind == "heal" || it.Kind == "gamble") { // where it happened: the town the bot is in
		it.Detail = st.Zone
	}
	if st := m.states[it.Bot]; st != nil && it.Zone == "" && (it.Kind == "item" || it.Kind == "equip" || it.Kind == "stash") { // where the item was picked up or stashed / the gear put on
		it.Zone = st.Zone
	}
	if p, ok := m.pendingDesc[it.Bot]; ok && (it.Kind == "item" || it.Kind == "equip") && time.Since(p.at) < 20*time.Second && strings.Contains(strings.ToLower(p.title), strings.ToLower(it.Name)) {
		it.Title, it.Desc = p.title, p.desc
		delete(m.pendingDesc, it.Bot)
	}
	m.events = append(m.events, it)
	if len(m.events) > 200 {
		m.events = m.events[len(m.events)-200:]
	}
	m.mu.Unlock()
}

// recentEvents returns the newest events, newest first.
func (m *Manager) recentEvents(n int) []ActivityEvent {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []ActivityEvent
	for i := len(m.events) - 1; i >= 0 && len(out) < n; i-- {
		out = append(out, m.events[i])
	}
	return out
}

type pendingDesc struct {
	title, desc string
	at          time.Time
}

// itemActions are the item log titles that go with an Activity entry ("Kept Sash", "Equipped Sash").
var itemActions = []string{"Field Kept", "Runeword Kept", "Cubing Kept", "Merc Equipped", "Equipped", "Kept", "Gambled", "Shopped"}

// noteItemDesc takes the item log entry a bot sends right after it keeps or equips something (title, stat text, quality) and attaches it
// to that item's Activity entry. The entry comes from the bot's printed line a moment later (or came just before), so it is matched by bot,
// by time and by name.
func (m *Manager) noteItemDesc(bot, raw string) {
	var o struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if json.Unmarshal([]byte(raw), &o) != nil || o.Title == "" {
		return
	}
	ok := false
	for _, a := range itemActions {
		if strings.HasPrefix(o.Title, a+" ") {
			ok = true
			break
		}
	}
	if !ok {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := len(m.events) - 1; i >= 0 && i > len(m.events)-8; i-- {
		e := &m.events[i]
		if e.Bot == bot && e.Desc == "" && (e.Kind == "item" || e.Kind == "equip") && time.Since(e.Time) < 20*time.Second && strings.Contains(strings.ToLower(o.Title), strings.ToLower(e.Name)) {
			e.Title, e.Desc = o.Title, o.Description
			return
		}
	}
	if m.pendingDesc == nil {
		m.pendingDesc = map[string]pendingDesc{}
	}
	m.pendingDesc[bot] = pendingDesc{o.Title, o.Description, time.Now()}
}

// shorten cuts a log line to n characters for the Activity list.
func shorten(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= n {
		return string(r)
	}
	return string(r[:n-1]) + "…"
}

// skillList names up to three skills and counts the rest.
func skillList(n []string) string {
	if len(n) <= 3 {
		return strings.Join(n, ", ")
	}
	return fmt.Sprintf("%s and %d more", strings.Join(n[:3], ", "), len(n)-3)
}

// noteLevel puts a level-up on the bot's card at once. The card's level comes from the save file, which is only written every couple of
// minutes (and when the bot stops), so it would lag behind.
func (m *Manager) noteLevel(bot, level string) {
	n, err := strconv.Atoi(level)
	if err != nil {
		return
	}
	m.update(bot, func(s *State) {
		if s.Char != nil && n > s.Char.Level {
			c := *s.Char
			c.Level = n
			s.Char = &c
		}
	})
}
