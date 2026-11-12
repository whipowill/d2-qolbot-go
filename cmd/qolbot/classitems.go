package main

import (
	"fmt"
	"strings"
)

// Desirable class items (Base Items page): for each kind of class item (primal helms, pelts, auric shields, voodoo heads, orbs, claws, Amazon
// weapons) a list of that class's individual skills and a minimum, such as "hurricane 3". An item is kept when it is of that kind, of the
// chosen base tier or better, magic, rare or crafted, and has at least Need of the listed skill bonuses.

// ClassRule is one kind of class item and the skills that make it worth keeping.
type ClassRule struct {
	Kind   string      `json:"kind"`             // key from classKinds
	Need   int         `json:"need,omitempty"`   // how many of the skills are needed (default 1)
	Skills []MagicStat `json:"skills,omitempty"` // skill code and the minimum bonus
}

type classKind struct {
	Key, Label string
	nip        string
	Class      string // the class it belongs to: the name on the page's button, and whose skills it can have
}

var classKinds = []classKind{
	{"primalhelm", "Primal Helms (Barbarian)", "[type] == primalhelm", "Barbarian"},
	{"pelt", "Pelts (Druid)", "[type] == pelt", "Druid"},
	{"auricshields", "Auric Shields (Paladin)", "[type] == auricshields", "Paladin"},
	{"voodooheads", "Voodoo Heads (Necromancer)", "[type] == voodooheads", "Necromancer"},
	{"orb", "Orbs (Sorceress)", "[type] == orb", "Sorceress"},
	{"claws", "Claws (Assassin)", typeAny("assassinclaw", "handtohand"), "Assassin"},
	{"amazon", "Amazon Weapons", typeAny("amazonbow", "amazonspear", "amazonjavelin"), "Amazon"},
}

func findClassKind(key string) *classKind {
	for i := range classKinds {
		if classKinds[i].Key == key {
			return &classKinds[i]
		}
	}
	return nil
}

func (c classKind) hasSkill(key string) bool {
	for _, x := range classSkillList[c.Class] {
		if x.Key == key {
			return true
		}
	}
	return false
}

func (c ClassRule) validate() error {
	k := findClassKind(c.Kind)
	if k == nil {
		return fmt.Errorf("%q is not a kind of class item", c.Kind)
	}
	seen := map[string]bool{}
	for _, t := range c.Skills {
		if !k.hasSkill(t.Key) {
			return fmt.Errorf("%q is not a %s skill (%s)", t.Key, k.Class, strings.ToLower(k.Label))
		}
		if seen[t.Key] {
			return fmt.Errorf("%q is listed twice for %s", t.Key, strings.ToLower(k.Label))
		}
		seen[t.Key] = true
		if t.Min < 1 || t.Min > 6 {
			return fmt.Errorf("a skill bonus is 1 to 6, not %d (%s)", t.Min, t.Key)
		}
	}
	if len(c.Skills) > 0 && (c.Need < 0 || c.Need > len(c.Skills)) {
		return fmt.Errorf("%s needs %d of only %d skills", strings.ToLower(k.Label), c.Need, len(c.Skills))
	}
	return nil
}

// nip is the rule as one NIP line (the base tier is added by the caller).
func (c ClassRule) nip(tier string) string {
	k := findClassKind(c.Kind)
	var terms []string
	for _, t := range c.Skills {
		terms = append(terms, fmt.Sprintf("[skill%s] >= %d", t.Key, t.Min))
	}
	need := c.Need
	if need <= 0 {
		need = 1
	}
	var cond string
	switch {
	case need >= len(terms):
		cond = "(" + strings.Join(terms, " && ") + ")"
	case need == 1:
		cond = "(" + strings.Join(terms, " || ") + ")"
	default:
		var combos []string
		var pick func(start int, chosen []string)
		pick = func(start int, chosen []string) {
			if len(chosen) == need {
				combos = append(combos, "("+strings.Join(chosen, " && ")+")")
				return
			}
			for i := start; i < len(terms); i++ {
				pick(i+1, append(append([]string{}, chosen...), terms[i]))
			}
		}
		pick(0, nil)
		cond = "(" + strings.Join(combos, " || ") + ")"
	}
	return withTier(k.nip+" && ([quality] == magic || [quality] == rare || [quality] == crafted) # "+cond, tier)
}

// classRules writes every class rule that has at least one skill tree.
func classRules(r PickitRules) string {
	if !r.ClassItems {
		return ""
	}
	var b strings.Builder
	b.WriteString("// desirable class items chosen on the Keeper tab (Base Items)\n")
	for _, c := range r.Class {
		if len(c.Skills) > 0 {
			b.WriteString(c.nip(tierOr(r.ClassTier)) + "\n")
		}
	}
	return b.String()
}

func classCatalog() map[string]any {
	var kinds []map[string]any
	for _, k := range classKinds {
		var skills []map[string]string
		for _, t := range classSkillList[k.Class] {
			skills = append(skills, map[string]string{"key": t.Key, "label": t.Label})
		}
		kinds = append(kinds, map[string]any{"key": k.Key, "label": k.Label, "class": k.Class, "skills": skills})
	}
	return map[string]any{"kinds": kinds}
}

// defaultClass is the starting list: a few skills worth having on each class item, at +3.
func defaultClass() []ClassRule {
	pick := map[string][]string{
		"primalhelm":   {"battleorders", "battlecommand"},
		"pelt":         {"hurricane", "tornado"},
		"auricshields": {"fanaticism", "concentration"},
		"voodooheads":  {"bonespear", "bonespirit", "poisonnova"},
		"orb":          {"frozenorb", "meteor", "blizzard", "chainlightning"},
		"claws":        {"lightningsentry", "wakeoffire"},
		"amazon":       {"lightningfury", "strafe"},
	}
	var out []ClassRule
	for _, k := range classKinds {
		c := ClassRule{Kind: k.Key, Need: 1}
		for _, key := range pick[k.Key] {
			c.Skills = append(c.Skills, MagicStat{Key: key, Min: 3})
		}
		out = append(out, c)
	}
	return out
}
