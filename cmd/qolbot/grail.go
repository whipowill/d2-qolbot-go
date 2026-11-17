package main

// The Holy Grail on the Activity page. Quartermaster (the user's mod) keeps the grail in its own file in the game folder, quartermaster_grail.txt:
//
//	# Progress: 200 of 526 found (38.0%)
//	kind|index|name|found on|found by        (a line with a date and a character is found)
//
// Qolbot only READS that file (the game folder is never written). The mod's own message ("Congratulations! You are X% complete ...") is a client-side
// print that no bot can read, so the file is the way: every 30 seconds a new find becomes a "Holy Grail" entry with the item, who found it and the
// progress (2026-11-13, the user: the grail tracking Qolbot wanted comes from the mod's file).

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type grailFind struct {
	Kind, Name, When, Who string
}

// parseGrail reads the mod's grail file: the finds keyed by "kind|index", and how many items there are in all.
func parseGrail(text string) (found map[string]grailFind, total int) {
	found = map[string]grailFind{}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		f := strings.Split(line, "|")
		if len(f) < 5 || (f[0] != "unique" && f[0] != "set") {
			continue
		}
		total++
		if strings.TrimSpace(f[3]) != "" {
			found[f[0]+"|"+f[1]] = grailFind{Kind: f[0], Name: f[2], When: f[3], Who: strings.TrimSpace(f[4])}
		}
	}
	return found, total
}

func grailProgress(found, total int) string {
	if total == 0 {
		return ""
	}
	return fmt.Sprintf("%d of %d (%.1f%%)", found, total, 100*float64(found)/float64(total))
}

// grailNew lists the finds in `now` that `before` did not have, in file order of the keys given by `order` (any stable order is fine: they are few).
func grailNew(before, now map[string]grailFind) []grailFind {
	var out []grailFind
	for k, f := range now {
		if _, ok := before[k]; !ok {
			out = append(out, f)
		}
	}
	return out
}

func (m *Manager) grailLoop() {
	var known map[string]grailFind
	for range time.Tick(30 * time.Second) {
		m.mu.Lock()
		on := m.cfg.Effective().Quartermaster
		exe := m.cfg.GameExe
		m.mu.Unlock()
		if !on || strings.TrimSpace(exe) == "" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(filepath.Dir(exe), "quartermaster_grail.txt"))
		if err != nil {
			continue
		}
		now, total := parseGrail(string(raw))
		if known == nil { // the first look only sets the baseline: what was found before Qolbot started is not news
			known = now
			continue
		}
		fresh := grailNew(known, now)
		known = now
		if len(fresh) == 0 {
			continue
		}
		prog := grailProgress(len(now), total)
		if len(fresh) > 5 { // a scan imported many at once: one line
			m.addEvent(ActivityEvent{Time: time.Now(), Kind: "grail", Name: "Holy Grail", Detail: fmt.Sprintf("%d new items added · %s", len(fresh), prog), Key: "grail:" + prog})
			continue
		}
		for _, f := range fresh {
			bot := ""
			m.mu.Lock()
			for name := range m.states {
				if strings.EqualFold(name, f.Who) {
					bot = name
				}
			}
			m.mu.Unlock()
			m.addEvent(ActivityEvent{Time: time.Now(), Bot: bot, Kind: "grail", Name: "Holy Grail", Detail: fmt.Sprintf("%s (%s) · %s", f.Name, f.Kind, prog), Key: "grail:" + f.Kind + ":" + f.Name})
		}
	}
}

// ---- the Grail tab: every item of the file, with who found it and when ----

type grailRow struct {
	Kind string `json:"kind"`
	Idx  string `json:"idx"`
	Name string `json:"name"`
	When string `json:"when"`
	Who  string `json:"who"`
}

var reGrailHead = regexp.MustCompile(`#\s*Progress:\s*(\d+)\s+of\s+(\d+)\s+found`)

// parseGrailRows: every item line in file order, and the mod's own "found of total" from the header when it is there (the mod does not count items that
// are switched off, so its numbers are the ones the game shows).
func parseGrailRows(text string) (rows []grailRow, found, total int) {
	headFound, headTotal := -1, -1
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if mm := reGrailHead.FindStringSubmatch(line); mm != nil {
			headFound, _ = strconv.Atoi(mm[1])
			headTotal, _ = strconv.Atoi(mm[2])
			continue
		}
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		f := strings.Split(line, "|")
		if len(f) < 5 || (f[0] != "unique" && f[0] != "set") {
			continue
		}
		r := grailRow{Kind: f[0], Idx: f[1], Name: f[2], When: strings.TrimSpace(f[3]), Who: strings.TrimSpace(f[4])}
		rows = append(rows, r)
		total++
		if r.When != "" {
			found++
		}
	}
	if headTotal > 0 {
		found, total = headFound, headTotal
	}
	return rows, found, total
}

// GET /api/grail: the Grail tab's data. "enabled" follows "Using Quartermaster?"; "exists" is false until the mod has written its file.
func (m *Manager) apiGrail(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	on := m.cfg.Effective().Quartermaster
	exe := m.cfg.GameExe
	m.mu.Unlock()
	out := map[string]any{"enabled": on, "exists": false, "items": []grailRow{}, "found": 0, "total": 0, "percent": 0.0}
	if on && strings.TrimSpace(exe) != "" {
		if raw, err := os.ReadFile(filepath.Join(filepath.Dir(exe), "quartermaster_grail.txt")); err == nil {
			rows, found, total := parseGrailRows(string(raw))
			pct := 0.0
			if total > 0 {
				pct = float64(int(1000*float64(found)/float64(total)+0.5)) / 10
			}
			out["exists"], out["items"], out["found"], out["total"], out["percent"] = true, rows, found, total, pct
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// ---- the Gems and Runes tabs: what Quartermaster has stored ----

// parseStorage reads the mod's storage file (quartermaster.txt): `rejuv_halves=N` and one `<item code>=<count>` line per gem or rune.
func parseStorage(text string) (counts map[string]int, rejuvHalves int) {
	counts = map[string]int{}
	for _, line := range strings.Split(text, "\n") {
		k, v, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil || n < 0 {
			continue
		}
		if k == "rejuv_halves" {
			rejuvHalves = n
			continue
		}
		counts[strings.ToLower(strings.TrimSpace(k))] = n
	}
	return counts, rejuvHalves
}

// GET /api/storage: the Gems and Runes tabs' data (read-only; "enabled" follows "Using Quartermaster?").
func (m *Manager) apiStorage(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	on := m.cfg.Effective().Quartermaster
	exe := m.cfg.GameExe
	m.mu.Unlock()
	out := map[string]any{"enabled": on, "exists": false, "counts": map[string]int{}, "rejuvHalves": 0}
	if on && strings.TrimSpace(exe) != "" {
		if raw, err := os.ReadFile(filepath.Join(filepath.Dir(exe), "quartermaster.txt")); err == nil {
			counts, halves := parseStorage(string(raw))
			out["exists"], out["counts"], out["rejuvHalves"] = true, counts, halves
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}
