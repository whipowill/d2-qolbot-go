package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf16"
)

// writeD2BSIni regenerates d2bs/d2bs.ini (UTF-16LE with BOM, as D2BS expects)
// from the profiles in qolbot.json, so there is no hand-editing of that file.
func (m *Manager) writeD2BSIni() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	var b strings.Builder
	b.WriteString("[settings]\r\nUseProfileScript=true\r\n")
	fmt.Fprintf(&b, "ScriptPath=%s\r\nDefaultConsoleScript=console\r\nDefaultGameScript=default.dbj\r\nDefaultStarterScript=starter.dbj\r\n", m.cfg.ScriptPath)
	b.WriteString("MaxGameTime=0\r\nConsoleFont=0\r\nQuitOnHostile=false\r\nQuitOnError=false\r\nStartAtMenu=false\r\nMemoryLimit=0\r\n")
	b.WriteString("MaxLoginTime=5\r\nMaxCharSelectTime=5\r\nGameReadyTimeout=5\r\nDisableCache=true\r\nUseGamePrint=false\r\nLogConsoleOutput=true\r\nEnableUnsupported=true\r\n\r\n")
	names := make([]string, 0, len(m.states))
	for n := range m.states {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		st, gs := starter, "default.dbj"
		switch m.roleOf(m.states[n]) {
		case "host":
			st, gs = hostStarter, hostGameScript
			if m.states[n].Role == "" { // the leader bot (you are not playing) plays the goal: kolbot's own game script
				gs = "default.dbj"
			}
		case "idle": // joins like a normal bot but runs the do-nothing script (crash isolation)
			gs = hostGameScript
		}
		fmt.Fprintf(&b, "[%s]\r\nMode=Other Multiplayer\r\nUsername=\r\nPassword=\r\ngateway=East\r\nip=%s\r\ncharacter=%s\r\nScriptPath=%s\r\nDefaultGameScript=%s\r\nDefaultStarterScript=%s\r\n\r\n",
			n, m.cfg.HostIP, m.states[n].Character, m.cfg.ScriptPath, gs, st)
	}
	u := utf16.Encode([]rune(b.String()))
	out := make([]byte, 2, 2+len(u)*2)
	out[0], out[1] = 0xFF, 0xFE
	for _, c := range u {
		out = append(out, byte(c), byte(c>>8))
	}
	return os.WriteFile(filepath.Join(m.root, "d2bs", "d2bs.ini"), out, 0o644)
}
