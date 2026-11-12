// Druid / Fire (Fissure): Armageddon before the fight; Fissure then Firestorm as the attacks; Molten Boulder and Volcano (physical) for fire-immune monsters.
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

	Config.AttackSkill[0] = me.getSkill(244, 1) ? 244 : -1; // Preattack skill.
	Config.AttackSkill[1] = me.getSkill(249, 1) ? 249 : -1; // Primary skill to bosses.
	Config.AttackSkill[2] = me.getSkill(234, 1) ? 234 : me.getSkill(225, 1) ? 225 : 0; // Primary untimed skill to bosses. Keep at -1 if Config.AttackSkill[1] is untimed skill.
	Config.AttackSkill[3] = me.getSkill(225, 1) ? 225 : -1; // Primary skill to others.
	Config.AttackSkill[4] = me.getSkill(234, 1) ? 234 : me.getSkill(225, 1) ? 225 : 0; // Primary untimed skill to others. Keep at -1 if Config.AttackSkill[3] is untimed skill.
	Config.AttackSkill[5] = me.getSkill(225, 1) ? 225 : -1; // Secondary skill if monster is immune to primary.
	Config.AttackSkill[6] = me.getSkill(229, 1) ? 229 : 0; // Secondary untimed skill if monster is immune to primary untimed.

	Config.LowManaSkill[0] = -1; // Timed low mana skill.
	Config.LowManaSkill[1] = -1; // Untimed low mana skill.

	Config.Wereform = 0; // 0 / false - don't shapeshift, 1 / "Werewolf" - change to werewolf, 2 / "Werebear" - change to werebear

	Config.SummonRaven = false;
	Config.SummonSpiritWolf = true;
	Config.SummonDireWolf = true;
	Config.SummonGrizzly = true;
	Config.SummonSpirit = "Oak Sage"; // 0 = disabled, 1 / "Oak Sage", 2 / "Heart of Wolverine", 3 / "Spirit of Barbs"
	Config.SummonVine = 0; // 0 = disabled, 1 / "Poison Creeper", 2 / "Carrion Vine", 3 / "Solar Creeper"

	Config.Dodge = true; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		[225, 1, false], // firestorm
		[229, 1, false], // molten boulder
		[234, 1, false], // fissure
		[244, 1, false], // volcano
		[249, 1, false], // armageddon
		[247, 1, false], // summon grizzly
		[237, 1, false], // summon dire wolf
		[227, 1, false], // summon spirit wolf
		[234, 20, false], // fissure
		[225, 20, false], // firestorm
		[244, 20, false], // volcano
		[229, 20, false], // molten boulder
		[249, 20, false], // armageddon
		[226, 20, false], // oak sage
	];;

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	Config.AutoStat.Build = [
		["s", 30], // strength for gear
		["v", 40], // vitality
		["d", 30], // dexterity
		["v", 60], // vitality
		["s", 60], // strength
		["v", 90], // vitality
		["d", 60], // dexterity
		["s", 90], // strength
		["v", 120], // vitality
		["d", 90], // dexterity
		["v", "all"], // rest into vitality
	];
};