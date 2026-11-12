package main

// reportTasks is the effective "bots report when they engage in tasks" setting. An old config with quietChat=true
// (the earlier single "quiet bots" switch) counts as tasks off.
func (m *Manager) reportTasks() bool {
	if m.cfg.ReportTasks != nil {
		return *m.cfg.ReportTasks
	}
	return !m.cfg.QuietChat
}
