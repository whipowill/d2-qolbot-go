/**
*	@filename	Andariel.js
*	@author		kolton
*	@desc		kill Andariel
*/

function Andariel() {
	Town.doChores();

	// a Sorceress in the party (Quests tab) puts the team at the way into Catacombs Level 4: no walk from the waypoint
	if (typeof QuickTravel === "object" && QuickTravel.portal("andy", 37)) {
		Precast.doPrecast(true);

		return Andariel.kill();
	}

	Pather.useWaypoint(35);
	Precast.doPrecast(true);

	if (!Pather.moveToExit([36, 37], true)) {
		throw new Error("Failed to move to Catacombs Level 4");
	}

	return Andariel.kill();
}

// Kill her from the way into Catacombs Level 4, wherever the bot came from (the walk above, or a Sorceress's portal: Quester.js).
Andariel.kill = function () {
	Pather.moveTo(22549, 9520);

	if (me.classid === 1 && me.gametype === 0) {
		Andariel.killWithCasts();
	} else {
		Attack.kill(156); // Andariel
	}

	delay(2000); // Wait for minions to die.
	Pickit.pickItems();

	return true;
};

Andariel.killWithCasts = function () {
	var i,
		target = getUnit(1, 156);

	if (!target) {
		throw new Error("Andariel not found.");
	}

	if (Config.MFLeader) {
		Pather.makePortal();
		say("kill " + 156);
	}

	for (i = 0; i < 300; i += 1) {
		ClassAttack.doCast(target, Config.AttackSkill[1], Config.AttackSkill[2]);

		if (target.dead) {
			return true;
		}

		if (getDistance(me, target) <= 10) {
			Pather.moveTo(me.x > 22548 ? 22535 : 22560, 9520);
		}
	}

	return target.dead;
};
