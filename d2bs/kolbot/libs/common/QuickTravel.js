/**
*	@filename	QuickTravel.js
*	@desc		Quick Travel: a Sorceress in the party teleports to a boss, opens a portal and takes it to town, and the team takes the portal instead of
*				walking. "portal <place>" in chat (no name) is the Follower command that sends her; every bot works out the same Sorceress
*				(Team.chosenSorc). The Quick Travel setting (Settings, Behavior) switches it on for both modes; Quest mode also needs Full Clear off.
*				The boss scripts (Countess.js, Andariel.js, ...) and the quests ask QuickTravel.portal and walk when it says no.
*/

include("common/Plan.js");
include("common/Report.js");
include("common/Team.js");

var QuickTravel = {

	noPortal: {}, // place -> the Sorceress gave no portal there this game: walk, do not ask again

	// what portals I can see right now, for the log: "Meir>25 d12, Vanity>1 d3" (owner > the area it leads to, distance); the evidence when a portal is not found
	portalsInView: function () {
		var out = [], portal = getUnit(2, "portal");

		if (portal) {
			do {
				out.push((portal.getParent() || "red") + ">" + portal.objtype + " d" + Math.round(getDistance(me, portal)));
			} while (portal.getNext());
		}

		return out.length ? out.join(", ") : "none";
	},

	// The name of the Sorceress whose Teleport the team may use, or null. It needs the Quick Travel setting (Settings, Behavior) and a Sorceress that
	// Qolbot started in the game. Farm mode then always uses her; Quest mode only when Full Clear is off. A leader that can teleport itself
	// needs nobody. Which Sorceress is Team.chosenSorc: the same one in every bot.
	sorc: function () {
		var plan = Plan.get(), sorc;

		if (!plan || !plan.teleportTeam) {
			return null; // the Quick Travel setting (Settings, Behavior) is the master switch, for both modes
		}

		if (!(plan.goal === "Farm" || (plan.goal === "Quest" && plan.questClearAll === false))) {
			return null; // Quest mode with Full Clear on: every zone is cleared on foot
		}

		if (me.classid === 1 && me.getSkill(54, 1)) {
			return null; // this bot teleports itself
		}

		sorc = Team.chosenSorc();

		return sorc && sorc !== me.name ? sorc : null;
	},

	// Ask the Sorceress for a portal to a boss (the Follower chat command "portal <place>", no name: the chosen Sorceress teleports there, opens a
	// portal and takes it to town) and take it. True when this bot stands in `area` afterwards. False, and nothing lost, when the option is off, no Sorceress is in the
	// game, she does not answer in time or the portal cannot be used: the caller then walks as it always did.
	// area: where the portal comes out (a number, or a list of areas that are all right: Duriel's tomb is one of seven); act: the act of that
	// place, when area does not say it.
	portal: function (place, area, act) {
		var sorc = this.noPortal[place] ? null : this.sorc(), said = "", listener, waited, attempt,
			areas = typeof area === "number" ? [area] : (area || []);

		act = act || (areas[0] <= 39 ? 1 : (areas[0] <= 74 ? 2 : (areas[0] <= 102 ? 3 : (areas[0] <= 108 ? 4 : 5))));

		if (!sorc) {
			return false;
		}

		// Her portal comes out in the town of the boss's act: be there, not in whatever town (or field) I am in now.
		try {
			if (!me.inTown || me.act !== act) {
				Town.goToTown(act);
			}
		} catch (townError) {
			this.log("cannot go to town to meet " + sorc + ": " + townError);

			return false;
		}

		listener = function (nick, msg) {
			if (nick === sorc) {
				said = msg; // her last words
			}
		};
		addEventListener("chatmsg", listener);
		this.log("asking " + sorc + " for a portal to " + place);
		say("portal " + place);

		for (waited = 0; waited < 300 && said !== "Portal is open." && said !== "No such place." && said !== "I could not get there." && said !== "I am not able to travel quickly."; waited += 1) {
			delay(500);
		}

		removeEventListener("chatmsg", listener);

		if (said !== "Portal is open.") {
			this.log(sorc + " gave no portal to " + place + " (" + (said || "no answer in 150 seconds") + "): walking instead");
			this.noPortal[place] = true; // not asked again this game

			return false;
		}

		delay(1500); // let the portal show

		// Her portal opens where she arrived in town, which may be out of sight from where I stand: go to the portal spot first and ask for HER portal
		// by name (usePortal then also walks to the spot on its retries). It stays open, so keep looking for about 20 seconds before giving up.
		for (attempt = 0; attempt < 8 && areas.indexOf(me.area) === -1; attempt += 1) {
			try {
				Town.move("portalspot");
				this.log("portals in view: " + this.portalsInView());
				Pather.usePortal(typeof area === "number" ? area : null, sorc);
			} catch (portalError) {
				this.log("could not take " + sorc + "'s portal: " + portalError);
			}

			if (areas.indexOf(me.area) === -1 && me.area !== 0) {
				delay(2500); // a portal that is still opening, or one that is not there yet: look again
			}
		}

		if (areas.indexOf(me.area) === -1) {
			this.log("not in the right place after " + sorc + "'s portal (area " + me.area + "): walking instead");
			this.noPortal[place] = true;

			return false;
		}

		this.log("took " + sorc + "'s portal to " + place);

		return true;
	}
};

Report.mixin(QuickTravel, "QuickTravel"); // QuickTravel.log / note / problem, written under its own name
