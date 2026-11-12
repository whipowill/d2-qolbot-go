package main

import (
	"testing"
	"time"
)

func stopTestManager(t *testing.T) *Manager {
	m := pickitManager(t)
	m.cfg.NotPlaying, m.cfg.Player = true, "Lead"
	m.states = map[string]*State{
		"Lead": {Profile: Profile{Name: "Lead", Character: "Lead"}, Status: "running"},
		"Aaa":  {Profile: Profile{Name: "Aaa", Character: "Aaa"}, Status: "running"},
		"Zed":  {Profile: Profile{Name: "Zed", Character: "Zed"}, Status: "running"},
	}
	return m
}

func TestHostLastSplit(t *testing.T) {
	m := stopTestManager(t)
	others, hosts := m.hostsLast([]string{"Aaa", "Lead", "Zed"})
	if len(hosts) != 1 || hosts[0] != "Lead" || len(others) != 2 {
		t.Errorf("others=%v hosts=%v", others, hosts)
	}
	// while you are playing there is no host bot at all: every bot is a follower
	m.cfg.NotPlaying = false
	others, hosts = m.hostsLast([]string{"Aaa", "Lead", "Zed"})
	if len(hosts) != 0 || len(others) != 3 {
		t.Errorf("playing: others=%v hosts=%v", others, hosts)
	}
}

func TestWaitStopped(t *testing.T) {
	m := stopTestManager(t)
	go func() {
		time.Sleep(400 * time.Millisecond)
		m.update("Aaa", func(s *State) { s.Status = "stopped" })
		m.update("Zed", func(s *State) { s.Status = "stopped" })
	}()
	start := time.Now()
	m.waitStopped([]string{"Aaa", "Zed"}, 5*time.Second)
	if d := time.Since(start); d < 300*time.Millisecond || d > 3*time.Second {
		t.Errorf("waitStopped returned after %v", d)
	}
}

func TestStopBlockedWhileOthersAreIn(t *testing.T) {
	m := stopTestManager(t)
	if err := m.stopBlocked([]string{"Lead"}); err == nil {
		t.Error("the leader must not be stoppable while Aaa and Zed are in the game")
	}
	if err := m.stopBlocked([]string{"Lead", "Aaa"}); err == nil {
		t.Error("Zed is still in the game")
	}
	if err := m.stopBlocked([]string{"Lead", "Aaa", "Zed"}); err != nil {
		t.Errorf("stopping everyone is allowed: %v", err)
	}
	if err := m.stopBlocked([]string{"Aaa"}); err != nil {
		t.Errorf("stopping a follower is always allowed: %v", err)
	}
	m.update("Aaa", func(s *State) { s.Status = "stopped" })
	m.update("Zed", func(s *State) { s.Status = "stopped" })
	if err := m.stopBlocked([]string{"Lead"}); err != nil {
		t.Errorf("the leader may go once the others are out: %v", err)
	}
}
