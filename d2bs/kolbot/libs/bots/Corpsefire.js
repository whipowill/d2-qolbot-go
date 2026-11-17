/**
*	@filename	Corpsefire.js
*	@author		kolton
*	@desc		kill Corpsefire and optionally clear Den of Evil
*/

function Corpsefire() {
	Town.doChores();

	// Qolbot: Quick Travel (the user, 2026-11-14): a Sorceress puts the team at the place (a Sorceress leader goes herself); otherwise the walk below. UNTESTED.
	if (typeof QuickTravel === "object" && QuickTravel.portal("corpsefire", 8)) {
		Precast.doPrecast(true);
	} else {
		Pather.useWaypoint(3);
		Precast.doPrecast(true);

		if (!Pather.moveToExit([2, 8], true)) {
			throw new Error("Failed to move to Corpsefire");
		}
	}

	if (!Pather.moveToPreset(me.area, 1, 774, 0, 0, false, true)) {
		throw new Error("Failed to move to Corpsefire");
	}

	// Qolbot: Corpsefire first, then the rest of the den. Clearing the den first kills him on the way, and then looking for him throws "Corpsefire not found"
	// after the quest work is done (the Den of Evil attempt failed with it).
	// a team mate may have killed him already: with Quick Travel the leader goes through her portal last (live 21:32:57: "Corpsefire not found", Xena had
	// killed him at 21:32:23)
	try {
		Attack.clear(15, 0, getLocaleString(3319)); // Corpsefire
	} catch (corpsefireError) {
		if (String(corpsefireError).indexOf("not found") === -1) {
			throw corpsefireError;
		}

		print("Corpsefire: not here (already killed by the team)");
	}

	if (Config.Corpsefire.ClearDen) {
		Attack.clearLevel();
	}

	return true;
}