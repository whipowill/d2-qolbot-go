/**
*	@filename	AncientTunnels.js
*	@author		kolton
*	@desc		clear Ancient Tunnels
*/

function AncientTunnels() {
	Town.doChores();

	// a Sorceress in the party puts the team in the tunnels (Quick Travel), unless the chest or the Dark Elder in the Lost City are wanted
	if (!Config.AncientTunnels.OpenChest && !Config.AncientTunnels.KillDarkElder && typeof QuickTravel === "object" && QuickTravel.portal("at", 65)) {
		Precast.doPrecast(true);
	} else {
		Pather.useWaypoint(44);
		Precast.doPrecast(true);

		if (Config.AncientTunnels.OpenChest && Pather.moveToPreset(me.area, 2, 580) && Misc.openChests(5)) {
			Pickit.pickItems();
		}

		if (Config.AncientTunnels.KillDarkElder && getPresetUnit(me.area, 1, 751) && Pather.moveToPreset(me.area, 1, 751)) {
			Attack.clear(15, 0, getLocaleString(2886));
		}

		if (!Pather.moveToExit(65, true)) {
			throw new Error("Failed to move to Ancient Tunnels");
		}
	}

	Attack.clearLevel(Config.ClearType);

	return true;
}