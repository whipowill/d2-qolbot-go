/**
*	@filename	QuestNpcs.js
*	@desc		Quest NPC visits: who in town has a reward waiting, talking to them, using what they hand over. Added to the Quester by Quester.js.
*
*	A bot talks to a town's quest NPCs only when something is waiting for it, and talks as often as
*	the NPC needs: some hand out an item on every further talk (Malah, Alkor, ...) and that item must be used before
*	the next talk. "Waiting" means the quest's "reward pending" bit (getQuest(id, 1)) is set while its "reward granted"
*	bit (getQuest(id, 0)) is not, or the bot carries an item that an NPC wants.
*/

// [act, quest id, title, NPCs that can hand the reward out (tried in order), the player must choose an item?]: from QuestTable.json
Quester.npcQuests = QuestTable.npcQuests();

// [item class id, NPC who wants it, what it is, act, true = he gives something back only after a wait]
Quester.npcItems = [
	[524, "akara", "Scroll of Inifuss", 1],
	[548, "alkor", "Lam Esen's Tome", 3],
	[546, "meshif", "Jade Figurine", 3],
	[547, "alkor", "The Golden Bird", 3, true] // Alkor takes a few seconds to brew the Potion of Life: come back to him
];

Quester.permissions = {}; // "p1" ...: a talk that only has to happen once per game (Jerhyn), done

Quester.questTries = {}; // quest id -> how many times this game the bot went to an NPC for it (no endless loops)

Quester.manualSaid = {}; // quest id -> already written to the log (the bots do not say it in chat: only you can pick that reward)

// is a reward waiting for this quest?
Quester.questPending = function (id) {
	try {
		return !!me.getQuest(id, 1) && !me.getQuest(id, 0);
	} catch (e) {
		return false;
	}
};

// the first copy of an item in the inventory (not stash, not worn), or null
Quester.invItem = function (classid) {
	return QuestItems.find(classid);
};

// Who should I talk to in this town? Returns {talks: [{npc, why, quests}], manual: [titles]}. refresh = ask the server first.
Quester.questNpcPlan = function (refresh) {
	var plan = {talks: [], manual: []}, byNpc = {}, i, j, e, npc, add;

	if (refresh) {
		sendPacket(1, 0x40);
		delay(500);
	}

	add = function (name, why, quest) {
		if (!byNpc[name]) {
			byNpc[name] = {npc: name, why: why, quests: []};
			plan.talks.push(byNpc[name]);
		}

		if (quest) {
			byNpc[name].quests.push(quest);
		}
	};

	for (i = 0; i < this.npcQuests.length; i += 1) {
		e = this.npcQuests[i];

		if (e[0] !== me.act || !this.questPending(e[1])) {
			continue;
		}

		if (e[4]) {
			plan.manual.push(e);

			continue;
		}

		if ((this.questTries[e[1]] || 0) >= 2) {
			continue;
		}

		for (j = 0; j < e[3].length; j += 1) {
			add(e[3][j], e[2], e[1]);
		}
	}

	// The guards of the Harem let nobody into the palace until Jerhyn has been talked to once Radament's Lair is done: without it every walk to the Palace
	// Cellar and the Arcane Sanctuary stops at the Harem (found 2026-11-12: "move retry 3" in Harem Level 2, and Meir's portals to those places were refused).
	// Every bot talks to him once per game, the leader's quest script too (act2_arcane_sanctuary).
	if (me.act === 2 && !this.permissions.p1 && me.getQuest(9, 0) && !me.getQuest(12, 0)) {
		add("jerhyn", "Jerhyn's permission for the Harem", "p1");
	}

	for (i = 0; i < this.npcItems.length; i += 1) {
		e = this.npcItems[i];

		if (e[3] === me.act && this.invItem(e[0]) && (this.questTries["i" + e[0]] || 0) < 2) {
			add(e[1], e[2], "i" + e[0]);

			if (e[4]) {
				byNpc[e[1]].expect = true;
			}
		}
	}

	return plan;
};

// is there anything for a quest NPC to do right now? (used by the town chore check)
Quester.questNpcPending = function (refresh) {
	var i, plan;

	if (!me.inTown) {
		return false;
	}

	if (QuestItems.hasConsumable()) {
		return true;
	}

	plan = this.questNpcPlan(refresh);

	return plan.talks.length > 0;
};

// A talk with a quest NPC, with the quests' states recorded before it and after it (QuestStates), so that the record shows what each NPC changed
Quester.talkToQuestNpc = function (name) {
	var talked;

	QuestStates.snapshot("before talking to " + name, "", false);
	talked = this.talkToQuestNpcRun(name);
	QuestStates.snapshot("after talking to " + name, name, true);

	return talked;
};

Quester.talkToQuestNpcRun = function (name) {
	var npc = getUnit(1, name);

	if (!npc) {
		Town.move(name);
		npc = getUnit(1, name);
	}

	if (!npc && (name === "jerhyn" || name === "kaelan")) {
		Town.move("palace");
		npc = getUnit(1, name);
	}

	// Deckard Cain is "Deckard Cain" in the game (the name "cain" finds nobody) and Town.js's Act 4 "cain" spot is Tyrael's: look him up by his class id
	// (245, as ActTravel and Quester.cainSoulstone do), near the stash in the Pandemonium Fortress (Darius, Hell's Forge hand-in: "quest NPC cain not found",
	// live 2026-11-14 13:28:56)
	if (!npc && name === "cain") {
		npc = getUnit(1, 245) || getUnit(1, "deckardcain") || getUnit(1, "deckard cain");

		if (!npc && me.act === 4) {
			Town.move("stash");
			npc = getUnit(1, 245);
		}
	}

	if (!npc) {
		return false;
	}

	if (getDistance(me, npc) > 5) {
		Pather.moveToUnit(npc);
	}

	print("Talking to " + npc.name);

	if (!npc.openMenu()) {
		me.cancel();

		return false;
	}

	delay(1200);
	me.cancel();
	delay(300);

	return true;
};

// Go through everything a town's quest NPCs have for this bot. Returns the number of conversations held.
Quester.questNpcs = function () {
	var plan, talked = 0, i, j, t, round, used, before, after, pendingNow, heldNow, pass, passTalked, handed, rewarded, idle, heldBefore, others, self = this;

	if (!me.inTown) {
		return 0;
	}

	pendingNow = function (self, t) {
		var any = false, q;

		for (q = 0; q < t.quests.length; q += 1) {
			if (typeof t.quests[q] === "string" && t.quests[q].charAt(0) === "p") { // a talk that must happen once
				if (!self.permissions[t.quests[q]]) {
					any = true;
				}
			} else if (typeof t.quests[q] === "number" ? self.questPending(t.quests[q]) : self.invItem(parseInt(String(t.quests[q]).substr(1), 10))) {
				any = true;
			}
		}

		return any;
	};

	heldNow = function (self, t) { // an item this NPC wants is in the inventory
		var q;

		for (q = 0; q < t.quests.length; q += 1) {
			if (typeof t.quests[q] === "string" && self.invItem(parseInt(t.quests[q].substr(1), 10))) {
				return true;
			}
		}

		return false;
	};

	// a talk can hand over something that sends me to another NPC (Meshif's bird goes to Alkor): look again afterwards
	for (pass = 0; pass < 3; pass += 1) {
		QuestItems.useAll(); // something handed over earlier and not used yet
		plan = this.questNpcPlan(true);
		passTalked = 0;

		for (i = 0; i < plan.manual.length; i += 1) {
			if (!this.manualSaid[plan.manual[i][1]]) {
				this.manualSaid[plan.manual[i][1]] = true;
				print("Quester: a reward is waiting for \"" + plan.manual[i][2] + "\" (" + plan.manual[i][3][0] + "), but I cannot choose the item: talk to them yourself.");
			}
		}

		for (i = 0; i < plan.talks.length; i += 1) {
			t = plan.talks[i];

			if (!pendingNow(this, t)) { // an earlier NPC in this list already took care of it
				continue;
			}

			for (j = 0; j < t.quests.length; j += 1) {
				this.questTries[t.quests[j]] = (this.questTries[t.quests[j]] || 0) + 1;
			}

			QuestItems.makeRoom(2, 2); // what the NPC hands over (a scroll, a potion) needs room in the pack

			this.note("Talking to " + t.npc + " (" + t.why + ").");

			handed = false;
			rewarded = false;
			idle = 0;

			// Another NPC of the list still has something pending: a round that changes nothing sends me on to him at once. The waiting rounds ("come back later") are for the last
			// NPC only (the user, 2026-11-16, about Malah's three useless rounds: "you can optimize that if you can detect which npc they need to talk to"). UNTESTED in a game.
			others = plan.talks.slice(i + 1).some(function (o) { return pendingNow(self, o); });

			for (round = 0; round < 8; round += 1) {
				before = pendingNow(this, t);
				heldBefore = heldNow(this, t);

				if (!this.talkToQuestNpc(t.npc)) {
					print("Quester: quest NPC " + t.npc + " not found");

					break;
				}

				for (j = 0; j < t.quests.length; j += 1) {
					if (typeof t.quests[j] === "string" && t.quests[j].charAt(0) === "p") {
						this.permissions[t.quests[j]] = true;
					}
				}

				talked += 1;
				passTalked += 1;
				used = QuestItems.useAll(); // handed over items are used before the next talk
				sendPacket(1, 0x40);
				delay(500);
				after = pendingNow(this, t);
				handed = handed || (heldBefore && !heldNow(this, t));
				rewarded = rewarded || used > 0;
				print("Quester: quest talk " + t.npc + " round " + (round + 1) + ": pending " + before + " -> " + after + ", items used " + used + ", handed in " + handed);

				if (used > 0) {
					idle = 0;

					continue; // he gave me something: talk again, he may have more
				}

				if (!after && !(t.expect && handed && !rewarded)) {
					break; // done
				}

				// nothing came back yet: some NPCs say "come back later" and need a few seconds
				idle += 1;

				if (idle > (t.expect && handed ? 6 : others ? 0 : 2)) {
					break;
				}

				delay(4000);
			}

			if (t.expect && handed && !rewarded) {
				this.problem(t.npc + " has not given me anything back yet (" + t.why + ").");
			} else if (!pendingNow(this, t)) {
				this.note(t.why + ": done.");
				Saver.soon("quest reward"); // a follower's quest is finished here, not by the Quester: save soon so that the Activity list and the Quest Progress sheet see it
			}
		}

		if (passTalked === 0) {
			break;
		}
	}

	QuestItems.useAll();

	return talked;
};

// Is there a quest of this town's act that this bot has not completed (so that talking to the quest NPCs here may move it on)? Used by Chores.needed
// ("quest talk") and by the Follower: EVERY bot does the town part of its quests whenever it is in town (user, 2026-11-13), not only the leader.
Quester.townQuestsAt = 0; // when the bot last ran the town part of its quests
Quester.townStartedOnly = false; // set by the Follower around runQuests(true): only quests that have started, see runQuests
Quester.pendingTalkAt = {}; // quest id -> when a follower last went to the NPC for its waiting reward
Quester.townQuestSeen = {}; // quest id -> the progress it had when the bot last talked for it (no second talk for the same state)

Quester.townQuestsOpen = function () {
	var i, row, progress, towns = [1, 40, 75, 103, 109];

	for (i = 0; i < this.quests.length; i += 1) {
		row = this.quests[i];

		if (towns[row[0] - 1] !== me.area || !this.actOpen(row[0]) || typeof this[row[4]] !== "function") {
			continue;
		}

		progress = this.getQuestProgress(row[3]);

		// Qolbot (2026-11-16, Hell's Forge): progress is only ever 0 or 100, so "started but not done" never matched and a follower in the town of a quest whose reward was
		// WAITING (bit 1 set: the leader's smash credited the whole team) never went to the NPC. A pending reward counts, once every two minutes (Follower.townQuestTalk stamps
		// pendingTalkAt): Barabas, Xena and Sankt stayed at 0010000000000010 for good while Darius handed in to Cain. UNTESTED in a game.
		if (progress <= 0 && !row[5] && this.questPending(row[3])) {
			if (Date.now() - (this.pendingTalkAt[row[3]] || 0) > 120000) {
				return true;
			}

			continue;
		}

		if (progress > 0 && progress < 100 && this.townQuestSeen[row[3]] !== progress && !(row[5] && this.questPending(row[3]))) {
			return true;
		}
	}

	return false;
};

