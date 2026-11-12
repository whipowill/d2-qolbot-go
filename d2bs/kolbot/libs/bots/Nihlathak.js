/**
*	@filename	Nihlathak.js
*	@author		kolton
*	@desc		kill Nihlathak
*/

function Nihlathak() {
	Town.doChores();

	// a Sorceress in the party puts the team at the way into the Halls of Vaught (Quick Travel)
	if (typeof QuickTravel === "object" && QuickTravel.portal("halls", 124)) {
		Precast.doPrecast(false);
	} else {
		Pather.useWaypoint(123);
		Precast.doPrecast(false);

		if (!Pather.moveToExit(124, true)) {
			throw new Error("Failed to go to Nihlathak");
		}
	}

	Pather.moveToPreset(me.area, 2, 462, 0, 0, false, true);

	if (Config.Nihlathak.ViperQuit && getUnit(1, 597)) {
		print("Tomb Vipers found.");

		return true;
	}

	Attack.kill(526); // Nihlathak
	Pickit.pickItems();

	return true;
}