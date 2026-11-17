/**
*	@filename	Catacombs.js
*	@desc		clear the Catacombs, levels 2 and 3 (Qolbot gold hunts, 2026-11-13: "replace Andariel with catacombs for gold runs").
*	            It starts at the waypoint (Catacombs Level 2), clears each level the way Tombs.js clears a tomb, and goes down. Level 4 (Andariel's room) is
*	            left out (the user, 2026-11-15: "make a catacombs farm not do catacombs 4"): Andariel is her own run, and killing her here left that run with
*	            "Target not found". Not tested in a game (no JS engine here).
*/

function Catacombs() {
	var i, levels = [36]; // the way down: Level 3 (not Level 4: Andariel's own run goes there)

	Town.doChores();
	Pather.useWaypoint(35); // Catacombs Level 2
	Precast.doPrecast(true);
	Attack.clearLevel(Config.ClearType);

	for (i = 0; i < levels.length; i += 1) {
		if (!Pather.moveToExit(levels[i], true)) {
			throw new Error("Failed to move to Catacombs Level " + (levels[i] - 33));
		}

		Attack.clearLevel(Config.ClearType);
	}

	Pickit.pickItems();

	return true;
}
