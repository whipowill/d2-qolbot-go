package main

import (
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var classNames = []string{"Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"}

// CharInfo is what we read out of a .d2s header.
type CharInfo struct {
	Class     string `json:"class"`
	Level     int    `json:"level"`
	Hardcore  bool   `json:"hardcore"`
	Expansion bool   `json:"expansion"`
	ConfigOK  bool   `json:"configOk"` // libs/config/<Class>.<Name>.js exists; otherwise kolbot uses the shared <Class>.js
}

// readD2S parses the fixed header of a 1.10+ character file.
func readD2S(path string) (name string, ci CharInfo, ok bool) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	b := make([]byte, 48)
	if n, _ := f.Read(b); n < 48 || binary.LittleEndian.Uint32(b) != 0xaa55aa55 || binary.LittleEndian.Uint32(b[4:]) < 0x60 {
		return
	}
	name = string(b[20:36])
	if i := strings.IndexByte(name, 0); i >= 0 {
		name = name[:i]
	}
	if name == "" || int(b[40]) >= len(classNames) {
		return
	}
	ci = CharInfo{Class: classNames[b[40]], Level: int(b[43]), Hardcore: b[36]&0x04 != 0, Expansion: b[36]&0x20 != 0}
	return name, ci, true
}

func (m *Manager) saveDir() string {
	if m.cfg.SaveDir != "" {
		return m.cfg.SaveDir
	}
	dir := m.cfg.GameDir
	if dir == "" {
		if m.cfg.GameExe == "" {
			return "" // game path not set yet
		}
		dir = filepath.Dir(m.cfg.GameExe)
	}
	return filepath.Join(dir, "Save")
}

// scanCharacters reads every .d2s in the save folder, refreshes the class/level
// info of known profiles and creates a profile for each new character.
// It returns how many profiles were added.
func (m *Manager) scanCharacters() int {
	if m.saveDir() == "" {
		return 0
	}
	files, _ := filepath.Glob(filepath.Join(m.saveDir(), "*.d2s"))
	sort.Strings(files)
	m.mu.Lock()
	defer m.mu.Unlock()
	added := 0
	for _, f := range files {
		name, ci, ok := readD2S(f)
		if !ok {
			continue
		}
		_, err := os.Stat(filepath.Join(m.root, "d2bs", "kolbot", "libs", "config", ci.Class+"."+name+".js"))
		ci.ConfigOK = err == nil
		s := m.states[name]
		if s == nil {
			s = &State{Profile: Profile{Name: name, Character: name}, Status: "stopped"}
			m.states[name] = s
			added++
		}
		if s.Char != nil && (s.Status == "running" || s.Status == "starting") && s.Char.Level > ci.Level {
			ci.Level = s.Char.Level // a level-up the save file has not caught up with yet
		}
		s.Char = &ci
	}
	return added
}

// dropMissingCharacters removes the profiles of characters whose save file is gone (deleted in the game), so a rescan shows what is really
// there. A profile that is running or wanted is kept, and nothing is removed when the save folder holds no characters at all (a wrong path
// would otherwise wipe the list). It returns the names it removed.
func (m *Manager) dropMissingCharacters() []string {
	dir := m.saveDir()
	if dir == "" {
		return nil
	}
	if files, _ := filepath.Glob(filepath.Join(dir, "*.d2s")); len(files) == 0 {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	var gone []string
	for name, s := range m.states {
		if s.Wanted || s.Status != "stopped" {
			continue
		}
		char := s.Character
		if char == "" {
			char = name
		}
		if _, err := os.Stat(filepath.Join(dir, char+".d2s")); os.IsNotExist(err) {
			gone = append(gone, name)
		}
	}
	sort.Strings(gone)
	for _, n := range gone {
		delete(m.states, n)
	}
	return gone
}

// saveConfig writes the current profiles back into qolbot.json (everything else
// in the file is preserved) and regenerates d2bs.ini.
func (m *Manager) saveConfig() error {
	m.mu.Lock()
	cfg := m.cfg
	cfg.Profiles = nil
	names := make([]string, 0, len(m.states))
	for n := range m.states {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		cfg.Profiles = append(cfg.Profiles, m.states[n].Profile)
	}
	m.mu.Unlock()
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(m.cfgPath, append(b, '\n'), 0o660); err != nil {
		return err
	}
	return m.writeD2BSIni()
}

// writeBotNames records which characters are being run as bots, in
// d2bs/kolbot/data/bots.json. Follower.js treats the first player in the game
// who is NOT in "bots" as the real player to follow, unless "leader" names the
// character the user picked in the web UI.
func (m *Manager) writeBotNames() {
	m.mu.Lock()
	names := []string{}
	for _, s := range m.states {
		if s.Wanted {
			names = append(names, s.Character)
		}
	}
	player := m.cfg.Player
	team := append([]string{}, m.expectTeam...)
	m.mu.Unlock()
	sort.Strings(names)
	b, _ := json.Marshal(map[string]any{"leader": player, "bots": names, "team": team})
	path := filepath.Join(m.root, "d2bs", m.cfg.ScriptPath, "data", "bots.json")
	os.MkdirAll(filepath.Dir(path), 0o755)
	if err := os.WriteFile(path, b, 0o660); err != nil {
		m.logf(9, "", "cannot write %s: %v", path, err)
		return
	}
	m.dbgf("", "bots.json = %s", b)
}
