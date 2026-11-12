// Package wire defines the line-delimited JSON protocol between the native
// manager (qolbot) and the Win32 bridge (d2bridge.exe, runs under Wine).
package wire

// Msg is one JSON line. T selects the meaning:
//
//	bridge -> manager
//	  hello      bridge is up; Hwnd = handle of the "D2Bot #" window
//	  copydata   a D2BS script called sendCopyData(): Mode, Data, From
//	  started    Game.exe launched: Profile, Pid
//	  exited     Game.exe ended: Profile, Pid, Code
//	  attached   D2BS window for Profile was found: Hwnd
//	  error      Data = description
//	manager -> bridge
//	  launch     start Game.exe for Profile (Exe, Args, Dir, Dll)
//	  send       WM_COPYDATA to window titled Profile (or Hwnd): Mode, Data
//	  kill       terminate Profile's Game.exe
type Msg struct {
	T       string   `json:"t"`
	Profile string   `json:"profile,omitempty"`
	Mode    uint32   `json:"mode,omitempty"`
	Data    string   `json:"data,omitempty"`
	From    uint64   `json:"from,omitempty"`
	Hwnd    uint64   `json:"hwnd,omitempty"`
	Pid     uint32   `json:"pid,omitempty"`
	Code    uint32   `json:"code,omitempty"`
	Exe     string   `json:"exe,omitempty"`
	Args    []string `json:"args,omitempty"`
	Dir     string   `json:"dir,omitempty"`
	Dll     string   `json:"dll,omitempty"`
}
