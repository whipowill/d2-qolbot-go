/**
*	@filename	PartySync.js
*	@desc		The party goes to town together (user's design, 2026-11-13; bot-only runs only: plan.partySync, never while a human plays). When a bot makes a
*	            TOWN CHICKEN trip (a portal trip to heal; a Life Chicken that quits the game is not one) it CALLS the others: data/partycall.json. Each mate's
*	            TownChicken thread sees the call, waits until nothing hostile is near, and goes to town through the caller's open portal (Town.goToTown reuses
*	            an open portal: no scroll spent). In town everybody does its chores, marks itself READY (data/<profile>.sync.json: files, not chat, so the
*	            "bots report what they're doing" switch does not matter) and waits until the whole party is ready (90 s at most). The leader waits 5 more seconds
*	            so it goes through last, and everybody returns through a portal that leads back to where they left (Town.visitTown).
*	            UNTESTED in a game (no JS engine here). Everything is logged as "Party: ...".
*/

include("json2.js");
include("common/Plan.js");
include("common/Team.js");

var PartySync = {
	// this BOT's life in this game: a bot that quit and restarted is a NEW session, and the calls of its old one are dead (17:54, a mate went to town for a
	// call of a Sankt that had already quit). The same for every thread of the bot: it was Date.now() of each thread, so the leader's town chicken
	// thread took the leader's own call (made by its main thread) for a mate's, answered it and stamped the leader's file with ITS session, and the
	// mates dropped every call after that (live 17:34:07-17:34:37, Xena: Barabas and Sankt never came back from Travincal). The game's start time (one
	// value for the whole Game.exe); a test sets it with `session = n`.
	sessionSet: 0,

	get session() {
		return this.sessionSet || (typeof me === "object" && me.gamestarttime) || 1;
	},

	set session(v) {
		this.sessionSet = v;
	},

	currentId: 0, // the call this thread is taking part in (0: none)
	stayInTown: false, // the trip ended with this follower in town on purpose (waitUntilOthersBack "stay"): Town.visitTown does not go back out
	answered: 0,  // the last call this thread answered or acknowledged
	wantCall: false, // set by the town chicken thread before a heal trip; Town.visitTown makes the call once the bot is in town
	lastCall: 0,

	enabled: function () {
		var plan = Plan.get();

		return !!(plan && plan.partySync);
	},

	// only the leader bot has an objective (the followers' Config.Leader is empty in the town chicken thread)
	isLeader: function () {
		var plan = Plan.get();

		return !!(plan && plan.goal);
	},

	read: function (path) {
		try {
			return FileTools.exists(path) ? JSON.parse(FileTools.readText(path)) : null;
		} catch (readError) {
			return null;
		}
	},

	write: function (path, obj) {
		try {
			FileTools.writeText(path, JSON.stringify(obj));
		} catch (writeError) {
			print("Party: cannot write " + path + " (" + writeError + ")");
		}
	},

	// A quest sequence that holds units (an altar, an object to hit) must not be interrupted by a NON-emergency town trip (the party going to town, the leader
	// waiting for mates): the area change makes the units invalid. The script says "busy for N ms"; the party trips of the town chicken thread wait. A
	// heal trip (low life) never waits.
	busy: function (ms) {
		this.write("data/" + me.profile + ".busy.json", {until: Date.now() + ms});
	},

	// The mates go back out BEFORE the leader (it waits 5 s, to be last): for a while after that the Follower must not take "the leader is in town" as a
	// reason to follow it back to town (17:59:04, the first full party trip: Sankt went back to town right after returning).
	afterParty: function () {
		var b = this.read("data/" + me.profile + ".afterparty.json");

		return !!(b && b.until > Date.now());
	},

	// A PARTY TRIP IS ON: another bot called the team to town less than 2 minutes ago and has not said the trip is over (its maker goes back out last and then
	// marks the call done, endTrip). Read from the file, so every thread of a bot sees it: the Follower's main loop leaves the town moves to the town chicken
	// thread meanwhile (live 2026-11-14 12:43:46: Darius's main loop went to town "to meet up" the leader in the same second as his town chicken thread
	// answered the call, the two trips collided and he never went back out; 12:44:25: the other mates' 25 s afterParty ran out while the maker still waited
	// for Darius in town, and they came back for it).
	tripOn: function () {
		var c = this.read("data/partycall.json");

		return !!(c && c.from !== me.profile && !c.done && Date.now() - c.at < 120000);
	},

	// the maker: the trip `id` is over (everybody went back out, or the wait was given up)
	endTrip: function (id) {
		var c = this.read("data/partycall.json");

		if (c && c.id === id) {
			c.done = true;
			this.write("data/partycall.json", c);
		}
	},

	isBusy: function () {
		var b = this.read("data/" + me.profile + ".busy.json");

		return !!(b && b.until > Date.now());
	},

	// at the start of a game: my readiness file says "no call open, ready", with this session's id (so the old session's file cannot make anyone wait)
	init: function () {
		this.write("data/" + me.profile + ".sync.json", {id: 0, ready: true, session: this.session, at: Date.now()});
	},

	// a bot that goes to town to heal calls the team (at most once a minute). urgent: a town chicken trip (the user, 2026-11-15: "the entire team drops
	// whatever they are doing and takes that portal. they don't keep fighting -- they leave immediately"): a quest step in progress (busy) does not
	// hold a mate back from it either.
	// ONLY THE LEADER GIVES ORDERS (the user, 2026-11-15: "the leader alone issues orders. nobody else does"; "the person who leaves the field can do so
	// without permission. the leader then instructs the remaining party members to take that bot's portal back to town"). A follower that comes to town
	// calls nobody: it tells the leader (data/<profile>.wenttown.json, read by the leader's TownChicken thread through wentTown below) and then waits in
	// town like a caller did (currentId set: the barrier marks it ready and hands it back to the Follower, which follows the leader).
	// portalOf (the leader only): whose portal the team takes to town (the mate that went first); empty: the leader's own. UNTESTED in a game.
	call: function (fieldArea, urgent, portalOf) {
		var now = Date.now();

		if (!this.enabled() || now - this.lastCall < 15000) { // a guard against a loop of calls, not a rule: a minute here refused real trips
			return 0;
		}

		this.lastCall = now;
		this.currentId = now;

		if (!this.isLeader()) {
			this.write("data/" + me.profile + ".wenttown.json", {id: now, name: me.name, session: this.session, area: fieldArea || me.area, at: now, urgent: !!urgent});
			this.write("data/" + me.profile + ".sync.json", {id: now, ready: false, session: this.session, at: now});
			print("Party: " + me.profile + " went to town" + (urgent ? " to heal" : "") + ": telling the leader.");

			return now;
		}

		// area: where the trip goes back to (the field). Town.visitTown calls from town, so it passes the area it came from: with me.area the call said "town",
		// and a mate that reached town on its own (not through the barrier) ignored the proceed that pointed at its own town (Darius, live 13:20:10-13:20:57)
		this.write("data/partycall.json", {id: now, from: me.profile, session: this.session, area: fieldArea || me.area, at: now, urgent: !!urgent, portal: portalOf || me.name});

		if (typeof Team === "object" && Team.order) {
			Team.order("town", {area: fieldArea || me.area, portal: portalOf || me.name, callId: now, urgent: !!urgent}); // the order the followers read
		}
		this.write("data/" + me.profile + ".sync.json", {id: now, ready: false, session: this.session, at: now});
		if (typeof Team === "object" && Team.say) {
			Team.say("chickentown", {callId: now, area: me.area}, 60000); // the bots' keyword chat
		}
		if (portalOf && portalOf !== me.name) {
			print("Party: " + portalOf + " went to town: the leader calls the team to town through " + portalOf + "'s portal.");
		} else {
			print("Party: " + me.profile + " is going to town" + (urgent ? " to heal" : "") + ": calling the team.");
		}

		return now;
	},

	// The leader: a mate that went to town from the field and told me (call above, a follower's side), fresh, of the mate's current session, and not yet
	// answered: {id, name, area, urgent, at, from}, or null. The leader's TownChicken thread then calls the team to town through that mate's portal.
	reportSeen: {},

	wentTown: function () {
		var names = [], i, r, f;

		if (!this.enabled() || !this.isLeader()) {
			return null;
		}

		try {
			names = Team.expected() || [];
		} catch (teamError) {
			names = [];
		}

		for (i = 0; i < names.length; i += 1) {
			r = this.read("data/" + names[i] + ".wenttown.json");

			if (!r || this.reportSeen[names[i]] === r.id || Date.now() - r.at > 60000) {
				continue;
			}

			this.reportSeen[names[i]] = r.id;
			f = this.read("data/" + names[i] + ".sync.json"); // a report of the mate's older session (it quit and came back) is dead

			if (!f || f.session !== r.session || !Misc.inMyParty(names[i])) {
				continue;
			}

			r.from = names[i];

			return r;
		}

		return null;
	},

	// A follower: the leader's newest order is "town" (Team.order) and I have not carried it out yet: the order {n, portal, callId, area, urgent}, or null.
	// No "answered while I was in town": a follower that was in town (or riding a waypoint) when the order came, and is out in the field now, still goes
	// (live 17:33:25: Barabas and Sankt "answered" the call while loading on the waypoint, then landed in Travincal and stayed there).
	townDone: 0,

	townOrder: function () {
		var o;

		if (!this.enabled() || this.isLeader() || typeof Team !== "object" || !Team.currentOrder) {
			return null;
		}

		o = Team.currentOrder();

		return (o && o.word === "town" && o.n !== this.townDone) ? o : null;
	},

	// a fresh call from somebody else, in my game, that I have not answered
	pending: function () {
		var c, f;

		if (!this.enabled()) {
			return null;
		}

		c = this.read("data/partycall.json");

		if (!c || c.from === me.profile || c.id === this.answered || Date.now() - c.at > 60000 || !Misc.inMyParty(c.from)) {
			return null;
		}

		f = this.read("data/" + c.from + ".sync.json"); // the caller's own file carries its current session: a call of an older session is dead

		if (!f || f.session !== c.session) {
			return null;
		}

		return c;
	},

	// nobody hostile close: leaving a fight in the middle would cost more than the trip is worth
	safe: function () {
		var mon = getUnit(1);

		if (mon) {
			do {
				if (mon.attackable && getDistance(me, mon) < 14) {
					return false;
				}
			} while (mon.getNext());
		}

		return true;
	},

	// a bot that is already in town when a call comes has nowhere to go: it is ready at once
	ack: function () {
		var c;

		if (!this.enabled() || !me.inTown) {
			return;
		}

		c = this.read("data/partycall.json");

		// never my own call, whatever thread of mine made it (Xena's town chicken thread answered her own call, live 17:34:07)
		if (!c || c.id === this.answered || c.id === this.currentId || (Date.now() - c.at > 120000 && !(c.holdUntil > Date.now())) || c.from === me.profile) { // a hold call stays good while the maker holds
			return;
		}

		this.answered = c.id;
		this.write("data/" + me.profile + ".sync.json", {id: c.id, ready: true, session: this.session, at: Date.now()});
		print("Party: " + c.from + " called the team to town; I am here.");
	},

	// the other bots of my game: the one definition of the team (Team.roster: the bots Qolbot started that are in the game)
	members: function () {
		try {
			return Team.roster().filter(function (r) { return r.inGame; }).map(function (r) { return r.name; });
		} catch (teamError) {
			return [];
		}
	},

	absentSince: {}, // expected mates that are not in my party: name -> since when

	// Mates that Qolbot runs (data/bots.json) but that are NOT in the game right now (they quit, a Life Chicken, and are restarting), for at least ms.
	// Team.separated skips them ("not in the game: nothing to wait for"), which is why the leader used to quest on alone while they rejoined.
	missing: function (ms) {
		var i, names = [], party = Team.areas(), now = Date.now(), out = [];

		try {
			names = Team.expected() || [];
		} catch (teamError) {
			names = [];
		}

		for (i = 0; i < names.length; i += 1) {
			if (party[names[i]] === undefined) {
				this.absentSince[names[i]] = this.absentSince[names[i]] || now;

				if (now - this.absentSince[names[i]] >= ms) {
					out.push(names[i]);
				}
			} else {
				delete this.absentSince[names[i]];
			}
		}

		return out;
	},

	// The leader goes to town and waits there until the missing mates are back in the game (3 minutes at most), then goes out again, last: a mate that
	// joins finds the leader in town ("Waiting for leader") and follows it out through the portal. Returns true when it went.
	hold: function (names) {
		var pre = me.area, end = Date.now() + 180000, c;

		print("Party: " + names.join(", ") + " left the game; going to town to wait for them.");
		Town.goToTown();

		// THE TEAM GOES TO TOWN AS ONE UNIT (the user, 2026-11-14, R6): call them at once, as every trip does. Before, the leader went alone and each
		// follower noticed on its own next loop: they left the field 2 to 6 s apart and the last one, alone, was nearly killed (Xena, Life Chicken to a
		// Grotesque in the River of Flame 13:01:07, while the leader waited in town for Sankt). The call is marked as a hold (holdUntil): the mates wait
		// for the maker's proceed past their usual 100 s, while the missing mate rejoins.
		if (!this.currentId && this.call(pre)) {
			c = this.read("data/partycall.json");

			if (c && c.id === this.currentId) {
				c.holdUntil = end + 30000;
				this.write("data/partycall.json", c);
			}
		}

		Town.doChores();
		Town.move("portalspot");

		while (Date.now() < end && me.inTown && me.gameReady && this.missing(0).length) {
			delay(1000);
		}

		if (this.missing(0).length) {
			print("Party: regroup: " + this.missing(0).join(", ") + " did not come back into the game; the team goes on together.");
		} else {
			print("Party: everybody is back; the leader goes out last.");
			delay(8000); // they join in town: give them time to load and see the leader
		}

		if (this.currentId) {
			this.barrier(); // everybody ready (the one that rejoined too), "proceed", the maker last
		}

		if (me.inTown && !Pather.usePortal(pre, me.name) && !Pather.usePortal(pre, null)) {
			throw new Error("PartySync.hold: Failed to go back from town");
		}

		return true;
	},

	// Did this bot make the call (and so the portal) of the trip `id`?
	isCaller: function (id) {
		var c = this.read("data/partycall.json");

		return !!(c && c.id === id && c.from === me.profile);
	},

	// In town, chores done: I am ready. That is all a trip does here now (the user, 2026-11-15: "when the bots go to town, nobody can leave town again until
	// all the bots report ready"; "all of these X second exceptions are the problem"): the town gate (Team.waitToLeaveTown, under every Pather way out of
	// town) holds every bot until every bot in the game is ready, with no time limit; the LEADER then goes back out the way it came and every other bot
	// follows the leader (stayInTown: Town.visitTown hands it back to the Follower); the maker of a portal goes through it last (Team.sendOutFirst, under
	// Pather.usePortal, for every bot). The old maker-side waits (waitAllReady 90 s, waitForProceed 100 s, waitUntilOthersBack 45 s) were three
	// separate ways of doing the gate's job, each with a time limit that let the party split.
	barrier: function () {
		var id = this.currentId;

		if (!id) {
			return;
		}

		this.write("data/" + me.profile + ".sync.json", {id: id, ready: true, session: this.session, at: Date.now()});

		// READY MEANS READY (the user, 2026-11-15: the leader sent the team out while Sankt "was not ready"): a follower's "ready" is said only by its main
		// loop, idle in town with the leader there (Follower: Team.markReady), never here at the end of the town thread's trip: the main script may still
		// be busy (live 20:10:26: Sankt said ready here, his main script ran its old field task for 30 s more, and he missed the leader's "out").
		// The follower says "chores" until then, so that an older "ready" of its own does not count. UNTESTED in a game.
		if (typeof Team === "object" && Team.say) {
			if (this.isLeader()) {
				Team.say("ready");
			} else if (Team.markBusy) {
				Team.markBusy(60000);
			}
		}

		if (!this.isLeader()) {
			this.stayInTown = true; // follow the leader out from here
			print("Party: in town, the trip is done: I say ready once my main script is idle, and go out with the leader.");
		} else {
			print("Party: in town and ready: we go back out when everybody is.");
		}

		if (this.isCaller(id)) {
			this.endTrip(id);
		}

		this.currentId = 0;
	},

	// who made the call (and the portal) of the trip `id`: its name, or ""
	makerOf: function (id) {
		var c = this.read("data/partycall.json");

		return (c && c.id === id) ? c.from : "";
	}
};
