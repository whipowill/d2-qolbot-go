/**
*	@filename	Mausoleum.js
*	@author		kolton
*	@desc		kill Blood Raven (Qolbot: the Mausoleum and the Crypt are not cleared)
*/

function Mausoleum() {
	// Qolbot: the Blood Raven farm run (the user, 2026-11-14: "the blood raven farm doesn't really need to clear masoleum or crypt"): Blood Raven
	// and nothing else. Kolbot's version cleared the Mausoleum and only killed her when Config.Mausoleum.KillBloodRaven was on, which it is not by
	// default, so the run never fought her. The quest (Sisters' Burial Grounds) has its own script and does not use this one. UNTESTED.
	Town.doChores();

	// Qolbot: Quick Travel (the user, 2026-11-14): a Sorceress puts the team at the place (a Sorceress leader goes herself); otherwise the walk below. UNTESTED.
	if (typeof QuickTravel === "object" && QuickTravel.portal("bloodraven", 17)) {
		Precast.doPrecast(true);
	} else {
		Pather.useWaypoint(3);
		Precast.doPrecast(true);

		if (!Pather.moveToExit(17, true)) {
			throw new Error("Failed to move to Burial Grounds");
		}
	}

	if (!Pather.moveToPreset(17, 1, 805)) {
		throw new Error("Failed to move to Blood Raven");
	}

	Attack.kill(getLocaleString(3111)); // Blood Raven
	Pickit.pickItems();

	return true;
}
