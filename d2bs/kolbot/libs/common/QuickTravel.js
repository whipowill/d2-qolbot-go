/**
*	@filename	QuickTravel.js
*	@desc		Quick Travel: a Sorceress in the party teleports to a boss, opens a portal and takes it to town, and the team takes the portal instead of
*				walking. "portal <place>" in chat (no name) is the Follower command that sends her; every bot works out the same Sorceress
*				(Team.chosenSorc). The Quick Travel setting (Settings, Behavior) switches it on for both modes; Quest mode also needs Full Clear off.
*				The boss scripts (Countess.js, Andariel.js, ...) and the quests ask QuickTravel.portal and walk when it says no.
*/

include("common/Plan.js");
include("common/Report.js");
include("common/Team.js");
include("common/Speech.js");

var QuickTravel = {

	// WAYPOINT HELPER: a waypoint the leader does not have yet, and a team mate that has it. The leader asks in chat ("waypoint <area>"); every bot
	// that has the waypoint answers "I have waypoint <area>." (Follower.js), the first by name is asked to go ("waypoint go <name> <area>"): it takes
	// the waypoint, opens a portal beside it and returns to town. The leader takes that portal and clicks the waypoint. The team follows through the
	// portal. True when the leader stands in the area afterwards; false (nothing lost) when nobody has it: the leader walks as before.
	waypointNoHelper: {}, // area -> nobody had it, or the portal failed this game: not asked again

	waypoint: function (area) {
		var names = [], msgs, i, waited, act, helper;

		if (this.waypointNoHelper[area] || Config.Leader || !Team.expected().length) {
			return false;
		}

		act = area <= 39 ? 1 : (area <= 74 ? 2 : (area <= 102 ? 3 : (area <= 108 ? 4 : 5)));

		try {
			if (!me.inTown || me.act !== act) {
				Town.goToTown(act);
			}
		} catch (townError) {
			this.log("cannot go to town to ask for the waypoint portal: " + townError);

			return false;
		}

		// asked and answered by the bots' message log (Team.command / haswp), not the public chat
		Team.take("qtwp", null, ["haswp"]); // old answers are not for this question
		Team.command("waypoint " + area);

		for (waited = 0; waited < 8; waited += 1) { // four seconds for the ones that have it to say so
			delay(500);
			msgs = Team.take("qtwp", null, ["haswp"]);

			for (i = 0; i < msgs.length; i += 1) {
				if (String(msgs[i].a[0]) === String(area) && names.indexOf(msgs[i].from) < 0) {
					names.push(msgs[i].from);
				}
			}
		}

		if (!names.length) {
			this.log("nobody has the waypoint of area " + area + ": walking");
			this.waypointNoHelper[area] = true;

			return false;
		}

		helper = names.sort()[0];
		this.log(helper + " takes the waypoint to area " + area + " and opens a portal");
		Team.take("qt", [helper], this.portalWords); // forget older answers: only the one to this trip counts
		Team.order("errand", {to: helper, place: "waypoint" + area}); // the order record: this errand is the helper's newest order (Team.order)
		Team.command("waypoint go " + helper + " " + area);

		if (!this.portal("waypoint" + area, area, act, helper, null, 40000)) {
			this.waypointNoHelper[area] = true;

			if (typeof Waypoints === "object") {
				Waypoints.rememberBlocked(area); // not tried again until a quest more is done
			}

			return false;
		}

		return true;
	},

	noPortal: {}, // place -> the Sorceress gave no portal there this game: walk, do not ask again

	// what portals I can see right now, for the log: "Meir>25 d12, Vanity>1 d3" (owner > the area it leads to, distance); the evidence when a portal is not found
	portalsInView: function () {
		var out = [], portal = getUnit(2, "portal");

		if (portal) {
			do {
				out.push((portal.getParent() || "red") + ">" + portal.objtype + " d" + Math.round(getDistance(me, portal)));
			} while (portal.getNext());
		}

		return out.length ? out.join(", ") : "none";
	},

	// The name of the Sorceress whose Teleport the team may use, or null. It needs the Quick Travel setting (Settings, Behavior) and a Sorceress that
	// Qolbot started in the game. Farm mode then always uses her; Quest mode only when Full Clear is off. A Sorceress leader with
	// Teleport is her own (selfTrip). Which Sorceress is Team.chosenSorc: the same one in every bot.
	sorc: function () {
		var plan = Plan.get(), sorc;

		if (!plan || !plan.teleportTeam) {
			return null; // the Quick Travel setting (Settings, Behavior) is the master switch, for both modes
		}

		if (plan.hunt) {
			return null; // a hunt (level or gold) is done on foot, clearing the zones: no portals from a Sorceress (the user, 2026-11-14)
		}

		if (!(plan.goal === "Farm" || (plan.goal === "Quest" && plan.questClearAll === false))) {
			return null; // Quest mode with Full Clear on: every zone is cleared on foot
		}

		if (me.classid === 1 && me.getSkill(54, 1)) {
			// a Sorceress with Teleport: as the leader she makes the trip herself (the user, 2026-11-14: "if the leader is a sorc, she can still make use
			// of quick travel"): she teleports there alone, the team waits in town and comes through her portal (selfTrip). A follower: nobody.
			return Team.isLeader() && Team.expected().length ? me.name : null;
		}

		sorc = Team.chosenSorc();

		return sorc && sorc !== me.name ? sorc : null;
	},

	// The way to each Quick Travel place ("portal <place>"), ending where the portal is opened: from the place's town, waypoint and exits. The chosen
	// Sorceress (Follower.travelWormhole) takes it for the team, and a Sorceress leader takes it herself (selfTrip). False for a place it does not know.
	route: function (place) {
		switch (place)
		{
			case "countess":
				Speech.task("Opening portal to the Tower Cellar Level 5.");
				Town.goToTown(1);
				Pather.useWaypoint(6);
				Pather.moveToExit([20, 21, 22, 23, 24, 25], true);
				break;
			case "mausoleum":
				Speech.task("Opening portal to the Mausoleum.");
				Town.goToTown(1);
				Pather.useWaypoint(3);
				Pather.moveToExit(17, true);
				Pather.moveToExit(19, true);
				break;
			case "radament":
				Speech.task("Opening portal to Radament.");
				Town.goToTown(2);
				Pather.useWaypoint(48);
				Pather.moveToExit(49, true);
				Pather.moveToPreset(me.area, 2, 355, 8, 0); // a few steps from the Book of Skill chest, where the leader will fight
				break;
			case "pit":
				Speech.task("Opening portal to the Pit.");
				Town.goToTown(1);
				Pather.useWaypoint(6);
				Pather.moveToExit([7, 12], true);
				break;
			case "andy":
			case "andariel":
				Speech.task("Opening portal to the Catacombs Level 4.");
				Town.goToTown(1);
				Pather.useWaypoint(35);
				Pather.moveToExit([36, 37], true);
				break;
			case "at": // ancient tunnels
			case "tunnels":
				Speech.task("Opening portal to the Ancient Tunnels.");
				Town.goToTown(2);
				Pather.useWaypoint(44);
				Pather.moveToExit(65, true);
				break;
			case "summoner":
				Speech.task("Opening portal to the Arcane Sanctuary.");
				Pather.useWaypoint(74);
				Pather.moveToPreset(me.area, 2, 357, -3, -3);
				break;
			case "duriel":
				Speech.task("Opening portal to Tal Rasha's Chamber.");
				Town.goToTown(2);
				Pather.useWaypoint(46);
				Pather.moveToExit(getRoom().correcttomb, true);
				Pather.moveToPreset(me.area, 2, 152, -11, 3);
				break;
			case "ft": // forgotten temple
			case "kt":
			case "temple":
				Speech.task("Opening portal to the Forgotten Temple.");
				Town.goToTown(3);
				Pather.journeyTo(94);
				break;
			case "izual": // Fallen Angel: the Plains of Despair (no waypoint there): teleport past the whole Outer Steppes, the portal at the start of the plains
				Speech.task("Opening portal to the Plains of Despair.");
				Town.goToTown(4);
				Pather.journeyTo(105);
				break;
			case "hephasto": // Hell's Forge (the user, 2026-11-14: "maybe add a quick travel with sorc to haphistos location"): from the River of Flame's waypoint
			case "forge": // to the Hellforge, where Hephasto stands guard; the portal a little short of it
				Speech.task("Opening portal to the Hellforge.");
				Town.goToTown(4);
				Pather.useWaypoint(107);
				Pather.moveToPreset(me.area, 2, 376, 12, 12);
				break;
			case "deadhalls": // the Horadric Cube's chest: Halls of the Dead Level 3 (Quester.fetchCube, the team's cube hunt)
				Speech.task("Opening portal to the Halls of the Dead.");
				Town.goToTown(2);
				Pather.useWaypoint(57);
				Pather.moveToExit(60, true);
				break;
			case "spidercavern": // Khalim's Eye (Quester.act3_khalims_will)
				Speech.task("Opening portal to the Spider Cavern.");
				Town.goToTown(3);
				Pather.journeyTo(85);
				break;
			case "flayerdungeon": // Khalim's Brain: Flayer Dungeon level 3
				Speech.task("Opening portal to the Flayer Dungeon.");
				Town.goToTown(3);
				Pather.journeyTo(91);
				break;
			case "sewers": // Khalim's Heart: the Sewers (level 1; the lever and the door to level 2 are the leader's)
				Speech.task("Opening portal to the Sewers.");
				Town.goToTown(3);
				Pather.journeyTo(92);
				break;
			// Qolbot (the user, 2026-11-14: "make sure all these quests have quick travel points if applicable"): the quest spots that were walked to.
			// Each from the nearest waypoint; the portal near the quest object or boss. UNTESTED live.
			case "chaos": // the Chaos Sanctuary farm run (a full clear): the portal at its entrance, past the River of Flame
				Speech.task("Opening portal to the Chaos Sanctuary entrance.");
				Town.goToTown(4);
				Pather.useWaypoint(107);
				Pather.moveToExit(108, true);
				break;
			case "corpsefire": // the Den of Evil (farm run Corpsefire): the portal at Corpsefire's spot
				Speech.task("Opening portal to the Den of Evil.");
				Town.goToTown(1);
				Pather.useWaypoint(3);
				Pather.moveToExit([2, 8], true);
				Pather.moveToPreset(me.area, 1, 774, 8, 8);
				break;
			case "bloodraven": // Sisters' Burial Grounds: Blood Raven in the Burial Grounds
				Speech.task("Opening portal to Blood Raven.");
				Town.goToTown(1);
				Pather.useWaypoint(3);
				Pather.moveToExit(17, true);
				Pather.moveToPreset(17, 1, 805, 10, 10);
				break;
			case "malus": // Tools of the Trade: the Horadric Malus in the Barracks
				Speech.task("Opening portal to the Barracks.");
				Town.goToTown(1);
				Pather.useWaypoint(27);
				Pather.moveToExit(28, true);
				Pather.moveToPreset(28, 2, 108, 8, 8);
				break;
			case "maggotlair": // Horadric Staff: the Staff of Kings, Maggot Lair level 3
				Speech.task("Opening portal to the Maggot Lair.");
				Town.goToTown(2);
				Pather.useWaypoint(43);
				Pather.moveToExit([62, 63, 64], true);
				Pather.moveToPreset(64, 2, 356, 8, 8);
				break;
			case "clawviper": // Horadric Staff: the Viper Amulet, Claw Viper Temple level 2
				Speech.task("Opening portal to the Claw Viper Temple.");
				Town.goToTown(2);
				Pather.useWaypoint(44);
				Pather.moveToExit([45, 58, 61], true);
				Pather.moveToPreset(61, 2, 149, 8, 8);
				break;
			case "gidbinn": // Blade of the Old Religion: the Gidbinn's altar in the Flayer Jungle
				Speech.task("Opening portal to the Gidbinn.");
				Town.goToTown(3);
				Pather.useWaypoint(78);
				Pather.moveToPreset(78, 2, 252, 8, 8);
				break;
			case "anya": // Prison of Ice: frozen Anya in the Frozen River
				Speech.task("Opening portal to Anya.");
				Town.goToTown(5);
				Pather.useWaypoint(113);
				Pather.moveToExit(114, true);
				Pather.moveToPreset(114, 2, 460, 8, 8);
				break;
			case "ancients": // Rite of Passage: the Arreat Summit
				Speech.task("Opening portal to the Arreat Summit.");
				Town.goToTown(5);
				Pather.useWaypoint(118);
				Pather.moveToExit(120, true);
				break;
			case "durance": // the Durance of Hate farm run: the portal at the Level 2 waypoint (live 23:29: the followers had no waypoint there and kept retrying it)
				Speech.task("Opening portal to the Durance of Hate Level 2.");
				Town.goToTown(3);
				Pather.toDurance(); // the Level 2 waypoint, or without it from Travincal (she takes it on the way)
				break;
			case "meph":
			case "mephisto":
				Speech.task("Opening portal to the Durance of Hate Level 3.");
				Town.goToTown(3);
				Pather.toDurance(); // the Level 2 waypoint, or without it from Travincal (she takes the Level 2 waypoint on the way)
				Pather.moveToExit(102, true);
				break;
			case "diablo":
				Speech.task("Opening portal to the Chaos Sanctuary.");
				Town.goToTown(4);
				Pather.useWaypoint(107);
				Pather.moveTo(7788, 5292);
				break;
			case "halls":
			case "nihlathak":
				Speech.task("Opening portal to the Halls of Vaught.");
				Town.goToTown(5);
				Pather.useWaypoint(123);
				Pather.moveToExit(124, true);
				break;
			case "baal":
				Speech.task("Opening portal to Baal's Throne Room.");
				Town.goToTown(5);
				Pather.useWaypoint(129);
				Pather.moveToExit([130, 131], true);
				break;
			default:
				Speech.say("noPlace");

				return false;
		}

		return true;
	},

	// A Sorceress LEADER's own Quick Travel: she makes the "stay in town" call (Team.setSolo: the followers wait at the portal spot, Follower.js),
	// teleports the route alone (Team.solo: no waits at the exits, no "leaving" call), opens a portal at the place and goes back through it to town.
	// Then she takes it out again as its maker: the team goes out first and she goes last (Pather.usePortal -> Team.sendOutFirst), the same as with a
	// follower Sorceress's portal (the user, 2026-11-14: live, she dropped the portal and killed the boss before anybody came). True when she stands in
	// one of `areas` afterwards; false (in town, nothing lost) and the caller walks.
	selfTrip: function (place, areas, act) {
		var ok = false, teleport = Pather.teleport, area = 0;

		// the team first, in the town of the place's act and ready (the usual wait, with its regroup if one is out), and only then the call: the wait would
		// undo it. The act's town first: the wait in another town let her go while the team was still a waypoint away (live 21:31:51, Corpsefire from Harrogath)
		try {
			if (act && (!me.inTown || me.act !== act)) {
				Town.goToTown(act);
			}

			// a mate's party trip (PartySync) must be over first: while it is on, the town wait (afterParty) and the "maker goes last" send-out (tripOn) both
			// stand aside, and she went alone (live 21:40:45, the Pit: Sankt's heal trip was still on, the team never got her "proceed" and split)
			for (var partyWait = getTickCount(); typeof PartySync === "object" && (PartySync.tripOn() || PartySync.afterParty()) && getTickCount() - partyWait < 60000; ) {
				delay(500);
			}

			Team.waitToLeaveTown();
		} catch (waitError) {
			this.log("town wait: " + waitError);
		}

		this.log("teleporting to " + place + " myself; the team waits in town for my portal");
		Team.setSolo(true);
		Team.solo = true;
		Pather.teleport = true;

		try {
			ok = this.route(place) && (!areas.length || areas.indexOf(me.area) > -1);

			if (ok) {
				area = me.area;
				Pather.makePortal(true); // it stays open; through it back to town
			}
		} catch (tripError) {
			this.log("my trip to " + place + ": " + tripError);
			ok = false;
		} finally {
			Team.solo = false;
			Pather.teleport = teleport;
		}

		if (!ok) {
			Team.setSolo(false); // the call ends: the team follows me as usual again
			this.log("did not get to " + place + " (area " + me.area + "): walking instead");
			this.noPortal[place] = true;

			try {
				if (!me.inTown) {
					Town.goToTown();
				}
			} catch (backError) {
				this.log("back to town: " + backError);
			}

			return false;
		}

		this.log("opened my own portal to " + place + ": calling the team"); // the Activity entry (cmd/qolbot activity.go: Quick Travel, own portal)
		Team.setSolo(false); // I am in town again: the followers wait with me, and my portal call below sends them out first

		try {
			if (me.inTown) {
				Pather.usePortal(area, me.name); // the maker goes last (Team.sendOutFirst)
			}
		} catch (outError) {
			this.log("back out through my portal: " + outError);
		}

		if (areas.length ? areas.indexOf(me.area) === -1 : me.area !== area) {
			this.log("not back at " + place + " after my portal (area " + me.area + "): walking instead");
			this.noPortal[place] = true;

			return false;
		}

		Team.holdAndGather(Team.limits.boss); // anybody still on the way: nobody attacks before the team is here

		return true;
	},

	// Ask the Sorceress for a portal to a boss (the Follower chat command "portal <place>", no name: the chosen Sorceress teleports there, opens a
	// portal and takes it to town) and take it. True when this bot stands in `area` afterwards. False, and nothing lost, when the option is off, no Sorceress is in the
	// game, she does not answer in time or the portal cannot be used: the caller then walks as it always did.
	// area: where the portal comes out (a number, or a list of areas that are all right: Duriel's tomb is one of seven); act: the act of that
	// place, when area does not say it.
	//
	// helper: the name of the bot that opens the portal (a waypoint helper, see waypoint below), and request: what to say to ask for it (null: the
	// helper was asked already). Without them it is the chosen Sorceress and "portal <place>".
	portalWords: ["portalopen", "noget", "noquick", "noplace"], // a portal helper's answers in the bots' message log (Speech.answers)

	portal: function (place, area, act, helper, request, maxMs) {
		var sorc = helper || (this.noPortal[place] ? null : this.sorc()), said = "", msgs, waited, attempt, until,
			areas = typeof area === "number" ? [area] : (area || []);

		act = act || (areas[0] <= 39 ? 1 : (areas[0] <= 74 ? 2 : (areas[0] <= 102 ? 3 : (areas[0] <= 108 ? 4 : 5))));

		if (!sorc) {
			return false;
		}

		// a place the game keeps shut until a quest is done (Waypoints.gates, the leader's own quests): no portal is asked for, it would only be refused
		if (!helper && typeof Waypoints === "object" && areas.length && Waypoints.gated(areas[0])) {
			this.log(place + " is behind a quest I have not done: walking");
			this.noPortal[place] = true;

			return false;
		}

		if (sorc === me.name && !helper) {
			return this.selfTrip(place, areas, act);
		}

		// Her portal comes out in the town of the boss's act: be there, not in whatever town (or field) I am in now.
		try {
			if (!me.inTown || me.act !== act) {
				Town.goToTown(act);
			}
		} catch (townError) {
			this.log("cannot go to town to meet " + sorc + ": " + townError);

			return false;
		}

		this.log("asking " + sorc + " for a portal to " + place);

		if (request !== null) {
			Team.take("qt", [sorc], this.portalWords); // forget older answers: only the one to this request counts
			Team.order("errand", {to: sorc, place: place}); // the order record: the errand is her newest order, an older "town" does not call her back (Team.order)
			Team.command(request || "portal " + place); // by the bots' message log, not the public chat
		}

		// No time limit (the user, 2026-11-15: "darius should not have been instructed to leave town if Meir's portal hadn't been created yet"): the leader
		// waits in town for her answer, and only her answer, or her leaving the game, ends the wait. The old 150 s give-up sent the team out on foot while
		// she was still on her way (live 17:03:44, Sankt and Meir).
		for (waited = 0; !said; waited += 1) {
			delay(500);
			msgs = Team.take("qt", [sorc], this.portalWords);

			if (msgs.length) {
				said = msgs[msgs.length - 1].w; // her answer: portalopen, noget, noquick or noplace
			} else if (Team.areas()[sorc] === undefined) {
				said = "left the game";
			} else if (waited > 0 && waited % 60 === 0) {
				this.log("still waiting in town for " + sorc + "'s portal to " + place);

				// ask again: the request may have been lost (live 2026-11-16 10:09: the drop of her trip's task cancelled it; she ignores a second one while she is
				// at it, Follower: portal errand). UNTESTED in a game.
				if (request !== null) {
					Team.command(request || "portal " + place);
				}
			}
		}

		if (said !== "portalopen") {
			this.log(sorc + " gave no portal to " + place + " (" + said + "): walking instead");
			this.noPortal[place] = true; // not asked again this game

			return false;
		}

		delay(1500); // let the portal show
		until = Date.now() + (maxMs || 90000); // a portal that the game will not let me use (a place whose quest is not done) must not hold the team up for minutes

		// Her portal opens where she arrived in town, which may be out of sight from where I stand: go to the portal spot first and ask for HER portal
		// by name (usePortal then also walks to the spot on its retries). It stays open, so keep looking for about 20 seconds before giving up.
		for (attempt = 0; attempt < 8 && areas.indexOf(me.area) === -1 && Date.now() < until; attempt += 1) {
			try {
				Town.move("portalspot");
				this.log("portals in view: " + this.portalsInView());
				Pather.usePortal(typeof area === "number" ? area : null, sorc);
			} catch (portalError) {
				this.log("could not take " + sorc + "'s portal: " + portalError);
			}

			if (areas.indexOf(me.area) === -1 && me.area !== 0) {
				delay(2500); // a portal that is still opening, or one that is not there yet: look again
			}
		}

		if (areas.indexOf(me.area) === -1) {
			this.log("not in the right place after " + sorc + "'s portal (area " + me.area + "): walking instead");
			this.noPortal[place] = true;

			return false;
		}

		this.log("took " + sorc + "'s portal to " + (/^waypoint\d+$/.test(place) ? "waypoint " + Pather.getAreaName(parseInt(place.slice(8), 10)) : place)); // a waypoint helper portal: the area's name, not "waypoint3"

		if (!helper && typeof Team === "object") {
			Team.holdAndGather(Team.limits.boss); // a boss place: the team comes before anything is attacked (a waypoint helper's portal needs no waiting here)
		}

		return true;
	}
};

Report.mixin(QuickTravel, "QuickTravel"); // QuickTravel.log / note / problem, written under its own name
