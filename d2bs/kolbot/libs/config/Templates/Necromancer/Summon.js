// Necromancer / Summoner: skeletons, skeletal mages and a golem fight; the necromancer stays back and revives.
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
	// 500 = kolbot's "pure summoner": stand off (Skill.getRange 15), curse and explode corpses while the army fights. It was 0, the plain Attack:
	// Sankt (no weapon, 544 life) walked up to the monsters and punched them (2026-11-15).
	Config.AttackSkill[1] = 500; // Primary skill to bosses.
	Config.AttackSkill[2] = -1; // Primary untimed skill to bosses. Keep at -1 if Config.AttackSkill[1] is untimed skill.
	Config.AttackSkill[3] = 500; // Primary skill to others.
	Config.AttackSkill[4] = -1; // Primary untimed skill to others. Keep at -1 if Config.AttackSkill[3] is untimed skill.
	Config.AttackSkill[5] = -1; // Secondary skill if monster is immune to primary.
	Config.AttackSkill[6] = -1; // Secondary untimed skill if monster is immune to primary untimed.

	Config.LowManaSkill[0] = -1; // Timed low mana skill.
	Config.LowManaSkill[1] = -1; // Untimed low mana skill.

	// Amplify Damage doubles the physical damage the skeletons and the golem do: the summoner's main curse (it had none)
	Config.Curse[0] = me.getSkill(66, 1) ? 66 : 0; // Boss curse. Use skill number or set to 0 to disable.
	Config.Curse[1] = me.getSkill(66, 1) ? 66 : 0; // Other monsters curse. Use skill number or set to 0 to disable.

	Config.ExplodeCorpses = 74; // Explode corpses. Use skill number or 0 to disable. 74 = Corpse Explosion, 83 = Poison Explosion
	Config.Golem = "Clay"; // Golem. 0 or "None" = don't summon, 1 or "Clay" = Clay Golem, 2 or "Blood" = Blood Golem, 3 or "Fire" = Fire Golem
	Config.Skeletons = "max"; // Number of skeletons to raise. Set to "max" to auto detect, set to 0 to disable.
	Config.SkeletonMages = "max"; // Number of skeleton mages to raise. Set to "max" to auto detect, set to 0 to disable.
	Config.Revives = me.getSkill(95, 1) ? "max" : 0; // Number of revives to raise. Set to "max" to auto detect, set to 0 to disable.
	Config.PoisonNovaDelay = 2; // Delay between two Poison Novas in seconds.
	Config.ActiveSummon = false; // Raise dead between each attack. If false, it will raise after clearing a spot.
	Config.ReviveUnstackable = true; // Revive monsters that can move freely after you teleport.
	Config.IronGolemChicken = 30; // Exit game if Iron Golem's life is less or equal to designated percent.
	
	// The minions fight, the necromancer does not: it stands back from the leader and raises its army again every so often (the follower script).
	Config.FollowNoFight = true;
	Config.FollowDistance = 14;

	Config.Dodge = true; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		// 2026-11-15, the usual 1.13 summoner (skeletons and Skeleton Mastery maxed, Amplify Damage, Corpse Explosion, Summon Resist, then Revive).
		// It had no curse and no Corpse Explosion, and put 20 into Golem Mastery
		[70, 1, false], // raise skeleton
		[69, 1, false], // skeleton mastery
		[66, 1, false], // amplify damage (the curse)
		[67, 1, false], // teeth (for corpse explosion)
		[74, 1, false], // corpse explosion (level 6): clears packs, kills what the skeletons cannot
		[75, 1, false], // clay golem (slows what it hits)
		[80, 1, false], // raise skeletal mage
		[70, 10, false], // raise skeleton
		[69, 10, false], // skeleton mastery
		[70, 20, false], // raise skeleton
		[69, 20, false], // skeleton mastery
		[79, 1, false], // golem mastery (for summon resist)
		[89, 1, false], // summon resist (level 24): the army survives Nightmare and Hell elements
		[74, 10, false], // corpse explosion: a wider blast
		[80, 20, false], // raise skeletal mage (elemental damage for physical immunes)
		[95, 20, false], // revive
	];

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	// Qolbot (the user, 2026-11-16: "summon druid and summon necro you would balance str and vit until about 180, then go all vit"): every point goes to the lower
	// of strength and vitality, one at a time (the targets go up by one: each to 21, each to 22, ... to 180), then all the rest into vitality. No dexterity, no energy.
	Config.AutoStat.Build = [];

	for (var statTarget = 21; statTarget <= 180; statTarget += 1) {
		Config.AutoStat.Build.push(["s", statTarget], ["v", statTarget]);
	}

	Config.AutoStat.Build.push(["v", "all"]);
}