package main

import "testing"

func TestMusicTrack(t *testing.T) {
	for zone, want := range map[string]string{
		"Rogue Encampment": "Act1/town1", "Cold Plains": "Act1/wild", "Tower Cellar Level 3": "Act1/crypt", "Tristram": "Act1/tristram",
		"Rocky Waste": "Act2/desert", "Arcane Sanctuary": "Act2/sanctuary", "Flayer Jungle": "Act3/jungle", "Chaos Sanctuary": "Act4/diablo",
		"Arreat Plateau": "Act5/siege", "Throne Of Destruction": "Act5/baal", "Halls Of Pain": "Act5/xtemple", "Menu": "Common/options", "": "", "Nowhere": "",
	} {
		if got := musicTrack(zone); got != want {
			t.Errorf("%q: %q, want %q", zone, got, want)
		}
		if want != "" && !musicTrackKnown(want) {
			t.Errorf("%q not known", want)
		}
	}
	if musicTrackKnown(`../../etc/passwd`) {
		t.Error("only the game's tracks may be asked for")
	}
}

func TestMusicShuffleKnown(t *testing.T) {
	for _, tr := range musicShuffle {
		if !musicTrackKnown(tr) {
			t.Errorf("shuffle track %q is not a known track", tr)
		}
	}
}

func TestMusicZoneTracksListed(t *testing.T) {
	for zone, tr := range musicZones {
		if !musicTrackKnown(tr) {
			t.Errorf("%s plays %q, which is not in musicAll", zone, tr)
		}
	}
	for tr := range musicAct {
		if !musicTrackKnown(tr) {
			t.Errorf("%q is not in musicAll", tr)
		}
	}
	if len(musicAll) != 29 {
		t.Errorf("%d tracks, want the 29 of the game's 43 music files that last a minute or more", len(musicAll))
	}
}
