/**
*	@filename	Countess.js
*	@author		kolton
*	@desc		kill The Countess and optionally kill Ghosts along the way
*/

function Countess() {
	Town.doChores();

	// a Sorceress in the party (Quests tab) puts the team at the way into Tower Cellar Level 5: no walk from the waypoint
	if (typeof QuickTravel === "object" && QuickTravel.portal("countess", 25)) {
		Precast.doPrecast(true);

		return Countess.kill();
	}

	Pather.useWaypoint(6);
	Precast.doPrecast(true);

	if (!Pather.moveToExit([20, 21, 22, 23, 24, 25], true)) {
		throw new Error("Failed to move to Countess");
	}

	return Countess.kill();
}

// Kill her from the way into Tower Cellar Level 5, wherever the bot came from (the walk above, or a Sorceress's portal: Quester.js).
Countess.kill = function () {
	var poi = getPresetUnit(me.area, 2, 580);

	if (!poi) {
		throw new Error("Failed to move to Countess (preset not found)");
	}

	switch (poi.roomx * 5 + poi.x) {
	case 12565:
		Pather.moveTo(12578, 11043);
		break;
	case 12526:
		Pather.moveTo(12548, 11083);
		break;
	}

	Attack.clear(20, 0, getLocaleString(2875)); // The Countess

	if (Config.OpenChests) {
		Misc.openChestsInArea();
	}

	return true;
};
