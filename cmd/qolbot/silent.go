package main

import (
	"strings"
	"time"

	"d2qolbot/internal/wire"
)

// silentLimit is how long a bot that is in a game may print nothing before it is taken for hung. The scripts of a working bot print every few seconds (a
// follower "Waiting for leader" every ten); a bot whose scripts all ended while the game stayed open (found 2026-11-12: a leader whose scripts ended after a
// chicken, hosting an empty game that the followers could not join) prints nothing at all. A leader that has nothing left to do and waits is restarted too:
// that is the right thing, a new game starts from town.
const silentLimit = 4 * time.Minute

// silentTooLong reports whether the bot is in a game and its script has been silent for silentLimit.
func silentTooLong(s *State, now time.Time) bool {
	if !s.Wanted || s.Status != "running" || !strings.HasPrefix(s.Info, "Game:") || s.OutputAt.IsZero() {
		return false
	}
	// the game just started or the bot just came back: its output clock starts then
	started := s.GameAt
	if !started.IsZero() && now.Sub(started) < silentLimit && s.OutputAt.Before(started) {
		return false
	}
	return now.Sub(s.OutputAt) > silentLimit
}

func (m *Manager) silenceLoop() {
	for range time.Tick(20 * time.Second) {
		now := time.Now()
		var hung []string
		m.mu.Lock()
		for n, s := range m.states {
			if silentTooLong(s, now) {
				hung = append(hung, n)
				s.OutputAt = now // one restart per silent spell
			}
		}
		m.mu.Unlock()
		for _, n := range hung {
			m.logf(9, n, "the bot's script has printed nothing for %v while it is in a game: it is hung, restarting it", silentLimit)
			m.addEvent(ActivityEvent{Time: now, Bot: n, Kind: "restart", Name: "Silent", Detail: "restarting"})
			m.update(n, func(s *State) { s.Restarts++ })
			m.sendBridge(wire.Msg{T: "kill", Profile: n}) // onExit restarts (Wanted stays true)
		}
	}
}
