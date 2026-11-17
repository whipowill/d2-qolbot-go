/**
*	@filename	Gear.js
*	@desc		AUTO-EQUIP BY BUILD (the user, 2026-11-15: "perfect the autoequip such that it includes the appropriate weapon types and it's sensitive
*	            to the spec of the character"; "a paladin can play as either a melee or a magic build"). What a piece of gear is worth to THIS
*	            character, from the build Qolbot chose for it (data/<profile>.spec.json: class and spec), not from its class alone.
*
*	            pickit/Autoequip/gear.nip has one line, "[tier] == qolgear.tier(item)": the NIP parser lowercases its lines, so the name is
*	            lowercase. Item.autoEquip (Misc.js) puts on what scores higher than what is worn; 0 means "not for this build" (a bow for a
*	            Zealot, a shield for a Bowazon, a two-handed weapon for a build that fights with a shield).
*
*	            A build says:
*	              style   melee (weapon damage, attack speed, leech), ranged (the same, for a bow or javelins), kick (the boots' kick damage,
*	                      not the weapon's), caster (cast rate, mana) or summon (a caster whose minions fight: skills count most)
*	              tabs    the skill trees it uses (stat 188 "+N to <tree> skills" counts for these only)
*	              skills  its skills, the main one first (stat 107 "+N to <skill>" and 97, the same skill from an item of another class)
*	              weapons the weapon types it fights with (item types), hands: "one" (one-handed weapon and a shield), "two" (two-handed weapon,
*	                      nothing in the other hand), "any" (either: a two-handed weapon must beat the weapon and the shield together) or "dual"
*	                      (a one-handed weapon in each hand: Frenzy, Double Throw); dualOk: the left hand may also hold a second weapon
*	                      instead of a shield, whichever scores higher; noShield: never a shield (the user, 2026-11-15: "a barbarian wouldn't
*	                      hold a sheild", "a barb might choose a 2H weapon"): a Whirlwind Barbarian holds a two-handed weapon, or one in each
*	                      hand, whichever scores higher (a two-handed one must beat both one-handed ones together: Item.handSlot)
*	            A Barbarian fighting with Whirlwind or Frenzy uses the weapon kind of the mastery he has points in (Axe Mastery: axes), so the
*	            gear never takes away what his points give.
*
*	            Every score uses the same pieces, so they can be compared across slots: resistances 100 per point (all four together: all
*	            resistances counted four times), the build's skills, its stats, then defense for armor. UNTESTED in a game; simulated.
*/

include("common/Plan.js");

var qolgear = {
	// item types (ItemTypes.txt)
	T: {shield: 2, armor: 3, ring: 10, amulet: 12, boots: 15, gloves: 16, belt: 19, scepter: 24, wand: 25, staff: 26, bow: 27, axe: 28, club: 29,
		sword: 30, hammer: 31, knife: 32, spear: 33, polearm: 34, crossbow: 35, mace: 36, helm: 37, throwknife: 42, throwaxe: 43, javelin: 44,
		claw: 67, orb: 68, voodoo: 69, auric: 70, primal: 71, pelt: 72, circlet: 75, amabow: 85, amaspear: 86, amajav: 87, claw2: 88},

	// the class an item type belongs to (only that class can wear it)
	classOf: {67: 6, 88: 6, 68: 1, 69: 2, 70: 3, 71: 4, 72: 5, 85: 0, 86: 0, 87: 0},

	melee1h: [24, 28, 29, 30, 31, 32, 36],         // one-handed melee kinds (a two-handed one of these is told by its damage)
	melee2h: [26, 33, 34],                         // staves, spears, polearms: two-handed only
	throwing: [42, 43, 44],

	// "Class/Spec" -> the build (the Templates folder has one file for each)
	builds: {
		"Amazon/Bowazon": {style: "ranged", tabs: [0, 1], skills: [26, 22, 12, 9, 33, 32], weapons: [27, 85, 35], hands: "two"},
		// Amazon bows (85) and javelins (87) are the Amazon's own kinds. Not her spears (86): Lightning Fury, the Javazon's main attack, is thrown,
		// so it needs a javelin in hand (no template is a spear-melee Amazon)
		"Amazon/Javazon": {style: "ranged", tabs: [2, 1], skills: [24, 35, 14, 34, 20], weapons: [44, 87], hands: "one"},
		"Assassin/Kick": {style: "kick", tabs: [50, 49], skills: [255, 270, 267, 278, 258], weapons: [67, 88, 32], hands: "one"},
		"Assassin/Trapsin": {style: "caster", tabs: [48, 49], skills: [271, 276, 251, 261, 267], weapons: [67, 88, 32], hands: "one"},
		"Barbarian/Whirlwind": {style: "melee", tabs: [32, 33, 34], skills: [151, 149, 155, 138], weapons: "mastery", hands: "any", dualOk: true, noShield: true},
		"Barbarian/Frenzy": {style: "melee", tabs: [32, 33, 34], skills: [147, 133, 149, 155], weapons: "mastery", hands: "dual"},
		"Barbarian/Throw": {style: "ranged", tabs: [32, 33, 34], skills: [140, 135, 149], weapons: [42, 43, 44], hands: "dual"},
		"Druid/Fury": {style: "melee", tabs: [41, 40], skills: [248, 223, 224, 232, 247], weapons: [24, 28, 29, 30, 31, 32, 36, 26, 33, 34], hands: "any"},
		"Druid/Fire": {style: "caster", tabs: [42, 41], skills: [244, 249, 229, 225, 234], weapons: [24, 25, 29, 30, 31, 32, 36, 26, 28], hands: "any"},
		"Druid/Wind": {style: "caster", tabs: [42, 40], skills: [245, 250, 240, 235, 247], weapons: [24, 25, 29, 30, 31, 32, 36, 26, 28], hands: "any"},
		"Druid/Summon": {style: "summon", tabs: [40, 41], skills: [247, 237, 227, 226, 236, 246, 228], weapons: [24, 25, 29, 30, 31, 32, 36, 26, 28], hands: "any"},
		"Necromancer/Summon": {style: "summon", tabs: [18, 16], skills: [70, 69, 80, 95, 75, 66], weapons: [25, 32, 24, 29, 30, 36], hands: "one"},
		"Necromancer/Bone": {style: "caster", tabs: [17, 16], skills: [84, 93, 67, 88, 78], weapons: [25, 32, 24, 29, 30, 36], hands: "one"},
		"Necromancer/PoisonNova": {style: "caster", tabs: [17, 16], skills: [92, 83, 73, 91], weapons: [25, 32, 24, 29, 30, 36], hands: "one"},
		"Paladin/Zeal": {style: "melee", tabs: [24, 25, 26], skills: [106, 122, 117, 113], weapons: [24, 28, 29, 30, 31, 32, 36], hands: "one"},
		"Paladin/Smiter": {style: "melee", tabs: [24, 25, 26], skills: [97, 122, 117, 113], weapons: [24, 28, 29, 30, 31, 32, 36], hands: "one", shieldDamage: true},
		"Paladin/Hammerdin": {style: "caster", tabs: [24, 25, 26], skills: [112, 113, 117, 120, 115], weapons: [24, 25, 28, 29, 30, 31, 32, 36], hands: "one"},
		"Sorceress/Blizzard": {style: "caster", tabs: [10], skills: [59, 55, 45, 65], weapons: [68, 26, 25, 24, 29, 30, 31, 32, 36], hands: "any"},
		"Sorceress/FrozenOrb": {style: "caster", tabs: [10], skills: [64, 65, 59], weapons: [68, 26, 25, 24, 29, 30, 31, 32, 36], hands: "any"},
		"Sorceress/Lightning": {style: "caster", tabs: [9], skills: [49, 53, 63, 48], weapons: [68, 26, 25, 24, 29, 30, 31, 32, 36], hands: "any"},
		"Sorceress/Meteor": {style: "caster", tabs: [8], skills: [56, 47, 61, 62], weapons: [68, 26, 25, 24, 29, 30, 31, 32, 36], hands: "any"},
		"Sorceress/Meteorb": {style: "caster", tabs: [8, 10], skills: [56, 64, 61, 65], weapons: [68, 26, 25, 24, 29, 30, 31, 32, 36], hands: "any"}
	},

	// no plan (a bot run by hand): by class, as the old caster.nip / melee.nip did
	byClass: {
		0: {style: "ranged", tabs: [0, 1, 2], skills: [], weapons: [27, 85, 35, 44, 87, 86, 33], hands: "any"}, // build unknown: her spears too
		1: {style: "caster", tabs: [8, 9, 10], skills: [], weapons: [68, 26, 25, 24, 29, 30, 31, 32, 36], hands: "any"},
		2: {style: "caster", tabs: [16, 17, 18], skills: [], weapons: [25, 32, 24, 29, 30, 36], hands: "one"},
		3: {style: "melee", tabs: [24, 25, 26], skills: [], weapons: [24, 28, 29, 30, 31, 32, 36], hands: "one"},
		4: {style: "melee", tabs: [32, 33, 34], skills: [], weapons: "mastery", hands: "any", dualOk: true, noShield: true},
		5: {style: "caster", tabs: [40, 41, 42], skills: [], weapons: [24, 25, 29, 30, 31, 32, 36, 26, 28], hands: "any"},
		6: {style: "kick", tabs: [48, 49, 50], skills: [], weapons: [67, 88, 32], hands: "one"}
	},

	// what each style is after: points per % or per point (res 100 per point is the yardstick)
	weights: {
		melee: {all: 1000, cls: 800, tab: 500, main: 400, skill: 200, ias: 30, fcr: 0, leech: 100, mleech: 40, cb: 15, ds: 15, ow: 10, ar: 0.5, ed: 4, maxdmg: 3, mindmg: 2, weapon: 1, str: 6, dex: 6, vit: 10, enr: 0, life: 10, mana: 0, fhr: 8, block: 10},
		ranged: {all: 1000, cls: 800, tab: 500, main: 400, skill: 200, ias: 30, fcr: 0, leech: 100, mleech: 40, cb: 10, ds: 15, ow: 0, ar: 0.5, ed: 4, maxdmg: 3, mindmg: 2, weapon: 1, str: 4, dex: 8, vit: 10, enr: 0, life: 10, mana: 0, fhr: 8, block: 10},
		kick: {all: 1000, cls: 800, tab: 600, main: 500, skill: 200, ias: 30, fcr: 0, leech: 100, mleech: 40, cb: 15, ds: 15, ow: 10, ar: 0.5, ed: 0, maxdmg: 3, mindmg: 2, weapon: 0, str: 8, dex: 6, vit: 10, enr: 0, life: 10, mana: 0, fhr: 8, block: 10, kick: 30},
		caster: {all: 1500, cls: 1000, tab: 700, main: 500, skill: 250, ias: 0, fcr: 25, leech: 0, mleech: 0, cb: 0, ds: 0, ow: 0, ar: 0, ed: 0, maxdmg: 0, mindmg: 0, weapon: 0, str: 3, dex: 3, vit: 10, enr: 3, life: 10, mana: 2, fhr: 8, block: 8},
		summon: {all: 1500, cls: 1000, tab: 800, main: 500, skill: 300, ias: 0, fcr: 12, leech: 0, mleech: 0, cb: 0, ds: 0, ow: 0, ar: 0, ed: 0, maxdmg: 0, mindmg: 0, weapon: 0, str: 3, dex: 3, vit: 10, enr: 2, life: 10, mana: 2, fhr: 10, block: 8}
	},

	// the Barbarian's mastery: the one with hard points (the most), as the item types it covers; none yet: every melee kind
	masteryTypes: function () {
		var m = [[127, [30]], [128, [28]], [129, [29, 31, 36]], [134, [34]], [136, [33]]], best = null, pts = 0, i, n;

		for (i = 0; i < m.length; i += 1) {
			n = me.getSkill(m[i][0], 0) || 0;

			if (n > pts) {
				pts = n;
				best = m[i][1];
			}
		}

		return best || [24, 28, 29, 30, 31, 32, 36, 33, 34];
	},

	// the build of this character (read once per script; Plan.get caches the file)
	build: function () {
		var plan = null, b;

		try {
			plan = Plan.get();
		} catch (planError) { /* no plan: by class */ }

		b = (plan && plan.class && plan.spec && this.builds[plan.class + "/" + plan.spec]) || this.byClass[me.classid] || this.byClass[3];

		if (b.weapons === "mastery") {
			b = {style: b.style, tabs: b.tabs, skills: b.skills, hands: b.hands, dualOk: b.dualOk, noShield: b.noShield, shieldDamage: b.shieldDamage, weapons: this.masteryTypes()};
		}

		return b;
	},

	isWeapon: function (t) {
		return [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 42, 43, 44, 67, 68, 85, 86, 87, 88].indexOf(t) > -1;
	},

	isShield: function (t) {
		return t === 2 || t === 69 || t === 70;
	},

	// a weapon that needs both hands (a Barbarian holds the one-or-two-handed swords in one)
	twoHanded: function (item) {
		var t = item.itemType;

		if ([26, 27, 33, 34, 35, 85, 86].indexOf(t) > -1) {
			return true;
		}

		if (this.melee1h.indexOf(t) < 0) {
			return false;
		}

		return item.getStat(23) > 0 && !(me.classid === 4 && item.getStat(21) > 0);
	},

	// "one", "two", "any" or "dual"
	hands: function () {
		return this.build().hands;
	},

	// does this build fight with a weapon in each hand? (Item.getBodyLoc lets a one-handed weapon into the left hand)
	dual: function (item) {
		var b = this.build();

		return (b.hands === "dual" || !!b.dualOk) && this.isWeapon(item.itemType) && !this.twoHanded(item) && b.weapons.indexOf(item.itemType) > -1;
	},

	sum: function (item, ids) {
		var i, n = 0;

		for (i = 0; i < ids.length; i += 1) {
			n += item.getStatEx(ids[i]) || 0;
		}

		return n;
	},

	// what the item is worth to this build; 0: not for it
	tier: function (item) {
		var b, w, t = item.itemType, s = 0, i, weapon, two;

		try {
			b = this.build();
			w = this.weights[b.style] || this.weights.melee;

			if (this.classOf.hasOwnProperty(t) && this.classOf[t] !== me.classid) {
				return 0; // another class's gear
			}

			if (item.getFlag(0x400000) && !item.getStat(152)) {
				return 0; // ethereal: cannot be repaired, it breaks
			}

			weapon = this.isWeapon(t);
			two = weapon && this.twoHanded(item);

			if (weapon && (b.weapons.indexOf(t) < 0 || (two && (b.hands === "one" || b.hands === "dual")) || (!two && b.hands === "two"))) {
				return 0; // not the build's weapon
			}

			if (this.isShield(t) && (b.hands === "two" || b.hands === "dual" || b.noShield)) {
				return 0; // the build has no hand free for a shield
			}

			if (!weapon && !this.isShield(t) && [3, 10, 12, 15, 16, 19, 37, 71, 72, 75].indexOf(t) < 0) {
				return 0; // not gear (charms, potions, quivers ...)
			}

			// resistances (all resistances counted four times, as the old lists did)
			s += (this.sum(item, [39, 41, 43, 45]) + (item.getStatEx(555) || 0) * 4) * 100;

			// skills: all, class, the build's trees, the build's own skills (the main one more)
			s += (item.getStatEx(127) || 0) * w.all + (item.getStatEx(83, me.classid) || 0) * w.cls;

			for (i = 0; i < b.tabs.length; i += 1) {
				s += (item.getStatEx(188, b.tabs[i]) || 0) * w.tab;
			}

			for (i = 0; i < b.skills.length; i += 1) {
				s += ((item.getStatEx(107, b.skills[i]) || 0) + (item.getStatEx(97, b.skills[i]) || 0)) * (i === 0 ? w.main : w.skill);
			}

			// the build's stats
			s += (item.getStatEx(93) || 0) * w.ias + (item.getStatEx(105) || 0) * w.fcr + (item.getStatEx(60) || 0) * w.leech + (item.getStatEx(62) || 0) * w.mleech +
				(item.getStatEx(136) || 0) * w.cb + (item.getStatEx(141) || 0) * w.ds + (item.getStatEx(135) || 0) * w.ow + (item.getStatEx(99) || 0) * w.fhr +
				(item.getStatEx(0) || 0) * w.str + (item.getStatEx(2) || 0) * w.dex + (item.getStatEx(3) || 0) * w.vit + (item.getStatEx(1) || 0) * w.enr +
				(item.getStatEx(7) || 0) * w.life + (item.getStatEx(9) || 0) * w.mana;

			if (weapon) {
				// the weapon's own damage (one or two hands) times its enhanced damage, and its attack rating
				s += (two && item.getStat(23) > 0 ? item.getStat(23) + item.getStat(24) : item.getStat(21) + item.getStat(22)) * (100 + (item.getStatEx(18) || 0)) / 2 * w.weapon +
					(item.getStatEx(18) || 0) * w.ed + (item.getStatEx(19) || 0) * w.ar;
			} else {
				// +damage on jewelry and armor, and defense on armor (defense counts as 1, for the sturdier of two pieces)
				s += (item.getStatEx(22) || 0) * w.maxdmg + (item.getStatEx(21) || 0) * w.mindmg + (item.getStatEx(19) || 0) * w.ar;

				if ([10, 12].indexOf(t) < 0) {
					s += item.getStatEx(31) || 0;
				}
			}

			if (this.isShield(t)) {
				s += (item.getStatEx(20) || 0) * w.block; // chance to block

				if (b.shieldDamage) {
					s += (item.getStat(21) + item.getStat(22)) * 50; // Smite hits with the shield
				}
			}

			if (t === 15) {
				s += (item.getStatEx(96) || 0) * 10; // run/walk speed

				if (w.kick) {
					s += ((item.getStat(21) || 0) + (item.getStat(22) || 0) + (item.getStatEx(137) || 0) * 2) * w.kick; // kick damage: Dragon Talon kicks with the boots
				}
			}

			return Math.max(1, Math.round(s)); // anything the build can wear beats an empty slot
		} catch (gearError) {
			return 0;
		}
	}
};
