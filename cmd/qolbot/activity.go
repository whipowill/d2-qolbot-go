package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// What a bot prints is written for the log, not for the Status tab. friendlyActivity turns the lines that mean something into a
// plain sentence and drops the rest (config dumps, retries, NIP loading ...). parseEvent finds the lines that go in the Activity list:
// items picked up, bosses killed and quests completed.

var (
	reTeamWait       = regexp.MustCompile(`^Waiting for my team: \d+ of \d+ in the game(?: \(not yet: (.+)\))?\.?$`)
	reRespecDone     = regexp.MustCompile(`^Respec: done, (\d+) skill points to spend \(were (\d+)\)`)
	reRespecFail     = regexp.MustCompile(`^Respec: failed`)
	reGoldGave       = regexp.MustCompile(`^Gold: gave (\d+) gold to (.+?)\.?$`)
	reGoldGot        = regexp.MustCompile(`^Gold: received (\d+) gold\.?$`)
	reSold           = regexp.MustCompile(`^Sold (.+) for (\d+) gold(?: \(([^)]+)\))?\.?$`)
	reGrail          = regexp.MustCompile(`^Grail: (.+)$`)
	rePercent        = regexp.MustCompile(`(\d+(?:\.\d+)?)\s*%`)
	reRegroup        = regexp.MustCompile(`^The team is split up \((.*) apart, regroup no\. (\d+)\)`)
	reQuickTravel    = regexp.MustCompile(`^took (.+?)'s portal to (\S+)`)
	reQuickSelf      = regexp.MustCompile(`^opened my own portal to (\S+?):`)       // a Sorceress leader's own Quick Travel (QuickTravel.selfTrip)
	reRunDone        = regexp.MustCompile(`^Run done: (\w+) in (\d+) s$`)           // Loader.js: a script of the run list returned (a farm run finished)
	reWaypointPortal = regexp.MustCompile(`^took (.+?)'s portal to waypoint (.+)$`) // a waypoint helper's portal to the waypoint of an area (QuickTravel.waypoint)
	reWPShared       = regexp.MustCompile(`^Waypoints synced \((\d+) of (\d+)\)(?: with (.*))?`)
	reWPInSync       = regexp.MustCompile(`^all in sync \((.*)\)`)
	reWaypoint       = regexp.MustCompile(`^Waypoint collected: (.+)$`)
	reKilled         = regexp.MustCompile(`^Killed (.+?)(?: \((.+?)\))?(?: \[(\d+)\])?$`)
	reQuestDone      = regexp.MustCompile(`Act (\d) - #\d+ - "(.+)" is complete\.?`)
	reQuestItem      = regexp.MustCompile(`^used the (.+?) \(unspent skill points (\d+) -> (\d+), stat points (\d+) -> (\d+)\)`)
	reQuestItemNo    = regexp.MustCompile(`^the (.+?) would not be used`)
	// a quest item picked up (the Pickit line "Picked up Khalim's Eye (ilvl 1)"): the parts of Khalim's Will, the Horadric Staff pieces, the Jade Figurine ...
	// the team sync gave up waiting for somebody (Team.js, PartySync.js): "Team: not waiting any longer in town for Barabas: leaving."
	reTeamGaveUp = regexp.MustCompile(`^(?:(?:Team|Party): )?not waiting any longer (?:in town )?for ([A-Za-z0-9_, ]+?)(?: to go (?:back )?out(?: through my portal)?)?(?::.*|\.)?$`)
	reQuestPick  = regexp.MustCompile(`^Picked up (Khalim's (?:Eye|Brain|Heart|Flail|Will)|Jade Figurine|A Jade Figurine|The Golden Bird|Potion of Life|Lam Esen's Tome|Horadric Scroll|Horadric Cube|Shaft of the Horadric Staff|Top of the Horadric Staff|Viper Amulet|Horadric Staff|Book of Skill|Scroll of Inifuss|Scroll of Resistance|Malah's Potion|Hell Forge Hammer|Hellforge Hammer|Mephisto's Soulstone|Mephisto's Soul Stone|Gidbinn|The Gidbinn|Wirt's Leg|Staff of Kings|Amulet of the Viper|Hand of Hratli|Hratli's Hand) \(ilvl`)
	// the lines a bot prints about what it is doing right now (Pather, Attack and Town print them as they happen)
	reDirect    = regexp.MustCompile(`^(Going back to town|Traveling( to .+)?|Taking waypoint to .+|Taking portal|Engaging .+|Talking to .+|Opening the stash|Fighting demons|Waiting for leader)$`)
	reHiredMerc = regexp.MustCompile(`^Hired merc (.+): (\S+) for (\d+) gold$`) // MercHire.js: the merc's name, its kind id (a1-fire) or "unknown", the cost
	// an item the Horadric Cube made (the user, 2026-11-15: "when anything is made -- Cube: ____"): Cubing.doCubing's recipes and
	// Quester.cubeAndCreate's quest items (the Horadric Staff, Khalim's Will)
	reCubed    = regexp.MustCompile(`^Cube: (.+)$`)
	reEquipped = regexp.MustCompile(`^Equipped (.+?) \(gear upgrade\)$|^Equipped (.+) on the mercenary$`)
	reLevel    = regexp.MustCompile(`^Leveled up to level (\d+)$`)
	reStats    = regexp.MustCompile(`^AutoStat: Using (\d+) stat points? in (.+)$`)
	reSkillPt  = regexp.MustCompile(`^AutoSkill: Using skill point in Skill: (.+?) ID: \d+$`)
	reSentence = regexp.MustCompile(`^[A-Z][^:]* [^:]*[.!?]$`)
	// the only script sentences that are statuses: whom the bot follows or looks for. Anything else a script says (drinking a
	// potion, taking an item out of the stash, using a quest scroll ...) is too small to show.
	reKeepSentence = regexp.MustCompile(`^(Following |Searching for )`)
	reParen        = regexp.MustCompile(`\s*\([^)]*\)`)
)

// stripPrefixes removes the logging prefixes the scripts add.
// logSources are the scripts that write their own log lines under their own name (libs/common/Report.js: "Quester: ...", "Team: ...").
// "AutoSpec (quiet): " is how older logs show a routine chat line the player had switched off.
var logSources = []string{"AutoSpec", "Quester", "QuestItems", "Follower", "Team", "Chores", "Pack", "Town", "Pickit", "Saver", "QuickTravel", "Waypoints", "Layout"}

func stripPrefixes(text string) string {
	if strings.HasPrefix(text, "AutoSpec (quiet): ") {
		return strings.TrimPrefix(text, "AutoSpec (quiet): ")
	}
	for _, src := range logSources {
		if p := src + ": "; strings.HasPrefix(text, p) {
			return strings.TrimPrefix(text, p)
		}
	}
	return strings.TrimPrefix(text, "SAY: ")
}

// townZones are the five towns (the area names the bots report).
var townZones = map[string]bool{"Rogue Encampment": true, "Lut Gholein": true, "Kurast Docks": true, "The Pandemonium Fortress": true, "Harrogath": true}

// staleStatus says a status can no longer be true for a bot in this zone: it cannot be waiting for a portal out in the field.
func staleStatus(status, zone string) bool {
	return status == "Waiting for a portal" && zone != "" && !townZones[zone]
}

// menuActivity is the status for what a starter script says it is doing at the menu ("" when it is not one of the three that matter).
func menuActivity(info string) string {
	switch info {
	case "Join Game":
		return "Joining game"
	case "Create Game":
		return "Creating game"
	case "Select Difficulty":
		return "Choosing difficulty"
	}
	return ""
}

// scriptLabel is how a script is described to the user.
func scriptLabel(name string) string {
	switch name {
	case "Follower":
		return "Following the leader"
	case "Questing":
		return "Embarking on quest"
	case "ForceSave":
		return "Saving the character"
	}
	for _, f := range farmAll {
		if f.Name == name {
			return "Traveling to " + f.Label
		}
	}
	return "Running " + name
}

// friendlyActivity returns the status for a line, or false when the line says nothing a person wants to read. A status is what the bot
// is doing right now: traveling, taking a waypoint or a portal, fighting, engaging a boss, talking to an NPC, opening the stash, waiting
// or following. They change every few seconds. Everything that happened (kills, quests, level-ups, points spent, gear put on) is an
// Activity entry (parseEvent), not a status.
func friendlyActivity(text string) (string, bool) {
	if quietLine(text) {
		return "", false
	}
	if sc := scriptStarted(text); sc != "" {
		return scriptLabel(sc), true
	}
	t := stripPrefixes(text)
	if reTeamWait.MatchString(t) {
		return "Waiting on teammates", true
	}
	if strings.HasPrefix(t, "the whole team is here") {
		return "Team is here", true
	}
	if strings.HasPrefix(t, "Questing: no quest is left") { // the leader finished every quest of this difficulty and now waits
		return "No quests left on this difficulty", true
	}
	if strings.HasPrefix(t, "I cannot reach you") || strings.HasPrefix(t, "I cannot find thee") || strings.HasPrefix(t, "Thou art beyond my reach") { // (the phrasings of Speech.js) // the chat line a follower sends the leader (or the player)
		return "Waiting for a portal", true
	}
	if reDirect.MatchString(t) {
		return t, true
	}
	if reSentence.MatchString(t) { // the scripts' own sentences, without the final full stop
		t = strings.TrimRight(t, ".!?")
		if t == "Detected hostile monsters" { // Attack.js: monsters that attack the bot while it clears
			return "Fighting demons", true
		}
		if reKeepSentence.MatchString(t) {
			return strings.TrimSpace(reParen.ReplaceAllString(t, "")), true
		}
	}
	return "", false
}

// pickupReason says why a bot picked an item up, from the pickit line named at the end of its "Picked up" message. Potions, and items taken
// only as possible upgrades (no line), are left out: an upgrade is reported when the bot actually puts it on.
func pickupReason(line string) string {
	switch {
	case strings.Contains(line, "Potions.nip"):
		return ""
	case strings.Contains(line, "Quest.nip"):
		return "Quest item"
	case strings.Contains(line, "Generated.nip"):
		return "Keeper"
	case strings.Contains(line, "merc.nip"):
		return "Upgrade"
	case strings.Contains(line, "gear.nip"), strings.Contains(line, "melee.nip"), strings.Contains(line, "caster.nip"): // the last two: older logs
		return "Upgrade"
	}
	return ""
}

// parseEvent finds the lines that belong in the Activity list: boss kills, quests, gear put on, and items kept for a reason.
func parseEvent(text string) (ActivityEvent, bool) {
	if it, ok := parseStashed(text); ok {
		return it, true
	}
	// a wait of the team sync that ran its time (the user, 2026-11-14: "in theory I should never see [gave up waiting]. it should just say party regroup"):
	// every such wait ends in the regroup step (a regroup trip in the field; in town, where the team is already safe, the mates are told again to go out
	// together), so it is shown as one
	if mm := reTeamGaveUp.FindStringSubmatch(stripPrefixes(stripColors(text))); mm != nil {
		return ActivityEvent{Kind: "regroup", Name: "Party Regroup", Detail: "waiting for " + mm[1]}, true
	}
	if mm := reQuestPick.FindStringSubmatch(stripPrefixes(stripColors(text))); mm != nil { // before parsePicked: a quest item has no pickit reason and would be dropped there
		return ActivityEvent{Kind: "questpick", Name: mm[1]}, true
	}
	// not "Cube: moved N item(s) from my pack into my cube to make room ...": that is the bot using the cube as storage (Item.cubeForRoom), not an item the cube made (the
	// user, 2026-11-16: "remove the 'moved from cube' alerts on activity log")
	if mm := reCubed.FindStringSubmatch(stripPrefixes(stripColors(text))); mm != nil && !strings.HasPrefix(mm[1], "moved ") {
		return ActivityEvent{Kind: "cube", Name: strings.TrimSpace(mm[1])}, true
	}
	if it, ok := parsePicked(text); ok {
		why := pickupReason(it.Detail)
		if why == "" {
			return ActivityEvent{}, false
		}
		it.Detail = why
		return it, true
	}
	t := stripPrefixes(text)
	if mm := reLevel.FindStringSubmatch(t); mm != nil {
		return ActivityEvent{Kind: "level", Name: mm[1]}, true
	}
	if mm := reRespecDone.FindStringSubmatch(t); mm != nil { // Respec.js: the skill points were taken back through PlugY (Auto Respec)
		return ActivityEvent{Kind: "respec", Name: "Respec", Detail: mm[1] + " skill points to spend again"}, true
	}
	if mm := reSold.FindStringSubmatch(t); mm != nil { // Town.clearInventory: an item went to a vendor ("Sold Ring for 412 gold.")
		detail := mm[2] + " gold"
		if mm[2] == "0" { // the gold had not been counted yet when the bot looked
			detail = "sold"
		}
		if mm[3] != "" { // why it was sold (Town.js: "a sell rule", "no keep rule", "too dear to repair")
			detail += " · " + mm[3]
		}
		return ActivityEvent{Kind: "sale", Name: mm[1], Detail: detail}, true
	}
	if mm := reGrail.FindStringSubmatch(t); mm != nil { // Quartermaster.js: a line the mod put in the chat about the Holy Grail quest; every bot in the game hears it, so one key
		detail := shorten(mm[1], 160)
		if pm := rePercent.FindStringSubmatch(mm[1]); pm != nil { // "Congratulations! You are 47% complete on your Holy Grail quest."
			detail = pm[1] + "% complete"
		}
		return ActivityEvent{Kind: "grail", Name: "Holy Grail", Detail: detail, Key: "grail:" + mm[1]}, true
	}
	if mm := reGoldGave.FindStringSubmatch(t); mm != nil { // Gold.js: a bot gave gold to a teammate who asked
		return ActivityEvent{Kind: "gold", Name: "Gold Shared", Detail: mm[1] + " gold to " + mm[2]}, true
	}
	if mm := reGoldGot.FindStringSubmatch(t); mm != nil {
		return ActivityEvent{Kind: "gold", Name: "Gold Received", Detail: mm[1] + " gold from the team"}, true
	}
	if reRespecFail.MatchString(t) {
		return ActivityEvent{Kind: "respec", Name: "Respec failed", Detail: "the skill points are still spent"}, true
	}
	if mm := reRegroup.FindStringSubmatch(t); mm != nil { // Team.regroup: the leader brings the party together in town
		return ActivityEvent{Kind: "regroup", Name: "Party Regroup", Detail: mm[1] + " apart \u00b7 no. " + mm[2]}, true
	}
	if mm := reWaypointPortal.FindStringSubmatch(t); mm != nil {
		return ActivityEvent{Kind: "quicktravel", Name: "Waypoint Portal", Detail: properName(mm[2]) + " \u00b7 " + mm[1] + "'s portal"}, true
	}
	if mm := reRunDone.FindStringSubmatch(t); mm != nil {
		name := ""
		for _, f := range farmAll {
			if f.Name == mm[1] {
				name = f.Label
			}
		}
		if name == "" { // not a farm run (ForceSave at the start of a game): no card
			return ActivityEvent{}, false
		}
		secs, _ := strconv.Atoi(mm[2])
		return ActivityEvent{Kind: "run", Name: name, Detail: fmt.Sprintf("%d:%02d", secs/60, secs%60)}, true
	}
	if mm := reQuickSelf.FindStringSubmatch(t); mm != nil {
		return ActivityEvent{Kind: "quicktravel", Name: "Quick Travel", Detail: quickPlace(mm[1]) + " \u00b7 own portal"}, true
	}
	if mm := reQuickTravel.FindStringSubmatch(t); mm != nil { // QuickTravel.portal: the leader took a Sorceress's portal instead of walking
		return ActivityEvent{Kind: "quicktravel", Name: "Quick Travel", Detail: quickPlace(mm[2]) + " \u00b7 " + mm[1] + "'s portal"}, true
	}
	if mm := reWPShared.FindStringSubmatch(t); mm != nil { // Waypoints.sync at the start of a game
		d := mm[1] + " of " + mm[2] + " shared"
		if mm[3] != "" {
			d += " \u00b7 " + mm[3] // everybody in the party, not only the leader
		}
		return ActivityEvent{Kind: "waypointsync", Name: "Waypoints Shared", Detail: d}, true
	}
	if mm := reWPInSync.FindStringSubmatch(t); mm != nil {
		return ActivityEvent{Kind: "waypointsync", Name: "Waypoints In Sync", Detail: mm[1]}, true // the whole party
	}
	if mm := reWaypoint.FindStringSubmatch(t); mm != nil { // Pather.getWP: a waypoint the character did not have before
		return ActivityEvent{Kind: "waypoint", Name: "Waypoint Collected", Detail: mm[1]}, true
	}
	if t == "Going gambling" {
		return ActivityEvent{Kind: "gamble", Name: "Gambled"}, true
	}
	if strings.HasPrefix(t, "Healed at the town healer") {
		return ActivityEvent{Kind: "heal", Name: "Healed"}, true
	}
	if mm := reStats.FindStringSubmatch(text); mm != nil {
		return ActivityEvent{Kind: "stat", Name: mm[2], Detail: mm[1]}, true
	}
	if mm := reSkillPt.FindStringSubmatch(text); mm != nil {
		return ActivityEvent{Kind: "skill", Name: mm[1]}, true
	}
	if mm := reKilled.FindStringSubmatch(t); mm != nil {
		ev := ActivityEvent{Kind: "kill", Name: mm[1], Detail: mm[2]}
		if mm[3] != "" {
			ev.Key = "k" + mm[3]
		}
		return ev, true
	}
	if mm := reQuestDone.FindStringSubmatch(t); mm != nil {
		return ActivityEvent{Kind: "quest", Name: mm[2], Detail: "Act " + mm[1]}, true
	}
	if mm := reQuestItem.FindStringSubmatch(t); mm != nil { // a Book of Skill, Potion of Life, Scroll of Resistance used up: what it gave
		var gave []string
		if a, b := atoiSafe(mm[2]), atoiSafe(mm[3]); b != a {
			gave = append(gave, "skill points "+mm[2]+" to "+mm[3])
		}
		if a, b := atoiSafe(mm[4]), atoiSafe(mm[5]); b != a {
			gave = append(gave, "stat points "+mm[4]+" to "+mm[5])
		}
		return ActivityEvent{Kind: "questitem", Name: mm[1], Detail: strings.Join(gave, ", ")}, true
	}
	if mm := reQuestItemNo.FindStringSubmatch(t); mm != nil {
		return ActivityEvent{Kind: "questitem", Name: mm[1], Detail: "could not be used"}, true
	}
	if mm := reHiredMerc.FindStringSubmatch(t); mm != nil { // the kind id is shown as its label by the page (mercLabel)
		return ActivityEvent{Kind: "merc", Name: strings.TrimSpace(mm[1]), Detail: mm[2], Count: atoiSafe(mm[3])}, true
	}
	if mm := reEquipped.FindStringSubmatch(t); mm != nil {
		// Detail says who wears it: "Upgrade" the bot, "Mercenary" its merc (the user, 2026-11-14: equip entries "don't say what the item was or who it
		// was put on"). The name can start with a space (a colour code the bot's log dropped).
		if mm[1] != "" {
			return ActivityEvent{Kind: "equip", Name: strings.TrimSpace(mm[1]), Detail: "Upgrade"}, true
		}
		return ActivityEvent{Kind: "equip", Name: strings.TrimSpace(mm[2]), Detail: "Mercenary"}, true
	}
	return ActivityEvent{}, false
}

func atoiSafe(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for ; n > 0; n /= 10 {
		b = append([]byte{byte('0' + n%10)}, b...)
	}
	return string(b)
}

// quickPlace is the name of a Quick Travel place as the bots ask for it ("andy"), written out with capitals (the user, 2026-11-16: "in the activity log quick travel,
// write the names of the locations properly"). A place that is not in the table gets capitals on each word.
func quickPlace(p string) string {
	names := map[string]string{"andy": "Andariel", "andariel": "Andariel", "countess": "The Countess", "pit": "The Pit", "mausoleum": "The Mausoleum",
		"radament": "Radament", "at": "Ancient Tunnels", "tunnels": "Ancient Tunnels", "summoner": "The Summoner", "duriel": "Duriel", "ft": "Forgotten Temple",
		"kt": "Forgotten Temple", "temple": "Forgotten Temple", "meph": "Mephisto", "mephisto": "Mephisto", "diablo": "Diablo", "halls": "Nihlathak",
		"nihlathak": "Nihlathak", "baal": "Baal", "izual": "Izual", "hephasto": "Hephasto the Armorer", "forge": "Hell's Forge", "deadhalls": "Halls of the Dead",
		"spidercavern": "Spider Cavern", "flayerdungeon": "Flayer Dungeon", "sewers": "Sewers", "chaos": "Chaos Sanctuary", "corpsefire": "Den of Evil",
		"bloodraven": "Blood Raven", "malus": "Barracks", "maggotlair": "Maggot Lair", "clawviper": "Claw Viper Temple", "gidbinn": "Flayer Jungle",
		"anya": "Frozen River", "ancients": "Arreat Summit", "durance": "Durance of Hate"}
	if n, ok := names[strings.ToLower(p)]; ok {
		return n
	}
	return properName(p)
}

// properName writes a name of a person or a place with a capital on each word; small joining words stay low ("Halls of the Dead", "tal rasha's tomb" -> "Tal Rasha's Tomb").
func properName(s string) string {
	small := map[string]bool{"of": true, "the": true, "and": true, "in": true, "to": true, "a": true, "on": true}
	words := strings.Split(s, " ")
	for i, w := range words {
		if w == "" || (i > 0 && small[w]) {
			continue
		}
		words[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	return strings.Join(words, " ")
}

// questLine reads the Quester's "working on" and "done with" lines: the title of the quest being worked on, or "" once it is done.
func questLine(text string) (string, bool) {
	const on, off = `Quester: working on "`, `Quester: done with "`
	switch {
	case strings.HasPrefix(text, on) && strings.HasSuffix(text, `"`):
		return questWithAct(strings.TrimSuffix(strings.TrimPrefix(text, on), `"`)), true
	case strings.HasPrefix(text, off) && strings.HasSuffix(text, `"`):
		return "", true
	}
	return "", false
}

// questWithAct is "Act 3: The Guardian" for a quest title of the quest table (the title alone when the table does not know it).
func questWithAct(title string) string {
	for _, q := range questAll {
		if q.Title == title {
			return fmt.Sprintf("Act %d: %s", q.Act, title)
		}
	}
	return title
}
