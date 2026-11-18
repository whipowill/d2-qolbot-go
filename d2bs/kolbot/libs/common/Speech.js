/**
*	@filename	Speech.js
*	@desc		What the bots say in the PUBLIC chat, in the voice of the banter quotes (libs/config/Quotes): old-fashioned and a little grim.
*	            The bots do not coordinate in the public chat (the user, 2026-11-15: "make it so anything required for coordination purposes uses the
*	            internal chat, and make sure that internal chat uses keywords instead of full sentences"): they post keywords to each other through
*	            Team.post / Team.command / Team.take (data/<bot>.tmsg.json). What is said here is colour for the player, never read by a bot.
*	            Every phrase has at least three phrasings (the user: "for every public spoken phrase, make it so there are at least 3 variations"),
*	            checked by scripts/jstest/speech_test.js; docs/SPEECH.md lists them all (made by scripts/speechdoc.sh from this file).
*	              - ANSWERS (Speech.say): a keyword posted to the team, and one phrasing of it said.
*	              - REPORTS (Report.note / Report.problem, Speech.task / problem / reply): the log line stays plain, because Qolbot reads it, and
*	                the words said are dressed up by Speech.flavor. A report no rule knows gets one of three plain wrappers.
*	            When something is said: task words only with "Bots report when they engage in tasks" on (Config.QuietChat false), problems only
*	            with "Bots report when they have a problem" on (Config.QuietProblems false), replies to a player's own chat command always.
*/

var Speech = {
	// key: {w: the keyword posted to the team, kind: "task" or "problem" (which setting lets it be said), say: the phrasings ({n}: the argument)}
	answers: {
		// "announce": always said, over her head too, whatever "Bots report when they engage in tasks" says (the user, 2026-11-15: "still Meir is not reporting
		// when she drops portals for quick travel"): the team's sign that the way is open
		portalOpen: {w: "portalopen", kind: "announce", say: [
			"Behold, the portal stands open!",
			"The gate is open, good friends. Make haste!",
			"Hark! The way is open. Step through!"
		]},
		noPlace: {w: "noplace", kind: "problem", say: [
			"I know of no such place, my lord.",
			"That place is unknown to me.",
			"No map of mine shows such a place."
		]},
		noGet: {w: "noget", kind: "problem", say: [
			"Alas, I could not get there.",
			"The road was barred to me. I could not get there.",
			"I tried, but the way would not let me through."
		]},
		noQuick: {w: "noquick", kind: "problem", say: [
			"Alas, I have not the art to travel so swiftly.",
			"Such swift travel is beyond my craft.",
			"I cannot leap through the air as a sorceress does."
		]},
		needGold: {w: "needgold", kind: "problem", say: [
			"Good friends, can any spare me some gold? My purse is empty.",
			"My purse is light. Might one of you spare a little gold?",
			"I am near penniless. A few coins, if any can spare them?"
		]},
		cannotReach: {w: "cantreach", kind: "problem", say: [
			"I cannot find thee. Open a portal, or I shall bide in town.",
			"Thou art beyond my reach. Open a portal, or I shall wait here in town.",
			"I have lost thy trail. A portal, and I come; else I wait in town."
		]},
		hasWaypoint: {w: "haswp", kind: "task", say: [
			"Aye, I know the waypoint {n}.",
			"I have walked to waypoint {n} before.",
			"Waypoint {n}? I know the way."
		]}
	},

	pick: function (list) {
		return list[Math.floor(Math.random() * list.length)];
	},

	text: function (key, n) {
		return this.pick(this.answers[key].say).replace("{n}", n);
	},

	// the keyword of an answer (what a listener asks Team.take for)
	word: function (key) {
		return this.answers[key].w;
	},

	// is a kind of words to be said now?
	allowed: function (kind) {
		if (kind === "problem") {
			return !Config.QuietProblems;
		}

		if (kind === "task") {
			return !Config.QuietChat;
		}

		if (kind === "announce") {
			return true;
		}

		return this.fromLog ? !Config.QuietChat : true; // a reply to a player's own chat command is always said; to a bot's command, as a task
	},

	fromLog: false, // set by the Follower while it runs a command from the bots' message log

	// ANSWER: post the keyword to the team (to one bot, or "" for all), and say one phrasing when the settings let it be said
	say: function (key, n, to) {
		var a = this.answers[key];

		if (typeof Team === "object" && Team.post) {
			Team.post(a.w, n === undefined ? [] : [n], to || "");
		}

		if (this.allowed(a.kind)) {
			say((a.kind === "announce" ? "!" : "") + this.text(key, n));
		}
	},

	// say a report or a reply in chat, dressed up (the caller logs it if it should be logged)
	speak: function (message, kind) {
		var bubble = message.charAt(0) === "!"; // a leading "!" shows the words over the bot's head

		if (this.allowed(kind || "reply")) {
			say((bubble ? "!" : "") + this.flavor(bubble ? message.slice(1) : message));
		}
	},

	task: function (message) {
		this.speak(message, "task");
	},

	problem: function (message) {
		this.speak(message, "problem");
	},

	reply: function (message) {
		this.speak(message, "reply");
	},

	// REPORTS: [pattern, phrasings]; $1, $2 ... are the pieces of the report the pattern caught. At least three phrasings each.
	rules: [
		// quests and the team
		[/^Act (\d) - #(\d+) - "(.+)" is complete\.$/, [
			"The deed is done: $3. Let the bards take note!",
			"$3 is finished. One more tale for the fire.",
			"It is done, $3. May it be the first of many."
		]],
		[/^The team is split up.*$/, [
			"Where has our company strayed? To town, that we may gather!",
			"We are scattered. Come to town, all of you, and we shall go forth together.",
			"Our band is broken apart. Back to town, friends, and we regroup."
		]],
		[/^Not everybody came to town within 90 seconds\. Going on\.$/, [
			"Some tarry still. We go on without them.",
			"We have waited long enough. Onward, with or without the stragglers.",
			"The laggards must catch up as they can. We march."
		]],
		[/^Starting with (\d+) of the team not in my party yet\.$/, [
			"We set out, though $1 of us have not yet joined the party.",
			"$1 of our company stand outside the party still. We go regardless.",
			"Not all have taken my banner ($1 missing). We begin anyway."
		]],
		[/^Starting without (.+): they did not join in (\d+) minutes\.$/, [
			"We begin without $1. They kept us waiting $2 minutes.",
			"No more waiting for $1. We go.",
			"$1 never came. We set out without them."
		]],
		[/^Waiting for my team: (\d+) of (\d+) in the game.*\.$/, [
			"I await my company: $1 of $2 have come.",
			"$1 of $2 are here. I wait for the rest.",
			"Not all have arrived ($1 of $2). Patience."
		]],
		[/^Syncing the team's waypoints before we begin.*$/, [
			"Hear me! Before we begin, let us share what each of us knows of the waypoints.",
			"A moment, friends: we share our waypoints before we set out.",
			"First the waypoints: what one of us knows, all shall know."
		]],
		[/^all in sync \(.*\)$/, [
			"Our waypoints are all alike. We have nothing to share.",
			"We all know the same roads. Nothing to share.",
			"Every waypoint is known to all of us already."
		]],
		[/^Waypoints synced.*$/, [
			"The waypoints are shared among us. Onward!",
			"Now we all know the same roads. Let us go.",
			"The waypoints are shared. To the hunt!"
		]],

		// the follower's way
		[/^Ready\.$/, ["Ready and willing.", "At thy service.", "I am prepared."]],
		[/^Running town chores.*\.$/, [
			"A moment in town: there are errands to run.",
			"I must see to my errands before we leave.",
			"Business in town first: mending, potions, and the like."
		]],
		[/^Going outside( \(.*\))?\.$/, ["Forth we go!", "Into the wilds once more.", "Lead on, I follow."]],
		[/^Going to town( \(waypoint\))?\.$/, ["Back to town I go.", "To town, for a breath of safety.", "I return to town."]],
		[/^Going to town to meet up\.$/, ["I shall meet thee in town.", "To town, to find the others.", "I go to town to rejoin the company."]],
		[/^Going to (?:my )?leader's town\.$/, [
			"I go to the town where my leader waits.",
			"My leader is in another town. I follow.",
			"To my leader's town I go."
		]],
		[/^The leader is leaving for (.+): going with it\.$/, [
			"Our leader marches for $1. I go too.",
			"To $1, then. I am with thee.",
			"$1 it is. I follow."
		]],
		[/^The leader sends the team out first\.$/, [
			"Out we go first, as the leader bids.",
			"The leader holds the rear. We go ahead.",
			"As commanded: the company goes first."
		]],
		[/^Going to Mephisto's lair for the red portal to Act 4\.$/, [
			"To Mephisto's lair, for the red gate to Hell.",
			"I must pass the red portal myself. To the lair!",
			"The gate to the Pandemonium Fortress awaits me in the lair."
		]],
		[/^Searching for leader (.+)\.$/, ["Where is $1? I seek my leader.", "I look for $1.", "$1, where art thou?"]],
		[/^Searching for a player to follow\.$/, ["Whom shall I follow?", "I seek someone to follow.", "Who leads? I look for a leader."]],
		[/^Following (.+)\.$/, ["I follow $1.", "$1 leads, I follow.", "Lead on, $1."]],
		[/^Leader found\.$/, ["There thou art!", "I see my leader.", "Found thee. Lead on."]],
		[/^Leader not found\.$/, ["I cannot find my leader.", "My leader is nowhere to be seen.", "Where has my leader gone?"]],
		[/^Waypoint gathered\.$/, ["Another waypoint for the map.", "This waypoint is mine now.", "I have touched the waypoint."]],
		[/^Opening portal to the waypoint\.$/, ["A portal to the waypoint, coming up.", "I open the way to the waypoint.", "Through here to the waypoint!"]],
		[/^Opening portal to (.+)\.$/, ["I open a portal to $1.", "A gate to $1, a moment.", "The way to $1 opens shortly."]],
		[/^Reloading\.$/, ["I gather my wits a moment.", "A moment to set myself right.", "Let me begin again."]],
		[/^Picking items\.$/, ["Let me see what they dropped.", "Spoils!", "What treasures have we here?"]],
		[/^I'm alive!$/, ["I live yet!", "Death did not keep me.", "Back from the grave!"]],
		[/^Getting (.+)\.$/, ["I go for $1.", "Now to fetch $1.", "$1 shall be ours."]],
		[/^Making (.+)\.$/, ["Now to make $1.", "Into the cube: $1.", "I forge $1."]],
		[/^Equipping (.+)\.$/, ["I put on the $1.", "The $1 suits me better.", "A fine $1. It is mine now."]],
		[/^Used the (.+)\.$/, ["I have used the $1.", "The $1 is spent.", "The $1 has done its work."]],
		[/^Talking to (.+) \(.*\)\.$/, ["I must speak with $1.", "A word with $1.", "To $1, to talk."]],
		[/^(.+): done\.$/, ["$1: done.", "That is $1 taken care of.", "$1 is settled."]],
		[/^(.+) has not given me anything back yet \(.*\)\.$/, [
			"$1 has given me nothing yet.",
			"Still nothing from $1.",
			"$1 keeps me waiting."
		]],

		// the pack and the stash
		[/^No room to make way for the (.+) \(.+ is in the way\)\.$/, [
			"My pack is full to bursting. I can make no room for the $1.",
			"There is no space for the $1 in my pack.",
			"The $1 will not fit. My pack is crammed."
		]],
		[/^My pack is full\. Making room for a quest item\.$/, [
			"My pack is full. I shall clear a space for the prize.",
			"No room for the quest's prize: I make some.",
			"Something must go, to make room for what the quest gives."
		]],
		[/^I cannot make room for a quest item.*$/, [
			"My pack is full of things I must keep. I cannot take the quest's prize: clear some space for me.",
			"No room for the prize, and nothing I may throw away. Help me make space.",
			"I must keep all I carry, so the quest's prize has no place. Clear my pack, I pray."
		]],
		[/^I have (\d+) keeper\(s\) in my pack\. Moving them to my stash\.$/, [
			"I carry $1 treasures worth keeping. To the stash with them.",
			"$1 keepers in my pack. I stow them away.",
			"To the stash: $1 things worth keeping."
		]],
		[/^Done\. Moved (\d+) item\(s\) to my stash\.$/, ["Stowed $1 in the stash.", "$1 safely in the stash.", "The stash holds $1 more now."]],
		[/^I could only move (\d+) of (\d+) item\(s\) to my stash\.$/, [
			"Only $1 of $2 would fit in the stash.",
			"The stash took but $1 of $2.",
			"$1 of $2 stowed; the rest stays with me."
		]],
		[/^I could not open my stash.*$/, ["My stash will not open.", "The stash is shut to me.", "I cannot get at my stash."]],
		[/^My stash is full\. Adding a stash page\.$/, ["My stash is full: a new page.", "The stash overflows. Another page!", "No room left in the stash; I add a page."]],
		[/^I cannot do this: (.+)$/, ["I cannot do this: $1", "This is beyond me: $1", "I am stuck: $1"]],

		// trouble on the way
		[/^I cannot follow you to act (\d+): I have not unlocked it yet\.$/, [
			"I cannot follow thee to act $1. I have not earned the way there.",
			"Act $1 is closed to me still.",
			"The road to act $1 is barred to me."
		]],
		[/^I could not get to act (\d+) .*$/, ["I could not reach act $1.", "Act $1 eludes me.", "No road to act $1 would take me."]],
		[/^Act change failed\.$/, ["I could not change acts.", "The way to the next act failed me.", "No passage to the next act."]],
		[/^I keep going out and ending up back in town.*$/, [
			"Each time I go out I land back in town. I wait a minute: open a new portal, or say the word.",
			"The portal keeps spitting me back into town. A new portal, I beg thee.",
			"Out and back, out and back. I wait here: give me a fresh portal."
		]],
		[/^I cannot get to town: no portal and no town portal scroll\.$/, [
			"I have no scroll and no portal to town.",
			"No way back to town: my scrolls are gone.",
			"Without a scroll, the town is beyond me."
		]],
		[/^No TP scrolls or tomes\.$/, ["I have no scrolls of portal.", "My tome of portal is empty.", "Not one portal scroll left."]],
		[/^I am out of town portal scrolls\. Leaving the game to restock in town\.$/, [
			"My scrolls of portal are spent. I must go back to town and buy more.",
			"No portal scrolls left. I leave to restock.",
			"Out of scrolls. I must buy more before I go on."
		]],
		[/^I lost you: going to town to meet up\.$/, ["I have lost thee. To town, to find thee again.", "Thou art gone from my sight. I go to town to rejoin thee.", "I know not where thou art. To town I go, and meet thee there."]],
		[/^I am badly hurt\. Going to town to heal\.$/, ["I am sorely wounded. To the healer!", "Blood everywhere. I must be healed.", "Badly hurt: I go to town to mend."]],
		[/^Failed to use cow portal\.$/, ["The cow portal will not take me.", "I cannot enter the cow portal.", "The red portal to the cows refused me."]],
		[/^(.+): Error: (.+)$/, ["$1 went awry: $2", "Trouble with $1: $2", "$1 failed me: $2"]],
		[/^My objective is (.+) but there is nothing for me to run.*$/, [
			"My task is $1, but no runs were chosen for me. Choose them on the Bots tab.",
			"I am bid to $1, yet no runs are chosen. See the Bots tab.",
			"Nothing to run for $1: pick my runs on the Bots tab."
		]],
		[/^I could not take my (stat|skill) points back\.$/, [
			"My $1 points would not come back to me.",
			"I could not unlearn my $1 points.",
			"The $1 points stay where they are; I could not reset them."
		]],
		[/^Saving\.$/, ["Let me set down my deeds in the chronicle.", "A moment to record our deeds.", "I write this day into the chronicle."]],
		[/^Idle\.$/, ["There is naught left to do. I shall wait here.", "Nothing more for me. I wait.", "I stand idle, awaiting orders."]],

		// replies to a player's own chat commands
		[/^Teleport (on|off)\.$/, ["Teleport $1.", "Teleporting is $1.", "Very well: teleport $1."]],
		[/^Attack (on|off)\.$/, ["Attack $1.", "Fighting is $1.", "Very well: attack $1."]],
		[/^Resuming\.$/, ["Resuming.", "Onward again.", "Back to it."]],
		[/^Stopping\.$/, ["Stopping.", "I halt.", "I stand down."]],
		[/^Saved\.$/, ["Saved.", "It is written.", "The chronicle is up to date."]],
		[/^Active aura is: (\d+)$/, ["My aura is now $1.", "Aura $1.", "I wear aura $1."]],
		[/^Attack skill is: (\d+)$/, ["My attack is now $1.", "Attack skill $1.", "I fight with skill $1."]],
		[/^I don't have that (aura|skill)\.$/, ["I have no such $1.", "That $1 is not mine.", "I know no such $1."]],
		[/^Switching leader to (.+)\.$/, ["$1 leads now.", "I follow $1 from now on.", "My new leader is $1."]],
		[/^I'm not in town!$/, ["I am not in town!", "Not in town, I cannot.", "I must be in town for that."]],
		[/^No NPC name given\.$/, ["Talk to whom?", "Name the one I should speak with.", "Which townsfolk?"]],
		[/^(Invalid NPC|NPC not found)\.$/, ["I know no one by that name.", "I cannot find that one.", "No such person here."]],
		[/^Failed to move to town spot\.$/, ["I could not get there in town.", "The way across town is blocked.", "I cannot reach that spot."]],
		[/^Done talking\.$/, ["I have had my word.", "Done talking.", "The talk is over."]],

		// anything else: said as it is, or with one of two plain lead-ins (still three ways)
		[/^(.+)$/, ["$1", "Hear me: $1", "Mark this: $1"]]
	],

	// the words to say for a report: dressed up by the first rule that knows it
	// Names of people and places in a spoken line start with capitals (the user, 2026-11-16: "when the bots announce in chat they need to speak with an NPC, make sure that
	// name has proper capitalization", "same with when they mention locations"). The internal keys are lower case ("larzuk", "tal rasha's tomb"). Small joining words stay low.
	proper: function (s) {
		var small = {"of": 1, "the": 1, "and": 1, "in": 1, "to": 1, "a": 1, "on": 1};

		return String(s).replace(/(^|[\s\-(\/])([a-z])([a-z']*)/g, function (all, pre, first, rest, offset) {
			if (offset > 0 && small[first + rest]) {
				return all;
			}

			return pre + first.toUpperCase() + rest;
		});
	},

	// the rules whose pieces are names of people or places
	namesIn: /^(\^Searching for leader|\^Following|\^Opening portal to|\^Talking to|\^Switching leader to|\^The leader is leaving for)/,

	flavor: function (message) {
		var i, m, phrase, names;

		for (i = 0; i < this.rules.length; i += 1) {
			m = this.rules[i][0].exec(message);

			if (m) {
				phrase = this.pick(this.rules[i][1]);

				names = this.namesIn.test(this.rules[i][0].source);

				return phrase.replace(/\$(\d)/g, function (all, k) { var piece = m[parseInt(k, 10)] || ""; return names ? Speech.proper(piece) : piece; });
			}
		}

		return message;
	}
};
