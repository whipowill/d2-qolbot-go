function LoadTemplate()
{
	Config.SkipImmune = ["physical"]; // "fire", "cold", "lightning", "poison", "physical", "magic"
	Config.SkipEnchant = []; // "extra strong", "extra fast", "cursed", "magic resistant", "fire enchanted", "lightning enchanted", "cold enchanted", "mana burn", "teleportation", "spectral hit", "stone skin", "multiple shots"
	Config.SkipAura = []; // "fanaticism", "might", "holy fire", "blessed aim", "holy freeze", "holy shock". Conviction is bugged, don't use it.

	// ID	Skill
	// -1	Nothing
	// 0	Attack
	// 1	Kick
	// 2	Throw
	// 126	Bash
	// 132	Leap
	// 133	Double Swing
	// 139	Stun
	// 140	Double Throw
	// 143	Leap Attack
	// 144	Concentrate
	// 147	Frenzy
	// 151	Whirlwind
	// 152	Berserk
	// 127	Sword Mastery
	// 128	Axe Mastery
	// 129	Mace Mastery
	// 134	Pole Arm Mastery
	// 135	Throwing Mastery
	// 136	Spear Mastery
	// 141	Increased Stamina
	// 145	Iron Skin
	// 148	Increased Speed
	// 153	Natural Resistance
	// 130	Howl
	// 131	Find Potion
	// 137	Taunt
	// 138	Shout
	// 142	Find Item
	// 146	Battle Cry
	// 149	Battle Orders
	// 150	Grim Ward
	// 154	War Cry
	// 155	Battle Command

	Config.AttackSkill[0] = -1; // Preattack skill.
	Config.AttackSkill[1] = me.getSkill(151, 1) ? 151 : (me.getSkill(144, 1) ? 144 : 0); // Primary skill for bosses (Concentrate until Whirlwind).
	Config.AttackSkill[2] = 0; // Backup/Immune skill for bosses.
	Config.AttackSkill[3] = me.getSkill(151, 1) ? 151 : (me.getSkill(144, 1) ? 144 : 0); // Primary skill for others (Concentrate until Whirlwind).
	Config.AttackSkill[4] = 0; // Backup/Immune skill for others.

	Config.LowManaSkill[0] = 0; // Low mana skill.

	Config.BOSwitch = 0; // Precast weapon slot - 0 = slot I, 1 = slot II
	Config.FindItem = true; // Use Find Item skill on corpses after clearing.
	Config.FindItemSwitch = 0; // Find Item weapon slot - 0 = slot I, 1 = slot II

	Config.Dodge = false; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	// The weapon mastery: the one that already has points, else the one for the weapon in the right hand (sword when unknown). Whirlwind hits with
	// the weapon, and without a mastery it missed a lot (Barabas, level 55: Whirlwind 20, Battle Command 15, no mastery, 2026-11-15).
	var mastery = (function () {
		var ids = [127, 128, 129, 134, 136], i, w, kinds = {30: 127, 28: 128, 29: 129, 31: 129, 36: 129, 34: 134, 33: 136};

		for (i = 0; i < ids.length; i += 1) {
			if (me.getSkill(ids[i], 0)) {
				return ids[i];
			}
		}

		w = me.getItem(-1, 1);

		if (w) {
			do {
				if (w.bodylocation === 4 && kinds[w.itemType]) {
					return kinds[w.itemType];
				}
			} while (w.getNext());
		}

		return 127;
	}());

	// 2026-11-15, the usual 1.13 Whirlwind Barbarian: Whirlwind, the weapon mastery and Battle Orders maxed, Natural Resistance for Nightmare and
	// Hell; Concentrate is the attack until level 30. Battle Command/Cry and Shout come last (they had 37 points before the mastery had one)
	Config.AutoSkill.Build = [
		[144, 1, false], // concentrate (level 18; with bash and stun): the attack until whirlwind
		[149, 1, false], // battle orders (level 24; with howl and shout)
		[144, 4, false], // concentrate
		[151, 20, false], // whirlwind (level 30): AutoSkill keeps points for it when it is 5 levels or less away, else they go down the list
		[mastery, 10, false], // weapon mastery: attack rating and damage
		[153, 5, false], // natural resistance (with iron skin)
		[mastery, 20, false], // weapon mastery
		[149, 20, false], // battle orders (life and mana for the whole party)
		[153, 20, false], // natural resistance
		[138, 20, false], // shout (defense; battle orders synergy)
		[155, 20, false], // battle command
	];

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	// Qolbot (the user, 2026-11-16: "for melee fighters, the stat allocation should be balanced between str, dex, and vit ... keep them equal up until str and dex
	// about 180, then all other points go to vit"; "balanced each allocation"): every point goes to the lowest of the three, one at a time (the targets go up by one:
	// strength, dexterity and vitality each to 21, each to 22, ... to 180), then all the rest into vitality. Energy gets nothing.
	Config.AutoStat.Build = [];

	for (var statTarget = 21; statTarget <= 180; statTarget += 1) {
		Config.AutoStat.Build.push(["s", statTarget], ["d", statTarget], ["v", statTarget]);
	}

	Config.AutoStat.Build.push(["v", "all"]);
}