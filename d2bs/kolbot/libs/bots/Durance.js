/**
*	@filename	Durance.js
*	@desc		clear the Durance of Hate, Levels 1 and 2 (Qolbot farm run, the user 2026-11-14: "add to act 3 durance of hate"). From the waypoint in
*	            Level 2: up to Level 1 and clear it, back down to Level 2 and clear it. Level 3 (Mephisto's) is left out (the user, 2026-11-15: "make
*	            durance of hate farm not do durance of hate level 3"): Mephisto's own run goes there. Not tested in a game (no JS engine here).
*/

function Durance() {
	Town.doChores();
	// a Sorceress in the party puts the team at the Level 2 waypoint (Quick Travel): followers without that waypoint come through her portal
	if (!(typeof QuickTravel === "object" && QuickTravel.portal("durance", 101))) {
		Pather.toDurance(); // Durance of Hate Level 2: its waypoint, or without it from Travincal (the waypoint taken on the way)
	}

	Precast.doPrecast(true);

	if (Pather.moveToExit(100, true)) { // Level 1
		Attack.clearLevel(Config.ClearType);

		if (!Pather.moveToExit(101, true)) {
			throw new Error("Failed to move back to Durance of Hate Level 2");
		}
	}

	Attack.clearLevel(Config.ClearType);
	Pickit.pickItems();

	return true;
}
