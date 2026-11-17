package main

import (
	"d2qolbot/internal/wire"
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
	if strings.Contains(text, "task dropped (back in town from a trip)") { // a follower abandoning its field task on purpose (Follower.js dropError), not a problem
		return false
	}
	return reProblem.MatchString(text)
}

// scriptStarted returns the script name from "Starting script: X".
// isErrorBox: D2BS prints this when Game.exe puts up an error dialog (the cause is not known; the dialog blocks the game for good).
func isErrorBox(text string) bool {
	return strings.Contains(text, `Error message box, caption: "Diablo II Error"`)
}

func scriptStarted(text string) string {
	if m := reScriptName.FindStringSubmatch(text); m != nil {
		return m[1]
	}
	return ""
}

// ActivityEvent is one entry of the Status tab's Activity list: an item picked up, a boss killed or a quest completed.
type ActivityEvent struct {
	Time     time.Time `json:"time"`
	Bot      string    `json:"bot"`
	Kind     string    `json:"kind"` // item, kill, quest
	Name     string    `json:"name"`
	Detail   string    `json:"detail,omitempty"`
	Key      string    `json:"-"`               // what the event is about (a monster's id): the same key within two minutes is shown once, however many bots saw it
	Count    int       `json:"count,omitempty"` // skill points: how many were spent in one go (a reset character spends dozens in a row)
	skills   []string  // the distinct skills of a merged Auto Skill entry, in order
	Zone     string    `json:"zone,omitempty"` // where the bot was when it picked the item up or put gear on
	Ilvl     int       `json:"ilvl,omitempty"`
	Quality  string    `json:"quality,omitempty"`  // items: unique, set, rare, magic, crafted, rune, potion, normal
	Title    string    `json:"title,omitempty"`    // the item's full name as the bot saw it, when its details were reported
	Verified string    `json:"verified,omitempty"` // a quest entry checked against the character file after the bot saved: "saved" (the file says complete) or "notsaved" (it does not)
	Desc     string    `json:"desc,omitempty"`     // the item's stat text (colour codes included); empty if it was never reported (not identified, or not logged)
	borrowed bool      // Desc was copied from an earlier entry of the item: the bot's own report of it, when it comes, replaces it
	hidden   bool      // kept for its stats, not shown: a pickup (the user, 2026-11-14: "maybe don't show pickups, only show stashed or auto equip or sale")
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
		// "Stashed Cap [keeper: unique]": why the bot keeps it (Item.stashWhy in Misc.js), shown on the Activity card instead of the bare word (the user, 2026-11-16:
		// "the activity's don't include any rationale for why this was kept, and previously these alerts did")
		if mm := reStashWhy.FindStringSubmatch(it.Name); mm != nil {
			it.Name, it.Detail = strings.TrimSpace(mm[1]), "Stashed \u00b7 "+mm[2]
		}
	}
	return it, ok
}

var reStashWhy = regexp.MustCompile(`^(.*?)\s*\[([^\]]+)\]$`) // "Cap [keeper: unique]": the name and the reason (Item.stashWhy)

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
			m.update(name, func(s *State) { s.OutputAt = time.Now() })
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
			if strings.HasPrefix(text, "SAY: ") {
				m.addChat(name, strings.TrimPrefix(text, "SAY: "))
			}
			switch {
			case strings.HasPrefix(text, "Waypoints: Syncing the team's waypoints"):
				m.update(name, func(s *State) { s.Phase = "waypoint hunt" })
			case strings.HasPrefix(text, "Cube hunt: I have no"):
				m.update(name, func(s *State) { s.Phase = "cube hunt" })
			case strings.HasPrefix(text, "Cube hunt:"): // finished, or failed
				m.update(name, func(s *State) { s.Phase = "" })
			case strings.HasPrefix(text, "Waypoints: Waypoints synced"), strings.HasPrefix(text, "Waypoints: all in sync"), strings.HasPrefix(text, "Starting script"), strings.HasPrefix(text, "Run duration"):
				m.update(name, func(s *State) { s.Phase = "" })
			}
			if kind, title, msg, isNotice := noticeFromLog(name, text); isNotice {
				m.raiseNotice(kind, name, title, msg)
			}
			if title, msg, isFull := packFullFromLog(name, text); isFull {
				m.raiseFatal("packfull", name, title, msg) // the red box only: nobody is stopped (the pack is the bot's own to clear, the team can go on)
			}
			if kind, title, msg, isFatal := fatalFromLog(name, text); isFatal {
				if m.raiseFatal(kind, name, title, msg) {
					go m.stopForNotReady()
				}
			}
			ev, ok := parseEvent(rawD2BSText(l)) // the raw line first: an item's colour says what quality it is
			if !ok {
				ev, ok = parseEvent(text)
			}
			if ok {
				ev.Time, ev.Bot = time.Now(), name
				m.addEvent(ev)
				if ev.Kind == "quest" {
					go m.verifyQuest(name, ev)
				}
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
			if q, ok := questLine(text); ok {
				m.update(name, func(s *State) { s.Quest = q })
			}
			if strings.HasPrefix(text, "Run duration") {
				m.huntPayClose(name)
			}
			if sc := scriptStarted(text); sc != "" {
				m.huntPayStart(name, sc)
				m.update(name, func(s *State) { s.Doing, s.Quest = sc, "" })
			}
			if isErrorBox(text) { // the game shows a modal "Diablo II Error" and the bot sits frozen behind it: restart it
				// One restart per game PROCESS (pid), not per minute: Xena's restarted game showed a second box 30 s after the first and, with a per-minute limit, was
				// ignored and sat frozen behind it (2026-11-13 21:18). The lines of one box still restart it only once.
				ebKey := fmt.Sprintf("%s%derrorbox", name, pid)
				if t, ok := seen[ebKey]; !ok || time.Since(t) > time.Minute {
					seen[ebKey] = time.Now()
					m.logf(9, name, "the game showed a \"Diablo II Error\" box and cannot go on: restarting the bot")
					m.addEvent(ActivityEvent{Time: time.Now(), Bot: name, Kind: "restart", Name: "Game error", Detail: "restarting"})
					m.update(name, func(s *State) { s.Restarts++ })
					m.sendBridge(wire.Msg{T: "kill", Profile: name}) // onExit restarts (Wanted stays true)
				}
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
	// item.name has a space where a magic item has no prefix or suffix (" Splint Mail of Thorns", "Unearthly Fuscina "): the card showed it, and a
	// trailing space kept the entry from matching its own report (no stats)
	it.Name = strings.TrimSpace(it.Name)
	m.mu.Lock()
	if it.Kind == "grail" && it.Key != "" { // a Grail item is news once (the user, 2026-11-14), however long ago it was shown and whoever reports it
		if m.grailSeen == nil {
			m.grailSeen = map[string]bool{}
		}
		if m.grailSeen[it.Key] {
			m.mu.Unlock()
			return
		}
		m.grailSeen[it.Key] = true
	}
	if it.Key != "" { // several bots report the same kill or drop: show it once
		for i := len(m.events) - 1; i >= 0 && i >= len(m.events)-80; i-- {
			if m.events[i].Key == it.Key && time.Since(m.events[i].Time) < 2*time.Minute {
				m.mu.Unlock()
				return
			}
		}
	}
	// The same boss name in the same place within 30 seconds is one kill: the leader's script prints no id, and a boss's minions carry its name with ids of
	// their own (live 18:10, "Mind Maw the Slasher" twice per pack from each follower)
	if it.Kind == "kill" {
		for i := len(m.events) - 1; i >= 0 && i >= len(m.events)-80; i-- {
			if e := m.events[i]; e.Kind == "kill" && e.Name == it.Name && e.Detail == it.Detail && time.Since(e.Time) < 30*time.Second {
				m.mu.Unlock()
				return
			}
		}
	}
	if it.Kind == "quest" || it.Kind == "questitem" { // the script logs it and, with chat on, says it too: one entry
		for i := len(m.events) - 1; i >= 0 && i >= len(m.events)-80; i-- {
			if e := m.events[i]; e.Kind == it.Kind && e.Bot == it.Bot && e.Name == it.Name && e.Detail == it.Detail && time.Since(e.Time) < 30*time.Second {
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
	if p, ok := m.takePending(it.Bot, it.Kind, it.Name); ok {
		it.Title, it.Desc = p.title, p.desc
	}
	// A "Stashed" line has only the name: the stats are those of the same bot's latest entry of that item (the user, 2026-11-14: "a ring showed as picked
	// up "keeper" and displayed its full stats. but the later "stashed" log does not show its stats").
	if it.Kind == "stash" && it.Desc == "" { // only until the bot's own "Stashed" report comes (Pack.stashed sends it first, so normally it is here already)
		copyItemDesc(&it, m.events)
		it.borrowed = it.Desc != ""
	}
	// Gear put on without its own report (a merc's, or an item already kept): the stats of the same bot's latest entry of it
	// (a sale's own report comes just before its "Sold" line: the pending one, below; the borrowed stats are only what it has without one)
	if (it.Kind == "equip" || it.Kind == "sale") && it.Desc == "" {
		copyItemDesc(&it, m.events) // no report of its own waiting (takePending above found none)
		it.borrowed = it.Desc != ""
	}
	if it.Kind == "item" { // a pickup: what happens to the item next (stashed, worn, sold) is the entry; this one only lends it the stats
		it.hidden = true
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
		if !m.events[i].hidden {
			out = append(out, m.events[i])
		}
	}
	return out
}

type pendingDesc struct {
	title, desc string
	at          time.Time
}

// itemActions are the item log titles that go with an Activity entry ("Kept Sash", "Equipped Sash").
var itemActions = []string{"Field Kept", "Runeword Kept", "Cubing Kept", "Cubed", "Merc Equipped", "Equipped", "Kept", "Gambled", "Shopped", "Sold", "Stashed"}

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
		if e.Bot == bot && (e.Desc == "" || e.borrowed) && descFits(o.Title, e.Kind) && time.Since(e.Time) < 20*time.Second && strings.Contains(strings.ToLower(o.Title), strings.ToLower(e.Name)) {
			e.Title, e.Desc, e.borrowed = o.Title, o.Description, false
			return
		}
	}
	// A charm, jewel or rare is picked up UNIDENTIFIED (its text has no stats) and identified in town minutes later, when the "Kept ..." line arrives
	// with the stats (2026-11-13: a Large Charm's Activity entry said "stats unknown"). The fuller text goes to that bot's most recent entry of the
	// same item within the last hour, when it is longer than what the entry has.
	if strings.HasPrefix(o.Title, "Kept ") {
		for i := len(m.events) - 1; i >= 0 && i > len(m.events)-200; i-- {
			e := &m.events[i]
			if e.Bot == bot && (e.Kind == "item" || e.Kind == "equip" || e.Kind == "stash") && time.Since(e.Time) < time.Hour && strings.Contains(strings.ToLower(o.Title), strings.ToLower(e.Name)) {
				if len(o.Description) > len(e.Desc) {
					e.Title, e.Desc = o.Title, o.Description
				}
				if e.Kind != "stash" { // the stash entry after it (if any) took the old text: give it the new one too, then stop at the pickup
					return
				}
			}
		}
	}
	if m.pendingDesc == nil {
		m.pendingDesc = map[string][]pendingDesc{}
	}
	// several reports can wait at once: a bot selling two items sends the second report before Qolbot has read the first "Sold" line (live 18:56,
	// Sankt: the Razor Bow's report was replaced by the Claymore's, and the Razor Bow card had no stats)
	var keep []pendingDesc
	for _, p := range m.pendingDesc[bot] {
		if time.Since(p.at) < 20*time.Second {
			keep = append(keep, p)
		}
	}
	if len(keep) >= 8 {
		keep = keep[len(keep)-7:]
	}
	m.pendingDesc[bot] = append(keep, pendingDesc{o.Title, o.Description, time.Now()})
}

// takePending removes and returns the oldest waiting report of this bot that fits an entry of this kind and item name (m.mu is held).
func (m *Manager) takePending(bot, kind, name string) (pendingDesc, bool) {
	list := m.pendingDesc[bot]
	for i, p := range list {
		if descFits(p.title, kind) && time.Since(p.at) < 20*time.Second && strings.Contains(strings.ToLower(p.title), strings.ToLower(name)) {
			m.pendingDesc[bot] = append(list[:i:i], list[i+1:]...)
			return p, true
		}
	}
	return pendingDesc{}, false
}

// descFits: an item report's title goes with an entry of this kind: "Sold ..." with a sale only, "Stashed ..." with a stash only, the others (kept, equipped) with a pickup or an equip
func descFits(title, kind string) bool {
	if strings.HasPrefix(title, "Sold ") {
		return kind == "sale"
	}
	if strings.HasPrefix(title, "Stashed ") {
		return kind == "stash"
	}
	if strings.HasPrefix(title, "Cubed ") { // what the Horadric Cube made (Cubing.doCubing): its "Cube: X" entry shows these stats when clicked
		return kind == "cube"
	}
	return kind == "item" || kind == "equip"
}

// copyItemDesc gives an entry without stats the title, stats and quality of the same bot's most recent entry of the same item (by name) that has them,
// from the last few hours.
func copyItemDesc(it *ActivityEvent, events []ActivityEvent) {
	for i := len(events) - 1; i >= 0; i-- {
		e := events[i]
		if e.Bot != it.Bot || time.Since(e.Time) > 6*time.Hour {
			continue
		}
		if e.Desc != "" && (e.Kind == "item" || e.Kind == "equip" || e.Kind == "stash") && (strings.EqualFold(e.Name, it.Name) || strings.Contains(strings.ToLower(e.Title), strings.ToLower(it.Name))) {
			it.Title, it.Desc = e.Title, e.Desc
			if it.Quality == "" || it.Quality == "normal" {
				it.Quality = e.Quality
			}
			if it.Ilvl == 0 {
				it.Ilvl = e.Ilvl
			}
			return
		}
	}
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

// ChatLine is something a bot said in the game's chat (a quote, a report, a call for a portal): the Activity tab shows the latest ones in its chat box.
type ChatLine struct {
	Time time.Time `json:"time"`
	Bot  string    `json:"bot"`
	Text string    `json:"text"`
}

// addChat records a line of game chat. Slash commands (/save) are not speech, and a leading "!" only makes the game show the line in a bubble.
func (m *Manager) addChat(bot, text string) {
	text = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(text), "!"))
	// game and mod commands are not speech (the user, 2026-11-15: "hide any chat that starts with / or ."): "/save", Quartermaster's ".deposit",
	// PlugY's ".reset skills"; nor are the bots' hold/go signals
	if text == "" || strings.HasPrefix(text, "/") || strings.HasPrefix(text, ".") || text == "hold" || text == "go" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := len(m.chat) - 1; i >= 0 && i >= len(m.chat)-6; i-- {
		if m.chat[i].Bot == bot && m.chat[i].Text == text && time.Since(m.chat[i].Time) < 3*time.Second {
			return // the same words twice in a row
		}
	}
	m.chat = append(m.chat, ChatLine{Time: time.Now(), Bot: bot, Text: text})
	if len(m.chat) > 60 {
		m.chat = m.chat[len(m.chat)-40:]
	}
}

// recentChat is the newest n lines of chat, oldest first.
func (m *Manager) recentChat(n int) []ChatLine {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.chat) > n {
		return append([]ChatLine{}, m.chat[len(m.chat)-n:]...)
	}
	return append([]ChatLine{}, m.chat...)
}
