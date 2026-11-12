/**
*	@filename	Chores.js
*	@desc		Decides whether a trip through the town chores is worth making (heal, repair, potions, scrolls, identify, stash, quest NPCs,
*				points, equipment), and how many potions this character needs. The chores themselves are Town.doChores.
*/

include("common/Throttle.js");

var Chores = {
	// Works out how many potions this character needs from the belt it wears and its level, so nothing is configured by
	// hand: a bare level-2 character (a 1-row belt, or none) carries spares in the inventory, and a big belt is only
	// refilled when it is half empty, so the bot does not walk to the potion seller for nothing.
	tune: function () {
		var rows = Storage.BeltSize(), hp, mp;

		Config.MinColumn[0] = Config.MinColumn[1] = Math.max(1, Math.ceil(rows / 2));
		hp = rows <= 1 ? 4 : (rows === 2 ? 2 : 0); // spares in the inventory while the belt is tiny
		mp = me.classid === 1 || me.classid === 2 || me.classid === 5 ? 1 : 0; // casters also want a spare mana potion
		mp = rows <= 1 ? Math.max(mp, 2) : (rows === 2 ? Math.max(mp, 1) : 0);
		Config.HPBuffer = hp;
		Config.MPBuffer = mp;
		Config.PotionGold = me.charlvl < 15 ? 100 : 1000; // low levels have little gold and potions are cheap
		if (Throttle.due("potreport", 600000)) {
			print("Chores: potions: belt " + rows + " row(s), buy when a column is below " + Config.MinColumn[0] + ", spares in inventory hp " + hp + " mp " + mp + ", needs " + Config.PotionGold + " gold");
		}
	},

	// Does a potion belt column or the potion buffer need topping up? (the same test Town.buyPotions starts with)
	needPotions: function () {
		var i, pot, beltSize = Storage.BeltSize(), col = Town.checkColumns(beltSize), buffer = {hp: 0, mp: 0};

		for (i = 0; i < 4; i += 1) {
			if (["hp", "mp"].indexOf(Config.BeltColumn[i]) > -1 && col[i] > (beltSize - Math.min(Config.MinColumn[i], beltSize))) {
				return true;
			}
		}

		if (Config.HPBuffer > 0 || Config.MPBuffer > 0) {
			pot = me.getItem(-1, 0);

			if (pot) {
				do {
					if (pot.location === 3) {
						buffer.hp += pot.itemType === 76 ? 1 : 0;
						buffer.mp += pot.itemType === 77 ? 1 : 0;
					}
				} while (pot.getNext());
			}

			return buffer.hp < Config.HPBuffer || buffer.mp < Config.MPBuffer;
		}

		return false;
	},

	// Why a trip through the town chores is worth making right now. The first visit of a game does everything once;
	// after that only what is actually needed, so the bot does not walk around town for nothing. Any check that fails
	// counts as "needed" (doing too much is safer than skipping something).
	needed: function (first) {
		var reasons = [], checks, i, items, it;

		try { this.tune(); } catch (tuneError) { print("Chores: tune: " + tuneError); }

		if (first) {
			return ["first visit"];
		}

		checks = [
			["heal", function () { return Town.needHealing(); }],
			["repair", function () { var r = Town.needRepair(); return !!(r && r.length); }],
			["revive mercenary", function () { return Town.needMerc(); }],
			["stash", function () { return Town.needStash(); }],
			["town portal scrolls", function () { return me.gold >= 450 && Town.checkScrolls(518) < 13; }],
			["identify", function () { return !!Town.getUnids(); }],
			["quest NPC", function () { return typeof Quester === "object" && Quester.questNpcPending(true); }],
			["potions", function () { return me.gold >= (Config.PotionGold || 1000) && Chores.needPotions(); }],
			["spend points", function () { return me.getStat(5) > 0 || me.getStat(4) > 0; }],
			["equip", function () {
				items = me.findItems(-1, 0) || [];

				for (it = 0; it < items.length; it += 1) {
					if (Item.autoEquipCheck(items[it]) || Item.autoMercEquipCheck(items[it])) {
						return true;
					}
				}

				return false;
			}]
		];

		for (i = 0; i < checks.length; i += 1) {
			try {
				if (checks[i][1]()) {
					reasons.push(checks[i][0]);
				}
			} catch (e) {
				reasons.push(checks[i][0] + "?");
			}
		}

		return reasons;
	}
};
