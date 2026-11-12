/**
*	@filename	QuestScripts.js
*	@desc		The quests, one function each: what the bot does to play a quest (travel, clear, kill, fetch, talk). They are listed by name in
*				libs/common/QuestTable.json ("script") and added to the Quester by Quester.js, which runs them in order (Quester.runQuests).
*/

Quester.act1_den_of_evil = function (progress, is_town_only)
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
};

Quester.act1_sisters_burial_grounds = function (progress, is_town_only)
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
};

Quester.act1_search_for_cain = function (progress, is_town_only)
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
};

Quester.act1_forgotten_tower = function (progress, is_town_only)
{
	if (!is_town_only)
	{
		// start at dark wood
		Town.goToTown(1);

		include('bots/Countess.js');
		Config.Countess.KillGhosts = true;

		// a Sorceress in the party (Quests tab) puts the team at the way into Tower Cellar Level 5; otherwise walk
		if (QuickTravel.portal("countess", 25))
		{
			Precast.doPrecast(true);
			Countess.kill();
		}
		else
		{
			// clear black marsh
			this.clearAndCapture(6);

			// run countess script
			Countess.call();
		}

		// update progress
		progress = 100;
	}

	// return to town
	if (progress >= 50) this.townAndTalk('akara');

	// return
	return true;
};

Quester.act1_tools_of_the_trade = function (progress, is_town_only)
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
};

Quester.act1_sisters_to_the_slaughter = function (progress, is_town_only)
{
	if (!is_town_only)
	{
		Town.goToTown(1);
		include('bots/Andariel.js');

		// a Sorceress in the party (Quests tab) puts the team at the way into Catacombs Level 4: ten levels of walking saved
		if (QuickTravel.portal("andy", 37))
		{
			Precast.doPrecast(true);
			Andariel.kill();
		}
		else
		{
			// start at outer cloister
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

			// clearing the level kills her; when the levels are not cleared (Quests tab) nothing on the way has, so go and kill her
			if (Config.QuestClearAll === false)
			{
				Andariel.kill();
			}
		}

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
};

Quester.act2_radaments_lair = function (progress, is_town_only)
{
	if (!is_town_only)
	{
		// start at town
		Town.goToTown(2);

		// the Book of Skill drops once: have room for it before the fight
		QuestItems.makeRoom(2, 2);

		// clear sewers
		this.clearAndCapture(47);
		this.clearAndCapture(48);

		// run radament script
		include('bots/Radament.js');
		Radament.call();

		// The fight can end with a trip to town (a full pack, low life): the Book of Skill lies where Radament died, so go back there
		// before looking for it (it was once looked for in town, "not there", and the bot left the book behind).
		if (me.area !== 49)
		{
			try
			{
				print('Quester: going back to where Radament died to look for the Book of Skill.');
				Pather.useWaypoint(48);
				Pather.moveToExit(49, true);
				Pather.moveToPreset(me.area, 2, 355);
				Pickit.pickItems();
			}
			catch (e)
			{
				print('Quester: could not go back to Radament: ' + e);
			}
		}

		// pickup skill book
		this.pickAndPlunder(null, 552, true, true); // it drops once: it may have been taken already, and the bot must still go on to Atma

		// clear sewers 3
		this.clearAndCapture(49, false);

		// update progress
		progress = 100;
	}

	// talk to atma
	if (progress >= 50) this.townAndTalk('atma');

	// return
	return true;
};

Quester.act2_horadric_staff = function (progress, is_town_only)
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
};

Quester.act2_arcane_sanctuary = function (progress, is_town_only)
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
};

Quester.act2_seven_tombs = function (progress, is_town_only)
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
};

Quester.act3_khalims_will = function (progress, is_town_only)
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
};

Quester.act3_blade_of_the_old_religion = function (progress, is_town_only)
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
};

Quester.act3_lam_esens_tome = function (progress, is_town_only)
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
};

Quester.act3_guardian = function (progress, is_town_only)
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
};

Quester.act4_fallen_angel = function (progress, is_town_only)
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
};

Quester.act4_hells_forge = function (progress, is_town_only)
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
};

Quester.act4_terrors_end = function (progress, is_town_only)
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
};

Quester.act5_seige_on_haggorath = function (progress, is_town_only)
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
};

Quester.act5_rescue_on_mount_arreat = function (progress, is_town_only)
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
};

Quester.act5_prison_of_ice = function (progress, is_town_only)
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
};

Quester.act5_betrayal_of_haggorath = function (progress, is_town_only)
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
};

Quester.act5_rite_of_passage = function (progress, is_town_only)
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
};

Quester.act5_eve_of_destruction = function (progress, is_town_only)
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
};
