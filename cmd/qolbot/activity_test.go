package main

import (
	"testing"
	"time"
)

func TestFriendlyActivity(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{"Starting script: Corpsefire", "Traveling to Corpsefire"},
		{"Starting script: Follower", "Following the leader"},
		{"Starting script: Questing", "Embarking on quest"},
		{"Engaging Corpsefire", "Engaging Corpsefire"},
		{"Traveling to Rogue Encampment", "Traveling to Rogue Encampment"},
		{"Traveling", "Traveling"},
		{"Taking waypoint to Black Marsh", "Taking waypoint to Black Marsh"},
		{"Taking portal", "Taking portal"},
		{"Talking to Akara", "Talking to Akara"},
		{"Opening the stash", "Opening the stash"},
		{"Fighting demons", "Fighting demons"},
		{"Going back to town", "Going back to town"},
		{"AutoSpec (quiet): Waiting for my team: 0 of 1 in the game (not yet: Temp).", "Waiting on teammates"},
		{"AutoSpec: the whole team is here (Temp)", "Team is here"},
		{"SAY: I cannot reach you. Open a town portal, or I stay in town.", "Waiting for a portal"},
		{"Following Meir.", "Following Meir"},
		{"Detected hostile monsters.", "Fighting demons"},
		{"Searching for leader Darius.", "Searching for leader Darius"},
	} {
		if got, ok := friendlyActivity(c.in); !ok || got != c.want {
			t.Errorf("%q -> %q %v, want %q", c.in, got, ok, c.want)
		}
	}
	// Not statuses: things that happened (they are Activity entries) and small details.
	for _, noise := range []string{"move retry 1", "autoMercEquip: candidate Aerin Shield (type 70, quality 2) tier 11631", "Loaded NIP: melee.nip. Lines: 62.", "Fast pickit active.",
		"AutoSpec: storage inventory 10x4, stash 10x10", "12", "SAY: /save", "SAY: Nothing to do.", "[Strict Warning] x", "Generated.nip", "\xffc7Picked up \xffc4Scepter \xffc0(ilvl 4)", "AutoSpec: quests: area 1 diff 0 q6=0/0/0",
		"initNPC: heal", "initNPC: gamble", "Run duration 98.704", "Killed Corpsefire (Den Of Evil)", "SAY: Act 1 - #2 - \"Blood Raven\" is complete.", "Leveled up to level 16",
		"AutoStat: Using 5 stat points in Strength", "AutoSkill: Using skill point in Skill: Bash ID: 126", "Equipped Sash (gear upgrade)", "Going gambling",
		"AutoSpec: follow by waypoint: area 1 -> 3 (leader in 2), trip 1 in 40s", "AutoSpec (quiet): Going outside (waypoint).", "Going to town.",
		"Drinking potion from inventory.", "Taking an item out of the stash.", "Using scroll of resistance.", "Waypoint gathered.", "Leader found.", "Ready.", "Done. Moved 3 item(s) to my stash."} {
		if got, ok := friendlyActivity(noise); ok {
			t.Errorf("%q should be left out, got %q", noise, got)
		}
	}
}

func TestParseEvent(t *testing.T) {
	if e, ok := parseEvent("Killed Andariel (Catacombs Level 4)"); !ok || e.Kind != "kill" || e.Name != "Andariel" || e.Detail != "Catacombs Level 4" {
		t.Errorf("kill: %+v", e)
	}
	if e, ok := parseEvent("AutoSpec (quiet): Act 2 - #4 - \"Radament's Lair\" is complete."); !ok || e.Kind != "quest" || e.Name != "Radament's Lair" || e.Detail != "Act 2" {
		t.Errorf("quest: %+v", e)
	}
	if e, ok := parseEvent("\xffc7Picked up \xffc9Death Coil Ring \xffc0(ilvl 70) (Generated.nip #12)"); !ok || e.Kind != "item" || e.Quality != "rare" || e.Detail != "Keeper" {
		t.Errorf("item: %+v", e)
	}
	for _, skip := range []string{"\xffc7Picked up \xffc1Light Healing Potion \xffc0(ilvl 1) (Potions.nip #12)", "\xffc7Picked up \xffc0Sash \xffc0(ilvl 4)"} {
		if _, ok := parseEvent(skip); ok {
			t.Errorf("%q is not worth listing", skip)
		}
	}
	if e, ok := parseEvent("Equipped Sash (gear upgrade)"); !ok || e.Kind != "equip" || e.Name != "Sash" {
		t.Errorf("equip: %+v", e)
	}
	if e, ok := parseEvent("Equipped Short Bow on the mercenary"); !ok || e.Kind != "equip" || e.Detail != "Upgrade" {
		t.Errorf("merc equip: %+v", e)
	}
	if e, ok := parseEvent("Leveled up to level 16"); !ok || e.Kind != "level" || e.Name != "16" {
		t.Errorf("level: %+v", e)
	}
	if e, ok := parseEvent("AutoStat: Using 5 stat points in Strength"); !ok || e.Kind != "stat" || e.Name != "Strength" || e.Detail != "5" {
		t.Errorf("stat: %+v", e)
	}
	if e, ok := parseEvent("AutoSkill: Using skill point in Skill: Bash ID: 126"); !ok || e.Kind != "skill" || e.Name != "Bash" {
		t.Errorf("skill: %+v", e)
	}
	if e, ok := parseEvent("Healed at the town healer."); !ok || e.Kind != "heal" {
		t.Errorf("heal: %+v", e)
	}
	if e, ok := parseEvent("Going gambling"); !ok || e.Kind != "gamble" {
		t.Errorf("gamble: %+v", e)
	}
	if _, ok := parseEvent("Going to town."); ok {
		t.Error("not an event")
	}
}

func TestItemDetailsAttachToEvents(t *testing.T) {
	m := &Manager{}
	item := `{"title":"Kept Kraken Gaze Diadem","description":"Diadem\n+2 to all skills"}`
	// the item log entry arrives first, the printed line a moment later
	m.noteItemDesc("Darius", item)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Darius", Kind: "item", Name: "Kraken Gaze"})
	if e := m.recentEvents(1)[0]; e.Desc == "" || e.Title != "Kept Kraken Gaze Diadem" {
		t.Errorf("entry first: %+v", e)
	}
	// the printed line first, the item log entry after
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Darius", Kind: "equip", Name: "Sash"})
	m.noteItemDesc("Darius", `{"title":"Equipped Sash","description":"Sash\nDefense: 5"}`)
	if e := m.recentEvents(1)[0]; e.Desc == "" {
		t.Errorf("line first: %+v", e)
	}
	// a potion's entry (no Activity entry) must not be given to the next item
	m.noteItemDesc("Darius", `{"title":"Kept Light Healing Potion","description":"Light Healing Potion"}`)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Darius", Kind: "item", Name: "Skull Cap"})
	if e := m.recentEvents(1)[0]; e.Desc != "" {
		t.Errorf("wrong details attached: %+v", e)
	}
	m.noteItemDesc("Darius", `{"title":"Sold Skull Cap","description":"x"}`)
	if e := m.recentEvents(1)[0]; e.Desc != "" {
		t.Error("only kept or equipped items carry details")
	}
}

// An item or a piece of gear carries the zone the bot was in, so the Activity list can say where it happened.
func TestEventsCarryTheZone(t *testing.T) {
	m := pickitManager(t)
	m.states = map[string]*State{"Darius": {Profile: Profile{Name: "Darius"}, Zone: "Black Marsh"}}
	m.addEvent(ActivityEvent{Bot: "Darius", Kind: "item", Name: "Buckler", Quality: "set"})
	m.addEvent(ActivityEvent{Bot: "Darius", Kind: "equip", Name: "Mace"})
	m.addEvent(ActivityEvent{Bot: "Darius", Kind: "kill", Name: "Andariel"})
	ev := m.recentEvents(10)
	zones := map[string]string{}
	for _, e := range ev {
		zones[e.Kind] = e.Zone
	}
	if zones["item"] != "Black Marsh" || zones["equip"] != "Black Marsh" || zones["kill"] != "" {
		t.Errorf("zones by kind: %v", zones)
	}
}

func TestWaitingForAPortalOnlyInTown(t *testing.T) {
	if !staleStatus("Waiting for a portal", "Tamoe Highland") {
		t.Error("a bot in the field cannot be waiting for a portal")
	}
	if staleStatus("Waiting for a portal", "Rogue Encampment") || staleStatus("Waiting for a portal", "") || staleStatus("Fighting demons", "Tamoe Highland") {
		t.Error("only a status that is false for the zone is dropped")
	}
}

func TestDisconnectIsNoticed(t *testing.T) {
	m := pickitManager(t)
	m.states = map[string]*State{"Meir": {Profile: Profile{Name: "Meir", Info: "Game:  (00:10:00)"}, Status: "running", Wanted: true, Zone: "Black Marsh"}}
	if !m.noteStarterStatus("Meir", "Join Game") {
		t.Fatal("a bot that left its game for the menu was disconnected")
	}
	s := m.states["Meir"]
	if s.Activity != "Disconnected" || s.Zone != "Menu" {
		t.Errorf("card: %q in %q", s.Activity, s.Zone)
	}
	if ev := m.recentEvents(5); len(ev) != 1 || ev[0].Kind != "disconnect" || ev[0].Zone != "Black Marsh" {
		t.Errorf("events: %+v", ev)
	}
	// still at the menu: now it is joining, not a second disconnect
	if m.noteStarterStatus("Meir", "Join Game") || m.states["Meir"].Activity != "Joining game" {
		t.Errorf("second report: %q", m.states["Meir"].Activity)
	}
	// being stopped on purpose is not a disconnect
	m.states["Meir"].Info, m.states["Meir"].Status, m.states["Meir"].Wanted = "Game:  (00:11:00)", "stopping", false
	if m.noteStarterStatus("Meir", "Join Game") {
		t.Error("a bot we are stopping did not get disconnected")
	}
	// a plain start is not one either
	m.states["Meir"].Info, m.states["Meir"].Status, m.states["Meir"].Wanted = "", "running", true
	if m.noteStarterStatus("Meir", "Join Game") {
		t.Error("starting at the menu is not a disconnect")
	}
	if got, ok := friendlyActivity("Waiting for leader"); !ok || got != "Waiting for leader" {
		t.Errorf("waiting for leader: %q %v", got, ok)
	}
}

func TestWatchedKills(t *testing.T) {
	k, ok := parseEvent("Killed Champion Fallen Shaman (Black Marsh) [77]")
	if !ok || k.Kind != "kill" || k.Name != "Champion Fallen Shaman" || k.Detail != "Black Marsh" || k.Key != "k77" {
		t.Errorf("champion kill: %+v", k)
	}
	if k, ok := parseEvent("Killed Andariel (Catacombs Level 4)"); !ok || k.Name != "Andariel" || k.Detail != "Catacombs Level 4" || k.Key != "" {
		t.Errorf("a kill the leader's script prints still works: %+v", k)
	}
}

func TestSeveralBotsReportOnce(t *testing.T) {
	m := pickitManager(t)
	m.states = map[string]*State{"A": {Profile: Profile{Name: "A"}, Zone: "Black Marsh"}, "B": {Profile: Profile{Name: "B"}, Zone: "Black Marsh"}, "C": {Profile: Profile{Name: "C"}, Zone: "Black Marsh"}}
	now := time.Now()
	for _, bot := range []string{"A", "B", "C"} {
		m.addEvent(ActivityEvent{Time: now, Bot: bot, Kind: "kill", Name: "Bonebreak", Key: "k42"})
	}
	if ev := m.recentEvents(10); len(ev) != 1 {
		t.Fatalf("three bots, one kill: want 1 entry, got %d: %+v", len(ev), ev)
	}
	// a different monster (another id) is a different entry; the same boss printed twice without an id within 30 seconds is one kill
	m.addEvent(ActivityEvent{Time: now, Bot: "A", Kind: "kill", Name: "Bonebreak", Key: "k43"})
	m.addEvent(ActivityEvent{Time: now, Bot: "A", Kind: "kill", Name: "Andariel"})
	m.addEvent(ActivityEvent{Time: now, Bot: "A", Kind: "kill", Name: "Andariel"})
	if ev := m.recentEvents(10); len(ev) != 3 {
		t.Errorf("want 3 entries, got %d", len(ev))
	}
	// the leader's keyless line and a bot's keyed line for the same boss in the same place are one kill
	m.addEvent(ActivityEvent{Time: now, Bot: "B", Kind: "kill", Name: "Andariel", Key: "k99"})
	if ev := m.recentEvents(10); len(ev) != 3 {
		t.Errorf("a keyed line for a boss the leader already reported should be dropped: %d entries", len(ev))
	}
}

// The quality colour of a picked-up item must survive the trip from the D2BS log line to the event (the status line strips colours, the
// event parser must be given the raw text first).
func TestItemColourSurvivesTheLogLine(t *testing.T) {
	for _, c := range []struct{ line, name, quality string }{
		{"[11/10/26 21:36:21] D2BS 556: \xffc7Picked up \xffc2Balrog Skin \xffc0(ilvl 85) (Generated.nip #3)\r\n", "Balrog Skin", "set"},
		{"[11/10/26 21:36:22] D2BS 556: \xc3\xbfc7Picked up \xc3\xbfc4Harlequin Crest \xc3\xbfc0(ilvl 85) (Generated.nip #1)\r\n", "Harlequin Crest", "unique"},
		{"[11/10/26 21:36:23] D2BS 556: \xffc7Picked up \xffc8Ber Rune \xffc0(ilvl 70) (Generated.nip #9)\r\n", "Ber Rune", "rune"},
	} {
		_, stripped, ok := parseD2BSLine(c.line)
		if !ok {
			t.Fatalf("line not recognised: %q", c.line)
		}
		if _, ok := parseEvent(stripped); ok {
			if ev, _ := parseEvent(stripped); ev.Quality != "normal" {
				t.Errorf("the stripped text has no colour, quality should be normal: %+v", ev)
			}
		}
		ev, ok := parseEvent(rawD2BSText(c.line))
		if !ok || ev.Name != c.name || ev.Quality != c.quality || ev.Detail != "Keeper" {
			t.Errorf("%s: %+v (ok=%v)", c.name, ev, ok)
		}
	}
}

func TestStashedItemsAreReported(t *testing.T) {
	line := "[11/10/26 21:36:51] D2BS 556: \xffc7Stashed \xffc2Balrog Skin\r\n"
	_, stripped, ok := parseD2BSLine(line)
	if !ok {
		t.Fatal("line not recognised")
	}
	ev, ok := parseEvent(rawD2BSText(line))
	if !ok || ev.Kind != "stash" || ev.Name != "Balrog Skin" || ev.Quality != "set" || ev.Detail != "Stashed" {
		t.Errorf("stash: %+v (ok=%v)", ev, ok)
	}
	if ev, ok := parseEvent(stripped); !ok || ev.Kind != "stash" || ev.Name != "Balrog Skin" {
		t.Errorf("without the colour it is still a stash entry: %+v", ev)
	}
	// only a line that starts with it, and the status "Stashing items" is not one
	if _, ok := parseEvent("AutoSpec: Stashed nothing today"); ok {
		t.Error("a line that does not start with Stashed is not a stash entry")
	}
}

func TestSkillPointsMergeIntoOneEntry(t *testing.T) {
	m := &Manager{states: map[string]*State{}}
	now := time.Now()
	for i, n := range []string{"Telekinesis", "Teleport", "Fire Ball", "Meteor", "Meteor"} {
		m.addEvent(ActivityEvent{Time: now.Add(time.Duration(i) * time.Second), Bot: "Meir", Kind: "skill", Name: n})
	}
	m.addEvent(ActivityEvent{Time: now, Bot: "Darius", Kind: "skill", Name: "Zeal"})
	ev := m.recentEvents(10)
	if len(ev) != 2 {
		t.Fatalf("want 2 entries, got %d: %+v", len(ev), ev)
	}
	for _, e := range ev {
		if e.Bot == "Meir" && (e.Count != 5 || e.Name != "Telekinesis, Teleport, Fire Ball and 1 more") {
			t.Fatalf("merged entry wrong: %+v", e)
		}
	}
}

func TestConnectIsNoticed(t *testing.T) {
	m := pickitManager(t)
	m.states = map[string]*State{"Meir": {Profile: Profile{Name: "Meir", Info: "Join Game"}, Status: "running", Wanted: true}}
	m.noteStarterStatus("Meir", "Game:  (00:00:01)")
	if ev := m.recentEvents(5); len(ev) != 1 || ev[0].Kind != "connect" || ev[0].Name != "Connected" || ev[0].Bot != "Meir" {
		t.Fatalf("joining a game from the menu is a connect: %+v", ev)
	}
	m.noteStarterStatus("Meir", "Game:  (00:00:02)") // the clock ticks every second: not another connect
	if ev := m.recentEvents(5); len(ev) != 1 {
		t.Errorf("only the first report of a game counts: %+v", ev)
	}
	m.states["Meir"].Info, m.states["Meir"].Status = "", "starting"
	m.noteStarterStatus("Meir", "Game:  (00:00:03)")
	if ev := m.recentEvents(5); len(ev) != 1 {
		t.Errorf("a bot that is not running yet is not reported: %+v", ev)
	}
}

func TestLevelUpUpdatesTheCard(t *testing.T) {
	m := pickitManager(t)
	m.states = map[string]*State{"Meir": {Profile: Profile{Name: "Meir"}, Status: "running", Char: &CharInfo{Class: "Sorceress", Level: 92}}}
	m.noteLevel("Meir", "93")
	if m.states["Meir"].Char.Level != 93 {
		t.Errorf("level after the level-up: %d", m.states["Meir"].Char.Level)
	}
	m.noteLevel("Meir", "91") // an older line never lowers it
	m.noteLevel("Meir", "x")
	if m.states["Meir"].Char.Level != 93 {
		t.Errorf("level must not drop: %d", m.states["Meir"].Char.Level)
	}
}
