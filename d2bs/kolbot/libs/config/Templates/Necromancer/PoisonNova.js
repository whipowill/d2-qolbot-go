// Necromancer / Poison Nova: Poison Nova is the main attack; Poison Dagger and Poison Explosion are synergies; Poison Explosion also used on corpses.
// Generated for the QOL bot auto-spec (internal/spec). Skill order = AutoSkill, stats = AutoStat. Edit freely.
function LoadTemplate()
{
	Config.SkipImmune = []; // "fire", "cold", "lightning", "poison", "physical", "magic"
	Config.SkipEnchant = []; // "extra strong", "extra fast", "cursed", "magic resistant", "fire enchanted", "lightning enchanted", "cold enchanted", "mana burn", "teleportation", "spectral hit", "stone skin", "multiple shots"
	Config.SkipAura = []; // "fanaticism", "might", "holy fire", "blessed aim", "holy freeze", "holy shock". Conviction is bugged, don't use it.

	// ID 	Skill
	// -1	Nothing
	// 0	Attack
	// 1	Kick
	// 2	Throw
	// 66	Amplify Damage
	// 71	Dim Vision
	// 72	Weaken
	// 76	Iron Maiden
	// 77	Terror
	// 81	Confuse
	// 82	Life Tap
	// 86	Attract
	// 87	Decrepify
	// 91	Lower Resist
	// 67	Teeth
	// 68	Bone Armor
	// 73	Poison Dagger
	// 74	Corpse Explosion
	// 78	Bone Wall
	// 83	Poison Explosion
	// 84	Bone Spear
	// 88	Bone Prison
	// 92	Poison Nova
	// 93	Bone Spirit
	// 69	Skeleton Mastery
	// 70	Raise Skeleton
	// 75	Clay Golem
	// 79	Golem Mastery
	// 80	Raise Skeletal Mage
	// 85	Blood Golem
	// 89	Summon Resist
	// 90	Iron Golem
	// 94	Fire Golem
	// 95	Revive

	Config.AttackSkill[0] = -1; // Preattack skill.
	Config.AttackSkill[1] = me.getSkill(92, 1) ? 92 : me.getSkill(67, 1) ? 67 : 0; // Primary skill to bosses. Teeth until Poison Nova (was Poison Dagger, melee)
	Config.AttackSkill[2] = -1; // Primary untimed skill to bosses. Keep at -1 if Config.AttackSkill[1] is untimed skill.
	Config.AttackSkill[3] = me.getSkill(92, 1) ? 92 : me.getSkill(67, 1) ? 67 : 0; // Primary skill to others. Teeth until Poison Nova
	Config.AttackSkill[4] = -1; // Primary untimed skill to others. Keep at -1 if Config.AttackSkill[3] is untimed skill.
	Config.AttackSkill[5] = -1; // Secondary skill if monster is immune to primary. 2026-11-15: was 0, the plain Attack: the Necromancer walked up to poison immunes (many in Hell) and punched them
	Config.AttackSkill[6] = -1; // Secondary untimed skill if monster is immune to primary untimed.

	Config.LowManaSkill[0] = -1; // Timed low mana skill.
	Config.LowManaSkill[1] = -1; // Untimed low mana skill.

	// Lower Resist is the poison curse (2026-11-15: it was Amplify Damage, which only adds to physical damage, and nothing on the others)
	Config.Curse[0] = me.getSkill(91, 1) ? 91 : 66; // Boss curse. Use skill number or set to 0 to disable.
	Config.Curse[1] = me.getSkill(91, 1) ? 91 : 0; // Other monsters curse. Use skill number or set to 0 to disable.

	Config.ExplodeCorpses = 83; // Explode corpses. Use skill number or 0 to disable. 74 = Corpse Explosion, 83 = Poison Explosion
	Config.Golem = "None"; // Golem. 0 or "None" = don't summon, 1 or "Clay" = Clay Golem, 2 or "Blood" = Blood Golem, 3 or "Fire" = Fire Golem
	Config.Skeletons = 0; // Number of skeletons to raise. Set to "max" to auto detect, set to 0 to disable.
	Config.SkeletonMages = 0; // Number of skeleton mages to raise. Set to "max" to auto detect, set to 0 to disable.
	Config.Revives = 0; // Number of revives to raise. Set to "max" to auto detect, set to 0 to disable.
	Config.PoisonNovaDelay = 2; // Delay between two Poison Novas in seconds.
	Config.ActiveSummon = false; // Raise dead between each attack. If false, it will raise after clearing a spot.
	Config.ReviveUnstackable = true; // Revive monsters that can move freely after you teleport.
	Config.IronGolemChicken = 30; // Exit game if Iron Golem's life is less or equal to designated percent.
	
	Config.Dodge = true; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		// 2026-11-15: Teeth is the attack until Poison Nova opens at 30 (before, levels 6-29 fought with Poison Dagger, in melee); Lower Resist
		// (the poison curse) as soon as it opens; then Poison Nova and its synergies Poison Explosion and Poison Dagger maxed
		[67, 1, false], // teeth
		[66, 1, false], // amplify damage
		[68, 1, false], // bone armor
		[67, 10, false], // teeth: the attack until poison nova
		[92, 1, false], // poison nova (level 30; with poison dagger and poison explosion)
		[91, 1, false], // lower resist (level 30; with weaken, terror, decrepify, dim vision, confuse, life tap)
		[92, 20, false], // poison nova
		[83, 20, false], // poison explosion (synergy, and the corpse blast)
		[73, 20, false], // poison dagger (synergy)
		[91, 10, false], // lower resist
		[68, 20, false], // bone armor
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