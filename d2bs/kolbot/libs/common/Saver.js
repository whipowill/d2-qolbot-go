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
include("common/PlugY.js");

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
		PlugY.save();
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
		PlugY.save();
		this.lastSoon = this.lastSave = Date.now();

		return true;
	},

	// The "save before a chicken" setting (Settings, Saving; off by default): a bot that is about to leave a game in danger asks for a save first and
	// gives it about a second to start. Leaving the game does not save by itself, so without this everything since the last save is lost.
	beforeLeaving: function () {
		var plan = Plan.get();

		if (!plan || !plan.saveOnChicken || !this.minutes()) {
			return false;
		}

		print("Saver: saving the character before leaving (a chicken)");
		PlugY.save();
		this.lastSave = Date.now();
		delay(1200);

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
