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

var Quester = {

	quests: [
		// act, quest_num, title, quest_id, script
		[1, 1, "Den of Evil", 1, "act1_den_of_evil"],
		[1, 2, "Sister's Burial Grounds", 2, "act1_sisters_burial_grounds"],
		[1, 3, "Search for Cain", 4, "act1_search_for_cain"],
		[1, 4, "Forgotten Tower", 5, "act1_forgotten_tower"],
		[1, 5, "Tools of the Trade", 3, "act1_tools_of_the_trade"],
		[1, 6, "Sisters to the Slaughter", 6, "act1_sisters_to_the_slaughter"],

		[2, 1, "Radament's Lair", 9, "act2_radaments_lair"],
		[2, 2, "Horadric Staff", 10, "act2_horadric_staff"],
		[2, 3, "Tainted Sun", 11, "act2_tainted_sun"],
		[2, 4, "Arcane Sanctuary", 12, "act2_arcane_sanctuary"],
		[2, 5, "Summoner", 13, "act2_summoner"],
		[2, 6, "Seven Tombs", 14, "act2_seven_tombs"],

		//[3, 1, "Golden Bird", 20, "act3_golden_bird"],
		[3, 2, "Blade of the Old Religion", 19, "act3_blade_of_the_old_religion"],
		[3, 3, "Khalim's Will", 18, "act3_khalims_will"],
		[3, 4, "Lam Essen's Tome", 17, "act3_lam_esens_tome"],
		//[3, 5, "Blackened Temple", 21, "act3_blackened_temple"],
		[3, 6, "The Guardian", 22, "act3_guardian"],

		[4, 1, "Fallen Angel", 25, "act4_fallen_angel"],
		[4, 2, "Hell's Forge", 27, "act4_hells_forge"],
		[4, 3, "Terrors End", 26, "act4_terrors_end"],

		[5, 1, "Seige on Harrogath", 35, "act5_seige_on_haggorath"],
		[5, 2, "Rescue On Mount Arreat", 36, "act5_rescue_on_mount_arreat"],
		[5, 3, "Prison of Ice", 37, "act5_prison_of_ice"],
		[5, 4, "Betrayal of Haggorath", 38, "act5_betrayal_of_haggorath"],
		[5, 5, "Rite of Passage", 39, "act5_rite_of_passage"],
		[5, 6, "Eve of Destruction", 40, "act5_eve_of_destruction"],
	],

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

	pickAndPlunder: function (object_id = null, item_id = null, is_consume_item = false)
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
			if (item)
			{
				// pickup item
				if (!Pickit.pickItem(item))
					this.error('Unable to pickup item.');
				delay(500);

				if (is_consume_item)
				{
					//clickItem(1, item);
				}
			}
			else this.error('Unable to find item.');
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

	act1_den_of_evil: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(1);

			// clear blood moor
			this.clearAndCapture(2);

			// run corpsefire script
			include('bots/Corpsefire.js');
			Config.Corpsefire.ClearDen = true;
			Corpsefire.call();

			// update progress
			progress = 100;
		}

		// return to town
		if (progress >= 50) this.townAndTalk('akara');

		// return
		return true;
	},

	act1_sisters_burial_grounds: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at blood moor
			Town.goToTown(1);

			// clear cold plains
			this.clearAndCapture(3);

			// run mausoleum script
			include('bots/Mausoleum.js');
			Config.Mausoleum.KillBloodRaven = true;
			Config.Mausoleum.ClearCrypt = true;
		 	Mausoleum.call();

		 	// update progress
		 	progress = 100;
		 }

		// return to town
		if (progress >= 50) this.townAndTalk('kashya');

		// return
		return true;
	},

	act1_search_for_cain: function (progress, is_town_only)
	{
		// if we have scroll of inifus...
	 	if (!me.getItem(524))
		{
			this.townAndTalk('akara');
		}

		if (!is_town_only)
		{
			// start at cold plains
			Town.goToTown(1);

			// clear stony field
			this.clearAndCapture(4);

			// clear underground passage
			this.clearAndCapture(10);

			// clear dark wood
			this.clearAndCapture(5);

			// run tristram script
			include('bots/Tristram.js'); // will perform all steps in quest line
			Tristram.call();

			// update progress
			progress = 100;
		}

		// turn in...
		if (progress >= 50)
		{
			this.townAndTalk('cain');
			this.townAndTalk('akara');
		}

		// return
		return true;
	},

	act1_forgotten_tower: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at dark wood
			Town.goToTown(1);

			// clear black marsh
			this.clearAndCapture(6);

			// run countess script
			include('bots/Countess.js');
			Config.Countess.KillGhosts = true;
			Countess.call();

			// update progress
			progress = 100;
		}

		// return to town
		if (progress >= 50) this.townAndTalk('akara');

		// return
		return true;
	},

	act1_tools_of_the_trade: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at black marsh
			Town.goToTown(1);

			// clear tamoe highlands
			this.clearAndCapture(7, false, true);

			// clear outer cloister
			this.clearAndCapture(27, false, true);

			// run smith script
			//include('bots/Smith.js');
			//Smith.call();

			// clear barracks
			this.clearAndCapture(28);

			// pickup malus
			this.pickAndPlunder(108, 89);
		}

		// if malus, talk to charsi
		if (me.getItem(89)) this.townAndTalk('charsi');

		// return
		return true;
	},

	act1_sisters_to_the_slaughter: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at outer cloister
			Town.goToTown(1);
			Pather.useWaypoint(27);

			// clear barracks
			this.clearAndCapture(28);

			// clear jail
			this.clearAndCapture(29);
			this.clearAndCapture(30);
			this.clearAndCapture(31);

			// clear inner cloister
			this.clearAndCapture(32);

			// clear cathedral
			this.clearAndCapture(33);

			// clear catacombs
			this.clearAndCapture(34);
			this.clearAndCapture(35);
			this.clearAndCapture(36);
			this.clearAndCapture(37); // andariel is here

			// run countess script
			//include('bots/Andariel.js');
			//Andariel.call();

			// update progress
			progress = 100;
		}

		if (progress >= 50)
		{
			// travel to act 2
			//this.townAndTalk('warriv', 0x0D36);
		}

		// idle if questing
		if (!is_town_only) this.idle();

		// return
		return true;
	},

	act2_radaments_lair: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(2);

			// clear sewers
			this.clearAndCapture(47);
			this.clearAndCapture(48);

			// run radament script
			include('bots/Radament.js');
			Radament.call();

			// pickup skill book
			this.pickAndPlunder(null, 552, true);

			// clear sewers 3
			this.clearAndCapture(49, false);

			// update progress
			progress = 100;
		}

		// talk to atma
		if (progress >= 50) this.townAndTalk('atma');

		// return
		return true;
	},

	act2_horadric_staff: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(2);

			// if NOT have cube...
			if (!me.getItem(549))
			{
				say('Getting the Horadric Cube.');

				// clear rocky waste
				this.clearAndCapture(41);

				// clear dry hills
				this.clearAndCapture(42);

				// clear halls of the dead
				this.clearAndCapture(56);
				this.clearAndCapture(57);
				this.clearAndCapture(60);

				// pickup horadric cube
				this.pickAndPlunder(354, 549);
			}

			// if NOT have staff...
			if (!me.getItem(91) && !me.getItem(92))
			{
				say('Getting the Staff of Kings.');

				// clear far oasis
				this.clearAndCapture(43);

				// clear maggot lair
				this.clearAndCapture(62);
				this.clearAndCapture(63);
				this.clearAndCapture(64);

				// pickup staff of kings
				this.pickAndPlunder(356, 92);
			}

			// if NOT have amulet...
			if (!me.getItem(91) && !me.getItem(521))
			{
				say('Getting the Viper Amulet.');

				// clear lost city
				this.clearAndCapture(44);

				// clear ancient tunnels
				this.clearAndCapture(65);

				// clear valley of snakes
				this.clearAndCapture(45);

				// clear claw viper temple
				this.clearAndCapture(58);
				this.clearAndCapture(61);

				// pickup amulet of the viper
				this.pickAndPlunder(149, 521);
			}

			// update progress
			progress = 100;
		}

		// talk to drognan
		if (progress >= 50) this.townAndTalk('drognan');

		// if NOT have horadric staff...
		if (me.getItem(92) && me.getItem(521) && !me.getItem(91))
		{
			say('Making the Horadric Staff.');

			// go to town
			Town.goToTown(2);

			// assemble horadric staff
			this.cubeAndCreate(91, 92, 521);
		}

		// return
		return true;
	},

	act2_arcane_sanctuary: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(2);

			// talk to jerhyn
			//this.townAndTalk('jerhyn');
			//this.townAndTalk('kaelan');

			// clear harem
			this.clearAndCapture(50);
			this.clearAndCapture(51);

			// clear palace cellar
			this.clearAndCapture(52);
			this.clearAndCapture(53);
			this.clearAndCapture(54);

			// clear arcane sanctuary
			this.clearAndCapture(74, true); // flag true to block town

			// open horazons journal
			this.pickAndPlunder(357);

			// capture waypoint in canyon of the magi
			Pather.getWP(46);

			// update progress
			progress = 100;
		}

		// talk to jerhyn
		//if (progress >= 50) this.townAndTalk('jerhyn');
		//this.townAndTalk('kaelan');

		// return
		return true;
	},

	act2_seven_tombs: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(2);

			// run tombs script
			include('bots/Tombs.js');
		 	Tombs.call();

	 		// move to canyon of magi and tal rashas tomb
		 	Pather.journeyTo(46);
		 	Pather.moveToExit(getRoom().correcttomb, true); // flag true to enter door
		 	Pather.moveToPreset(me.area, 2, 152, -11, 3) // move to staff room

			// if you have the horadric staff...
		 	if (me.getItem(91))
		 	{
				// open hole in wall
				this.keyAndKeyhole(152, 91);
				delay(5000);
			}

		 	// run duriel script
			//include('bots/Duriel.js');
		 	//Duriel.call();

		 	// clear duriels chamber
			Pather.useUnit(2, 100, 73); // use secret door
			Attack.kill(211); // kill duriel (will error if he's already dead)
			Pickit.pickItems();

		 	// talk to tyrael
		 	Pather.moveTo(22609, 15707);
		 	Pather.moveTo(22576, 15690);
		 	Pather.moveTo(22576, 15599);
		 	this.talkToNPC('tyrael', 40); // flag true to take portal

		 	// update progress
		 	progress = 100;
		}

		if (progress >= 50)
		{
		 	// travel to act 3
		 	//this.townAndTalk('jerhyn');
		 	//this.townAndTalk('meshif', 0x0D38);

		 	// talk to hratil
			//this.townAndTalk('hratli');
		}

		// idle if questing
		if (!is_town_only) this.idle();

		// return
		return true;
	},

	act3_khalims_will: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(3);

			// if NOT have khalims will or khalim's eye...
			if (!me.getItem(174) && !me.getItem(553))
			{
			 	// clear spider forest
			 	this.clearAndCapture(76);

			 	// clear spider cavern and pickup khalim's eye
			 	this.clearAndCapture(85);
			 	this.pickAndPlunder(407, 553);

			 	// clear great marsh
			 	this.clearAndCapture(77);
			}

			// if NOT have khalims will or khalim's brain...
			if (!me.getItem(174) && !me.getItem(555))
			{
			 	// clear flayer jungle
			 	this.clearAndCapture(78);

			 	// clear flayer dungeon and pickup khalim's brain
			 	this.clearAndCapture(88);
			 	this.clearAndCapture(89);
			 	this.clearAndCapture(91);
			 	this.pickAndPlunder(406, 555);
			}

			// if NOT have khalims will or khalim's heart...
			if (!me.getItem(174) && !me.getItem(554))
			{
			 	// clear lower kurast
			 	this.clearAndCapture(79);

			 	// clear kurast bazaar
			 	this.clearAndCapture(80);

			 	// clear sewers and pickup khalim's heart
			 	this.clearAndCapture(92);
			 	this.pickAndPlunder(367); // touch the lever
			 	Pather.useUnit(2, 366, 93); // use secret door
			 	this.clearAndCapture(93);
			 	this.pickAndPlunder(405, 554);
			}

			// if NOT have khalims will or khalim's flail...
			if (!me.getItem(174) && !me.getItem(173))
			{
				// clear upper kurast
			 	this.clearAndCapture(81);

			 	// clear kurast causeway
			 	this.clearAndCapture(82);

			 	// clear travincal
			 	this.clearAndCapture(83);

			 	// pickup khalims flail
			 	this.pickAndPlunder(null, 173);
			}
		}

		// if we have all the parts...
		if (me.getItem(173) && me.getItem(553) && me.getItem(554) && me.getItem(555) && !me.getItem(174))
		{
			say("Making Kalim's Will.");

			// assemble khalims will
			this.cubeAndCreate(174, 553, 554, 555, 173);
		}

		if (!is_town_only)
		{
			// if we have khalim's will...
			if (me.getItem(174))
			{
				// go to travincal
				Pather.journeyTo(83);

				// move to compelling orb
				Pather.moveTo(5788, 1810);

				// clear the area
				Attack.clear(50);

				// equip khalims will
				this.equipAndAttack(404, 174);
			}
		}

		// return
		return true;
	},

	act3_blade_of_the_old_religion: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(3);

			// if NOT have gidbinn...
			if (!me.getItem(87))
			{
				// go to flayer jungle
				Pather.journeyTo(78);

			 	// pickup gidbinn
			 	this.pickAndPlunder(252);
			 	Attack.clear(50);
			 	delay(5000);
			 	Attack.clear(50);
			 	this.pickAndPlunder(null, 87);
			}
		}

		// if you have the gidbin, talk to ormus and asheara
		if (progress >= 50 || me.getItem(252))
		{
			this.townAndTalk('ormus');
			this.townAndTalk('asheara');
		}

		// return
		return true;
	},

	act3_lam_esens_tome: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(3);

		 	// if we don't already have lam essen's tome...
		 	if (!me.getItem(548))
			{
				// run kurast temples script
				include('bots/KurastTemples.js');
			 	KurastTemples.call();

				// find ruined temple
				Pather.journeyTo(94);
				this.pickAndPlunder(193, 548);
			}
		}

		// if you have lam essens tome, talk to alkor
		if (progress >= 50 || me.getItem(548))
		{
			this.townAndTalk('alkor');
		}

		// return
		return true;
	},

	act3_guardian: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(3);

			// go to travincal
			Pather.journeyTo(83);
			Pather.moveTo(5155, 1492); // move to compelling orb
			//Attack.clear(50); // clear the area
			Pather.useUnit(2, 386, 100); // use secret door

			// clear duriance of hate
			//this.clearAndCapture(100);
			//this.clearAndCapture(101);

			// run mephisto script
			include('bots/Mephisto.js');
			//Config.Mephisto.MoatTrick = false;
			Config.Mephisto.KillCouncil = true;
			Config.Mephisto.TakeRedPortal = true;
		 	Mephisto.call();
		}

		// idle if questing
		if (!is_town_only) this.idle();

		// return
		return true;
	},

	act4_fallen_angel: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(4);

			// clear outer steppes
			this.clearAndCapture(104);

			// kill izual
			Pather.moveToPreset(105, 1, 256);
			Attack.kill(256);
			Pickit.pickItems();
			delay(5000);
			this.talkToNPC('izual');
			Town.visitTown();

			// update progress
			progress = 100;
		}

		if (progress >= 50)
		{
			Pather.moveTo(5021, 5033);
			this.talkToNPC('tyrael');
		}

		if (!is_town_only)
		{
			// clear plains of despair
			this.clearAndCapture(105);

			// clear city of the damned
			this.clearAndCapture(106);
		}

		// return
		return true;
	},

	act4_hells_forge: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(4);

			// talk to cain
			//this.townAndTalk('cain');

			// run hephasto script
			//include('bots/Hephasto.js');
			//Hephasto.call();

			// kill hephasto
			Pather.journeyTo(107);
			Pather.moveToPreset(107, 2, 376);
			Attack.clear(50);

			// pickup hellforge hammer
			//this.pickAndPlunder(null, 90); // not sure why this doesn't work?
			Pickit.pickItems(); // fallback

			// destroy metphisto's hellstone
			this.equipAndAttack(376, 90);

			// clear river of flame
			this.clearAndCapture(107);
		}

		// return
		return true;
	},

	act4_terrors_end: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(4);

			// run diablo script
			include('bots/Diablo.js');
			Config.Diablo.Entrance = true;
			Diablo.call();

			// talk to tyrael
			Town.goToTown();

			// update progress
			progress = 100;
		}

		if (progress >= 50)
		{
			Pather.moveTo(5021, 5033);
			this.talkToNPC('tyrael', 109);
		}

		// idle if questing
		if (!is_town_only) this.idle();

		// return
		return true;
	},

	act5_seige_on_haggorath: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(5);

			// clear bloody foothills
			this.clearAndCapture(110);
		}

		// return
		return true;
	},

	act5_rescue_on_mount_arreat: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(5);

			// clear frigid highlands
			this.clearAndCapture(111);

			// go back to town
			Town.goToTown();
			Pather.journeyTo(111);

			// find a free captured soldiers from prisons
			var prisons = getPresetUnits(111, 2, 473);
			while (prisons.length > 0)
			{
				var x = prisons[0].roomx * 5 + prisons[0].x;
				var y = prisons[0].roomy * 5 + prisons[0].y;

				// move to pen
				Pather.moveTo(x+5, y-5);

				// wait for merc to open prison
				delay(10000);

				// destroy everything
				Attack.clear(20);

				// move to next prison
				prisons.shift();
			}

			// clear arreat plateau
			this.clearAndCapture(112);

			// update progress
			progress = 100;
		}

		// talk to qualkhek
		if (progress >= 50) this.townAndTalk('qual-kehk');

		// return
		return true;
	},

	act5_prison_of_ice: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(5);

			// clear crystalline passage
			this.clearAndCapture(113);

			// clear frozen river
			this.clearAndCapture(114);

			// move to anya
			Pather.moveToPreset(me.area, 2, 460);
			delay(1000);

			// move to anya
			var anya = this.getUnitHelper(2, 558);
			Pather.moveToUnit(anya);
			//anya.interact();
			sendPacket(1, 0x13, 4, 0x2, 4, anya.gid);
			delay(300);
			me.cancel();

			// return to malah
			Town.goToTown();
			Town.move('malah');
			var malah = this.getUnitHelper(1, 'malah');
			malah.openMenu();
			me.cancel();

			// take portal back to anya
			Town.move('portalspot');
			Pather.usePortal(114, me.name);
			anya.interact();
			delay(300);
			me.cancel();

			// go back to town
			Town.goToTown();

			// update progress
			progress = 100;
		}

		if (progress >= 50)
		{
			Town.move('malah');
			malah.openMenu();
			me.cancel();
			delay(500);

			// consume the scroll
			//var scroll = me.getItem(646);
			//if (scroll)
				//clickItem(1, scroll);

			// talk to anya
			this.townAndTalk('anya');
		}

		// return
		return true;
	},

	act5_betrayal_of_haggorath: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(5);

			// run pindle script
			include('bots/Pindleskin.js');
			Config.Pindleskin.UseWaypoint = false;
			Config.Pindleskin.KillNihlathak = true;
			Config.Pindleskin.ViperQuit = true; // End script if Tomb Vipers are found.
			Pindleskin.call();

			// get waypoint
			Pather.getWP(123); // halls of pain

			// I'm not including any clearing of levels in this zone
			// due to the threat of Tomb Vipers.

			// run nilithak script
			include('bots/Nihlathak.js');
			Config.Nihlathak.ViperQuit = true; // End script if Tomb Vipers are found.
			Nihlathak.call();
		}

		// talk to anya
		if (progress >= 50) this.townAndTalk('anya');

		// return
		return true;
	},

	act5_rite_of_passage: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(5);

			// clear glacial trail
			this.clearAndCapture(115);

			// clear forzen tundra
			this.clearAndCapture(117);

			// clear the ancients way
			this.clearAndCapture(118);

			// clear arreat summit
			Pather.journeyTo(120);
			this.pickAndPlunder(546); // touch the ancients alter
			me.cancel();
			this.clearAndCapture(120);
			Pather.useUnit(2, 128, 547); // use secret door

			// clear worldstone keep
			this.clearAndCapture(128); // lvl 1
			this.clearAndCapture(129); // lvl 2
		}

		// return
		return true;
	},

	act5_eve_of_destruction: function (progress, is_town_only)
	{
		if (!is_town_only)
		{
			// start at town
			Town.goToTown(5);

			// clear worldstone keep
			this.clearAndCapture(130); // lvl 3

			include('bots/Baal.js');
			Config.Baal.SoulQuit = false; // End script if Souls (Undead Soul Killers) are found.
			Config.Baal.DollQuit = false; // End script if Dolls (Undead Stigyan Dolls) are found.
			Config.Baal.KillBaal = true; // Kill Baal. Leaves game after wave 5 if false.
			Baal.call();

			// back to town
			Town.goToTown(5);

			// idle if questing
			this.idle();
		}

		// return
		return true;
	},

	/////////////////////////////////////////////////
	/////////////////////////////////////////////////
	/////////////////////////////////////////////////

	// ---------------------------------------------------------------------------------------------------------------
	// Quest NPC visits. A bot talks to a town's quest NPCs only when something is waiting for it, and talks as often as
	// the NPC needs: some hand out an item on every further talk (Malah, Alkor, ...) and that item must be used before
	// the next talk. "Waiting" means the quest's "reward pending" bit (getQuest(id, 1)) is set while its "reward granted"
	// bit (getQuest(id, 0)) is not, or the bot carries an item that an NPC wants.
	// ---------------------------------------------------------------------------------------------------------------

	// [act, quest id, title, NPCs that can hand the reward out (tried in order), the player must choose an item?]
	npcQuests: [
		[1, 1, "Den of Evil", ["akara"], false],
		[1, 2, "Sisters' Burial Grounds", ["kashya"], false],
		[1, 3, "Tools of the Trade", ["charsi"], true], // imbue: you pick the item
		[1, 4, "Search for Cain", ["akara", "cain"], false],
		[1, 5, "The Forgotten Tower", ["akara"], false],
		[2, 9, "Radament's Lair", ["atma"], false],
		[2, 10, "The Horadric Staff", ["cain"], false],
		[2, 11, "The Tainted Sun", ["atma", "drognan"], false],
		[2, 12, "The Arcane Sanctuary", ["drognan"], false],
		[2, 13, "The Summoner", ["drognan", "atma"], false],
		[2, 14, "The Seven Tombs", ["jerhyn", "meshif"], false],
		[3, 17, "Lam Esen's Tome", ["alkor"], false],
		[3, 18, "Khalim's Will", ["cain", "ormus"], false],
		[3, 19, "The Blade of the Old Religion", ["ormus", "asheara"], false],
		[3, 20, "The Golden Bird", ["meshif", "alkor"], false],
		[3, 22, "The Guardian", ["hratli"], false],
		[4, 25, "The Fallen Angel", ["tyrael"], false],
		[4, 26, "Terror's End", ["tyrael"], false],
		[4, 27, "Hell's Forge", ["cain", "tyrael"], false],
		[5, 35, "Siege on Harrogath", ["larzuk"], true], // socket: you pick the item
		[5, 36, "Rescue on Mount Arreat", ["qual-kehk"], false],
		[5, 37, "Prison of Ice", ["malah", "anya"], false],
		[5, 38, "Betrayal of Harrogath", ["anya"], true], // personalize: you pick the item
		[5, 39, "Rite of Passage", ["qual-kehk"], false]
	],

	// [item class id, NPC who wants it, what it is, act, true = he gives something back only after a wait]
	npcItems: [
		[524, "akara", "Scroll of Inifuss", 1],
		[548, "alkor", "Lam Esen's Tome", 3],
		[546, "meshif", "Jade Figurine", 3],
		[547, "alkor", "The Golden Bird", 3, true] // Alkor takes a few seconds to brew the Potion of Life: come back to him
	],

	// Quest items that are used up the moment they are handed over: [class id, name]
	useItems: [[545, "Potion of Life"], [552, "Book of Skill"], [644, "Malah's Potion"], [646, "Scroll of Resistance"]],

	questTries: {}, // quest id -> how many times this game the bot went to an NPC for it (no endless loops)
	manualSaid: {}, // quest id -> already written to the log (the bots do not say it in chat: only you can pick that reward)

	// problem reports: hidden when the player switched them off (Settings tab)
	problem: function (message) {
		if (typeof AutoSpec === "object") {
			AutoSpec.problem(message);
		} else {
			say(message);
		}
	},

	// routine chatter: hidden when the player switched task reports off (Settings tab)
	note: function (message) {
		if (typeof AutoSpec === "object") {
			AutoSpec.note(message);
		} else {
			say(message);
		}
	},

	// is a reward waiting for this quest?
	questPending: function (id) {
		try {
			return !!me.getQuest(id, 1) && !me.getQuest(id, 0);
		} catch (e) {
			return false;
		}
	},

	// the first copy of an item in the inventory (not stash, not worn), or null
	invItem: function (classid) {
		var item = me.getItem(classid);

		if (item) {
			do {
				if (item.location === 3) {
					return copyUnit(item);
				}
			} while (item.getNext());
		}

		return null;
	},

	// Use every handed-over quest item that is in the inventory (right click). Returns how many were used.
	consumeQuestItems: function () {
		var i, n, item, used = 0;

		for (i = 0; i < this.useItems.length; i += 1) {
			for (n = 0; n < 4; n += 1) {
				item = this.invItem(this.useItems[i][0]);

				if (!item) {
					break;
				}

				clickItem(1, item);
				delay(900);

				if (!this.invItem(this.useItems[i][0]) || this.invItem(this.useItems[i][0]).gid !== item.gid) {
					used += 1;
					this.note("Used the " + this.useItems[i][1] + ".");
				} else {
					break; // would not use: leave it alone
				}
			}
		}

		return used;
	},

	// Who should I talk to in this town? Returns {talks: [{npc, why, quests}], manual: [titles]}. refresh = ask the server first.
	questNpcPlan: function (refresh) {
		var plan = {talks: [], manual: []}, byNpc = {}, i, j, e, npc, add;

		if (refresh) {
			sendPacket(1, 0x40);
			delay(500);
		}

		add = function (name, why, quest) {
			if (!byNpc[name]) {
				byNpc[name] = {npc: name, why: why, quests: []};
				plan.talks.push(byNpc[name]);
			}

			if (quest) {
				byNpc[name].quests.push(quest);
			}
		};

		for (i = 0; i < this.npcQuests.length; i += 1) {
			e = this.npcQuests[i];

			if (e[0] !== me.act || !this.questPending(e[1])) {
				continue;
			}

			if (e[4]) {
				plan.manual.push(e);

				continue;
			}

			if ((this.questTries[e[1]] || 0) >= 2) {
				continue;
			}

			for (j = 0; j < e[3].length; j += 1) {
				add(e[3][j], e[2], e[1]);
			}
		}

		for (i = 0; i < this.npcItems.length; i += 1) {
			e = this.npcItems[i];

			if (e[3] === me.act && this.invItem(e[0]) && (this.questTries["i" + e[0]] || 0) < 2) {
				add(e[1], e[2], "i" + e[0]);

				if (e[4]) {
					byNpc[e[1]].expect = true;
				}
			}
		}

		return plan;
	},

	// is there anything for a quest NPC to do right now? (used by the town chore check)
	questNpcPending: function (refresh) {
		var i, plan;

		if (!me.inTown) {
			return false;
		}

		for (i = 0; i < this.useItems.length; i += 1) {
			if (this.invItem(this.useItems[i][0])) {
				return true;
			}
		}

		plan = this.questNpcPlan(refresh);

		return plan.talks.length > 0;
	},

	talkToQuestNpc: function (name) {
		var npc = getUnit(1, name);

		if (!npc) {
			Town.move(name);
			npc = getUnit(1, name);
		}

		if (!npc && (name === "jerhyn" || name === "kaelan")) {
			Town.move("palace");
			npc = getUnit(1, name);
		}

		if (!npc) {
			return false;
		}

		if (getDistance(me, npc) > 5) {
			Pather.moveToUnit(npc);
		}

		print("Talking to " + npc.name);

		if (!npc.openMenu()) {
			me.cancel();

			return false;
		}

		delay(1200);
		me.cancel();
		delay(300);

		return true;
	},

	// Go through everything a town's quest NPCs have for this bot. Returns the number of conversations held.
	questNpcs: function () {
		var plan, talked = 0, i, j, t, round, used, before, after, pendingNow, heldNow, pass, passTalked, handed, rewarded, idle, heldBefore;

		if (!me.inTown) {
			return 0;
		}

		pendingNow = function (self, t) {
			var any = false, q;

			for (q = 0; q < t.quests.length; q += 1) {
				if (typeof t.quests[q] === "number" ? self.questPending(t.quests[q]) : self.invItem(parseInt(String(t.quests[q]).substr(1), 10))) {
					any = true;
				}
			}

			return any;
		};

		heldNow = function (self, t) { // an item this NPC wants is in the inventory
			var q;

			for (q = 0; q < t.quests.length; q += 1) {
				if (typeof t.quests[q] === "string" && self.invItem(parseInt(t.quests[q].substr(1), 10))) {
					return true;
				}
			}

			return false;
		};

		// a talk can hand over something that sends me to another NPC (Meshif's bird goes to Alkor): look again afterwards
		for (pass = 0; pass < 3; pass += 1) {
			this.consumeQuestItems(); // something handed over earlier and not used yet
			plan = this.questNpcPlan(true);
			passTalked = 0;

			for (i = 0; i < plan.manual.length; i += 1) {
				if (!this.manualSaid[plan.manual[i][1]]) {
					this.manualSaid[plan.manual[i][1]] = true;
					print("AutoSpec: a reward is waiting for \"" + plan.manual[i][2] + "\" (" + plan.manual[i][3][0] + "), but I cannot choose the item: talk to them yourself.");
				}
			}

			for (i = 0; i < plan.talks.length; i += 1) {
				t = plan.talks[i];

				if (!pendingNow(this, t)) { // an earlier NPC in this list already took care of it
					continue;
				}

				for (j = 0; j < t.quests.length; j += 1) {
					this.questTries[t.quests[j]] = (this.questTries[t.quests[j]] || 0) + 1;
				}

				this.note("Talking to " + t.npc + " (" + t.why + ").");

				handed = false;
				rewarded = false;
				idle = 0;

				for (round = 0; round < 8; round += 1) {
					before = pendingNow(this, t);
					heldBefore = heldNow(this, t);

					if (!this.talkToQuestNpc(t.npc)) {
						print("AutoSpec: quest NPC " + t.npc + " not found");

						break;
					}

					talked += 1;
					passTalked += 1;
					used = this.consumeQuestItems(); // handed over items are used before the next talk
					sendPacket(1, 0x40);
					delay(500);
					after = pendingNow(this, t);
					handed = handed || (heldBefore && !heldNow(this, t));
					rewarded = rewarded || used > 0;
					print("AutoSpec: quest talk " + t.npc + " round " + (round + 1) + ": pending " + before + " -> " + after + ", items used " + used + ", handed in " + handed);

					if (used > 0) {
						idle = 0;

						continue; // he gave me something: talk again, he may have more
					}

					if (!after && !(t.expect && handed && !rewarded)) {
						break; // done
					}

					// nothing came back yet: some NPCs say "come back later" and need a few seconds
					idle += 1;

					if (idle > (t.expect && handed ? 6 : 2)) {
						break;
					}

					delay(4000);
				}

				if (t.expect && handed && !rewarded) {
					this.problem(t.npc + " has not given me anything back yet (" + t.why + ").");
				} else if (!pendingNow(this, t)) {
					this.note(t.why + ": done.");
				}
			}

			if (passTalked === 0) {
				break;
			}
		}

		this.consumeQuestItems();

		return talked;
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

			// check access to this act
			if (!Pather.accessToAct(quest_act)) pass = false;

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
				if (progress >= 100) pass = false;

				// if quests charsi, larzuk, or anya...
				if (quest_id == 3 || quest_id == 35 || quest_id == 38)
				{
					// if quest partially complete, skip
					if (progress >= 50) pass = false;
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
					this.note('Act ' + quest_act + ' - #' + quest_num + ' - "' + quest_title + '" is complete.');
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