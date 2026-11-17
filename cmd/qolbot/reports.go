package main

// reportTasks is the effective "bots report when they engage in tasks" setting: off unless switched on (the user's chosen default). An old config
// with quietChat=true (the earlier single "quiet bots" switch) also counts as off.
func (m *Manager) reportTasks() bool {
	if m.cfg.ReportTasks != nil {
		return *m.cfg.ReportTasks
	}
	return false
}
