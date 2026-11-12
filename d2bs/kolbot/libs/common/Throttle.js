/**
*	@filename	Throttle.js
*	@desc		Rate limits for work that runs in a tight loop: "due" is true at most once per period for each name.
*/

var Throttle = {

	timers: {},

	// true at most once per ms milliseconds for each name
	due: function (name, ms) {
		var now = Date.now();

		if (!this.timers[name] || now - this.timers[name] >= ms) {
			this.timers[name] = now;

			return true;
		}

		return false;
	},

	// make the next due(name) true at once
	reset: function (name) {
		delete this.timers[name];
	}
};
