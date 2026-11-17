/**
*	@filename	Qol.js
*	@desc		Everything the bots ask of the QOL mod (qol.dll), in one place (the user, 2026-11-16: "for functions that use Plugy, QOL.dll, or Quartermaster.dll put those in
*	            separate classes so they can be controlled"). Settings, Game, "Using QOL?" (plan.qol, Config.UsesQol) switches it all: with it off none of the commands
*	            sends anything, the mercenary options below are off, and each command says so once in the log.
*
*	            What QOL gives the bots: the chat commands ".reset stats" and ".reset skills" (every point is unspent again: Respec), and two mercenary options from qol.ini
*	            [mercenary]: equip=1 (mercs take more weapon kinds: Item.mercWeapons) and drop_items=1 (a replaced merc drops its gear instead of the game destroying
*	            it: MercHire). The Quartermaster mod (.deposit) is another dll and has its own file (Quartermaster.js); PlugY's commands are in PlugY.js.
*/

var Qol = {
	said: {},

	// "Using QOL?" (AutoSpec sets Config.UsesQol from the plan)
	enabled: function () {
		if (typeof Config === "object" && Config.hasOwnProperty("UsesQol")) {
			return !!Config.UsesQol;
		}

		return !!(typeof Plan === "object" && Plan.get() && Plan.get().qol);
	},

	off: function (what) {
		if (!this.said[what]) {
			this.said[what] = true;
			print("QOL: " + what + " is not sent: \"Using QOL?\" is off.");
		}

		return false;
	},

	// ".reset stats": every stat point goes back to be spent again, the stats are the class's base
	resetStats: function () {
		if (!this.enabled()) {
			return this.off(".reset stats");
		}

		say(".reset stats");

		return true;
	},

	// ".reset skills": every skill point goes back to be spent again
	resetSkills: function () {
		if (!this.enabled()) {
			return this.off(".reset skills");
		}

		say(".reset skills");

		return true;
	},

	// the mercenary options of qol.ini (the plan has them from the file; they count only with "Using QOL?" on)
	mercEquip: function (fromPlan) {
		return this.enabled() && !!fromPlan;
	},

	mercDropOnHire: function (fromPlan) {
		return this.enabled() && !!fromPlan;
	}
};
