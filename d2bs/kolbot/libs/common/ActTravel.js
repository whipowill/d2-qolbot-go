/**
*	@filename	ActTravel.js
*	@desc		Getting from one act's town to the next, the way a player does: through the act's NPC (Warriv, Meshif, Tyrael ...). A waypoint only lists
*	            acts this character has already visited, so the first trip up (the act boss was just killed) needs the NPC. Used by the Follower
*	            (a leader in another act) and by the Quester (the leader moving on to the next act).
*/

var ActTravel = {
	change: function (act) {
		var npc, preArea, target;

		preArea = me.area;

		// The leader does not leave this town for the next act before the team is ready (the user, 2026-11-16: "the leader shouldn't have left the town if the team wasn't ready"):
		// the NPC route never went through the town gate. A follower is not held (the gate is the leader's). UNTESTED in a game.
		if (me.inTown && typeof Team === "object" && Team.waitToLeaveTown) {
			try { Team.waitToLeaveTown({1: 1, 2: 40, 3: 75, 4: 103, 5: 109}[act]); } catch (actGateError) { print("Team: " + actGateError); }
		}

		switch (act) {
		case 2:
			if (me.area >= 40) {
				break;
			}

			Town.move("warriv");

			npc = getUnit(1, 155);

			if (npc) {
				npc.openMenu();
				Misc.useMenu(0x0D36);
			}

			break;
		case 3:
			if (me.area >= 75) {
				break;
			}

			Town.move("palace");

			npc = getUnit(1, 201);

			if (npc) {
				npc.openMenu();
				me.cancel();
			}

			Town.move("meshif");

			npc = getUnit(1, 210);

			if (npc) {
				npc.openMenu();
				Misc.useMenu(0x0D38);
			}

			break;
		case 4:
			if (me.area >= 103) {
				break;
			}

			if (me.inTown) {
				Town.move("cain");

				npc = getUnit(1, 245);

				if (npc) {
					npc.openMenu();
					me.cancel();
				}

				Town.move("portalspot");
				Pather.usePortal(102, null);
			}

			delay(1500);

			target = getUnit(2, 342);

			if (target) {
				Pather.moveTo(target.x - 3, target.y - 1);
			}

			Pather.usePortal(null);

			break;
		case 5:
			if (me.area >= 109) {
				break;
			}

			Town.move("tyrael");

			npc = getUnit(1, "tyrael");

			if (npc) {
				npc.openMenu();
				me.cancel();

				try {
					Pather.useUnit(2, 566, 109);
				} catch (a5e) {

				}
			}

			break;
		}

		delay(2000);

		while (!me.area) {
			delay(500);
		}

		if (me.area === preArea) {
			me.cancel();
			Town.move("portalspot");
			if (typeof Speech === "object") { Speech.problem("Act change failed."); }

			return false;
		}

		Town.move("portalspot");
		//say("Act change successful.");

		if (act === 2) {
			//say("Don't forget to talk to Drognan after getting the Viper Amulet!");
		}

		if (act === 3) {
			//say("Don't forget to talk to Hratli before getting the Gidbinn!");
		}

		return true;
	},

	// Get to the town of `act`: by waypoint if the character has been there, else through the NPC (going up only). Returns true when there.
	go: function (act) {
		// Going UP an act always goes through the act's NPC (Warriv, Meshif, Tyrael ...), even when the waypoint would do: talking to him is what the game wants
		// done (it opens the act and completes the quest of the act's boss for that character), so every bot gets it. Going back down uses the waypoint.
		// Qolbot (UNTESTED in a game): a character that has already been to that act (its "able to go to Act N" bit is set) takes the waypoint: the NPC
		// route is for the first trip up and failed for all four followers after a restart ("Act change failed", 2026-11-14 11:00: they start in the act they
		// last saved in, the leader may be an act above).
		if (act > me.act && Pather.accessToAct(act)) {
			try {
				Town.goToTown(act);
			} catch (waypointUpError) {
				print("ActTravel: the waypoint to act " + act + " failed (" + waypointUpError + "), trying the NPC");
				me.cancel();
			}

			if (me.act === act) {
				if (me.inTown) {
					Town.move("portalspot");
				}

				return true;
			}
		}

		if (act > me.act) {
			try {
				if (!me.inTown) {
					Town.goToTown(); // the town of the act I am in
				}

				// One act at a time: each NPC only takes you to the next act (a bot in act 1 asked for act 3 used to look for
				// Meshif in act 1 and failed every time: every follower log 2026-11-12/13).
				while (me.act < act) {
					if (!this.change(me.act + 1)) {
						break;
					}
				}
			} catch (npcError) {
				print("ActTravel: the trip to act " + act + " through its NPC failed (" + npcError + ")");
				me.cancel();
				me.cancel();
			}

			if (me.inTown) {
				Town.move("portalspot");
			}

			if (me.act !== act) {
				print("ActTravel: still in act " + me.act + " after trying to reach act " + act);
			}

			return me.act === act;
		}

		try {
			Town.goToTown(act);
		} catch (wpError) {
			print("ActTravel: waypoint to act " + act + " failed (" + wpError + ")");
			me.cancel();
			me.cancel();

			if (act > me.act) {
				this.change(act);
			}
		}

		if (me.inTown) {
			Town.move("portalspot");
		}

		if (me.act !== act) {
			print("ActTravel: still in act " + me.act + " after trying to reach act " + act);
		}

		return me.act === act;
	}
};
