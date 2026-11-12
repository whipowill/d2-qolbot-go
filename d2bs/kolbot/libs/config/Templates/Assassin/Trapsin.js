// Assassin / Lightning and Death Sentry (Trapsin): Does not attack directly: lays Lightning Sentries (and Death Sentries) at the fight; Fire Blast for lightning immunes; Fade and Burst of Speed for survival.
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
	// 251	Fire Trauma
	// 256	Shock Field
	// 257	Blade Sentinel
	// 261	Charged Bolt Sentry
	// 262	Wake of Fire Sentry
	// 266	Blade Fury
	// 271	Lightning Sentry
	// 272	Inferno Sentry
	// 276	Death Sentry
	// 277	Blade Shield
	// 252	Claw Mastery
	// 253	Psychic Hammer
	// 258	Quickness
	// 263	Weapon Block
	// 264	Cloak of Shadows
	// 267	Fade
	// 268	Shadow Warrior
	// 273	Mind Blast
	// 278	Venom
	// 279	Shadow Master
	// 254	Tiger Strike
	// 255	Dragon Talon
	// 259	Fists of Fire
	// 260	Dragon Claw
	// 265	Cobra Strike
	// 269	Claws of Thunder
	// 270	Dragon Tail
	// 274	Blades of Ice
	// 275	Dragon Flight
	// 280	Royal Strike

	Config.AttackSkill[0] = -1; // Preattack skill.
	Config.AttackSkill[1] = 0; // Primary skill to bosses.
	Config.AttackSkill[2] = -1; // Primary untimed skill to bosses. Keep at -1 if Config.AttackSkill[1] is untimed skill.
	Config.AttackSkill[3] = 0; // Primary skill to others.
	Config.AttackSkill[4] = -1; // Primary untimed skill to others. Keep at -1 if Config.AttackSkill[3] is untimed skill.
	Config.AttackSkill[5] = 0; // Secondary skill if monster is immune to primary.
	Config.AttackSkill[6] = -1; // Secondary untimed skill if monster is immune to primary untimed.

	Config.LowManaSkill[0] = 0; // Timed low mana skill.
	Config.LowManaSkill[1] = 0; // Untimed low mana skill.

	Config.UseTraps = true; // Set to true to use traps
	Config.Traps = [271, 271, 271, 276, 276]; // Skill IDs for traps to be cast on all mosters except act bosses.
	Config.BossTraps = [271, 271, 271, 271, 271]; // Skill IDs for traps to be cast on act bosses.

	Config.SummonShadow = 0; // 0 = don't summon, 1 or "Warrior" = summon Shadow Warrior, 2 or "Master" = summon Shadow Master
	Config.UseFade = true; // Set to true to use Fade prebuff.
	Config.UseBoS = true; // Set to true to use Burst of Speed prebuff. TODO: Casting in town + UseFade compatibility
	Config.UseVenom = false; // Set to true to use Venom prebuff. Set to false if you don't have the skill and have Arachnid Mesh - it will cause connection drop otherwise.
	Config.UseCloakofShadows = true; // Set to true to use Cloak of Shadows while fighting. Useful for blinding regular monsters/minions.
	
	Config.Dodge = true; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		[271, 1, false], // lightning sentry
		[261, 1, false], // charged bolt sentry
		[256, 1, false], // shock web
		[276, 1, false], // death sentry
		[251, 1, false], // fire blast
		[258, 1, false], // burst of speed
		[267, 1, false], // fade
		[273, 1, false], // mind blast
		[264, 1, false], // cloak of shadows
		[271, 20, false], // lightning sentry
		[256, 20, false], // shock web
		[261, 20, false], // charged bolt sentry
		[276, 20, false], // death sentry
		[251, 20, false], // fire blast
	];

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	Config.AutoStat.Build = [
		["s", 30], // strength for gear
		["v", 50], // vitality
		["d", 30], // dexterity for gear
		["v", 80], // vitality
		["s", 60], // strength
		["v", 120], // vitality
		["d", 60], // dexterity
		["s", 100], // strength for gear
		["v", "all"], // rest into vitality (energy stays low)
	];
}