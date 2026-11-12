// Druid / Fury (Werewolf): Stays in werewolf form; Fury is the attack, Feral Rage and Lycanthropy keep life up, Heart of Wolverine buffs damage; Grizzly tanks. Strength scales Fury.
// Generated for the QOL bot auto-spec (internal/spec). Skill order = AutoSkill, stats = AutoStat. Edit freely.
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
	Config.AttackSkill[1] = me.getSkill(248, 1) ? 248 : 0; // Primary skill to bosses.
	Config.AttackSkill[2] = -1; // Primary untimed skill to bosses. Keep at -1 if Config.AttackSkill[1] is untimed skill.
	Config.AttackSkill[3] = me.getSkill(248, 1) ? 248 : 0; // Primary skill to others.
	Config.AttackSkill[4] = -1; // Primary untimed skill to others. Keep at -1 if Config.AttackSkill[3] is untimed skill.
	Config.AttackSkill[5] = 0; // Secondary skill if monster is immune to primary.
	Config.AttackSkill[6] = -1; // Secondary untimed skill if monster is immune to primary untimed.

	Config.LowManaSkill[0] = -1; // Timed low mana skill.
	Config.LowManaSkill[1] = -1; // Untimed low mana skill.

	Config.Wereform = "Werewolf"; // 0 / false - don't shapeshift, 1 / "Werewolf" - change to werewolf, 2 / "Werebear" - change to werebear

	Config.SummonRaven = false;
	Config.SummonSpiritWolf = false;
	Config.SummonDireWolf = false;
	Config.SummonGrizzly = true;
	Config.SummonSpirit = "Heart of Wolverine"; // 0 = disabled, 1 / "Oak Sage", 2 / "Heart of Wolverine", 3 / "Spirit of Barbs"
	Config.SummonVine = 0; // 0 = disabled, 1 / "Poison Creeper", 2 / "Carrion Vine", 3 / "Solar Creeper"

	Config.Dodge = true; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		[223, 1, false], // werewolf
		[224, 1, false], // lycanthropy
		[232, 1, false], // feral rage
		[238, 1, false], // rabies
		[248, 1, false], // fury
		[236, 1, false], // heart of wolverine
		[247, 1, false], // summon grizzly
		[228, 1, false], // werebear
		[233, 1, false], // maul
		[223, 20, false], // werewolf
		[224, 20, false], // lycanthropy
		[248, 20, false], // fury
		[232, 20, false], // feral rage
		[236, 20, false], // heart of wolverine
		[237, 5, false], // dire wolf (boosts grizzly)
	];;

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	Config.AutoStat.Build = [
		["s", 60], // strength
		["v", 60], // vitality
		["d", 50], // dexterity for gear
		["s", 150], // strength: scales Fury damage
		["v", 120], // vitality
		["d", 80], // dexterity for attack rating
		["s", 250], // strength
		["v", "all"], // rest into vitality
	];
};