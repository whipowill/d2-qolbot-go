/**
*	@filename	Quester.js
*	@author		whipowill
*	@desc		handle player quests
*/

// Some notes about how quests work in parties.  When in a party
// all the players will get the quest progress that you get, even if they
// don't pick up all the items or talk to all the quest givers.  The
// only thing that they must do is some items have to be picked up
// and consumed, like the Book of Skill.  These items are handled in
// C:\your\path\to\d2-qolbot\src\d2bs\kolbot\pickit\QOL\Quest.nip
// and requires that your config allows inventory space for the items
// to be picked up.

include("common/Report.js");
include("common/PartySync.js");
include("common/QuickTravel.js");
include("common/QuestTable.js");
include("common/Saver.js");
include("common/ActTravel.js");
include("common/Waypoints.js"); // the first trip into the next act goes through its NPC
include("common/Throttle.js");
include("common/QuestStates.js"); // the record of the quests' states (what changed, when, after which NPC)
include("common/QuestItems.js"); // the quest consumables: making room for them, using them up, logging it

var Quester = {

	// [act, number in the act, title, quest id, script, the player chooses the reward]: libs/common/QuestTable.json, the table Qolbot reads too
	quests: QuestTable.playable(),

	getQuestProgress: function (quest_id)
	{
		sendPacket(1, 0x40);
		delay(500);
		QuestStates.snapshot("progress check of quest " + quest_id);

		// init
		var progress = 0;

		//QuestCompletion
		//0 = Requirements Complete (Quest Complete)
		//2 = Quest Started
		//3-10 = Parts of Quest Complete Varies by Quest
		//12 = Quest Box Filled in
		if (me.getQuest(quest_id, 0)) progress = 100;
		/*
		For some reason none of these responses really work.  I've tested
		in multiplayer extensively, it's always just bogus.  The only one
		that works is "is complete" or not.
		else if (me.getQuest(quest_id, 1)) progress = 10;
		else if (me.getQuest(quest_id, 2)) progress = 20;
		else if (me.getQuest(quest_id, 3)) progress = 30;
		else if (me.getQuest(quest_id, 4)) progress = 40;
		else if (me.getQuest(quest_id, 5)) progress = 50;
		else if (me.getQuest(quest_id, 6)) progress = 60;
		else if (me.getQuest(quest_id, 7)) progress = 70;
		else if (me.getQuest(quest_id, 8)) progress = 80;
		else if (me.getQuest(quest_id, 9)) progress = 90;
		else if (me.getQuest(quest_id, 10)) progress = 95;
		else if (me.getQuest(quest_id, 12)) progress = 1;
		*/

		return progress;
	},

	idle: function ()
	{
		// idle...
		if (!Config.QuietChat) // a task report: only with "Bots report when they engage in tasks" on
			say(Speech.flavor('Idle.'));
		// the user, 2026-11-17: the bots idle when every quest is done and stay so until he restarts them: the town chicken thread's "stuck" watchdog (6 min in
		// town) took the idle leader for a hung one and restarted the game (13:50:54). The idle leader says so in a file the watchdog reads (TownChicken.js).
		while (1) {
			try {
				FileTools.writeText("data/idle." + me.profile + ".txt", "" + Date.now());
			} catch (idleError) {}

			delay(1000);
		}
	},

	error: function (msg)
	{
		// print
		D2Bot.printToConsole(msg);

		// Qolbot: raise it instead of idling for ever (the old "idle" stood still and the whole team waited): runQuests catches it, says why and tries again
		// or goes on to the next quest
		throw new Error(msg);
	},

	getUnitHelper: function (type, id)
	{
		// init
		var find;

		// loop
		var i;
		for (i = 0; i < (type === 1 ? 30 : 10); i += 1) // an NPC (Tyrael after Duriel) can take a few seconds to appear
		{
			// find
			find = getUnit(type, id);
			if (find) break;
			delay(500);
		}

		// if never found...
		//if (!find) this.error('Unable to find unit (' + type + ', ' + id + ').');

		// return
		return find;
	},

	// Qolbot: a pack with no room for a body armor sends the bot to town: junk is sold, keepers go to the stash, unidentified items are
	// identified. At most one trip every three minutes, so a pack that stays full (nothing sellable) does not mean endless trips.
	tidyUp: function ()
	{
		if (Date.now() - (this.lastTidy || 0) < 180000)
			return false;

		if (Storage.Inventory.CanFit({sizex: 2, sizey: 3}))
			return false;

		this.lastTidy = Date.now();

		// Qolbot (the user, 2026-11-15: "make it so trips to town for reason of full inventory happens when bots have maxed out their cube also"): the cube first, as in
		// Pickit's path (live 2026-11-16 10:33:39: Barabas's trip came from here and never tried it, while Meir's pickup path did). UNTESTED in a game.
		if (typeof Item === "object" && Item.cubeForRoom && Item.cubeForRoom({sizex: 2, sizey: 3, gid: -1}))
		{
			print('Inventory is full: the cube took what a town trip would clear, no trip yet.');

			return true;
		}

		print('Inventory is full, going to town to clear it.');

		try {
			if (me.inTown)
				Town.doChores();
			else
				Town.visitTown();
		} catch (e) {
			print('tidyUp: ' + e);
		}

		return true;
	},

	clearAndCapture: function (zone_id, is_block_town = false, is_pass_through = false)
	{
		// report
		print('Attempting to clear and capture.');

		// full pack: town first
		this.tidyUp();

		// prepare for fight
		Precast.doPrecast(true);

		// go to zone
		Pather.journeyTo(zone_id); // zone ids are found in sdk/areas.txt

		// capture waypoint. Qolbot (the user, 2026-11-16: "sometimes the bots do a full clear when they don't have to"): not when this character HAS the waypoint. Pather.getWP always
		// walks to it and clicks it, known or not: after the Hell's Forge smash that was the whole River of Flame back to its waypoint, 2.5 minutes (13:16:35 -> 13:19:08) with the
		// team trailing ("fell behind: waiting for them to catch up"), before the town call. UNTESTED in a game.
		var wpIndex = Pather.wpAreas.indexOf(zone_id);
		var is_waypoint = wpIndex > -1 && getWaypoint(wpIndex) ? true : Pather.getWP(zone_id);
		this.wpTried[zone_id] = true;

		// Qolbot: with "clear every monster in every zone" unchecked (Settings tab, Quests) the level is never cleared: the bot travels, takes the
		// waypoint and fights only what is in its way and the quest's own targets (the quest scripts kill those). is_pass_through is no longer needed.
		if (Config.QuestClearAll !== false)
		{
			// clear zone
			Attack.clearLevel();
		}

		// the fight may have filled the pack
		this.tidyUp();

		// Qolbot: no "take a break" in town here any more (it was Town.doChores() after every waypoint): the leader went back to town 3 s after leading
		// the team into Travincal (live 2026-11-15 17:33:21-24) and split the party. A trip to town happens when something is due (the town chicken
		// checks, tidyUp's full pack) or when a quest step needs town; the user agreed, 2026-11-15. UNTESTED in a game.

		// return
		return true;
	},

	townAndTalk: function (name, travel_code = null)
	{
		// report
		print('Attempting to town and talk.');

		// go to town
		Town.goToTown();
		delay(1000);

		// switch name...
		switch (name) {
			case 'warriv':
				break;
			case 'akara':
				break;
			case 'kashya':
				Pather.moveTo(4492, 4632);
				break;
			case 'charsi':
				Pather.moveTo(3959, 5224);
				break;
			case 'jerhyn':
				Pather.moveTo(5087, 5148);
				break;
			case 'kaelan':
				Pather.moveTo(5087, 5148);
				break;
			case 'atma':
				Pather.moveTo(5137, 5054);
				break;
			case 'drognan':
				Pather.moveTo(5097, 5044);
				break;
			case 'meshif':
				Pather.moveTo(5201, 5068);
				break;
			case 'hratli':
				break;
			case 'ormus':
				break;
			case 'asheara':
				Pather.moveTo(5044, 5092);
				break;
			case 'alkor':
				Pather.moveTo(5083, 5018);
				break;
			case 'cain':
				Pather.moveTo(5021, 5033);
				break;
			case 'qual-kehk':
				Pather.moveTo(5072, 5077);
				break;
			case 'anya':
				Pather.moveTo(5104, 5119);
				break;
			case 'larzuk': // Qolbot: for Siege on Harrogath (Town knows where he stands)
				try { Town.move(NPC.Larzuk); } catch (larzukError) { print('Quester: Larzuk: ' + larzukError); }
				break;
		}

		// if npc is found...
		var npc = this.getUnitHelper(1, name);
		if (npc)
		{
			print("Talking to " + npc.name);
			// mve to npc
			Town.move(npc);

			// talk to them (5x to make sure to clear dialogues)
			npc.openMenu();
			delay(1000);
			me.cancel();
			npc.openMenu();
			delay(1000);
			me.cancel();
			npc.openMenu();
			delay(1000);
			me.cancel();

			// travel or cancel
			if (travel_code)
			{
				Misc.useMenu(travel_code); // travel codes are found in sdk/npcmenuid
				delay(500);
			}
			else
			{
				me.cancel();
			}
		}

		// return
		return true;
	},

	talkToNPC: function (name, portal_destination_id)
	{
		// report
		print('Attempting to talk to NPC (not in town).');

		// if npc is found...
		var npc = this.getUnitHelper(1, name);
		if (npc)
		{
			print("Talking to " + npc.name);
			// move to npc
			Pather.moveToUnit(npc);

			// talk to them
			npc.interact();
			delay(1000);
			me.cancel();
			npc.interact();
			delay(1000);
			me.cancel();
			npc.interact();
			delay(1000);
			me.cancel();

			// take portal
			if (portal_destination_id)
			{
				Pather.usePortal(portal_destination_id); // this never works?
			}
		}
		else this.error('Unable to find NPC.');

		// return
		return true;
	},

	pickAndPlunder: function (object_id = null, item_id = null, is_consume_item = false, is_optional = false)
	{
		// report
		print('Attempting to pick and plunder.');

		// Qolbot: the party may still go to town while I walk to the chest and fight on the way (the lines below fetch the chest again after a town trip).
		// Only the opening itself is marked busy, below. It used to be marked here for 60 s: the leader ignored the team's heal call and fought on alone
		// through the Claw Viper Temple (the user, 2026-11-15 14:26: "barabas stayed in field").

		// if chest...
		if (object_id)
		{
			// move to chest. Qolbot: a walk that gives up short of it (Darius, Flayer Dungeon level 3, 2026-11-14: three failed moves 140 units away, then
			// "Unable to find chest": the unit only exists near the bot) is not the end: clear what is in the way and walk again, up to four times,
			// before the whole quest attempt (a town trip and a new portal, a minute each) is thrown away.
			var chest = null;
			for (var reach = 0; reach < 4 && !chest; reach += 1)
			{
				try { Pather.moveToPreset(me.area, 2, object_id); } catch (reachError) { print("Quester: walk to the chest: " + reachError); }

				chest = this.getUnitHelper(2, object_id); // object id from objects file

				if (!chest && reach < 3 && !me.inTown)
				{
					print("Quester: chest " + object_id + " is not in reach (try " + (reach + 1) + " of 4, I am at " + me.x + "," + me.y + "): clearing the way");
					Attack.clear(30);
				}
			}

			// open chest
			if (chest)
			{
				// Qolbot: monsters standing around keep the chest from opening; clear them, then try again a few times
				var openedChest = false;
				for (var chestTry = 0; chestTry < 3 && !openedChest; chestTry += 1)
				{
					if (!me.inTown) Attack.clear(25);
					// a town trip in the middle of the clearing (a heal, the party going to town together) makes the unit I hold invalid: fetch the chest again
					// (2026-11-13: "chest undefined at undefined,undefined" after the leader had been to town and back)
					chest = this.getUnitHelper(2, object_id) || chest;

					// the fight may have taken me away from it (a unit is only visible near the bot: Darius, Ruined Temple, 2026-11-14 10:31, killed Sarina and then
					// "Unable to open chest" without a single click): walk back to the spot and look again before giving up
					if (!chest || chest.x === undefined)
					{
						try { Pather.moveToPreset(me.area, 2, object_id); } catch (backError) { print("Quester: walk back to the chest: " + backError); }

						chest = this.getUnitHelper(2, object_id);
					}

					if (!chest || chest.x === undefined) { // gone stale and not found again (a heal in town in the middle of the fight: "chest is undefined", Darius 09:46)
						break;
					}

					PartySync.busy(20000); // no party trip in the middle of opening it (the chest unit would go stale)
					openedChest = Misc.openChest(chest);
					// Misc.openChest always stands at one spot beside it, and that spot may be walled off: try the other sides, then click from close by
					var sides = [[-1, 2], [0, 3], [2, 0], [-2, 0], [0, -2], [2, 2], [-2, -2]];
					for (var side = 0; side < sides.length && !openedChest; side += 1)
					{
						if (chest.x === undefined) { // the unit went stale again (another town trip)
							chest = this.getUnitHelper(2, object_id);

							if (!chest) {
								break;
							}
						}

						try { Pather.moveTo(chest.x + sides[side][0], chest.y + sides[side][1], 3); } catch (sideError) { print("Quester: chest side " + sides[side] + ": " + sideError); continue; }
						print("Quester: chest " + chest.name + " at " + chest.x + "," + chest.y + " mode " + chest.mode + " selectable " + chest.selectable + ", I am " + getDistance(me, chest) + " away");
						if (getDistance(me, chest) > 6) continue;
						sendPacket(1, 0x13, 4, chest.type, 4, chest.gid);

						// up to 3 s for the drop (it was a fixed 1.2 s: the Gidbinn may come later)
						for (var waitDrop = 0; waitDrop < 15 && !chest.mode && !getUnit(4, 87); waitDrop += 1) {
							delay(200);
						}
						// the Gidbinn's altar keeps its mode: what shows that it opened is the item lying beside it
						// 2026-11-13: the altar counted as opened after the FIRST click whatever happened (Barabas clicked from 3.6 tiles away three times, no item
						// ever dropped). Now it only counts when the item is lying there; otherwise the next side is tried.
						openedChest = !!chest.mode || (chest.name === "gidbinn" && !!getUnit(4, 87));
						if (openedChest) {
							print("Quester: opened the chest from the side " + sides[side]);
						} else if (chest.name === "gidbinn") {
							// what is lying near the altar: finds out whether anything dropped at all, or whether it is not the item the quest looks for (classid 87)
							var nearNames = [], groundItem = getUnit(4);

							if (groundItem) {
								do {
									if ((groundItem.mode === 3 || groundItem.mode === 5) && getDistance(groundItem, chest) < 10) {
										nearNames.push(groundItem.name + "/" + groundItem.classid);
									}
								} while (groundItem.getNext());
							}

							print("Quester: nothing of the Gidbinn after the click (side " + sides[side] + "); on the ground near the altar: " + (nearNames.join(", ") || "nothing"));
						}
					}
				}
				if (!openedChest)
					this.error('Unable to open chest.');
				delay(500);
			}
			else this.error('Unable to find chest.');
		};

		// if looking for item...
		if (item_id)
		{
			// find item
			var item = this.getUnitHelper(4, item_id); // item id from alias file
			var result = QuestItems.pickUp(item, is_consume_item); // makes room, picks it up, uses it up when it is a consumable

			if (result === "missing")
			{
				if (is_optional) print('Quester: the item is not there (it drops only once, so it may have been taken already), going on.');
				else this.error('Unable to find item.');
			}
			else if (result === "failed")
			{
				if (is_optional) print('Quester: could not pick up the item, going on.');
				else this.error('Unable to pickup item.');
			}
		}

		// return
		return true;
	},

	keyAndKeyhole: function (object_id, item_id)
	{
		// report
		print('Attempting to key and keyhole.');

		// move to keyhole
		Pather.moveToPreset(me.area, 2, object_id);

		// prepare keyhole
		var keyhole = this.getUnitHelper(2, object_id);
		if (keyhole)
		{
			// open keyhole
			if (!Misc.openChest(keyhole))
				this.error('Unable to open keyhole.');
			delay(5000);

			// prepare key
			var key = me.getItem(item_id);
			if (key)
			{
				key.toCursor();
				submitItem();
				delay(5000);
			}
			else this.error('Unable to find key.');
		}
		else this.error('Unable to find keyhole.');

		// return
		return true;
	},

	cubeAndCreate: function (trans_item_id, item_id1 = null, item_id2 = null, item_id3 = null, item_id4 = null)
	{
		// report
		print('Attempting to cube and create.');

		// open stash
		if (!Town.openStash())
			this.error('Failed to open stash.');

		// open cube
		if (!Cubing.openCube())
			this.error('Failed to open cube.');

		// empty cube
		if (!Cubing.emptyCube())
			this.error('Failed to empty cube.');

		// add items to cube
		var item;
		if (item_id1)
		{
			item = me.getItem(item_id1);
			Storage.Cube.MoveTo(item);
		}
		if (item_id2)
		{
			item = me.getItem(item_id2);
			Storage.Cube.MoveTo(item);
		}
		if (item_id3)
		{
			item = me.getItem(item_id3);
			Storage.Cube.MoveTo(item);
		}
		if (item_id4)
		{
			item = me.getItem(item_id4);
			Storage.Cube.MoveTo(item);
		}

		// transmute
		transmute();
		delay(5000);

		// move to inventory
		var trans_item = me.getItem(trans_item_id);
		if (trans_item)
		{
			// the Activity list shows this line as a "Cube" card (cmd/qolbot/activity.go reCubed)
			print('Cube: ' + String(trans_item.name).replace(/\xFFc./g, '').trim());

			Storage.Inventory.MoveTo(trans_item);
			delay(5000);
			me.cancel();
		}
		else this.error('Something went wrong.');

		// return
		return true;
	},

	equipAndAttack: function (object_id, item_id)
	{
		PartySync.busy(60000); // no party trip in the middle of swapping weapons and hitting the object
		// log original weapon
		var original;
		var item = me.getItem();
		if (item) {
			do {
				if (item.bodylocation === 4) {
					original = item;
					break;
				}
			} while (item.getNext());
		}

		// check the new item...
		var item = me.getItem(item_id);
		if (item.mode === 1 && item.bodylocation === 4)
		{
			this.error('Weapon to equip is already equipped.');
		}
		else
		{
		}

		// equip the new item
		item.toCursor(); // click new item
		delay(500);
		clickItem(0, 4); // move to weapon slot
		delay(500);
		var cursorItem = getUnit(100);
		if (Storage.Inventory.CanFit(cursorItem))
			Storage.Inventory.MoveTo(cursorItem);

		// attack the object
		var object = this.getUnitHelper(2, object_id);
		Pather.moveToPreset(me.area, 2, object_id);
		object = this.getUnitHelper(2, object_id) || object; // fetch it again after the walk (an area change would have made it stale)
		Skill.cast(0, Skill.getHand(0), object);
		delay(500);
		Skill.cast(0, Skill.getHand(0), object);
		delay(500);
		Skill.cast(0, Skill.getHand(0), object);
		delay(500);
		Skill.cast(0, Skill.getHand(0), object);
		delay(500);
		Skill.cast(0, Skill.getHand(0), object);

		// reequip the old item
		var item = me.getItem(original.classid);
		item.toCursor(); // click new item
		delay(500);
		clickItem(0, 4); // move to weapon slot
		delay(500);
		var cursorItem = getUnit(100);
		if (Storage.Inventory.CanFit(cursorItem))
			Storage.Inventory.MoveTo(cursorItem); // move old item to inventory
	},

	/////////////////////////////////////////////////
	/////////////////////////////////////////////////
	/////////////////////////////////////////////////

	skipSaid: {}, // quest id -> the reason it was skipped is already in the log this game

	// The sixteen quest bits of one quest as the game holds them right now, for the log ("quest 9 bits (0-15): 1000010000000001"). Bit 0 is what
	// getQuestProgress calls complete. The character file can disagree with it (Qolbot checks the file and says so on the Activity tab).
	logBits: function (id) {
		var bits = "", i;

		try {
			for (i = 0; i < 16; i += 1) {
				bits += me.getQuest(id, i) ? "1" : "0";
			}

			this.log("quest " + id + " bits (0-15): " + bits);
		} catch (e) {
			this.log("quest " + id + " bits: " + e);
		}
	},

	// Quest state for the log: what the game says about "Sisters to the Slaughter" (6) and the Act 2 travel flag (7), before and
	// after asking the server for a fresh copy (packet 0x40). Added to find out why a bot was not credited for a boss kill.
	logState: function (force) {
		var every = me.area === 37 ? 3000 : 300000, read, before, after, extra = "", a, p;

		if (!force && !Throttle.due("questreport", every)) {
			return;
		}

		try {
			read = function () { return "q6=" + me.getQuest(6, 0) + "/" + me.getQuest(6, 1) + "/" + me.getQuest(6, 2) + " q7=" + me.getQuest(7, 0) + "/" + me.getQuest(7, 1); };

			if (me.area === 37) { // Andariel's lair: log what is going on around the kill (distance, her state, mine)
				a = getUnit(1, 156);
				extra = a ? " andariel mode " + a.mode + " hp " + a.hp + " dist " + Math.round(getDistance(me, a)) : " andariel not in view";
				p = Config.Leader ? getUnit(0, Config.Leader) : null;
				extra += p ? " leader dist " + Math.round(getDistance(me, p)) : " leader not in view";
				extra += " myhp " + me.hp + " mymode " + me.mode;
			}

			before = read();

			if (me.area !== 37 || Throttle.due("questrefresh", 15000)) {
				sendPacket(1, 0x40);
				delay(400);
				after = read();
			} else {
				after = before;
			}

			print("Quester: quest state: area " + me.area + " diff " + me.diff + " " + before + (after !== before ? " -> after refresh " + after : "") + extra);
		} catch (e) {
			print("Quester: quest state: " + e);
		}
	},

	// Waypoints taken or tried this game: area -> true. Every area the leader walks into gets its waypoint taken, whether or not the quest clears the
	// area (a waypoint saves every later walk of the party, and the followers can only follow by waypoint to the ones they have). A waypoint more
	// than 80 steps from where the leader arrives is left alone.
	wpTried: {},

	captureWaypoint: function (area, anyDistance)
	{
		var i, wpIDs = [119, 145, 156, 157, 237, 238, 288, 323, 324, 398, 402, 429, 494, 496, 511, 539], preset;

		if (me.inTown || this.wpTried[area] || Config.Leader || Pather.wpAreas.indexOf(area) < 0 || this.hasWaypoint(area)) return false;
		this.wpTried[area] = true;

		for (i = 0; i < wpIDs.length; i += 1)
		{
			preset = getPresetUnit(area, 2, wpIDs[i]);
			if (preset && (anyDistance || getDistance(me.x, me.y, preset.roomx * 5 + preset.x, preset.roomy * 5 + preset.y) <= 80))
			{
				try
				{
					print("Quester: taking the waypoint in " + Pather.getAreaName(area));

					if (!Pather.getWP(area)) return false;

					// the team takes it too (the user, 2026-11-15: "make sure bots pickup the waypoint"): the followers take a waypoint within 25 units of
					// them (Follower.gatherWaypoint) and write their lists; stay beside it until the ones who lack it have it, at most 30 s. UNTESTED in a game.
					if (typeof Waypoints === "object" && Waypoints.receivers(area).length)
					{
						print("Quester: waiting at the waypoint in " + Pather.getAreaName(area) + " for " + Waypoints.receivers(area).join(", ") + " to take it too");
						Waypoints.waitForTeam(area, 30000);
					}

					return true;
				}
				catch (e)
				{
					print("Quester: waypoint in " + Pather.getAreaName(area) + ": " + e);
				}
			}
		}

		return false;
	},

	// Is the way to `act` open? The game only tells the client about a quest that changed (the act boss just died) when asked, so ask first;
	// with `wait` the answer is polled for that many ms (the server needs a moment after the kill).
	actOpen: function (act, wait)
	{
		var start = getTickCount();

		if (act === 1) return true;

		do
		{
			sendPacket(1, 0x40);
			delay(500);

			if (Pather.accessToAct(act)) return true;
		}
		while (wait && getTickCount() - start < wait);

		return false;
	},

	// Has this character taken the waypoint of the area already? (the game knows: getWaypoint is indexed like Pather.wpAreas)
	hasWaypoint: function (area)
	{
		// an area without a waypoint is not in the list: getWaypoint(-1) reads outside the game's table and crashes the game ("Diablo II Error")
		return Pather.wpAreas.indexOf(area) > -1 && Waypoints.has(area);
	},

	// The act a (non-town) area belongs to
	actOf: function (area)
	{
		return area < 40 ? 1 : area < 75 ? 2 : area < 103 ? 3 : area < 109 ? 4 : 5;
	},

	// Leave the current act for `next`, through its NPC (ActTravel.go). Waypoints are not swept before leaving: they are shared when a game starts and again on
	// arriving in each new act (Waypoints.sync), and taken on the way as the leader walks into areas (captureWaypoint).
	leaveAct: function (next)
	{
		var arrived = ActTravel.go(next);

		if (arrived)
		{
			this.arrivedInAct(next);
		}

		return arrived;
	},

	// Wait in the new act's town until every teammate that is in the game is in that town too (a teammate that left the game is not waited for), at
	// most ms (a bot that cannot get through must not hold the team for ever). UNTESTED in a game.
	waitForTeamInTown: function (act, ms)
	{
		var town = {1: 1, 2: 40, 3: 75, 4: 103, 5: 109}[act], end = Date.now() + (ms || Team.limits.act), missing, said = 0;

		if (!town || typeof Team !== "object" || !Team.isLeader()) return; // bot-led runs only: with a real player leading, nothing here applies

		while (Date.now() < end && me.inTown && me.act === act)
		{
			missing = Team.roster().filter(function (r) { return r.inGame && r.area !== town; }).map(function (r) { return r.name; });

			if (!missing.length) return;

			if (Date.now() - said > 30000)
			{
				said = Date.now();
				print("Quester: waiting in the town of act " + act + " for " + missing.join(", ") + " to come through.");
			}

			delay(2000);
		}
	},

	// In the town of a new act: take the town's waypoint, then share what the team has of this act (Waypoints.sync, once for every act, like at the game's start)
	arrivedInAct: function (act)
	{
		if (me.act !== act || !me.inTown) return false;

		// Qolbot (the user, 2026-11-14): the team idles in the new act's town until everybody has come through, and only then shares waypoints and goes on
		this.waitForTeamInTown(act, Team.limits.act);

		try
		{
			Waypoints.touchTown();
			Waypoints.sync();
		}
		catch (syncError)
		{
			print("Quester: waypoint sync in act " + act + ": " + syncError);
		}

		return true;
	},

	runQuests: function (is_town_only = false, is_status_only = false)
	{
		var i, j;

		if (!is_town_only && !is_status_only && Config.QuestWaypoints)
		{
			Pather.onArrive = function (area) { Quester.captureWaypoint(area); };
		}

		// do quests...
		for (i = 0; i < this.quests.length; i += 1)
		{
			// init
			var pass = true;
			var progress = 0;

			var quest_act = this.quests[i][0];
			var quest_num = this.quests[i][1];
			var quest_title = this.quests[i][2];
			var quest_id = this.quests[i][3];
			var quest_script = this.quests[i][4];

			// a reward the game put into the pack by itself since the last quest is used before the next one starts
			QuestItems.useAll();

			// Qolbot: A TEAMMATE WITHOUT ACT 4 (the user, 2026-11-15: "either way the team has to do mephisto again to go thru the red portal"; "i don't think the leader
			// has to wait. the followers can report it as such in the internal chat"). Live 20:41: Barabas started the game in Act 4, Darius had never been through the
			// red portal and could not follow, and the leader waited in town for him for good. Before an Act 4 or 5 quest: a mate that said "noact 4" (Team.noActMates)
			// means the whole team goes back, kills Mephisto and crosses the red portal together (act3_guardian: the leader goes last). Once per game. UNTESTED in a game.
			if (quest_act >= 4 && !is_town_only && !is_status_only && !this.act4TeamTried && this.actOpen(4) && typeof Team === "object" && Team.isLeader() && Team.expected().length)
			{
				var noAct4 = Team.noActMates();

				if (noAct4.length)
				{
					this.act4TeamTried = true;
					print("Quester: " + noAct4.join(", ") + " cannot get into Act 4: the team goes back for Mephisto and crosses the red portal together.");

					try { this.act3_guardian(50, false); } catch (teamAct4Error) { print("Quester: the team's way to Act 4: " + teamAct4Error); }
				}
			}

			// check access to this act
			if (!this.actOpen(quest_act))
			{
				// Qolbot (UNTESTED in a game): Act 4 opens for a character only when it steps through the red portal in Mephisto's lair. A leader that has
				// The Guardian by credit but never went through (Barabas, Xena, Sankt, 2026-11-14) kills Mephisto again, once per game, and goes through.
				if (quest_act === 4 && !is_town_only && !is_status_only && !this.act4Tried)
				{
					this.act4Tried = true;
					print("Quester: Act 4 is not open for me: Mephisto again, for the red portal.");

					try { this.act3_guardian(50, false); } catch (act4Error) { print("Quester: the way to Act 4: " + act4Error); }
				}

				// Qolbot (UNTESTED in a game): Act 5 opens when the character takes Tyrael's red portal in the Pandemonium Fortress after Diablo (Barabas,
				// 13:42 on 2026-11-14: Terror's End complete, then "act 5 is not open" for every Act 5 quest). With Terror's End done: Act 4 town, Tyrael, through.
				if (quest_act === 5 && !is_town_only && !is_status_only && !this.act5Tried && me.getQuest(26, 0))
				{
					this.act5Tried = true;
					print("Quester: Act 5 is not open for me: to Tyrael, for the portal to Harrogath.");

					try { Town.goToTown(4); this.leaveAct(5); } catch (act5Error) { print("Quester: the way to Act 5: " + act5Error); }
				}

				if (!this.actOpen(quest_act))
				{
					pass = false;
					if (!this.skipSaid[quest_id]) { this.skipSaid[quest_id] = true; print("Quester: quest skipped: " + quest_title + " (act " + quest_act + " is not open)"); }
				}
			}

			// if town chores only and not in right town, skip
			// REFERENCE: var towns = [1, 40, 75, 103, 109];
			var town_area = 0;
			if (quest_act == 1) town_area = 1;
			else if (quest_act == 2) town_area = 40;
			else if (quest_act == 3) town_area = 75;
			else if (quest_act == 4) town_area = 103;
			else if (quest_act == 5) town_area = 109;
			if (is_town_only && me.area != town_area) pass = false;

			if (pass)
			{
				var progress = this.getQuestProgress(quest_id);

				if (is_status_only)
				{
					if (progress >= 100)
						this.note('Act ' + quest_act + ' - #' + quest_num + ' - "' + quest_title + '" is complete.');
				}

				// if quest already complete, skip
				if (progress >= 100)
				{
					pass = false;
					if (!this.skipSaid[quest_id]) { this.skipSaid[quest_id] = true; print("Quester: quest skipped: " + quest_title + " (already complete)"); }
				}

				// A follower's town visit (Follower.js, Quester.townStartedOnly): only a quest that has STARTED for this character (the game has set some of its
				// state bits, say through the leader) and is not complete, and only once for each state it is in: no talking to NPCs for nothing
				if (pass && is_town_only && this.townStartedOnly)
				{
					if (progress <= 0 || this.townQuestSeen[quest_id] === progress)
					{
						pass = false;
					}
					else
					{
						this.townQuestSeen[quest_id] = progress;
					}
				}

				// The last step of three quests is a reward only the player can choose (an item): Charsi's imbue, Larzuk's socket, Anya's
				// personalize (the "manual" rows of the quest table). The quest is done and only that reward is left, and its "complete" bit stays
				// clear until it is claimed, so without this the bot would redo the whole quest on every run. Skip while the reward is waiting;
				// the log already says once that it is (see questNpcs). Claim it yourself whenever you like, or never.
				if (this.quests[i][5] && this.questPending(quest_id))
				{
					pass = false;
					if (!this.skipSaid[quest_id]) { this.skipSaid[quest_id] = true; print("Quester: quest skipped: " + quest_title + " (only the reward is left, and you choose that)"); }
				}
			}

			// if we intend to do the quest...
			if (pass && !is_status_only)
			{
				// report to console
				print(quest_script);

				// Qolbot: the Quest Progress button's caption shows what a bot is working on (botlog.go: questLine)
				print('Quester: working on "' + quest_title + '"');
				QuestStates.snapshot('working on "' + quest_title + '"', "", true);

				// report
				//say('Attempting "' + quest_title + '"...');

				// progress detect doesn't work, for now, so just lie
				// the bot will end up talking to everybody in town
				progress = 50;

				// A table row without a function of its own (Tainted Sun, Summoner: their work happens inside other quests, see docs/QUESTER.md) has
				// nothing to run here.
				if (typeof this[quest_script] !== "function")
				{
					if (!this.skipSaid[quest_id]) { this.skipSaid[quest_id] = true; print("Quester: " + quest_title + " has no script of its own (done inside another quest)"); }
					continue;
				}

				// Qolbot (the user, 2026-11-14: "she defeated izual already, prob just needs to talk to tyrael"): the game says only the hand-in is left (bit 1 set,
				// bit 0 not yet: Izual is dead, Tyrael is waiting): go to the act's town and run only the script's town part (the talk), not the whole quest again
				// (Xena went back out to the Plains of Despair after a restart, 12:42). Still not complete after it: the full run below, as before.
				if (!is_town_only && this.questPending(quest_id))
				{
					print("Quester: " + quest_title + ": only the hand-in is left, going to town for it");

					try {
						if (me.act !== quest_act) Town.goToTown(quest_act);
						if (!me.inTown) Town.goToTown();
						this[quest_script](progress, true);
					} catch (handInError) {
						print("Quester: " + quest_title + ", the hand-in: " + handInError);
					}

					if (this.getQuestProgress(quest_id) >= 100)
					{
						print("Quester: " + quest_title + " is complete (the hand-in)");
						// the same report and save as a full run below: the Activity entry ("... is complete.") and the save the website reads (live 2026-11-14 12:50:
						// Fallen Angel was handed in, but neither showed it until the 2-minute save)
						this.logBits(quest_id);
						this.note('Act ' + quest_act + ' - #' + quest_num + ' - "' + quest_title + '" is complete.');
						Saver.now(false);
						continue;
					}

					print("Quester: " + quest_title + ": the hand-in did not complete it, doing the whole quest");
				}

				// attempt to do it 3 times... and say why each attempt failed (it used to be swallowed)
				// Qolbot (the user, 2026-11-16, Hell's Forge: the smash changed nothing, the script returned true, and the team went on to Terror's End: "retry, then move
				// on"): a script that returns true but left the quest exactly as it was (the game's quest bits unchanged) has done nothing: it is tried again, up to 3
				// times in all, and then the next quest follows (this quest comes round again on the next pass). A town-only run is not repeated. UNTESTED in a game.
				var bitsBefore = this.questBitsOf ? this.questBitsOf(quest_id) : null;

				for (j = 0; j < 3; j += 1) {
					try {
						if (this[quest_script](progress, is_town_only)) {
							if (is_town_only || bitsBefore === null) {
								break;
							}

							delay(1500); // the game's quest state arrives a moment after the work

							if (this.getQuestProgress(quest_id) >= 100 || this.questBitsOf(quest_id) !== bitsBefore) {
								break;
							}

							print("Quester: " + quest_title + ": the quest is unchanged in the game after attempt " + (j + 1) + " of 3" + (j < 2 ? ": trying again" : ": moving on, it comes round again on the next pass"));
							continue;
						}
					} catch (e) {
						print("Quester: " + quest_title + ", attempt " + (j + 1) + " of 3 failed: " + e);
						Report.problem("Quester", quest_title + ": " + e);
					}

					if (this.getQuestProgress(quest_id) >= 100) {
						break; // the quest is done in the game: a late error after the work is no reason to do it all again
					}
				}

				print('Quester: done with "' + quest_title + '"');
				QuestStates.snapshot('done with "' + quest_title + '"', "", true);

				// if completed, report
				if (this.getQuestProgress(quest_id) >= 100)
				{
					this.logBits(quest_id);
					this.note('Act ' + quest_act + ' - #' + quest_num + ' - "' + quest_title + '" is complete.');

					// save now: a finished quest must not be lost when the game ends without a save (a chicken quit, the crash as scripts end)
					Saver.now(false);
				}
			}
		}

		// idle
		//this.idle();

		// die
		//D2Bot.stop();
	},

	grindLevels: function ()
	{
		// report
		print('Leveling in Act ' + Config.Leveling + ".");

		// get ready...
		Town.heal();
		Town.doChores();

		// determine zones to clear
		switch (Config.Leveling) {
			case 1:
				var zones = [3,4,10,5,6,7];
				break;
			case 2:
				var zones = [41,42,43,44];
				break;
			case 3:
				var zones = [76,77,78,79,80,81];
				break;
			case 4:
				var zones = [104];
				break;
			case 5:
				var zones = [110,111,112];
				break;
		}

		// foreach each zone...
		for (i = 0; i < zones.length; i += 1) {
			// travel to
			Pather.journeyTo(zones[i]);

			// clear level
			Attack.clearLevel();

			// get waypoint
			Pather.getWP(zones[i]);
		}
	}
};

// the rest of the Quester lives in two files that add to it: the quest NPC visits and the quests themselves
include("common/QuestNpcs.js");
include("common/QuestScripts.js");

Report.mixin(Quester, "Quester"); // Quester.log / note / problem, written under its own name
