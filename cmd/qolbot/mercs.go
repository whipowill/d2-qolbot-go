package main

// The mercs of the player's own game. A mod can change what each town sells (the QOL mod gives every Act 2 merc one aura in all
// difficulties, vanilla changes it per difficulty), so the kinds are read from the game's Data/global/excel/Hireling.txt and Skills.txt
// when the game has them as loose files (read only), and are the 1.13d ones otherwise. The QOL mod's qol.ini [mercenary] says
// whether mercs take more weapon kinds (equip=1) and drop their gear when replaced (drop_items=1); it counts only with "Using QOL?" on.

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"d2qolbot/internal/mpq"
	"d2qolbot/internal/spec"
)

// MercTable is what the bots and the bot card are told about the mercs of this game.
type MercTable struct {
	Source     string              `json:"source"` // where the kinds come from, for the bot card
	Kinds      []spec.MercKind     `json:"kinds"`
	Candidates map[string][]string `json:"candidates"` // "act-difficulty" (1-based act, 0-based difficulty) -> the kinds the game rolls a hire list entry among, in its order
	QolEquip   bool                `json:"qolEquip"`
	DropOnHire bool                `json:"dropOnHire"`
}

// vanillaMercs are the stock 1.13d mercs (a game with no Hireling.txt of its own reads the stock one from its MPQ archives). Checked against
// the Hireling.txt and Skills.txt read out of a stock 1.13d Patch_D2.mpq by parseHireling and hireCandidates (2026-11-14): the same ids, tells
// and roll lists that code gives for them. Act 2's aura changes with the difficulty.
var vanillaMercs = []spec.MercKind{
	{ID: "a1-fire", Label: "Act 1 Rogue Scout: Fire (Inner Sight, Fire Arrow)", Act: 1, Classids: []int{271}, Tell: [3]int{7, 7, 7}},
	{ID: "a1-ice", Label: "Act 1 Rogue Scout: Ice (Inner Sight, Cold Arrow)", Act: 1, Classids: []int{271}, Tell: [3]int{11, 11, 11}},
	{ID: "a2-comb", Label: "Act 2 Desert Mercenary: Combat (Prayer; Thorns in Nightmare)", Act: 2, Classids: []int{338}, Tell: [3]int{99, 103, 99}},
	{ID: "a2-def", Label: "Act 2 Desert Mercenary: Defensive (Defiance; Holy Freeze in Nightmare)", Act: 2, Classids: []int{338}, Tell: [3]int{104, 114, 104}},
	{ID: "a2-off", Label: "Act 2 Desert Mercenary: Offensive (Blessed Aim; Might in Nightmare)", Act: 2, Classids: []int{338}, Tell: [3]int{108, 98, 108}},
	{ID: "a3-fire", Label: "Act 3 Eastern Sorceror: Fire (Inferno, Fire Ball)", Act: 3, Classids: []int{359}, Tell: [3]int{41, 41, 41}},
	{ID: "a3-cold", Label: "Act 3 Eastern Sorceror: Cold (Glacial Spike, Frozen Armor, Ice Blast)", Act: 3, Classids: []int{359}, Tell: [3]int{55, 55, 55}},
	{ID: "a3-ltng", Label: "Act 3 Eastern Sorceror: Lightning (Charged Bolt, Lightning)", Act: 3, Classids: []int{359}, Tell: [3]int{38, 38, 38}},
	{ID: "a5-1hs", Label: "Act 5 Barbarian (Bash, Stun)", Act: 5, Classids: []int{561}},
}

// vanillaCandidates: the stock 1.13d hire list rolls (hireCandidates of the Hireling.txt in a stock Patch_D2.mpq): one row per kind.
func vanillaCandidates() map[string][]string {
	out := map[string][]string{}
	for d := 0; d < 3; d++ {
		ds := strconv.Itoa(d)
		out["1-"+ds] = []string{"a1-fire", "a1-ice"}
		out["2-"+ds] = []string{"a2-comb", "a2-def", "a2-off"}
		out["3-"+ds] = []string{"a3-fire", "a3-cold", "a3-ltng"}
		out["5-"+ds] = []string{"a5-1hs"}
	}
	return out
}

var mercCache struct {
	sync.Mutex
	key   string
	table MercTable
}

// findCI finds a path under dir whose parts match the names in any letter case (Data/global/excel or data/global/excel).
func findCI(dir string, names ...string) string {
	for _, n := range names {
		ents, err := os.ReadDir(dir)
		if err != nil {
			return ""
		}
		found := ""
		for _, e := range ents {
			if strings.EqualFold(e.Name(), n) {
				found = filepath.Join(dir, e.Name())
				break
			}
		}
		if found == "" {
			return ""
		}
		dir = found
	}
	return dir
}

// readTSVBytes reads a tab-separated game table held in memory.
func readTSVBytes(b []byte) []map[string]string {
	var head []string
	var rows []map[string]string
	for _, line := range strings.Split(string(b), "\n") {
		cols := strings.Split(strings.TrimRight(line, "\r"), "\t")
		if head == nil {
			head = cols
			continue
		}
		if len(cols) < 2 {
			continue
		}
		r := map[string]string{}
		for i, c := range cols {
			if i < len(head) {
				r[head[i]] = strings.TrimSpace(c)
			}
		}
		rows = append(rows, r)
	}
	return rows
}

var diffWord = regexp.MustCompile(`(?i)\b(normal|nightmare|hell)\b`)

// kindID is the kind a Hireling.txt row belongs to: "a" + act + "-" + its sub-type without the difficulty word ("Def-Normal" -> "a2-def").
func kindID(r map[string]string) string {
	sub := strings.Trim(diffWord.ReplaceAllString(r["SubType"], ""), " -_")
	slug := strings.ToLower(regexp.MustCompile(`[^A-Za-z0-9]+`).ReplaceAllString(sub, ""))
	id := "a" + r["Act"]
	if slug != "" {
		id += "-" + slug
	}
	return id
}

// hireCandidates is what the game rolls a hire list entry among (D2MOO, MONSTERS_HirelingInit and
// DATATBLS_GetNextHirelingTxtRecordFromActAndDifficulty): the expansion rows (Version exactly 100) of the seller's act and difficulty, the
// first one and then only rows of the same Level, in file order. The client takes candidate SEED_RollLimitedRandomNumber(seed, n) of
// them with the seed the hire list sends (MercHire.js). Duplicates stay: they weigh the roll.
func hireCandidates(rows []map[string]string) map[string][]string {
	out := map[string][]string{}
	level := map[string]string{}
	for _, r := range rows {
		if r["Version"] != "100" {
			continue
		}
		act, _ := strconv.Atoi(r["Act"])
		diff, _ := strconv.Atoi(r["Difficulty"])
		if act < 1 || act > 5 || act == 4 || diff < 1 || diff > 3 { // Act 4 sells no mercs (the 1.13d table has unused Act 4 Barbarian rows)
			continue
		}
		key := strconv.Itoa(act) + "-" + strconv.Itoa(diff-1)
		l, seen := level[key]
		if !seen {
			level[key] = r["Level"]
		} else if l != "" && l != "0" && r["Level"] != l {
			continue
		}
		out[key] = append(out[key], kindID(r))
	}
	return out
}

// parseHireling turns Hireling.txt (and the skill name -> id of Skills.txt) into the kinds a town sells. Only the expansion rows
// (Version 100) count. A kind is an act and a sub-type without its difficulty word ("Def-Normal", "Def-Hell" -> "def"); its tell skill
// in a difficulty is the first of its skills no other kind of that act has there.
func parseHireling(rows []map[string]string, skillID map[string]int) []spec.MercKind {
	type kindAcc struct {
		k     spec.MercKind
		names [3][]string
		class map[int]bool
	}
	var order []string
	acc := map[string]*kindAcc{}
	for _, r := range rows {
		if r["Version"] != "100" {
			continue
		}
		act, _ := strconv.Atoi(r["Act"])
		diff, _ := strconv.Atoi(r["Difficulty"])
		class, _ := strconv.Atoi(r["Class"])
		if act < 1 || act > 5 || act == 4 || diff < 1 || diff > 3 { // Act 4 sells no mercs (the 1.13d table has unused Act 4 Barbarian rows)
			continue
		}
		sub := strings.Trim(diffWord.ReplaceAllString(r["SubType"], ""), " -_")
		id := kindID(r)
		a := acc[id]
		if a == nil {
			a = &kindAcc{k: spec.MercKind{ID: id, Act: act}, class: map[int]bool{}}
			label := "Act " + strconv.Itoa(act) + " " + r["Hireling"]
			if sub != "" {
				label += ": " + sub
			}
			a.k.Label = label
			acc[id] = a
			order = append(order, id)
		}
		if !a.class[class] {
			a.class[class] = true
			a.k.Classids = append(a.k.Classids, class)
		}
		if a.names[diff-1] == nil {
			for i := 1; i <= 6; i++ {
				if s := r["Skill"+strconv.Itoa(i)]; s != "" {
					a.names[diff-1] = append(a.names[diff-1], s)
				}
			}
		}
	}
	var out []spec.MercKind
	for _, id := range order {
		a := acc[id]
		for d := 0; d < 3; d++ {
			a.k.Skills[d] = a.names[d]
			for _, s := range a.names[d] {
				unique := true
				for _, oid := range order {
					o := acc[oid]
					if oid == id || o.k.Act != a.k.Act {
						continue
					}
					for _, os := range o.names[d] {
						if strings.EqualFold(os, s) {
							unique = false
						}
					}
				}
				if sid, ok := skillID[strings.ToLower(s)]; unique && ok {
					a.k.Tell[d] = sid
					break
				}
			}
		}
		if len(a.k.Skills[0]) > 0 {
			a.k.Label += " (" + strings.Join(a.k.Skills[0], ", ") + ")"
		}
		out = append(out, a.k)
	}
	// an act with one kind needs no tell skill
	for i := range out {
		n := 0
		for _, o := range out {
			if o.Act == out[i].Act {
				n++
			}
		}
		if n == 1 {
			out[i].Tell = [3]int{}
		}
	}
	return out
}

// qolMercIni reads qol.ini's [mercenary] equip and drop_items.
func qolMercIni(dir string) (equip, drop bool) {
	b, err := os.ReadFile(findCI(dir, "qol.ini"))
	if err != nil {
		return false, false
	}
	sect := ""
	for _, l := range strings.Split(string(b), "\n") {
		l = strings.TrimSpace(l)
		if strings.HasPrefix(l, "[") {
			sect = strings.ToLower(strings.Trim(l, "[]"))
			continue
		}
		if sect != "mercenary" || strings.HasPrefix(l, ";") {
			continue
		}
		k, v, ok := strings.Cut(l, "=")
		if !ok {
			continue
		}
		on := strings.TrimSpace(v) == "1"
		switch strings.ToLower(strings.TrimSpace(k)) {
		case "equip":
			equip = on
		case "drop_items":
			drop = on
		}
	}
	return
}

func (m *Manager) gameFolder() string {
	if m.cfg.GameDir != "" {
		return m.cfg.GameDir
	}
	if m.cfg.GameExe == "" {
		return ""
	}
	return filepath.Dir(m.cfg.GameExe)
}

// stockMPQs are the archives of the game itself; any other .mpq in the game folder belongs to a mod.
var stockMPQs = map[string]bool{"d2data.mpq": true, "d2exp.mpq": true, "d2char.mpq": true, "d2sfx.mpq": true, "d2music.mpq": true,
	"d2speech.mpq": true, "d2video.mpq": true, "d2xmusic.mpq": true, "d2xtalk.mpq": true, "d2xvideo.mpq": true, "patch_d2.mpq": true}

const (
	mpqHireling = `data\global\excel\hireling.txt`
	mpqSkills   = `data\global\excel\skills.txt`
)

// mercSource finds the game's Hireling.txt and Skills.txt, read only (the user, 2026-11-14): the loose files in Data/global/excel when there
// is a Hireling.txt there (then no archive is opened); else a mod's .mpq that holds one (more than one: an error on the console, the first by
// name is used); else Patch_D2.mpq, d2exp.mpq. Skills.txt comes from the same place, else the next archive that has it. Returns the two files'
// contents, where they came from, the archive files looked at (for the cache) and an error for the console ("" when none).
func mercSource(dir string) (hire, skills []byte, source string, problem string) {
	if excel := findCI(dir, "data", "global", "excel"); excel != "" {
		if h := findCI(excel, "Hireling.txt"); h != "" {
			hire, _ = os.ReadFile(h)
			if sk := findCI(excel, "Skills.txt"); sk != "" {
				skills, _ = os.ReadFile(sk)
			}
			return hire, skills, "Hireling.txt found in " + filepath.Join(excel, filepath.Base(h)), ""
		}
	}
	ents, _ := os.ReadDir(dir)
	var mods, order []string
	for _, e := range ents {
		n := strings.ToLower(e.Name())
		if e.IsDir() || !strings.HasSuffix(n, ".mpq") {
			continue
		}
		if !stockMPQs[n] {
			mods = append(mods, e.Name())
		}
	}
	sort.Strings(mods)
	var withTable []string
	for _, n := range mods {
		if a, err := mpq.Open(filepath.Join(dir, n)); err == nil {
			if a.Has(mpqHireling) {
				withTable = append(withTable, n)
			}
			a.Close()
		}
	}
	if len(withTable) > 1 {
		problem = "MERC TABLE: more than one mod archive holds a Hireling.txt (" + strings.Join(withTable, ", ") + "); using " + withTable[0] +
			". The bots may pick the wrong mercs: keep one, or put the right Hireling.txt in Data/global/excel."
	}
	order = append(withTable, findBase(ents, "patch_d2.mpq"), findBase(ents, "d2exp.mpq"), findBase(ents, "d2data.mpq"))
	for _, n := range order {
		if n == "" {
			continue
		}
		a, err := mpq.Open(filepath.Join(dir, n))
		if err != nil {
			continue
		}
		if hire == nil && a.Has(mpqHireling) {
			if b, err := a.ReadFile(mpqHireling); err == nil {
				hire, source = b, "Hireling.txt found in the archive "+filepath.Join(dir, n)
			}
		}
		if hire != nil && skills == nil && a.Has(mpqSkills) {
			if b, err := a.ReadFile(mpqSkills); err == nil {
				skills = b
			}
		}
		a.Close()
		if hire != nil && skills != nil {
			break
		}
	}
	return hire, skills, source, problem
}

func findBase(ents []os.DirEntry, lower string) string {
	for _, e := range ents {
		if strings.ToLower(e.Name()) == lower {
			return e.Name()
		}
	}
	return ""
}

// mercTable is the merc table of the player's game, read again only when the files change. A problem (two mod archives with a merc table)
// goes to the console once per reading.
func (m *Manager) mercTable() MercTable {
	dir := m.gameFolder()
	qol := m.cfg.Effective().QOL
	key := dir + "|" + strconv.FormatBool(qol)
	if fi, err := os.Stat(findCI(dir, "qol.ini")); err == nil {
		key += "|" + fi.ModTime().Format(time.RFC3339Nano)
	}
	// the stamp of the files a reading would use (cheap: names and times only)
	key += mercStamp(dir)
	mercCache.Lock()
	defer mercCache.Unlock()
	if mercCache.key == key && mercCache.table.Kinds != nil {
		return mercCache.table
	}
	t := MercTable{Source: "no Hireling.txt found in the game folder or its archives: the built-in Diablo II 1.13d mercs", Kinds: vanillaMercs, Candidates: vanillaCandidates()}
	if dir != "" {
		hire, skills, source, problem := mercSource(dir)
		if hire != nil {
			hrows := readTSVBytes(hire)
			ids := map[string]int{}
			for _, r := range readTSVBytes(skills) {
				if id, e := strconv.Atoi(r["Id"]); e == nil && r["skill"] != "" {
					ids[strings.ToLower(r["skill"])] = id
				}
			}
			if kinds := parseHireling(hrows, ids); len(kinds) > 0 {
				t = MercTable{Source: source, Kinds: kinds, Candidates: hireCandidates(hrows)}
			}
		}
		// the console says where the merc table came from (the user, 2026-11-14: "mention in console ... so a user might see it"); the caller
		// may hold m.mu, so the lines go out from their own goroutine
		info := "Merc table: " + t.Source + " (" + strconv.Itoa(len(t.Kinds)) + " kinds of merc)"
		go func() {
			m.logf(0, "", "%s", info)
			if problem != "" {
				m.logf(1, "", "%s", problem)
			}
		}()
	}
	if qol {
		t.QolEquip, t.DropOnHire = qolMercIni(dir)
	}
	mercCache.key, mercCache.table = key, t
	return t
}

// mercStamp: names and times of the files mercSource would look at, without opening any archive.
func mercStamp(dir string) (stamp string) {
	if dir == "" {
		return
	}
	if excel := findCI(dir, "data", "global", "excel"); excel != "" {
		for _, n := range []string{"Hireling.txt", "Skills.txt"} {
			if p := findCI(excel, n); p != "" {
				if fi, err := os.Stat(p); err == nil {
					stamp += "|" + p + fi.ModTime().Format(time.RFC3339Nano)
				}
			}
		}
	}
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		if strings.HasSuffix(strings.ToLower(e.Name()), ".mpq") {
			if fi, err := e.Info(); err == nil {
				stamp += "|" + e.Name() + fi.ModTime().Format(time.RFC3339Nano)
			}
		}
	}
	return
}
