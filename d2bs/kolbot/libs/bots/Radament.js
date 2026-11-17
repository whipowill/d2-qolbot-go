/**
*	@filename	Radament.js
*	@author		kolton
*	@desc		kill Radament
*/

function Radament() {
	Town.doChores();

	// Qolbot: Quick Travel (the user, 2026-11-14): a Sorceress puts the team at the place (a Sorceress leader goes herself); otherwise the walk below. UNTESTED.
	if (typeof QuickTravel === "object" && QuickTravel.portal("radament", 49)) {
		Precast.doPrecast(true);
	} else {
		Pather.useWaypoint(48);
		Precast.doPrecast(true);

		if (!Pather.moveToExit(49, true)) {
			throw new Error("Failed to move to Radament");
		}
	}

	if (!Pather.moveToPreset(me.area, 2, 355)) {
		throw new Error("Failed to move to Radament");
	}

	return Radament.kill();
}

// The fight itself, once the bot stands at Radament (by foot, or through a Sorceress's portal: Quester)
Radament.kill = function () {
	//Attack.kill(229); // Radament
	Attack.clear(20); // focusing only on radament gets you killed

	// Qolbot: then Radament himself, by name: the clear only covers 20 yards, and nothing said whether he died (live 21:49:48: the run ended 3 s after
	// the team came, with no "Killed Radament"). Attack.kill logs the kill. UNTESTED.
	var rada = getUnit(1, 229);

	if (rada && !rada.dead) {
		try {
			Attack.kill(229); // Radament
		} catch (radaError) {
			print("Radament: " + radaError);
		}
	} else {
		print("Radament: " + (rada ? "dead" : "not in sight") + " after the clear");
	}

	Pickit.pickItems();
	Attack.openChests(20);

	return true;
};