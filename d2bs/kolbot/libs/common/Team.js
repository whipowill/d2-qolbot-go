/**
*	@filename	Team.js
*	@desc		The leader and its team: waiting for the team before a run, noticing that it has been split up, and getting everybody together in town.
*/

include("json2.js");
include("common/Report.js");

var Team = {

	// Who the leader should have with it: every bot Qolbot started (data/bots.json) except this one. "team" is who the Start button started it with
	// (known before they have joined), "bots" is every bot running now.
	expected: function () {
		var bj;

		try {
			if (FileTools.exists("data/bots.json")) {
				bj = JSON.parse(FileTools.readText("data/bots.json"));

				return (bj.team || []).concat(bj.bots || []).filter(function (n, k, all) { return n !== me.name && all.indexOf(n) === k; });
			}
		} catch (readError) {
			print("Team: cannot read the team list: " + readError);
		}

		return [];
	},

	// name -> area of everybody in the game (0 while somebody is loading a new area)
	areas: function () {
		var res = {}, p = getParty();

		if (p) {
			do {
				res[p.name] = p.area;
			} while (p.getNext());
		}

		return res;
	},

	// The Sorceresses Qolbot started that are in the game right now (data/bots.json "sorcs"), in name order. Every bot computes the same list.
	sorcs: function () {
		var info, areas = this.areas();

		try {
			info = JSON.parse(FileTools.readText("data/bots.json"));
		} catch (e) {
			return [];
		}

		return (info.sorcs || []).filter(function (n) { return areas[n] !== undefined; }).sort();
	},

	// The one Sorceress that answers a request for a portal ("portal andy" in chat, no name): the first one by name. Every bot works out the same
	// answer, so only she goes, and nobody has to say who.
	chosenSorc: function () {
		return this.sorcs()[0] || null;
	},

	apartSince: {},
	lastRegroup: 0,

	// The team members that have not been in my area for at least ms milliseconds. Somebody loading a new area (area 0) or who is not in the
	// game at all is not counted: the first is a moment, the second is not a separation (Team.wait deals with the ones that never came).
	separated: function (ms) {
		var names = this.expected(), areas = this.areas(), now = Date.now(), out = [], i, a;

		for (i = 0; i < names.length; i += 1) {
			a = areas[names[i]];

			if (a === undefined || a === 0 || a === me.area) {
				delete this.apartSince[names[i]];

				continue;
			}

			this.apartSince[names[i]] = this.apartSince[names[i]] || now;

			if (now - this.apartSince[names[i]] >= ms) {
				out.push(names[i]);
			}
		}

		return out;
	},

	// The team is split up: the leader goes to town, where everybody is safe, waits (up to 90 s) for the others to gather there (they follow the
	// leader to town by themselves), and goes back out through its own portal; they follow it out. Nobody walks off alone.
	regroup: function () {
		var area = me.area, start = Date.now(), names, areas, here, i;

		this.lastRegroup = start;
		this.apartSince = {};
		Report.note("Team", "The team is split up. Going to town so we all meet.");
		Town.goToTown();

		for (;;) {
			names = this.expected();
			areas = this.areas();
			here = 0;

			for (i = 0; i < names.length; i += 1) {
				if (areas[names[i]] === undefined || areas[names[i]] === me.area) {
					here += 1; // not in the game at all: nothing to wait for
				}
			}

			if (here === names.length) {
				break;
			}

			if (Date.now() - start > 90000) {
				Report.problem("Team", "Not everybody came to town within 90 seconds. Going on.");

				break;
			}

			delay(1000);
		}

		Town.move("portalspot");

		if (!Pather.usePortal(area, me.name)) {
			throw new Error("Team.regroup: failed to go back out of town");
		}

		return true;
	},

	// A leader bot waits for its team before it starts the run: every bot qolbot started (data/bots.json) has to be in the game,
	// and then in the leader's party. Bots that never show up are given up on after a while, and the leader says who is missing.
	wait: function () {
		var start = Date.now(), said = 0, who, now, expected, missing, i, mine, inParty, inGame,
			gameLimit = 240000, partyLimit = 45000, allInAt = 0;

		who = function () { // name -> party id
			var res = {}, p = getParty();

			if (p) {
				do {
					res[p.name] = p.partyid;
				} while (p.getNext());
			}

			return res;
		};

		for (;;) {
			expected = this.expected();

			if (!expected.length) {
				return true; // nobody to wait for
			}

			now = who();

			mine = now[me.name];
			missing = [];
			inGame = 0;
			inParty = 0;

			for (i = 0; i < expected.length; i += 1) {
				if (now[expected[i]] !== undefined) {
					inGame += 1;

					if (mine !== undefined && mine !== 65535 && now[expected[i]] === mine) {
						inParty += 1;
					}
				} else {
					missing.push(expected[i]);
				}
			}

			if (inGame === expected.length) {
				allInAt = allInAt || Date.now();

				if (inParty === expected.length) {
					print("Team: the whole team is here (" + expected.join(", ") + ")");

					return true;
				}

				if (Date.now() - allInAt > partyLimit) {
					Report.problem("Team", "Starting with " + (expected.length - inParty) + " of the team not in my party yet.");

					return false;
				}
			} else if (Date.now() - start > gameLimit) {
				Report.problem("Team", "Starting without " + missing.join(", ") + ": they did not join in " + Math.round(gameLimit / 60000) + " minutes.");

				return false;
			}

			if (Date.now() - said > 30000) {
				said = Date.now();
				Report.note("Team", "Waiting for my team: " + inGame + " of " + expected.length + " in the game" + (missing.length ? " (not yet: " + missing.join(", ") + ")" : "") + ".");
			}

			delay(1000);
		}
	}
};
