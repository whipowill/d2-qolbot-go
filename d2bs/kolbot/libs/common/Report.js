/**
*	@filename	Report.js
*	@desc		How a script tells what it does: one line in the bot's log, written by the script itself under its own name
*				("Quester: ...", "QuestItems: ..."), and, when the player has not switched it off (Settings tab), the same words in game chat.
*				Qolbot reads the log lines for the Activity tab (cmd/qolbot/activity.go), so the Activity tab never depends on chat being on.
*
*				A script gets the three calls for its own name with Report.mixin(this, "Name"), then uses this.log / this.note / this.problem.
*/

include("common/Speech.js");

var Report = {

	// the log line only
	log: function (source, message) {
		print(source + ": " + message);
	},

	// routine news (talking to an NPC, a quest finished): logged always, said in chat unless the player switched task reports off
	note: function (source, message) {
		this.log(source, message);

		if (!Config.QuietChat) {
			say(Speech.flavor(message)); // the log line above stays plain: Qolbot reads it. The chat is the bots' voice.
		}
	},

	// a problem: logged always, said in chat unless the player switched problem reports off
	problem: function (source, message) {
		this.log(source, "problem: " + message);

		if (!Config.QuietProblems) {
			say(Speech.flavor(message));
		}
	},

	// A bot that is asked to do something it cannot must say so loudly, not carry on silently: it says it in chat, writes it to the log
	// and prints it to Qolbot's console in red.
	fail: function (source, message) {
		this.problem(source, "I cannot do this: " + message);
		this.log(source, "ERROR: " + message);
		D2Bot.printToConsole(me.name + ": " + message, 1);
	},

	// give a script (an object, or the "this" of a function script) log / note / problem under its own name
	mixin: function (target, source) {
		target.log = function (message) { Report.log(source, message); };
		target.note = function (message) { Report.note(source, message); };
		target.problem = function (message) { Report.problem(source, message); };

		return target;
	}
};
