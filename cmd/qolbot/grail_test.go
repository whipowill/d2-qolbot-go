package main

import (
	"testing"
	"time"
)

func TestParseGrail(t *testing.T) {
	text := "# Quartermaster Holy Grail - every character shares this list.\r\n# Progress: 2 of 4 found (50.0%)\r\n# kind|index|name|found on|found by\r\n\r\n" +
		"unique|0|The Gnasher||\r\nunique|1|Hellplague|2026-11-09 16:45|Sankt\r\nset|124|Sander's Riprap|2026-11-09 16:45|Shared Stash\r\nset|125|Sander's Taboo||\r\n"
	found, total := parseGrail(text)
	if total != 4 || len(found) != 2 {
		t.Fatalf("total %d found %d", total, len(found))
	}
	if f := found["unique|1"]; f.Name != "Hellplague" || f.Who != "Sankt" || f.Kind != "unique" {
		t.Errorf("find: %+v", f)
	}
	before := map[string]grailFind{"unique|1": found["unique|1"]}
	fresh := grailNew(before, found)
	if len(fresh) != 1 || fresh[0].Name != "Sander's Riprap" {
		t.Errorf("new: %+v", fresh)
	}
	if grailProgress(2, 4) != "2 of 4 (50.0%)" || grailProgress(0, 0) != "" {
		t.Errorf("progress: %q", grailProgress(2, 4))
	}
}

func TestParseGrailRows(t *testing.T) {
	text := "# Progress: 200 of 526 found (38.0%)\n# kind|index|name|found on|found by\nunique|0|The Gnasher||\nunique|1|Hellplague|2026-11-09 16:45|Sankt\n"
	rows, found, total := parseGrailRows(text)
	if len(rows) != 2 || found != 200 || total != 526 { // the header's numbers win
		t.Fatalf("rows %d found %d total %d", len(rows), found, total)
	}
	if rows[1].Who != "Sankt" || rows[1].When != "2026-11-09 16:45" || rows[0].When != "" {
		t.Errorf("rows: %+v", rows)
	}
	_, f2, t2 := parseGrailRows("unique|0|A||\nunique|1|B|2026-11-09 16:45|X\n")
	if f2 != 1 || t2 != 2 {
		t.Errorf("no header: %d of %d", f2, t2)
	}
}

func TestParseStorage(t *testing.T) {
	c, h := parseStorage("rejuv_halves=909\r\nr13=9\nskz=13\nbad line\nr20=x\nGPV=22\n")
	if h != 909 || c["r13"] != 9 || c["skz"] != 13 || c["gpv"] != 22 || len(c) != 3 {
		t.Errorf("counts %v halves %d", c, h)
	}
}

func TestPerMinute(t *testing.T) {
	if perMinute(600, 2*time.Minute) != 300 || perMinute(-120, time.Minute) != -120 || perMinute(5, 0) != 0 {
		t.Errorf("perMinute: %d %d", perMinute(600, 2*time.Minute), perMinute(-120, time.Minute))
	}
	if !isFarmName("Tombs") || !isFarmName("Countess") || isFarmName("Follower") {
		t.Error("isFarmName")
	}
}

func TestGrailItemShownOnce(t *testing.T) {
	m := &Manager{}
	m.addEvent(ActivityEvent{Time: time.Now().Add(-time.Hour), Kind: "grail", Name: "Holy Grail", Detail: "Khalim's Will (unique)", Key: "grail:unique:Khalim's Will"})
	m.addEvent(ActivityEvent{Time: time.Now(), Kind: "grail", Name: "Holy Grail", Detail: "Khalim's Will (unique)", Key: "grail:unique:Khalim's Will"})
	m.addEvent(ActivityEvent{Time: time.Now(), Kind: "grail", Name: "Holy Grail", Detail: "Khalim's Flail (unique)", Key: "grail:unique:Khalim's Flail"})
	if len(m.events) != 2 {
		t.Errorf("the same Grail item must be shown once, got %d events", len(m.events))
	}
}
