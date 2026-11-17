/**
*	@filename	Hephasto.js
*	@author		kolton
*	@desc		kill Hephasto the Armorer
*/

function Hephasto() {
	Town.doChores();

	// Qolbot: Quick Travel (the user, 2026-11-14): a Sorceress puts the team at the place (a Sorceress leader goes herself); otherwise the walk below. UNTESTED.
	if (typeof QuickTravel === "object" && QuickTravel.portal("hephasto", 107)) {
		Precast.doPrecast(true);
	} else {
		Pather.useWaypoint(107);
		Precast.doPrecast(true);
	}

	if (!Pather.moveToPreset(me.area, 2, 376)) {
		throw new Error("Failed to move to Hephasto");
	}

	Attack.kill(getLocaleString(1067)); // Hephasto The Armorer
	Pickit.pickItems();

	return true;
}