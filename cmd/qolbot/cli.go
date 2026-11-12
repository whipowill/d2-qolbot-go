package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"
)

func (m *Manager) apiBase() string {
	if m.cfg.Web == "" {
		fmt.Fprintln(os.Stderr, "the control API is disabled (\"web\" is empty in the config)")
		os.Exit(1)
	}
	return "http://" + m.cfg.Web
}

func (m *Manager) cliPost(action, profile string) {
	resp, err := http.Post(m.apiBase()+"/api/"+action+"?profile="+url.QueryEscape(profile), "", nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, "is `qolbot run` running?", err)
		os.Exit(1)
	}
	resp.Body.Close()
	fmt.Println(action, profile, "->", resp.Status)
}

type apiState struct {
	Profiles []State   `json:"profiles"`
	Logs     []LogLine `json:"logs"`
}

func (m *Manager) fetch() apiState {
	var st apiState
	resp, err := http.Get(m.apiBase() + "/api/state")
	if err != nil {
		fmt.Fprintln(os.Stderr, "is `qolbot run` running?", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	json.NewDecoder(resp.Body).Decode(&st)
	return st
}

func (m *Manager) cliStatus() {
	fmt.Printf("%-16s %-9s %5s %5s %6s  %s\n", "PROFILE", "STATUS", "RUNS", "CHKN", "DEATHS", "INFO")
	for _, p := range m.fetch().Profiles {
		fmt.Printf("%-16s %-9s %5d %5d %6d  %s\n", p.Name, p.Status, p.Runs, p.Chickens, p.Deaths, p.Info)
	}
}

func (m *Manager) cliLogs() {
	var last time.Time
	for {
		for _, l := range m.fetch().Logs {
			if l.Time.After(last) {
				fmt.Printf("%s [%s] %s\n", l.Time.Format("15:04:05"), l.Profile, l.Msg)
				last = l.Time
			}
		}
		time.Sleep(time.Second)
	}
}
