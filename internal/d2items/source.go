package d2items

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"d2qolbot/internal/mpq"
)

// stock are the game's own archives; any other .mpq in the game folder is a mod's.
var stock = map[string]bool{"d2data.mpq": true, "d2exp.mpq": true, "d2char.mpq": true, "d2sfx.mpq": true, "d2music.mpq": true,
	"d2speech.mpq": true, "d2video.mpq": true, "d2xmusic.mpq": true, "d2xtalk.mpq": true, "d2xvideo.mpq": true, "patch_d2.mpq": true}

// Folder reads the game's files the way a modded game finds them, read only: a loose file below the game folder first, then the mods'
// archives (by name), then Patch_D2.mpq, d2exp.mpq and d2data.mpq. Close releases the archives.
type Folder struct {
	dir      string
	archives []*mpq.Archive
}

func OpenFolder(dir string) *Folder {
	ents, _ := os.ReadDir(dir)
	var mods []string
	for _, e := range ents {
		n := strings.ToLower(e.Name())
		if !e.IsDir() && strings.HasSuffix(n, ".mpq") && !stock[n] {
			mods = append(mods, e.Name())
		}
	}
	sort.Strings(mods)
	for _, base := range []string{"patch_d2.mpq", "d2exp.mpq", "d2data.mpq"} {
		for _, e := range ents {
			if strings.ToLower(e.Name()) == base {
				mods = append(mods, e.Name())
			}
		}
	}
	f := &Folder{dir: dir}
	for _, n := range mods {
		if a, err := mpq.Open(filepath.Join(dir, n)); err == nil {
			f.archives = append(f.archives, a)
		}
	}
	return f
}

// File is a file by its path in the archives (`data\global\items\invcap.dc6`), or nil.
func (f *Folder) File(inner string) []byte {
	inner = strings.ToLower(inner)
	if p := findCI(f.dir, strings.Split(inner, `\`)...); p != "" {
		if b, err := os.ReadFile(p); err == nil {
			return b
		}
	}
	for _, a := range f.archives {
		if a.Has(inner) {
			if b, err := a.ReadFile(inner); err == nil {
				return b
			}
		}
	}
	return nil
}

func (f *Folder) Close() {
	for _, a := range f.archives {
		a.Close()
	}
	f.archives = nil
}

// FolderSource is the Source of a game folder: the .txt tables from data\global\excel, the .tbl strings from data\local\lng\eng.
func FolderSource(dir string) (Source, func()) {
	f := OpenFolder(dir)
	return func(name string) []byte {
		if strings.HasSuffix(strings.ToLower(name), ".tbl") {
			return f.File(`data\local\lng\eng\` + name)
		}
		return f.File(`data\global\excel\` + name)
	}, f.Close
}

// findCI finds a path below dir, matching each part without regard to case (the game folder comes from Windows).
func findCI(dir string, parts ...string) string {
	cur := dir
	for _, p := range parts {
		ents, err := os.ReadDir(cur)
		if err != nil {
			return ""
		}
		found := ""
		for _, e := range ents {
			if strings.EqualFold(e.Name(), p) {
				found = e.Name()
				break
			}
		}
		if found == "" {
			return ""
		}
		cur = filepath.Join(cur, found)
	}
	return cur
}
