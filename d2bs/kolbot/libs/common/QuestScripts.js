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

		// Qolbot: with "clear every monster" off (Quests tab) the walk through these levels only takes their waypoints; the bot script below starts with
		// town chores and a waypoint anyway, so with the waypoints known the walk was a trip out and straight back (live 18:09, Den of Evil on Nightmare:
		// Blood Moor, then back to town for Corpsefire's chores and the Cold Plains waypoint: "ping pong")
		if (Config.QuestClearAll !== false)
		{
			// clear blood moor
			this.clearAndCapture(2);
		}
		else if (!Waypoints.has(3))
		{
			this.clearAndCapture(3); // Corpsefire goes by the Cold Plains waypoint
		}

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
		// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot. The quest is Blood Raven only: the
		// Mausoleum and the Crypt are never needed (the user, 2026-11-14), so Mausoleum.js (which clears both) is not run. UNTESTED live.
		if (!(typeof QuickTravel === "object" && QuickTravel.portal("bloodraven", 17)))
		{
			this.clearAndCapture(3);

			if (me.area !== 17) Pather.journeyTo(17);
		}

		Precast.doPrecast(true);
		Pather.moveToPreset(17, 1, 805);
		Attack.kill(getLocaleString(3111)); // Blood Raven
		Pickit.pickItems();

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

		// Qolbot: with "clear every monster" off (Quests tab) the walk through these levels only takes their waypoints; the bot script below starts with
		// town chores and a waypoint anyway, so with the waypoints known the walk was a trip out and straight back (live 18:09, Den of Evil on Nightmare:
		// Blood Moor, then back to town for Corpsefire's chores and the Cold Plains waypoint: "ping pong")
		if (Config.QuestClearAll !== false || !Waypoints.has(4) || !Waypoints.has(5))
		{
			// clear stony field
			this.clearAndCapture(4);

			// clear underground passage
			this.clearAndCapture(10);

			// clear dark wood
			this.clearAndCapture(5);
		}

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
			// Qolbot: with "clear every monster" off (Quests tab) the walk through these levels only takes their waypoints; the bot script below starts with
			// town chores and a waypoint anyway, so with the waypoints known the walk was a trip out and straight back (live 18:09, Den of Evil on Nightmare:
			// Blood Moor, then back to town for Corpsefire's chores and the Cold Plains waypoint: "ping pong")
			if (Config.QuestClearAll !== false || !Waypoints.has(6))
			{
				// clear black marsh
				this.clearAndCapture(6);
			}

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
		// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot as before. UNTESTED live.
		if (!(typeof QuickTravel === "object" && QuickTravel.portal("malus", 28)))
		{
			this.clearAndCapture(7, false, true);

			// clear outer cloister
			this.clearAndCapture(27, false, true);

			// run smith script
			//include('bots/Smith.js');
			//Smith.call();

			// clear barracks
			this.clearAndCapture(28);
		}

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

	// Andariel is dead. The way to act 2 only opens when Warriv has been talked to (the game saves "Sisters to the Slaughter" with its reward pending until
	// then, and the act 2 flag stays clear: found 2026-11-12 when Darius killed her and every later act was "not open"), so do not ask first: go and talk.
	// The leader goes through Warriv; the followers follow it there (Follower.followToAct).
	if (!is_town_only)
	{
		this.leaveAct(2);
	}

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

		include('bots/Radament.js');

		// a Sorceress in the party (Behavior, Quick Travel) puts the team next to Radament: two levels of sewers saved
		if (QuickTravel.portal("radament", 49))
		{
			Precast.doPrecast(true);
			Radament.kill();
		}
		else
		{
			// Qolbot: with "clear every monster" off (Quests tab) the walk through these levels only takes their waypoints; the bot script below starts with
			// town chores and a waypoint anyway, so with the waypoints known the walk was a trip out and straight back (live 18:09, Den of Evil on Nightmare:
			// Blood Moor, then back to town for Corpsefire's chores and the Cold Plains waypoint: "ping pong")
			if (Config.QuestClearAll !== false || !Waypoints.has(48))
			{
				// clear sewers
				this.clearAndCapture(47);
				this.clearAndCapture(48);
			}

			// run radament script
			Radament.call();
		}

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
			Speech.task('Getting the Horadric Cube.');

			// clear rocky waste
			// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot as before. UNTESTED live.
			if (!(typeof QuickTravel === "object" && QuickTravel.portal("deadhalls", 60, 2)))
			{
				this.clearAndCapture(41);

				// clear dry hills
				this.clearAndCapture(42);

				// clear halls of the dead
				this.clearAndCapture(56);
				this.clearAndCapture(57);
				this.clearAndCapture(60);
			}

			// pickup horadric cube
			this.pickAndPlunder(354, 549);
		}

		// if NOT have staff...
		if (!me.getItem(91) && !me.getItem(92))
		{
			Speech.task('Getting the Staff of Kings.');

			// clear far oasis
			// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot as before. UNTESTED live.
			if (!(typeof QuickTravel === "object" && QuickTravel.portal("maggotlair", 64)))
			{
				this.clearAndCapture(43);

				// clear maggot lair
				this.clearAndCapture(62);
				this.clearAndCapture(63);
				this.clearAndCapture(64);
			}

			// pickup staff of kings
			this.pickAndPlunder(356, 92);
		}

		// if NOT have amulet...
		if (!me.getItem(91) && !me.getItem(521))
		{
			Speech.task('Getting the Viper Amulet.');

			// clear lost city
			// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot as before. UNTESTED live.
			if (!(typeof QuickTravel === "object" && QuickTravel.portal("clawviper", 61)))
			{
				this.clearAndCapture(44);

				// clear ancient tunnels
				this.clearAndCapture(65);

				// clear valley of snakes
				this.clearAndCapture(45);

				// clear claw viper temple
				this.clearAndCapture(58);
				this.clearAndCapture(61);
			}

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
		Speech.task('Making the Horadric Staff.');

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

		// talk to jerhyn: the Harem guards let nobody in before that (the leader's walk stopped at Harem Level 2 without it)
		this.townAndTalk('jerhyn');
		this.permissions.p1 = true;

		// The Arcane Sanctuary cannot be walked without Teleport (its platforms are joined by teleport pads): a Sorceress in the party (Quick Travel) puts the
		// team beside the Summoner, who is killed there. Without her the old way is tried: through the Harem (when the Palace Cellar waypoint is not known)
		// and the Palace Cellar to the Sanctuary.
		include('bots/Summoner.js');

		if (typeof QuickTravel === "object" && QuickTravel.portal("summoner", 74))
		{
			Precast.doPrecast(true);
			Attack.clear(15, 0, 250); // the Summoner
		}
		else
		{
			// clear harem. The Harem cannot be walked: the bots stand at its entrance (Harem Level 1, 10005,5043) and no path leads on (2026-11-12). The Palace
			// Cellar has a waypoint, which the team shares (Waypoints.sync) or takes: with it the way goes around the Harem.
			if (!Waypoints.has(52))
			{
				this.clearAndCapture(50);
				this.clearAndCapture(51);
			}

			// clear palace cellar
			this.clearAndCapture(52);
			this.clearAndCapture(53);
			this.clearAndCapture(54);

			// clear arcane sanctuary
			this.clearAndCapture(74, true); // flag true to block town
		}

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

// The Summoner (quest 13): the kill leaves it open until a talk with an NPC in town (Darius killed him in Nightmare at 09:41:50 on 2026-11-15 and
// was pulled into a regroup; the quest stayed open for every bot but Meir). With it open, the game refuses a mate's
// portal into Tal Rasha's tombs (live 14:34-14:56: Meir's portals to the tombs failed for every bot that lacked it, in the same party; their own
// portals worked). The Arcane Sanctuary quest's way in: a Sorceress's portal beside the Summoner, else the old walk. UNTESTED in a game.
Quester.act2_summoner = function (progress, is_town_only)
{
	if (is_town_only)
	{
		return true;
	}

	Town.goToTown(2);
	include('bots/Summoner.js');

	if (typeof QuickTravel === "object" && QuickTravel.portal("summoner", 74))
	{
		Precast.doPrecast(true);
		Attack.clear(15, 0, 250); // the Summoner
	}
	else
	{
		if (!Waypoints.has(52))
		{
			this.clearAndCapture(50);
			this.clearAndCapture(51);
		}

		this.clearAndCapture(52);
		this.clearAndCapture(53);
		this.clearAndCapture(54);
		this.clearAndCapture(74, true);
	}

	// read Horazon's Journal: this closes the quest
	this.pickAndPlunder(357);

	// the kill leaves bits 0110 (live 2026-11-15 15:03:01): the quest closes at the next NPC talk in town (Darius and Xena at 15:03:09-12, talking to Fara on
	// a heal trip; Barabas, who went to town without talking to anyone, kept it open)
	if (!me.getQuest(13, 0))
	{
		Town.goToTown(2);
		Town.initNPC("Heal", "heal");
	}

	if (!me.getQuest(13, 0))
	{
		print("Quester: The Summoner is still open after the kill and a talk in town (quest 13 bits " + [0, 1, 2, 3].map(function (b) { return me.getQuest(13, b); }).join("") + ")");
	}

	return true;
};

Quester.act2_seven_tombs = function (progress, is_town_only)
{
	if (!is_town_only)
	{
		// start at town
		Town.goToTown(2);

		// A Sorceress in the party (Quick Travel) opens a portal in the staff room of the right tomb: no need to walk the tombs and the canyon
		// (the walk through Tal Rasha's Tomb #1 ended in "Failed to move to Canyon" and move-retry loops, 2026-11-12). Without her: the old way.
		// the game refuses a mate's portal into the tombs while The Summoner is open (see act2_summoner): walk at once instead of 90 s at her portal
		if (!me.getQuest(13, 0))
		{
			print("Quester: The Summoner is not done: a mate's portal into the tombs would be refused, walking");
		}

		if (me.getQuest(13, 0) && typeof QuickTravel === "object" && QuickTravel.portal("duriel", [66, 67, 68, 69, 70, 71, 72], 2))
		{
			Precast.doPrecast(true);
		}
		else
		{
			// The quest needs the one tomb that is Duriel's, not all seven (the old "Tombs.call()" walked every tomb first: the bots chickened over and over in
			// Tal Rasha's Tomb #1 at level 20 without ever getting to Duriel, 2026-11-12)

	 		// move to canyon of magi and tal rashas tomb
		 	Pather.journeyTo(46);
		 	Pather.moveToExit(getRoom().correcttomb, true); // flag true to enter door
		 	Pather.moveToPreset(me.area, 2, 152, -11, 3) // move to staff room
		}

		// if you have the horadric staff...
	 	if (me.getItem(91))
	 	{
			// open hole in wall
			this.keyAndKeyhole(152, 91);
		}

		// the way into Duriel's Lair (object 100) shows only when the wall has opened, after the quake: wait for it, up to 30 s (live 2026-11-15
		// 14:37:53, Nightmare: the old fixed 5 s were too short, useUnit found nothing and the quest went back to town for a second attempt)
		for (var lairWait = 0; lairWait < 60 && !getUnit(2, 100); lairWait += 1)
		{
			delay(500);
		}

		if (!getUnit(2, 100))
		{
			print("Quester: no way into Duriel's Lair in view after 30 s (is the staff in the Orifice?)");
		}

	 	// run duriel script
		//include('bots/Duriel.js');
	 	//Duriel.call();

	 	// clear duriels chamber
		Pather.useUnit(2, 100, 73); // use secret door
		Team.holdAndGather(Team.limits.boss); // the team has to be in the lair when he dies
		try
		{
			Attack.kill(211); // kill duriel
		}
		catch (durielGone)
		{
			print("Quester: Duriel is already dead (" + durielGone + "): the Sorceress was quicker"); // not an error: go on to Tyrael
		}
		Pickit.pickItems();

	 	// talk to tyrael: he appears when Duriel is dead. Wait for him to show first (a walk to his place can be blocked: Sankt and Xena stood for minutes in
	 	// "move retry" loops there while he was not found), walk only while he is not in view, and never for long
	 	for (var tyraelWait = 0; tyraelWait < 24 && !getUnit(1, "tyrael"); tyraelWait += 1)
	 	{
	 		delay(500);
	 	}

	 	if (!getUnit(1, "tyrael"))
	 	{
	 		try
	 		{
	 			Pather.moveTo(22609, 15707, 2);
	 			Pather.moveTo(22576, 15690, 2);
	 			Pather.moveTo(22576, 15599, 2);
	 		}
	 		catch (tyraelWalk)
	 		{
	 			print("Quester: the walk to Tyrael failed: " + tyraelWalk);
	 		}
	 	}

	 	this.talkToNPC('tyrael', 40); // flag true to take portal

	 	// update progress
	 	progress = 100;
	}

	if (progress >= 50)
	{
	 	// talk to hratil
		//this.townAndTalk('hratli');
	}

	// Duriel is dead: Meshif opens act 3 once he has been talked to (the same as Warriv after Andariel), so go and talk
	if (!is_town_only)
	{
		this.leaveAct(3);
	}

	// return
	return true;
};

// The Horadric Cube from its chest in the Halls of the Dead Level 3 (Act 2, area 60, chest 354): for a bot that has done the Horadric Staff quest without
// ever carrying the Cube. The chest holds one for every player in a fresh game. Back in the Act 3 town afterwards.
Quester.fetchCube = function ()
{
	var home = me.inTown ? me.act : 3; // back to the town I started from

	Speech.task('Getting the Horadric Cube.');

	try {
		// the team goes together: through the Sorceress's portal when there is one (QuickTravel), else on foot; the followers follow the leader and pick up
		// the Cube the chest drops for each of them (Quest.nip, QuestItems.shared)
		if (!(typeof QuickTravel === "object" && QuickTravel.portal("deadhalls", 60, 2))) {
			Town.goToTown(2);
			Pather.useWaypoint(57); // Halls of the Dead Level 2; journeyTo(60) returned at once and left Sankt there (10:53): the chest is on Level 3
			Pather.moveToExit(60, true);
		}

		if (me.area !== 60) {
			throw new Error("not in the Halls of the Dead Level 3 (area " + me.area + ")");
		}

		this.pickAndPlunder(354, 549);
		Attack.clear(30);
		Pickit.pickItems();
	} catch (cubeError) {
		print("Quester: fetching the Horadric Cube: " + cubeError);
	}

	if (!me.inTown || me.act !== home) {
		Town.goToTown(home);
	}

	return !!me.getItem(549);
};

// CUBE HUNT (the user, 2026-11-14), at the start of a quest game like the waypoint hunt, a TEAM trip led by the leader (the manager picks a bot without a
// Cube as leader, dynleader.go): a bot that has reached Act 2 (it has Lut Gholein's waypoint)
// and holds no Horadric Cube goes and gets one, whatever quest is next: the Cube is the one quest tool that only the bot that did the Horadric
// Staff quest ever picked up (the others were credited with the quest and skipped it). Quest games only, never on a gold or level hunt.
// UNTESTED in a game.
Quester.cubeHunt = function ()
{
	var got, plan = typeof Plan === "object" ? Plan.get() : null;

	// A follower's plan file has no "goal" (only the leader's does): the goal only rules the hunt out when the plan names one. (The first version required
	// goal === "Quest" and skipped every follower without a word: Sankt and Barabas, 2026-11-14 10:47.)
	if (me.getItem(549)) {
		return false;
	}

	if (!me.inTown || !plan || (plan.goal && plan.goal !== "Quest") || plan.hunt || !Waypoints.has(40)) {
		print("Cube hunt: not now (" + (!me.inTown ? "not in town" : (!plan ? "no plan" : ((plan.goal && plan.goal !== "Quest") ? "goal " + plan.goal : (plan.hunt ? "on a hunt" : "Act 2 never reached")))) + ").");

		return false;
	}

	print("Cube hunt: I have no Horadric Cube and have been to Act 2: fetching one.");

	got = this.fetchCube();

	print("Cube hunt: finished (" + (got ? "the Cube is in the pack" : "no Cube") + ").");

	return got;
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
			// Qolbot (UNTESTED in a game): a Sorceress in the party teleports to the Spider Cavern, opens a portal and the team takes it (QuickTravel;
			// only when Full Clear is off). Without her the way on foot below.
			if (typeof QuickTravel === "object" && QuickTravel.portal("spidercavern", 85))
			{
				this.pickAndPlunder(407, 553);
			}
			else
			{
		 		// clear spider forest
		 		this.clearAndCapture(76);

		 		// clear spider cavern and pickup khalim's eye
		 		this.clearAndCapture(85);
		 		this.pickAndPlunder(407, 553);

		 		// clear great marsh
		 		this.clearAndCapture(77);
			}
		}

		// if NOT have khalims will or khalim's brain...
		if (!me.getItem(174) && !me.getItem(555))
		{
			if (typeof QuickTravel === "object" && QuickTravel.portal("flayerdungeon", 91))
			{
				this.pickAndPlunder(406, 555);
			}
			else
			{
		 		// clear flayer jungle
		 		this.clearAndCapture(78);

		 		// clear flayer dungeon and pickup khalim's brain
		 		this.clearAndCapture(88);
		 		this.clearAndCapture(89);
		 		this.clearAndCapture(91);
		 		this.pickAndPlunder(406, 555);
			}
		}

		// if NOT have khalims will or khalim's heart...
		if (!me.getItem(174) && !me.getItem(554))
		{
			// the portal comes out in the Sewers (level 1): the lever and the secret door below are still done on foot
			if (!(typeof QuickTravel === "object" && QuickTravel.portal("sewers", 92)))
			{
		 		// clear lower kurast
		 		this.clearAndCapture(79);

		 		// clear kurast bazaar
		 		this.clearAndCapture(80);

		 		// clear sewers
		 		this.clearAndCapture(92);
			}

		 	// pickup khalim's heart
		 	this.pickAndPlunder(367); // touch the lever
		 	Pather.useUnit(2, 366, 93); // use secret door
		 	this.clearAndCapture(93);
		 	this.pickAndPlunder(405, 554);
		}

		// if NOT have khalims will or khalim's flail...
		if (!me.getItem(174) && !me.getItem(173))
		{
			// Qolbot: with the Travincal waypoint known the walk through Upper Kurast and the Causeway is not needed (the user: a bot that has the organs
			// should not redo the steps to the Compelling Orb)
			if (!(Pather.wpAreas.indexOf(83) > -1 && getWaypoint(Pather.wpAreas.indexOf(83))))
			{
				// clear upper kurast
		 		this.clearAndCapture(81);

		 		// clear kurast causeway
		 		this.clearAndCapture(82);
			}

		 	// clear travincal
		 	this.clearAndCapture(83);

		 	// Qolbot: the flail drops when the Council dies, and with "clear every zone" off clearAndCapture clears nothing: Sankt had the Eye, the Brain and the
		 	// Heart and "Unable to find item" for the flail (2026-11-14 09:40). The Council stands around the Compelling Orb, the altar by the stairs down to the
		 	// Durance of Hate (the user): walk there (object 404, the one the Will is smashed on) and fight what comes. A whole-level clear was too slow.
		 	if (!me.getItem(173))
		 	{
		 		if (me.area !== 83)
		 		{
		 			Pather.journeyTo(83);
		 		}

		 		try { Pather.moveToPreset(83, 2, 404); } catch (orbError) { print("Quester: walk to the Compelling Orb: " + orbError); }

		 		Team.holdAndGather(Team.limits.boss); // the Council fight with the team around, not alone
		 		Attack.clear(60);
		 		Attack.clear(60);
		 	}

		 	// pickup khalims flail. Qolbot: a pickup that fails (no room in the pack) is tried again after the pack is rearranged, and a flail that is still
		 	// not in the pack is an error, so the quest attempt is repeated instead of the bot going on to the next quest without it (Darius, 2026-11-14 10:15)
		 	for (var flailTry = 0; flailTry < 3 && !me.getItem(173); flailTry += 1)
		 	{
		 		this.pickAndPlunder(null, 173);

		 		if (!me.getItem(173))
		 		{
		 			print("Quester: the flail is not in my pack yet (try " + (flailTry + 1) + " of 3): rearranging the pack");
		 			QuestItems.repack({sizex: 2, sizey: 3});
		 			delay(1000);
		 		}
		 	}

		 	if (!me.getItem(173))
		 	{
		 		throw new Error("the flail is not in the pack");
		 	}
		}
	}

	// Qolbot (UNTESTED in a game): a bot whose Horadric Staff quest was credited to it without it ever holding the Cube (Barabas, Xena and Sankt, 2026-11-14:
	// only the bot that ran the quest picked the Cube up) cannot assemble the Will: it fetches the Cube from its chest in the Halls of the Dead first.
	if (!is_town_only && me.getItem(173) && me.getItem(553) && me.getItem(554) && me.getItem(555) && !me.getItem(174) && !me.getItem(549))
	{
		this.fetchCube();
	}

	// if we have all the parts...
	if (me.getItem(173) && me.getItem(553) && me.getItem(554) && me.getItem(555) && !me.getItem(174))
	{
		Speech.task("Making Kalim's Will.");

		// assemble khalims will
		this.cubeAndCreate(174, 553, 554, 555, 173);
	}

	// the charms that went to the stash to make room for the flail come back once the Will is made (or held from an earlier game)
	if (me.getItem(174) && me.inTown)
	{
		QuestItems.restoreStashed();
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

		// The quest may already be partly done (the Gidbinn handed over, or the quest started): talk to Ormus and Asheara FIRST, and log the quest bits.
		// (2026-11-13: the altar gave Barabas nothing from seven sides; the user's guess: only Ormus is left to talk to.) Done after that: no altar.
		this.logBits(19);
		this.townAndTalk('ormus');
		this.townAndTalk('asheara');
		this.logBits(19);

		if (this.getQuestProgress(19) >= 100)
		{
			return true;
		}

		// if NOT have gidbinn...
		if (!me.getItem(87))
		{
			// go to flayer jungle
			// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot as before. UNTESTED live.
			if (!(typeof QuickTravel === "object" && QuickTravel.portal("gidbinn", 78)))
			{
				Pather.journeyTo(78);
			}

		 	// pickup gidbinn
		 	this.pickAndPlunder(252);
		 	Attack.clear(50);
		 	delay(5000);
		 	Attack.clear(50);
		 	this.pickAndPlunder(null, 87);
		}
	}

	// if you have the gidbin, talk to ormus and asheara
	// Delivered at once (by town portal) when the Gidbinn is in the pack: it drops only once, and the quest credit comes for every bot when it is handed in
	if (progress >= 50 || me.getItem(87) || me.getItem(252))
	{
		this.townAndTalk('ormus');
		this.townAndTalk('asheara');
	}

	// return
	return true;
};

// The Golden Bird (Qolbot; UNTESTED in a game): the Jade Figurine drops from a unique monster in the early part of Act 3 (the user), so there is nothing
// to hunt: the bots find it on the way (Pickit takes quest item 546) while they clear Spider Forest, Flayer Jungle and so on. This script only hands it in:
// Meshif (Kurast Docktown) swaps it for the Golden Bird, Alkor brews the Potion of Life from it, and the quest is complete when it is drunk
// (QuestNpcs / QuestItems do the handing in and the drinking). With no figurine or bird in the pack it does nothing and the quest stays open
// for the next pass.
Quester.act3_golden_bird = function (progress, is_town_only)
{
	if (me.getItem(546) || me.getItem(547) || progress >= 50)
	{
		this.townAndTalk('meshif');
		this.townAndTalk('alkor');
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
			// Qolbot: straight to the Ruined Temple, where the chest is. The tour of all six Kurast temples that came first (bots/KurastTemples.js) cleared
			// nothing the quest needs and failed on its way ("Failed to change area", Xena, 2026-11-14 10:27); the Ruined Temple is reached by waypoint
			// and its exit from the Kurast Bazaar.
			// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot as before. UNTESTED live.
			if (!(typeof QuickTravel === "object" && QuickTravel.portal("temple", 94)))
			{
				Pather.journeyTo(94);
			}
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

		// Qolbot: bots/Mephisto.js goes to Level 3 the way every boss run does (the user, 2026-11-15): a Sorceress's Quick Travel portal (she gets
		// there from the Level 2 waypoint, or from Travincal without it), else the team by the Level 2 waypoint, else from Travincal down the stairs
		// (Pather.toDurance). Waypoints are picked up on the way (Pather.onArrive -> Quester.captureWaypoint). The stairs at Travincal are found by
		// preset (object 386): the fixed point was wrong ("useUnit: Unit not found. ID: 386", Xena, 2026-11-14 10:35).

		// clear duriance of hate
		//this.clearAndCapture(100);
		//this.clearAndCapture(101);

		// run mephisto script
		include('bots/Mephisto.js');
		//Config.Mephisto.MoatTrick = false;
		Config.Mephisto.KillCouncil = true;
		Config.Mephisto.TakeRedPortal = false; // taken below, once the team has been told (Qolbot, UNTESTED in a game)
	 	Mephisto.call();

		// Qolbot: Act 4 opens for a character only when it goes through this portal itself (the user: the followers are all eligible, they only need to be
		// told). A TEAM CROSSING (the user, 2026-11-15: "every transition between the zones and seams of the game are team crossings"; "if the entire team is
		// standing by the red portal in preparation for the crossing, then all of them should arrive within a few seconds on the other side"; "make it so when
		// they do the crossing the leader goes first"). The team is gathered AT the portal, the leader writes the order and says "redportal", and goes through
		// FIRST; the followers, standing there, go right after it (Follower.redPortalToAct4, or checkExit: the leader is in the Pandemonium Fortress) and the
		// leader waits for them in the fortress (arrivedInAct). (Live 21:00: with the followers first, each went back to Act 3 two seconds after crossing
		// because the leader was still in the lair.) UNTESTED in a game.
		Team.holdAndGather(Team.limits.far);
		Pather.moveTo(17590, 8068);
		delay(1500);
		Pather.moveTo(17601, 8070);
		Team.gather(0, false, true);
		Team.order("out", {area: 102, place: "redportal"}); // the order record: the leader's newest order (a follower in town may come out to the lair: Team.mayLeaveTown)
		Team.command("redportal"); // the bots' message log, not the public chat
		print("Quester: the red portal: I go first, the team right after me.");
		Pather.usePortal(null);

		this.arrivedInAct(4); // the red portal leads to the Pandemonium Fortress
	}

	// return
	return true;
};

Quester.act4_fallen_angel = function (progress, is_town_only)
{
	if (!is_town_only)
	{
		// start at town
		Town.goToTown(4);

		// Qolbot (the user, 2026-11-14: "why didn't they use quick travel to get to Izual"): a Sorceress in the party opens a portal in the Plains of Despair (no
		// waypoint there), past the whole Outer Steppes; without her the way on foot as before
		if (!(typeof QuickTravel === "object" && QuickTravel.portal("izual", 105)))
		{
			// clear outer steppes
			this.clearAndCapture(104);
		}

		// kill izual
		Pather.moveToPreset(105, 1, 256);
		// Qolbot: the team is gathered before the fight (the leader says "hold", waits for them, "go"): the leader used to run out of town ahead of the followers,
		// meet Izual alone and chicken (Xena, 2026-11-14 11:10 and 11:16); the whole team must also be there when he dies for the quest to be credited
		Team.holdAndGather(Team.limits.far);
		Attack.kill(256);
		Pickit.pickItems();
		delay(5000);
		// Qolbot: talking to Izual is tried only while he is standing, and a failure never ends the attempt (he was dead after the kill: "Unable to find NPC",
		// Xena 11:07, and the trip was repeated; Darius completed the quest without it: the hand-in is to Tyrael in town, below)
		try {
			if (getUnit(1, "izual")) {
				this.talkToNPC('izual');
			}
		} catch (izualError) {
			print("Quester: Izual: " + izualError);
		}
		// Qolbot: to town and STAY there for Tyrael (Town.visitTown goes back out to the field afterwards: Xena then walked from the Plains of Despair toward
		// Tyrael's town spot, "move retry ... (area 105) to 5021,5033", live 2026-11-14 12:45:17). The chores run in town all the same.
		Town.goToTown(4);
		Town.doChores();

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

// CAIN'S SOULSTONE (the user, 2026-11-14: "they can all talk to Cain in Act 4 and get another one if they need it"): only Darius had Mephisto's
// Soulstone after the Mephisto kills (the stone does not drop for everybody). A bot in the Act 4 town that has none, and has not finished Hell's Forge
// (and is not holding the Hellforge Hammer, 90), talks to Cain. Called at the start of a game, leader and followers. UNTESTED in a game.
Quester.cainSoulstone = function ()
{
	var npc, i;

	if (me.getItem(551) || !me.inTown || me.act !== 4 || me.getQuest(27, 0) || me.getQuest(27, 1)) { // done, or only the hand-in left (getQuest gives true, not 1: Barabas asked Cain every 20 s with Hell's Forge done, 13:29)
		return false;
	}

	print("Quester: I have no Mephisto's Soulstone: asking Cain for one.");

	try {
		// Cain by his class id (245, the way ActTravel finds him) at the spot Town.js knows for Act 4: Quester.townAndTalk looks him up by the name "cain",
		// which is "Deckard Cain" in the game, and found nobody (Barabas and Sankt, 11:18: no "Talking to" line at all)
		Town.move("stash"); // Cain stands near the stash in the Pandemonium Fortress (the user); Town.js's own "cain" spot there is Tyrael's
		npc = getUnit(1, 245) || getUnit(1, "deckardcain") || getUnit(1, "deckard cain") || getUnit(1, "cain");

		for (i = 0; i < 10 && !npc; i += 1) {
			delay(500);
			npc = getUnit(1, 245) || getUnit(1, "deckardcain") || getUnit(1, "deckard cain") || getUnit(1, "cain");
		}

		if (npc) {
			print("Talking to " + npc.name);

			for (i = 0; i < 3; i += 1) {
				npc.openMenu();
				delay(1000);
				me.cancel();
			}
		} else {
			print("Quester: Cain is not in sight at " + me.x + "," + me.y);
			// who IS in sight: finds out whether he is not in this town or goes by another id/name
			var seen = [], unit = getUnit(1);

			if (unit) {
				do {
					if (unit.classid !== undefined && getDistance(me, unit) < 40 && seen.length < 25) {
						seen.push(unit.name + "/" + unit.classid + "@" + unit.x + "," + unit.y);
					}
				} while (unit.getNext());
			}

			print("Quester: in sight: " + (seen.join("; ") || "nobody"));
		}
	} catch (cainError) {
		print("Quester: Cain: " + cainError);
	}

	print("Quester: Cain: " + (me.getItem(551) ? "I have the Soulstone now." : "no Soulstone from him."));

	return !!me.getItem(551);
};

Quester.act4_hells_forge = function (progress, is_town_only)
{
	if (!is_town_only)
	{
		// start at town
		Town.goToTown(4);

		// Qolbot: a Soulstone in the pack before the trip (the forge is clicked with it there; a failed attempt before the stone was placed on the forge and was lost)
		try { this.cainSoulstone(); } catch (cainError) { print("Quester: Cain: " + cainError); }

		// talk to cain
		//this.townAndTalk('cain');

		// run hephasto script
		//include('bots/Hephasto.js');
		//Hephasto.call();

		// kill hephasto
		// Qolbot (the user, 2026-11-14): a Sorceress in the party opens a portal next to the Hellforge (from the River of Flame's waypoint, past the walk to it);
		// without her the way on foot as before
		if (!(typeof QuickTravel === "object" && QuickTravel.portal("hephasto", 107)))
		{
			Pather.journeyTo(107);
		}
		Pather.moveToPreset(107, 2, 376);
		// Qolbot: kill Hephasto BY NAME, as Kolbot's own Hephasto.js does: a clear of 50 units around the forge did not reach him, no hammer dropped and
		// the hammer step failed with "item is undefined" (Barabas, live 2026-11-14 13:02:52). Attack.kill gathers the team before the boss.
		try {
			Attack.kill(getLocaleString(1067)); // Hephasto The Armorer
		} catch (hephastoError) {
			print("Quester: Hephasto: " + hephastoError);
		}
		Attack.clear(50);

		// pickup hellforge hammer
		//this.pickAndPlunder(null, 90); // not sure why this doesn't work?
		Pickit.pickItems(); // fallback

		// destroy metphisto's hellstone
		if (!me.getItem(90))
		{
			Pickit.pickItems();
			delay(1000);
		}
		if (!me.getItem(90))
		{
			throw new Error("no Hellforge Hammer (Hephasto not killed, or the hammer not picked up)");
		}
		// the forge is in the River of Flame: a town trip in the middle (a heal) leaves the bot in town, and equipAndAttack looks for it in me.area ("Couldn't
		// find preset unit - id 376", Darius, live 2026-11-14 13:14:44)
		if (me.area !== 107)
		{
			Pather.journeyTo(107);
		}
		this.smashForge();

		// Qolbot (the user, 2026-11-16: "make sure the quest script takes a portal to town immediately after smashing the soulstone and picking up the items that drop"): no
		// clearing of the River of Flame here any more. It took 2.5 minutes after the smash (live 13:16:35 -> 13:19:08), the team was only called to town after that, and the
		// hand-in to Cain was late (the leader had already gone on, and Barabas, Xena and Sankt were left with the reward waiting). The smash picks up what drops (smashForge),
		// then the town part below takes the portal at once: the leader's town call brings the team, everybody hands in to Cain, and the leader waits for them. UNTESTED in a game.
	}

	// Qolbot: the hand-in. After the smash the game sets bit 1 ("reward waiting": live 13:26:46, bits 0001010000000000 -> 0100000000000100) and the quest
	// is completed by Deckard Cain in the Pandemonium Fortress. This part also runs alone when only the hand-in is left (Quester.runQuests).
	if (progress >= 50)
	{
		Town.goToTown(4);
		this.talkToCain4();
	}

	// return
	return true;
};

// Deckard Cain in the Pandemonium Fortress, by his class id (245) near the stash (see cainSoulstone: the name "cain" finds nobody)
Quester.talkToCain4 = function ()
{
	var npc, i;

	Town.move("stash");
	for (i = 0; i < 10 && !npc; i += 1)
	{
		npc = getUnit(1, 245) || getUnit(1, "deckardcain") || getUnit(1, "deckard cain");
		if (!npc) delay(500);
	}

	if (!npc)
	{
		throw new Error("Cain is not in sight at " + me.x + "," + me.y);
	}

	print("Talking to " + npc.name);
	for (i = 0; i < 3; i += 1)
	{
		npc.openMenu();
		delay(1000);
		me.cancel();
	}

	return true;
};

// Qolbot (the user, 2026-11-14: "seems like they aren't using the hammer on the altar with mephistos soulstone"): the Hellforge takes two steps. (1) Click the
// forge with Mephisto's Soulstone in the pack: the stone is placed on it (it leaves the pack). (2) With the Hellforge Hammer in hand, hit the forge: it smashes
// the stone and the quest is done. The old step only swung the hammer at an empty forge (Barabas, live 13:19:54: no change). Each step is checked against the
// game (the stone gone from the pack; the quest bits of Hell's Forge, 27, changed), and the bits are logged.
Quester.smashForge = function ()
{
	var forge, i, before, after, original, offhand, hammer, cursor, stripped = false, worn, byGid, ground, g, phase, off, back;

	PartySync.busy(90000); // no party trip in the middle of it

	// the item in a body slot (a copy), and an item by its gid
	worn = function (slot)
	{
		var w = me.getItem();

		if (w)
		{
			do
			{
				if (w.location === 1 && w.bodylocation === slot)
				{
					return copyUnit(w);
				}
			} while (w.getNext());
		}

		return null;
	};

	byGid = function (gid)
	{
		var w = me.getItem();

		if (w)
		{
			do
			{
				if (w.gid === gid)
				{
					return w;
				}
			} while (w.getNext());
		}

		return null;
	};

	Pather.moveToPreset(107, 2, 376);
	forge = this.getUnitHelper(2, 376);

	if (!forge)
	{
		throw new Error("the Hellforge is not in sight");
	}

	if (!me.getItem(90))
	{
		throw new Error("no Hellforge Hammer");
	}

	if (!me.getItem(551))
	{
		throw new Error("no Mephisto's Soulstone in my pack");
	}

	if (me.getItem(551).location === 7) // in the stash: it must be in the pack
	{
		throw new Error("Mephisto's Soulstone is in the stash, not in my pack");
	}

	this.logBits(27);
	before = this.questBitsOf(27);
	after = before;

	// THE WAY THAT WORKED (2026-11-14 13:26:40-46, Darius, Normal, all four mates credited): (1) a click on the forge with the stone in the pack puts the stone on it ("Mephisto's
	// Soulstone is on the Hellforge"), (2) the hammer in hand, (3) hits, and 5 seconds later the quest bits changed (the third pass, a click on the forge with the hammer in
	// hand). The versions of 2026-11-16 that left the stone in the pack and only hit (the user: "the stone in inventory and you attack the forge with the hammer in hand") changed
	// nothing in 160 hits, and the ones that clicked first failed on Barabas (Nightmare, a Barbarian with a weapon in each hand): the difference to the success is the class or the
	// difficulty, so the second weapon is taken off for the hits and a plain left click is tried too. Every pass says what the character does. UNTESTED in a game.

	// (1) the stone onto the forge, with no hammer in hand
	for (i = 0; i < 6 && me.getItem(551); i += 1)
	{
		Pather.moveToUnit(forge);
		forge.interact();
		delay(1500 + me.ping);
		me.cancel();
		forge = this.getUnitHelper(2, 376) || forge;
	}

	print(me.getItem(551) ? "Quester: the Soulstone is still in my pack after the clicks" : "Quester: Mephisto's Soulstone is on the Hellforge");
	after = this.questBitsOf(27);

	// (2) the hammer in hand, in the main weapon set (the user: "the char must have equipped the hellforge hammer")
	if (typeof Precast === "object" && Precast.haveCTA > -1)
	{
		try { Precast.weaponSwitch(Math.abs(Precast.haveCTA - 1)); } catch (switchError) { print("Quester: weapon switch: " + switchError); }
	}

	hammer = me.getItem(90);
	original = worn(4);

	if (original && hammer && original.classid === hammer.classid)
	{
		original = null; // the hammer is already in the hand
	}

	if (hammer && !(hammer.location === 1 && hammer.bodylocation === 4))
	{
		hammer.toCursor();
		delay(500);
		clickItem(0, 4); // the weapon slot: the old weapon comes to the cursor
		delay(500);
		cursor = getUnit(100);

		if (cursor && Storage.Inventory.CanFit(cursor))
		{
			Storage.Inventory.MoveTo(cursor);
		}
	}

	// a weapon in the other hand too (a Barbarian): off for the hits, so only the hammer is wielded
	offhand = worn(5);

	if (offhand && !(typeof qolgear === "object" && qolgear.isWeapon(offhand.itemType)))
	{
		offhand = null; // a shield stays on
	}

	if (offhand)
	{
		off = byGid(offhand.gid);

		if (off)
		{
			off.toCursor();
			delay(500);
			cursor = getUnit(100);

			if (cursor && Storage.Inventory.CanFit(cursor))
			{
				Storage.Inventory.MoveTo(cursor);
				delay(300);
				stripped = !getUnit(100);
			}

			if (!stripped && getUnit(100))
			{
				clickItem(0, 5); // no room: back on
				delay(500);
			}

			print("Quester: the second weapon (" + offhand.name + ") " + (stripped ? "is off for the hits: only the Hammer is wielded" : "could not come off (no room in the pack): it stays on"));
		}
	}

	hammer = me.getItem(90);
	print("Quester: the Hellforge Hammer is " + (hammer && hammer.location === 1 && hammer.bodylocation === 4 ? "in my hand" : "NOT in my hand") + ", right hand " + (worn(4) ? worn(4).name : "empty") + ", left hand " + (worn(5) ? worn(5).name : "empty") + ", weapon set " + me.weaponswitch + ", the Soulstone " + (me.getItem(551) ? "is in my pack" : "is not in my pack (on the forge)"));

	// (3) hits until the game says something changed: 24 of the way that worked (the walk up, the normal attack with the right button and Shift, and a click on the forge every
	// third pass), then 12 with the plain left button
	for (i = 0; i < 36 && after === before; i += 1)
	{
		phase = i < 24 ? 1 : 2;
		forge = this.getUnitHelper(2, 376) || forge;

		if (i === 0 || i === 24)
		{
			print("Quester: the Hellforge hits, way " + phase + " of 2: " + (phase === 1 ? "the normal attack, right button + Shift, and a click every third pass" : "the plain left click"));
		}

		Pather.moveToUnit(forge);

		if (phase === 1)
		{
			Skill.cast(0, Skill.getHand(0), forge);
		}
		else
		{
			Skill.setSkill(0, 1); // the normal attack on the left button
			clickMap(0, 0, forge);
			delay(60);
			clickMap(2, 0, forge);
		}

		delay(800);
		after = this.questBitsOf(27);

		if (after === before && i % 3 === 2)
		{
			forge.interact(); // a click on the forge with the hammer in hand (the pass that changed the bits on 2026-11-14)
			delay(800);
			me.cancel();
			after = this.questBitsOf(27);
		}

		if (i % 4 === 3 || after !== before)
		{
			print("Quester: the Hellforge hit " + (i + 1) + ": bits " + after + ", me.mode " + me.mode + ", attacking " + me.attacking + ", forge mode " + forge.mode + ", " + Math.round(getDistance(me, forge)) + " away, the stone " + (me.getItem(551) ? "in my pack" : "not in my pack"));
		}
	}

	if (after !== before)
	{
		delay(2500 + me.ping); // what the forge drops (runes) lands a moment after the smash: the pickup below must not run before it
	}

	ground = 0;
	g = getUnit(4);

	if (g)
	{
		do
		{
			if (g.mode === 3 && getDistance(g, forge) < 12)
			{
				ground += 1;
			}
		} while (g.getNext());
	}

	this.logBits(27);
	print("Quester: the Hellforge: quest bits " + before + " -> " + after + ", " + ground + " item(s) on the ground by the forge");

	// the old weapons back in hand: the main one, then the second
	if (original)
	{
		back = byGid(original.gid);

		if (back && !(back.location === 1 && back.bodylocation === 4))
		{
			back.toCursor();
			delay(500);
			clickItem(0, 4);
			delay(500);
			cursor = getUnit(100);

			if (cursor && Storage.Inventory.CanFit(cursor))
			{
				Storage.Inventory.MoveTo(cursor);
			}
		}
	}

	if (offhand && stripped)
	{
		back = byGid(offhand.gid);

		if (back)
		{
			back.toCursor();
			delay(500);
			clickItem(0, 5);
			delay(500);

			if (getUnit(100))
			{
				cursor = getUnit(100);

				if (Storage.Inventory.CanFit(cursor))
				{
					Storage.Inventory.MoveTo(cursor);
				}
			}
		}
	}

	Pickit.pickItems(); // the forge drops runes

	return after !== before;
};

// the 16 quest bits of quest `id` as a string ("0001000000000000"), from the game
Quester.questBitsOf = function (id)
{
	var bits = "", i;

	sendPacket(1, 0x40);
	delay(300);

	for (i = 0; i < 16; i += 1)
	{
		bits += me.getQuest(id, i) ? "1" : "0";
	}

	return bits;
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
		// Qolbot: Tyrael opens the red portal to Harrogath (object 566) when talked to IN TOWN; the old talkToNPC + usePortal(109) never took it
		// (live 2026-11-14 13:42: Barabas "Taking portal" in the Chaos Sanctuary, then "act 5 is not open" for every Act 5 quest). UNTESTED live.
		Town.goToTown(4);
		this.leaveAct(5); // ActTravel.go(5): Tyrael, the portal, then the team waits in Harrogath
	}

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

		// Qolbot: with "clear every monster" off nothing above kills Shenk, and the quest is never done (Darius, 2026-11-14 13:58: "done with" in
		// 40 s, not complete). His spot is the one Eldritch.js uses; then Larzuk in town. UNTESTED live.
		try
		{
			if (me.area !== 110) Pather.journeyTo(110);
			Pather.moveTo(3876, 5130);

			// not there (live 14:16:02, Darius: "Attack.clear: Shenk the Overseer not found"): he guards the way to the Frigid Highlands; walk to that exit (not through)
			if (!getUnit(1, getLocaleString(22435)))
			{
				Pather.moveToExit(111, false);
			}

			Attack.clear(30, 0, getLocaleString(22435)); // Shenk the Overseer
		}
		catch (shenkError)
		{
			print("Quester: Shenk: " + shenkError);

			// what is around (live 14:35:57: "not found" at 3908,5123, twice; no game log ever had him killed): the special monsters in view, by name and place
			try
			{
				var seen = [], mon = getUnit(1);

				if (mon) do { if (mon.spectype & 0x7) seen.push(mon.name + " (" + mon.classid + ") " + mon.x + "," + mon.y + (mon.hp > 0 ? "" : " dead")); } while (mon.getNext());

				print("Quester: Shenk: I am at " + me.x + "," + me.y + " (area " + me.area + "); looked for \"" + getLocaleString(22435) + "\"; special monsters in view: " + (seen.join("; ") || "none"));
			}
			catch (seenError) {}
		}

		progress = 50;
	}

	// Larzuk: the kill is reported to him (his socket reward stays for the player)
	if (progress >= 50 || is_town_only) this.townAndTalk('larzuk');

	// return
	return true;
};

// Hit every prison door (monster 434) near a barbarian pen until it breaks: the door is a monster with hit points, not an object to open.
Quester.breakPrisonDoors = function (x, y)
{
	var door, doors = [], n, skill = Config.AttackSkill[1] > -1 ? Config.AttackSkill[1] : 0;

	door = getUnit(1, 434);

	if (door)
	{
		do
		{
			if (door.hp > 0 && getDistance(door.x, door.y, x, y) < 25) doors.push(copyUnit(door));
		}
		while (door.getNext());
	}

	print("Quester: " + doors.length + " prison door(s) at " + x + "," + y);

	// none (live 14:41-14:42 on 2026-11-14, three pens): say what IS there, monsters and objects within 25, by class id, to find the doors
	if (!doors.length)
	{
		try
		{
			var near = [], u, t;

			for (t = 1; t <= 2; t += 1)
			{
				u = getUnit(t);

				if (u) do { if (getDistance(u.x, u.y, x, y) < 25) near.push((t === 1 ? "m" : "o") + u.classid + " " + u.name + (t === 1 ? " hp" + u.hp + " mode" + u.mode : " mode" + u.mode)); } while (u.getNext());
			}

			print("Quester: near the pen (I am at " + me.x + "," + me.y + "): " + (near.slice(0, 25).join("; ") || "nothing"));
		}
		catch (nearError) {}
	}

	doors.forEach(function (d)
	{
		var unit = getUnit(1, 434, -1, d.gid);

		for (n = 0; n < 40 && unit && unit.hp > 0 && !me.dead; n += 1)
		{
			if (getDistance(me, unit) > 3) Pather.moveToUnit(unit, 2, 0);
			Skill.cast(skill, Skill.getHand(skill), unit);
		}
	});

	delay(1000);
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

			// destroy everything
			Attack.clear(20);

			// Qolbot: break the prison doors (monster class 434) ourselves; waiting 10 s for the mercenary to do it freed nobody (Darius, 2026-11-14
			// 14:04: "done with" Rescue on Mount Arreat, not complete). UNTESTED live.
			this.breakPrisonDoors(x, y);

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
	// Qolbot: rewritten (live 2026-11-14 14:09, Darius: "done with" Prison of Ice but not complete, then Betrayal of Harrogath "Failed to use portal": Anya's
	// portal is there only once she is back). A party heal trip in the middle sent Darius back out to the river before he saw Malah, and the steps had no checks.
	// Now: no party trip during the Anya steps (PartySync.busy), Anya is looked up again after each area change, Malah's potion (644) is checked, and every
	// step says what happened. UNTESTED live.
	var anya, malah, i;

	if (!is_town_only)
	{
		// start at town
		Town.goToTown(5);

		// clear crystalline passage
		// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot as before. UNTESTED live.
		if (!(typeof QuickTravel === "object" && QuickTravel.portal("anya", 114)))
		{
			this.clearAndCapture(113);

			// clear frozen river
			this.clearAndCapture(114);

			if (me.area !== 114) Pather.journeyTo(114);
		}

		PartySync.busy(180000);

		// Anya, frozen: talking to her starts the quest. The walk there can stall (live 14:52:23, Barabas: three "move retry" toward 10056,6551, then
		// "Anya not found"): up to three tries, clearing the way, until she is in view
		for (i = 0, anya = null; i < 3 && !anya && !me.dead; i += 1)
		{
			try { Pather.moveToPreset(me.area, 2, 460, 0, 0, true); } catch (anyaWalkError) { print("Quester: Prison of Ice: the walk to Anya: " + anyaWalkError); }

			anya = getUnit(2, 558);

			if (!anya) Attack.clear(15);
		}

		if (!anya)
		{
			PartySync.busy(0);
			throw new Error("Prison of Ice: Anya not found");
		}

		Pather.moveToUnit(anya);
		sendPacket(1, 0x13, 4, 0x2, 4, anya.gid);
		delay(500);
		me.cancel();
		print("Quester: Prison of Ice: talked to Anya.");

		// Malah gives the thawing potion (the bot cannot use it: Anya does, see below). Live 14:55:57: one openMenu, no "Talking to Malah", no potion: talk
		// through her quest dialog with the quest NPC helper, up to three times, until the potion (644) is in the pack.
		Town.goToTown();

		for (i = 0; i < 3 && !me.getItem(644); i += 1)
		{
			this.talkToQuestNpc(NPC.Malah);
			me.cancel();
			delay(1000);
		}
		print("Quester: Prison of Ice: Malah's potion " + (me.getItem(644) ? "is in my pack." : "was NOT given."));

		// back to Anya, the potion thaws her
		Town.move("portalspot");

		if (!Pather.usePortal(114, me.name))
		{
			Pather.journeyTo(114);
		}

		Pather.moveToPreset(me.area, 2, 460);
		this.logBits(37);

		if (me.getItem(644))
		{
			QuestItems.thawAnya();
		}
		else
		{
			// the game's one potion is in a teammate's pack (Malah gives no second): the holder thaws her when near (Follower.js), wait for it here
			print("Quester: Prison of Ice: no potion for me: waiting at Anya for the teammate who holds it (up to 60 s).");

			for (i = 0; i < 60; i += 1)
			{
				anya = getUnit(2, 558);

				if (!anya || anya.mode !== 0) break;

				delay(1000);
			}
		}

		delay(1000);
		anya = getUnit(2, 558);
		print("Quester: Prison of Ice: Anya " + (anya && anya.mode === 0 ? "still looks frozen" : "is thawed") + (anya ? " (object mode " + anya.mode + ")." : " (gone)."));
		this.logBits(37);

		PartySync.busy(0);

		// go back to town
		Town.goToTown();

		// update progress
		progress = 100;
	}

	if (progress >= 50)
	{
		// Malah's reward for Anya: the Scroll of Resistance (646), which the bot reads (the user, 2026-11-14: the potion goes to Anya, then Malah gives
		// a scroll the bots can use)
		Town.goToTown(5);

		for (i = 0; i < 2 && !me.getItem(646); i += 1)
		{
			this.talkToQuestNpc(NPC.Malah);
			me.cancel();
			delay(1000);
		}

		malah = me.getItem(646);
		print("Quester: Prison of Ice: Scroll of Resistance " + (malah ? "given: reading it." : "not given."));

		if (malah)
		{
			try { QuestItems.useAll(); } catch (scrollError) { print("Quester: Prison of Ice: the scroll: " + scrollError); }
		}

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

		// Qolbot (live 2026-11-14 15:27-15:30, Darius): Pindleskin's run killed Nihlathak, then this script walked back to the Halls of Pain
		// waypoint and ran Nihlathak.js too: "Attack.kill: Target not found", and the quest retried (the team went back and forth). Now the
		// second trip happens only when he is not known dead this game; "Target not found" in the Halls of Vaught counts as dead. UNTESTED live.
		var nihlathakGone = function (e) {
			if (me.area === 124 && /Target not found/i.test(String(e))) {
				print("Quester: Betrayal of Harrogath: Nihlathak is not here: already dead.");

				return true;
			}

			throw e;
		};

		if (!this.nihlathakDead)
		{
			// run pindle script
			include('bots/Pindleskin.js');
			Config.Pindleskin.UseWaypoint = false;
			Config.Pindleskin.KillNihlathak = true;
			Config.Pindleskin.ViperQuit = true; // End script if Tomb Vipers are found.

			try { Pindleskin.call(); } catch (pindleError) { this.nihlathakDead = nihlathakGone(pindleError); }

			this.nihlathakDead = this.nihlathakDead || !!Config.Pindleskin.NihlathakKilled;
		}

		if (!this.nihlathakDead)
		{
			// get waypoint
			Pather.getWP(123); // halls of pain

			// run nilithak script
			include('bots/Nihlathak.js');
			Config.Nihlathak.ViperQuit = true; // End script if Tomb Vipers are found.

			try { Nihlathak.call(); this.nihlathakDead = true; } catch (nihlError) { this.nihlathakDead = nihlathakGone(nihlError); }
		}

		print("Quester: Betrayal of Harrogath: Nihlathak " + (this.nihlathakDead ? "is dead." : "was not killed."));
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
		// Qolbot: quick travel (a Sorceress in the party opens a portal there; Full Clear off), else on foot as before. UNTESTED live.
		if (!(typeof QuickTravel === "object" && QuickTravel.portal("ancients", 120)))
		{
			this.clearAndCapture(115);

			// clear forzen tundra
			this.clearAndCapture(117);

			// clear the ancients way
			this.clearAndCapture(118);

			// clear arreat summit
			Pather.journeyTo(120);
		}
		// Qolbot (live 2026-11-14 15:37, Darius): the altar was touched once and nothing was fought ("clear every monster" off, so clearAndCapture(120)
		// only walked), then `Pather.useUnit(2, 128, 547)` (id and area swapped) threw "Unit not found. ID: 128". Now: use the altar until it is
		// activated (object mode 2), wait for the Ancients (Talic 540, Madawc 541, Korlic 542) to wake, kill them with no party town trip in between,
		// then walk into the Worldstone Keep by its exit. UNTESTED live.
		var altar, ancient, ancientIds = [540, 541, 542], tick, round, alive;

		PartySync.busy(240000);

		try { Pather.moveToPreset(120, 2, 546, 0, 0, true); } catch (altarWalkError) { print("Quester: Rite of Passage: the walk to the altar: " + altarWalkError); }

		altar = getUnit(2, 546);

		for (round = 0; altar && altar.mode !== 2 && round < 5; round += 1)
		{
			Pather.moveToUnit(altar);
			altar.interact();
			delay(500 + me.ping);
			me.cancel();
		}

		print("Quester: Rite of Passage: the altar " + (!altar ? "was not found." : altar.mode === 2 ? "is activated." : "would not activate (mode " + altar.mode + ")."));

		for (tick = getTickCount(); getTickCount() - tick < 15000 && !getUnit(1, 542) && !getUnit(1, 541) && !getUnit(1, 540); )
		{
			delay(250);
		}

		for (round = 0; round < 6; round += 1)
		{
			alive = 0;

			for (var a = 0; a < ancientIds.length; a += 1)
			{
				ancient = getUnit(1, ancientIds[a]);

				if (ancient && ancient.hp > 0 && ancient.mode !== 0 && ancient.mode !== 12)
				{
					alive += 1;

					try { Attack.kill(ancientIds[a]); } catch (ancientError) { print("Quester: Rite of Passage: " + ancientError); }
				}
			}

			if (!alive) break;

			Attack.clear(30);
		}

		PartySync.busy(0);
		this.logBits(39);
		print("Quester: Rite of Passage: the Ancients " + (alive ? "are still alive." : "are dead."));
		me.cancel();

		if (!Pather.moveToExit(128, true)) throw new Error("Rite of Passage: cannot enter the Worldstone Keep");

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
