package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"d2qolbot/internal/spec"
)

// words makes quest words with the complete bit set for the given quest ids of each difficulty.
func words(done map[int][]int) (w [3][48]uint16) {
	for d, ids := range done {
		for _, id := range ids {
			w[d][id] = 1
		}
	}
	return w
}

func TestAuditPoints(t *testing.T) {
	// a level 10 Sorceress (class 1): 9 level-ups; Den of Evil and Radament done on Normal = 2 more skill points
	sv := &spec.Save{Class: 1, Level: 10, Skills: map[int]int{36: 5, 37: 5}, UnspentSkills: 0, Str: 10, Dex: 25, Vit: 20, Ene: 35, UnspentStats: 35, MaxLifeRaw: 69 * 256}
	done := words(map[int][]int{0: {1, 9}})
	a := auditPoints(sv, done)
	if a.Skill.Expect != 11 || a.Skill.Have != 10 || a.Skill.Missing != 1 || !a.Problem {
		t.Fatalf("skill: %+v", a)
	}
	if a.Stat.Expect != 80+45 || a.Stat.Have != 125 || a.Stat.Missing != 0 {
		t.Fatalf("stat: %+v", a.Stat)
	}
	text := strings.Join(a.Lines, "\n")
	if !strings.Contains(text, "Radament's Lair (Normal)") || !strings.Contains(text, "1 missing") {
		t.Errorf("the report must name the quest and the shortage:\n%s", text)
	}
	// nothing missing: no problem and no lines
	sv.UnspentSkills = 1
	if b := auditPoints(sv, done); b.Problem || len(b.Lines) != 0 {
		t.Errorf("a complete character is not a problem: %+v", b)
	}
	// Lam Esen's Tome on Hell gives 5 stat points
	sv.Skills = map[int]int{36: 5, 37: 5}
	if c := auditPoints(sv, words(map[int][]int{0: {1, 9}, 2: {17}})); c.Stat.Expect != 80+45+5 || c.Stat.Missing != 5 {
		t.Errorf("tome: %+v", c.Stat)
	}
}

func TestAuditLife(t *testing.T) {
	// a level 10 Sorceress with 20 Vitality should have 40 + 9 + 20 = 69 life; Alkor's Potion of Life on Normal adds 20
	sv := &spec.Save{Class: 1, Level: 10, Skills: map[int]int{36: 9}, Str: 10, Dex: 25, Vit: 20, Ene: 35, UnspentStats: 35, MaxLifeRaw: 69 * 256}
	if a := auditPoints(sv, words(nil)); a.Problem {
		t.Fatalf("no potion owed: %+v", a)
	}
	a := auditPoints(sv, words(map[int][]int{0: {20}}))
	if !a.Problem || a.Life.Expect != 89 || a.Life.Missing != 20 {
		t.Fatalf("a Potion of Life not drunk must show: %+v", a.Life)
	}
	sv.MaxLifeRaw = 88 * 256 // one point of rounding is not a missing potion
	if b := auditPoints(sv, words(map[int][]int{0: {20}})); b.Problem {
		t.Errorf("rounding: %+v", b.Life)
	}
}

// fakeCharacter writes a character file ReadSave and readQuestWords accept: a level 10 Sorceress with the given unspent skill points.
func fakeCharacter(t *testing.T, path string, unspentSkills int, radamentNormal bool) {
	t.Helper()
	b := make([]byte, 1000)
	binary.LittleEndian.PutUint32(b, 0xaa55aa55)
	binary.LittleEndian.PutUint32(b[4:], 0x60)
	binary.LittleEndian.PutUint32(b[8:], uint32(len(b)))
	copy(b[20:], "Fake")
	b[40], b[43] = 1, 10
	copy(b[335:], "Woo!")
	if radamentNormal {
		binary.LittleEndian.PutUint16(b[345+9*2:], 1)
	}
	pos := 752 * 8
	copy(b[750:], "gf")
	put := func(id, bits, v int) {
		if v == 0 { // a real save stores only the attributes that are not zero
			return
		}
		for i := 0; i < 9; i++ {
			setBit(b, pos+i, id>>uint(i)&1)
		}
		pos += 9
		for i := 0; i < bits; i++ {
			setBit(b, pos+i, v>>uint(i)&1)
		}
		pos += bits
	}
	put(0, 10, 10)
	put(1, 10, 35)
	put(2, 10, 25)
	put(3, 10, 20)
	put(4, 10, 35)
	put(5, 8, unspentSkills)
	put(7, 21, 69*256)
	put(12, 7, 10)
	for i := 0; i < 9; i++ {
		setBit(b, pos+i, 1)
	}
	pos += 9
	copy(b[(pos+7)/8:], "if")
	b[(pos+7)/8+2] = 9 // 9 skill points in the first skill
	binary.LittleEndian.PutUint32(b[12:], spec.Checksum(b))
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func setBit(b []byte, pos, v int) {
	if v == 1 {
		b[pos>>3] |= 1 << uint(pos&7)
	} else {
		b[pos>>3] &^= 1 << uint(pos&7)
	}
}

func TestRestorePoints(t *testing.T) {
	root, saves := t.TempDir(), t.TempDir()
	// 9 levels + Den... Radament on Normal owes 1 more skill point: 9 spent + 0 unspent = 9, expected 10
	path := filepath.Join(saves, "Fake.d2s")
	fakeCharacter(t, path, 0, true)
	m := &Manager{root: root, cfg: Config{SaveDir: saves}, logSubs: map[chan LogLine]bool{},
		states: map[string]*State{"Fake": {Profile: Profile{Name: "Fake", Character: "Fake"}, Status: "running"}}}
	if _, err := m.restorePoints("Fake"); err == nil || !strings.Contains(err.Error(), "stop the bot") {
		t.Fatalf("a running bot must be refused: %v", err)
	}
	m.states["Fake"].Status = "stopped"
	msg, err := m.restorePoints("Fake")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(msg, "1 skill point") {
		t.Errorf("message: %s", msg)
	}
	a, _, err := auditFile(path)
	if err != nil || a.Problem {
		t.Fatalf("after the restore nothing may be missing: %v %+v", err, a)
	}
	files, _ := filepath.Glob(filepath.Join(root, "backups", "Fake-*.d2s"))
	if len(files) != 1 {
		t.Fatalf("one backup expected: %v", files)
	}
	if bk, _, err := auditFile(files[0]); err != nil || !bk.Problem {
		t.Errorf("the backup must be the old file: %v %+v", err, bk)
	}
	if _, err := m.restorePoints("Fake"); err == nil || !strings.Contains(err.Error(), "nothing is missing") {
		t.Errorf("a second restore has nothing to do: %v", err)
	}
	if left, _ := filepath.Glob(filepath.Join(saves, "*.qolbot-new")); len(left) != 0 {
		t.Errorf("no temporary file may stay: %v", left)
	}
}

func TestQuestIDByTitle(t *testing.T) {
	for _, c := range []struct {
		act   int
		title string
		id    int
	}{{2, "Radament's Lair", 9}, {1, "Sister's Burial Grounds", 2}, {5, "Seige on Harrogath", 35}, {4, "Terrors End", 26}, {3, "Lam Essen's Tome", 17}, {5, "Betrayal of Haggorath", 38}, {5, "Rescue On Mount Arreat", 36}} {
		if id, ok := questIDByTitle(c.act, c.title); !ok || id != c.id {
			t.Errorf("%d %q -> %d %v, want %d", c.act, c.title, id, ok, c.id)
		}
	}
	if _, ok := questIDByTitle(1, "Radament's Lair"); ok {
		t.Error("a title must be looked for in its own act")
	}
}

func TestVerifyQuestAgainstTheSave(t *testing.T) {
	verifyPoll, verifyPatience, verifyDeadline = 20*time.Millisecond, 100*time.Millisecond, 2*time.Second
	defer func() { verifyPoll, verifyPatience, verifyDeadline = 3*time.Second, 20*time.Second, 2*time.Minute }()
	for _, c := range []struct {
		complete bool
		want     string
	}{{true, "saved"}, {false, "notsaved"}} {
		saves := t.TempDir()
		fakeCharacter(t, filepath.Join(saves, "Fake.d2s"), 0, c.complete) // Radament's Lair complete on Normal, or not
		m := &Manager{root: t.TempDir(), cfg: Config{SaveDir: saves}, logSubs: map[chan LogLine]bool{},
			states: map[string]*State{"Fake": {Profile: Profile{Name: "Fake", Character: "Fake"}, Difficulty: "Normal"}}}
		ev := ActivityEvent{Time: time.Now().Add(-time.Second), Bot: "Fake", Kind: "quest", Name: "Radament's Lair", Detail: "Act 2"}
		m.addEvent(ev)
		m.verifyQuest("Fake", ev)
		if got := m.recentEvents(1)[0].Verified; got != c.want {
			t.Errorf("complete=%v: verified %q, want %q", c.complete, got, c.want)
		}
	}
}
