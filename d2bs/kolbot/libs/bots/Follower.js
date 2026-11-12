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

function Follower() {
	var i, j, stop, leader, leaderUnit, charClass, piece, skill, result, unit, player,
		commanders = Config.LeaderOptions,
		attack = true,
		openContainers = true,
		classes = ["amazon", "sorceress", "necromancer", "paladin", "barbarian", "druid", "assassin"],
		action = "";

	// Town chores, but only the trips that are worth making. The first visit of a game does everything once (including
	// the quest sweep); later visits do only what is needed (heal, repair, potions, scrolls, identify, stash, revive,
	// equip, spend points), and say which. Nothing needed = no walking and no chat.
	this.choresRun = false;
	// problem reports: hidden when the player switched them off (Settings tab)
	this.problem = function (message) {
		if (typeof AutoSpec === "object") {
			AutoSpec.problem(message);
		} else {
			say(message);
		}
	};

	// routine chatter: hidden when the player switched task reports off (Settings tab)
	this.note = function (message) {
		if (typeof AutoSpec === "object") {
			AutoSpec.note(message);
		} else {
			say(message);
		}
	};

	// Druids summon their minions in town too, so they walk out with them.
	this.townSummon = function () {
		if (me.classid !== 5 || !me.inTown) {
			return;
		}

		try {
			Precast.summonDruid();
		} catch (summonError) {
			print("AutoSpec: town summon: " + summonError);
		}
	};

	this.doChores = function (force) {
		this.townSummon();

		var first = !this.choresRun,
			reasons = typeof AutoSpec === "object" ? AutoSpec.choresNeeded(first) : null;

		if (!force && reasons && reasons.length === 0) {
			print("AutoSpec: nothing to do in town.");

			return true;
		}

		this.note("Running town chores" + (reasons && reasons.length ? " (" + reasons.join(", ") + ")" : "") + ".");

		// do chores
		Town.doChores();

		// quest NPCs: talk to the ones that have something for me (a reward waiting, an item they want), as often as they
		// need, and use what they hand over. Does nothing when nothing is waiting.
		try {
			Quester.questNpcs();
		} catch (questError) {
			print("AutoSpec: quest NPCs: " + questError);
			me.cancel();
		}

		this.choresRun = true;

		// check skill points to spend
		if (Config.AutoSkill.Enabled && me.getStat(5) > 0) {
			AutoSkill.init(Config.AutoSkill.Build, Config.AutoSkill.Save);
		}

		// check stat points to spend
		if (Config.AutoStat.Enabled && me.getStat(4) > 0) {
			AutoStat.init(Config.AutoStat.Build, Config.AutoStat.Save, Config.AutoStat.BlockChance, Config.AutoStat.UseBulk);
		}

		// move to portal
		Town.move("portalspot");

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
			print("AutoSpec: act " + act + " is not open for " + me.name);
		}

		return open;
	};

	// Get to another act's town. A waypoint only lists acts this character has already visited, so a first trip up
	// (you just killed the act boss) goes the way a player does: through the act's NPC (Warriv, Meshif, ...).
	this.travelToAct = function (act) {
		try {
			Town.goToTown(act);
		} catch (wpError) {
			print("AutoSpec: waypoint to act " + act + " failed (" + wpError + ")");
			me.cancel();
			me.cancel();

			if (act > me.act) {
				this.changeAct(act);
			}
		}

		if (me.inTown) {
			Town.move("portalspot");
		}

		if (me.act !== act) {
			print("AutoSpec: still in act " + me.act + " after trying to reach act " + act);
		}

		return me.act === act;
	};

	// The leader is in another act: get to that act's town (waypoint, else the act's NPC when going up).
	this.followToAct = function (act) {
		if (!this.actOpen(act)) {
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
				print("AutoSpec: chores after travel: " + choreError);
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
		print("AutoSpec: follow " + how + ": area " + fromArea + " -> " + me.area + " (leader in " + (leader ? leader.area : "?") + "), trip " + this.followTrips.length + " in 40s");

		if (this.followTrips.length >= 4) {
			this.followPausedUntil = now + 60000;
			this.followTrips = [];
			this.problem("I keep going out and ending up back in town. I will wait here a minute: open a new portal, or say the word.");
		}
	};

	this.autoFollow = function () {
		var townAreas = [1, 40, 75, 103, 109], leaderInTown, fromArea;

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

		if ((this.lastLeaderArea || 0) !== leader.area) {
			this.lastLeaderArea = leader.area;
			this.cannotReachSaid = false;
			this.askedAt = 0;
		}

		if (me.inTown) {
			if (leaderInTown) {
				if (this.checkLeaderAct(leader) !== me.act) {
					return this.followToAct(this.checkLeaderAct(leader));
				}

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

			fromArea = me.area;

			if (this.checkExit(leader, leader.area) === 1) {
				this.lastFollowAt = Date.now();
				this.note("Going outside.");

				try {
					Pather.moveToExit(leader.area, true);
				} catch (exitError) {
					print("Follower: could not take the exit to " + Pather.getAreaName(leader.area) + " (" + exitError + "), I am in area " + me.area + " at " + me.x + "," + me.y + ", trying again");
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

			try {
				if (Pather.useWaypoint(leader.area, true)) {
					this.lastFollowAt = Date.now(); this.note("Going outside (waypoint).");
					this.noteFollow("by waypoint", fromArea);

					return true;
				}
			} catch (wpError) {
				// no waypoint in that area (the leader is out in the field, e.g. Tamoe Highland): ask for a portal below
			}

			// only the leader's portal that leads to where the leader is now: an old portal of the leader's (from an earlier trip) leads somewhere else
			if (Pather.usePortal(leader.area, leader.name)) {
				this.lastFollowAt = Date.now(); this.note("Going outside (your portal).");
				this.noteFollow("through your portal", fromArea);

				return true;
			}

			// Qolbot: no waypoint to the leader and no portal of the leader's. Keep together: ask the leader (out in the field) to open a portal
			// and stay in town until it does. Ask again now and then (a leader that is mid-fight answers when it can; the leader bot's
			// TownChicken thread does it). A bot never walks out alone to find the leader: that is how it gets killed.
			if (!me.gameReady || !me.inTown) {
				return false; // the portal I just took has already landed me outside: nothing to ask for
			}

			if (!this.askedAt || Date.now() - this.askedAt > 45000) {
				this.askedAt = Date.now();
				say("I cannot reach you. Open a town portal, or I stay in town."); // the leader bot listens for exactly this
			}

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
		if (this.following || !leader || me.inTown || me.dead || !me.gameReady || Config.AutoTown === false || typeof AutoSpec !== "object") {
			return false;
		}

		if (Date.now() < Math.max(this.followPausedUntil || 0, this.giveUpUntil || 0)) {
			return false;
		}

		if ([1, 40, 75, 103, 109].indexOf(leader.area) === -1) {
			return false; // area 0 (loading) or the leader is in the field: the normal follow logic handles it
		}

		AutoSpec.timers.follow = 0; // autoFollow runs on the very next pass of the main loop
		return true;
	};

	var follower = this;

	Pather.interrupt = function () {
		return follower.leaderMoved();
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

	// Change areas to where leader is
	this.checkExit = function (unit, area) {
		if (unit.inTown) {
			return false;
		}

		var i, target,
			exits = getArea().exits;

		for (i = 0; i < exits.length; i += 1) {
			if (exits[i].target === area) {
				return 1;
			}
		}

		if (unit.inTown) {
			target = getUnit(2, "waypoint");

			if (target && getDistance(me, target) < 20) {
				return 3;
			}
		}

		target = getUnit(2, "portal");

		if (target) {
			do {
				if (target.objtype === area) {
					Pather.usePortal(null, null, target);

					return 2;
				}
			} while (target.getNext());
		}

		// Arcane<->Cellar portal
		if ((me.area === 74 && area === 54) || (me.area === 54 && area === 74)) {
			Pather.usePortal(null);

			return 4;
		}

		// Tal-Rasha's tomb->Duriel's lair
		if (me.area >= 66 && me.area <= 72 && area === 73) {
			Pather.useUnit(2, 100, area);

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
			say("I'm not in town!");

			return false;
		}

		if (typeof name === "string") {
			name = name.toLowerCase();
		} else {
			say("No NPC name given.");

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
			say("Invalid NPC.");

			return false;
		}

		if (!Town.move(name === "jerhyn" ? "palace" : name)) {
			Town.move("portalspot");
			say("Failed to move to town spot.");

			return false;
		}

		npc = getUnit(1);

		if (npc) {
			do {
				if (npc.name.replace(/ /g, "").toLowerCase().indexOf(name) > -1) {
					npc.openMenu();
					me.cancel();
					Town.move("portalspot");
					say("Done talking.");

					return true;
				}
			} while (npc.getNext());
		}

		say("NPC not found.");
		Town.move("portalspot");

		return false;
	};

	// Change act after completing last act quest
	this.changeAct = function (act) {
		var npc, preArea, target;

		preArea = me.area;

		switch (act) {
		case 2:
			if (me.area >= 40) {
				break;
			}

			Town.move("warriv");

			npc = getUnit(1, 155);

			if (npc) {
				npc.openMenu();
				Misc.useMenu(0x0D36);
			}

			break;
		case 3:
			if (me.area >= 75) {
				break;
			}

			Town.move("palace");

			npc = getUnit(1, 201);

			if (npc) {
				npc.openMenu();
				me.cancel();
			}

			Town.move("meshif");

			npc = getUnit(1, 210);

			if (npc) {
				npc.openMenu();
				Misc.useMenu(0x0D38);
			}

			break;
		case 4:
			if (me.area >= 103) {
				break;
			}

			if (me.inTown) {
				Town.move("cain");

				npc = getUnit(1, 245);

				if (npc) {
					npc.openMenu();
					me.cancel();
				}

				Town.move("portalspot");
				Pather.usePortal(102, null);
			}

			delay(1500);

			target = getUnit(2, 342);

			if (target) {
				Pather.moveTo(target.x - 3, target.y - 1);
			}

			Pather.usePortal(null);

			break;
		case 5:
			if (me.area >= 109) {
				break;
			}

			Town.move("tyrael");

			npc = getUnit(1, "tyrael");

			if (npc) {
				npc.openMenu();
				me.cancel();

				try {
					Pather.useUnit(2, 566, 109);
				} catch (a5e) {

				}
			}

			break;
		}

		delay(2000);

		while (!me.area) {
			delay(500);
		}

		if (me.area === preArea) {
			me.cancel();
			Town.move("portalspot");
			say("Act change failed.");

			return false;
		}

		Town.move("portalspot");
		//say("Act change successful.");

		if (act === 2) {
			//say("Don't forget to talk to Drognan after getting the Viper Amulet!");
		}

		if (act === 3) {
			//say("Don't forget to talk to Hratli before getting the Gidbinn!");
		}

		return true;
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
			case "tele":
			case me.name + " tele":
				if (Pather.teleport) {
					Pather.teleport = false;

					say("Teleport off.");
				} else {
					Pather.teleport = true;

					say("Teleport on.");
				}

				break;
			case "tele off":
			case me.name + " tele off":
				Pather.teleport = false;

				say("Teleport off.");

				break;
			case "tele on":
			case me.name + " tele on":
				Pather.teleport = true;

				say("Teleport on.");

				break;
			case "a":
			case me.name + " a":
				if (attack) {
					attack = false;

					say("Attack off.");
				} else {
					attack = true;

					say("Attack on.");
				}

				break;
			case "flash":
				Packet.flash(me.gid);

				break;
			case "aoff":
			case me.name + " aoff":
				attack = false;

				say("Attack off.");

				break;
			case "aon":
			case me.name + " aon":
				attack = true;

				say("Attack on.");

				break;
			case "save":
				say("/save");
				delay(5000);
				say("Saved.");
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

					say("Resuming.");
				} else {
					stop = true;

					say("Stopping.");
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
							say("Active aura is: " + skill);

							Config.AttackSkill[2] = skill;
							Config.AttackSkill[4] = skill;

							Skill.setSkill(skill, 0);
							//Attack.init();
						} else {
							say("I don't have that aura.");
						}
					}

					break;
				}

				if (msg.indexOf("skill ") > -1) {
					piece = msg.split(" ")[0];

					if (charClass.indexOf(piece) > -1 || piece === me.name || piece === "all") {
						skill = parseInt(msg.split(" ")[2], 10);

						if (me.getSkill(skill, 1)) {
							say("Attack skill is: " + skill);

							Config.AttackSkill[1] = skill;
							Config.AttackSkill[3] = skill;

							//Attack.init();
						} else {
							say("I don't have that skill.");
						}
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

							// init travel to location
							this.openWormhole(piece);
						}
						else
						{
							say("I am not able to travel quickly.");
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

				say("Switching leader to " + piece + ".");

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
			wp_logbook.push(me.area); // save to log
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

	this.openWormhole = function (destination)
	{
		// I need to add a check in here for hasWaypoint
		// so she doesn't run off into the wild and get killed.
		var is_portal = true;
		switch (destination)
		{
			case "countess":
				say("Opening portal to the Tower Cellar Level 5.");
				Town.goToTown(1);
				Pather.useWaypoint(6);
				Pather.moveToExit([20, 21, 22, 23, 24, 25], true);
				break;
			case "mausoleum":
				say("Opening portal to the Mausoleum.");
				Town.goToTown(1);
				Pather.useWaypoint(3);
				Pather.moveToExit(17, true);
				Pather.moveToExit(19, true);
				break;
			case "pit":
				say("Opening portal to the Pit.");
				Town.goToTown(1);
				Pather.useWaypoint(6);
				Pather.moveToExit([7, 12], true);
				break;
			case "andy":
			case "andariel":
				say("Opening portal to the Catacombs Level 4.");
				Town.goToTown(1);
				Pather.useWaypoint(35);
				Pather.moveToExit([36, 37], true);
				break;
			case "at": // ancient tunnels
			case "tunnels":
				say("Opening portal to the Ancient Tunnels.");
				Town.goToTown(2);
				Pather.useWaypoint(44);
				Pather.moveToExit(65, true);
				break;
			case "summoner":
				say("Opening portal to the Arcane Sanctuary.");
				Pather.useWaypoint(74);
				Pather.moveToPreset(me.area, 2, 357, -3, -3);
				break;
			case "duriel":
				say("Opening portal to Tal Rasha's Chamber.");
				Town.goToTown(2);
				Pather.useWaypoint(46);
				Pather.moveToExit(getRoom().correcttomb, true);
				Pather.moveToPreset(me.area, 2, 152, -11, 3);
				break;
			case "ft": // forgotten temple
			case "kt":
			case "temple":
				say("Opening portal to the Forgotten Temple.");
				Town.goToTown(3);
				Pather.journeyTo(94);
				break;
			case "meph":
			case "mephisto":
				say("Opening portal to the Durance of Hate Level 3.");
				Town.goToTown(3);
				Pather.useWaypoint(101);
				Pather.moveToExit(102, true);
				break;
			case "diablo":
				say("Opening portal to the Chaos Sanctuary.");
				Town.goToTown(4);
				Pather.useWaypoint(107);
				Pather.moveTo(7788, 5292);
				break;
			case "halls":
			case "nihlathak":
				say("Opening portal to the Halls of Vaught.");
				Town.goToTown(5);
				Pather.useWaypoint(123);
				Pather.moveToExit(124, true);
				break;
			case "baal":
				say("Opening portal to Baal's Throne Room.");
				Town.goToTown(5);
				Pather.useWaypoint(129);
				Pather.moveToExit([130, 131], true);
				break;
			default:
				say("No such place.");
				is_portal = false;
				break;
		}

		if (is_portal)
		{
			// go back to town
			Pather.makePortal(true); // flag true to use portal

			// announce
			say("Portal is open.");
		}
	};

	// BEGIN EXECUTION

	addEventListener("chatmsg", this.chatEvent);

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

	if (!leader) {
		say("Leader not found.");
		quit();
	} else {
		this.note("Leader found.");
	}

	while (!Misc.inMyParty(Config.Leader)) {
		delay(500);
	}

	//say("Partied.");

	// make sure the pickup area of the inventory is free (moves what is in it to the stash, and says so in chat)
	if (me.inTown && typeof AutoSpec === "object") {
		try {
			AutoSpec.freePickupArea();
		} catch (areaError) {
			print("AutoSpec: freePickupArea error: " + areaError);
		}
	}

	if (me.inTown) {
		this.doChores();
	}

	// Main Loop
	while (Misc.inMyParty(Config.Leader)) {

		// save the character now and then (PlugY /save)
		if (typeof AutoSpec === "object") {
			AutoSpec.autoSave();
		}

		// say quote
		Banter.speak();

		if (me.mode === 17) {
			while (!me.inTown) {
				me.revive();
				delay(1000);
			}

			Town.move("portalspot");
			say("I'm alive!");
		}

		while (stop) {
			delay(500);
		}

		if (typeof AutoSpec === "object") {
			AutoSpec.questReport(false);
		}

		// follow the leader between town and the field by itself
		if (Config.AutoTown !== false && typeof AutoSpec === "object" && AutoSpec.due("follow", 2500)) {
			this.following = true;

			try {
				this.autoFollow();
			} catch (followError) {
				print("AutoSpec: autoFollow error: " + followError);

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

			// badly hurt: go to town and see the healer instead of staying in the field on the last few points of life
			if (!me.dead && me.hp * 100 / me.hpmax < (Config.HealTripHP || 40) && typeof AutoSpec === "object" && AutoSpec.due("healtrip", 45000)) {
				this.problem("I am badly hurt. Going to town to heal.");

				try {
					Misc.unShift(); // out of bear form for the trip (the town portal scroll)
					Town.visitTown();
				} catch (healError) {
					print("AutoSpec: heal trip: " + healError);
					me.cancel();
				}
			}

			// a summoner that does not fight never gets the after-fight buffs: every minute summon whatever has died (summons work in bear form too)
			if (Config.FollowNoFight && me.classid === 5 && typeof AutoSpec === "object" && AutoSpec.due("resummon", 60000)) {
				try {
					Precast.summonDruid();
				} catch (summonError) {
					print("AutoSpec: summon: " + summonError);
				}
			}

			// a character that must stay out of the way (Config.FollowDistance, e.g. a summoner) keeps that far from the leader
			if (Config.FollowNoFight && Config.Wereform && typeof AutoSpec === "object" && AutoSpec.due("shift", 5000)) {
				try {
					Misc.shapeShift(Config.Wereform); // stay in bear/wolf form: far more life, and nothing to do in it but survive
				} catch (shiftError) {
					print("AutoSpec: shapeshift: " + shiftError);
				}
			}

			if (leaderUnit && getDistance(me.x, me.y, leaderUnit.x, leaderUnit.y) <= 60) {
				if (Config.FollowDistance > 6) {
					this.standAway(leaderUnit, Config.FollowDistance);
				} else if (getDistance(me.x, me.y, leaderUnit.x, leaderUnit.y) > 6) {
					//Pather.moveToUnit(leaderUnit);

					// make the bots stand randomly arround you
					Pather.moveTo(leaderUnit.x + rand(-6, 6), leaderUnit.y + rand(-6, 6));
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

			if (leader.area !== me.area && !me.inTown) {
				while (leader.area === 0) {
					delay(100);
				}

				result = this.checkExit(leader, leader.area);

				switch (result) {
				case 1:
					try {
						Pather.moveToExit(leader.area, true);
					} catch (exitError) { // the exit tile was not there yet (the area had not loaded, or the leader moved on): try again, do not end the script
						print("Follower: could not take the exit to " + Pather.getAreaName(leader.area) + " (" + exitError + "), I am in area " + me.area + " at " + me.x + "," + me.y + ", trying again");
						delay(1000);
					}

					break;
				case 2:
					break;
				case 3:
					Pather.useWaypoint(leader.area, true);
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
			if (typeof AutoSpec !== "object" || AutoSpec.due("equip", 30000)) {
				if (me.inTown) { // gear another bot dropped in town may be an upgrade for this one
					Pickit.pickItems();
				}

				Item.autoEquip();
				Item.autoMercEquip();
			}
		}

		switch (action) {
			case "cow":
				if (me.area === 1) {
					Town.move("portalspot");

					if (!Pather.usePortal(39)) {
						say("Failed to use cow portal.");
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
				say("Reloading.");
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
				say("!Picking items.");
				Pickit.pickItems();

				if (openContainers) {
					this.openContainers(20);
				}

				//say("!Done picking.");

				break;
			case "1":
				if (me.inTown && !this.followedRecently()) {
					say("Going outside.");
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
					say("Going to town.");
					Pather.usePortal(null, leader.name);
					this.doChores();
				}
				else
				{
					if (leader.inTown && this.checkLeaderAct(leader) !== me.act && this.actOpen(this.checkLeaderAct(leader))) {
						say("Going to leader's town.");
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

				say("No TP scrolls or tomes.");

				break;
		}

		if (action.indexOf("talk") > -1) {
			this.talk(action.split(" ")[1]);
		}

		action = "";

		delay(100);
	}

	return true;
}