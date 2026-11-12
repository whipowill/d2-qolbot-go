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

Quester.talkToQuestNpc = function (name) {
	var npc = getUnit(1, name);

	if (!npc) {
		Town.move(name);
		npc = getUnit(1, name);
	}

	if (!npc && (name === "jerhyn" || name === "kaelan")) {
		Town.move("palace");
		npc = getUnit(1, name);
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
	var plan, talked = 0, i, j, t, round, used, before, after, pendingNow, heldNow, pass, passTalked, handed, rewarded, idle, heldBefore;

	if (!me.inTown) {
		return 0;
	}

	pendingNow = function (self, t) {
		var any = false, q;

		for (q = 0; q < t.quests.length; q += 1) {
			if (typeof t.quests[q] === "number" ? self.questPending(t.quests[q]) : self.invItem(parseInt(String(t.quests[q]).substr(1), 10))) {
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

			for (round = 0; round < 8; round += 1) {
				before = pendingNow(this, t);
				heldBefore = heldNow(this, t);

				if (!this.talkToQuestNpc(t.npc)) {
					print("Quester: quest NPC " + t.npc + " not found");

					break;
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

				if (idle > (t.expect && handed ? 6 : 2)) {
					break;
				}

				delay(4000);
			}

			if (t.expect && handed && !rewarded) {
				this.problem(t.npc + " has not given me anything back yet (" + t.why + ").");
			} else if (!pendingNow(this, t)) {
				this.note(t.why + ": done.");
			}
		}

		if (passTalked === 0) {
			break;
		}
	}

	QuestItems.useAll();

	return talked;
};
