package main

import (
	"os"
	"time"
)

// With QOLBOT_DEV set, /api/state carries a "demo" block of made-up bots and activity so the Status tab can be styled without a game
// running. The page shows it instead of the real data; nothing here touches a real bot.
func devDemo() map[string]any {
	if os.Getenv("QOLBOT_DEV") == "" {
		return nil
	}
	now := time.Now()
	ago := func(s int) time.Time { return now.Add(-time.Duration(s) * time.Second) }
	cls := func(c string, l int) map[string]any { return map[string]any{"class": c, "level": l} }
	return map[string]any{
		"player": "Meir", "goal": "Farm", "playing": false,
		"cpu":      map[string]any{"percent": 7, "cores": 12},
		"profiles": demoBots(cls, ago),
		// one card of every kind the Activity list can show, newest first (items: one for each icon)
		"events": []map[string]any{
			{"time": ago(3), "bot": "Meir", "kind": "level", "name": "92"},
			{"time": ago(9), "bot": "Meir", "kind": "stat", "name": "Vitality", "detail": "5"},
			{"time": ago(14), "bot": "Meir", "kind": "kill", "name": "Baal", "detail": "The Worldstone Chamber"},
			{"time": ago(21), "bot": "Meir", "kind": "item", "name": "Harlequin Crest", "zone": "Throne Of Destruction", "ilvl": 85, "quality": "unique", "detail": "Keeper",
				"title": "Kept Shako", "desc": "\\xffc4Harlequin Crest\n\\xffc0Shako\n\\xffc3+2 To All Skills\n\\xffc3+2 To All Attributes\n\\xffc3Magic Find +50%\n\\xffc3Damage Reduced By 10%\n\\xffc3Defense: 141"},
			{"time": ago(16), "bot": "Reform", "kind": "kill", "name": "Champion Fallen Shaman", "detail": "Black Marsh"},
			{"time": ago(30), "bot": "Darius", "kind": "equip", "name": "Sash", "zone": "Harrogath", "detail": "Upgrade"},
			{"time": ago(38), "bot": "Darius", "kind": "item", "name": "Mage Plate", "zone": "Black Marsh", "ilvl": 84, "quality": "rare", "detail": "Upgrade",
				"title": "Kept Mage Plate", "desc": "\\xffc9Mage Plate\n\\xffc0Defense: 124\n\\xffc3+3 To Sorceress Skill Levels"},
			{"time": ago(47), "bot": "Darius", "kind": "skill", "name": "Zeal"},
			{"time": ago(58), "bot": "Xena", "kind": "quest", "name": "Sisters' Burial Grounds", "detail": "Act 1"},
			{"time": ago(70), "bot": "Meir", "kind": "item", "name": "Ist Rune", "zone": "Throne Of Destruction", "quality": "rune", "detail": "Keeper"},
			{"time": ago(82), "bot": "Meir", "kind": "item", "name": "Key of Terror", "zone": "Throne Of Destruction", "quality": "normal", "detail": "Keeper"},
			{"time": ago(95), "bot": "Meir", "kind": "item", "name": "Flawless Skull", "zone": "Black Marsh", "quality": "normal", "detail": "Keeper"},
			{"time": ago(108), "bot": "Meir", "kind": "item", "name": "Full Rejuvenation Potion", "zone": "Black Marsh", "quality": "potion", "detail": "Keeper"},
			{"time": ago(114), "bot": "Darius", "kind": "item", "name": "Buckler", "ilvl": 5, "quality": "set", "detail": "Keeper", "zone": "Black Marsh"},
			{"time": ago(100), "bot": "Darius", "kind": "stash", "name": "Buckler", "quality": "set", "zone": "Harrogath"},
			{"time": ago(120), "bot": "Darius", "kind": "item", "name": "Grand Charm", "zone": "Tamoe Highland", "ilvl": 91, "quality": "magic", "detail": "Keeper"},
			{"time": ago(140), "bot": "Xena", "kind": "chicken", "name": "Chickened", "detail": "Arreat Summit"},
			{"time": ago(160), "bot": "Darius", "kind": "heal", "name": "Healed", "detail": "Harrogath"},
			{"time": ago(185), "bot": "Xena", "kind": "death", "name": "Died", "detail": "Throne Of Destruction"},
			{"time": ago(205), "bot": "Roan", "kind": "connect", "name": "Connected"},
			{"time": ago(225), "bot": "Roan", "kind": "disconnect", "name": "Disconnected", "zone": "Black Marsh"},
			{"time": ago(210), "bot": "Darius", "kind": "gamble", "name": "Gambled", "detail": "Harrogath"},
			{"time": ago(240), "bot": "Meir", "kind": "problem", "name": "Script error: Pickit.js line 142: item is undefined"},
			{"time": ago(270), "bot": "Xena", "kind": "restart", "name": "Closed", "detail": "restarting, exit code 0xC0000005"},
		},
	}
}

// demoBots makes one bot for every status the bot cards can show (the icon table is actIcons in web/index.html).
func demoBots(cls func(string, int) map[string]any, ago func(int) time.Time) []map[string]any {
	rows := []struct {
		name, class            string
		level                  int
		zone, activity, status string
	}{
		{"Meir", "Sorceress", 91, "Throne Of Destruction", "Engaging Baal", "running"},
		{"Darius", "Paladin", 87, "Black Marsh", "Fighting demons", "running"},
		{"Xena", "Amazon", 76, "", "Waiting on teammates", "starting"},
		{"Reform", "Druid", 82, "Throne Of Destruction", "Following Meir", "running"},
		{"Kaela", "Necromancer", 79, "Harrogath", "Talking to Akara", "running"},
		{"Brin", "Barbarian", 74, "Harrogath", "Opening the stash", "running"},
		{"Sable", "Assassin", 71, "Harrogath", "Taking portal", "running"},
		{"Rook", "Barbarian", 69, "Rogue Encampment", "Taking waypoint to Black Marsh", "running"},
		{"Nyx", "Sorceress", 77, "Tamoe Highland", "Traveling", "running"},
		{"Orla", "Paladin", 73, "Cold Plains", "Traveling to Mausoleum", "running"},
		{"Tobin", "Druid", 70, "Rogue Encampment", "Waiting for a portal", "running"},
		{"Vera", "Necromancer", 75, "Black Marsh", "Embarking on quest", "running"},
		{"Ilsa", "Amazon", 72, "Harrogath", "Saving the character", "running"},
		{"Juno", "Druid", 63, "Harrogath", "Team is here", "running"},
		{"Fenn", "Paladin", 62, "Crystalline Passage", "Just arrived", "running"},
		{"Gale", "Sorceress", 61, "Rogue Encampment", "Searching for leader Darius", "running"},
		{"Wren", "Amazon", 64, "Tamoe Highland", "Going back to town", "running"},
		{"Marn", "Barbarian", 59, "Rogue Encampment", "Waiting for leader", "running"},
		{"Pia", "Assassin", 58, "Menu", "Disconnected", "running"},
		{"Roan", "Druid", 57, "Menu", "Joining game", "running"},
		{"Hale", "Necromancer", 60, "", "", "starting"},
	}
	var out []map[string]any
	for n, r := range rows {
		out = append(out, map[string]any{"name": r.name, "character": r.name, "status": r.status, "char": cls(r.class, r.level), "zone": r.zone, "activity": r.activity, "activityAt": ago(2 + n*3)})
	}
	return out
}
