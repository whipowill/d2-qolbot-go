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
	Config.AttackSkill[1] = me.getSkill(147, 1) ? 147 : (me.getSkill(133, 1) ? 133 : 0); // Primary skill for bosses.
	Config.AttackSkill[2] = 0; // Backup/Immune skill for bosses.
	Config.AttackSkill[3] = me.getSkill(147, 1) ? 147 : (me.getSkill(133, 1) ? 133 : 0); // Primary skill for others.
	Config.AttackSkill[4] = 0; // Backup/Immune skill for others.

	Config.LowManaSkill[0] = 0; // Low mana skill.

	Config.BOSwitch = 0; // Precast weapon slot - 0 = slot I, 1 = slot II
	Config.FindItem = true; // Use Find Item skill on corpses after clearing.
	Config.FindItemSwitch = 0; // Find Item weapon slot - 0 = slot I, 1 = slot II

	Config.Dodge = false; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	// The weapon mastery: the one that already has points, else the one for the weapon in the right hand (sword when unknown). As in Whirlwind.js.
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

	Config.AutoSkill.Build = [
		[153, 1, false], // natural resistance
		[145, 1, false], // iron skin
		[141, 1, false], // stamina
		[132, 1, false], // leap
		[138, 1, false], // shout
		[155, 1, false], // battle command
		[149, 100, false], // battle orders
		[147, 100, false], // frenzy
		// 2026-11-15: no weapon mastery (attack rating) and the list ran out around level 65; the mastery as in Whirlwind.js, then resistances
		[mastery, 20, false], // weapon mastery
		[153, 10, false], // natural resistance
		[133, 100, false], // double swing (frenzy synergy)
		[138, 20, false], // shout
		[153, 20, false], // natural resistance
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