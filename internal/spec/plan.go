package spec

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Template is one of kolbot's ready-made builds (libs/config/Templates/<Class>/<Name>.js).
// We only read its AutoSkill.Build to learn which skills it is about; the template itself
// is what the bot loads in game, so attack skills, stat order and skill order stay in one place.
type Template struct {
	Path string      // relative to the kolbot "libs" folder, e.g. config/Templates/Paladin/Zeal.js
	Name string      // "Zeal"
	Key  map[int]int // skill id -> highest count the template asks for
}

// DefaultTemplate is what a brand new character of each class follows.
// Chosen to be bot-friendly (ranged or sturdy) and to match a template that exists.
var DefaultTemplate = []string{
	"Bowazon",   // Amazon
	"Blizzard",  // Sorceress
	"Summon",    // Necromancer
	"Zeal",      // Paladin
	"Whirlwind", // Barbarian
	"Summon",    // Druid
	"Kick",      // Assassin
}

// attackSkills are the class skills that deal damage when used directly; used to name a
// "main skill" for characters that don't match any template.
var attackSkills = []map[int]bool{
	set(6, 7, 10, 11, 12, 14, 15, 16, 19, 20, 21, 22, 24, 25, 26, 27, 30, 31, 34, 35),
	set(36, 38, 39, 41, 44, 45, 47, 48, 49, 51, 53, 55, 56, 59, 62, 64),
	set(67, 73, 74, 83, 84, 92, 93),
	set(96, 97, 101, 106, 107, 112, 121),
	set(126, 132, 133, 139, 140, 143, 144, 147, 151, 152),
	set(225, 229, 230, 233, 234, 239, 240, 243, 244, 245, 248, 250),
	set(254, 255, 256, 257, 260, 261, 262, 265, 266, 269, 270, 271, 272, 274, 275, 276, 277, 280),
}

func set(ids ...int) map[int]bool {
	m := map[int]bool{}
	for _, i := range ids {
		m[i] = true
	}
	return m
}

var (
	buildBlock = regexp.MustCompile(`(?s)Config\.AutoSkill\.Build\s*=\s*\[(.*?)\n\s*\];`)
	buildEntry = regexp.MustCompile(`\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(?:true|false)\s*\]`)
	// [mastery, n, false]: the Whirlwind template works out its weapon mastery in the game (sword, axe, mace, polearm or spear). All five
	// sit in one tree, so it counts here as Sword Mastery (127): the tree is what Detect needs, and the hard points of the real one still overlap.
	masteryEntry = regexp.MustCompile(`\[\s*mastery\s*,\s*(\d+)\s*,\s*(?:true|false)\s*\]`)
)

const masteryStandIn = 127

// LoadTemplates reads every template for a class from <libs>/config/Templates/<Class>/*.js.
func LoadTemplates(libs string, class int) []Template {
	dir := filepath.Join(libs, "config", "Templates", ClassNames[class])
	files, _ := filepath.Glob(filepath.Join(dir, "*.js"))
	sort.Strings(files)
	var out []Template
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		t := Template{
			Path: "config/Templates/" + ClassNames[class] + "/" + filepath.Base(f),
			Name: strings.TrimSuffix(filepath.Base(f), ".js"),
			Key:  map[int]int{},
		}
		if m := buildBlock.FindSubmatch(b); m != nil {
			for _, e := range buildEntry.FindAllSubmatch(m[1], -1) {
				id, _ := strconv.Atoi(string(e[1]))
				n, _ := strconv.Atoi(string(e[2]))
				if n > t.Key[id] {
					t.Key[id] = n
				}
			}
			for _, e := range masteryEntry.FindAllSubmatch(m[1], -1) {
				n, _ := strconv.Atoi(string(e[1]))
				if n > t.Key[masteryStandIn] {
					t.Key[masteryStandIn] = n
				}
			}
		}
		out = append(out, t)
	}
	return out
}

// trees returns the skill trees a template's key skills sit in, ignoring one-point
// prerequisites so a stray utility skill does not drag in a whole tree.
func (t Template) trees(class int) []int {
	mass := [3]int{}
	for id, n := range t.Key {
		if tr := TreeOf(class, id); tr >= 0 {
			mass[tr] += n
		}
	}
	var out []int
	for tr, m := range mass {
		if m >= 5 {
			out = append(out, tr)
		}
	}
	return out
}

// Protect says which equipped items auto-equip must never replace. Every flag that is true protects
// that kind of item; ClassIDs protects specific items by class id (174 is Khalim's Will).
type Protect struct {
	Unique   bool  `json:"unique"`
	Set      bool  `json:"set"`
	Crafted  bool  `json:"crafted"`
	Rare     bool  `json:"rare"`
	Magic    bool  `json:"magic"`
	Socketed bool  `json:"socketed"` // anything with sockets (covers runewords and socketed gear)
	Runeword bool  `json:"runeword"`
	Ethereal bool  `json:"ethereal"`
	ClassIDs []int `json:"classIds"`
	MinLevel int   `json:"minLevel"` // the list only applies to a character of this level or higher (0: always); class ids (Khalim's Will) are always protected
}

// DefaultProtect is the rule set the user asked for: never replace unique, set, crafted or socketed/runeword gear.
func DefaultProtect() Protect {
	return Protect{Unique: true, Set: true, Crafted: true, Socketed: true, Runeword: true, ClassIDs: []int{174}}
}

// Storage is how big the character's containers are, which the game does not let a script detect (the
// data table for it returns garbage), so it is a setting. Each pair is {columns, rows}. The defaults are
// a 10x6 inventory, PlugY's 10x10 big stash and the standard 3x4 cube.
//
// A bot may clear every cell of its pack except the things you keep there on purpose (charms, tomes, keys, the cube and the
// torch parts: see Item.userOwned in libs/common/Misc.js). When a bot joins a game and keepers are in its pack it moves them
// to the stash and says so in chat (ClearOnLoad).
type Storage struct {
	Inventory     [2]int `json:"inventory"`
	Stash         [2]int `json:"stash"`
	Cube          [2]int `json:"cube"`
	AddStashPages bool   `json:"addStashPages"` // stash full: insert a new PlugY page (true) or stop the bot (false)
	ClearOnLoad   *bool  `json:"clearOnLoad"`   // nil = true
}

// DefaultStorage returns the default sizes.
func DefaultStorage() Storage {
	t := true
	return Storage{Inventory: [2]int{10, 6}, Stash: [2]int{10, 10}, Cube: [2]int{3, 4}, AddStashPages: true, ClearOnLoad: &t}
}

// Normalize fills in what an older config (written before these settings existed) leaves out.
func (s Storage) Normalize() Storage {
	if s.ClearOnLoad == nil {
		s.ClearOnLoad = DefaultStorage().ClearOnLoad
	}
	return s
}

// Validate rejects sizes that cannot be real, so a typo cannot make every pickup fail.
func (s Storage) Validate() error {
	for name, d := range map[string][2]int{"inventory": s.Inventory, "stash": s.Stash, "cube": s.Cube} {
		if d[0] < 1 || d[0] > 30 || d[1] < 1 || d[1] > 30 {
			return fmt.Errorf("the %s size %dx%d is not valid: columns and rows must each be 1 to 30", name, d[0], d[1])
		}
	}
	return nil
}

// Plan is what the bot's AutoSpec.js reads at game start (data/<profile>.spec.json).
type Plan struct {
	Name     string `json:"name"`
	Class    string `json:"class"`
	Level    int    `json:"level"`
	Mode     string `json:"mode"` // "template" | "fresh" | "custom"
	Template string `json:"template,omitempty"`
	Spec     string `json:"spec"`   // human readable, e.g. "Zeal"
	Reason   string `json:"reason"` // why this was chosen
	// custom mode only: a build that keeps adding to what the character already has
	Skills [][]interface{} `json:"skills,omitempty"` // [id, count, satisfy]
	Stats  [][]interface{} `json:"stats,omitempty"`  // ["strength", 80]
	Main   int             `json:"main,omitempty"`   // main attack skill id (custom mode)

	// the points the character's save says are spent, read by Qolbot before the game: strength, dexterity, vitality, energy (the base stats, no gear), and when (ms since 1970).
	// AutoStat counts from these instead of estimating them from the gear (the user, 2026-11-16: "fix the stat balance issue").
	HardStats   []int `json:"hardStats,omitempty"`
	HardStatsAt int64 `json:"hardStatsAt,omitempty"`

	Storage         Storage             `json:"storage"`                  // container sizes and the full-stash policy
	QOL             bool                `json:"qol"`                      // "Using QOL?": Auto Respec sends ".reset skills" / ".reset stats" in the chat (no PlugY buttons, no positions)
	HuntGoal        int                 `json:"huntGoal"`                 // a gold hunt: the gold every bot must hold; a bot above it hands its surplus to one below it (Gold.js)
	HuntAreas       []int               `json:"huntAreas"`                // a gold hunt: the area ids the leader clears in full, in order (ClearAnyArea.AreaList; the manager chose them, huntplaces.go)
	Quartermaster   bool                `json:"quartermaster"`            // the game has the Quartermaster mod: send ".deposit" before stashing (rejuvenation potions and other common items)
	Plugy           bool                `json:"plugy"`                    // the game uses PlugY (needed for /save, stash pages, the big stash)
	ReportTasks     bool                `json:"reportTasks"`              // bots say what task they are starting
	ReportProblems  bool                `json:"reportProblems"`           // bots say when they have a problem
	Gamble          bool                `json:"gamble"`                   // bots may gamble when they hold a lot of gold
	Script          string              `json:"script,omitempty"`         // kolbot script to run instead of Follower
	Goal            string              `json:"goal,omitempty"`           // with Script "Goal": Quest or Farm
	TeamGoal        string              `json:"teamGoal,omitempty"`       // the team's objective (Quest, Farm), written for EVERY bot: "goal" is only the leader's (its presence means "I lead")
	Farm            []string            `json:"farm,omitempty"`           // with goal Farm: the kolbot scripts to run, in order
	Pickit          []string            `json:"pickit,omitempty"`         // the .nip lists this bot loads
	NoPickup        bool                `json:"noPickup,omitempty"`       // pick nothing up (a follower while a leader bot farms)
	AutoTown        bool                `json:"autoTown"`                 // bots follow the leader between town and the field by themselves
	AutoSaveMinutes int                 `json:"autoSaveMinutes"`          // the bot saves (PlugY /save) this often while following; 0 = never
	Banter          bool                `json:"banter"`                   // bots speak their quotes
	BanterBubble    bool                `json:"banterBubble"`             // ... with a leading "!" so they show over the bot's head
	Protect         Protect             `json:"protect"`                  // gear auto-equip must never replace
	SafeMode        bool                `json:"safeMode"`                 // Safe mode is on: AutoEquip, AutoStat and AutoSkill below are already false, and the bot picks up only consumables and quest items
	AutoEquip       bool                `json:"autoEquip"`                // let the bot equip better gear (never touches the protected kinds); false in safe mode
	AutoStat        bool                `json:"autoStat"`                 // let the bot spend its stat points; false in safe mode
	WatchKills      bool                `json:"watchKills"`               // the bot reports the bosses, uniques and champions it sees die
	SkillPoints     map[string]int      `json:"skillPoints"`              // skill id -> hard points the save holds now: the game's own skill query adds item bonuses, so AutoSkill counts from this
	MercWear        MercWear            `json:"mercWear"`                 // which extra slots the mercenary may be given gear for (some mods allow more than helm, armor, weapon)
	Merc            string              `json:"merc,omitempty"`           // the merc chosen on the bot card (a MercKind ID, "a2-def", ...): MercHire.js replaces one of another kind first thing in a game
	MercKinds       []MercKind          `json:"mercKinds,omitempty"`      // the mercs of THIS game (its Hireling.txt, or the 1.13d ones): how MercHire.js tells the kind of a merc
	MercCandidates  map[string][]string `json:"mercCandidates,omitempty"` // "act-difficulty" -> the kinds a hire list entry is rolled among (MercHire.js)
	MercQolEquip    bool                `json:"mercQolEquip"`             // QOL mod with qol.ini [mercenary] equip=1: mercs take more weapon kinds (Item.mercWeapons)
	MercDropOnHire  bool                `json:"mercDropOnHire"`           // QOL mod with qol.ini [mercenary] drop_items=1: a replaced merc drops its gear (MercHire.js picks it up)
	SaveOnChicken   bool                `json:"saveOnChicken"`            // ask for a /save just before leaving a game in danger (a chicken)
	TeleportTeam    bool                `json:"teleportTeam"`             // the Quests tab option: use a Sorceress party member's Teleport (only when QuestClearAll is false)
	Regroup         bool                `json:"regroup"`                  // the leader fetches a lost team
	RegroupSeconds  int                 `json:"regroupSeconds"`           // a teammate lost this long makes the leader fetch the team
	InventoryLayout bool                `json:"inventoryLayout"`          // the cube, the tomes and the keys keep fixed places in the pack
	QuestWaypoints  bool                `json:"questWaypoints"`           // Quest mode collects every waypoint of an act before moving on to the next
	QuestClearAll   bool                `json:"questClearAll"`            // Quest mode clears every area it passes through (false: only the areas a quest needs)
	AutoSkill       bool                `json:"autoSkill"`                // let the bot spend its skill points; false in safe mode
	Respec          bool                `json:"respec"`                   // Automation tab, Auto Respec: with PlugY the bot may take its skill points back once (Respec.js decides whether they fit the build)
	PartySync       bool                `json:"partySync"`                // bot-only run: the party goes to town together, a mate's town chicken trip calls everybody (PartySync.js); false while a human plays
	Hunt            string              `json:"hunt,omitempty"`           // "gold" or "level" while the team is on a hunt (levelup.go): no waypoint sharing at the start of the game, that waits until the quests resume
	StatButtons     bool                `json:"statButtons"`              // Qolbot knows where PlugY's stat buttons are (respec.go): without it the stat part of Auto Respec only reports
	RespecStat      bool                `json:"respecStat"`               // Auto Respec also covers the STAT points (PlugY: Alt click): needs Auto Stat
	RespecForce     bool                `json:"respecForce"`              // the build was chosen by hand: respec once for it even when the points mostly fit
}

// Detect decides what a character is and what it should keep doing.
func Detect(s *Save, templates []Template) Plan {
	p := Plan{Name: s.Name, Class: ClassNames[s.Class], Level: s.Level}
	invested := s.Invested()

	// Score each template two ways: points the character put into skills the template names
	// (exact), and points in the same skill TREES as those skills (prerequisite chains and
	// support skills count too, e.g. Might on a Zealot).
	treePts := [3]int{}
	for id, n := range s.Skills {
		if tr := TreeOf(s.Class, id); tr >= 0 {
			treePts[tr] += n
		}
	}
	best, bestScore, bestOverlap := -1, 0, 0
	for i, t := range templates {
		o := 0
		for id, n := range t.Key {
			h := s.Skills[id]
			if h > n {
				h = n
			}
			o += h
		}
		inTrees := 0
		for _, tr := range t.trees(s.Class) {
			inTrees += treePts[tr]
		}
		if o == 0 {
			continue // a template must share at least one actual skill with the character
		}
		if sc := 2*o + inTrees; sc > bestScore {
			best, bestScore, bestOverlap = i, sc, inTrees
		}
	}

	def := func(why string) Plan {
		for _, t := range templates {
			if t.Name == DefaultTemplate[s.Class] {
				p.Mode, p.Template, p.Spec, p.Reason = "fresh", t.Path, t.Name, why
				return p
			}
		}
		if len(templates) > 0 {
			t := templates[0]
			p.Mode, p.Template, p.Spec, p.Reason = "fresh", t.Path, t.Name, why
			return p
		}
		return custom(p, s, why)
	}

	switch {
	case invested <= 1:
		return def(fmt.Sprintf("only %d skill point(s) spent: new character, using the default %s path", invested, ClassNames[s.Class]))
	case best >= 0 && float64(bestOverlap) >= 0.75*float64(invested):
		t := templates[best]
		p.Mode, p.Template, p.Spec = "template", t.Path, t.Name
		p.Reason = fmt.Sprintf("%d of %d spent skill points are in the skill trees the %s build uses", bestOverlap, invested, t.Name)
		return p
	case invested < 8:
		return def(fmt.Sprintf("%d skill points spent and no clear match: still early, using the default path", invested))
	}
	return custom(p, s, fmt.Sprintf("%d skill points spent and none of the templates fit", invested))
}

// custom keeps building what the character already has: its most invested skills first,
// and strength goes up to 180 (and stays where it is above that), dexterity stays where it is, everything else goes into vitality.
func custom(p Plan, s *Save, why string) Plan {
	type kv struct{ id, n int }
	var list []kv
	for id, n := range s.Skills {
		list = append(list, kv{id, n})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].n != list[j].n {
			return list[i].n > list[j].n
		}
		return list[i].id < list[j].id
	})
	p.Mode, p.Reason = "custom", why
	for _, e := range list {
		p.Skills = append(p.Skills, []interface{}{e.id, 20, false})
		if p.Main == 0 && e.n >= 5 && attackSkills[s.Class][e.id] { // 1 to 4 points is just a prerequisite
			p.Main = e.id
		}
	}
	p.Spec = "custom"
	if p.Main != 0 {
		p.Spec = "custom (" + strconv.Itoa(p.Main) + ")"
	}
	str := s.Str
	if str < 180 { // every build reaches at least 180 strength (the user, 2026-11-16: an Elite Monarch needs 156)
		str = 180
	}
	p.Stats = [][]interface{}{{"strength", str}, {"dexterity", s.Dex}, {"vitality", "all"}}
	return p
}

// WriteFile stores the plan as <dir>/<profile>.spec.json for the bot to read.
func (p Plan) WriteFile(dir, profile string) error {
	b, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, profile+".spec.json"), append(b, '\n'), 0o660)
}

// Forced builds the plan for a template the user asked for by name (case-insensitive).
func Forced(s *Save, templates []Template, name string) (Plan, bool) {
	for _, t := range templates {
		if strings.EqualFold(t.Name, name) {
			return Plan{Name: s.Name, Class: ClassNames[s.Class], Level: s.Level, Mode: "template", Template: t.Path, Spec: t.Name,
				Reason: "chosen by hand in qolbot.json"}, true
		}
	}
	return Plan{}, false
}

// MercWear says which extra gear kinds the mercenary can wear. The base game allows none of them; some mods allow all.
type MercWear struct {
	Rings   bool `json:"rings"`
	Amulets bool `json:"amulets"`
	Belts   bool `json:"belts"`
	Gloves  bool `json:"gloves"`
	Boots   bool `json:"boots"`
}

// MercKind is one kind of merc a town sells (an act and a sub-type of the game's Hireling.txt: "Act 2 Desert Mercenary, Def").
type MercKind struct {
	ID       string      `json:"id"`       // "a2-def": the act and the sub-type without its difficulty
	Label    string      `json:"label"`    // for the bot card: "Act 2 Desert Mercenary: Def (Prayer, Jab, Penetrate)"
	Act      int         `json:"act"`      // 1, 2, 3 or 5
	Classids []int       `json:"classids"` // the merc's monster class ids
	Tell     [3]int      `json:"tell"`     // per difficulty (Normal, Nightmare, Hell): a skill id only this kind of its act has; 0 = the act sells one kind
	Skills   [3][]string `json:"skills"`   // per difficulty: the skill names, for the log
}
