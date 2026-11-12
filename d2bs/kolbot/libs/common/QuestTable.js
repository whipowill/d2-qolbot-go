/**
*	@filename	QuestTable.js
*	@desc		The quests of Diablo II as data: libs/common/QuestTable.json, the one table the Quester and Qolbot both read (see the "_about" in the file).
*				This file turns the rows into the shapes the Quester uses.
*/

include("json2.js");

var QuestTable = {

	rows: (function () {
		try {
			return JSON.parse(FileTools.readText("libs/common/QuestTable.json")).quests;
		} catch (e) {
			print("QuestTable: cannot read libs/common/QuestTable.json: " + e);

			return [];
		}
	}()),

	// the quests the Quester plays, in order: [act, number in the act, title, quest id, script, the player chooses the reward]
	playable: function () {
		return this.rows.filter(function (q) {
			return q.play !== false;
		}).map(function (q) {
			return [q.act, q.num, q.title, q.id, q.script, !!q.manual];
		});
	},

	// the quests an NPC can hand a reward out for: [act, quest id, title, NPCs in the order to try, the player chooses the reward]
	npcQuests: function () {
		return this.rows.filter(function (q) {
			return q.npcs && q.npcs.length;
		}).map(function (q) {
			return [q.act, q.id, q.title, q.npcs, !!q.manual];
		});
	},

	// the quests where the last step is a reward only the player can choose: their ids
	manualIds: function () {
		return this.rows.filter(function (q) {
			return q.manual;
		}).map(function (q) {
			return q.id;
		});
	}
};
