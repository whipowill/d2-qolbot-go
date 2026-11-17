/**
*	@filename	ChaosSanctuary.js
*	@desc		clear the Chaos Sanctuary (Qolbot farm run, the user 2026-11-14: "add before diablo Chaos Sanctuary"). From the River of Flame waypoint into
*	            the Sanctuary and a full clear of it. The seals are not opened, so Diablo and the seal bosses are left to the Diablo run.
*	            Not tested in a game (no JS engine here).
*/

function ChaosSanctuary() {
	Town.doChores();

	// Qolbot: Quick Travel (the user, 2026-11-14): a Sorceress puts the team at the entrance (a Sorceress leader goes herself); otherwise the walk below. UNTESTED.
	if (typeof QuickTravel === "object" && QuickTravel.portal("chaos", 108)) {
		Precast.doPrecast(true);
	} else {
		Pather.useWaypoint(107); // River of Flame
		Precast.doPrecast(true);

		if (!Pather.moveToExit(108, true)) {
			throw new Error("Failed to move to the Chaos Sanctuary");
		}
	}

	Attack.clearLevel(Config.ClearType);
	Pickit.pickItems();

	return true;
}
