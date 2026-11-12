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
include("common/QuickTravel.js");
include("common/QuestTable.js");
include("common/Saver.js");
include("common/Throttle.js");
include("common/QuestItems.js"); // the quest consumables: making room for them, using them up, logging it

var Quester = {

	// [act, number in the act, title, quest id, script, the player chooses the reward]: libs/common/QuestTable.json, the table Qolbot reads too
	quests: QuestTable.playable(),

	getQuestProgress: function (quest_id)
	{
		sendPacket(1, 0x40);
		delay(500);

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
		say('Idle.');
		while (1)
			delay(1000);
	},

	error: function (msg)
	{
		// print
		D2Bot.printToConsole(msg);

		// die
		//D2Bot.stop();

		// idle
		this.idle();
	},

	getUnitHelper: function (type, id)
	{
		// init
		var find;

		// loop
		var i;
		for (i = 0; i < 10; i += 1)
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

		// capture waypoint
		var is_waypoint = Pather.getWP(zone_id);

		// Qolbot: with "clear every monster in every zone" unchecked (Settings tab, Quests) the level is never cleared: the bot travels, takes the
		// waypoint and fights only what is in its way and the quest's own targets (the quest scripts kill those). is_pass_through is no longer needed.
		if (Config.QuestClearAll !== false)
		{
			// clear zone
			Attack.clearLevel();
		}

		// the fight may have filled the pack
		this.tidyUp();

		// take a break
		if (is_waypoint && !is_block_town)
			Town.doChores();

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

		// if chest...
		if (object_id)
		{
			// move to chest
			Pather.moveToPreset(me.area, 2, object_id);

			// open chest
			var chest = this.getUnitHelper(2, object_id); // object id from objects file
			if (chest)
			{
				if (!Misc.openChest(chest))
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

	runQuests: function (is_town_only = false, is_status_only = false)
	{
		var i, j;

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

			// check access to this act
			if (!Pather.accessToAct(quest_act))
			{
				pass = false;
				if (!this.skipSaid[quest_id]) { this.skipSaid[quest_id] = true; print("Quester: quest skipped: " + quest_title + " (act " + quest_act + " is not open)"); }
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

				// report
				//say('Attempting "' + quest_title + '"...');

				// progress detect doesn't work, for now, so just lie
				// the bot will end up talking to everybody in town
				progress = 50;

				// attempt to do it 3 times...
				for (j = 0; j < 3; j += 1) {
					try {
						if (this[quest_script](progress, is_town_only)) {
							break;
						}
					} catch (e) {

					}
				}

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
