package d2items

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestRealSaves reads real saves with the real game's tables, when D2ITEMS_GAME (the game folder) and D2ITEMS_SAVES (a folder of .d2s and
// .d2x copies) are set; skipped otherwise.
func TestRealSaves(t *testing.T) {
	game, saves := os.Getenv("D2ITEMS_GAME"), os.Getenv("D2ITEMS_SAVES")
	if game == "" || saves == "" {
		t.Skip("D2ITEMS_GAME and D2ITEMS_SAVES not set")
	}
	src, done := FolderSource(game)
	defer done()
	tb := Load(src)
	t.Logf("tables: %d bases, %d stats, %d uniques, %d set items, %d prefixes, %d suffixes, %d rare names, %d runewords, %d skills, %d strings",
		len(tb.Bases), len(tb.Stats), len(tb.Uniques), len(tb.SetItems), len(tb.Prefixes), len(tb.Suffixes), len(tb.RareNames), len(tb.Runewords), len(tb.Skills), len(tb.strs))
	files, _ := filepath.Glob(filepath.Join(saves, "*.d2s"))
	for _, f := range files {
		b, _ := os.ReadFile(f)
		c, err := ReadSave(b, tb)
		if err != nil {
			t.Errorf("%s: %v", filepath.Base(f), err)
		}
		if c == nil {
			continue
		}
		t.Logf("== %s: %d items, %d corpse, %d merc (type %d, name %d)", filepath.Base(f), len(c.Items), len(c.Corpse), len(c.Merc), c.MercType, c.MercName)
		for _, it := range append(append([]*Item{}, c.Items...), c.Merc...) {
			t.Logf("  %s", Describe(it, tb, 50).Line())
		}
		x := f[:len(f)-4] + ".d2x"
		if b, err := os.ReadFile(x); err == nil {
			pages, err := ReadPlugY(b, tb)
			if err != nil {
				t.Errorf("%s: %v", filepath.Base(x), err)
			}
			for i, p := range pages {
				t.Logf("  stash page %d %q: %d items", i+1, p.Name, len(p.Items))
				for _, it := range p.Items {
					t.Logf("    %s", Describe(it, tb, 50).Line())
				}
			}
		}
	}
}

// TestRealReport prints the report the web page gets, for a look (same variables as TestRealSaves).
func TestRealReport(t *testing.T) {
	game, saves := os.Getenv("D2ITEMS_GAME"), os.Getenv("D2ITEMS_SAVES")
	if game == "" || saves == "" {
		t.Skip("D2ITEMS_GAME and D2ITEMS_SAVES not set")
	}
	src, done := FolderSource(game)
	defer done()
	tb := Load(src)
	files, _ := filepath.Glob(filepath.Join(saves, "*.d2s"))
	for _, f := range files {
		b, _ := os.ReadFile(f)
		c, err := ReadSave(b, tb)
		if err != nil {
			t.Fatal(err)
		}
		x, _ := os.ReadFile(f[:len(f)-4] + ".d2x")
		pages, _ := ReadPlugY(x, tb)
		rep := BuildReport(c, pages, tb, 50, 0, 0)
		js, _ := json.Marshal(rep.Merc)
		t.Logf("%s: %d items, %d pages, merc %s", filepath.Base(f), len(rep.Items), len(rep.Pages), js)
		for _, it := range rep.Items {
			if it.Q == 5 || it.Q == 7 {
				t.Logf("  %+v", it)
				break
			}
		}
	}
}

// TestRealPictures draws the picture of every item in the saves; with D2ITEMS_PNG set (a folder) it writes them there for a look.
func TestRealPictures(t *testing.T) {
	game, saves := os.Getenv("D2ITEMS_GAME"), os.Getenv("D2ITEMS_SAVES")
	if game == "" || saves == "" {
		t.Skip("D2ITEMS_GAME and D2ITEMS_SAVES not set")
	}
	f := OpenFolder(game)
	defer f.Close()
	src, done := FolderSource(game)
	defer done()
	tb := Load(src)
	t.Logf("%d colours, %d type picture sets, %d unique pictures", len(tb.Colors), len(tb.TypeGfx), len(tb.UniquePic))
	files, _ := filepath.Glob(filepath.Join(saves, "*.d2s"))
	seen := map[string]bool{}
	for _, fn := range files {
		b, _ := os.ReadFile(fn)
		c, err := ReadSave(b, tb)
		if c == nil {
			t.Fatal(err)
		}
		x, _ := os.ReadFile(fn[:len(fn)-4] + ".d2x")
		pages, _ := ReadPlugY(x, tb)
		all := append(append([]*Item{}, c.Items...), c.Merc...)
		for _, p := range pages {
			all = append(all, p.Items...)
		}
		for _, it := range all {
			for _, one := range append([]*Item{it}, it.Children...) {
				name := tb.Picture(one)
				if name == "" {
					t.Errorf("%s has no picture", one.Code)
					continue
				}
				if seen[name] {
					continue
				}
				seen[name] = true
				png, err := PicturePNG(name, f)
				if err != nil {
					t.Errorf("%s (%s): %v", one.Code, name, err)
					continue
				}
				if dir := os.Getenv("D2ITEMS_PNG"); dir != "" {
					os.WriteFile(filepath.Join(dir, name+".png"), png, 0o644)
				}
			}
		}
	}
	t.Logf("%d pictures", len(seen))
}

// TestRealSkills prints the skill tree of every class from the real game's tables (same variable as TestRealSaves).
func TestRealSkills(t *testing.T) {
	game := os.Getenv("D2ITEMS_GAME")
	if game == "" {
		t.Skip("D2ITEMS_GAME not set")
	}
	src, done := FolderSource(game)
	defer done()
	tb := Load(src)
	for i, code := range []string{"ama", "sor", "nec", "pal", "bar", "dru", "ass"} {
		list := tb.ClassSkills(code)
		if len(list) != 30 {
			t.Errorf("%s: %d skills in the tree, want 30", code, len(list))
		}
		for _, s := range list {
			t.Logf("%s tab %d (%s) row %d col %d lvl %2d id %3d %s", code, s.Tab, SkillTabName(i, s.Tab), s.Row, s.Col, s.ReqLevel, s.ID, s.Name)
		}
	}
}
