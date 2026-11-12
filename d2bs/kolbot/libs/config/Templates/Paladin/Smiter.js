// Paladin / Fist of the Heavens: Fist of the Heavens is the main attack and Holy Bolt its synergy; Smite is the melee fallback; Fanaticism as the aura.
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
	Config.AttackSkill[1] = me.getSkill(121, 1) ? 121 : me.getSkill(97, 1) ? 97 : 0; // Primary skill to bosses.
	Config.AttackSkill[2] = me.getSkill(122, 1) ? 122 : (me.getSkill(98, 1) ? 98 : -1); // Primary aura to bosses
	Config.AttackSkill[3] = me.getSkill(121, 1) ? 121 : me.getSkill(97, 1) ? 97 : 0; // Primary skill to others.
	Config.AttackSkill[4] = me.getSkill(122, 1) ? 122 : (me.getSkill(98, 1) ? 98 : -1); // Primary aura to others.
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
		[97, 1, false], // smite
		[121, 1, false], // fist of the heavens
		[101, 1, false], // holy bolt
		[117, 1, false], // holy shield
		[122, 1, false], // fanaticism
		[121, 20, false], // fist of the heavens
		[101, 20, false], // holy bolt
		[117, 20, false], // holy shield
		[97, 10, false], // smite
		[122, 10, false], // fanaticism
	];

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
}