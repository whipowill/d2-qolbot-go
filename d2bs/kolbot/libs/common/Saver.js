/**
*	@filename	Saver.js
*	@desc		Saving the character. A character is only written to disk when the game saves it: killing the game saves nothing, and leaving
*				a TCP/IP game with quit() (a chicken, the end of a run) does not save either (tested). PlugY's /save chat command does, so that
*				is what bots use. This module does only that: save now, save soon (for a reason), and save every few minutes.
*
*				The interval is the plan's "autoSaveMinutes" (the Settings tab, 0 = never), read from data/<profile>.spec.json. Each script or
*				thread that includes this has its own timers.
*
*				Who calls it: default.dbj (before Qolbot stops the bot), Follower.js and tools/AutoSaveThread.js (every few minutes),
*				Quester.js (a quest finished), QuestItems.js (a quest item used), tools/ToolsThread.js (a level up), Pack.js (items moved to the stash).
*/

include("OOG.js");
include("common/Plan.js");

var Saver = {

	lastSave: 0,
	lastSoon: 0,

	// how often to save, in minutes (0 = saving is switched off)
	minutes: function () {
		var plan = Plan.get();

		return plan && plan.autoSaveMinutes || 0;
	},

	// Save and wait for the file to be written (5 seconds). acknowledge = true when Qolbot asked for it because it is about to stop this bot.
	now: function (acknowledge) {
		say("/save");
		this.lastSave = Date.now();
		delay(5000);

		if (acknowledge) {
			D2Bot.saved();
		}

		return true;
	},

	// Save for a reason worth a save (a level up, a quest item used): it asks for the save and does not wait for the file, so the caller
	// is not held up. At most one every 15 seconds (levels can come in a row), and none when saving is switched off.
	soon: function (reason) {
		if (!this.minutes() || Date.now() - this.lastSoon < 15000) {
			return false;
		}

		print("Saver: saving the character (" + reason + ")");
		say("/save");
		this.lastSoon = this.lastSave = Date.now();

		return true;
	},

	// Called now and then from a loop: saves when the interval has passed since the last save.
	auto: function () {
		var minutes = this.minutes();

		if (!minutes) {
			return false;
		}

		if (!this.lastSave) {
			this.lastSave = Date.now();

			return false;
		}

		if (Date.now() - this.lastSave < minutes * 60000) {
			return false;
		}

		print("Saver: saving the character (every " + minutes + " min)");

		return this.now(false);
	}
};
