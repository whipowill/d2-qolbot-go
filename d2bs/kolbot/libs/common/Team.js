/**
*	@filename	Team.js
*	@desc		The leader and its team: waiting for the team before a run, noticing that it has been split up, and getting everybody together in town.
*/

include("json2.js");
include("common/Report.js");
include("common/Gold.js");
include("common/Plan.js");

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

	// ONE TABLE OF TIME LIMITS for every wait of the team sync (ms): a wait never holds the team longer than this, whatever script asks (docs/TEAM_SYNC.md).
	limits: {
		get gather() { return this.sync; }, // the one timer
		get boss() { return this.sync; }, // the one timer
		get far() { return this.sync; }, // the one timer
		get depart() { return this.sync; }, // the one timer
		// THE ONE TIMER (the user, 2026-11-15: "put a single timer of 30 on all these transition points", and "make the time limit that triggers a party
		// regroup a setting i control in settings -> safety"): Settings > Behavior > Auto Regroup, default 30 s. A wait at a transition (leaving town, an
		// exit, a boss, the portal back out, a regroup) that still has the party split after this long makes a party regroup in town; nobody goes on
		// alone. A mate that is safe in town and only slow is waited for without end.
		get sync() { return ((typeof Config === "object" && Config.RegroupSeconds) || 30) * 1000; },
		grace: 12000,       // the user, 2026-11-15: "bots always stick together, with maybe a 12 second grace period" (Team.waitToLeaveTown: one departure's retries)
		readyFor: 20000,    // a follower's "ready" is good this long (it says it again every few seconds while it waits)
		progress: 8,          // a late mate that came this many units closer, or changed area, in the last 30 s is on its way, not lost (no regroup for it)
		progressFor: 30000,
		leavingFor: 20000,    // a leader's "leaving" announcement is good this long (Team.leavingCall)
		get sendOut() { return this.sync; }, // the one timer
		act: 240000,        // arriving in a new act (Quester.waitForTeamInTown)
		close: 20000,       // while the leader walks (Team.keepClose): at most this long for a mate that has fallen behind, then no more waiting for 60 s
		closeDist: 40       // ... a mate in my area farther than this many units behind counts as fallen behind
	},

	// The leader bot of a bot-led run: the one with an objective and nobody to follow. Followers, a bot whose human plays and a lone bot never wait for anybody.
	isLeader: function () {
		return !Config.Leader && typeof Plan === "object" && !!(Plan.get() || {}).goal;
	},

	// THE ONE DEFINITION OF "THE TEAM": every bot Qolbot started and expects (expected()), with where it is now. inGame: it is in the game; loading: it is
	// between areas (area 0); here: it is in MY area. A bot that is not in the game is nobody's to wait for here (PartySync.hold deals with those).
	roster: function () {
		var names = this.expected(), areas = this.areas(), out = [], i, a;

		for (i = 0; i < names.length; i += 1) {
			a = areas[names[i]];
			out.push({name: names[i], area: a, inGame: a !== undefined && a !== 0, loading: a === 0, here: a === me.area});
		}

		return out;
	},

	// ALWAYS TOGETHER ON THE WAY TOO (the user, 2026-11-14: "always together, always protected, always safe"): the leader that walks on while its team is far
	// behind meets the monsters alone (Xena, Plains of Despair, 11:37). Called by Pather.moveTo before each step: a mate of my area that is more than
	// limits.closeDist units from me makes the leader stop for it, at most limits.close, then it goes on and does not wait again for 60 s (a mate that is stuck
	// must not hold the team for ever). Checked every 3 seconds at most. UNTESTED in a game.
	closeAt: 0,
	lastArea: 0,
	arrivalPending: false,
	waitFight: false,

	// A fight in sight: a hostile monster that can be attacked within 25 units.
	inCombat: function () {
		var mon = getUnit(1);

		if (mon) {
			do {
				if (mon.attackable && getDistance(me, mon) < 25) {
					return true;
				}
			} while (mon.getNext());
		}

		return false;
	},

	// True in the bot's main script (default.dbj), false in a helper thread (tools/TownChicken.js). Each thread has its own copy of Team: the town chicken
	// thread's lastArea starts at 0, so its walk to the new town portal (Pather.moveTo -> keepClose) took the field for a NEW area and ran the exit wait for
	// mates that were already in town on a party trip: 45 s standing among monsters, a regroup, then a Life Chicken (Xena, River of Flame, live 2026-11-14
	// 12:51:50-12:52:39). A town trip never runs the walking or leave-town waits; the regroup's own gather still runs where the regroup is.
	mainThread: function () {
		try {
			return typeof getScript !== "function" || getScript(true).name.toLowerCase() === "default.dbj";
		} catch (scriptError) {
			return true;
		}
	},

	keepClose: function () {
		var start, far, said = 0, late, back, told = false;

		if (this.steppingAside || this.waitFight) {
			return; // Pather.moveTo calls this before every step, including the step aside itself: the wait must not start inside it (the leader never moved off the entrance tile)
		}

		if (this.solo) {
			return; // a Sorceress leader's own Quick Travel trip (QuickTravel.selfTrip): the team waits in town for her portal, not at the exits
		}

		if (me.inTown || !me.gameReady || !this.isLeader() || !this.expected().length || !this.mainThread()) {
			this.lastArea = me.area;

			return;
		}

		// THE OTHER SIDE OF AN EXIT (the user, 2026-11-14: "if they take an exit they wait there for everyone to pass thru that exit; the only caveat is if they
		// are in combat over the threshold of an exit and some mates haven't made it over yet"): the first step in a new area waits until every mate of the game
		// is in it too; with a fight in sight it does not wait (the mates come over by themselves) and asks again at the next step, when the fight is over.
		if (me.area !== this.lastArea) {
			this.lastArea = me.area;
			this.arrivalPending = true;
		}

		if (this.arrivalPending && !this.inCombat()) {
			start = Date.now();

			if (this.roster().some(function (r) { return r.inGame && !r.here; })) {
				this.stepAside(); // do not wait on the entrance tile: the mates have to get off it
			}

			for (;;) {
				late = this.roster().filter(function (r) { return r.inGame && !r.here; }).map(function (r) { return r.name; });

				// THE ONE TIMER (the user, 2026-11-15: "on any of the seams and transitions between zones and towns, they have X seconds to make it right or a
				// party regroup gets called"): after it, a party regroup in town; no extension, no give-up
				if (late.length && Date.now() - start > this.limits.sync && !me.dead && !me.inTown && me.gameReady && !this.inCombat()) {
					start = Date.now();
					said = 0;

					if (this.escalate(late, "the team did not come through the exit")) {
						continue;
					}
				}

				if (!late.length || me.dead || me.inTown || !me.gameReady) {
					break;
				}

				if (Date.now() - said > 10000) {
					said = Date.now();
					print("Team: waiting at the exit for " + late.join(", ") + " to come through.");
				}

				if (this.inCombat()) { // a fight starts while we wait: fight, and ask again after it
					return;
				}

				delay(500);
			}

			this.arrivalPending = false;
		}

		if (Date.now() < this.closeAt) {
			return;
		}

		this.closeAt = Date.now() + 3000;
		far = this.farMates();

		if (!far.length) {
			return;
		}

		start = Date.now();
		this.makeRoom();

		while (far.length && Date.now() - start < this.limits.close && me.gameReady && !me.dead && !me.inTown) {
			if (Date.now() - said > 10000) {
				said = Date.now();
				print("Team: " + far.join(", ") + " fell behind: waiting for them to catch up.");
			}

			// a fight while we wait: fight it, never stand still among the monsters (Darius stood waiting in Tal Rasha's Tomb #3 and chickened to Plague
			// Shank the Dead, live 10:45:51-10:46:04 on 2026-11-15). waitFight stops Attack.clear's own moves from starting a second wait. UNTESTED in a game.
			if (this.inCombat() && typeof Attack === "object" && !this.waitFight) {
				this.waitFight = true;

				try {
					Attack.clear(15);
				} catch (fightError) {
					print("Team: " + fightError);
				}

				this.waitFight = false;
			}

			// FALL BACK TO THE TEAM: a leader alone ahead of everybody is where the chickens are (Sankt led the Catacombs level hunt and chickened three
			// times, 11:27, 11:39, 11:59 on 2026-11-15, each time right after "Barabas, Darius, Meir, Xena fell behind"; fighting in place while waiting
			// was not enough). After 2 s it walks back to the nearest mate instead of standing alone. UNTESTED in a game.
			if (Date.now() - start > 2000 && !this.waitFight) {
				back = this.nearestMate();

				if (back && back.d > 15 && back.d < 150) { // farther: a stale party-list spot (see farMates), not a place to walk to
					this.waitFight = true;

					try {
						if (!told) {
							told = true;
							print("Team: going back to " + back.name + ".");
						}

						Pather.moveTo(back.x, back.y, 3);
					} catch (backError) {
						print("Team: " + backError);
					}

					this.waitFight = false;
				}
			}

			delay(500);
			far = this.farMates();
		}

		this.closeAt = Date.now() + (far.length ? 60000 : 3000); // gave up on a mate that does not come: no more waiting for a minute
	},

	// The nearest mate of my area ({name, x, y}), null when none is in it. The player unit's position when in view (the party list's can be stale).
	nearestMate: function () {
		var best = null, names = this.expected(), p = getParty(), u, x, y, d;

		if (p) {
			do {
				if (p.name !== me.name && names.indexOf(p.name) > -1 && p.area === me.area && p.x !== undefined) {
					u = getUnit(0, p.name);
					x = u && u.area === me.area ? u.x : p.x;
					y = u && u.area === me.area ? u.y : p.y;
					d = getDistance(me.x, me.y, x, y);

					if (!best || d < best.d) {
						best = {name: p.name, x: x, y: y, d: d};
					}
				}
			} while (p.getNext());
		}

		return best;
	},

	// The mates in my area that are more than limits.closeDist units from me (the party list has everybody's position).
	farMates: function () {
		var out = [], names = this.expected(), p = getParty(), u, x, y;

		if (p) {
			do {
				if (p.name !== me.name && names.indexOf(p.name) > -1 && p.area === me.area && p.x !== undefined) {
					// the party list's x,y is stale for a mate who came through a portal and has not moved since (live 13:47:21 on 2026-11-14: all four stood by
					// Darius at the Frigid Highlands waypoint and read "1325 units" away, their spot in Harrogath; Darius regrouped): the player unit, when in view, is right
					u = getUnit(0, p.name);
					x = u && u.area === me.area ? u.x : p.x;
					y = u && u.area === me.area ? u.y : p.y;

					if (getDistance(me.x, me.y, x, y) > this.limits.closeDist) {
						out.push(p.name);
					}
				}
			} while (p.getNext());
		}

		return out;
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

		// no check for a while (a town trip, the leader paused for a party trip): the old clocks say nothing about now (live 22:50:58: a second after the
		// team came back out of Meir's heal trip, Xena and Darius counted as apart since before it and a regroup sent everybody to town again)
		if (now - (this.separatedAt || 0) > 10000) {
			this.apartSince = {};
		}

		this.separatedAt = now;

		// A fight near an exit can leave a mate one step on the other side of it (the user, 2026-11-14): that is fine, they are together again once the monsters
		// are dead. While there is a fight in sight nobody counts as apart, and the clock starts again when it is over.
		if (this.inCombat()) {
			this.apartSince = {};

			return [];
		}

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

	// At a boss: the whole team has to be in the area when it dies, or the quest is not credited to the ones that were not (Duriel died 5 seconds after the
	// leader and the Sorceress arrived, the followers came through the portal a few seconds later and did not get it). The leader says "hold" (the followers
	// stop attacking, Follower.js), waits for the team (at most ms), and says "go". A follower that never hears "go" attacks again after a minute.
	holdAndGather: function (ms) {
		if (!this.isLeader() || !this.expected().length) {
			return true;
		}

		this.command("hold"); // by the message log (was the public chat)

		try {
			return this.gather(ms || this.limits.boss);
		} finally {
			this.command("go");
		}
	},

	// The ones who are LOST: apart for ms and not in a town. A teammate who is in town (or on its way there or out of it) is coming to me by itself;
	// going to town to fetch it only crosses it on the portal (it arrives in the field as I arrive in town, finds me gone and goes back: the two
	// chase each other). Only a teammate stuck in some other area of the field needs the regroup trip.
	lost: function (ms) {
		var towns = [1, 40, 75, 103, 109], areas = this.areas();

		return this.separated(ms).filter(function (n) { return towns.indexOf(areas[n]) < 0; });
	},

	// WHO IS ON ITS WAY (the first live run of the exit rule, 2026-11-14 11:58: the followers were slow, not lost, and a regroup cost more than waiting): every
	// poll of a wait notes, for each mate, its area and its distance from me; a mate that changed area or came progress units closer within progressFor
	// is "progressing", and a regroup is only made for the ones that are not.
	prog: {},

	trackProgress: function () {
		var now = Date.now(), p = getParty(), pos = {}, self = this;

		if (p) {
			do {
				pos[p.name] = p;
			} while (p.getNext());
		}

		this.roster().forEach(function (r) {
			var u = pos[r.name], dist = (u && r.here && u.x !== undefined) ? getDistance(me.x, me.y, u.x, u.y) : -1, last = self.prog[r.name];

			if (!last || last.area !== r.area) { // new, or changed area: that is progress
				self.prog[r.name] = {area: r.area, dist: dist, at: now};
			} else if (dist >= 0 && (last.dist < 0 || dist <= last.dist - self.limits.progress)) { // came closer by enough
				last.dist = dist;
				last.at = now;
			}
		});
	},

	progressing: function (name) {
		var pr = this.prog[name];

		return !!(pr && Date.now() - pr.at < this.limits.progressFor);
	},

	// THE LEADER ANNOUNCES WHERE IT IS GOING (the user: "they leave town as one unit"; the first live run: the followers only set off after the leader had left, and
	// the leader then waited a minute at the far end of the exit): "leaving" with the destination area, said just before a departure from town by waypoint or
	// exit, and the followers in town set off at the same moment (Follower.autoFollow, Team.leavingCall).
	solo: false, // true during a Sorceress leader's own Quick Travel trip (QuickTravel.selfTrip): no exit waits, no "leaving" call, no town wait

	// The "stay in town for my portal" call of a Sorceress leader's own trip, in its own file: Team.say has one slot, and the regroup of the town wait
	// overwrote it (live 21:20-21:22, Meir's Pit trip: the followers took the waypoint after her and walked). portal: her area once the portal is up.
	setSolo: function (on, portal) {
		try {
			FileTools.writeText("data/" + me.profile + ".solo.json", JSON.stringify({until: on ? Date.now() + 240000 : 0, portal: portal || 0}));
		} catch (e) { /* the file is a courtesy */ }

		if (on) {
			this.order("stay"); // the order record: stay in town (her portal sends the team out afterwards: a newer "out")
		}
	},

	soloCall: function (name) {
		var m;

		try {
			if (FileTools.exists("data/" + name + ".solo.json")) {
				m = JSON.parse(FileTools.readText("data/" + name + ".solo.json"));
			}
		} catch (e) { /* unreadable: no call */ }

		return m && m.until > Date.now() ? m : null;
	},

	// THE LEADER'S ORDERS: ONE RECORD, AND THE LAST ORDER TRUMPS ALL (the user, 2026-11-15: "the leader alone issues orders. nobody else does"; "yes, last order
	// trumps all"). Before, an order went out by three separate ways (the "leaving" word, the "proceed" word, data/partycall.json) and a follower could
	// not tell which was newer: live 17:33:21-28, Barabas and Sankt acted on Xena's "leaving for Travincal" after her newer call to town, and stayed
	// alone in Travincal. Now the leader writes every order to data/order.json, and every follower decision reads the newest order that applies to it.
	//   team:   the order to everybody, the newest one:
	//             out    {area, by: "exit" | "waypoint" | "portal" | "walk", owner: whose portal}  go out where the leader goes, that way
	//             town   {area: the field it came from, portal: whose portal, callId}           everybody to town now, through that portal
	//             stay   {}                                       stay in town (a Sorceress leader's own Quick Travel trip)
	//   errand: an order to ONE bot {to, place} (a Sorceress's portal errand, a waypoint helper): for that bot it counts like a team order
	// n counts up; a follower acts on each n once (leavingAnswered, returnAnswered, PartySync.townDone). An order of another game is ignored. UNTESTED in a game.
	orderFile: "data/order.json",

	order: function (word, extra) {
		var all = {}, o, k, prev;

		if (!this.isLeader()) {
			return null;
		}

		try {
			if (FileTools.exists(this.orderFile)) {
				all = JSON.parse(FileTools.readText(this.orderFile)) || {};
			}
		} catch (readError) {
			all = {};
		}

		if (all.game !== me.gamename) {
			all = {game: me.gamename}; // a new game: the old orders are gone
		}

		prev = Math.max((all.team || {}).n || 0, (all.errand || {}).n || 0);
		o = {n: Math.max(Date.now(), prev + 1), word: word, at: Date.now(), leader: me.name};

		for (k in extra) {
			if (extra.hasOwnProperty(k) && extra[k] !== undefined) {
				o[k] = extra[k];
			}
		}

		if (word === "errand") {
			all.errand = o;
		} else {
			all.team = o;
		}

		try {
			FileTools.writeText(this.orderFile, JSON.stringify(all));
		} catch (writeError) {
			print("Team: cannot write the order (" + writeError + ")");
		}

		return o;
	},

	// The newest order for me (the team's, or an errand to me if that is newer), or null. Only orders of this game count.
	currentOrder: function () {
		var all = null, t, e;

		try {
			if (FileTools.exists(this.orderFile)) {
				all = JSON.parse(FileTools.readText(this.orderFile));
			}
		} catch (readError) {
			all = null;
		}

		if (!all || all.game !== me.gamename) {
			return null;
		}

		t = all.team || null;
		e = (all.errand && all.errand.to === me.name) ? all.errand : null;

		if (t && e) {
			return e.n > t.n ? e : t;
		}

		return t || e;
	},

	// by: how the leader goes ("exit" or "waypoint"): a follower that cannot go the same way takes the leader's portal, never a walk of its own (Follower)
	announceLeaving: function (area, by) {
		if (this.solo || !this.isLeader() || !me.inTown || typeof area !== "number" || !area || [1, 40, 75, 103, 109].indexOf(area) > -1) {
			return false;
		}

		this.order("out", {area: area, by: by || ""});

		return true;
	},

	// A follower in town: is the newest order "out" by an exit or a waypoint (not by a portal: returnCall), not answered yet? {area, by, from}, or null.
	leavingCall: function () {
		var o = this.currentOrder();

		if (!o || o.word !== "out" || o.by === "portal" || o.n === this.leavingAnswered) {
			return null;
		}

		this.leavingAnswered = o.n;
		o.from = o.leader;

		return o;
	},

	leavingAnswered: 0,

	// The leader waits for the team a few steps AWAY from where it arrived: standing on the entrance tile blocks the corridor and the arriving mates cannot get
	// off it (Sankt: six instant move failures, then a step back across the exit into town, four times in forty seconds).
	stepAside: function () {
		var i, r, a, x, y, here = {x: me.x, y: me.y};

		if (this.steppingAside || typeof Attack !== "object" || typeof Pather !== "object") {
			return false;
		}

		this.steppingAside = true;

		try {
			for (r = 9; r <= 15; r += 3) {
				for (i = 0; i < 8; i += 1) {
					a = i * Math.PI / 4;
					x = Math.round(here.x + Math.cos(a) * r);
					y = Math.round(here.y + Math.sin(a) * r);

					if (Attack.validSpot(x, y) && !this.nearExit(x, y, 14)) {
						Pather.moveTo(x, y, 3);

						return true;
					}
				}
			}
		} catch (e) {
			print("Team: stepping aside: " + e);
		} finally {
			this.steppingAside = false;
		}

		return false;
	},

	// is the spot within `dist` units of an exit of this area (a step there may cross back over the threshold)?
	nearExit: function (x, y, dist) {
		var ex = [], i, area = typeof getArea === "function" ? getArea() : null;

		ex = (area && area.exits) || [];

		for (i = 0; i < ex.length; i += 1) {
			if (ex[i].x !== undefined && getDistance(x, y, ex[i].x, ex[i].y) < dist) {
				return true;
			}
		}

		return false;
	},

	// Does a step from here to (x, y) go TOWARD an exit that is near (within 14 of me or of the spot)? Such a step can cross back over the threshold (Sankt bounced
	// between town and the Outer Steppes). A step away from the exit, or along it, is fine: a bot that is stuck near one must still be able to sidestep.
	towardExit: function (x, y) {
		var ex = [], i, area = typeof getArea === "function" ? getArea() : null, dMe, dSpot;

		ex = (area && area.exits) || [];

		for (i = 0; i < ex.length; i += 1) {
			if (ex[i].x === undefined) {
				continue;
			}

			dMe = getDistance(me.x, me.y, ex[i].x, ex[i].y);
			dSpot = getDistance(x, y, ex[i].x, ex[i].y);

			if ((dMe < 14 || dSpot < 14) && dSpot < dMe) {
				return true;
			}
		}

		return false;
	},

	// "Barabas (area 105, 312 units)": what the leader sees of each late mate, for the log lines of the waits.
	describe: function (names) {
		var p = getParty(), pos = {}, out = [];

		if (p) {
			do {
				pos[p.name] = {area: p.area, x: p.x, y: p.y};
			} while (p.getNext());
		}

		names.forEach(function (n) {
			var u = pos[n];

			out.push(n + (u ? " (area " + u.area + (u.area === me.area && u.x !== undefined ? ", " + Math.round(getDistance(me.x, me.y, u.x, u.y)) + " units" : "") + ")" : " (not in the game)"));
		});

		return out.join(", ");
	},

	// Before the leader stands waiting anywhere: not in a doorway (the user, 2026-11-14: "instead of blocking doorways etc"): near an exit it walks a few steps off.
	makeRoom: function () {
		if (!me.inTown && this.nearExit(me.x, me.y, 12)) {
			return this.stepAside();
		}

		return false;
	},

	// A HUNT STARTS IN THE ACT OF ITS FIRST PLACE (the first live run: each hunt run began with a hop to the leader's act, the team gathered there, then everybody hopped
	// to the hunt's act: two hops for ~30 s each, on every run). Qolbot writes the act into data/bots.json ("firstAct"); the leader and the followers each go there at
	// the start of the game, before their chores, and the leader's departure wait then happens in the right town. Nothing when no hunt is on, when the bot is already
	// there or has not unlocked that act.
	firstActHop: function () {
		var info, act;

		if (!me.inTown) {
			return false;
		}

		try {
			info = FileTools.exists("data/bots.json") ? JSON.parse(FileTools.readText("data/bots.json")) : null;
		} catch (e) {
			return false;
		}

		act = info && info.firstAct;

		if (!act || act === me.act || typeof Pather !== "object" || !Pather.accessToAct(act)) {
			return false;
		}

		print("Team: the run starts in act " + act + ": going there first, together.");
		Town.goToTown(act);

		return me.act === act;
	},

	// A WAIT NEVER JUST EXPIRES (the user, 2026-11-14: "team sync expiration maybe should not happen: that's a town event where everyone will use a scroll if they have
	// to, that's the party regroup event"): when the team is not together after the wait, the answer is the REGROUP, not "going on without them". In the field the
	// leader goes to town and everybody comes (Team.regroup: a scroll if they must); in town the leader calls the team (PartySync.call: the mates stuck in the field come
	// to town by portal or scroll); the town gate then takes everybody out together. No cap: it happens as often as needed, and each one is reported as a sync bug. Returns true when a
	// regroup was done (the caller looks again), false when none could be (no scroll, no objective, too many, party sync off).
	escalations: [],

	escalate: function (late, why) {
		var now = Date.now(), recent;

		if (!late.length || !this.isLeader() || !this.canPortal()) {
			return false;
		}

		recent = this.escalations.filter(function (t) { return now - t < 600000; }); // counted for the log only: no cap (the user: a wait never ends in "going on without them")

		if (me.inTown) {
			if (!(typeof PartySync === "object" && PartySync.enabled() && PartySync.call(me.area))) {
				return false; // in town the call is how the mates are fetched; without it there is nothing to do
			}

			PartySync.currentId = 0; // a call to town; the town gate (waitToLeaveTown) is the wait that follows
		}

		this.escalations = recent.concat([now]);
		// the user, 2026-11-15: "if the team can't assemble together after any transition after 30 seconds, it means the logic is broken somewhere": every
		// one of these is a bug to find, so it goes to the Activity list, with who was where
		Report.problem("Team", "Sync broken: " + why + " in " + Pather.getAreaName(me.area) + " after " + Math.round(this.limits.sync / 1000) + " s (" + this.describe(late) + "). Party regroup in town.");

		if (!me.inTown) {
			this.regroup(late);
		}

		return true;
	},

	// THE GROUP MOVES TOGETHER: the leader bot does not leave an area (stairs, waypoint) before the team has caught up with it. It waits where it is
	// (up to limit ms, 45 s by default) until every team member who is in the game is in my area, and says who it waits for. Called by Pather
	// before the leader changes area. A member who is away on purpose (a Sorceress on a Quick Travel errand) is waited for like the others, but
	// never longer than the limit. Followers and bots without an objective never wait.
	gather: function (limit, noEscalate, near) {
		var start = Date.now(), late, said = false, madeRoom;

		if (this.solo || !this.isLeader() || !this.expected().length) { // solo: a Sorceress leader's own Quick Travel trip, the team waits in town
			return true;
		}

		limit = limit || this.limits.gather;
		madeRoom = false;

		for (;;) {
			late = this.roster().filter(function (r) { return r.inGame && !r.here; }).map(function (r) { return r.name; });

			if (near && !me.inTown) { // at an EXIT (before changing area): a mate of my area that is still far from me has not reached the exit yet. Not at a boss: there
				// everybody in the area is enough (the first live test of the Izual portal: the leader regrouped while all four were in the plains)
				this.farMates().forEach(function (n) { if (late.indexOf(n) < 0) { late.push(n); } });
			}

			if (!late.length || me.dead) {
				return true;
			}

			if (Date.now() - start > limit) {
				if (!noEscalate && this.escalate(late, "the team did not catch up")) {
					start = Date.now(); // regrouped: look again, with a fresh wait
					said = false;

					continue;
				}

				if (noEscalate || !this.canPortal()) { // the regroup's own wait, or no scroll for a regroup: say so and keep waiting
					start = Date.now();
					print("Team: still waiting for " + this.describe(late));
				}
			}

			if (this.inCombat() && typeof Attack === "object" && typeof Attack.clear === "function") { // waiting is not standing still: defend myself (the user, 2026-11-15)
				try { Attack.clear(15); } catch (fightError) { print("Team: " + fightError); }
			}

			if (!said) {
				said = true;
				print("Team: waiting for " + this.describe(late) + " to catch up before moving on.");
			}

			if (!madeRoom) { // not in a doorway while waiting
				madeRoom = true;
				this.makeRoom();
			}

			delay(1000);
		}
	},

	// THE TOWN GATE (the user, 2026-11-15: "when the bots go to town, nobody can leave town again until all the bots report \"ready\" (unless they are
	// leaving to go to another town for some chore reason, or an act change reason)"; "all of these X second exceptions are the problem ... maintain the
	// rule for as long as a party member is in the game"). Every way from a town into the field passes here (Pather.moveToExit, useWaypoint, usePortal),
	// for EVERY bot of a bot-led run, not only the leader: it goes when every mate that is in the game is in this town and says it is ready, or is already
	// out where I am going (it left a moment ago in this same departure). There is no time limit: a mate that is in the game is waited for; one that has
	// left the game is nobody to wait for, and one that joins counts at once. A mate out in the field is called to town (again every 20 s). While a bot
	// waits here it says "ready" itself: it is done in town. Town to town (chores, an act change) is not gated. targetArea: where I go (unknown: 0).
	// The 12 s grace (limits.grace) is for the retries of ONE departure, in the town it was given in. Tested in the simulation; UNTESTED in a game.
	leaveOkAt: 0,
	leaveOkArea: 0, // the town that OK was given in

	// bot-led runs only (the scope rule): the leader bot, or a bot of a team whose plan says the party sync is on; never while a real player leads
	syncOn: function () {
		var plan = (typeof Plan === "object" && Plan.get()) || {};

		return !!(this.isLeader() || plan.partySync);
	},

	// a mate at the gate or idle in town says one of these: it is done in town (Team.say)
	readyHere: function (name) {
		var m = this.heard(name);

		return !!(m && ["ready", "leaving", "proceed"].indexOf(m.word) > -1 && m.area === me.area && Date.now() - m.at < (m.ttl || this.limits.readyFor));
	},

	// NOBODY LEAVES TOWN UNTIL THE LEADER SAYS (the user, 2026-11-15: "nobody can leave again until the leader says"): may I, a follower in town, go
	// out toward the field now (a portal, a waypoint, an exit: Pather asks this before each)? Only when the leader's newest order is "out" or an errand
	// to me (Team.order). The leader, a bot with no party sync, and a trip to another town (an act change) are free. Live 19:48:34: Sankt finished an
	// old trip of his own and took his portal back to Travincal while the leader's order was still "town". UNTESTED in a game.
	mayLeaveTown: function (targetArea) {
		var o;

		if (!me.inTown || this.isLeader() || !this.syncOn() || (targetArea && [1, 40, 75, 103, 109].indexOf(targetArea) > -1)) {
			return true;
		}

		o = this.currentOrder();

		if (o && (o.word === "out" || o.word === "errand")) {
			return true;
		}

		if (Date.now() - (this.gateNoted || 0) > 8000) {
			this.gateNoted = Date.now();
			print("Team: the leader has not sent the team out (last order: " + (o ? o.word : "none") + "): I stay in town.");
		}

		return false;
	},

	gateNoted: 0,
	// A MATE THAT CANNOT GET INTO ACT 4 (the user, 2026-11-15: "the followers can report it as such in the internal chat"): a follower without Act 4 says "noact 4"
	// on the message log (Follower.followToAct) and waits in its Act 3 town. The leader does not wait for it at the town gate (it cannot come) and, before its next
	// Act 4 or 5 quest, brings the team back for Mephisto and the red portal (Quester.runQuests). The names of the mates that said so and are still in Act 3.
	noAct: {},

	noActMates: function () {
		var self = this;

		this.take("noact", null, ["noact"]).forEach(function (m) { self.noAct[m.from] = parseInt((m.a && m.a[0]) || 4, 10); });

		return this.roster().filter(function (r) { return r.inGame && self.noAct[r.name] === 4 && r.area >= 75 && r.area < 103; }).map(function (r) { return r.name; });
	},


	// A CHORE TRIP (the user, 2026-11-16: "if a party member needs to leave town during chores to a) buy maybe better potions somewhere or b) revive a dead merc or c) to hire a
	// new merc then they can leave town without permission and come back to the original town, then report ready"). Town.doChores and MercHire.maybe run inside chore(): the
	// hop to another town they make is not an act change of the team, and nobody waits for anybody; the bot comes back to the town it left and says ready there.
	onChore: false,

	chore: function (fn) {
		var was = this.onChore;

		this.onChore = true;

		try {
			return fn();
		} finally {
			this.onChore = was;
		}
	},

	waitToLeaveTown: function (targetArea) {
		var start = Date.now(), late, field, said = 0, recalled = start, now, cannot, actChange,
			towns = [1, 40, 75, 103, 109];

		// The leader's gate only (the user, 2026-11-15): a follower does nothing until the leader tells it to, and the leader tells it only when the party is
		// ready, so a follower carrying out the leader's order (following it out, taking its portal, a Sorceress's portal errand) is free to go. The
		// leader is not waited for by anybody: "if he gives an order it means that he was ready". (Live 17:01-17:06: Meir held her errand for Sankt's
		// "ready", and three followers held Sankt's portal send-out for it.)
		if (this.solo || !me.inTown || !me.gameReady || !this.syncOn() || !this.isLeader() || !this.expected().length) {
			return true;
		}

		// Town to town. The user, 2026-11-15: "nobody can leave town again until all the bots report ready (unless ... another town for some chore reason, or an act change
		// reason)"; 2026-11-16: "the leader shouldn't have left the town if the team wasn't ready" (live 13:19: the leader went on to Act 5 16 s after his Cain hand-in and Barabas,
		// Xena and Sankt, still arriving, were pulled along without theirs). So a hop to another act's town is gated like any other departure: every mate in the game is in this town
		// and says ready (a mate in the field is called to town, a mate in another town is on its way here: a follower always goes to its leader's town), or is already in the town
		// I am going to. A chore trip (Team.chore) is the only exception. The user: "see how simple the system is?" UNTESTED in a game.
		actChange = !!targetArea && towns.indexOf(targetArea) > -1;

		if (actChange && (targetArea === me.area || this.onChore)) {
			return true; // the same town, or a chore trip: no permission needed
		}

		if (start - this.leaveOkAt < this.limits.grace && this.leaveOkArea === me.area) {
			return true;
		}

		for (;;) {
			now = Date.now();
			late = [];
			field = [];

			cannot = me.act >= 4 ? this.noActMates() : [];

			this.roster().forEach(function (r) {
				if (r.area === undefined || cannot.indexOf(r.name) > -1) {
					return; // not in the game, or said it cannot get into this act (noActMates): nobody to wait for
				}

				if ((r.here && Team.readyHere(r.name)) || (targetArea && r.area === targetArea)) {
					return; // ready here, or already out where I am going
				}

				late.push(r.name);

				if (!r.here && !r.loading && towns.indexOf(r.area) < 0) {
					field.push(r.name);
				}
			});

			if (!late.length || me.dead || !me.inTown) {
				this.leaveOkAt = Date.now();
				this.leaveOkArea = me.area;

				return true;
			}

			if (now - this.lastSay >= 4000) {
				this.say("ready"); // I am at the gate: done in town
			}

			// one in the field while I am in town: the party is split, call it to town (PartySync: it comes by a portal of its own). The leader only: only
			// the leader gives orders (the user, 2026-11-15); a follower in town just waits (Meir, live 17:04-17:06, called the team to town five times)
			if (field.length && this.isLeader() && now - recalled >= this.limits.sync && typeof PartySync === "object" && PartySync.enabled && PartySync.enabled()) {
				recalled = now;
				print("Team: " + field.join(", ") + " still in the field while I am in town: calling them to town.");

				try {
					PartySync.call(me.area);
					PartySync.currentId = 0; // a call to town, no trip of mine to run
				} catch (callError) {
					print("Team: " + callError);
				}
			}

			if (now - said > 30000) {
				said = now;
				print("Team: waiting in town until " + late.join(", ") + " " + (late.length > 1 ? "are" : "is") + " ready: we leave together.");
			}

			if (typeof Gold === "object") {
				try { Gold.tick(); } catch (goldError) { print("Gold: " + goldError); }
			}

			delay(1000);
		}
	},

	// THE MAKER OF THE PORTAL GOES LAST (the user, 2026-11-14: "the first one back in town in a portal is the last one back through the port after everyone
	// else went back to the field, because the portal will close when the creator takes it back to the field"). The leader is about to go back out through
	// its OWN town portal (Pather.usePortal calls this, only when a portal of its own leads there): it says "proceed" (with the area the portal leads to), the followers in town take
	// the portal at once (Follower.js, Team.returnCall), and the leader waits until none of them is left in town, at most limits.sendOut. Nobody in town: no wait.
	// UNTESTED in a game.
	returnAnswered: 0,

	// A MATE THAT COULD NOT ENTER THE LEADER'S PORTAL (the user, 2026-11-17: "if a member can't take a portal (perhaps they are gated somehow) ... either make a new
	// portal to the destination, or see what the member requires to ungate that area"). Live 14:06:27-14:06:56 Xena failed twice, 30 s each, on an open portal 2
	// units away while three others went through; the maker waited for her for ever (sendOutFirst has no limit) and the mates already out walked back to town. Now the mate
	// says which it is: GATED (the act's quest is not done for it: a new portal cannot help; it is a problem for the Activity list, and the leader's plan is to get
	// it ready, the way "noact 4" works), or NOT GATED ("cantreach": the leader goes out and opens a new portal for it, TownChicken.js, and does not wait for it).
	// Says it once every 20 s. Returns true when gated. UNTESTED in a game.
	refusedAt: 0,

	portalRefused: function (area, owner) {
		var act = area ? getBaseStat("levels", area, "Act") + 1 : 0,
			gated = act > 1 && typeof Pather === "object" && Pather.accessToAct && !Pather.accessToAct(act);

		if (Date.now() - this.refusedAt < 20000) {
			return gated;
		}

		this.refusedAt = Date.now();

		if (gated) {
			Report.problem("Team", "I cannot go to " + Pather.getAreaName(area) + ": act " + act + " is not open for me (its quest is not done), so the portal of " + (owner || "the leader") + " cannot take me.");

			return true;
		}

		print("Team: I could not enter " + (owner || "the leader") + "'s portal to " + (area ? Pather.getAreaName(area) : "the field") + " and nothing gates it for me (act " + act + "): asking the leader for a new portal.");

		if (typeof Speech === "object" && Speech.say) {
			Speech.say("cannotReach");
		} else {
			this.post("cantreach");
		}

		return false;
	},

	sendOutFirst: function (area, ownsPortal, limit) {
		var start = Date.now(), here, said = false, stuck = {};

		// Only the MAKER of a portal goes last through it: a leader that takes a portal somebody else made (a mate's town trip) is not the maker, goes when it is
		// ready, and must not wait for the maker, who waits for it (a deadlock until the limits). ownsPortal is Pather's answer: a portal of mine leads there.
		// EVERY bot that takes its own portal out of town goes last through it (2026-11-15: the trip's maker is often not the leader)
		if (ownsPortal === false || !this.syncOn() || !me.inTown || !area || !this.expected().length) {
			return true;
		}

		// the mates still in town, but not another maker waiting at its own portal (it says "proceed"): two makers waiting for each other would never go
		// (live 2026-11-14 13:08:20: Sankt made the trip, Darius had opened his own portal, and each waited for the other to go out first)
		// a mate that said it cannot enter my portal (Team.portalRefused) is not waited for: I go out, and TownChicken.js opens a new portal for it
		here = function () { return Team.roster().filter(function (r) { return r.inGame && r.here && !stuck[r.name] && !Team.heardLately(r.name, "proceed"); }).map(function (r) { return r.name; }); };

		if (!here().length) {
			return true;
		}

		// only the leader gives orders (the user, 2026-11-15): a leader that made the portal sends the team out through it; a follower that made it (a
		// Sorceress's Quick Travel portal) says nothing: the leader's "proceed" with its name (Pather.usePortal) sent the team out, and it only goes last
		var orders = this.isLeader();

		if (orders) {
			this.say("proceed", {area: area}, this.limits.sync); // "allreadyproceedtofield": everybody go out through my portal; I go last
		}

		var resent = start;

		for (;;) {
			// THE LAST ORDER TRUMPS ALL (the user, 2026-11-15): a follower that made the portal waits to go last only while the leader's newest order is
			// still "out"; a newer order (the regroup's "town", live 20:10:59) ends the wait and it does not go out (Pather.usePortal reads false).
			// Live 20:10:29-20:12: Meir waited for Sankt to go out, the regroup brought everybody back to town, and she waited for ever while Barabas
			// waited for her "ready". UNTESTED in a game.
			if (!orders) {
				var standing = this.currentOrder();

				if (!standing || standing.word !== "out") {
					print("Team: the leader's order is now \"" + (standing ? standing.word : "none") + "\": I do not go out through my portal.");
					this.say("idle");

					return false;
				}
			}

			if (orders) {
				try {
					this.take("sendout", null, ["cantreach"]).forEach(function (m) {
						if (m.at >= start - 5000 && !stuck[m.from]) {
							stuck[m.from] = true;
							print("Team: " + m.from + " cannot get through my portal: I go out now and open a new one for them.");
						}
					});
				} catch (takeError) {
					print("Team: cannot read the message log: " + takeError);
				}
			}

			// no limit: they are safe in town; a mate still here is told again every timer
			if (orders && Date.now() - resent > this.limits.sync && here().length) {
				resent = Date.now();
				print("Team: " + here().join(", ") + " still in town: telling them again to go out through my portal.");
				this.say("proceed", {area: area}, this.limits.sync);
			}

			if (!here().length || me.dead || !me.inTown) {
				print("Team: everybody is back out through my portal: the maker goes last.");

				break;
			}

			if (!said) {
				said = true;
				print("Team: I made this portal, so I go last: " + (orders ? "sending " + here().join(", ") + " out first." : "waiting for " + here().join(", ") + " to go out first."));
			}

			delay(500);
		}

		this.say("idle"); // the call is over

		return true;
	},

	// A follower in town: has a mate said "proceed" (go out through my portal) lately, and not yet answered? The mate's message (with .from), or null.
	// only: the one name to listen to (the Follower main thread: its leader only; a mate's own party trip is PartySync's, in the TownChicken thread. Live
	// 21:34:57: Barabas and Sankt took Xena's still-fresh "proceed" while Meir, the leader, was in town for a regroup, and the team split again)
	// Now the newest order (Team.order): "out" by a portal, not answered yet: {area, owner, from}, or null. only: the leader's name (it must be its order).
	returnCall: function (only) {
		var o = this.currentOrder();

		if (!o || o.word !== "out" || o.by !== "portal" || o.n === this.returnAnswered || (only && o.leader !== only)) {
			return null;
		}

		this.returnAnswered = o.n;
		o.from = o.leader;
		o.word = "proceed"; // the old name of this order, for the callers' logs

		return o;
	},

	// THE BOTS' OWN KEYWORD CHAT (the user, 2026-11-14: "in your behind-the-scenes chat log you can use keywords, they don't have to be normal sentences: ready,
	// chickentown, chores, allreadyproceedtofield"). One small file per bot, data/<profile>.tsay.json = {word, id, area, at, ttl, ...}: the LAST word that bot said (a
	// bot writes only its own file, so nothing is lost when five of them talk at once). The words:
	//   ready       I am in town, my chores are done, I wait for the others           (a follower idling in town; PartySync.barrier)
	//   chores      I am busy in town (chores, a quest talk)                           (expires by itself: a crash cannot hold the team)
	//   chickentown I am going to town, everybody come through my portal (id, area)    (PartySync.call)
	//   proceed     everybody is ready: go back out through my portal (id, area)      ("allreadyproceedtofield": the maker of the portal says it, goes last)
	//   idle        nothing to say
	// UNTESTED in a game; tested in the simulation (scripts/jstest).
	lastSay: 0,

	say: function (word, extra, ttl) {
		var msg = {word: word, id: Date.now() + Math.random(), area: me.area, at: Date.now(), ttl: ttl || this.limits.readyFor}, k;

		for (k in extra) {
			if (extra.hasOwnProperty(k)) {
				msg[k] = extra[k];
			}
		}

		try {
			FileTools.writeText("data/" + me.profile + ".tsay.json", JSON.stringify(msg));
			this.lastSay = Date.now();
		} catch (e) { /* the file is a courtesy */ }

		// the leader's "proceed" (go out through this portal: sendOutFirst, Pather.usePortal, Waypoints.sendTeam, the useWaypoint wrapper) is an order: it
		// goes into the order record, which is what the followers read (Team.order, returnCall)
		if (word === "proceed" && this.isLeader()) {
			this.order("out", {area: extra && extra.area, by: "portal", owner: (extra && extra.owner) || me.name});
		}

		return msg;
	},

	// what a bot last said (or null), and the same only when it is the word asked for and still fresh
	heard: function (name) {
		try {
			if (FileTools.exists("data/" + name + ".tsay.json")) {
				return JSON.parse(FileTools.readText("data/" + name + ".tsay.json"));
			}
		} catch (e) { /* unreadable: nothing heard */ }

		return null;
	},

	// THE BOTS' MESSAGE LOG (the user, 2026-11-15: "make it so anything required for coordination purposes uses the internal chat, and make sure that
	// internal chat uses keywords instead of full sentences"). tsay.json above holds one word per bot (its state: ready, chores, proceed ...); a message
	// that must not be lost to the next one goes here: data/<profile>.tmsg.json = {n, msgs: [{n, at, w, a, to}]}, the last 30, n counting up. w is a
	// keyword, a its arguments, to a bot's name ("" for everybody). Every reader keeps its own place (take's key), so the Follower's command loop, a
	// waiting QuickTravel request and Gold do not take each other's messages. Words (Speech.answers has the public phrasings, said only as colour):
	//   cmd [text]          a leader's command to the team, the kolbot chat command words ("hold", "go", "portal andy", "waypoint 35", "redportal")
	//   portalopen [place]  my portal is open           noget [place]  I could not get there      noquick  I cannot teleport
	//   noplace [place]     I do not know that place     haswp [area]  I have that waypoint         needgold  my purse is empty
	//   cantreach           I cannot reach the leader: open a portal
	// Tested in the simulation (scripts/jstest/team_test.js); UNTESTED in a game.
	msgSince: Date.now(), // a thread reads only what was posted after it started (an old game's messages are not news)
	msgSeen: {},

	post: function (word, args, to) {
		var file = "data/" + me.profile + ".tmsg.json", log = null;

		try {
			if (FileTools.exists(file)) {
				log = JSON.parse(FileTools.readText(file));
			}
		} catch (readError) { /* unreadable: start a new one */ }

		if (!log || !log.msgs) {
			log = {n: 0, msgs: []};
		}

		log.n += 1;
		log.msgs.push({n: log.n, at: Date.now(), w: word, a: args || [], to: to || ""});

		while (log.msgs.length > 30) {
			log.msgs.shift();
		}

		try {
			FileTools.writeText(file, JSON.stringify(log));
		} catch (writeError) {
			print("Team: cannot post " + word + ": " + writeError);
		}
	},

	// a leader's command to the team, by the message log and no longer in the public chat
	command: function (text) {
		this.post("cmd", [text]);
	},

	// The new messages for me (to me or to everybody) from the given bots (all the mates when names is empty), oldest first, as {from, n, at, w, a, to}.
	// words: only these keywords (the others stay unread for this key). key: whose place in the log (each reader has its own).
	take: function (key, names, words) {
		var out = [], i, j, log, m, seen, k;

		names = names && names.length ? names : this.expected();

		for (i = 0; i < names.length; i += 1) {
			log = null;

			try {
				if (FileTools.exists("data/" + names[i] + ".tmsg.json")) {
					log = JSON.parse(FileTools.readText("data/" + names[i] + ".tmsg.json"));
				}
			} catch (readError) { /* half written: read it next time */ }

			if (!log || !log.msgs) {
				continue;
			}

			k = key + ":" + names[i];
			seen = this.msgSeen[k] || 0;

			if (log.n < seen) {
				seen = 0; // the file was started again
			}

			for (j = 0; j < log.msgs.length; j += 1) {
				m = log.msgs[j];

				if (m.n <= seen || m.at < this.msgSince || (m.to && m.to !== me.name)) {
					continue;
				}

				if (words && words.indexOf(m.w) < 0) {
					continue;
				}

				m.from = names[i];
				out.push(m);
				this.msgSeen[k] = Math.max(this.msgSeen[k] || 0, m.n);
			}
		}

		return out.sort(function (x, y) { return x.at - y.at; });
	},

	heardLately: function (name, word) {
		var m = this.heard(name);

		return (m && m.word === word && Date.now() - m.at < (m.ttl || this.limits.readyFor)) ? m : null;
	},

	markReady: function () {
		if (Date.now() - this.lastSay >= 4000) { // said again every few seconds while idle, not on every poll
			this.say("ready");
		}
	},

	markBusy: function (ms) {
		this.say("chores", null, ms || 60000);
	},

	clearBusy: function () {
		this.say("idle");
	},

	isBusy: function (name) {
		return !!this.heardLately(name, "chores");
	},

	// does this mate say "ready", here (in my area), lately?
	isReady: function (name) {
		var m = this.heardLately(name, "ready");

		return !!(m && m.area === me.area);
	},

	// The team is split up: the leader goes to town, where everybody is safe, waits (up to 90 s) for the others to gather there (they follow the
	// leader to town by themselves), and goes back out through its own portal; they follow it out. Nobody walks off alone.
	// A town portal needs a Tome of Town Portal with scrolls in it, or a loose scroll; without one the regroup trip cannot even start.
	canPortal: function () {
		var tome = me.findItem("tbk", 0, 3);

		return !!((tome && tome.getStat(70) > 0) || me.findItem("tsc", 0, 3));
	},

	// Out of town portals with a tome in the pack: the town trips cannot happen any more. The way out is to leave the game; the bot restarts
	// in town, where it buys scrolls (Town.fillTome).
	outOfPortals: function () {
		return !!me.findItem("tbk", 0, 3) && !this.canPortal();
	},

	regroup: function (who) {
		var area = me.area, start = Date.now(), names, areas, here, i, apart = (who && who.length ? who : this.lost((Config.RegroupSeconds || 30) * 1000)).join(", "); // who: the late mates of the wait that asked for it (it said "? apart" without them)

		// No limit on how often this happens: it happens as often as it needs to. If it happens a lot, the reason is what has to be fixed, so every
		// trip says who was apart and how many there have been.
		this.lastRegroup = start;
		this.regroups = (this.regroups || 0) + 1;
		this.apartSince = {};
		Report.note("Team", "The team is split up (" + (apart || "?") + " apart, regroup no. " + this.regroups + "). Going to town so we all meet.");
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

			if (Date.now() - start > this.limits.sync) { // no give-up: call the ones still out again, every timer
				start = Date.now();
				print("Team: regroup: still waiting in town for the team.");

				if (typeof PartySync === "object" && PartySync.enabled && PartySync.enabled()) {
					try { PartySync.call(area); PartySync.currentId = 0; } catch (callError) { print("Team: " + callError); }
				}
			}

			if (typeof Gold === "object") { // the leader is in town with the team here: a teammate that asks for gold (a gold hunt) is answered now, not only at the start of a game
				try { Gold.tick(); } catch (goldError) { print("Gold: " + goldError); }
			}

			delay(1000);
		}

		Town.move("portalspot");

		if (!Pather.usePortal(area, me.name)) {
			throw new Error("Team.regroup: failed to go back out of town");
		}

		this.gather(60000, true); // the followers come out after me: stay here until they have (no new regroup from inside a regroup)

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

			if (typeof Gold === "object" && me.inTown) {
				Gold.tick(); // gold sharing while the team gathers in town
			}

			if (typeof Quartermaster === "object" && me.inTown) {
				Quartermaster.tick();
			}

			delay(1000);
		}
	}
};
