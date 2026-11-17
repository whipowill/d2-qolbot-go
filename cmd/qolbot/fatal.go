package main

import (
	"fmt"
	"regexp"
	"time"
)

// Fatal events (2026-11-13, user): something the team cannot carry on through. Everybody is stopped (saved and exited like the Stop button does it),
// the Activity list gets an entry, and the Activity page shows a red box at the top until the user dismisses it or starts a bot again. Nothing
// restarts by itself after one: the endless loops of 2026-11-13 (a leader with no scrolls restarting the game every minute) are what this is for.
//
// The fatal events:
//   - noscrolls: a bot is out of town portal scrolls AND cannot pay for any (TownChicken.js says so in its log line)
//   - stashfull: a bot has no room in its stash and no page can be added (Town.stash)
//   - chickens:  a bot chickened or died too often (readiness.go; the first time in Quest mode the team levels up instead, see levelup.go)

type fatalState struct {
	Kind  string    `json:"kind"`
	Title string    `json:"title"`
	Text  string    `json:"text"`
	Bot   string    `json:"bot"`
	At    time.Time `json:"since"`
}

var reNoScrolls = regexp.MustCompile(`^TownChicken: problem: I am out of town portal scrolls and I cannot pay for any`)

// reStashFull: Town.stash says this when an item has no room in the stash and no page can be added (the user's PlugY.ini allows one page of the personal
// stash, so /insertpage fails, 2026-11-13): the team stops cleanly instead of retrying every visit.
var reStashFull = regexp.MustCompile(`^Stash is full: no room for (.+) and no page can be added`)

// fatalFromLog says whether a bot's log line is a fatal event, and what to tell the user about it.
func fatalFromLog(bot, text string) (kind, title, msg string, ok bool) {
	if reNoScrolls.MatchString(text) {
		return "noscrolls", "Out of town portal scrolls", fmt.Sprintf("%s is out of town portal scrolls and cannot pay for any. Without them nobody can leave the field or share waypoints. Everybody is stopped: put some gold in a bot's pack or stash, then start again.", bot), true
	}
	if mm := reStashFull.FindStringSubmatch(text); mm != nil {
		return "stashfull", "A stash is full", fmt.Sprintf("%s's stash has no room for %s and no page can be added (PlugY allows one page of the personal stash). Everybody is stopped: empty the stash (or give it room), then start again.", bot, mm[1]), true
	}
	return "", "", "", false
}

// raiseFatal records the event and tells the Activity list; it returns true when this is a new one and the caller must stop every bot
// (stopForNotReady: the readiness code does it at once, the log follower in a goroutine so that it keeps reading). A second one of the same kind
// within two minutes (several bots print the same line) is ignored.
func (m *Manager) raiseFatal(kind, bot, title, text string) bool {
	m.mu.Lock()
	if m.fatal != nil && m.fatal.Kind == kind && time.Since(m.fatal.At) < 2*time.Minute {
		m.mu.Unlock()
		return false
	}
	m.fatal = &fatalState{Kind: kind, Title: title, Text: text, Bot: bot, At: time.Now()}
	m.levelUp = nil // a leveling detour is over too
	m.mu.Unlock()
	m.logf(9, bot, "FATAL: %s: %s", title, text)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: bot, Kind: "fatal", Name: title, Detail: text})
	return true
}

// clearFatal dismisses the red box (the user did, or started a bot).
func (m *Manager) clearFatal() {
	m.mu.Lock()
	m.fatal = nil
	m.mu.Unlock()
}

// fatalLocked is the fatal event for /api/state (nil when none). Caller holds m.mu.
func (m *Manager) fatalLocked() *fatalState { return m.fatal }

// rePackFull: Item.reportFull says this when a bot has no free cell in its pack and none in its Horadric Cube, so it cannot pick up anything (the user, 2026-11-16:
// "only if the bot truly cannot pick up anything because all their space is full, including their cube"). It is a red box, not a stop.
var rePackFull = regexp.MustCompile(`^Pack: FULL: (no room in the pack and none in the cube.*)$`)

// packFullFromLog says whether a bot's log line is that, and what to tell the user.
func packFullFromLog(bot, text string) (title, msg string, ok bool) {
	if mm := rePackFull.FindStringSubmatch(text); mm != nil {
		return bot + "'s pack and cube are full", mm[1] + " Empty its pack (charms, potions, quest items it no longer needs) or the bot walks past everything it finds.", true
	}
	return "", "", false
}

// The notices (the yellow box): a bot's "Pack: NOTICE: ..." log line. kind is one box per kind and bot.
var (
	reFullPack = regexp.MustCompile(`^Pack: NOTICE: (\S+ has a full inventory.*)$`)       // Item.noteFullPack: items go into the cube because the pack is full (the user, 2026-11-16)
	reBigSpace = regexp.MustCompile(`^Pack: NOTICE: (no clear 2x4 space in the pack.*)$`) // Item.checkBigSpace (the user: "if a char doesn't have a clear 2x4 space, there should be a yellow alert")
)

// noticeFromLog says whether a bot's log line is a notice, which kind, and what to tell the user.
func noticeFromLog(bot, text string) (kind, title, msg string, ok bool) {
	if mm := reFullPack.FindStringSubmatch(text); mm != nil {
		return "fullpack", bot + " has a full inventory", mm[1], true
	}
	if mm := reBigSpace.FindStringSubmatch(text); mm != nil {
		return "bigspace", bot + " has no clear 2x4 space in its pack", mm[1], true
	}
	return "", "", "", false
}

// raiseNotice shows the yellow box (one per kind and bot: a second one within ten minutes is ignored). It stops nobody.
func (m *Manager) raiseNotice(kind, bot, title, text string) {
	m.mu.Lock()
	if m.notice != nil && m.notice.Kind == kind && m.notice.Bot == bot && time.Since(m.notice.At) < 10*time.Minute {
		m.mu.Unlock()
		return
	}
	m.notice = &fatalState{Kind: kind, Title: title, Text: text, Bot: bot, At: time.Now()}
	m.mu.Unlock()
	m.logf(9, bot, "NOTICE: %s: %s", title, text)
}

// clearNotice dismisses the yellow box.
func (m *Manager) clearNotice() {
	m.mu.Lock()
	m.notice = nil
	m.mu.Unlock()
}
