/**
*	@filename	Gold.js
*	@desc		Gold sharing (2026-11-13, user idea): a bot in town whose purse is nearly empty asks the team for gold in chat; every other bot that
*	            is in town with gold to spare drops some beside it, and the asker picks it up. Nobody is made poor: a donor keeps a reserve and gives at
*	            most half of what is above it, once per request. Called from the town idle loops (Follower main loop, Team.waitForTeam) through
*	            Gold.tick(). UNTESTED in a game (no JS engine here).
*
*	            The log lines "Gold: gave N gold to X." and "Gold: received N gold." feed the Activity tab (cmd/qolbot/activity.go).
*	            If a gold pickup mod picks the dropped gold up again for the donor, the donor says so ("took it back"): that mod should not pick up
*	            in town.
*/

include("common/Speech.js");
include("common/Throttle.js");

var Gold = {
	low: 1500,         // inventory plus stash below this: ask (it was 400: Xena sat at 275-800 gold, could not pay for repairs or potions and never asked, 2026-11-14)
	minToGive: 1000,   // a bot with less than this (inventory plus stash) gives nothing at all (the user, 2026-11-13)
	reserve: 600,      // a donor keeps at least this much (inventory plus stash). It was 1500: Xena had 1708 and could not give Barabas the 300 he needed
	least: 200,        // a gift is not worth the walk below this
	most: 1000,        // the most one donor drops at once
	needs: {},         // who asked: nick -> when
	gave: {},          // nick -> when I last gave them gold
	askedAt: 0,
	asks: 0,           // requests made in this game (at most 4)

	total: function () {
		return me.getStat(14) + me.getStat(15);
	},

	// GOLD HUNT (2026-11-13, overnight): the hunt ends when EVERY bot holds Config.HuntGoal, but the leader loots most of the gold (Sankt had 18,737 while Barabas
	// had 3,703 and the hunt could not end). During a hunt a bot below the goal asks, and a bot above it hands over what it has above the goal. Outside a hunt
	// (Config.HuntGoal 0) nothing here changes.
	huntGoal: function () {
		return typeof Config === "object" && Config.hasOwnProperty("HuntGoal") && Config.HuntGoal > 0 ? Config.HuntGoal : 0; // hasOwnProperty: no strict warning outside a hunt
	},

	// what a donor keeps: the reserve, or the hunt goal during a hunt
	floor: function () {
		return Math.max(this.reserve, this.huntGoal());
	},

	// who asked for gold: the "needgold" keyword in the bots' message log (Team.take), not the public chat
	listen: function () {
		var msgs, i;

		if (typeof Team !== "object" || !Team.take) {
			return;
		}

		msgs = Team.take("gold", null, ["needgold"]);

		for (i = 0; i < msgs.length; i += 1) {
			Gold.needs[msgs[i].from] = Date.now();
			print("Gold: " + msgs[i].from + " asks for gold (I have " + Gold.total() + ").");
		}
	},

	// Before the town chores: gold in the pack pays for scrolls, potions and repairs, gold in the stash does not. With PlugY the stash holds gold
	// too (the bots put it there when the pack gets full): take what the chores need out first. (A bot is often "broke" with plenty in its stash.)
	// PlugY's SHARED gold side is not used: this install has ActiveSharedStashInMultiPlayer=0, so it does not exist in the bots' TCP/IP games.
	topUp: function (want) {
		var take;

		if (!me.inTown || me.getStat(14) >= want || me.getStat(15) <= 0) {
			return false;
		}

		take = Math.min(want - me.getStat(14), me.getStat(15));

		try {
			if (Town.openStash()) {
				gold(take, 4);
				delay(800);
				me.cancel();
				print("Gold: took " + take + " gold out of my stash for the chores.");

				return true;
			}
		} catch (stashError) {
			print("Gold: could not take gold out of the stash (" + stashError + ")");
			me.cancel();
		}

		return false;
	},

	// A bot short of gold that has teammates in town waits a little (at most `ms`) for them to answer, so the gold arrives before the run starts
	// and not after the team has left town (the leader used to leave within 5 seconds of the team arriving).
	settle: function (ms) {
		var end = Date.now() + ms, start = me.getStat(14);

		// also while a teammate has asked and I have gold to spare (the leader used to walk out of town 5 seconds after the team arrived)
		// (it waits for its own gold only while somebody who could give is here, after a first 8 seconds of grace: they may still be arriving)
		while (Date.now() < end && me.inTown && ((this.total() < this.low && (this.donorHere() || Date.now() - end + ms < 8000)) || (Object.keys(this.needs).length > 0 && this.total() >= this.minToGive && this.total() - this.reserve >= this.least))) {
			this.tick();
			delay(1000);
		}

		// the gold came after the chores: spend the first of it on town portal scrolls now (a leader without any cannot even go back to town)
		if (me.inTown && me.getStat(14) > start && me.getStat(14) >= 100) {
			try {
				Town.fillTome(518);
			} catch (scrollError) {
				print("Gold: could not buy scrolls (" + scrollError + ")");
				me.cancel();
			}
		}
	},

	tick: function () {
		if (!me.inTown || !me.gameReady || me.dead) {
			return;
		}

		this.listen();

		try {
			this.ask();
			this.help();
			this.collect();
		} catch (goldError) {
			print("Gold: " + goldError);
			me.cancel();
		}
	},

	// Is a teammate who COULD give standing in this town right now? (it is in my area and its purse file says it has the gold to spare). Asking when nobody
	// is here only fills the chat: the team has moved on into the field (the user saw requests nobody answered, 2026-11-13).
	donorHere: function () {
		var i, names = [], unit, purse;

		try {
			names = typeof Team === "object" && Team.expected ? Team.expected() : [];
		} catch (teamError) {
			names = [];
		}

		for (i = 0; i < names.length; i += 1) {
			if (names[i] === me.profile) {
				continue;
			}

			unit = getUnit(0, names[i]); // a player in my area (the profile and the character share their name here)

			if (!unit) {
				continue;
			}

			try {
				purse = JSON.parse(FileTools.readText("data/" + names[i] + ".purse.json"));
			} catch (readError) {
				continue;
			}

			if (purse && purse.gold + purse.stash >= this.minToGive && purse.gold + purse.stash - this.floor() >= this.least) {
				return true;
			}
		}

		return false;
	},

	// my purse is nearly empty: ask, again every 25 seconds up to 4 times a game (the first request often comes before the others have joined the
	// game: the leader is in town alone, asks, and nobody hears it)
	ask: function () {
		if (this.total() < (this.huntGoal() || this.low) && this.asks < 4 && this.donorHere() && Throttle.due("goldask", 25000)) {
			this.asks += 1;
			this.askedAt = Date.now();
			print("Gold: I am short of gold (" + this.total() + "): asking the team.");
			Speech.say("needGold");
		}
	},

	// A request that is not answered says why (at most one line every 20 seconds): the hunt equalizing did not move any gold for 90 minutes and the reason was not in the log.
	whyNot: function (nick, why) {
		if (Throttle.due("goldwhynot", 20000)) {
			print("Gold: " + nick + " asked; not giving: " + why + ".");
		}
	},

	// give to whoever asked in the last two minutes (once each)
	help: function () {
		var nick, now = Date.now(), have, amount, pl, before, inv;

		for (nick in this.needs) {
			if (!this.needs.hasOwnProperty(nick)) {
				continue;
			}

			if (now - this.needs[nick] > 120000) {
				delete this.needs[nick];

				continue;
			}

			have = this.total() - this.floor();

			if (this.total() < this.minToGive || have < this.least) {
				this.whyNot(nick, "nothing to spare (I have " + this.total() + ", I keep " + this.floor() + ")");

				continue; // nothing to spare: the request stays, in case I earn some within the two minutes
			}

			pl = getUnit(0, nick);

			if (!pl) {
				this.whyNot(nick, "I cannot see them in my town yet");

				continue; // not in my town (yet)
			}

			// on a hunt: everything above the goal (3000 at most, one request is answered once), else half of what is above the reserve
			amount = this.huntGoal() ? Math.min(3000, Math.floor(have / 100) * 100) : Math.min(this.most, Math.floor(have / 2 / 100) * 100);

			if (amount < this.least) {
				amount = this.least;
			}

			delete this.needs[nick];

			// the gold must be in the pack to be dropped: take it out of the stash when it is not
			if (me.getStat(14) < amount && me.getStat(15) > 0) {
				try {
					if (Town.openStash()) {
						gold(Math.min(amount - me.getStat(14), me.getStat(15)), 4);
						delay(800);
						me.cancel();
					}
				} catch (stashError) {
					print("Gold: could not take gold out of the stash (" + stashError + ")");
					me.cancel();
				}
			}

			inv = me.getStat(14);
			amount = Math.min(amount, Math.floor(inv / 100) * 100);

			if (amount < this.least) {
				continue;
			}

			try {
				Pather.moveToUnit(pl, 1, 1);
			} catch (moveError) {
				print("Gold: could not walk to " + nick + " (" + moveError + ")");
			}

			before = me.getStat(14);
			gold(amount); // drops gold from the pack onto the ground
			delay(1000);
			print("Gold: gave " + amount + " gold to " + nick + ".");
			this.gave[nick] = Date.now();

			Town.move("portalspot"); // walk off: a gold pickup mod would otherwise take it straight back

			delay(1500);

			if (me.getStat(14) > before - amount / 2) {
				print("Gold: problem: the gold I dropped for " + nick + " came straight back to me (a gold pickup mod that works in town?).");
			}
		}
	},

	// I asked lately: pick up the gold lying about in town
	collect: function () {
		var item, list = [], i, tries, before, start;

		if (Date.now() - this.askedAt > 180000) {
			return;
		}

		item = getUnit(4, 523);

		if (item) {
			do {
				if ((item.mode === 3 || item.mode === 5) && getDistance(me, item) < 40) {
					list.push(copyUnit(item));
				}
			} while (item.getNext());
		}

		start = me.getStat(14);

		for (i = 0; i < list.length && i < 6; i += 1) {
			for (tries = 0; tries < 3 && getUnit(4, -1, -1, list[i].gid); tries += 1) {
				before = me.getStat(14);

				if (getDistance(me, list[i]) > 3) {
					Pather.moveTo(list[i].x, list[i].y, 0);
				}

				Misc.click(0, 0, list[i]);
				delay(600);

				if (me.getStat(14) > before) {
					break;
				}
			}
		}

		if (me.getStat(14) > start) {
			print("Gold: received " + (me.getStat(14) - start) + " gold.");
			this.askedAt = 0;

			// spend the first of it on town portal scrolls AT ONCE and save: a bot that walks out of town with the gold and no scrolls leaves the game
			// to restock, and the gold (not saved yet) is gone with the game (Barabas, 2026-11-13: 500 gold lost that way)
			try {
				if (me.getStat(14) >= 100) {
					Town.fillTome(518);
				}

				if (typeof Saver === "object") {
					Saver.soon("received gold");
				}
			} catch (receiveError) {
				print("Gold: could not buy scrolls after receiving gold (" + receiveError + ")");
				me.cancel();
			}
		}
	}
};
