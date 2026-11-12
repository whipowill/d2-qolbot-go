package spec

// trees[class][tab] lists the 10 skills of each skill tree (class order as in ClassNames).
// IDs follow skills.txt (d2bs/kolbot/sdk/skills.txt).
var trees = [7][3]struct {
	Name   string
	Skills []int
}{
	{ // Amazon
		{"Bow and Crossbow", []int{6, 7, 11, 12, 16, 21, 22, 26, 27, 31}},
		{"Passive and Magic", []int{8, 9, 13, 17, 18, 23, 28, 29, 32, 33}},
		{"Javelin and Spear", []int{10, 14, 15, 19, 20, 24, 25, 30, 34, 35}},
	},
	{ // Sorceress
		{"Fire", []int{36, 37, 41, 46, 47, 51, 52, 56, 61, 62}},
		{"Lightning", []int{38, 42, 43, 48, 49, 53, 54, 57, 58, 63}},
		{"Cold", []int{39, 40, 44, 45, 50, 55, 59, 60, 64, 65}},
	},
	{ // Necromancer
		{"Curses", []int{66, 71, 72, 76, 77, 81, 82, 86, 87, 91}},
		{"Poison and Bone", []int{67, 68, 73, 74, 78, 83, 84, 88, 92, 93}},
		{"Summoning", []int{69, 70, 75, 79, 80, 85, 89, 90, 94, 95}},
	},
	{ // Paladin
		{"Combat", []int{96, 97, 101, 106, 107, 111, 112, 116, 117, 121}},
		{"Offensive Auras", []int{98, 102, 103, 108, 113, 114, 118, 119, 122, 123}},
		{"Defensive Auras", []int{99, 100, 104, 105, 109, 110, 115, 120, 124, 125}},
	},
	{ // Barbarian
		{"Combat", []int{126, 132, 133, 139, 140, 143, 144, 147, 151, 152}},
		{"Masteries", []int{127, 128, 129, 134, 135, 136, 141, 145, 148, 153}},
		{"Warcries", []int{130, 131, 137, 138, 142, 146, 149, 150, 154, 155}},
	},
	{ // Druid
		{"Summoning", []int{221, 222, 226, 227, 231, 236, 237, 241, 246, 247}},
		{"Shape Shifting", []int{223, 224, 228, 232, 233, 238, 239, 242, 243, 248}},
		{"Elemental", []int{225, 229, 230, 234, 235, 240, 244, 245, 249, 250}},
	},
	{ // Assassin
		{"Traps", []int{251, 256, 257, 261, 262, 266, 271, 272, 276, 277}},
		{"Shadow Disciplines", []int{252, 253, 258, 263, 264, 267, 268, 273, 278, 279}},
		{"Martial Arts", []int{254, 255, 259, 260, 265, 269, 270, 274, 275, 280}},
	},
}

// TreeOf returns the tab (0..2) a skill belongs to, or -1.
func TreeOf(class, skill int) int {
	for t := range trees[class] {
		for _, id := range trees[class][t].Skills {
			if id == skill {
				return t
			}
		}
	}
	return -1
}

// TreeName names a tab.
func TreeName(class, tab int) string { return trees[class][tab].Name }
