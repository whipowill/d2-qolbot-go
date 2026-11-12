/**
*	@filename	Pit.js
*	@author		kolton
*	@desc		clear Pit
*/

function Pit() {
	Town.doChores();

	// a Sorceress in the party puts the team at the way into Pit Level 1 (Quick Travel: QuickTravel.portal)
	if (typeof QuickTravel === "object" && QuickTravel.portal("pit", 12)) {
		Precast.doPrecast(true);
	} else {
		Pather.useWaypoint(6);
		Precast.doPrecast(true);

		if (!Pather.moveToExit([7, 12], true)) {
			throw new Error("Failed to move to Pit level 1");
		}
	}

	if (Config.Pit.ClearPit1) {
		Attack.clearLevel(Config.ClearType);
	}

	if (!Pather.moveToExit(16, true, Config.Pit.ClearPath)) {
		throw new Error("Failed to move to Pit level 2");
	}

	Attack.clearLevel();

	return true;
}