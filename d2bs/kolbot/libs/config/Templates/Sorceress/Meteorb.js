// Sorceress / Meteor + Frozen Orb (Meteorb): Meteor and Frozen Orb together; Fire and Cold Mastery both raised; Fire Ball and Ice Bolt are prerequisites/synergies; Teleport at 1.
// Generated for the QOL bot auto-spec (internal/spec). Skill order = AutoSkill, stats = AutoStat. Edit freely.
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
	// 36	Fire Bolt
	// 37	Warmth
	// 41	Inferno
	// 46	Blaze
	// 47	Fire Ball
	// 51	Fire Wall
	// 52	Enchant
	// 56	Meteor
	// 61	Fire Mastery
	// 62	Hydra
	// 38	Charged Bolt
	// 42	Static Field
	// 43	Telekinesis
	// 48	Nova
	// 49	Lightning
	// 53	Chain Lightning
	// 54	Teleport
	// 57	Thunder Storm
	// 58	Energy Shield
	// 63	Lightning Mastery
	// 39	Ice Bolt
	// 40	Frozen Armor
	// 44	Frost Nova
	// 45	Ice Blast
	// 50	Shiver Armor
	// 55	Glacial Spike
	// 59	Blizzard
	// 60	Chilling Armor
	// 64	Frozen Orb
	// 65	Cold Mastery

	Config.AttackSkill[0] = -1; // Preattack skill.
	Config.AttackSkill[1] = me.getSkill(56, 1) ? 56 : me.getSkill(64, 1) ? 64 : 0; // Primary skill to bosses.
	Config.AttackSkill[2] = me.getSkill(64, 1) ? 64 : me.getSkill(47, 1) ? 47 : 0; // Primary untimed skill to bosses. Keep at -1 if Config.AttackSkill[1] is untimed skill.
	Config.AttackSkill[3] = me.getSkill(56, 1) ? 56 : me.getSkill(64, 1) ? 64 : 0; // Primary skill to others.
	Config.AttackSkill[4] = me.getSkill(64, 1) ? 64 : me.getSkill(47, 1) ? 47 : 0; // Primary untimed skill to others. Keep at -1 if Config.AttackSkill[3] is untimed skill.
	Config.AttackSkill[5] = me.getSkill(64, 1) ? 64 : -1; // Secondary skill if monster is immune to primary. (2026-11-15: -1, not 0: a Sorceress does not punch)
	Config.AttackSkill[6] = -1; // Secondary untimed skill if monster is immune to primary untimed.
	Config.ClearPath = false; // means don't use teleport

	Config.LowManaSkill[0] = -1; // Timed low mana skill.
	Config.LowManaSkill[1] = -1; // Untimed low mana skill.

	Config.CastStatic = 100; // Cast static until the target is at designated life percent. 100 = disabled.
	Config.StaticList = []; // List of monster NAMES or CLASSIDS to static. Example: Config.StaticList = ["Andariel", 243];

	Config.Dodge = true; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		[47, 1, false], // fire ball
		[54, 1, false], // teleport
		[56, 1, false], // meteor
		[64, 1, false], // frozen orb
		[61, 1, false], // fire mastery
		[65, 1, false], // cold mastery
		[56, 20, false], // meteor
		[64, 20, false], // frozen orb
		[61, 20, false], // fire mastery
		[65, 20, false], // cold mastery
		[47, 20, false], // fire ball
		[58, 20, false], // energy shield
	];

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	// Qolbot (the user, 2026-11-16: the casters, "equal str/eng/vit until 180"): strength, energy and vitality equal, one point at a time (the targets go up by one:
	// each to 21, each to 22, ... to 180), then all the rest into vitality. Dexterity gets nothing. (The order before: vitality first, strength up to 95-100, and
	// energy only for the Hammerdin, 30.)
	Config.AutoStat.Build = [];

	for (var statTarget = 21; statTarget <= 180; statTarget += 1) {
		Config.AutoStat.Build.push(["s", statTarget], ["e", statTarget], ["v", statTarget]);
	}

	Config.AutoStat.Build.push(["v", "all"]);
}