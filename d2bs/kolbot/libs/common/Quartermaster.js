/**
*	@filename	Quartermaster.js
*	@desc		Everything the bots ask of the Quartermaster mod (Quartermaster.dll), in one place (the user, 2026-11-16: "for functions that use Plugy, QOL.dll, or
*	            Quartermaster.dll put those in separate classes so they can be controlled"). Settings, Game, "Using Quartermaster?" (plan.quartermaster, Config.UsesQuartermaster)
*	            switches it all: with it off nothing here sends anything.
*
*	            ".deposit" stores the common items a bot carries (gems, runes; of the potions ONLY the rejuvenation potions: the user, 2026-11-16) in the mod's own storage, so they stop filling the pack. A bot sends it
*	            EVERY TIME IT IS IN TOWN: on arrival (Quartermaster.tick, from the Follower main loop and the team wait), at the start of its stash step (Town.stash) and
*	            at the start of a game (Pack.freePickupArea), at most every 20 seconds.
*
*	            NO TWO BOTS SEND IT AT THE SAME MOMENT (the user, 2026-11-16: "it's important that somehow the bots don't fire that command at the same time"). The old
*	            stagger (a turn by the bot's place in the team, 4 seconds apart) held only for the first two minutes of a game and not for emergency visits: 145 of 400
*	            sends on 2026-11-16 were within 2 seconds of another bot's, all of them party trips where the whole team arrives together. Now every send takes a LOCK
*	            first, made of one small file per bot (data/qm.<profile>.json, written by that bot alone, so no two bots ever write the same file): {req: when it asked,
*	            busy: when it took the lock (0 = not holding it), done: when it last finished, at: its heartbeat}. A bot may send when no other bot is sending, none finished
*	            within `gap` ms, and no other bot asked before it (the order is by request time, then by name); having taken the lock it waits `settle` ms and looks again, and
*	            gives the lock back if a bot that is ahead of it has taken it too. A waiting bot refreshes its heartbeat every `beat` ms; a bot whose heartbeat is older than
*	            `aliveFor` ms (crashed, or left the game) is ignored, and so is a lock held for more than `busyFor` ms. A bot that waits longer than `maxWait` ms gives up for
*	            this time. UNTESTED in a game; the rules are simulated in
*	            scripts/jstest/quartermaster_test.js with five bots reading the files at the same moment.
*/

var Quartermaster = {
	// HOLY GRAIL PROGRESS (user, 2026-11-13): the mod prints "Congratulations! You are __% complete on your Holy Grail quest." This is NOT a chat message
	// (the user: it is a client-side print, and handling it might even crash the bot), so a bot does NOT listen for it: there is deliberately no
	// chatmsg listener here. Qolbot's Activity list can show a "Grail: <text>" log line (activity.go) if a safe way to get the text is ever found.

	last: 0,
	skip: false,         // set by the town chicken thread: an emergency visit to heal never deposits on arrival (it delayed one by ten seconds and broke a walk)
	wasTown: false,
	arrivedAt: 0,
	lastDone: 0,         // when this bot's last .deposit ended (the lock's `done`)

	enabled: function () {
		return !!Config.UsesQuartermaster;
	},

	// THE LOCK
	lock: {
		gap: 1200,       // between the end of one bot's .deposit and the start of the next one's (the command itself takes about 2 seconds)
		busyFor: 12000,  // a lock held for longer than this is taken to be a crashed bot's
		aliveFor: 10000, // a bot whose heartbeat is older than this is gone: its request and its lock do not count
		beat: 3000,      // a waiting bot refreshes its heartbeat this often
		settle: 400,     // after taking the lock, wait this long and look again before sending
		maxWait: 45000,  // the longest a bot waits for its turn

		path: function (name) {
			return "data/qm." + name + ".json";
		},

		readOf: function (name) {
			var rec;

			try {
				rec = FileTools.exists(this.path(name)) ? JSON.parse(FileTools.readText(this.path(name))) : {};
			} catch (e) {
				rec = {};
			}

			rec.name = name;
			rec.req = rec.req || 0;
			rec.busy = rec.busy || 0;
			rec.done = rec.done || 0;
			rec.at = rec.at || 0;

			return rec;
		},

		// the other bots of the team
		others: function () {
			var names = [], list = [], i;

			try {
				list = typeof Team === "object" && Team.expected ? Team.expected() : [];
			} catch (e) {
				list = [];
			}

			for (i = 0; i < list.length; i += 1) {
				if (list[i] !== me.profile && names.indexOf(list[i]) === -1) {
					names.push(list[i]);
				}
			}

			return names.map(function (n) { return Quartermaster.lock.readOf(n); });
		},

		write: function (st) {
			try {
				FileTools.writeText(this.path(st.name), JSON.stringify({req: st.req, busy: st.busy, done: st.done, at: st.at}));
			} catch (e) {
				print("Quartermaster: cannot write my lock file: " + e);
			}
		},

		// who goes first: the earlier request, then the name
		before: function (a, b) {
			return a.req !== b.req ? a.req < b.req : a.name < b.name;
		},

		// "go" when nothing stands in the way of `st` (this bot's record), "wait" when something does
		decide: function (st, others, now) {
			var i, o, alive, busy, asking;

			for (i = 0; i < others.length; i += 1) {
				o = others[i];
				alive = o.at > 0 && now - o.at < this.aliveFor;
				busy = alive && o.busy > 0 && now - o.busy < this.busyFor;
				asking = alive && o.req > 0;

				if (busy && !(st.busy > 0 && this.before(st, o))) {
					return "wait"; // somebody is sending, and I am not ahead of it
				}

				if (o.done > 0 && now - o.done < this.gap) {
					return "wait"; // somebody has only just finished
				}

				if (asking && !busy && this.before(o, st)) {
					return "wait"; // somebody asked before me
				}
			}

			return "go";
		},

		// one look at the others: "wrote" (st changed: write it), "go" (the lock is mine: send) or "wait"
		step: function (st, others, now) {
			if (st.phase === 0) {
				if (this.decide(st, others, now) === "go") {
					st.busy = now;
					st.phase = 1;
					st.goAt = now + this.settle;

					return "wrote";
				}

				return "wait";
			}

			if (now >= st.goAt) {
				if (this.decide(st, others, now) === "go") {
					return "go";
				}

				st.busy = 0; // a bot ahead of me took it too: back in the queue
				st.phase = 0;

				return "wrote";
			}

			return "wait";
		}
	},

	// wait for the lock: the bot's record when it is mine, null when I gave up (left town, or waited too long)
	acquire: function (maxMs) {
		var start = Date.now(), now, st, r, jitter = 0, i;

		for (i = 0; i < me.profile.length; i += 1) {
			jitter = (jitter * 31 + me.profile.charCodeAt(i)) % 90; // a little of its own, so the bots do not look at the same instants
		}

		st = {name: me.profile, req: start, busy: 0, done: this.lastDone, at: start, phase: 0, goAt: 0};
		this.lock.write(st);

		for (;;) {
			now = Date.now();

			if (now - start > maxMs || !me.inTown || !me.gameReady) {
				st.req = 0;
				st.busy = 0;
				st.at = now;
				this.lock.write(st);

				return null;
			}

			r = this.lock.step(st, this.lock.others(), now);

			if (r === "go") {
				return st;
			}

			if (r === "wrote" || now - st.at >= this.lock.beat) {
				st.at = now; // a write is a heartbeat too
				this.lock.write(st);
			}

			delay(150 + jitter);
		}
	},

	release: function (st) {
		st.req = 0;
		st.busy = 0;
		st.done = Date.now();
		st.at = st.done;
		this.lastDone = st.done;
		this.lock.write(st);
	},

	// Called often from the loops a bot idles in: sends .deposit once per arrival in town
	tick: function () {
		if (!this.enabled()) {
			return;
		}

		if (!me.inTown) {
			this.wasTown = false;

			return;
		}

		if (!this.wasTown && me.gameReady) {
			this.wasTown = true;
			this.arrivedAt = Date.now();
			this.deposit();
		}
	},

	// potions in the belt (the belt is not the pack: .deposit is meant to take the pack's potions only)
	beltPotions: function () {
		var i, n = 0, items = me.getItems() || [];

		for (i = 0; i < items.length; i += 1) {
			if (items[i].mode === 2 && items[i].itemType >= 76 && items[i].itemType <= 81) { // mode 2 = in the belt (location 2 is not what a belt item reports)
				n += 1;
			}
		}

		return n;
	},

	// beforeStash: called by Town.stash and Pack.freePickupArea. An emergency visit of the town chicken thread (skip) does not deposit on arrival, but when it
	// stashes, .deposit comes first (the user, 2026-11-14: "they should run .deposit before they try to stash"; live 21:58:16, Meir stashed a Rejuvenation Potion and a
	// Flawed Topaz on a heal visit). Only with "Using Quartermaster?" on. Every send waits for its turn (the lock above), an emergency visit for 20 seconds at most.
	deposit: function (beforeStash) {
		var before, beltBefore, st;

		if ((this.skip && !beforeStash) || !this.enabled() || !me.inTown || !me.gameReady || Date.now() - this.last < 20000) {
			return false;
		}

		this.last = Date.now();

		st = this.acquire(this.skip ? 20000 : this.lock.maxWait);

		if (!st) {
			print("Quartermaster: no turn for .deposit (" + (me.inTown ? "waited too long" : "left town") + "): not sent this time.");

			return false;
		}

		try {
			before = me.itemcount;
			beltBefore = this.beltPotions();
			say(".deposit");
			delay(1500 + 2 * me.ping); // the mod answers in the game, the items leave the pack

			print("Quartermaster: .deposit sent (" + before + " items before, " + me.itemcount + " after; belt potions " + beltBefore + " before, " + this.beltPotions() + " after; waited " + Math.round((Date.now() - st.req) / 100) / 10 + " s for my turn).");

			// Safety: if the belt lost potions, .deposit takes more than the pack and a bot would go out with an empty belt. Stop using it for this game.
			// ...but only when the item count fell by as much too: a game that is closing (the leader quit, Qolbot is restarting the team) reports an empty belt
			// while nothing was taken (Sankt, 2026-11-13 16:09:17: belt 8 -> 0 with 22 items before and after: a false alarm)
			if (this.beltPotions() < beltBefore && me.itemcount <= before - (beltBefore - this.beltPotions())) {
				Config.UsesQuartermaster = false;
				print("Quartermaster: problem: .deposit also took potions out of my belt (" + beltBefore + " -> " + this.beltPotions() + "). Not using it again in this game.");
			}
		} finally {
			this.release(st);
		}

		return true;
	}
};
