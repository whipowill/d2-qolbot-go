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
	// 221	Raven
	// 222	Plague Poppy
	// 226	Oak Sage
	// 227	Summon Spirit Wolf
	// 231	Cycle of Life
	// 236	Heart of Wolverine
	// 237	Summon Fenris
	// 241	Vines
	// 246	Spirit of Barbs
	// 247	Summon Grizzly
	// 223	Wearwolf
	// 224	Shape Shifting
	// 228	Wearbear
	// 232	Feral Rage
	// 233	Maul
	// 238	Rabies
	// 239	Fire Claws
	// 242	Hunger
	// 243	Shock Wave
	// 248	Fury
	// ID	Skill
	// 225	Firestorm
	// 229	Molten Boulder
	// 230	Arctic Blast
	// 234	Eruption
	// 235	Cyclone Armor
	// 240	Twister
	// 244	Volcano
	// 245	Tornado
	// 249	Armageddon
	// 250	Hurricane

	Config.AttackSkill[0] = -1; // Preattack skill.
	// 500 = pure summoner (Attacks/Druid.js): stand off 15 units while the summons fight, never walk up and hit (it was 0, the plain Attack)
	Config.AttackSkill[1] = 500; // Primary skill to bosses.
	Config.AttackSkill[2] = -1; // Primary untimed skill to bosses. Keep at -1 if Config.AttackSkill[1] is untimed skill.
	Config.AttackSkill[3] = 500; // Primary skill to others.
	Config.AttackSkill[4] = -1; // Primary untimed skill to others. Keep at -1 if Config.AttackSkill[3] is untimed skill.
	Config.AttackSkill[5] = -1; // Secondary skill if monster is immune to primary.
	Config.AttackSkill[6] = -1; // Secondary untimed skill if monster is immune to primary untimed.

	Config.LowManaSkill[0] = -1; // Timed low mana skill.
	Config.LowManaSkill[1] = -1; // Untimed low mana skill.

	Config.Wereform = "Werebear"; // 0 / false - don't shapeshift, 1 / "Werewolf" - change to werewolf, 2 / "Werebear" - change to werebear

	// Summoners do not fight: they stay in bear form, a long way from the action, and just try to survive.
	Config.FollowNoFight = true; // no clearing monsters on their own (the follower script)
	Config.FollowDistance = 18; // stand about this far from the leader

	Config.SummonRaven = false;
	Config.SummonSpiritWolf = true;
	Config.SummonDireWolf = true;
	Config.SummonGrizzly = true;
	Config.SummonSpirit = "Oak Sage"; // 0 = disabled, 1 / "Oak Sage", 2 / "Heart of Wolverine", 3 / "Spirit of Barbs"
	Config.SummonVine = "Carrion Vine"; // 0 = disabled, 1 / "Poison Creeper", 2 / "Carrion Vine", 3 / "Solar Creeper"

	Config.Dodge = true; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		// Qolbot (the user, 2026-11-16: "on a summon druid build, wearbear only needs one and lycanthropy one, then max out the summon skills (not ravens), then max
		// out lycanthropy"). AutoSkill adds the missing prerequisites itself, one point each: Raven (for the Spirit Wolf), Werewolf (for Lycanthropy), the Spirit
		// Wolf and Oak Sage (for the Dire Wolf), the Dire Wolf (for the Grizzly): Raven stays at 1.
		[228, 1, false], // werebear
		[224, 1, false], // lycanthropy
		[247, 20, false], // summon grizzly
		[237, 20, false], // summon dire wolf
		[227, 20, false], // summon spirit wolf
		[236, 20, false], // heart of wolverine (the user: "i would choose HOTW instead of Oak Sage"); oak sage (226) only gets its one prerequisite point
		[224, 20, false], // lycanthropy, with what is left
	];

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	// Qolbot (the user, 2026-11-16: "summon druid and summon necro you would balance str and vit until about 180, then go all vit"): every point goes to the lower
	// of strength and vitality, one at a time (the targets go up by one: each to 21, each to 22, ... to 180), then all the rest into vitality. No dexterity, no energy.
	Config.AutoStat.Build = [];

	for (var statTarget = 21; statTarget <= 180; statTarget += 1) {
		Config.AutoStat.Build.push(["s", statTarget], ["v", statTarget]);
	}

	Config.AutoStat.Build.push(["v", "all"]);
};