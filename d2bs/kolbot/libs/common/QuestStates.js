/**
*	@filename	QuestStates.js
*	@desc		A record of the states of every quest, for building the stage table (which NPC a bot must talk to, and when). The user, 2026-11-16: "what would be ideal is if
*	            each quest knew how far into the quest they were and which npcs they need to talk to and when", "start keeping a lot of states and let's try to make this perfect".
*
*	            One line is written whenever something changed since the last one: any of the sixteen bits of any quest of the character (ids 0 to 40, the difficulty it plays),
*	            or the quest items in the pack. Each line carries the reason, the NPC talked to last, the area and the difficulty. Where: data/queststates.<profile>.log, and the
*	            bot's own log as "QuestStates: ...". It only records. Nothing in the bots reads it, so it cannot change what they do. UNTESTED in a game.
*
*	            A line: <time> | diff <d> | area <a> | <why> | npc <name> | <quest id>: <bits before> > <bits after>, ... | items <class ids>
*	            The bits are written bit 0 first, as in the Quester's "quest N bits (0-15)" lines.
*/

var QuestStates = {
	last: null,       // quest id -> bits string, from the last record
	lastItems: "",
	lastAt: 0,        // when the game was last asked for a fresh copy of the quest data
	npc: "",          // the quest NPC talked to last
	maxId: 40,

	// the sixteen bits of each quest
	read: function () {
		var out = {}, id, i, bits;

		for (id = 0; id <= this.maxId; id += 1) {
			bits = "";

			for (i = 0; i < 16; i += 1) {
				bits += me.getQuest(id, i) ? "1" : "0";
			}

			out[id] = bits;
		}

		return out;
	},

	// the quest items in the pack, by class id (item type 39 is the quests' own)
	items: function () {
		var list = [], all = me.getItems() || [], i;

		for (i = 0; i < all.length; i += 1) {
			if (all[i].itemType === 39) {
				list.push(all[i].classid);
			}
		}

		return list.sort(function (a, b) { return a - b; }).join(",");
	},

	// Look at the states and write a line when something changed. why = what the bot was doing, npc = the NPC it just talked to (optional), fresh = ask the game for a
	// fresh copy of the quest data first (at most every 3 seconds). Returns true when a line was written.
	snapshot: function (why, npc, fresh) {
		var now, items, changes = [], id, line, first = !this.last;

		try {
			if (!me.gameReady) {
				return false;
			}

			if (fresh && Date.now() - this.lastAt > 3000) {
				this.lastAt = Date.now();
				sendPacket(1, 0x40);
				delay(400);
			}

			if (npc) {
				this.npc = npc;
			}

			now = this.read();
			items = this.items();

			for (id = 0; id <= this.maxId; id += 1) {
				if (first ? now[id].indexOf("1") > -1 : now[id] !== this.last[id]) {
					changes.push(id + ": " + (first ? "" : this.last[id] + " > ") + now[id]);
				}
			}

			if (!changes.length && items === this.lastItems) {
				return false;
			}

			line = new Date().toTimeString().slice(0, 8) + " | diff " + me.diff + " | area " + me.area + " | " + why + " | npc " + (this.npc || "-") + " | " +
				changes.join(", ") + " | items " + (items || "-");

			this.last = now;
			this.lastItems = items;
			FileTools.appendText("data/queststates." + me.profile + ".log", line + "\n");
			print("QuestStates: " + line);

			return true;
		} catch (e) {
			print("QuestStates: " + e);

			return false;
		}
	}
};
