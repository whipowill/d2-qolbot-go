package d2items

import "sort"

// SkillInfo is a skill of a class's tree, as the game's own tables describe it (the mod's first), so a modded game's skills show too.
type SkillInfo struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Tab      int    `json:"tab"` // 1-3: the tab of the tree
	Row      int    `json:"row"`
	Col      int    `json:"col"`
	ReqLevel int    `json:"lvl"` // the character level the skill needs
}

// ClassSkills lists the skills of a class (its three-letter code in Skills.txt: "ama", "sor", "nec", "pal", "bar", "dru", "ass") that are in
// its tree, tab by tab, top row first.
func (t *Tables) ClassSkills(class string) []SkillInfo {
	var out []SkillInfo
	for id, s := range t.Skills {
		if s.Class != class || s.Page < 1 || s.Page > 3 {
			continue
		}
		name := t.Str(s.NameKey)
		if name == "" {
			name = s.NameKey
		}
		out = append(out, SkillInfo{ID: id, Name: name, Tab: s.Page, Row: s.Row, Col: s.Col, ReqLevel: s.ReqLevel})
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Tab != b.Tab {
			return a.Tab < b.Tab
		}
		if a.Row != b.Row {
			return a.Row < b.Row
		}
		if a.Col != b.Col {
			return a.Col < b.Col
		}
		return a.ID < b.ID
	})
	return out
}

// SkillTabName is the name of a tab of a class's skill tree ("Fire", "Lightning", "Cold"); class is the class number of the save (0 Amazon ...).
func SkillTabName(class, tab int) string {
	if class < 0 || class >= len(skillTabs) || tab < 1 || tab > 3 {
		return ""
	}
	return skillTabs[class][tab-1]
}
