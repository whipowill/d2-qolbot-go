package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"d2qolbot/internal/d2items"
	"d2qolbot/internal/spec"
)

// The inventory window reads the character's save file (the user, 2026-11-15: "lets try to get it to read direct from the save file. that saves on
// crazy logs from the bots, and let's me manipulte characters even without running any bots"): the .d2s, and PlugY's .d2x for the stash pages,
// read only, described with the game's own tables (the mod's first). A running bot saves about once a minute, so this is at most that old.

var itemTables struct {
	sync.Mutex
	dir   string
	stamp string
	at    time.Time
	t     *d2items.Tables
}

// tablesStamp changes when the game's data files change (the loose mod files, the archives).
func tablesStamp(dir string) string {
	var b strings.Builder
	for _, p := range []string{filepath.Join("data", "global", "excel"), filepath.Join("data", "local", "lng", "eng")} {
		parts := strings.Split(p, string(filepath.Separator))
		if d := findCI(dir, parts...); d != "" {
			ents, _ := os.ReadDir(d)
			for _, e := range ents {
				if info, err := e.Info(); err == nil {
					b.WriteString(e.Name() + info.ModTime().String())
				}
			}
		}
	}
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		if strings.HasSuffix(strings.ToLower(e.Name()), ".mpq") {
			if info, err := e.Info(); err == nil {
				b.WriteString(e.Name() + info.ModTime().String())
			}
		}
	}
	return b.String()
}

// gameItemTables loads the game's item tables, again only when the game's files change (looked at at most every 30 s).
func (m *Manager) gameItemTables() *d2items.Tables {
	m.mu.Lock()
	dir := m.gameFolder()
	m.mu.Unlock()
	if dir == "" {
		return nil
	}
	itemTables.Lock()
	defer itemTables.Unlock()
	if itemTables.t != nil && itemTables.dir == dir && time.Since(itemTables.at) < 30*time.Second {
		return itemTables.t
	}
	stamp := tablesStamp(dir)
	if itemTables.t != nil && itemTables.dir == dir && itemTables.stamp == stamp {
		itemTables.at = time.Now()
		return itemTables.t
	}
	src, done := d2items.FolderSource(dir)
	t := d2items.Load(src)
	done()
	if len(t.Bases) == 0 || len(t.Stats) == 0 {
		return nil
	}
	itemTables.dir, itemTables.stamp, itemTables.at, itemTables.t = dir, stamp, time.Now(), t
	return t
}

// saveInventory reads a character's items from its save. problem says why not when it cannot.
func (m *Manager) saveInventory(character string) (rep d2items.Report, at time.Time, problem string) {
	t := m.gameItemTables()
	if t == nil {
		return rep, at, "the game's item tables were not found (is the game folder set?)"
	}
	m.mu.Lock()
	path := m.savePath(character)
	m.mu.Unlock()
	b, err := os.ReadFile(path)
	if err != nil {
		return rep, at, "no save file for " + character
	}
	if info, err := os.Stat(path); err == nil {
		at = info.ModTime()
	}
	head, err := spec.ParseSave(b)
	if err != nil {
		return rep, at, "the save of " + character + " could not be read: " + err.Error()
	}
	c, err := d2items.ReadSave(b, t)
	if c == nil {
		return rep, at, "the items of " + character + " could not be read: " + err.Error()
	}
	if err != nil {
		problem = "some items could not be read: " + err.Error()
	}
	var pages []d2items.StashPage
	if x, err := os.ReadFile(strings.TrimSuffix(path, filepath.Ext(path)) + ".d2x"); err == nil {
		pages, err = d2items.ReadPlugY(x, t)
		if err != nil && problem == "" {
			problem = "some stash items could not be read: " + err.Error()
		}
	}
	return d2items.BuildReport(c, pages, t, head.Level, head.Gold, head.Stash), at, problem
}

// The item pictures: drawn from the game's .dc6 files once each, kept in memory. The game's archives stay open while pictures are asked
// for and are closed a minute after the last one.
var itemPics struct {
	sync.Mutex
	dir    string
	folder *d2items.Folder
	used   time.Time
	pngs   map[string][]byte
}

func (m *Manager) itemPicture(name string) ([]byte, error) {
	m.mu.Lock()
	dir := m.gameFolder()
	m.mu.Unlock()
	if dir == "" {
		return nil, fmt.Errorf("no game folder")
	}
	itemPics.Lock()
	defer itemPics.Unlock()
	if itemPics.dir != dir {
		if itemPics.folder != nil {
			itemPics.folder.Close()
			itemPics.folder = nil
		}
		itemPics.dir, itemPics.pngs = dir, map[string][]byte{}
	}
	if b, ok := itemPics.pngs[name]; ok {
		return b, nil
	}
	if itemPics.folder == nil {
		itemPics.folder = d2items.OpenFolder(dir)
		go func() {
			for {
				time.Sleep(20 * time.Second)
				itemPics.Lock()
				if itemPics.folder == nil {
					itemPics.Unlock()
					return
				}
				if time.Since(itemPics.used) > time.Minute {
					itemPics.folder.Close()
					itemPics.folder = nil
					itemPics.Unlock()
					return
				}
				itemPics.Unlock()
			}
		}()
	}
	itemPics.used = time.Now()
	b, err := d2items.PicturePNG(name, itemPics.folder)
	if err != nil {
		return nil, err
	}
	itemPics.pngs[name] = b
	return b, nil
}

// apiItemPicture: GET /api/itempic?f=<picture name from the inventory report>, a PNG.
func (m *Manager) apiItemPicture(w http.ResponseWriter, r *http.Request) {
	b, err := m.itemPicture(r.URL.Query().Get("f"))
	if err != nil {
		http.Error(w, err.Error(), 404)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "max-age=3600")
	w.Write(b)
}

// apiFont: GET /font/<file>, the game's fonts from the fonts folder (not in the repo: the user's own copies). The page falls back to its own
// fonts without them.
func (m *Manager) apiFont(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/font/")
	if !fontName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "max-age=86400")
	http.ServeFile(w, r, filepath.Join(m.root, "fonts", name))
}

var fontName = regexp.MustCompile(`^[A-Za-z0-9_-]+\.(ttf|otf|woff2?)$`)

// CharSheet is what the Stats and Skills tabs of the profile window show, read from the save (no bot has to run): the base values, without gear.
type CharSheet struct {
	Name          string     `json:"name"`
	Class         string     `json:"class"`
	Level         int        `json:"level"`
	Hardcore      bool       `json:"hardcore,omitempty"`
	Expansion     bool       `json:"expansion"`
	Exp           int        `json:"exp"`
	Str           int        `json:"str"`
	Dex           int        `json:"dex"`
	Vit           int        `json:"vit"`
	Ene           int        `json:"ene"`
	UnspentStats  int        `json:"unspentStats"`
	UnspentSkills int        `json:"unspentSkills"`
	Life          int        `json:"life"` // base maximum life, without gear
	Mana          int        `json:"mana"`
	Stamina       int        `json:"stamina"`
	Gold          int        `json:"gold"`
	Stash         int        `json:"stash"`
	Tabs          []SkillTab `json:"tabs"`
}

// SkillTab is a tab of the class's skill tree with every skill of it and the points the character has put in.
type SkillTab struct {
	Name   string       `json:"name"`
	Points int          `json:"points"`
	Skills []SkillPoint `json:"skills"`
}

type SkillPoint struct {
	d2items.SkillInfo
	Points int `json:"points"`
}

// charSheet reads the Stats and Skills of a character from its save. nil when the save or the game's tables are not there.
func (m *Manager) charSheet(character string) *CharSheet {
	m.mu.Lock()
	path := m.savePath(character)
	m.mu.Unlock()
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	h, err := spec.ParseSave(b)
	if err != nil {
		return nil
	}
	ci := &CharSheet{Name: h.Name, Level: h.Level, Hardcore: h.Hardcore, Expansion: h.Expansion, Exp: h.Exp, Str: h.Str, Dex: h.Dex, Vit: h.Vit, Ene: h.Ene,
		UnspentStats: h.UnspentStats, UnspentSkills: h.UnspentSkills, Life: h.MaxLifeRaw / 256, Mana: h.MaxManaRaw / 256, Stamina: h.MaxStamRaw / 256,
		Gold: h.Gold, Stash: h.Stash, Tabs: []SkillTab{}}
	if h.Class >= 0 && h.Class < len(spec.ClassNames) {
		ci.Class = spec.ClassNames[h.Class]
	}
	t := m.gameItemTables()
	if t == nil {
		return ci
	}
	codes := []string{"ama", "sor", "nec", "pal", "bar", "dru", "ass"}
	if h.Class < 0 || h.Class >= len(codes) {
		return ci
	}
	byTab := map[int]*SkillTab{}
	for _, sk := range t.ClassSkills(codes[h.Class]) {
		tab := byTab[sk.Tab]
		if tab == nil {
			name := d2items.SkillTabName(h.Class, sk.Tab)
			if name == "" {
				name = fmt.Sprintf("Tab %d", sk.Tab)
			}
			tab = &SkillTab{Name: name}
			byTab[sk.Tab] = tab
		}
		pts := h.Skills[sk.ID]
		tab.Points += pts
		tab.Skills = append(tab.Skills, SkillPoint{SkillInfo: sk, Points: pts})
	}
	for n := 1; n <= 3; n++ {
		if tab := byTab[n]; tab != nil {
			ci.Tabs = append(ci.Tabs, *tab)
		}
	}
	return ci
}
