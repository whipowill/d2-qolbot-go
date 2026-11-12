// Paladin / Hammerdin: Blessed Hammer under Concentration; Vigor while moving; Holy Shield for block; Blessed Aim is the synergy.
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
	Config.AttackSkill[1] = me.getSkill(112, 1) ? 112 : me.getSkill(97, 1) ? 97 : 0; // Primary skill to bosses.
	Config.AttackSkill[2] = me.getSkill(113, 1) ? 113 : (me.getSkill(98, 1) ? 98 : -1); // Primary aura to bosses
	Config.AttackSkill[3] = me.getSkill(112, 1) ? 112 : me.getSkill(97, 1) ? 97 : 0; // Primary skill to others.
	Config.AttackSkill[4] = me.getSkill(113, 1) ? 113 : (me.getSkill(98, 1) ? 98 : -1); // Primary aura to others.
	Config.AttackSkill[5] = 0; // Secondary skill if monster is immune to primary.
	Config.AttackSkill[6] = -1; // Secondary aura.

	Config.LowManaSkill[0] = 0; // Low mana skill.
	Config.LowManaSkill[1] = -1; // Low mana aura.

	Config.AvoidDolls = true; // Try to attack Soul Killers from a greater distance with hammerdins.
	Config.Vigor = true; // Swith to Vigor when running
	Config.Charge = false; // Use Charge when running
	Config.Redemption = [50, 50]; // Switch to Redemption after clearing an area if under designated life or mana. Format: [lifepercent, manapercent]

	Config.Dodge = false; // Move away from monsters that get too close. Don't use with short-ranged attacks like Poison Dagger.
	Config.DodgeRange = 15; // Distance to keep from monsters.

	Config.AutoSkill.Enabled = true; // Enable or disable AutoSkill system
	Config.AutoSkill.Build = [
		[97, 1, false], // smite (prerequisite)
		[112, 1, false], // blessed hammer
		[113, 1, false], // concentration
		[117, 1, false], // holy shield
		[115, 1, false], // vigor
		[112, 20, false], // blessed hammer
		[115, 20, false], // vigor
		[108, 20, false], // blessed aim
		[113, 20, false], // concentration
		[117, 10, false], // holy shield
	];

	Config.AutoStat.Enabled = true; // Enable or disable AutoStat system
	Config.AutoStat.Build = [
		["s", 25], // strength for gear
		["v", 40], // vitality
		["e", 30], // energy: a little mana while leveling
		["d", 40], // dexterity for block
		["v", 65], // vitality
		["s", 60], // strength
		["d", 70], // dexterity
		["v", 100], // vitality
		["s", 100], // strength for gear
		["d", 90], // dexterity (block with Holy Shield)
		["v", "all"], // everything else into vitality (energy stays low: mana comes from gear)
	];
}