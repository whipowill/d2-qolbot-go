/**
*	@filename	Tristram.js
*	@author		kolton, cuss
*	@desc		clear Tristram
*/

function Tristram() {
	var tree, scroll, akara, stones, gibbet;

	if (!me.getQuest(4, 4) && !me.getItem(525)) {
		if (!me.getItem(524)) {
			// print("We need Scroll of Inifuss");
			Town.doChores();
			Pather.useWaypoint(5);
			Precast.doPrecast(true);

			if (!Pather.moveToPreset(me.area, 2, 30, 5, 5)) {
				throw new Error("Failed to move to Tree of Inifuss");
			}

			tree = getUnit(2, 30);

			Misc.openChest(tree);
			delay(300);

			scroll = getUnit(4, 524);

			Pickit.pickItem(scroll);
			Town.goToTown();
		}

		// print("We need Key to the Cairn Stones");
		Town.move("akara");

		akara = getUnit(1, "akara");

		akara.openMenu();
		me.cancel();
	}

	Town.doChores();
	Pather.useWaypoint(4);
	Precast.doPrecast(true);

	if (!Pather.moveToPreset(me.area, 1, 737, 0, 0, false, true)) {
		throw new Error("Failed to move to Rakanishu");
	}

	if (!me.getQuest(4, 4)) {
		stones = [getUnit(2, 17), getUnit(2, 18), getUnit(2, 19), getUnit(2, 20), getUnit(2, 21)];
	}

	//Attack.clear(15, 0, getLocaleString(2872)); // Rakanishu (error if he is already dead)
	Attack.clear(20);

	// Qolbot: the stone loop ends when every stone is open too, or after 60 s, and pauses each round; the portal loop gives up after 60 s. Live 19:06 on
	// Nightmare: Darius stood at the stones for 2.5 minutes without a log line until the stuck guard ended the game (a loop with no exit and no delay).
	var stoneTick = getTickCount(), portalTick;

	while (!me.getQuest(4, 4) && getTickCount() - stoneTick < 60000) {
		if (stones.every(function (stone) { return !stone || stone.mode; })) {
			break; // all open (the quest flag may come later, or never for this character): the portal is next
		}

		stones.forEach(function (stone) {
			if (stone && !stone.mode) {
				Attack.securePosition(stone.x, stone.y, 10, me.ping * 2);
				Misc.click(0, 0, stone);
			}
		});
		delay(250);
	}

	print("Tristram: stones " + (me.getQuest(4, 4) ? "done (quest flag)" : "open: " + stones.filter(function (stone) { return stone && stone.mode; }).length + " of " + stones.length));
	portalTick = getTickCount();

	while (!Pather.usePortal(38)) {
		if (getTickCount() - portalTick > 60000) {
			throw new Error("Tristram: no portal to Tristram after 60 s at the Cairn Stones");
		}

		Attack.securePosition(me.x, me.y, 10, 1000);
	}

	Pather.moveTo(me.x, me.y + 6);

	if (Config.Tristram.PortalLeech) {
		Pather.makePortal();
		delay(1000);
	}

	gibbet = getUnit(2, 26);

	if (!gibbet.mode) {
		if (!Pather.moveToPreset(me.area, 2, 26, 0, 0, true, true)) {
			throw new Error("Failed to move to Cain's Gibbet");
		}

		Misc.openChest(gibbet);
	}

	if (Config.Tristram.PortalLeech) {
		Attack.clearLevel(0);
	} else {
		Attack.clearLevel(Config.ClearType);
	}

	return true;
}