/**
*	@filename	Plan.js
*	@desc		The build plan Qolbot wrote for this character (data/<profile>.spec.json): what to spend points on, what to keep, how often
*				to save, what the objective is. AutoSpec applies it; Saver, Pack and AutoSkill read from it.
*/

include("json2.js");

var Plan = {

	cached: null,

	// the plan as it is on disk now, or null
	read: function () {
		try {
			return JSON.parse(FileTools.readText("data/" + me.profile + ".spec.json"));
		} catch (e) {
			return null;
		}
	},

	// the plan, read once per script (it does not change during a game); asked for again while there is none
	get: function () {
		return this.cached || (this.cached = this.read());
	}
};
