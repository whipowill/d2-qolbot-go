package main

import (
	"regexp"
	"strings"
)

// What a bot prints is written for the log, not for the Status tab. friendlyActivity turns the lines that mean something into a
// plain sentence and drops the rest (config dumps, retries, NIP loading ...). parseEvent finds the lines that go in the Activity list:
// items picked up, bosses killed and quests completed.

var (
	reTeamWait    = regexp.MustCompile(`^Waiting for my team: \d+ of \d+ in the game(?: \(not yet: (.+)\))?\.?$`)
	reKilled      = regexp.MustCompile(`^Killed (.+?)(?: \((.+?)\))?(?: \[(\d+)\])?$`)
	reQuestDone   = regexp.MustCompile(`Act (\d) - #\d+ - "(.+)" is complete\.?`)
	reQuestItem   = regexp.MustCompile(`^used the (.+?) \(unspent skill points (\d+) -> (\d+), stat points (\d+) -> (\d+)\)`)
	reQuestItemNo = regexp.MustCompile(`^the (.+?) would not be used`)
	// the lines a bot prints about what it is doing right now (Pather, Attack and Town print them as they happen)
	reDirect   = regexp.MustCompile(`^(Going back to town|Traveling( to .+)?|Taking waypoint to .+|Taking portal|Engaging .+|Talking to .+|Opening the stash|Fighting demons|Waiting for leader)$`)
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
var logSources = []string{"AutoSpec", "Quester", "QuestItems", "Follower", "Team", "Chores", "Pack", "Town", "Pickit", "Saver", "QuickTravel"}

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
	if strings.HasPrefix(t, "I cannot reach you") { // the chat line a follower sends the leader (or the player)
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
	case strings.Contains(line, "melee.nip"), strings.Contains(line, "caster.nip"):
		return "Upgrade"
	}
	return ""
}

// parseEvent finds the lines that belong in the Activity list: boss kills, quests, gear put on, and items kept for a reason.
func parseEvent(text string) (ActivityEvent, bool) {
	if it, ok := parseStashed(text); ok {
		return it, true
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
	if mm := reEquipped.FindStringSubmatch(t); mm != nil {
		if mm[1] != "" {
			return ActivityEvent{Kind: "equip", Name: mm[1], Detail: "Upgrade"}, true
		}
		return ActivityEvent{Kind: "equip", Name: mm[2], Detail: "Upgrade"}, true
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
