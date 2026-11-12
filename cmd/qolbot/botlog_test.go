package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseD2BSLine(t *testing.T) {
	pid, text, ok := parseD2BSLine("[11/09/26 21:11:05] D2BS 304: \xffc2Starting script: \xffc9Mephisto\r")
	if !ok || pid != 304 || text != "Starting script: Mephisto" {
		t.Fatalf("got %d %q %v", pid, text, ok)
	}
	if _, _, ok := parseD2BSLine("not a d2bs line"); ok {
		t.Error("a foreign line must not parse")
	}
	if scriptStarted(text) != "Mephisto" || scriptStarted("Ready") != "" {
		t.Error("script name")
	}
}

func TestIsProblemLine(t *testing.T) {
	for _, l := range []string{"Error in Mephisto (Mephisto.js #44) x is not defined (Area: 102)", "Failed to include script: Foo", "AutoSpec: ERROR: no stash", "Error: login time out null"} {
		if !isProblemLine(l) {
			t.Errorf("must be a problem: %s", l)
		}
	}
	for _, l := range []string{"[Strict Warning] Code(162) reference to undefined property this.x", "Starting script: Baal", "Picked up Ring of Wizardry"} {
		if isProblemLine(l) {
			t.Errorf("must not be a problem: %s", l)
		}
	}
}

func TestExpectTeamIsWrittenForTheLeader(t *testing.T) {
	root := t.TempDir()
	m := &Manager{root: root, cfg: Config{ScriptPath: "kolbot", Player: "Lead", NotPlaying: true}, logSubs: map[chan LogLine]bool{},
		states: map[string]*State{"Lead": {Profile: Profile{Name: "Lead", Character: "Lead"}, Wanted: true}}}
	m.expectTeam = []string{"A", "B"}
	m.writeBotNames()
	b, err := os.ReadFile(filepath.Join(root, "d2bs", "kolbot", "data", "bots.json"))
	if err != nil || !strings.Contains(string(b), `"team":["A","B"]`) || !strings.Contains(string(b), `"leader":"Lead"`) {
		t.Fatalf("bots.json: %s %v", b, err)
	}
	m.stopProfile("Lead")
	if len(m.expectTeam) != 0 {
		t.Errorf("stopping the leader must clear the team: %v", m.expectTeam)
	}
}

func TestParsePicked(t *testing.T) {
	for _, c := range []struct {
		text, name, quality string
		ilvl                int
		ok                  bool
	}{
		{"\xef\xbf\xbdc7Picked up \xef\xbf\xbdc4Harlequin Crest \xef\xbf\xbdc0(ilvl 85)", "Harlequin Crest", "unique", 85, true},
		{"\xffc7Picked up \xffc9Death Coil Ring \xffc0(ilvl 70) (Pickit line 12)", "Death Coil Ring", "rare", 70, true},
		{"\xffc7Picked up \xffc8Ist Rune \xffc0(ilvl 60)", "Ist Rune", "rune", 60, true},
		{"\xffc7Picked up \xffc3Grand Charm \xffc0(ilvl 91)", "Grand Charm", "magic", 91, true},
		{"\xffc7Picked up \xffc4350 gold", "", "", 0, false},
		{"\xffc7Picked up \xffc2Key \xffc7(3/12)", "", "", 0, false},
		{"Starting script: default.dbj", "", "", 0, false},
	} {
		it, ok := parsePicked(c.text)
		if ok != c.ok || (ok && (it.Name != c.name || it.Quality != c.quality || it.Ilvl != c.ilvl)) {
			t.Errorf("%q -> %+v %v", c.text, it, ok)
		}
	}
	if !quietLine("Game: 00:01:02") || quietLine("Going to town.") {
		t.Error("quiet lines")
	}
}

func TestConfigProbeIsNotAProblem(t *testing.T) {
	if isProblemLine("Paladin.Darius.js not found!") || !isProblemLine("Error in Questing.js line 3") {
		t.Error("the per-character config probe is harmless, a script error is not")
	}
}
