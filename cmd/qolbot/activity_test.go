package main

import (
	"strings"
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
		{"Team: the whole team is here (Temp)", "Team is here"},
		{"Team: Waiting for my team: 0 of 1 in the game (not yet: Temp).", "Waiting on teammates"},
		{"Follower: Taking portal", "Taking portal"},
		{"SAY: I cannot reach you. Open a town portal, or I stay in town.", "Waiting for a portal"},
		{"SAY: I cannot find thee. Open a portal, or I shall bide in town.", "Waiting for a portal"},
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
		"AutoSpec: follow by waypoint: area 1 -> 3 (leader in 2), trip 1 in 40s", "AutoSpec (quiet): Going outside (waypoint).", "Going to town.", "Follower: Going to town.", "Quester: quest state: area 40 diff 2 q6=1/0/1 q7=1/0",
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
	if e, ok := parseEvent("Team: The team is split up (Xena, Sankt apart, regroup no. 4). Going to town so we all meet."); !ok || e.Kind != "regroup" || e.Name != "Party Regroup" || !strings.Contains(e.Detail, "Xena, Sankt apart") || !strings.Contains(e.Detail, "no. 4") {
		t.Errorf("regroup: %+v", e)
	}
	if e, ok := parseEvent("QuickTravel: took Barabas's portal to waypoint Cold Plains"); !ok || e.Kind != "quicktravel" || e.Name != "Waypoint Portal" || e.Detail != "Cold Plains \u00b7 Barabas's portal" {
		t.Errorf("waypoint helper portal: %+v ok=%v", e, ok)
	}
	if e, ok := parseEvent("QuickTravel: took Meir's portal to andy"); !ok || e.Kind != "quicktravel" || !strings.Contains(e.Detail, "Andariel") || !strings.Contains(e.Detail, "Meir") {
		t.Errorf("quick travel: %+v", e)
	}
	if e, ok := parseEvent("Waypoints: Waypoints synced (3 of 4)."); !ok || e.Kind != "waypointsync" || !strings.HasPrefix(e.Detail, "3 of 4") {
		t.Errorf("waypoints shared: %+v", e)
	}
	if e, ok := parseEvent("Waypoints: all in sync (Darius, Xena, Meir)"); !ok || e.Kind != "waypointsync" || e.Name != "Waypoints In Sync" || e.Detail != "Darius, Xena, Meir" {
		t.Errorf("waypoints in sync: %+v", e)
	}
	if e, ok := parseEvent("Waypoint collected: Stony Field"); !ok || e.Kind != "waypoint" || e.Detail != "Stony Field" {
		t.Errorf("waypoint: %+v", e)
	}
	if e, ok := parseEvent("\xffc7Picked up \xffc9Death Coil Ring \xffc0(ilvl 70) (Generated.nip #12)"); !ok || e.Kind != "item" || e.Quality != "rare" || e.Detail != "Keeper" {
		t.Errorf("item: %+v", e)
	}
	for _, skip := range []string{"\xffc7Picked up \xffc1Light Healing Potion \xffc0(ilvl 1) (Potions.nip #12)", "\xffc7Picked up \xffc0Sash \xffc0(ilvl 4)"} {
		if _, ok := parseEvent(skip); ok {
			t.Errorf("%q is not worth listing", skip)
		}
	}
	if e, ok := parseEvent("Hired merc Liaza: a1-ice for 825 gold"); !ok || e.Kind != "merc" || e.Name != "Liaza" || e.Detail != "a1-ice" || e.Count != 825 {
		t.Errorf("hired merc: %+v %v", e, ok)
	}
	if e, ok := parseEvent("Equipped Sash (gear upgrade)"); !ok || e.Kind != "equip" || e.Name != "Sash" {
		t.Errorf("equip: %+v", e)
	}
	if e, ok := parseEvent("Equipped Short Bow on the mercenary"); !ok || e.Kind != "equip" || e.Detail != "Mercenary" || e.Name != "Short Bow" {
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
	if e := m.events[len(m.events)-1]; e.Desc == "" || e.Title != "Kept Kraken Gaze Diadem" {
		t.Errorf("entry first: %+v", e)
	}
	// the printed line first, the item log entry after
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Darius", Kind: "equip", Name: "Sash"})
	m.noteItemDesc("Darius", `{"title":"Equipped Sash","description":"Sash\nDefense: 5"}`)
	if e := m.events[len(m.events)-1]; e.Desc == "" {
		t.Errorf("line first: %+v", e)
	}
	// a potion's entry (no Activity entry) must not be given to the next item
	m.noteItemDesc("Darius", `{"title":"Kept Light Healing Potion","description":"Light Healing Potion"}`)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Darius", Kind: "item", Name: "Skull Cap"})
	if e := m.events[len(m.events)-1]; e.Desc != "" {
		t.Errorf("wrong details attached: %+v", e)
	}
	m.noteItemDesc("Darius", `{"title":"Sold Skull Cap","description":"x"}`)
	if e := m.events[len(m.events)-1]; e.Desc != "" {
		t.Error("a sale's details go to the sale, not to the pickup")
	}
	// a sale: its report comes just before the "Sold" line
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Darius", Kind: "sale", Name: "Skull Cap"})
	if e := m.events[len(m.events)-1]; e.Desc != "x" || e.Title != "Sold Skull Cap" {
		t.Errorf("the sale should carry its report: %+v", e)
	}
	// two sales: both reports arrive before the first "Sold" line is read (live 18:56, Sankt's Razor Bow)
	m.noteItemDesc("Sankt", `{"title":"Sold Demon Song Razor Bow","description":"bow"}`)
	m.noteItemDesc("Sankt", `{"title":"Sold Platinum Claymore of Self-Repair","description":"sword"}`)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Sankt", Kind: "sale", Name: "Razor Bow"})
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Sankt", Kind: "sale", Name: "Platinum Claymore of Self-Repair"})
	if a, b := m.events[len(m.events)-2], m.events[len(m.events)-1]; a.Desc != "bow" || b.Desc != "sword" {
		t.Errorf("each sale should carry its own report: %q %q", a.Desc, b.Desc)
	}
	// a name with the space of a missing prefix or suffix
	m.noteItemDesc("Sankt", `{"title":"Sold Unearthly Fuscina","description":"spear"}`)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Sankt", Kind: "sale", Name: "Unearthly Fuscina "})
	if e := m.events[len(m.events)-1]; e.Desc != "spear" || e.Name != "Unearthly Fuscina" {
		t.Errorf("trimmed name and its report: %+v", e)
	}
	// a stash: the bot's own "Stashed" report
	m.noteItemDesc("Sankt", `{"title":"Stashed Infernal Cranium Cap","description":"cap"}`)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Sankt", Kind: "stash", Name: "Cap"})
	if e := m.events[len(m.events)-1]; e.Desc != "cap" {
		t.Errorf("the stash should carry its report: %+v", e)
	}
}

// An item or a piece of gear carries the zone the bot was in, so the Activity list can say where it happened.
func TestEventsCarryTheZone(t *testing.T) {
	m := pickitManager(t)
	m.states = map[string]*State{"Darius": {Profile: Profile{Name: "Darius"}, Zone: "Black Marsh"}}
	m.addEvent(ActivityEvent{Bot: "Darius", Kind: "item", Name: "Buckler", Quality: "set"})
	m.addEvent(ActivityEvent{Bot: "Darius", Kind: "equip", Name: "Mace"})
	m.addEvent(ActivityEvent{Bot: "Darius", Kind: "kill", Name: "Andariel"})
	zones := map[string]string{}
	for _, e := range m.events { // all of them: a pickup is kept (hidden) for the entries after it
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
	// the same name with another id in the same place within 30 seconds is the same pack (a boss's minions carry its name: live 18:10, "Mind Maw the
	// Slasher" twice per pack); the same boss printed twice without an id is one kill
	m.addEvent(ActivityEvent{Time: now, Bot: "A", Kind: "kill", Name: "Bonebreak", Key: "k43"})
	m.addEvent(ActivityEvent{Time: now, Bot: "A", Kind: "kill", Name: "Andariel"})
	m.addEvent(ActivityEvent{Time: now, Bot: "A", Kind: "kill", Name: "Andariel"})
	if ev := m.recentEvents(10); len(ev) != 2 {
		t.Errorf("want 2 entries, got %d", len(ev))
	}
	// the leader's keyless line and a bot's keyed line for the same boss in the same place are one kill
	m.addEvent(ActivityEvent{Time: now, Bot: "B", Kind: "kill", Name: "Andariel", Key: "k99"})
	if ev := m.recentEvents(10); len(ev) != 2 {
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

func TestNoQuestsLeftStatus(t *testing.T) {
	if got, ok := friendlyActivity("Questing: no quest is left to do on this difficulty. Waiting here; stop the bots when you like."); !ok || got != "No quests left on this difficulty" {
		t.Errorf("got %q %v", got, ok)
	}
}

func TestQuestItemEvents(t *testing.T) {
	ev, ok := parseEvent("QuestItems: used the Book of Skill (unspent skill points 0 -> 1, stat points 0 -> 0)")
	if !ok || ev.Kind != "questitem" || ev.Name != "Book of Skill" || ev.Detail != "skill points 0 to 1" {
		t.Errorf("got %+v %v", ev, ok)
	}
	ev, ok = parseEvent("QuestItems: the Potion of Life would not be used, it stays in the pack")
	if !ok || ev.Kind != "questitem" || ev.Detail != "could not be used" {
		t.Errorf("got %+v %v", ev, ok)
	}
	if _, ok := parseEvent("QuestItems: using the Book of Skill (unspent skill points 0, stat points 0)"); ok {
		t.Error("the 'using' line is not an event")
	}
}

func TestQuestEventsAreNotDoubled(t *testing.T) {
	m := &Manager{states: map[string]*State{}, logSubs: map[chan LogLine]bool{}}
	ev := ActivityEvent{Time: time.Now(), Bot: "Meir", Kind: "quest", Name: "Radament's Lair", Detail: "Act 2"}
	m.addEvent(ev) // the Quester's own log line
	m.addEvent(ev) // and the chat line ("SAY: ...") when chat reports are on
	if len(m.events) != 1 {
		t.Errorf("got %d events", len(m.events))
	}
}

func TestParseEventRespec(t *testing.T) {
	e, ok := parseEvent("Respec: done, 47 skill points to spend (were 0).")
	if !ok || e.Kind != "respec" || e.Name != "Respec" || e.Detail != "47 skill points to spend again" {
		t.Errorf("done: %+v %v", e, ok)
	}
	e, ok = parseEvent("Respec: failed: the unspent skill points are still 0. Nothing is tried again for this build.")
	if !ok || e.Kind != "respec" || e.Name != "Respec failed" {
		t.Errorf("failed: %+v %v", e, ok)
	}
}

func TestParseEventGold(t *testing.T) {
	e, ok := parseEvent("Gold: gave 800 gold to Xena.")
	if !ok || e.Kind != "gold" || e.Name != "Gold Shared" || e.Detail != "800 gold to Xena" {
		t.Errorf("gave: %+v %v", e, ok)
	}
	e, ok = parseEvent("Gold: received 1600 gold.")
	if !ok || e.Kind != "gold" || e.Name != "Gold Received" || e.Detail != "1600 gold from the team" {
		t.Errorf("received: %+v %v", e, ok)
	}
}

func TestParseEventGrail(t *testing.T) {
	e, ok := parseEvent("Grail: Congratulations! You are 47% complete on your Holy Grail quest.")
	if !ok || e.Kind != "grail" || e.Name != "Holy Grail" || e.Detail != "47% complete" || e.Key != "grail:Congratulations! You are 47% complete on your Holy Grail quest." {
		t.Errorf("grail: %+v %v", e, ok)
	}
	e, ok = parseEvent("Grail: something else about the Holy Grail")
	if !ok || e.Detail != "something else about the Holy Grail" {
		t.Errorf("a line without a percentage is shown as it is: %+v %v", e, ok)
	}
}

func TestIdentifiedTextReachesAnEarlierPickup(t *testing.T) {
	m := &Manager{states: map[string]*State{}}
	// the pickup entry (an unidentified charm: no stats yet), 5 minutes ago
	m.events = append(m.events, ActivityEvent{Time: time.Now().Add(-5 * time.Minute), Bot: "Xena", Kind: "item", Name: "Large Charm", Desc: "Large Charm"})
	m.noteItemDesc("Xena", `{"title":"Kept Large Charm","description":"Large Charm\n+1 Skill Tab\n+30 To Life"}`)
	if got := m.events[0].Desc; got != "Large Charm\n+1 Skill Tab\n+30 To Life" {
		t.Errorf("the identified stats must reach the earlier entry: %q", got)
	}
	// a shorter or equal text never replaces a fuller one
	m.noteItemDesc("Xena", `{"title":"Kept Large Charm","description":"Large Charm"}`)
	if len(m.events[0].Desc) < 20 {
		t.Error("a poorer text replaced the stats")
	}
	// another bot's entry is left alone
	m.events = append(m.events, ActivityEvent{Time: time.Now(), Bot: "Sankt", Kind: "item", Name: "Large Charm", Desc: "Large Charm"})
	m.noteItemDesc("Xena", `{"title":"Kept Large Charm","description":"Large Charm\n+1 Skill Tab\n+30 To Life\nmore"}`)
	if m.events[1].Desc != "Large Charm" {
		t.Error("Sankt's entry must not get Xena's stats")
	}
}

func TestParseEventSold(t *testing.T) {
	e, ok := parseEvent("Sold Ring for 412 gold.")
	if !ok || e.Kind != "sale" || e.Name != "Ring" || e.Detail != "412 gold" {
		t.Errorf("sold: %+v %v", e, ok)
	}
	e, ok = parseEvent("Sold Large Charm for 0 gold.")
	if !ok || e.Name != "Large Charm" || e.Detail != "sold" {
		t.Errorf("a sale the bot could not price: %+v %v", e, ok)
	}
	e, ok = parseEvent("Sold Razor Bow (x) for 1155 gold (no keep rule).")
	if !ok || e.Name != "Razor Bow (x)" || e.Detail != "1155 gold · no keep rule" {
		t.Errorf("a sale with its reason: %+v %v", e, ok)
	}
}

func TestQuestLine(t *testing.T) {
	if q, ok := questLine(`Quester: working on "Khalim's Will"`); !ok || q != "Act 3: Khalim's Will" {
		t.Errorf("working on: %q %v", q, ok)
	}
	if q, ok := questLine(`Quester: done with "Khalim's Will"`); !ok || q != "" {
		t.Errorf("done with: %q %v", q, ok)
	}
	if _, ok := questLine("Quester: quest skipped: Den of Evil"); ok {
		t.Error("another Quester line is not a quest line")
	}
}

func TestQuestPickup(t *testing.T) {
	ev, ok := parseEvent("Picked up Khalim's Eye (ilvl 1)")
	if !ok || ev.Kind != "questpick" || ev.Name != "Khalim's Eye" {
		t.Errorf("got %+v %v", ev, ok)
	}
	// the raw D2BS line has the item's colour code after "Picked up " (gold looks like a unique): still a quest item (Sankt's Cube, 2026-11-14 10:58)
	for _, mark := range []string{"\xef\xbf\xbd", "\xff", "\xc3\xbf"} {
		ev, ok = parseEvent("Picked up " + mark + "c4Horadric Cube (ilvl 13) (Quest.nip #12)")
		if !ok || ev.Kind != "questpick" || ev.Name != "Horadric Cube" {
			t.Errorf("coloured line with %q: %+v %v", mark, ev, ok)
		}
	}
	if ev, ok := parseEvent("Picked up Greater Healing Potion (ilvl 1) (Potions.nip #14)"); ok && ev.Kind == "questpick" {
		t.Error("a potion is not a quest item")
	}
}

func TestTeamGaveUp(t *testing.T) {
	for line, who := range map[string]string{
		"Team: not waiting any longer for Barabas":                              "Barabas",
		"Team: not waiting any longer in town for Barabas, Sankt: leaving.":     "Barabas, Sankt",
		"Party: not waiting any longer for Sankt to go back out.":               "Sankt",
		"Team: not waiting any longer for Barabas to go out through my portal.": "Barabas",
	} {
		ev, ok := parseEvent(line)
		if !ok || ev.Kind != "regroup" || ev.Name != "Party Regroup" || ev.Detail != "waiting for "+who {
			t.Errorf("%q: %+v %v", line, ev, ok)
		}
	}
	if _, ok := parseEvent("Team: waiting in town until Barabas are ready: we leave together."); ok {
		t.Error("a wait in progress is not an event")
	}
}

// A "Stashed" line has only the name: the entry gets the stats of the same bot's pickup of that item (the user, 2026-11-14: a ring "picked up keeper" had its
// stats, the later "stashed" entry did not).
func TestStashEntryGetsPickupStats(t *testing.T) {
	m := &Manager{}
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Xena", Kind: "item", Name: "Ring", Quality: "rare", Ilvl: 40, Detail: "Keeper"})
	m.noteItemDesc("Xena", `{"title":"Kept Dread Turn Ring","description":"Ring\n+20 to Life\n+15 to Dexterity"}`)
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Sankt", Kind: "item", Name: "Ring", Desc: "another bot's ring"})
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Xena", Kind: "stash", Name: "Ring", Quality: "normal", Detail: "Stashed"})
	if ev := m.recentEvents(10); len(ev) != 1 {
		t.Fatalf("pickups are not shown, only the stash entry: %+v", ev)
	}
	got := m.recentEvents(1)[0]
	if got.Kind != "stash" || got.Desc != "Ring\n+20 to Life\n+15 to Dexterity" || got.Title != "Kept Dread Turn Ring" || got.Quality != "rare" || got.Ilvl != 40 {
		t.Fatalf("stash entry = %+v", got)
	}
}

// Stats that arrive after the stash (identified in town later) reach the stash entry too.
func TestLateKeptStatsReachStashEntry(t *testing.T) {
	m := &Manager{}
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Xena", Kind: "item", Name: "Grand Charm", Desc: "Grand Charm"})
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Xena", Kind: "stash", Name: "Grand Charm", Detail: "Stashed"})
	m.noteItemDesc("Xena", `{"title":"Kept Grand Charm","description":"Grand Charm\n+1 to Fire Skills"}`)
	if ev := m.events; ev[1].Desc != "Grand Charm\n+1 to Fire Skills" || ev[0].Desc != "Grand Charm\n+1 to Fire Skills" {
		t.Fatalf("stash %q, pickup %q", ev[1].Desc, ev[0].Desc)
	}
}

// A sale entry gets the stats of the item's pickup too.
func TestSaleEntryGetsPickupStats(t *testing.T) {
	m := &Manager{}
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Sankt", Kind: "item", Name: "Light Crossbow", Desc: "Light Crossbow\n+10 to Dexterity"})
	m.addEvent(ActivityEvent{Time: time.Now(), Bot: "Sankt", Kind: "sale", Name: "Light Crossbow", Detail: "401 gold"})
	ev := m.recentEvents(10)
	if len(ev) != 1 || ev[0].Kind != "sale" || ev[0].Desc != "Light Crossbow\n+10 to Dexterity" {
		t.Fatalf("%+v", ev)
	}
}

func TestParseEventQuickSelf(t *testing.T) {
	e, ok := parseEvent("QuickTravel: opened my own portal to pit: calling the team")
	if !ok || e.Kind != "quicktravel" || e.Name != "Quick Travel" || !strings.HasSuffix(e.Detail, "own portal") {
		t.Errorf("own portal: %+v %v", e, ok)
	}
}

func TestParseEventRunDone(t *testing.T) {
	e, ok := parseEvent("Run done: Pit in 254 s")
	if !ok || e.Kind != "run" || e.Name != "The Pit" || e.Detail != "4:14" {
		t.Errorf("run done: %+v %v", e, ok)
	}
	if _, ok := parseEvent("Run done: ForceSave in 15 s"); ok {
		t.Error("ForceSave is not a farm run: no card")
	}
}

// TestCubeEvent: every item the Horadric Cube makes is one "Cube: <item>" line (Cubing.doCubing, Quester.cubeAndCreate) and one Activity card.
func TestCubeEvent(t *testing.T) {
	for _, c := range []struct{ line, name string }{{"Cube: Horadric Staff", "Horadric Staff"}, {"\xffc4Cube: Ist Rune", "Ist Rune"}, {"Cube: Khalim's Will", "Khalim's Will"}} {
		ev, ok := parseEvent(c.line)
		if !ok || ev.Kind != "cube" || ev.Name != c.name {
			t.Errorf("%q: got %+v %v", c.line, ev, ok)
		}
	}
	if _, ok := parseEvent("Cubing: Transmuting: Ral Rune + Ral Rune + Ral Rune"); ok {
		t.Error("the old Cubing line must not make a card")
	}
}

// TestChatHidesDeposit: chat starting with "/" or "." (game and mod commands) is not speech and stays out of the Activity chat box.
func TestChatHidesDeposit(t *testing.T) {
	m := &Manager{}
	m.addChat("Meir", ".deposit")
	m.addChat("Meir", "!.deposit")
	m.addChat("Meir", ".reset skills")
	m.addChat("Meir", "/save")
	m.addChat("Meir", "We are long past any aid.")
	if c := m.recentChat(10); len(c) != 1 || c[0].Text != "We are long past any aid." {
		t.Errorf("chat: %+v", c)
	}
}

// The bot's own "Cube: moved N item(s) from my pack into my cube" is storage, not a made item, and gets no Activity card (the user, 2026-11-16).
func TestCubeStorageLineIsNotAnActivityCard(t *testing.T) {
	if ev, ok := parseEvent("Cube: moved 2 item(s) from my pack into my cube to make room (the town trip waits until the cube is full too)."); ok {
		t.Errorf("the cube storage line made an Activity entry: %+v", ev)
	}
	if ev, ok := parseEvent("Cube: Rune Upgrade"); !ok || ev.Kind != "cube" {
		t.Errorf("a real cube recipe must still make a card: %+v ok=%v", ev, ok)
	}
}

// Quick Travel places are written with capitals (the user, 2026-11-16: "write the names of the locations properly").
func TestQuickPlaceIsWrittenProperly(t *testing.T) {
	for in, want := range map[string]string{"andy": "Andariel", "deadhalls": "Halls of the Dead", "clawviper": "Claw Viper Temple", "tal rasha's tomb": "Tal Rasha's Tomb", "durance of hate": "Durance of Hate"} {
		if got := quickPlace(in); got != want {
			t.Errorf("quickPlace(%q) = %q, want %q", in, got, want)
		}
	}
}

// A bot with no room in its pack or its cube raises the red box; it does not stop the team (the user, 2026-11-16).
func TestPackFullIsARedBox(t *testing.T) {
	title, msg, ok := packFullFromLog("Meir", "Pack: FULL: no room in the pack and none in the cube: Meir cannot pick up anything, not even Heavy Crossbow.")
	if !ok || title != "Meir's pack and cube are full" || msg == "" {
		t.Fatalf("got %q %q %v", title, msg, ok)
	}
	if _, _, ok := packFullFromLog("Meir", "Not enough room for Heavy Crossbow"); ok {
		t.Error("a single item that does not fit is not the red box")
	}
}

// A bot whose pack is full and that puts things in its cube raises the yellow notice, not the red box (the user, 2026-11-16).
func TestFullInventoryIsAYellowNotice(t *testing.T) {
	kind, title, msg, ok := noticeFromLog("Meir", "Pack: NOTICE: Meir has a full inventory: items go into the cube, are not identified, and all go to the stash.")
	if !ok || kind != "fullpack" || title != "Meir has a full inventory" || msg == "" {
		t.Fatalf("got %q %q %q %v", kind, title, msg, ok)
	}
	if _, _, ok := packFullFromLog("Meir", "Pack: NOTICE: Meir has a full inventory: x"); ok {
		t.Error("the notice is not the red box")
	}
}

// No clear 2x4 space in the pack is a yellow notice too (the user, 2026-11-16).
func TestBigSpaceIsAYellowNotice(t *testing.T) {
	kind, title, msg, ok := noticeFromLog("Meir", "Pack: NOTICE: no clear 2x4 space in the pack: Meir cannot pick up the biggest items.")
	if !ok || kind != "bigspace" || title != "Meir has no clear 2x4 space in its pack" || msg == "" {
		t.Fatalf("got %q %q %q %v", kind, title, msg, ok)
	}
}
