package main

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// A bot that clicks Join but never gets into the game used to fail silently ("Unable to enter game" is only drawn on
// the game's screen). watchJoin waits a while after the join starts, and if the bot is still not in a game it logs a
// warning with whatever the game's own log (D2YYMMDD.txt in the game folder, read only) says about this character.

var (
	reHostLogName = regexp.MustCompile(`^D2\d{6}\.txt$`)
	reHostErrLine = regexp.MustCompile(`^(\d\d:\d\d:\d\d)\.\d+\s+\[PLAYER LOAD\]\s+(.*)$`)
)

const joinWatchAfter = 50 * time.Second

// hostLogErrors returns the "[PLAYER LOAD]" lines about character in the newest game log that are not older than since.
func hostLogErrors(dir, character string, since time.Time) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && reHostLogName.MatchString(e.Name()) {
			names = append(names, e.Name())
		}
	}
	if len(names) == 0 {
		return nil
	}
	sort.Strings(names)
	b, err := os.ReadFile(filepath.Join(dir, names[len(names)-1]))
	if err != nil {
		return nil
	}
	var out []string
	for _, line := range strings.Split(string(b), "\n") {
		m := reHostErrLine.FindStringSubmatch(strings.TrimRight(line, "\r"))
		if m == nil || !strings.Contains(m[2], character) {
			continue
		}
		t, err := time.ParseInLocation("15:04:05", m[1], since.Location())
		if err != nil {
			continue
		}
		t = time.Date(since.Year(), since.Month(), since.Day(), t.Hour(), t.Minute(), t.Second(), 0, since.Location())
		if !t.Before(since) {
			out = append(out, strings.TrimSpace(m[1]+" "+m[2]))
		}
	}
	if len(out) > 3 {
		out = out[len(out)-3:]
	}
	return out
}

// watchJoin is started when a bot reaches the Join Game screen; one watcher per bot at a time.
func (m *Manager) watchJoin(profile string) {
	m.mu.Lock()
	s := m.states[profile]
	if s == nil || s.joinWatching {
		m.mu.Unlock()
		return
	}
	s.joinWatching = true
	char := s.Character
	t0 := time.Now()
	dir := filepath.Dir(m.cfg.GameExe)
	m.mu.Unlock()
	go func() {
		time.Sleep(joinWatchAfter)
		m.mu.Lock()
		st := m.states[profile]
		if st == nil {
			m.mu.Unlock()
			return
		}
		st.joinWatching = false
		stuck := st.Status == "running" && !st.GameAt.After(t0)
		m.mu.Unlock()
		if !stuck {
			return
		}
		lines := hostLogErrors(dir, char, t0.Add(-5*time.Second))
		if len(lines) > 0 {
			m.logf(9, profile, "could not get into your game in %ds. The game's own log says: %s", int(joinWatchAfter.Seconds()), strings.Join(lines, " | "))
			m.logf(9, profile, "\"Error Loading\" means the host could not load %s's character data. Check that character in your own game (and her save in the Save folder); the bot keeps retrying.", char)
		} else {
			m.logf(9, profile, "could not get into your game in %ds (no error in the game's log). Is your TCP/IP game hosted, at %s, and not full? Is %s already in it or logged in elsewhere?", int(joinWatchAfter.Seconds()), m.cfg.HostIP, char)
		}
	}()
}
