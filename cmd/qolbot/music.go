package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// The game's music on the web page (the music button): the track of the zone the leader is in, read out of the game's MPQ archives on request by
// d2bridge -extract (StormLib.dll of the game folder) and handed to the browser from memory. Never written to disk (the user: the music must not be
// extracted to files): the last two tracks stay in memory so a zone change back and forth does not read them again.

// musicZones maps a zone name (as the bots report it: Pather.getAreaName) to its track (data\global\music\<track>.wav). The pairs follow the game's
// own choice as far as it is known; zones not listed play their act's wilderness track (musicAct).
var musicZones = map[string]string{
	"Menu": "Common/options",
	// Act 1
	"Rogue Encampment": "Act1/town1", "Den Of Evil": "Act1/caves", "Cave Level 1": "Act1/caves", "Cave Level 2": "Act1/caves",
	"Underground Passage Level 1": "Act1/caves", "Underground Passage Level 2": "Act1/caves", "Hole Level 1": "Act1/caves", "Hole Level 2": "Act1/caves",
	"Pit Level 1": "Act1/caves", "Pit Level 2": "Act1/caves", "Crypt": "Act1/crypt", "Mausoleum": "Act1/crypt", "Forgotten Tower": "Act1/crypt",
	"Tower Cellar Level 1": "Act1/crypt", "Tower Cellar Level 2": "Act1/crypt", "Tower Cellar Level 3": "Act1/crypt", "Tower Cellar Level 4": "Act1/crypt",
	"Tower Cellar Level 5": "Act1/crypt", "Monastery Gate": "Act1/monastery", "Outer Cloister": "Act1/monastery", "Barracks": "Act1/monastery",
	"Jail Level 1": "Act1/monastery", "Jail Level 2": "Act1/monastery", "Jail Level 3": "Act1/monastery", "Inner Cloister": "Act1/monastery",
	"Cathedral": "Act1/monastery", "Catacombs Level 1": "Act1/crypt", "Catacombs Level 2": "Act1/crypt", "Catacombs Level 3": "Act1/crypt",
	"Catacombs Level 4": "Act1/crypt", "Tristram": "Act1/tristram",
	// Act 2 (the Act 3 sewers have the same names as these: they play the Act 2 sewer track)
	"Lut Gholein": "Act2/town2", "Valley Of Snakes": "Act2/valley", "Canyon Of The Magi": "Act2/valley", "Sewers Level 1": "Act2/sewer",
	"Sewers Level 2": "Act2/sewer", "Sewers Level 3": "Act2/sewer", "Harem Level 1": "Act2/harem", "Harem Level 2": "Act2/harem",
	"Palace Cellar Level 1": "Act2/harem", "Palace Cellar Level 2": "Act2/harem", "Palace Cellar Level 3": "Act2/harem",
	"Stony Tomb Level 1": "Act2/tombs", "Stony Tomb Level 2": "Act2/tombs", "Halls Of The Dead Level 1": "Act2/tombs",
	"Halls Of The Dead Level 2": "Act2/tombs", "Halls Of The Dead Level 3": "Act2/tombs", "Claw Viper Temple Level 1": "Act2/lair",
	"Claw Viper Temple Level 2": "Act2/lair", "Maggot Lair Level 1": "Act2/lair", "Maggot Lair Level 2": "Act2/lair", "Maggot Lair Level 3": "Act2/lair",
	"Ancient Tunnels": "Act2/lair", "Tal Rashas Tomb #1": "Act2/tombs", "Tal Rashas Tomb #2": "Act2/tombs", "Tal Rashas Tomb #3": "Act2/tombs",
	"Tal Rashas Tomb #4": "Act2/tombs", "Tal Rashas Tomb #5": "Act2/tombs", "Tal Rashas Tomb #6": "Act2/tombs", "Tal Rashas Tomb #7": "Act2/tombs",
	"Duriels Lair": "Act2/tombs", "Arcane Sanctuary": "Act2/sanctuary",
	// Act 3
	"Kurast Docktown": "Act3/town3", "Lower Kurast": "Act3/kurast", "Kurast Bazaar": "Act3/kurast", "Upper Kurast": "Act3/kurast",
	"Kurast Causeway": "Act3/kurast", "Travincal": "Act3/kurast", "Spider Cave": "Act3/spider", "Spider Cavern": "Act3/spider",
	"Swampy Pit Level 1": "Act3/spider", "Swampy Pit Level 2": "Act3/spider", "Swampy Pit Level 3": "Act3/spider", "Flayer Dungeon Level 1": "Act3/spider",
	"Flayer Dungeon Level 2": "Act3/spider", "Flayer Dungeon Level 3": "Act3/spider", "Ruined Temple": "Act3/kurastsewer", "Disused Fane": "Act3/kurastsewer",
	"Forgotten Reliquary": "Act3/kurastsewer", "Forgotten Temple": "Act3/kurastsewer", "Ruined Fane": "Act3/kurastsewer",
	"Disused Reliquary": "Act3/kurastsewer", "Durance Of Hate Level 1": "Act3/kurastsewer", "Durance Of Hate Level 2": "Act3/kurastsewer",
	"Durance Of Hate Level 3": "Act3/kurastsewer",
	// Act 4
	"The Pandemonium Fortress": "Act4/town4", "River Of Flame": "Act4/mesa", "Chaos Sanctuary": "Act4/diablo",
	// Act 5
	"Harrogath": "Act5/xtown", "Bloody Foothills": "Act5/siege", "Crystalline Passage": "Act5/icecaves", "Frozen River": "Act5/icecaves",
	"Glacial Trail": "Act5/icecaves", "Drifter Cavern": "Act5/icecaves", "Icy Cellar": "Act5/icecaves", "Abaddon": "Act5/icecaves",
	"Pit Of Acheron": "Act5/icecaves", "Infernal Pit": "Act5/icecaves", "Nihlathak's Temple": "Act5/xtemple", "Halls Of Anguish": "Act5/xtemple",
	"Halls Of Pain": "Act5/xtemple", "Halls Of Vaught": "Act5/xtemple", "Worldstone Keep Level 1": "Act5/baal",
	"Worldstone Keep Level 2": "Act5/baal", "Worldstone Keep Level 3": "Act5/baal", "Throne Of Destruction": "Act5/baal",
	"The Worldstone Chamber": "Act5/baal",
}

// musicAct: the wilderness track of each act, for the zones musicZones does not name (Blood Moor, Rocky Waste, Spider Forest, Outer Steppes...)
var musicAct = map[string][]string{
	"Act1/wild":   {"Blood Moor", "Cold Plains", "Stony Field", "Dark Wood", "Black Marsh", "Tamoe Highland", "Burial Grounds", "Moo Moo Farm"},
	"Act2/desert": {"Rocky Waste", "Dry Hills", "Far Oasis", "Lost City"},
	"Act3/jungle": {"Spider Forest", "Great Marsh", "Flayer Jungle"},
	"Act4/mesa":   {"Outer Steppes", "Plains Of Despair", "City Of The Damned"},
	"Act5/siege":  {"Frigid Highlands", "Arreat Plateau", "Frozen Tundra", "Ancient's Way", "Arreat Summit"},
}

// musicShuffle: the tracks played at random while no bot runs, chosen by hand: the music, without the short event pieces and sound beds of the
// list (the "...action" and "...resolution" files, and shenkmusic, nihlathakmusic, baalmusic: 12 to 31 seconds each, the game's sizes tell) (the user:
// "there are maybe bg sounds in this list")
var musicShuffle = []string{
	"Common/options",
	"Act1/town1", "Act1/wild", "Act1/caves", "Act1/crypt", "Act1/monastery", "Act1/tristram",
	"Act2/town2", "Act2/desert", "Act2/valley", "Act2/sewer", "Act2/harem", "Act2/tombs", "Act2/lair", "Act2/sanctuary",
	"Act3/town3", "Act3/jungle", "Act3/kurast", "Act3/spider", "Act3/kurastsewer",
	"Act4/town4", "Act4/mesa", "Act4/diablo",
	"Act5/xtown", "Act5/siege", "Act5/icecaves", "Act5/xtemple", "Act5/baal",
}

// musicTrack is the track for a zone ("" when nothing should play: an unknown zone, or no zone).
func musicTrack(zone string) string {
	if t, ok := musicZones[zone]; ok {
		return t
	}
	for t, zones := range musicAct {
		for _, z := range zones {
			if z == zone {
				return t
			}
		}
	}
	return ""
}

// musicAll: the game's music (the list files of d2music.mpq and D2xMusic.mpq), with a name for the Music tab, in the tab's order. A request can name
// only these. Left out: the 14 files under a minute, the short pieces the game plays at an event (the "...action" and "...resolution" files, Shenk,
// Nihlathak, Baal: 12 to 31 seconds) (the user, 2026-11-14: "delist tracks under 1 minute").
type musicEntry struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Group string `json:"group"`
}

var musicAll = []musicEntry{
	{"Common/options", "Main Menu", "The game"}, {"introedit", "Introduction (Lord of Destruction)", "The game"},
	{"Act1/town1", "Rogue Encampment", "Act 1"}, {"Act1/wild", "Wilderness", "Act 1"}, {"Act1/caves", "Caves", "Act 1"},

	{"Act1/crypt", "Crypts and the Tower", "Act 1"}, {"Act1/tristram", "Tristram", "Act 1"}, {"Act1/monastery", "Monastery", "Act 1"},

	{"Act2/town2", "Lut Gholein", "Act 2"}, {"Act2/desert", "Desert", "Act 2"}, {"Act2/sewer", "Sewers", "Act 2"},
	{"Act2/valley", "Valley of Snakes", "Act 2"}, {"Act2/lair", "Lairs", "Act 2"},
	{"Act2/harem", "Palace", "Act 2"}, {"Act2/sanctuary", "Arcane Sanctuary", "Act 2"},
	{"Act2/tombs", "Tombs", "Act 2"},
	{"Act3/town3", "Kurast Docks", "Act 3"}, {"Act3/jungle", "Jungle", "Act 3"}, {"Act3/spider", "Spider Caves and Dungeons", "Act 3"},
	{"Act3/kurast", "Kurast", "Act 3"}, {"Act3/kurastsewer", "Temples and the Durance", "Act 3"},

	{"Act4/town4", "Pandemonium Fortress", "Act 4"}, {"Act4/mesa", "Plains of Despair", "Act 4"},
	{"Act4/diablo", "Chaos Sanctuary", "Act 4"},
	{"Act5/xtown", "Harrogath", "Act 5"}, {"Act5/siege", "Siege on Harrogath and the Highlands", "Act 5"},
	{"Act5/icecaves", "Ice Caves", "Act 5"}, {"Act5/xtemple", "Nihlathak's Temple", "Act 5"},
	{"Act5/baal", "Worldstone Keep", "Act 5"},
}

func musicTrackKnown(track string) bool {
	for _, e := range musicAll {
		if e.ID == track {
			return true
		}
	}
	return false
}

type musicCache struct {
	mu     sync.Mutex
	tracks map[string][]byte
	order  []string
	busy   map[string]*sync.Mutex
	last   time.Time   // the last request for a track
	timer  *time.Timer // empties the cache musicIdle after the last request (the music muted, or the page closed)
}

// musicIdle: with no track asked for this long, the tracks held in memory are let go (the user: no memory used while the music is muted)
const musicIdle = 10 * time.Minute

// musicTouch notes a request and (re)arms the timer that empties the cache once requests stop.
func musicTouch() {
	music.mu.Lock()
	defer music.mu.Unlock()
	music.last = time.Now()
	if music.timer == nil {
		music.timer = time.AfterFunc(musicIdle, musicExpire)
	} else {
		music.timer.Reset(musicIdle)
	}
}

func musicExpire() {
	music.mu.Lock()
	defer music.mu.Unlock()
	if time.Since(music.last) < musicIdle {
		music.timer.Reset(musicIdle - time.Since(music.last))
		return
	}
	music.tracks, music.order = map[string][]byte{}, nil
}

var music = musicCache{tracks: map[string][]byte{}, busy: map[string]*sync.Mutex{}}

// musicRead returns a track's WAV bytes: from memory, or read out of the game's archive by d2bridge -extract (a few seconds under Wine).
func (m *Manager) musicRead(track string) ([]byte, error) {
	music.mu.Lock()
	if b, ok := music.tracks[track]; ok {
		music.mu.Unlock()
		return b, nil
	}
	lk := music.busy[track]
	if lk == nil {
		lk = &sync.Mutex{}
		music.busy[track] = lk
	}
	music.mu.Unlock()
	lk.Lock() // one read per track at a time: the page asks again while the first read runs
	defer lk.Unlock()
	music.mu.Lock()
	if b, ok := music.tracks[track]; ok {
		music.mu.Unlock()
		return b, nil
	}
	music.mu.Unlock()

	m.mu.Lock()
	gameExe, wine := m.cfg.GameExe, m.cfg.Wine
	m.mu.Unlock()
	if gameExe == "" {
		return nil, fmt.Errorf("the game folder is not set")
	}
	dir := filepath.Dir(gameExe)
	if _, err := os.Stat(filepath.Join(dir, "StormLib.dll")); err != nil {
		return nil, fmt.Errorf("no StormLib.dll in the game folder: the music cannot be read")
	}
	archive, name := musicArchive(track), musicFile(track)
	cmd := m.bridgeTool(wine, "-extract", toWin(dir), toWin(filepath.Join(dir, archive)), name)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	done := make(chan error, 1)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err != nil {
			return nil, fmt.Errorf("%v: %s", err, strings.TrimSpace(lastLine(errb.String())))
		}
	case <-time.After(90 * time.Second):
		cmd.Process.Kill()
		return nil, fmt.Errorf("reading %s took too long", track)
	}
	b := out.Bytes()
	if len(b) < 44 || string(b[:4]) != "RIFF" {
		return nil, fmt.Errorf("%s: not a WAV (%d bytes): %s", track, len(b), strings.TrimSpace(lastLine(errb.String())))
	}
	music.mu.Lock()
	music.tracks[track] = b
	music.order = append(music.order, track)
	for len(music.order) > 2 { // the current track and the one before it
		delete(music.tracks, music.order[0])
		music.order = music.order[1:]
	}
	music.mu.Unlock()
	return b, nil
}

// bridgeTool is a one-off run of d2bridge.exe (under Wine in the Qolbot prefix, never the user's own: the user, "you'd have to use the prefix qolbot
// uses"; no display is needed)
func (m *Manager) bridgeTool(wine string, args ...string) *exec.Cmd {
	exe := filepath.Join(m.root, "d2bridge.exe")
	if runtime.GOOS == "windows" {
		return exec.Command(exe, args...)
	}
	cmd := exec.Command(wine, append([]string{exe}, args...)...)
	cmd.Env = append(os.Environ(), "WINEPREFIX="+m.prefixPath(), "WINEDEBUG=-all", "WINEDLLOVERRIDES=winemenubuilder.exe=d")
	return cmd
}

func musicArchive(track string) string {
	if strings.HasPrefix(track, "Act5/") || track == "Act4/diabloaction" || track == "introedit" {
		return "D2xMusic.mpq"
	}
	return "d2music.mpq"
}

func musicFile(track string) string {
	return `data\global\music\` + strings.ReplaceAll(track, "/", `\`) + ".wav"
}

var musicLen struct {
	once sync.Once
	secs map[string]int
}

// musicLengths: each track's length in seconds (the Music tab), worked out once per run from the archive's file size and the WAV header's byte rate
// (d2bridge -info: the first 44 bytes of each file, nothing more). Empty when the game folder or StormLib.dll is missing.
func (m *Manager) musicLengths() map[string]int {
	musicLen.once.Do(func() {
		musicLen.secs = map[string]int{}
		m.mu.Lock()
		gameExe, wine := m.cfg.GameExe, m.cfg.Wine
		m.mu.Unlock()
		if gameExe == "" {
			return
		}
		dir := filepath.Dir(gameExe)
		byArchive := map[string][]string{}
		for _, e := range musicAll {
			a := musicArchive(e.ID)
			byArchive[a] = append(byArchive[a], e.ID)
		}
		for archive, tracks := range byArchive {
			args := []string{"-info", toWin(dir), toWin(filepath.Join(dir, archive))}
			byFile := map[string]string{}
			for _, t := range tracks {
				args = append(args, musicFile(t))
				byFile[strings.ToLower(musicFile(t))] = t
			}
			cmd := m.bridgeTool(wine, args...)
			var out bytes.Buffer
			cmd.Stdout = &out
			if err := cmd.Start(); err != nil {
				continue
			}
			t := time.AfterFunc(60*time.Second, func() { cmd.Process.Kill() })
			cmd.Wait()
			t.Stop()
			for _, line := range strings.Split(out.String(), "\n") {
				f := strings.Split(strings.TrimSpace(line), "\t")
				if len(f) != 3 {
					continue
				}
				var size, rate int
				fmt.Sscan(f[1], &size)
				fmt.Sscan(f[2], &rate)
				if tr, ok := byFile[strings.ToLower(f[0])]; ok && rate > 0 && size > 44 {
					musicLen.secs[tr] = (size - 44 + rate/2) / rate
				}
			}
		}
	})
	return musicLen.secs
}

func lastLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.LastIndexByte(s, '\n'); i >= 0 {
		return s[i+1:]
	}
	return s
}

// GET /api/music?zone=<zone>: {"track": "Act1/crypt"} (the page cross-fades only when the track changes)
// GET /api/music?track=Act1/crypt: the WAV itself (Range requests work: the browser's audio element uses them)
func (m *Manager) apiMusic(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("list") != "" { // every track (the Music tab) and the ones played at random while no bot runs
		w.Header().Set("Content-Type", "application/json")
		secs := m.musicLengths()
		type row struct {
			musicEntry
			Secs int `json:"secs,omitempty"`
		}
		var rows []row
		for _, e := range musicAll {
			rows = append(rows, row{e, secs[e.ID]})
		}
		json.NewEncoder(w).Encode(map[string]any{"tracks": rows, "shuffle": musicShuffle})
		return
	}
	if _, ok := q["zone"]; ok {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"track": musicTrack(q.Get("zone"))})
		return
	}
	track := q.Get("track")
	if !musicTrackKnown(track) {
		http.Error(w, "unknown track", 404)
		return
	}
	musicTouch()
	b, err := m.musicRead(track)
	if err != nil {
		m.logf(0, "", "music: %s: %v", track, err)
		http.Error(w, err.Error(), 503)
		return
	}
	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Cache-Control", "no-store") // the browser keeps nothing either
	http.ServeContent(w, r, track+".wav", time.Time{}, bytes.NewReader(b))
}
