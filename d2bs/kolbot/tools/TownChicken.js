/**
*	@filename	TownChicken.js
*	@author		kolton
*	@desc		handle town chicken
*/

js_strict(true);

include("json2.js");
include("NTItemParser.dbl");
include("OOG.js");
include("Gambling.js");
include("CraftingSystem.js");
include("common/Attack.js");
include("common/Cubing.js");
include("common/Config.js");
include("common/CollMap.js");
include("common/Loader.js");
include("common/Misc.js");
include("common/Pickit.js");
include("common/Pather.js");
include("common/Precast.js");
include("common/Prototypes.js");
include("common/Runewords.js");
include("common/Storage.js");
include("common/Town.js");
include("common/Plan.js");
include("common/Throttle.js");
include("common/Report.js");
include("common/Team.js");
include("common/Speech.js");
include("common/PartySync.js");

function main() {
	var townCheck = false;
	var stuckX = 0, stuckY = 0, stuckArea = 0, stuckAt = getTickCount(); // the leader's last position and since when it has been there
	var pausedInField = false; // the main script was paused while I was in the field (togglePause)
	var wpSyncUntil = 0; // while the leader shares waypoints (Waypoints.sync) nobody is "lost": no regroup before this time
	var portalFor = "", portalAsked = 0, portalAt = 0, partyCall = null, wentTown = null, holdFor = [], holdPause = 0, leaderTownN = 0, standing = null;

	this.togglePause = function () {
		var i,	script,
			scripts = ["default.dbj", "tools/antihostile.js", "tools/rushthread.js", "tools/CloneKilla.js"];

		for (i = 0; i < scripts.length; i += 1) {
			script = getScript(scripts[i]);

			if (script) {
				if (script.running) {
					if (i === 0) { // default.dbj
						print("ÿc1Pausing.");
					}

					if (i === 0) {
						pausedInField = !me.inTown; // a trip from the field: the main script's task is dropped when it resumes in town (below)
					}

					script.pause();
				} else {
					if (i === 0) { // default.dbj
						if (!getScript("tools/clonekilla.js")) { // resume only if clonekilla isn't running
							print("ÿc2Resuming.");
							script.resume();

							// THE GOALS ARE ERASED IN TOWN (the user, 2026-11-15): paused in the field, resumed in town: the main script drops what it was doing
							// (Follower.js listens; the leader's own scripts ignore it). UNTESTED in a game.
							if (pausedInField && me.inTown) {
								scriptBroadcast("droptask");
							}

							pausedInField = false;
						}
					} else {
						script.resume();
					}
				}
			}
		}

		return true;
	};

	addEventListener("scriptmsg",
		function (msg) {
			if (msg === "wpsync1") {
				wpSyncUntil = getTickCount() + 15 * 60 * 1000; // a safety limit, the end message normally comes first
			} else if (msg === "wpsync0") {
				wpSyncUntil = 0;
			}

			if (msg === "townCheck") {
				if (me.area === 136) {
					print("Can't tp from uber trist.");
				} else {
					townCheck = true;
				}
			}
		});

	// Qolbot: a follower stuck in town (no waypoint to where the leader is) posts "cantreach" in the bots' message log (Team.take below; it was a
	// public chat line until 2026-11-15, and the listener for it broke when the chat moved to the log: the followers waited in town at Maggot Lair 3,
	// 14:20). Only the leader answers: it opens a portal as soon as it is out in the field.

	// the emergency trips of this thread always open their own portal (a chicken portal is always fine to pay for with a scroll of one's own)
	Town.reusePortals = false;

	// an emergency visit to town (heal, potions) never sends Quartermaster's .deposit: it delays the way back (Quartermaster.js)
	if (typeof Quartermaster === "object") {
		Quartermaster.skip = true;
	}

	// Init config and attacks
	D2Bot.init();
	Config.init();
	Pickit.init();
	Attack.init();
	Storage.Init();
	CraftingSystem.buildLists();
	Runewords.init();
	Cubing.init();

	if (PartySync.enabled()) {
		PartySync.init(); // my readiness file for this session (a restarted bot must not leave the old "not ready" behind)
	}

	while (true) {
		// a follower's "cantreach" (the leader bot only: the one with an objective; the followers' Config.Leader is empty in this thread)
		if (!Config.Leader && (Plan.get() || {}).goal && me.gameReady) {
			try {
				var reachMsgs = Team.take("townchicken", null, ["cantreach"]);

				if (reachMsgs.length) {
					portalFor = reachMsgs[reachMsgs.length - 1].from;
					portalAsked = Date.now(); // kept while I am still in town: a mate that could not enter my portal asks as I am about to go out (Team.sendOutFirst)
					print("Team: " + portalFor + " cannot reach me: opening a portal when I can.");
				}
			} catch (takeError) {
				print("Team: cannot read the message log: " + takeError);
			}
		}

		if (me.inTown) {
			portalFor = ""; // the leader is in town: nothing to open
		} else if (!portalFor && portalAsked && Date.now() - portalAsked < 90000) {
			portalFor = "a mate"; // asked while I was in town, and I am out now: the new portal is the one it needs (the user, 2026-11-17)
			portalAsked = 0;
		}

		// A leader that stands in the field and does not move for 2.5 minutes is stuck (a walk that cannot be finished, a portal that cannot be reached): the
		// team would wait for it for ever. Leaving the game starts over from town (Qolbot restarts the bots). Waiting for the team (45 s at most) and the
		// Quick Travel waits happen in town or are shorter than this.
		// Only the leader bot: it is the one with an objective (Plan goal). The followers' Config.Leader is empty in this thread (Follower.js sets it in its
		// own thread), so "no Config.Leader" is not enough: the first version of this made EVERY bot "stuck" while it waited in the field and all of them quit.
		if (!Config.Leader && (Plan.get() || {}).goal && me.gameReady) {
			if (me.x !== stuckX || me.y !== stuckY || me.area !== stuckArea) {
				stuckX = me.x;
				stuckY = me.y;
				stuckArea = me.area;
				stuckAt = getTickCount();
			} else if (getTickCount() - stuckAt > (me.inTown ? 360000 : 150000) && getTickCount() > wpSyncUntil && !(function () { // an idle leader (every quest done) stands still on purpose
				try {
					return FileTools.exists("data/idle." + me.profile + ".txt") && Date.now() - parseInt(FileTools.readText("data/idle." + me.profile + ".txt"), 10) < 30000;
				} catch (idleError) {
					return false;
				}
			}())) { // town: waiting for the team there takes up to 4 minutes
				print("Stuck: I have not moved for 2.5 minutes at " + me.x + "," + me.y + " (area " + me.area + "). Leaving the game to start over.");
				Report.problem("TownChicken", "I am stuck and not moving. Leaving the game to start over.");
				scriptBroadcast("quit");

				return;
			}
		} else {
			stuckAt = getTickCount();
		}

		// at most one portal for a teammate every 25 seconds. (A 90 s limit was tried on 2026-11-13 and taken back: a follower that has come back from town
		// needs the portal NOW, and the real problem is the follower that is alone in town, not the number of requests.)
		if (portalFor && !me.inTown && getTickCount() - portalAt > 25000) {
			portalFor = "";
			portalAt = getTickCount();
			this.togglePause();

			while (!me.gameReady) {
				delay(100);
			}

			try {
				me.overhead("Portal for a teammate");
				Pather.makePortal(); // stays open for the teammate
			} catch (portalError) {
				print("Could not open a portal for a teammate: " + portalError);
			} finally {
				this.togglePause();
			}
		}

		// No town portal scrolls left (and none to make a trip with): leave the game. The bot comes back in town and buys more. Leader and followers alike.
		// Only when the bot can PAY for scrolls: a broke bot that leaves comes back broke and leaves again, every minute, and the team never gets anything
		// done (Barabas, 2026-11-13: 12 games in 20 minutes, no XP). A broke bot says so and carries on without a way back to town.
		if (!me.inTown && me.gameReady && Throttle.due("noportals", 10000) && Team.outOfPortals()) {
			if (me.gold >= 100) {
				Report.problem("TownChicken", "I am out of town portal scrolls. Leaving the game to restock in town.");
				scriptBroadcast("quit");

				return;
			}

			if (Throttle.due("broke", 600000)) {
				Report.problem("TownChicken", "I am out of town portal scrolls and I cannot pay for any (" + me.gold + " gold). Carrying on without them.");
			}
		}

		// THE TEAM STAYS TOGETHER, in Farm and in Quest mode, with or without Quick Travel (this rule is above all the others): when a teammate has
		// not been in my area for a minute (time to repair or sell in town, or to make its way to a waypoint or a portal), the leader goes to town, everybody gathers there, and they all go back out together. A Sorceress that leaves on a Quick
		// Travel errand only places the portal and comes back. Only the leader bot does this (it has no leader), and only while it has an objective.
		if (!Config.Leader && Config.Regroup !== false && getTickCount() > wpSyncUntil && !me.inTown && me.gameReady && Throttle.due("regroup", 5000) &&
				(Plan.get() || {}).goal && Team.canPortal() && Team.lost((Config.RegroupSeconds || 30) * 1000).length) {
			this.togglePause();

			while (!me.gameReady) {
				delay(100);
			}

			try {
				Team.regroup();
			} catch (regroupError) {
				Misc.errorReport(regroupError, "TownChicken.js");
			} finally {
				this.togglePause();
			}
		}

		// ONLY THE LEADER GIVES ORDERS (the user, 2026-11-15: "the leader alone issues orders. nobody else does"; "the person who leaves the field can do so
		// without permission. the leader then instructs the remaining party members to take that bot's portal back to town"): a mate went to town from the
		// field and told me (PartySync.wentTown): I call the team to town through that mate's portal and go the same way myself. UNTESTED in a game.
		if (!me.inTown && me.gameReady && Throttle.due("wenttown", 1000) && PartySync.enabled() && PartySync.isLeader()) {
			wentTown = PartySync.wentTown();

			if (wentTown) {
				this.togglePause();

				while (!me.gameReady) {
					delay(100);
				}

				try {
					if (PartySync.call(me.area, wentTown.urgent, wentTown.name)) {
						Town.reusePortals = true;
						Pather.preferPortalOf = wentTown.name;
						me.overhead("Taking " + wentTown.name + "'s portal to town with the team");
						Town.visitTown(false);
					}
				} catch (wentError) {
					Misc.errorReport(wentError, "TownChicken.js");
				} finally {
					Town.reusePortals = false;
					Pather.preferPortalOf = "";
					PartySync.currentId = 0;
					this.togglePause();
				}
			}
		}

		// THE LEADER'S ORDER "TOWN" (Team.order, the last order trumps all; the user, 2026-11-15): a follower out in the field goes to town at once through
		// the portal the order names (Pather.preferPortalOf; any party portal close by, else its own), whatever it is doing (no busy, no monster check), does
		// its chores, says ready and follows the leader from town. Once per order (PartySync.townDone), counted only when it got to town.
		if (!me.inTown && me.gameReady && Throttle.due("partycall", 1000) && PartySync.enabled()) {
			partyCall = PartySync.townOrder();

			if (partyCall) {
				PartySync.answered = partyCall.callId || partyCall.n;
				PartySync.currentId = partyCall.callId || partyCall.n;
				this.togglePause();

				while (!me.gameReady) {
					delay(100);
				}

				try {
					Town.reusePortals = true; // the named portal is open: take it, no scroll
					Pather.preferPortalOf = partyCall.portal || ""; // the portal the leader named (its own, or the mate's that went first), when it is close
					me.overhead("Going to town with the team");
					print("Party: the leader's order: to town" + (partyCall.portal ? " through " + partyCall.portal + "'s portal" : "") + ".");
					Team.markBusy(60000); // not ready until my main script is idle in town again (PartySync.barrier, Follower: Team.markReady)
					Town.visitTown(false);
				} catch (partyError) {
					Misc.errorReport(partyError, "TownChicken.js");
				} finally {
					if (me.inTown) {
						PartySync.townDone = partyCall.n;
					}

					Town.reusePortals = false;
					Pather.preferPortalOf = "";
					PartySync.currentId = 0;
					this.togglePause();
				}
			}
		}

		// The leader went out of town with the team's last order still "town" (a way out that is not an exit, a waypoint or a portal, which all record
		// "out"): record "out" now, so that no follower takes the old "town" for the current order. Once per "town" order, after the leader was in town.
		if (me.gameReady && Throttle.due("leaderout", 1000) && PartySync.enabled() && PartySync.isLeader()) {
			standing = Team.currentOrder();

			if (standing && standing.word === "town") {
				if (me.inTown) {
					leaderTownN = standing.n;
				} else if (leaderTownN === standing.n) {
					leaderTownN = 0;
					print("Team: out of town with the order still \"town\": the order is now \"out\" to " + Pather.getAreaName(me.area) + ".");
					Team.order("out", {area: me.area, by: "walk"});
				}
			}
		}

		// THE LEADER WAITS FOR MATES THAT QUIT (bot-only runs): a Life Chicken quits the game and Qolbot restarts the bot, which rejoins in town a minute later;
		// the leader used to quest on alone and the mate arrived to an empty town (user, 2026-11-13). Now the leader goes to town and waits for them.
		// OFF (the user, 2026-11-15: "if a party member leaves the game ... they can't abandon him bc he's already gone. if a new party member joins the game,
		// the rules apply"): nobody waits for a bot that is out of the game; when it rejoins it lands in town, the party is split, and the regroup above (Team.lost)
		// brings everybody to town.
		if (PartySync.holdForMissing === true && !me.inTown && me.gameReady && getTickCount() > holdPause && Throttle.due("partyhold", 3000) && PartySync.enabled() && PartySync.isLeader()) {
			holdFor = PartySync.missing(8000);

			if (holdFor.length && PartySync.safe() && !PartySync.isBusy() && Team.canPortal()) {
				holdPause = getTickCount() + 300000; // at most one such wait every five minutes
				this.togglePause();

				while (!me.gameReady) {
					delay(100);
				}

				try {
					PartySync.hold(holdFor);
				} catch (holdError) {
					Misc.errorReport(holdError, "TownChicken.js");
				} finally {
					this.togglePause();
				}
			}
		}

		// a bot that is already in town when a call comes is ready at once
		if (me.inTown && me.gameReady && Throttle.due("partyack", 2000) && PartySync.enabled()) {
			PartySync.ack();
		}

		if (!me.inTown && (townCheck ||
			(Config.TownHP > 0 && me.hp < Math.floor(me.hpmax * Config.TownHP / 100)) ||
			(Config.TownMP > 0 && me.mp < Math.floor(me.mpmax * Config.TownMP / 100)))) {
			this.togglePause();

			while (!me.gameReady) {
				delay(100);
			}

			PartySync.wantCall = true; // bot-only runs: Town.visitTown calls the mates once this bot is IN town (not before: a heal trip that starts together with a Life Chicken quits the game a second later, and the call of a bot that is leaving sent a mate to town for nothing, 17:54, Xena and Sankt)

			try {
				me.overhead("Going to town");
				Town.visitTown(true);
			} catch (e) {
				Misc.errorReport(e, "TownChicken.js");
				scriptBroadcast("quit");

				return;
			} finally {
				PartySync.wantCall = false;
				this.togglePause();

				townCheck = false;
			}
		}

		delay(50);
	}
}