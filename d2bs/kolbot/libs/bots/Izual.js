/**
*	@filename	Izual.js
*	@author		kolton
*	@desc		kill Izual
*/

function Izual() {
	Town.doChores();

	// Qolbot: Quick Travel (the user, 2026-11-14): a Sorceress puts the team at the place (a Sorceress leader goes herself); otherwise the walk below. UNTESTED.
	if (typeof QuickTravel === "object" && QuickTravel.portal("izual", 105)) {
		Precast.doPrecast(true);
	} else {
		Pather.useWaypoint(106);
		Precast.doPrecast(true);
	}

	if (!Pather.moveToPreset(105, 1, 256)) {
		throw new Error("Failed to move to Izual.");
	}

	Attack.kill(256); // Izual
	Pickit.pickItems();

	return true;
}