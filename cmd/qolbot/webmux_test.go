package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebMuxRoutes(t *testing.T) {
	m := &Manager{root: t.TempDir(), states: map[string]*State{}, logSubs: map[chan LogLine]bool{}}
	srv := httptest.NewServer(m.webMux())
	defer srv.Close()

	// action routes take POST only
	for _, path := range []string{"/api/start", "/api/stop", "/api/stopall", "/api/rescan", "/api/clearlogs"} {
		resp, err := http.Get(srv.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != 405 {
			t.Errorf("GET %s = %d, want 405", path, resp.StatusCode)
		}
	}

	// a start for a profile that does not exist is refused with a message, not a crash
	resp, err := http.Post(srv.URL+"/api/start?name=Nobody", "text/plain", strings.NewReader(""))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Errorf("start of an unknown profile = %d, want 400", resp.StatusCode)
	}

	// the state endpoint answers JSON
	resp, err = http.Get(srv.URL + "/api/state")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var state map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil || resp.StatusCode != 200 {
		t.Errorf("/api/state = %d, body not JSON: %v", resp.StatusCode, err)
	}
}

func TestIsErrorBox(t *testing.T) {
	if !isErrorBox(`Error message box, caption: "Diablo II Error", message:`) || isErrorBox("Starting script: Andariel") {
		t.Error("isErrorBox misjudged a line")
	}
}
