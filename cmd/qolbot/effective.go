package main

import "path/filepath"

// Most settings in qolbot.json are pointers: absent means "the default", and that default used to be worked out again wherever the setting
// was used. Effective is every on/off setting with its default applied: the one place that knows them.
type Effective struct {
	AutoTown, Gamble, Banter, ReportProblems, WatchKills           bool
	AutoEquip, AutoStat, AutoSkill, AutoRespec, LevelUpFirst       bool
	QuestClearAll, TeleportTeam, QuestWaypoints                    bool
	InventoryLayout, Regroup, BanterBubble                         bool
	RegroupSeconds                                                 int
	SaveOnStop, Plugy, QOL, Quartermaster, Headless, SaveOnChicken bool
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

// Effective applies the defaults: on unless switched off, except Full Clear, the save before a chicken and the task reports, which are off unless
// switched on. These are the settings the user chose as the program's defaults (2026-11-12): Quick Travel on, Full Clear off, task reports off, banter in a bubble.
func (c *Config) Effective() Effective {
	return Effective{
		AutoTown: boolOr(c.AutoTown, true), Gamble: boolOr(c.Gamble, true), Banter: boolOr(c.Banter, true),
		ReportProblems: boolOr(c.ReportProblems, true), WatchKills: boolOr(c.WatchKills, true),
		AutoEquip: boolOr(c.AutoEquip, true), AutoStat: boolOr(c.AutoStat, true), AutoSkill: boolOr(c.AutoSkill, true), AutoRespec: boolOr(c.AutoRespec, false), LevelUpFirst: boolOr(c.LevelUpFirst, true),
		QuestClearAll: boolOr(c.QuestClearAll, false), QuestWaypoints: boolOr(c.QuestWaypoints, true), InventoryLayout: boolOr(c.InventoryLayout, true), RegroupSeconds: intOr(c.RegroupSeconds, 30), Regroup: boolOr(c.Regroup, true), TeleportTeam: boolOr(c.TeleportTeam, true), BanterBubble: boolOr(c.BanterBubble, true),
		SaveOnStop: boolOr(c.SaveOnStop, true), Plugy: boolOr(c.Plugy, true), QOL: boolOr(c.QOL, false), Quartermaster: boolOr(c.Quartermaster, false), Headless: boolOr(c.Headless, true), SaveOnChicken: boolOr(c.SaveOnChicken, false),
	}
}

// savePath is the character file of a character in the game's Save folder.
func (m *Manager) savePath(character string) string {
	return filepath.Join(m.saveDir(), character+".d2s")
}
