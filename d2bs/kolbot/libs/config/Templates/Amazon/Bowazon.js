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
	// 6	Magic Arrow
	// 7	Fire Arrow
	// 11	Cold Arrow
	// 12	Multiple Shot
	// 16	Exploding Arrow
	// 21	Ice Arrow
	// 22	Guided Arrow
	// 26	Strafe
	// 27	Immolation Arrow
	// 31	Freezing Arrow
	// 8	Inner Sight
	// 9	Critical Strike
	// 13	Dodge
	// 17	Slow Missiles
	// 18	Avoid
	// 23	Penetrate
	// 28	Dopplezon
	// 29	Evade
	// 32	Valkyrie
	// 33	Pierce
	// 10	Jab
	// 14	Power Strike
	// 15	Poison Javelin
	// 19	Impale
	// 20	Lightning Bolt
	// 24	Charged Strike
	// 25	Plague Javelin
	// 30	Fend
	// 34	Lightning Strike
	// 35	Lightning Fury

	Config.AttackSkill[0] = -1; // Preattack skill.
	Config.AttackSkill[1] = me.getSkill(22, 1) ? 22 : 0; // Primary skill to bosses.
	Config.AttackSkill[2] = -1; // Primary untimed skill to bosses. Keep at -1 if Config.AttackSkill[1] is untimed skill.
	Config.AttackSkill[3] = me.getSkill(26, 1) ? 26 : (me.getSkill(12, 1) ? 12 : 0); // Primary skill to others.
	Config.AttackSkill[4] = -1; // Primary untimed skill to others. Keep at -1 if Config.AttackSkill[3] is untimed skill.
	Config.AttackSkill[5] = 0; // Secondary skill if monster is immune to primary.
	Config.AttackSkill[6] = 0; // Secondary untimed skill if monster is immune to primary untimed.

	Config.LowManaSkill[0] = 0; // Timed low mana skill.
	Config.LowManaSkill[1] = 0; // Untimed low mana skill.

	Config.LightningFuryDelay = 0; // Lightning fury interval in seconds. LF is treated as timed skill.
	Config.SummonValkyrie = true; // Summon Valkyrie

	Config.Dodge = false; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		// 2026-11-15, the usual 1.13 physical Bowazon: Multiple Shot until Strafe (24), Strafe and Guided Arrow maxed, Critical Strike early (it
		// doubles damage), Valkyrie as the tank, Pierce. The old list began with Strafe (level 24) and Guided Arrow, and the passives came last
		[12, 1, false], // multiple shot (level 6; with magic arrow)
		[9, 5, false], // critical strike
		[12, 6, false], // multiple shot: the attack until strafe
		[22, 1, false], // guided arrow (level 18; with cold arrow)
		[26, 20, false], // strafe (level 24)
		[22, 20, false], // guided arrow (bosses)
		[32, 1, false], // valkyrie (level 30; with inner sight, slow missiles, decoy, dodge, avoid, evade)
		[33, 10, false], // pierce (level 30; with penetrate)
		[9, 15, false], // critical strike
		[32, 10, false], // valkyrie
		[33, 20, false], // pierce
		[9, 20, false], // critical strike
		[23, 20, false], // penetrate
	];

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	// Qolbot (the user, 2026-11-16: "ranged melee" follows the melee rules, and "bowazons still need str to be able to wear good gear"): strength, dexterity and
	// vitality equal, one point at a time, until strength and dexterity reach 180, then all the rest into vitality. Energy gets nothing.
	Config.AutoStat.Build = [];

	for (var statTarget = 21; statTarget <= 180; statTarget += 1) {
		Config.AutoStat.Build.push(["s", statTarget], ["d", statTarget], ["v", statTarget]);
	}

	Config.AutoStat.Build.push(["v", "all"]);
}