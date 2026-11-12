package main

import "path/filepath"

// Most settings in qolbot.json are pointers: absent means "the default", and that default used to be worked out again wherever the setting
// was used. Effective is every on/off setting with its default applied: the one place that knows them.
type Effective struct {
	AutoTown, Gamble, Banter, ReportProblems, WatchKills bool
	AutoEquip, AutoStat, AutoSkill                       bool
	QuestClearAll, TeleportTeam                          bool
	SaveOnStop, Plugy, Headless                          bool
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

func intOr(p *int, def int) int {
	if p == nil {
		return def
	}
	return *p
}

// Effective applies the defaults: on unless switched off, except Quick Travel which is off unless switched on.
func (c *Config) Effective() Effective {
	return Effective{
		AutoTown: boolOr(c.AutoTown, true), Gamble: boolOr(c.Gamble, true), Banter: boolOr(c.Banter, true),
		ReportProblems: boolOr(c.ReportProblems, true), WatchKills: boolOr(c.WatchKills, true),
		AutoEquip: boolOr(c.AutoEquip, true), AutoStat: boolOr(c.AutoStat, true), AutoSkill: boolOr(c.AutoSkill, true),
		QuestClearAll: boolOr(c.QuestClearAll, true), TeleportTeam: boolOr(c.TeleportTeam, false),
		SaveOnStop: boolOr(c.SaveOnStop, true), Plugy: boolOr(c.Plugy, true), Headless: boolOr(c.Headless, true),
	}
}

// savePath is the character file of a character in the game's Save folder.
func (m *Manager) savePath(character string) string {
	return filepath.Join(m.saveDir(), character+".d2s")
}
