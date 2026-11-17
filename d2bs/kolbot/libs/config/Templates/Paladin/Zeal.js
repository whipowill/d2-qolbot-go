function LoadTemplate()
{
	Config.SkipImmune = []; // "fire", "cold", "lightning", "poison", "physical", "magic"
	Config.SkipEnchant = []; // "extra strong", "extra fast", "cursed", "magic resistant", "fire enchanted", "lightning enchanted", "cold enchanted", "mana burn", "teleportation", "spectral hit", "stone skin", "multiple shots"
	Config.SkipAura = []; // "fanaticism", "might", "holy fire", "blessed aim", "holy freeze", "holy shock". Conviction is bugged, don't use it.

	// ID	Skill
	// -1	Nothing
	// 0	Attack
	// 1	Kick
	// 2	Throw
	// 96	Sacrifice
	// 97	Smite
	// 101	Holy Bolt
	// 106	Zeal
	// 107	Charge
	// 111	Vengeance
	// 112	Blessed Hammer
	// 116	Conversion
	// 117	Holy Shield
	// 121	Fist of the Heavens
	// 98	Might
	// 102	Holy Fire
	// 103	Thorns
	// 108	Blessed Aim
	// 113	Concentration
	// 114	Holy Freeze
	// 118	Holy Shock
	// 119	Sanctuary
	// 122	Fanaticism
	// 123	Conviction
	// 99	Prayer
	// 100	Resist Fire
	// 104	Defiance
	// 105	Resist Cold
	// 109	Cleansing
	// 110	Resist Lightning
	// 115	Vigor
	// 120	Meditation
	// 124	Redemption
	// 125	Salvation

	Config.AttackSkill[0] = -1; // Preattack skill.
	// Zeal on bosses too (2026-11-15): Smite is one hit with the weapon's damage, Zeal is up to five with Fanaticism's speed
	Config.AttackSkill[1] = me.getSkill(106, 1) ? 106 : (me.getSkill(97, 1) ? 97 : 0); // Primary skill to bosses.
	Config.AttackSkill[2] = me.getSkill(122, 1) ? 122 : 98; // Primary aura to bosses
	Config.AttackSkill[3] = me.getSkill(106, 1) ? 106 : 0; // Primary skill to others.
	Config.AttackSkill[4] = me.getSkill(122, 1) ? 122 : 98; // Primary aura to others.
	Config.AttackSkill[5] = 0; // Secondary skill if monster is immune to primary.
	Config.AttackSkill[6] = -1; // Secondary aura.

	Config.LowManaSkill[0] = 0; // Low mana skill.
	Config.LowManaSkill[1] = -1; // Low mana aura.

	Config.AvoidDolls = false; // Try to attack Soul Killers from a greater distance with hammerdins.
	Config.Vigor = false; // Swith to Vigor when running
	Config.Charge = false; // Use Charge when running
	Config.Redemption = [50, 50]; // Switch to Redemption after clearing an area if under designated life or mana. Format: [lifepercent, manapercent]

	Config.Dodge = false; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		// 2026-11-15, the usual 1.13 Zealot: Fanaticism, Zeal and Holy Shield maxed (Zeal has no synergies in 1.13, so Sacrifice and Smite get
		// none). Might is the aura until Fanaticism at 30; the rest goes to Resist Lightning, whose passive bonus counts when another aura is on.
		// It had 10 then 100 points for Smite, a one-hit skill the build did not need
		[106, 1, false], // zeal (level 12; with sacrifice)
		[98, 4, false], // might: the aura until fanaticism
		[106, 6, false], // zeal
		[117, 1, false], // holy shield (level 24; with smite, charge, holy bolt, blessed aim, blessed hammer)
		[122, 20, false], // fanaticism (level 30; with concentration)
		[106, 20, false], // zeal
		[117, 20, false], // holy shield (block, defense)
		[110, 20, false], // resist lightning (Nightmare and Hell lightning)
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