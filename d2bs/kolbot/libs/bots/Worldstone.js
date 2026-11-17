/**
*	@filename	Worldstone.js
*	@author		kolton
*	@desc		Clear Worldstone levels
*	            Qolbot: Levels 2 and 1 only. Level 3, the way into Baal's Throne, is left out (the user, 2026-11-15: "make the farm world stone keep not
*	            do that level where baal is"): Baal's own run goes there. Not tested in a game (no JS engine here).
*/

function Worldstone() {
	Town.doChores();
	Pather.useWaypoint(129);
	Precast.doPrecast(true);
	Attack.clearLevel(Config.ClearType);

	if (Pather.moveToExit(128, true)) {
		Attack.clearLevel(Config.ClearType);
	}

	return true;
}