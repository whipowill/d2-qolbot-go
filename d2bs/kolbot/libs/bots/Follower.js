/*
* Follower by kolton
* To initiate the follow sequence make a TP and send command "1".
*
* Commands:
* Main commands:
*	1 - take leader's tp from town / move to leader's town
*	2 - take leader's tp to town
*	3 - town manager
*	c - get corpse
*	p - pick items
*	s - toggle stop
*	<charname> s - toggle stop <charname>
* Attack:
*	a - attack toggle for all
*	<charname> a - attack toggle for <charname>
*	aon - attack on for all
*	<charname> aon - attack on for <charname>
*	aoff - attack off for all
*	<charname> aoff - attack off for <charname>
* Teleport: *** characters without teleport skill will ignore tele command ***
*	tele - toggle teleport for all
*	<charname> tele - toggle teleport for <charname>
*	tele on - teleport on for all
*	<charname> tele on -  teleport on for <charname>
*	tele off - teleport off for all
*	<charname> tele off - teleport off for <charname>
* Skills: *** refer to skills.txt ***
*	all skill <skillid> - change skill for all. refer to skills.txt
*	<charname> skill <skillid> - change skill for <charname>
*	<class> skill <skillid> - change skill for all characters of certain class *** any part of class name will do *** for example: "sorc skill 36", "zon skill 0", "din skill 106"
* Auras: *** refer to skills.txt ***
*	all aura <skillid> - change aura for all paladins
*	<charname> aura <skillid> - change aura for <charname>
* Town:
*	a2-5 - move to appropriate act (after quest) !NOTE: Disable 'no sound' or game will crash!
*	talk <npc name> - talk to a npc in town
* Misc.
*	cow - enter red cow portal
*	wp - all players activate a nearby wp
*	<charname> wp - <charname> activates a nearby wp
*	bo - barbarian precast
*	<charname> tp - make a TP. Needs a TP tome if not using custom libs.
*	move - move in a random direction (use if you're stuck by followers)
*	reload - reload script. Use only in case of emergency, or after editing character config.
*	quit - exit game
*/

include("common/Report.js");
include("common/Plan.js");
include("common/PartySync.js");
include("common/Respec.js");
include("common/ActTravel.js");
include("common/Speech.js");
include("common/Waypoints.js");
include("common/Throttle.js");
include("common/Gold.js");
include("common/Chores.js");
include("common/Pack.js");
include("common/Saver.js");
include("common/PlugY.js");
include("common/QuestItems.js");
include("common/Quester.js");
include("common/Team.js");

function Follower() {
	var i, j, stop, leader, leaderUnit, charClass, piece, skill, result, unit, player,
		commanders = Config.LeaderOptions,
		attack = true,
		holdSince = 0, // when the leader said "hold" (Team.holdAndGather); a hold that is never lifted ends after a minute
		openContainers = true,
		classes = ["amazon", "sorceress", "necromancer", "paladin", "barbarian", "druid", "assassin"],
		action = "";

	// Town chores, but only the trips that are worth making. The first visit of a game does everything once (including
	// the quest sweep); later visits do only what is needed (heal, repair, potions, scrolls, identify, stash, revive,
	// equip, spend points), and say which. Nothing needed = no walking and no chat.
	this.choresRun = false;
	Report.mixin(this, "Follower"); // this.log / this.note / this.problem, written under the Follower's own name

	// Druids summon their minions in town too, so they walk out with them.
	this.townSummon = function () {
		if (me.classid !== 5 || !me.inTown) {
			return;
		}

		try {
			Precast.summonDruid();

			if (typeof ClassAttack === "object" && ClassAttack.standOffShape) {
				ClassAttack.standOffShape(); // a Summon Druid goes out in bear form, shifted in town (the user, 2026-11-15: "i put it on in town")
			}
		} catch (summonError) {
			print("Follower: town summon: " + summonError);
		}
	};

	this.doChores = function (force) {
		Team.markBusy(150000); // the leader does not leave town while I am at my chores (Team.waitToLeaveTown); the mark expires by itself

		try {
			return this.doChoresRun(force);
		} finally {
			Team.clearBusy();
		}
	};

	// the town part of my started quests, when one of this town has moved on (Quester.townQuestsOpen), and the rewards waiting at the quest NPCs. True when
	// it talked. Quest objective, or a person leading.
	this.townQuestTalk = function () {
		// Whatever the goal or the mode (the user, 2026-11-16: "whenever bots are in town -- even if they are followers of a real player -- they should consider what quests
		// they are on and what NPC they should talk to to complete those quests"): no check of the objective or of who leads.
		if (!me.inTown || typeof Quester !== "object" || typeof Quester.townQuestsOpen !== "function" || !Quester.townQuestsOpen()) {
			return false;
		}

		Team.markBusy(90000);
		Quester.townQuestsAt = Date.now();
		print("Follower: a quest of this town moved on: talking to the quest NPCs before I say ready.");

		try {
			Quester.townStartedOnly = true;
			Quester.runQuests(true);
			Quester.questNpcs();

			Quester.quests.forEach(function (row) { // the quests of this town with a reward waiting: not again for two minutes (Quester.townQuestsOpen)
				if (Quester.questPending(row[3])) {
					Quester.pendingTalkAt[row[3]] = Date.now();
				}
			});
		} catch (talkError) {
			print("Follower: quests in town: " + talkError);
			me.cancel();
		} finally {
			Quester.townStartedOnly = false;
			Team.clearBusy();
		}

		return true;
	};

	this.doChoresRun = function (force) {
		this.townSummon();

		var first = !this.choresRun,
			reasons = Chores.needed(first);

		if (!force && reasons && reasons.length === 0) {
			print("Follower: nothing to do in town.");

			return true;
		}

		this.note("Running town chores" + (reasons && reasons.length ? " (" + reasons.join(", ") + ")" : "") + ".");

		// gold for the chores first: the pack may be empty while the stash is not
		try {
			Gold.topUp(2000);
		} catch (goldError) {
			print("Gold: " + goldError);
			me.cancel();
		}

		// do chores
		Town.doChores();

		// quest NPCs: talk to the ones that have something for me (a reward waiting, an item they want), as often as they
		// need, and use what they hand over. Does nothing when nothing is waiting.
		try {
			Quester.questNpcs();
		} catch (questError) {
			if (me.gameReady) { // a game that ends in the middle of a talk throws "Object is not an item!": that is the game closing, not a fault (Sankt, 2026-11-14 09:30:44)
				print("Follower: quest NPCs: " + questError);
				me.cancel();
			}
		}

		// EVERY bot completes its quests, not just the leader (user, 2026-11-13: only the leaders were finishing quests; Xena stayed "not done" for Blade of the
		// Old Religion while Sankt led it). A follower does the TOWN part of every quest it has not completed (the NPC talks, never the field work: every quest
		// script keeps that behind !is_town_only), on every visit to town (at most every 4 minutes). Quest mode only.
		// Not "at most every 4 minutes" any more: whenever a quest of this town has moved on since the bot last talked for it (Quester.townQuestsOpen, which
		// remembers the state of each talk, so the same state is never talked for twice). Live 18:42 on Nightmare: the followers came back to town after
		// Blood Raven died, but had talked less than 4 minutes before, so the Kashya hand-in waited for the next game (the user: "make the followers talk
		// to the NPC and complete the quests when they return from town just like the leader does").
		// With you leading ("I'm playing": the plan's partySync is off) always, whatever the hidden Objective says (the user, 2026-11-15: "for real player mode,
		// the bots just need to always pick up quest items (and use them if they can) and when in town talk to the proper NPCs").
		if ((Date.now() - Quester.townQuestsAt > 240000 || (typeof Quester.townQuestsOpen === "function" && Quester.townQuestsOpen())) && typeof Quester.runQuests === "function") {
			Quester.townQuestsAt = Date.now();

			try {
				Quester.townStartedOnly = true; // only quests that have started for me: no talking to NPCs for nothing
				Quester.runQuests(true);
			} catch (townQuestError) {
				print("Follower: quests in town: " + townQuestError);
				me.cancel();
			}

			Quester.townStartedOnly = false;
		}

		this.choresRun = true;

		// Auto Respec: points that do not fit the build are taken back once (PlugY) so the check below spends them again
		if (Config.AutoSkill.Enabled && typeof Respec === "object") {
			try {
				Respec.maybe();
			} catch (respecError) {
				print("Respec: " + respecError);
				me.cancel();
			}
		}

		// check skill points to spend
		if (Config.AutoSkill.Enabled && me.getStat(5) > 0) {
			AutoSkill.init(Config.AutoSkill.Build, Config.AutoSkill.Save);
		}

		// Auto Respec, the stat points (same setting): stats above where the template would put them are taken back once, so AutoStat spends them again
		if (Config.AutoStat.Enabled && typeof Respec === "object") {
			try {
				Respec.maybeStats();
			} catch (respecStatError) {
				print("Respec: " + respecStatError);
				me.cancel();
			}
		}

		// check stat points to spend
		if (Config.AutoStat.Enabled && me.getStat(4) > 0) {
			AutoStat.init(Config.AutoStat.Build, Config.AutoStat.Save, Config.AutoStat.BlockChance, Config.AutoStat.UseBulk);
		}

		// in the Act 4 town without Mephisto's Soulstone (and Hell's Forge not done): Cain gives one
		try { Quester.cainSoulstone(); } catch (cainError) { print("Quester: Cain: " + cainError); me.cancel(); }

		// move to portal
		Town.move("portalspot");

		Team.markReady();

		// report
		this.note("Ready.");

		return true;
	};

	// Follow the leader between town and the field without being told: when the leader walks out of town, takes a
	// waypoint or opens a portal, the bot follows; when the leader comes back to town, so does the bot (and it runs
	// its chores). Replaces typing "1" (go out) and "2" (go to town) by hand.
	// true when automatic following moved this bot a moment ago (a "1"/"2" chat command for the same trip must not repeat it)
	this.lastFollowAt = 0;

	this.followedRecently = function () {
		return Config.AutoTown !== false && Date.now() - this.lastFollowAt < 20000;
	};

	// Can this character travel to that act? (it must have finished the quests that open it). Says so, once, when not.
	this.actOpen = function (act) {
		var open = true;

		try {
			open = !!Pather.accessToAct(act);

			if (!open) { // the copy of the quest data may be old: ask the server for a fresh one before giving up
				sendPacket(1, 0x40);
				delay(600);
				open = !!Pather.accessToAct(act);
			}
		} catch (e) {
			open = true; // cannot tell: try anyway
		}

		this.actSaid = this.actSaid || {};

		if (!open && !this.actSaid[act]) {
			this.actSaid[act] = true;
			this.problem("I cannot follow you to act " + act + ": I have not unlocked it yet.");
			print("Follower: act " + act + " is not open for " + me.name);
		}

		return open;
	};

	// Get to another act's town. A waypoint only lists acts this character has already visited, so a first trip up
	// (you just killed the act boss) goes the way a player does: through the act's NPC (Warriv, Meshif, ...).
	this.travelToAct = function (act) {
		return ActTravel.go(act);
	};

	// The leader is in another act: get to that act's town (waypoint, else the act's NPC when going up).
	// Act 4 is opened for a character by stepping through the red portal in Mephisto's lair (the game sets "able to go to Act 4" in the Pandemonium
	// Fortress; credit for The Guardian is not enough: only the leader had gone through on 2026-11-14 10:39 and the rest could not follow). So a
	// follower whose leader is in Act 4 walks there itself: the Durance of Hate waypoint, level 3, the spot Mephisto.js uses, the red portal (it stays
	// open for the rest of the game once Mephisto is dead). At most one try in two minutes. UNTESTED in a game.
	this.redPortalToAct4 = function () {
		if (Date.now() - (this.redTriedAt || 0) < 120000) {
			return false;
		}

		this.redTriedAt = Date.now();
		this.note("Going to Mephisto's lair for the red portal to Act 4.");

		try {
			// Already in the lair (the leader gathers the team at the portal and sends it through first): straight to the portal. The trip to town first
			// made a party trip of it and the town order ended it (live 2026-11-15 20:25:15, Darius). UNTESTED in a game.
			if (me.area !== 102) {
				if (me.area !== 101) {
					Town.goToTown(3);
					Pather.useWaypoint(101);
					Precast.doPrecast(true);
				}

				if (!Pather.moveToExit(102, true)) {
					throw new Error("cannot get to the Durance of Hate Level 3");
				}
			}

			Pather.moveTo(17590, 8068);
			delay(1500);
			Pather.moveTo(17601, 8070);
			Pather.usePortal(null);
		} catch (redError) {
			print("Follower: the red portal to Act 4: " + redError);
		}

		return me.act === 4;
	};

	this.followToAct = function (act) {
		// The act just above mine is always tried, "open" or not: the trip through its NPC or portal is what opens it (a character's Act 4 bit is set by
		// entering the Pandemonium Fortress; the gate refused the very trip that sets it: Barabas, Sankt and Xena, 2026-11-14 10:39). The final quest of each
		// act ends with the leader moving up, so the followers go up with it.
		if (act !== me.act + 1 && !this.actOpen(act)) {
			return false;
		}

		if (act === me.act + 1 && !Pather.accessToAct(act) && act === 4) {
			// Act 3 -> 4: the red portal in Mephisto's lair, with the team only (the user, 2026-11-15: "either way the team has to do mephisto again to go thru the
			// red portal"). From the lair (the leader brought the team there) I go through; from town I never go alone (live 20:41: Darius tried every 20 s, the town
			// gate held him, the leader waited in Act 4 for good). I wait in town and say "noact 4" on the message log (the user: "the followers can report it as such
			// in the internal chat"); the leader brings the team back for Mephisto (Team.noActMates, Quester.runQuests). UNTESTED in a game.
			if ([101, 102].indexOf(me.area) > -1) {
				return this.redPortalToAct4();
			}

			if (Date.now() - (this.noAct4Said || 0) > 60000) {
				this.noAct4Said = Date.now();
				Team.post("noact", [4]);
				print("Follower: Act 4 is not open for me: I told the leader, and wait in town for the team to come back for Mephisto and the red portal.");
			}

			return false;
		}

		if (Date.now() - (this.travelFailedAt || 0) < 30000) {
			return false; // failed a moment ago: do not repeat it every few seconds
		}

		this.lastFollowAt = Date.now(); this.note("Going to my leader's town.");

		if (!this.travelToAct(act)) {
			this.travelFailedAt = Date.now();
		}

		if (me.act === act && me.inTown) { // a new act's town: see whether its quest NPCs have anything for me
			try {
				this.doChores();
			} catch (choreError) {
				print("Follower: chores after travel: " + choreError);
			}
		}

		if (me.act !== act && !this.cannotReachSaid) {
			this.cannotReachSaid = true;
			this.problem("I could not get to act " + act + " (no waypoint, and the act NPC did not take me).");
		}

		return true;
	};

	// Keep about `keep` units from the leader, on a spot I can stand on. Moves only when too close or too far.
	this.standAway = function (leaderUnit, keep) {
		var d = getDistance(me.x, me.y, leaderUnit.x, leaderUnit.y), i, angle, x, y;

		if (d >= keep - 6 && d <= keep + 6) {
			return true;
		}

		for (i = 0; i < 8; i += 1) {
			angle = Math.random() * 2 * Math.PI;
			x = Math.round(leaderUnit.x + Math.cos(angle) * keep);
			y = Math.round(leaderUnit.y + Math.sin(angle) * keep);

			if (Attack.validSpot(x, y)) {
				return Pather.moveTo(x, y);
			}
		}

		return false;
	};

	// Remember each trip out of town. A bot that keeps going out and ending up back in town (a portal that leads nowhere
	// useful, a leader who moved on) stops trying for a minute instead of looping forever.
	this.noteFollow = function (how, fromArea) {
		var now = Date.now(), recent;

		this.followTrips = (this.followTrips || []).filter(function (t) { return now - t < 40000; });
		this.followTrips.push(now);
		print("Follower: follow " + how + ": area " + fromArea + " -> " + me.area + " (leader in " + (leader ? leader.area : "?") + "), trip " + this.followTrips.length + " in 40s");

		if (this.followTrips.length >= 4) {
			this.followPausedUntil = now + 60000;
			this.followTrips = [];
			this.problem("I keep going out and ending up back in town. I will wait here a minute: open a new portal, or say the word.");
		}
	};

	this.autoFollow = function () {
		var townAreas = [1, 40, 75, 103, 109], leaderInTown, fromArea, dest, leaving;

		if (!me.gameReady) {
			return false; // a portal or waypoint trip is still loading: me.inTown and me.area are not settled yet
		}

		if (!leader || !leader.area || me.dead) {
			return false; // area 0: the leader is loading a new area
		}

		if (Date.now() < (this.followPausedUntil || 0)) {
			return false;
		}

		if (getUIFlag(0x14) || getUIFlag(0x08) || getUIFlag(0x0C)) {
			me.cancel(); // a waypoint, inventory or NPC window left open would block every move
		}

		leaderInTown = townAreas.indexOf(leader.area) > -1;

		// The leader says "leaving" with a destination in the field when it leaves town (Team.announceLeaving): go with it now, not after it has gone (the team leaves
		// town as one unit, the user, 2026-11-14). From here on `dest` is where the leader is, or says it is going.
		dest = leader.area;

		if (me.inTown && leaderInTown) {
			leaving = Team.leavingCall();

			if (leaving && leaving.area && townAreas.indexOf(leaving.area) < 0 && leaving.area !== me.area) {
				dest = leaving.area;
				leaderInTown = false;
				this.leavingAt = Date.now(); // the leader is still in town for a moment: do not follow it "back" there (below)
				this.leavingBy = leaving.by || ""; // how it goes: by "waypoint", a follower never walks an exit instead (below)
				this.note("The leader is leaving for " + Pather.getAreaName(dest) + ": going with it.");
			}
		}

		if ((this.lastLeaderArea || 0) !== leader.area) {
			this.lastLeaderArea = leader.area;
			this.cannotReachSaid = false;
			this.askedAt = 0;
			this.noWayAt = 0;
		}

		if (me.inTown) {
			// THE LEADER'S "PROCEED": go out through the portal it names NOW (the user, 2026-11-15: "the entire team should always be together in the field.
			// always. no exceptions"). Its own portal (it goes last: Team.sendOutFirst), or the portal it is about to take, somebody else's (a Sorceress's
			// Quick Travel portal, a waypoint helper's: owner). Read whether the leader is still in town or has just gone through.
			var returnCall = Team.returnCall(leader.name); // the leader's call only

			if (returnCall && returnCall.area !== me.area) {
				this.lastFollowAt = Date.now();
				this.log("The leader sends the team out through " + (returnCall.owner || leader.name) + "'s portal."); // the log only (the user, 2026-11-16: "the chat output 'the leader sends the team out thru ___ portal' isn't necessary")

				try {
					if (!this.flee(function () { return Pather.usePortal(returnCall.area || null, returnCall.owner || leader.name) || (returnCall.area && Pather.usePortal(returnCall.area, null)); })) {
						print("Follower: could not take " + (returnCall.owner || leader.name) + "'s portal" + (returnCall.area ? " to " + Pather.getAreaName(returnCall.area) : ""));
						Team.portalRefused(returnCall.area, returnCall.owner || leader.name); // gated, or ask the leader for a new portal
					}
				} catch (returnError) {
					print("Follower: the portal out: " + returnError);
				}

				if (!me.inTown) {
					FileTools.writeText("data/" + me.profile + ".afterparty.json", JSON.stringify({until: Date.now() + Team.limits.sendOut + 15000})); // do not follow the leader back to town while it sends the others out

					return true;
				}
			}

			if (leaderInTown) {
				if (this.checkLeaderAct(leader) !== me.act) {
					return this.followToAct(this.checkLeaderAct(leader));
				}

				// Qolbot: a quest of this town moved on while I was in town (the leader's hand-in after a party trip: live 21:22, Barabas talked to Tyrael and got
				// Fallen Angel, Xena, Sankt and Darius stood by and did not; the user: "if the whole team had talked to tyrael they all would have gotten it"):
				// talk to the quest NPCs before saying ready. The party trip's chores (TownChicken) have no quest talks; this is the follower's. I am busy while
				// I talk (Team.markBusy), so the leader waits for me before leaving town. UNTESTED in a game.
				if (this.townQuestTalk()) {
					return false;
				}

				Team.markReady(); // idle in town with the leader: the leader's departure wait reads this ("is the team ready?")

				// nothing to do yet: the leader is in town too. Say so for the Status tab (every 8 seconds is enough)
				if (Date.now() - (this.waitNoted || 0) > 8000) {
					this.waitNoted = Date.now();
					print("Waiting for leader");
				}

				return false;
			}

			// the leader is out in the field: an exit of this town, a waypoint, or the leader's portal
			if (this.checkLeaderAct(leader) !== me.act) { // the leader is out in another act: first get to that act's town
				return this.followToAct(this.checkLeaderAct(leader));
			}

			// a Sorceress leader's own Quick Travel trip (QuickTravel.selfTrip, Team.say "solo"; UNTESTED in a game): stay in town at the portal spot, no waypoint
			// or exit after her, until her portal is up; then take it
			var soloCall = Team.soloCall(leader.name);

			if (soloCall) {
				// no portal while she travels: her new one is taken when she is back and sends the team out (Team.returnCall above). Taking "her
				// portal to her area" here took the OLD one (live 23:47:55, Chaos: her Hellforge portal to the River of Flame from the Hephasto run was
				// still open; the team walked from the Hellforge, she waited at the Sanctuary and regrouped)
				if (Date.now() - (this.soloNoted || 0) > 8000) {
					this.soloNoted = Date.now();

					try {
						Town.move("portalspot");
					} catch (spotError) {
						print("Follower: to the portal spot: " + spotError);
					}

					print("Waiting for the leader's portal");
				}

				return false;
			}

			// THE LAST ORDER TRUMPS ALL (Team.order; the user, 2026-11-15): with the leader's newest order "town" (everybody to town: the leader is on its way
			// in, or waits for the team here) or "stay", nobody leaves town toward the field, whatever older order it was carrying out (live 17:33:26:
			// Barabas and Sankt followed Xena's older "leaving for Travincal" after her call to town and stayed there alone). The next "out" sends me.
			var standing = Team.currentOrder();

			if (standing && (standing.word === "town" || standing.word === "stay")) {
				if (Date.now() - (this.orderNoted || 0) > 8000) {
					this.orderNoted = Date.now();
					print("Follower: the leader's last order is \"" + standing.word + "\": waiting in town.");
				}

				return false;
			}

			fromArea = me.area;

			// THE LEADER WENT BY WAYPOINT (the user, 2026-11-15: "the entire team should always be together in the field"): do not walk out of this town to
			// it (an exit next to town can lead to the far end of a big area: live 15:58:33, Spider Forest, 550 units). Its portal (it says "proceed"), the
			// waypoint if I have it, or wait here and ask it for a portal (below).
			var byWaypoint = this.leavingBy === "waypoint" && Date.now() - (this.leavingAt || 0) < 60000;

			if (!byWaypoint && this.checkExit(leader, dest) === 1) {
				this.lastFollowAt = Date.now();
				this.note("Going outside.");

				try {
					this.flee(function () { Pather.moveToExit(dest, true); });
				} catch (exitError) {
					print("Follower: could not take the exit to " + Pather.getAreaName(dest) + " (" + exitError + "), I am in area " + me.area + " at " + me.x + "," + me.y + ", trying again");
					delay(1000);

					return false;
				}

				this.noteFollow("by the exit", fromArea);

				return true;
			}

			if (Date.now() - (this.lastExitTry || 0) < 5000) {
				return false; // one try every few seconds, not a tight loop
			}

			this.lastExitTry = Date.now();

			// THE LEADER MAY HAVE MOVED since `dest` was read: look again right before going out by portal or waypoint, and never go out to an area the
			// leader has left (2026-11-15 09:42:38, Arcane Sanctuary: Barabas took the waypoint out as Darius went to town to regroup, and chickened alone in 9 s)
			if (!this.leavingAt || Date.now() - this.leavingAt > 20000) {
				var fresh = this.getLeader(leader.name);

				if (!fresh || fresh.area !== dest) {
					return false;
				}
			}

			// Qolbot: in this order: (1) a portal that leads where the leader is (its own, or a Sorceress's that it took) and that I can see: the quickest way
			// and the one the leader went by; (2) a waypoint, only if that area HAS one and I have it (it used to try a waypoint first, also for areas without
			// one: "Taking waypoint to Plains Of Despair" before the Sorceress's portal); (3) the portal I came to town by.
			if (Pather.getPortal(dest, leader.name) || Pather.getPortal(dest, null)) {
				if (this.flee(function () { return Pather.getPortal(dest, leader.name) ? Pather.usePortal(dest, leader.name) : Pather.usePortal(dest, null); })) {
					this.lastFollowAt = Date.now(); this.note("Going outside (a portal of the party's).");
					this.noteFollow("through your portal", fromArea);
					this.noWayAt = 0;

					return true;
				}
			}

			try {
				if (this.haveWaypoint(dest) && this.flee(function () { return Pather.useWaypoint(dest, true); })) {
					this.lastFollowAt = Date.now(); this.note("Going outside (waypoint).");
					this.noteFollow("by waypoint", fromArea);
					this.noWayAt = 0;

					return true;
				}
			} catch (wpError) {
				print("Follower: the waypoint to " + Pather.getAreaName(dest) + ": " + wpError);
			}

			// I came to town from the field (the leader went to town and I followed, to heal, repair or clear my pack): back out through a portal that leads where I
			// left. The leader may have gone on deeper since, so this is not "where the leader is now", but the usual following takes me on from there (the exit
			// chain), which is better than standing in town asking for a portal (Xena, 03:28 and 06:32: a retry every 5 s for over a minute).
			if (this.leftFrom && Date.now() - (this.leftAt || 0) < 900000) {
				try {
					if (Pather.getPortal(this.leftFrom, null) && Pather.usePortal(this.leftFrom, null)) {
						this.leftFrom = 0;
						this.lastFollowAt = Date.now();
						this.note("Going outside (the portal I came by).");
						this.noWayAt = 0;

						return true;
					}
				} catch (backError) {
					print("Follower: could not go back through the portal I came by (" + backError + ")");
				}
			}

			// Qolbot: no waypoint to the leader and no portal of the leader's. Keep together: ask the leader (out in the field) to open a portal
			// and stay in town until it does. Ask again now and then (a leader that is mid-fight answers when it can; the leader bot's
			// TownChicken thread does it). A bot never walks out alone to find the leader: that is how it gets killed.
			if (!me.gameReady || !me.inTown) {
				return false; // the portal I just took has already landed me outside: nothing to ask for
			}

			// not at once: a portal takes a few seconds to show (Barabas said "Thou art beyond my reach" at 12:25:03 and took the leader's portal at 12:25:06): look
			// again for 15 seconds before asking, then once a minute (2 minutes was tried and is too long a wait for a leader that was busy fighting)
			if (!this.noWayAt) {
				this.noWayAt = Date.now();

				// a portal is only seen near it (live 2026-11-14 12:34:38: Barabas, Darius and Meir took Meir's portal to the Plains of Despair at once, Sankt
				// stood elsewhere in town, did not see it, and asked for one 16 s later): walk to the spot where portals open, then look again
				try {
					Town.move("portalspot");
				} catch (spotError) {
					print("Follower: could not walk to the portal spot (" + spotError + ")");
				}

				this.lastExitTry = 0;

				return false;
			}

			if (Date.now() - this.noWayAt < 15000) {
				return false;
			}

			if (!this.askedAt || Date.now() - this.askedAt > 60000) {
				// what I can see when I ask (why a portal of the party's was not taken): owner>area, distance, in my D2 party or not
				try {
					var seen = [], pu = getUnit(2, "portal");

					if (pu) {
						do {
							seen.push((pu.getParent() || "red") + ">" + pu.objtype + " d" + Math.round(getDistance(me, pu)) + (pu.getParent() ? (Misc.inMyParty(pu.getParent()) ? " party" : " NOT-party") : ""));
						} while (pu.getNext());
					}

					print("Follower: no way to " + Pather.getAreaName(dest) + " (leader " + leader.name + "); I am at " + me.x + "," + me.y + "; portals in view: " + (seen.length ? seen.join(", ") : "none"));
				} catch (seenError) {
					print("Follower: portals in view: " + seenError);
				}

				this.askedAt = Date.now();
				Speech.say("cannotReach"); // the keyword goes to the team; the words tell the player
			}

			return false;
		}

		if (leaderInTown && !me.inTown && (PartySync.afterParty() || PartySync.tripOn())) { // a party trip is on: the town chicken thread does the trip (PartySync.tripOn)
			return false; // the party trip is over for me and the leader leaves town in a moment: stay out here
		}

		// I went out on the leader's "leaving" call and got there first: it is still in town, on its way (live 18:33:07-09 on Nightmare: Xena and Sankt took a
		// portal to the Cold Plains, saw the leader "in town" and took the waypoint straight back; Barabas came out alone and chickened). Wait for it here.
		if (leaderInTown && !me.inTown && Date.now() - (this.leavingAt || 0) < 20000) {
			return false;
		}

		if (leaderInTown) { // the leader went to town: follow
			// a waypoint close by (and known) is cheaper than a town portal scroll
			if (this.checkLeaderAct(leader) === me.act && this.hasWaypoint() && this.nearbyWaypoint(30)) {
				this.lastFollowAt = Date.now();

				try {
					Pather.moveToUnit(this.nearbyWaypoint(30));

					if (Pather.useWaypoint(leader.area, true) && me.inTown) {
						this.note("Going to town (waypoint).");
						this.doChores();

						return true;
					}
				} catch (wpError) {
					// fall through to the portal
				}
			}

			this.lastFollowAt = Date.now();
			this.note("Going to town.");

			if (!me.inTown) {
				this.leftFrom = me.area; // where I leave the field: the way back is the portal I take now (a bot that goes to town to heal, repair or clear its pack
				this.leftAt = Date.now(); // comes back through it, the user said, 2026-11-13: it does not need the leader's portal or a waypoint)
			}

			if (!Pather.usePortal(null, leader.name)) {
				Pather.makePortal(true); // no portal of the leader's: open my own
			}

			if (me.inTown) {
				this.doChores();

				return true;
			}

			if (!this.cannotReachSaid) {
				this.cannotReachSaid = true;
				this.problem("I cannot get to town: no portal and no town portal scroll.");
			}
		}

		return false;
	};


	// Qolbot: true when this bot is out in the field and the leader has gone to town. Pather.moveTo and Attack.clear ask it
	// (Pather.interrupt) so a walk or a fight in progress ends at once and autoFollow runs, instead of the bot carrying on
	// toward the spot where the leader was (leader teleports away, then opens a portal: the bot used to walk on, "searching").
	this.leaderMoved = function () {
		if (this.following || this.errand || !leader || me.inTown || me.dead || !me.gameReady || Config.AutoTown === false) {
			return false;
		}

		if (Date.now() < Math.max(this.followPausedUntil || 0, this.giveUpUntil || 0)) {
			return false;
		}

		if ([1, 40, 75, 103, 109].indexOf(leader.area) === -1) {
			return false; // area 0 (loading) or the leader is in the field: the normal follow logic handles it
		}

		if (PartySync.afterParty() || PartySync.tripOn()) {
			return false; // a party trip is on (the town chicken thread does it), or just back out from one: the leader (the portal's maker) comes out last in a moment
		}

		Throttle.reset("follow"); // autoFollow runs on the very next pass of the main loop
		return true;
	};

	var follower = this;

	// THE GOALS ARE ERASED IN TOWN (the user, 2026-11-15: "they erase their goals when they go to town, and nobody can leave again until the leader says"):
	// the town chicken thread pauses this script for a trip to town (the leader's order "town", a heal) and says "droptask" when it resumes it in town.
	// Whatever this script was doing in the field (a walk, a pick-up, a fight, a trip of its own) is abandoned, all of it: the next delay() anywhere,
	// and the walk's and the fight's own checks (Pather.interrupt), throw dropError, which unwinds every routine up to the main loop; the main loop
	// catches it and starts a fresh pass, where autoFollow does what the leader's newest order says. Live 19:49:44-19:51:04: Meir and Xena walked on
	// toward Travincal spots from Kurast Docks after the trip; live 20:10:26-20:10:57 (a first version that only ended walks and fights): Sankt's old
	// field task still ran for 30 s in town and he missed the leader's "out". UNTESTED in a game.
	this.dropTask = false;
	this.dropError = "Follower: task dropped (back in town from a trip)";

	addEventListener("scriptmsg", function (msg) {
		if (msg === "droptask") {
			follower.dropTask = true;
			Throttle.reset("follow"); // autoFollow on the very next pass
			print("Follower: back in town from a trip: what I was doing in the field is dropped.");
		}
	});

	// An errand the leader asked for (a portal for the team, a waypoint, the red portal: this.errand) is NEWER than the trip's task that is being dropped, and is
	// not dropped with it (live 2026-11-16 10:09:17: Meir said "the way to the Hellforge opens shortly", the drop of the trip's task fired in the same seconds and
	// cancelled the errand, the leader waited in town for her portal for good). The drop waits until the errand is done. UNTESTED in a game.
	Pather.interrupt = function () {
		if (follower.dropTask && !follower.errand) {
			throw new Error(follower.dropError);
		}

		return follower.leaderMoved();
	};

	// every wait of every routine ends here while a task is being dropped (a routine that catches the error and goes on throws again at its next wait)
	var nativeDelay = delay;

	delay = function (ms) {
		var r = nativeDelay(ms);

		if (follower.dropTask && !follower.errand) {
			throw new Error(follower.dropError);
		}

		return r;
	};

	// Get leader's Party Unit
	this.getLeader = function (name) {
		var player = getParty();

		if (player) {
			do {
				if (player.name === name) {
					return player;
				}
			} while (player.getNext());
		}

		return false;
	};

	// Get leader's Unit
	this.getLeaderUnit = function (name) {
		var player = getUnit(0, name);

		if (player) {
			do {
				if (!player.dead) {
					return player;
				}
			} while (player.getNext());
		}

		return false;
	};

	// Get leader's act from Party Unit
	this.checkLeaderAct = function (unit) {
		if (unit.area <= 39) {
			return 1;
		}

		if (unit.area >= 40 && unit.area <= 74) {
			return 2;
		}

		if (unit.area >= 75 && unit.area <= 102) {
			return 3;
		}

		if (unit.area >= 103 && unit.area <= 108) {
			return 4;
		}

		return 5;
	};

	// The bots of the team (data/bots.json) other than me that are in a town right now (party units carry their area)
	// Qolbot: going where the leader already went (an exit, a portal, a waypoint): no path clearing, chests or pick-ups on the way (Pather.fleeing), the same
	// as a mate's chicken portal (the user, 2026-11-15: "taking exits into new zones that is prob another example of \"don't clear\" where bots keep with the
	// leader and take that exit if he already did"; "if the team can't assemble in this amount of time, it means either a) they weren't all ready or b) they
	// are clearing the path"). Pather.moveTo still fights back when a step fails; the bot fights normally once it is there.
	this.flee = function (fn) {
		Pather.fleeing = true;

		try {
			return fn();
		} finally {
			Pather.fleeing = false;
		}
	};

	this.matesInTown = function () {
		var p = getParty(), names = [], team = [];

		try {
			team = (typeof Team === "object" && Team.expected) ? Team.expected() : [];
		} catch (teamError) {
			team = [];
		}

		if (p) {
			do {
				if (p.name !== me.name && team.indexOf(p.name) > -1 && [1, 40, 75, 103, 109].indexOf(p.area) > -1) {
					names.push(p.name);
				}
			} while (p.getNext());
		}

		return names;
	};

	// Change areas to where leader is
	this.checkExit = function (unit, area) {
		if (unit.inTown) {
			return false;
		}

		var i, target,
			exits = (getArea() || {}).exits || [];

		for (i = 0; i < exits.length; i += 1) {
			if (exits[i].target === area) {
				return 1;
			}
		}

		target = getUnit(2, "portal");

		if (target) {
			do {
				if (target.objtype === area) {
					// Qolbot: my OWN portal from town goes last: it closes when its maker takes it back (live 2026-11-15 15:15:55: Meir followed the leader
					// through her Quick Travel portal 2 s after him, and Barabas and Darius found no portal: "no way to Tal Rashas Tomb #2"). Wait while a
					// mate of the team is still in town, at most 45 s. UNTESTED in a game.
					if (me.inTown && target.getParent() === me.name && this.matesInTown().length) {
						if (!this.ownPortalSince) {
							this.ownPortalSince = Date.now();
							print("Follower: my portal to " + Pather.getAreaName(area) + ": I go last, after " + this.matesInTown().join(", "));
						}

						if (Date.now() - this.ownPortalSince < 45000) {
							delay(500);

							return 2;
						}

						print("Follower: " + this.matesInTown().join(", ") + " still in town after 45 s: going through my portal anyway");
					}

					this.ownPortalSince = 0;
					Pather.usePortal(null, null, target);

					return 2;
				}
			} while (target.getNext());
		}

		// Qolbot: the leader took a waypoint (from the field too): my area has one and I have the leader's: take it. It used to count only when the LEADER was
		// in town (a property party units do not even have), so a follower whose leader waypointed from the field found "no way" and went back to town.
		if (this.haveWaypoint(area) && Pather.wpAreas.indexOf(me.area) > -1) {
			return 3;
		}

		// Arcane<->Cellar portal
		if ((me.area === 74 && area === 54) || (me.area === 54 && area === 74)) {
			Pather.usePortal(null);

			return 4;
		}

		// Tal-Rasha's tomb->Duriel's lair
		// Qolbot: the way in (object 100) is next to the Orifice in the staff room: walk there when it is not in view, and a failure is retried on the next
		// loop instead of thrown (live 2026-11-15 15:09:37: Meir's "useUnit: Unit not found. ID: 100" ended her Follower script, ForceSave ran next and
		// she quit the game in the middle of the Duriel fight; the leader went to town to wait for her). UNTESTED in a game.
		if (me.area >= 66 && me.area <= 72 && area === 73) {
			try {
				if (!getUnit(2, 100)) {
					Pather.moveToPreset(me.area, 2, 152, -11, 3); // the staff room, where the Quester stands to place the staff
				}

				Pather.useUnit(2, 100, area);
			} catch (lairError) {
				print("Follower: the way into Duriel's Lair: " + lairError + " (I am at " + me.x + "," + me.y + " in area " + me.area + "), trying again");
				delay(1000);
			}

			return 4;
		}

		// Qolbot: Durance of Hate Level 3 -> the Pandemonium Fortress: Mephisto's red portal (it has no owner). The portal loop above did not take it: live
		// 2026-11-15 20:26, the leader had gone through and the followers found "no way", went to town and bounced between town and the lair. UNTESTED in a game.
		if (me.area === 102 && area === 103) {
			try {
				Pather.moveTo(17590, 8068);
				Pather.moveTo(17601, 8070);
				Pather.usePortal(null);
			} catch (redError) {
				print("Follower: the red portal to the Pandemonium Fortress: " + redError + " (I am at " + me.x + "," + me.y + "), trying again");
				delay(1000);
			}

			return 4;
		}

		// Throne->Chamber
		if (me.area === 131 && area === 132) {
			target = getUnit(2, 563);

			if (target) {
				Pather.usePortal(null, null, target);

				return 4;
			}
		}

		return false;
	};

	// Talk to a NPC
	this.talk = function (name) {
		if (!me.inTown) {
			Speech.reply("I'm not in town!");

			return false;
		}

		if (typeof name === "string") {
			name = name.toLowerCase();
		} else {
			Speech.reply("No NPC name given.");

			return false;
		}

		var npc, names;

		switch (me.act) {
		case 1:
			names = ["gheed", "charsi", "akara", "kashya", "cain", "warriv"];

			break;
		case 2:
			names = ["fara", "lysander", "greiz", "elzix", "jerhyn", "meshif", "drognan", "atma", "cain"];

			break;
		case 3:
			names = ["alkor", "asheara", "ormus", "hratli", "cain"];

			break;
		case 4:
			names = ["halbu", "tyrael", "jamella", "cain"];

			break;
		case 5:
			names = ["larzuk", "malah", "qual-kehk", "anya", "nihlathak", "cain"];

			break;
		}

		if (names.indexOf(name) === -1) {
			Speech.reply("Invalid NPC.");

			return false;
		}

		if (!Town.move(name === "jerhyn" ? "palace" : name)) {
			Town.move("portalspot");
			Speech.reply("Failed to move to town spot.");

			return false;
		}

		npc = getUnit(1);

		if (npc) {
			do {
				if (npc.name.replace(/ /g, "").toLowerCase().indexOf(name) > -1) {
					npc.openMenu();
					me.cancel();
					Town.move("portalspot");
					Speech.reply("Done talking.");

					return true;
				}
			} while (npc.getNext());
		}

		Speech.reply("NPC not found.");
		Town.move("portalspot");

		return false;
	};

	// Change act after completing last act quest
	this.changeAct = function (act) {
		return ActTravel.change(act);
	};

	this.pickPotions = function (range) {
		if (me.dead) {
			return false;
		}

		Town.clearBelt();

		while (!me.idle) {
			delay(40);
		}

		var status,
			pickList = [],
			item = getUnit(4);

		if (item) {
			do {
				if ((item.mode === 3 || item.mode === 5) && item.itemType >= 76 && item.itemType <= 78 && getDistance(me, item) <= range) {
					pickList.push(copyUnit(item));
				}
			} while (item.getNext());
		}

		pickList.sort(Pickit.sortItems);

		while (pickList.length > 0) {
			item = pickList.shift();

			if (item && copyUnit(item).x) {
				status = Pickit.checkItem(item).result;

				if (status && Pickit.canPick(item)) {
					Pickit.pickItem(item, status);
				}
			}
		}

		return true;
	};

	this.openContainers = function (range) {
		var unit, ox, oy,
			unitList = [],
			containers = ["chest", "loose rock", "hidden stash", "loose boulder", "corpseonstick", "casket", "armorstand", "weaponrack", "barrel", "holeanim",
							"roguecorpse", "ratnest", "corpse", "goo pile", "largeurn", "urn", "chest3", "jug", "skeleton", "guardcorpse", "sarcophagus",
							"cocoon", "basket", "stash", "hollow log", "hungskeleton", "pillar", "skullpile", "skull pile", "jar3", "jar2", "jar1", "bonechest", "woodchestl",
							"woodchestr", "barrel wilderness", "burialchestr", "burialchestl", "explodingchest", "chestl", "chestr", "icecavejar1", "icecavejar2",
							"icecavejar3", "icecavejar4", "deadperson", "deadperson2", "evilurn", "tomb1l", "tomb3l", "tomb2", "tomb3", "object2", "groundtomb", "groundtombl"
						];

		ox = me.x;
		oy = me.y;
		unit = getUnit(2);

		if (unit) {
			do {
				if (containers.indexOf(unit.name.toLowerCase()) > -1 && unit.mode === 0 && getDistance(me, unit) <= range) {
					unitList.push(copyUnit(unit));
				}
			} while (unit.getNext());
		}

		while (unitList.length > 0) {
			unitList.sort(Sort.units);

			unit = unitList.shift();

			if (unit) {
				Misc.openChest(unit);
				Pickit.pickItems();
			}
		}

		return true;
	};

	this.chatEvent = function (nick, msg) {

		Banter.delay(); // delay speaking

		if (msg && nick === Config.Leader) {
			switch (msg) {
			case "hold": // the leader waits for the team at a boss (Team.holdAndGather): nobody attacks until it says "go", so that everybody is there when the boss dies
				attack = false;
				holdSince = Date.now();

				break;
			case "go":
				attack = true;
				holdSince = 0;

				break;
			case "tele":
			case me.name + " tele":
				if (Pather.teleport) {
					Pather.teleport = false;

					Speech.reply("Teleport off.");
				} else {
					Pather.teleport = true;

					Speech.reply("Teleport on.");
				}

				break;
			case "tele off":
			case me.name + " tele off":
				Pather.teleport = false;

				Speech.reply("Teleport off.");

				break;
			case "tele on":
			case me.name + " tele on":
				Pather.teleport = true;

				Speech.reply("Teleport on.");

				break;
			case "a":
			case me.name + " a":
				if (attack) {
					attack = false;

					Speech.reply("Attack off.");
				} else {
					attack = true;

					Speech.reply("Attack on.");
				}

				break;
			case "flash":
				Packet.flash(me.gid);

				break;
			case "aoff":
			case me.name + " aoff":
				attack = false;

				Speech.reply("Attack off.");

				break;
			case "aon":
			case me.name + " aon":
				attack = true;

				Speech.reply("Attack on.");

				break;
			case "save":
				PlugY.save();
				delay(5000);
				Speech.reply("Saved.");
				break;
			case "prep":
			case "precast":
				Precast.doPrecast(true);
				break;
			case "town":
				Pather.makePortal(true); // take the portal to town
				this.doChores();
				break;
			case "quit":
			case me.name + " quit":
				quit();
				break;
			case "s":
			case me.name + " s":
				if (stop) {
					stop = false;

					Speech.reply("Resuming.");
				} else {
					stop = true;

					Speech.reply("Stopping.");
				}

				break;
			case "r":
				if (me.mode === 17) {
					me.revive();
				}

				break;
			default:
				if (me.classid === 3 && msg.indexOf("aura ") > -1) {
					piece = msg.split(" ")[0];

					if (piece === me.name || piece === "all") {
						skill = parseInt(msg.split(" ")[2], 10);

						if (me.getSkill(skill, 1)) {
							Speech.reply("Active aura is: " + skill);

							Config.AttackSkill[2] = skill;
							Config.AttackSkill[4] = skill;

							Skill.setSkill(skill, 0);
							//Attack.init();
						} else {
							Speech.reply("I don't have that aura.");
						}
					}

					break;
				}

				if (msg.indexOf("skill ") > -1) {
					piece = msg.split(" ")[0];

					if (charClass.indexOf(piece) > -1 || piece === me.name || piece === "all") {
						skill = parseInt(msg.split(" ")[2], 10);

						if (me.getSkill(skill, 1)) {
							Speech.reply("Attack skill is: " + skill);

							Config.AttackSkill[1] = skill;
							Config.AttackSkill[3] = skill;

							//Attack.init();
						} else {
							Speech.reply("I don't have that skill.");
						}
					}

					break;
				}

				// Waypoint helper (QuickTravel.waypoint): "waypoint <area>" - say so if I have that waypoint; "waypoint go <name> <area>" - I was chosen
				if (msg.split(" ")[0] === "waypoint") {
					piece = msg.split(" ");

					if (piece.length === 2 && this.haveWaypoint(parseInt(piece[1], 10))) {
						Speech.say("hasWaypoint", piece[1]);
					} else if (piece.length === 4 && piece[1] === "go" && piece[2] === me.name && this.haveWaypoint(parseInt(piece[3], 10))) {
						this.errands.push({kind: "waypoint", area: parseInt(piece[3], 10)});
					}

					break;
				}

				// "redportal": the leader killed Mephisto and tells the team to go through the red portal to Act 4 (the game opens Act 4 for a character
				// only when it goes through itself); the ones that are already eligible by the quest bit stay quiet
				// (every follower still in Act 3 goes, Act 4 open or not: the leader waits for all of them in the Pandemonium Fortress before it goes last)
				if (msg === "redportal") {
					if (me.act === 3 && !this.errands.some(function (e) { return e.kind === "redportal"; })) {
						this.errands.push({kind: "redportal"});
					}

					break;
				}

				// "portal <place>" with no name: the Sorceress that Team.chosenSorc names goes (every bot works out the same one), the others stay quiet
				if (msg.split(" ")[0] === "portal" && msg.split(" ").length === 2) {
					if (this.canWormhole() && Team.chosenSorc() === me.name) {
						// the leader asks again every 30 s while it waits (QuickTravel): not a second portal while the first is queued or being made
						var wantPlace = msg.split(" ")[1];

						if (this.errand || this.errands.some(function (e) { return e.kind === "portal" && e.place === wantPlace; })) {
							break;
						}

						this.errands.push({kind: "portal", place: wantPlace}); // run between the main loop's steps, not inside this event
					}

					break;
				}

				// if command is includes "portal"
				if (msg.indexOf("portal ") > -1) {
					piece = msg.split(" ")[0];

					// if command is for me...
					if (piece === me.name)
					{
						// if has skill teleport
						if (this.canWormhole())
						{
							// capture location
							piece = msg.split(" ")[2];

							// travel to the location when the main loop gets to it (not inside this event)
							this.errands.push({kind: "portal", place: piece});
						}
						else
						{
							Speech.say("noQuick");
						}
					}
					break;
				}

				action = msg;

				break;
			}
		}

		if (msg && msg.split(" ")[0] === "leader" && commanders.indexOf(nick) > -1) {
			piece = msg.split(" ")[1];

			if (typeof piece === "string") {
				if (commanders.indexOf(piece) === -1) {
					commanders.push(piece);
				}

				Speech.reply("Switching leader to " + piece + ".");

				Config.Leader = piece;
				leader = this.getLeader(Config.Leader);
				leaderUnit = this.getLeaderUnit(Config.Leader);
			}
		}
	};

	// keep log of waypoint already gathered
	var wp_logbook = [];

	this.hasWaypoint = function (area) {
		var index;

		area = area || me.area;
		index = Pather.wpAreas.indexOf(area);

		if (index < 0) {
			return true; // this area has no waypoint, nothing to gather
		}

		try {
			return !!getWaypoint(index); // the game knows which waypoints this character has
		} catch (e) {
			return wp_logbook.indexOf(area) > -1;
		}
	};

	// Is there a waypoint within `range` of me that I could stand next to?
	this.nearbyWaypoint = function (range) {
		var unit = getUnit(2, "waypoint");

		if (unit && getDistance(me, unit) <= range) {
			return unit;
		}

		return false;
	};

	this.gatherWaypoint = function ()
	{
		var unit, i, j;

		if (me.inTown || this.hasWaypoint()) {
			return;
		}

		// only take a waypoint that is close by: do not wander off the leader to fetch one
		unit = this.nearbyWaypoint(25);

		if (!unit) {
			return;
		}

		if (unit) {
			WPLoop:
			for (i = 0; i < 3; i += 1) {
				if (getDistance(me, unit) > 3) {
					Pather.moveToUnit(unit);
				}

				unit.interact();

				for (j = 0; j < 100; j += 1) {
					if (j % 20 === 0) {
						me.cancel();
						delay(300);
						unit.interact();
					}

					if (getUIFlag(0x14)) {
						break WPLoop;
					}

					delay(10);
				}
			}
		}

		if (getUIFlag(0x14)) {
			this.note("Waypoint gathered.");
			print("Waypoint collected: " + Pather.getAreaName(me.area)); // read by Qolbot's Activity list: a follower's waypoint counts like the leader's
			wp_logbook.push(me.area); // save to log
			Waypoints.save(); // the leader waits for the team's lists (Waypoints.waitForTeam)
		} else {
			//say("Failed to gather waypoint.");
		}

		me.cancel();
	};

	this.canWormhole = function ()
	{
		if (me.classid === 1 && me.getSkill(54, 1))
		{
			return true;
		}

		return false;
	};

	// Chat commands that take a while (a portal errand) are queued by the chat event and run here, between the main loop's steps: a command that
	// arrives while the bot is in the middle of town chores or a walk waits for them to end instead of cutting into them.
	this.errands = [];

	this.runErrands = function () {
		var errand, self = this;

		while (this.errands.length) {
			errand = this.errands.shift();

			if (errand.kind === "portal") {
				this.teleportDuring(function () { self.openWormhole(errand.place); }); // placing a portal is what she teleports for
			}

			if (errand.kind === "waypoint") {
				this.teleportDuring(function () { self.openWaypointPortal(errand.area); });
			}

			if (errand.kind === "redportal") {
				this.redTriedAt = 0; // the leader asked: no waiting
				this.errand = true;

				try {
					this.redPortalToAct4();
				} finally {
					this.errand = false;
				}
			}
		}
	};

	// Does the area have a waypoint that I have not taken yet?
	this.lacksWaypoint = function (area) {
		return Pather.wpAreas.indexOf(area) > -1 && !Waypoints.has(area);
	};

	this.haveWaypoint = function (area) {
		return Pather.wpAreas.indexOf(area) > -1 && Waypoints.has(area);
	};

	// Take a waypoint the leader lacks, open a portal beside it and wait for the leader in town (QuickTravel.waypoint)
	this.openWaypointPortal = function (area) {
		var act = area <= 39 ? 1 : (area <= 74 ? 2 : (area <= 102 ? 3 : (area <= 108 ? 4 : 5)));

		this.errand = true;

		try {
			Speech.task("Opening portal to the waypoint.");
			Town.goToTown(act);
			Pather.useWaypoint(area);

			if (me.area !== area) {
				Speech.say("noGet");

				return false;
			}

			Pather.makePortal(true); // opens it, and goes through it to town; it stays open
			Speech.say("portalOpen");
		} catch (wpError) {
			print("Follower: waypoint portal: " + wpError);
			Speech.say("noGet");
		} finally {
			this.errand = false;
		}

		return true;
	};

	// where each place's portal must be opened (Duriel's depends on which tomb is the real one: not checked)
	this.wormholeAreas = {radament: 49, countess: 25, mausoleum: 19, pit: 12, andy: 37, andariel: 37, at: 65, tunnels: 65, summoner: 74, ft: 94, kt: 94, temple: 94,
		meph: 102, mephisto: 102, durance: 101, diablo: 108, halls: 124, nihlathak: 124, baal: 131,
		spidercavern: 85, flayerdungeon: 91, sewers: 92, deadhalls: 60, izual: 105, hephasto: 107, forge: 107,
		bloodraven: 17, corpsefire: 8, chaos: 108, malus: 28, maggotlair: 64, clawviper: 61, gidbinn: 78, anya: 114, ancients: 120};

	// She leaves the leader on purpose, only to place the portal: the "leader is in town, follow" hook must not pull her back (this.errand).
	this.openWormhole = function (destination)
	{
		this.errand = true;

		try {
			this.travelWormhole(destination);
		} finally {
			this.errand = false;
		}
	};

	this.travelWormhole = function (destination)
	{
		// I need to add a check in here for hasWaypoint
		// so she doesn't run off into the wild and get killed.
		var is_portal = true;
		is_portal = QuickTravel.route(destination); // the route to each place (QuickTravel.route: a Sorceress leader takes it herself too)

		// a portal anywhere but at the place is no use to the team: say so instead (the leader walks)
		if (is_portal && this.wormholeAreas[destination] && me.area !== this.wormholeAreas[destination])
		{
			Speech.say("noGet");
			is_portal = false;
		}

		if (is_portal)
		{
			// go back to town
			Pather.makePortal(true); // flag true to use portal

			// announce
			Speech.say("portalOpen");
		}
	};

	// The leader's commands by the message log (Team.command, 2026-11-15: the bots no longer coordinate in the public chat). They are the same words a
	// player types in chat ("hold", "portal andy", "waypoint 35" ...), so chatEvent runs them; the chat listener stays for a player's own commands.
	// Read at every step of the main loop (a chat line came as an event at once; a step is a fraction of a second, longer inside a fight).
	this.readCommands = function () {
		var msgs, i;

		if (!Config.Leader) {
			return;
		}

		msgs = Team.take("follower", [Config.Leader], ["cmd"]);

		for (i = 0; i < msgs.length; i += 1) {
			Speech.fromLog = true; // a bot's command: the answers are task words (said only with task reports on), not replies to a player

			try {
				this.chatEvent(msgs[i].from, String(msgs[i].a[0]));
			} catch (commandError) {
				print("Follower: command " + msgs[i].a[0] + ": " + commandError);
			}

			Speech.fromLog = false;
		}
	};

	// BEGIN EXECUTION

	addEventListener("chatmsg", this.chatEvent);

	// Qolbot (the user, 2026-11-14; UNTESTED in a game): a Sorceress that only follows the leader WALKS (Pather.teleport defaults to true and made Meir
	// teleport along behind the leader). Teleport stays on for what needs it: the portal errands (runErrands: she places the leader's portals), and combat
	// (Attack.clear / kill / clearList run with it on, so she can teleport out of trouble). The "tele on/off" chat commands still switch it for good.
	this.teleportDuring = function (fn) {
		var before = Pather.teleport;

		Pather.teleport = true;

		try {
			return fn();
		} finally {
			Pather.teleport = before;
		}
	};

	Pather.teleport = false;

	["clear", "kill", "clearList"].forEach(function (name) {
		var original = Attack[name];

		if (typeof original === "function") {
			Attack[name] = function () {
				var before = Pather.teleport;

				Pather.teleport = true;

				try {
					return original.apply(Attack, arguments);
				} finally {
					Pather.teleport = before;
				}
			};
		}
	});

	// Override config values that use TP
	Config.TownCheck = false;
	Config.TownHP = 0;
	Config.TownMP = 0;
	charClass = classes[me.classid];

	// Find the real player. qolbot writes data/bots.json: "leader" is the character the
	// user said they are playing (web UI); otherwise it is the first person in the game
	// who is not one of the "bots" that qolbot is running.
	this.findHuman = function () {
		var info = {leader: "", bots: []}, player = getParty();

		try {
			info = JSON.parse(FileTools.readText("data/bots.json"));
		} catch (e) {
			// no file yet: only we are known to be a bot
		}

		if (info.leader) {
			return info.leader;
		}

		if (player) {
			do {
				if (player.name !== me.name && info.bots.indexOf(player.name) === -1) {
					return player.name;
				}
			} while (player.getNext());
		}

		return "";
	};

	if (Config.Leader)
		this.note("Searching for leader " + Config.Leader + ".");
	else
		this.note("Searching for a player to follow.");
	for (i = 0; i < 20; i += 1) {
		if (!Config.Leader) {
			piece = this.findHuman();

			if (piece) {
				Config.Leader = piece;
				if (commanders.indexOf(piece) === -1) {
					commanders.push(piece);
				}
				this.note("Following " + piece + ".");
			}
		}

		leader = Config.Leader && this.getLeader(Config.Leader);

		if (leader) {
			break;
		}

		delay(1000);
	}

	Waypoints.save(); // my waypoints for the leader's sync before the run (Waypoint Collection)

	if (!leader) {
		Speech.problem("Leader not found.");
		quit();
	} else {
		this.note("Leader found.");
	}

	while (!Misc.inMyParty(Config.Leader)) {
		delay(500);
	}

	//say("Partied.");

	// make sure the pickup area of the inventory is free (moves what is in it to the stash, and says so in chat)
	if (me.inTown) {
		try {
			Pack.freePickupArea();
		} catch (areaError) {
			print("Follower: freePickupArea error: " + areaError);
		}
	}

	if (me.inTown) {
		try {
			Team.firstActHop(); // a hunt starts in the act of its first place: go there first, with the leader
		} catch (hopError) {
			print("Team: " + hopError);
			me.cancel();
		}

		this.doChores();
	}

	// Main Loop
	while (Misc.inMyParty(Config.Leader)) {
		this.dropTask = false; // a new pass: the task the trip to town dropped is gone (Pather.interrupt above)

		// the pass runs in a try: a dropped task (dropError, thrown by delay() or Pather.interrupt) ends the pass here and the next one starts clean.
		// (The pass body below keeps its old indentation.)
		try {

		// save the character now and then (PlugY /save)
		Saver.auto();
		if (holdSince && Date.now() - holdSince > 60000) {
			attack = true;
			holdSince = 0;
		}

		if (Throttle.due("wplist", 10000)) {
			Waypoints.save(); // my waypoints, for the leader (Waypoint Collection)
		}

		this.readCommands(); // the leader's commands by the message log
		this.runErrands(); // a queued chat command (a Sorceress asked for a portal)

		if (Throttle.due("qmtick", 2000) && typeof Quartermaster === "object") {
			try {
				Quartermaster.tick(); // .deposit once on every arrival in town (Using Quartermaster?)
			} catch (qmError) {
				print("Quartermaster: " + qmError);
			}
		}

		if (me.inTown && Throttle.due("goldtick", 3000)) {
			Gold.tick(); // gold sharing: ask when the purse is empty, give to a teammate who asked
		}

		// a quest reward the game put into the pack by itself (or one that dropped and was picked up) is used at once, not at the next town visit
		if (Throttle.due("questitems", 10000)) {
			QuestItems.useAll();
		}

		// the one Malah's Potion of the game thaws Anya: the bot that holds it uses it once she is near (QuestItems.thawAnya)
		if (me.area === 114 && me.getItem(644) && Throttle.due("thawanya", 3000)) {
			QuestItems.thawAnya();
		}

		// say quote
		Banter.speak();

		if (me.mode === 17) {
			while (!me.inTown) {
				me.revive();
				delay(1000);
			}

			Town.move("portalspot");
			Speech.task("I'm alive!");
		}

		while (stop) {
			delay(500);
		}

		Quester.logState(false);

		// follow the leader between town and the field by itself
		if (Config.AutoTown !== false && Throttle.due("follow", 2500)) {
			this.following = true;

			try {
				this.autoFollow();
			} catch (followError) {
				print("Follower: autoFollow error: " + followError);

				// whatever went wrong, leave no menu open and no half-finished trip behind: the next pass starts clean
				try {
					me.cancel();
					me.cancel();
					this.lastFollowAt = 0;
				} catch (cancelError) {
					// nothing more to do
				}
			}

			this.following = false;

			// still in the field with the leader in town: the trip failed (no portal, no scroll). Carry on as before for a bit, do not keep cutting walks short.
			if (!me.inTown && me.gameReady && leader && [1, 40, 75, 103, 109].indexOf(leader.area) > -1) {
				this.giveUpUntil = Date.now() + 15000;
			}
		}

		if (!me.inTown)
		{
			if (!leaderUnit || !copyUnit(leaderUnit).x) {
				leaderUnit = this.getLeaderUnit(Config.Leader);

				if (leaderUnit) {
					//say("Leader unit found.");
				}
			}

			if (!leaderUnit) {
				player = getUnit(0);

				if (player) {
					do {
						if (player.name !== me.name) {
							Pather.moveToUnit(player);

							break;
						}
					} while (player.getNext());
				}
			}

			// REAL PLAYER MODE: apart from you (another area, or out of sight) for the one timer (Settings > Behavior > Auto Regroup, 30 s) and every try to
			// catch up has failed: take a town portal and meet up from there (the user, 2026-11-17: "if the bots are separated from the leader for X seconds
			// they tele to town ... and they emit some kind of complaint"). A bot-led team has the leader's regroup instead.
			if (!Team.syncOn() && leader && leader.area && !me.inTown && me.gameReady && !me.dead) {
				if (leader.area !== me.area || (leader.x !== undefined && getDistance(me.x, me.y, leader.x, leader.y) > 60)) {
					this.apartSince = this.apartSince || Date.now();

					if (Date.now() - this.apartSince > Team.limits.sync && Date.now() - (this.lostAt || 0) > 30000) {
						this.lostAt = Date.now();
						this.apartSince = 0;
						this.problem("I lost you: going to town to meet up.");

						try {
							Town.goToTown();
						} catch (apartError) {
							print("Follower: cannot get to town after losing the leader (" + apartError + ")");
						}
					}
				} else {
					this.apartSince = 0;
				}
			} else {
				this.apartSince = 0;
			}

			// badly hurt: go to town and see the healer instead of staying in the field on the last few points of life
			if (!me.dead && me.hp * 100 / me.hpmax < (Config.HealTripHP || 40) && Throttle.due("healtrip", 45000)) {
				this.problem("I am badly hurt. Going to town to heal.");

				try {
					Misc.unShift(); // out of bear form for the trip (the town portal scroll)
					Town.visitTown();
				} catch (healError) {
					print("Follower: heal trip: " + healError);
					me.cancel();
				}
			}

			// a summoner that does not fight never gets the after-fight buffs: every minute summon whatever has died (summons work in bear form too)
			if (Config.FollowNoFight && me.classid === 5 && Throttle.due("resummon", 60000)) {
				try {
					Precast.summonDruid();
				} catch (summonError) {
					print("Follower: summon: " + summonError);
				}
			}

			// the same for a summoning necromancer: its army is raised again from the corpses around (and the golem and the buffs renewed)
			if (Config.FollowNoFight && me.classid === 2 && !me.inTown && Throttle.due("raise", 15000)) {
				try {
					Precast.doPrecast(false);
					ClassAttack.raiseArmy();
				} catch (raiseError) {
					print("Follower: raise army: " + raiseError);
				}
			}

			// a character that must stay out of the way (Config.FollowDistance, e.g. a summoner) keeps that far from the leader
			if (Config.FollowNoFight && Config.Wereform && Throttle.due("shift", 5000)) {
				try {
					Misc.shapeShift(Config.Wereform); // stay in bear/wolf form: far more life, and nothing to do in it but survive
				} catch (shiftError) {
					print("Follower: shapeshift: " + shiftError);
				}
			}

			if (leaderUnit && getDistance(me.x, me.y, leaderUnit.x, leaderUnit.y) <= 60) {
				if (Config.hasOwnProperty("FollowDistance") && Config.FollowDistance > 6) { // hasOwnProperty: set only by the summoner templates (no strict warning)
					this.standAway(leaderUnit, Config.FollowDistance);
				} else if (getDistance(me.x, me.y, leaderUnit.x, leaderUnit.y) > 6) {
					//Pather.moveToUnit(leaderUnit);

					// make the bots stand randomly arround you
					Pather.moveTo(leaderUnit.x + rand(-6, 6), leaderUnit.y + rand(-6, 6));
				}
			} else if (leader && leader.area === me.area && !me.inTown && leader.x !== undefined && getDistance(me.x, me.y, leader.x, leader.y) > 40) {
				// The leader is in MY area but out of sight (more than 60 units away, so there is no unit to follow): walk toward its position from the party list
				// instead of standing here. The first live test of the sync rules (2026-11-14 12:21): the leader waited at the next exit for a team that stood idle at
				// the entrance until she changed area, because inside an area a follower only followed a leader it could see.
				try {
					Pather.moveTo(leader.x + rand(-5, 5), leader.y + rand(-5, 5));
				} catch (catchUpError) {
					print("Follower: catching up with the leader: " + catchUpError);
				}
			}

			if (attack) {
				if (!Config.FollowNoFight) { // a bot that does not fight only tries to stay alive
					Attack.clear(20, false, false, false, false);
				}

				this.pickPotions(20);

				// look for nearby quest items
				Pickit.pickItems();
			}

			if (me.classid === 3 && Config.AttackSkill[2] > 0) {
				Skill.setSkill(Config.AttackSkill[2], 0);
			}

			// Qolbot: not right after a party trip while the leader (the portal's maker) is still in town about to come out last: it would look like "the leader
			// is in town, nothing here leads there, go to town to meet up" (live 2026-11-14 12:36:10: three of four mates went back to town 2 s after "proceed",
			// the maker waited 45 s for them)
			if (leader.area !== me.area && !me.inTown && !((PartySync.afterParty() || PartySync.tripOn()) && [1, 40, 75, 103, 109].indexOf(leader.area) > -1)) {
				while (leader.area === 0) {
					delay(100);
				}

				result = this.checkExit(leader, leader.area);

				switch (result) {
				case 1:
					try {
						this.flee(function () { Pather.moveToExit(leader.area, true); });
					} catch (exitError) { // the exit tile was not there yet (the area had not loaded, or the leader moved on): try again, do not end the script
						print("Follower: could not take the exit to " + Pather.getAreaName(leader.area) + " (" + exitError + "), I am in area " + me.area + " at " + me.x + "," + me.y + ", trying again");
						delay(1000);
					}

					break;
				case 2:
					break;
				case 3:
					try {
						this.flee(function () { Pather.useWaypoint(leader.area, true); }); // checkExit made sure: my area has a waypoint and I have the leader's
					} catch (wpError) {
						print("Follower: the waypoint to " + Pather.getAreaName(leader.area) + ": " + wpError);
					}

					break;
				case 4:
					break;
				}

				// Qolbot: nothing from here leads to the leader (an exit, a portal, a waypoint): do not stand about in the wrong place, go back to town
				// and meet up from there (a waypoint if the leader's area has one, otherwise the leader is asked for a portal)
				if (!result && !me.inTown && me.gameReady && Date.now() - (this.lostAt || 0) > 30000) {
					this.lostAt = Date.now();
					this.note("Going to town to meet up.");

					try {
						Town.goToTown();
					} catch (townError) {
						print("Follower: cannot get to town to meet up (" + townError + ")");
					}
				}

				while (me.area === 0) {
					delay(100);
				}

				leaderUnit = this.getLeaderUnit(Config.Leader);
			}

			// look for nearby waypoints
			this.gatherWaypoint();

			// autoequip any items if you can (not on every pass of this loop: every 30 seconds is plenty)
			if (Throttle.due("equip", 30000)) {
				if (me.inTown) { // gear another bot dropped in town may be an upgrade for this one
					Pickit.pickItems();
				}

				Item.autoEquip();
				Item.autoMercEquip();
				Item.dropHeldForTeam(); // Qolbot: what the upgrade took off goes on the ground at the portal spot
			}
		}

		switch (action) {
			case "cow":
				if (me.area === 1) {
					Town.move("portalspot");

					if (!Pather.usePortal(39)) {
						Speech.problem("Failed to use cow portal.");
					}
				}
				break;
			case "move":
				Pather.moveTo(me.x + rand(-5, 5), me.y + rand(-5, 5));
				break;
			case "status":
				Quester.runQuests(true, true); // flag true to only display status
				break;
			case "reload":
				Speech.task("Reloading.");
				// doesn't work
				break;
			case "cube":
				Cubing.doCubing();
				break;
			case "c":
				if (!me.inTown) {
					Town.getCorpse();
				}

				break;
			case "pick":
			case "p":
				Speech.task("!Picking items.");
				Pickit.pickItems();

				if (openContainers) {
					this.openContainers(20);
				}

				//say("!Done picking.");

				break;
			case "1":
				if (me.inTown && !this.followedRecently()) {
					Speech.task("Going outside.");
					Town.goToTown(this.checkLeaderAct(leader));
					Town.move("portalspot");

					if (!Pather.usePortal(null, leader.name)) {
						break;
					}

					while (!this.getLeaderUnit(Config.Leader) && !me.dead) {
						Attack.clear(10);
						delay(200);
					}
				}

				break;
			case "2":
				if (this.followedRecently()) {
					break;
				}

				if (!me.inTown) {
					delay(150);
					Speech.task("Going to town.");
					Pather.usePortal(null, leader.name);
					this.doChores();
				}
				else
				{
					if (leader.inTown && this.checkLeaderAct(leader) !== me.act && this.actOpen(this.checkLeaderAct(leader))) {
						Speech.task("Going to leader's town.");
						this.travelToAct(this.checkLeaderAct(leader));
					}
				}

				break;
			case "3":
				if (me.inTown) {
					this.doChores();
				}

				break;
			case "h":
				if (me.classid === 4) {
					Skill.cast(130);
				}

				break;
			case "bo":
				if (me.classid === 4) {
					Precast.doPrecast(true);
				}

				break;
			case "a2":
			case "a3":
			case "a4":
			case "a5":
				this.changeAct(parseInt(action[1], 10));

				break;
			case me.name + " tp":
				unit = me.findItem("tbk", 0, 3);

				if (unit && unit.getStat(70)) {
					unit.interact();

					break;
				}

				unit = me.findItem("tsc", 0, 3);

				if (unit) {
					unit.interact();

					break;
				}

				Speech.problem("No TP scrolls or tomes.");

				break;
		}

		if (action.indexOf("talk") > -1) {
			this.talk(action.split(" ")[1]);
		}

		action = "";

		delay(100);
		} catch (passError) {
			if (!this.dropTask && String(passError).indexOf(this.dropError) < 0) {
				throw passError; // a real error: as before
			}

			this.dropTask = false;
			action = "";

			try {
				me.cancel(); // no menu left open by the abandoned task
			} catch (cancelError) {
				// nothing more to do
			}

			print("Follower: the old task is abandoned; following the leader's orders from here.");
		}
	}

	return true;
}