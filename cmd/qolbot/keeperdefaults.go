package main

import (
	_ "embed"
	"encoding/json"
)

// The Keeper tab as the program's author chose it (2026-11-12): what a missing "pickitRules" and "pickit" in qolbot.json mean. A qolbot.json that
// sets them keeps its own. keeperdefaults.json holds the two settings as they were copied from a qolbot.json.
//
//go:embed keeperdefaults.json
var keeperDefaultsJSON []byte

var keeperDefaults = func() (k struct {
	Lead  []string    `json:"lead"`
	Rules PickitRules `json:"rules"`
}) {
	if err := json.Unmarshal(keeperDefaultsJSON, &k); err != nil {
		panic("keeperdefaults.json: " + err.Error()) // a build mistake, caught by the tests
	}
	return
}()

// defaultKeeperRules is a copy of the default rules, safe to change.
func defaultKeeperRules() PickitRules {
	r := keeperDefaults.Rules
	r.Magic = append([]MagicEntry{}, r.Magic...)
	r.Bases = append([]BaseRule{}, r.Bases...)
	r.Class = append([]ClassRule{}, r.Class...)
	return r
}

// defaultKeeperLead is a copy of the default list of pickit lists the leader bot loads.
func defaultKeeperLead() []string {
	return append([]string{}, keeperDefaults.Lead...)
}
