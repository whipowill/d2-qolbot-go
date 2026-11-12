package main

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// "May not be ready": a bot that keeps chickening (leaving the game because its life ran low) or dying in a short time is out of its depth
// in the place it is sent to. Nothing about the bot's level or gear is judged; the pattern is the evidence. When it happens the bot is
// stopped (saved and exited like the Stop button does it) and the Activity list says why, instead of the bot going round the same loop
// for hours. A leader that is stopped takes the team with it, because the run cannot go on without it.
//
// Settings (Settings tab, Behavior; qolbot.json "chickenLimit" and "chickenWindowMinutes"): this many chickens or deaths within this many
// minutes, default 3 within 30, limit 0 = never stop a bot for this. Qolbot applies a change at once (the bots do not read it).

const (
	defaultChickenLimit  = 3
	defaultChickenWindow = 30 // minutes
)

// setback is one chicken or one death.
type setback struct {
	At     time.Time
	Kind   string // chicken, death
	Zone   string
	Diff   string
	Detail string // what the bot said about it ("Life Chicken (246/792) to Death Beetle in Far Oasis. Ping: 44")
}

// readinessLimits are the limit and the window in force.
func (m *Manager) readinessLimits() (int, time.Duration) {
	limit, mins := defaultChickenLimit, defaultChickenWindow
	if m.cfg.ChickenLimit != nil {
		limit = *m.cfg.ChickenLimit
	}
	if m.cfg.ChickenWindowMin != nil && *m.cfg.ChickenWindowMin > 0 {
		mins = *m.cfg.ChickenWindowMin
	}
	return limit, time.Duration(mins) * time.Minute
}

// recentSetbacks keeps the setbacks that are not older than the window.
func recentSetbacks(all []setback, now time.Time, window time.Duration) []setback {
	var keep []setback
	for _, s := range all {
		if now.Sub(s.At) <= window {
			keep = append(keep, s)
		}
	}
	return keep
}

// notReadyMessage is the sentence for the Activity list: how many, in how long, where, and the last thing the bot said.
func notReadyMessage(character string, sb []setback) string {
	if len(sb) == 0 {
		return ""
	}
	chickens, deaths := 0, 0
	seen := map[string]bool{}
	var zones []string
	diff := ""
	for _, s := range sb {
		if s.Kind == "death" {
			deaths++
		} else {
			chickens++
		}
		if s.Zone != "" && !seen[s.Zone] {
			seen[s.Zone] = true
			zones = append(zones, s.Zone)
		}
		if s.Diff != "" {
			diff = s.Diff
		}
	}
	var what []string
	if chickens > 0 {
		what = append(what, plural(chickens, "chicken"))
	}
	if deaths > 0 {
		what = append(what, plural(deaths, "death"))
	}
	span := sb[len(sb)-1].At.Sub(sb[0].At)
	where := ""
	if len(zones) > 0 || diff != "" {
		where = " in "
		if diff != "" {
			where += diff
		}
		if len(zones) > 0 {
			if diff != "" {
				where += " "
			}
			where += "(" + strings.Join(zones, ", ") + ")"
		}
	}
	msg := fmt.Sprintf("%s stopped: %s in %s%s.", character, strings.Join(what, " and "), roundMinutes(span), where)
	if last := sb[len(sb)-1].Detail; last != "" {
		msg += " Last: " + strings.TrimSuffix(last, ".") + "."
	}
	return msg + " This character may not be ready for these monsters: level it up or give it better gear, then start it again."
}

func plural(n int, word string) string {
	if n == 1 {
		return "1 " + word
	}
	return fmt.Sprintf("%d %ss", n, word)
}

func roundMinutes(d time.Duration) string {
	m := int((d + 30*time.Second) / time.Minute)
	if m <= 1 {
		return "a minute or two"
	}
	return fmt.Sprintf("%d minutes", m)
}

// noteSetback records a chicken or a death of a running bot and stops it when it has had too many lately.
func (m *Manager) noteSetback(profile, kind string) {
	limit, window := m.readinessLimits()
	now := time.Now()
	var msg, character string
	var leader bool
	m.mu.Lock()
	s := m.states[profile]
	if s == nil {
		m.mu.Unlock()
		return
	}
	s.setbacks = append(recentSetbacks(s.setbacks, now, window), setback{At: now, Kind: kind, Zone: s.Zone, Diff: s.Difficulty, Detail: s.lastChicken})
	s.lastChicken = ""
	if limit > 0 && len(s.setbacks) >= limit && s.Status == "running" {
		character = s.Character
		msg = notReadyMessage(character, s.setbacks)
		leader = m.roleOf(s) == "host"
		s.setbacks = nil
	}
	m.mu.Unlock()
	if msg == "" {
		return
	}
	m.logf(9, profile, "%s", msg)
	m.addEvent(ActivityEvent{Time: now, Bot: profile, Kind: "notready", Name: "Stopped: may not be ready", Detail: msg})
	m.stopForNotReady(profile, leader)
}

// stopForNotReady stops the bot, and everything else when it is the leader (the others have nothing to follow; the leader goes last).
func (m *Manager) stopForNotReady(profile string, leader bool) {
	if !leader {
		m.stopProfile(profile)
		return
	}
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
}
