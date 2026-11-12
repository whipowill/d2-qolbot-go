//go:build windows

// d2bridge is the only Windows-specific piece of the manager. It replaces the
// window/launch/inject parts of D2Bot.exe with a tiny native Win32 program
// (no .NET, no WinForms) so it runs fine under Wine.
//
//   - owns a hidden top-level window titled "D2Bot #" that receives WM_COPYDATA
//     from D2BS scripts (sendCopyData) and forwards it to qolbot over TCP
//   - launches Game.exe and injects D2BS.dll once the game's modules are loaded
//   - delivers manager -> script messages as WM_COPYDATA to the profile window
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"d2qolbot/internal/wire"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	pRegisterClassEx = user32.NewProc("RegisterClassExW")
	pCreateWindowEx  = user32.NewProc("CreateWindowExW")
	pDefWindowProc   = user32.NewProc("DefWindowProcW")
	pGetMessage      = user32.NewProc("GetMessageW")
	pTranslateMsg    = user32.NewProc("TranslateMessage")
	pDispatchMsg     = user32.NewProc("DispatchMessageW")
	pFindWindow      = user32.NewProc("FindWindowW")
	pSendMessage     = user32.NewProc("SendMessageW")
	pPostMessage     = user32.NewProc("PostMessageW")
	pGetClientRect   = user32.NewProc("GetClientRect")
	pIsWindow        = user32.NewProc("IsWindow")
	pEnumWindows     = user32.NewProc("EnumWindows")
	pGetWindowPID    = user32.NewProc("GetWindowThreadProcessId")
	pGetClassName    = user32.NewProc("GetClassNameW")
	pSetWindowText   = user32.NewProc("SetWindowTextW")

	pVirtualAllocEx     = kernel32.NewProc("VirtualAllocEx")
	pWriteProcessMemory = kernel32.NewProc("WriteProcessMemory")
	pCreateRemoteThread = kernel32.NewProc("CreateRemoteThread")
	pLoadLibraryW       = kernel32.NewProc("LoadLibraryW")
	pSnapshot           = kernel32.NewProc("CreateToolhelp32Snapshot")
	pModule32First      = kernel32.NewProc("Module32FirstW")
	pModule32Next       = kernel32.NewProc("Module32NextW")
)

const (
	wmCopyData    = 0x004A
	memCommit     = 0x1000
	memReserve    = 0x2000
	pageReadWrite = 0x04
	th32csModule  = 0x8
	th32csMod32   = 0x10
	processAll    = 0x1F0FFF
)

type wndClassEx struct {
	size, style                        uint32
	wndProc                            uintptr
	clsExtra, wndExtra                 int32
	instance, icon, cursor, background uintptr
	menuName, className                *uint16
	iconSm                             uintptr
}

type point struct{ x, y int32 }
type msg struct {
	hwnd    uintptr
	message uint32
	wparam  uintptr
	lparam  uintptr
	time    uint32
	pt      point
}

type copyData struct {
	dwData uintptr
	cbData uint32
	lpData uintptr
}

type moduleEntry struct {
	size, modID, pid, glbl, proc uint32
	base                         uintptr
	modSize                      uint32
	hmod                         uintptr
	name                         [256]uint16
	path                         [260]uint16
}

var hidden bool

var (
	out     = make(chan wire.Msg, 256)
	procsMu sync.Mutex
	procs   = map[string]syscall.Handle{}
)

func u16(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }

func wndProc(hwnd, m, wp, lp uintptr) uintptr {
	if m == wmCopyData && lp != 0 {
		cds := (*copyData)(unsafe.Pointer(lp))
		var data string
		if cds.cbData > 0 && cds.lpData != 0 {
			b := unsafe.Slice((*byte)(unsafe.Pointer(cds.lpData)), cds.cbData)
			data = strings.TrimRight(string(b), "\x00")
		}
		out <- wire.Msg{T: "copydata", Mode: uint32(cds.dwData), Data: data, From: uint64(wp)}
		return 1
	}
	r, _, _ := pDefWindowProc.Call(hwnd, m, wp, lp)
	return r
}

// createWindow must run on the thread that will pump messages.
func createWindow(title string) uintptr {
	cls := u16("D2BotBridge")
	wc := wndClassEx{wndProc: syscall.NewCallback(wndProc), className: cls}
	wc.size = uint32(unsafe.Sizeof(wc))
	pRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc)))
	h, _, _ := pCreateWindowEx.Call(0, uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(u16(title))),
		0, 0, 0, 0, 0, 0, 0, 0, 0)
	return h
}

var (
	enumPid   uint32
	enumFound uintptr
	enumCB    = syscall.NewCallback(func(hwnd, _ uintptr) uintptr {
		var pid uint32
		pGetWindowPID.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
		if pid != enumPid {
			return 1
		}
		var cls [64]uint16
		pGetClassName.Call(hwnd, uintptr(unsafe.Pointer(&cls[0])), uintptr(len(cls)))
		if syscall.UTF16ToString(cls[:]) == "Diablo II" {
			enumFound = hwnd
			return 0 // stop
		}
		return 1
	})
	enumMu sync.Mutex
)

// gameWindow returns the top-level "Diablo II" window owned by pid, or 0.
// (D2Bot.exe used D2M.dll to retitle the game window after the profile name;
// here the bridge does it, because scripts address each other by window title.)
func gameWindow(pid uint32) uintptr {
	enumMu.Lock()
	defer enumMu.Unlock()
	enumPid, enumFound = pid, 0
	pEnumWindows.Call(enumCB, 0)
	return enumFound
}

func findWindow(title string) uintptr {
	h, _, _ := pFindWindow.Call(0, uintptr(unsafe.Pointer(u16(title))))
	return h
}

func sendCopyData(hwnd uintptr, mode uint32, data string) {
	b := append([]byte(data), 0)
	cds := copyData{dwData: uintptr(mode), cbData: uint32(len(b)), lpData: uintptr(unsafe.Pointer(&b[0]))}
	pSendMessage.Call(hwnd, wmCopyData, 0, uintptr(unsafe.Pointer(&cds)))
	runtime.KeepAlive(b)
}

func moduleLoaded(pid uint32, name string) bool {
	snap, _, _ := pSnapshot.Call(th32csModule|th32csMod32, uintptr(pid))
	if snap == ^uintptr(0) {
		return false
	}
	defer syscall.CloseHandle(syscall.Handle(snap))
	me := moduleEntry{}
	me.size = uint32(unsafe.Sizeof(me))
	r, _, _ := pModule32First.Call(snap, uintptr(unsafe.Pointer(&me)))
	for r != 0 {
		if strings.EqualFold(syscall.UTF16ToString(me.name[:]), name) {
			return true
		}
		r, _, _ = pModule32Next.Call(snap, uintptr(unsafe.Pointer(&me)))
	}
	return false
}

func inject(h syscall.Handle, dll string) error {
	path, _ := syscall.UTF16FromString(dll)
	size := uintptr(len(path) * 2)
	mem, _, _ := pVirtualAllocEx.Call(uintptr(h), 0, size, memCommit|memReserve, pageReadWrite)
	if mem == 0 {
		return fmt.Errorf("VirtualAllocEx failed")
	}
	var n uintptr
	if r, _, e := pWriteProcessMemory.Call(uintptr(h), mem, uintptr(unsafe.Pointer(&path[0])), size, uintptr(unsafe.Pointer(&n))); r == 0 {
		return fmt.Errorf("WriteProcessMemory: %v", e)
	}
	th, _, e := pCreateRemoteThread.Call(uintptr(h), 0, 0, pLoadLibraryW.Addr(), mem, 0, 0)
	if th == 0 {
		return fmt.Errorf("CreateRemoteThread: %v", e)
	}
	syscall.WaitForSingleObject(syscall.Handle(th), 10000)
	syscall.CloseHandle(syscall.Handle(th))
	return nil
}

// exited reports whether the process has already ended.
func exited(h syscall.Handle) bool {
	r, _ := syscall.WaitForSingleObject(h, 0)
	return r == syscall.WAIT_OBJECT_0
}

func launch(m wire.Msg) {
	cmd := `"` + m.Exe + `"`
	for _, a := range m.Args {
		cmd += " " + a
	}
	si := syscall.StartupInfo{}
	si.Cb = uint32(unsafe.Sizeof(si))
	if hidden {
		si.Flags = 1      // STARTF_USESHOWWINDOW
		si.ShowWindow = 7 // SW_SHOWMINNOACTIVE
	}
	pi := syscall.ProcessInformation{}
	var dir *uint16
	if m.Dir != "" {
		dir = u16(m.Dir)
	}
	err := syscall.CreateProcess(nil, u16(cmd), nil, nil, false, 0, nil, dir, &si, &pi)
	if err != nil {
		out <- wire.Msg{T: "error", Profile: m.Profile, Data: "CreateProcess: " + err.Error()}
		out <- wire.Msg{T: "exited", Profile: m.Profile, Code: 1}
		return
	}
	syscall.CloseHandle(pi.Thread)
	procsMu.Lock()
	procs[m.Profile] = pi.Process
	procsMu.Unlock()
	out <- wire.Msg{T: "started", Profile: m.Profile, Pid: pi.ProcessId}

	go func() {
		if m.Dll != "" {
			// wait until the game has loaded its engine modules before injecting
			// (Under Wine the module list often never shows D2Client.dll, which used to cost the whole 60 second
			// wait on every start; a game window that has been up for a moment means the engine is loaded too.)
			t0 := time.Now()
			deadline := t0.Add(60 * time.Second)
			var winSeen time.Time
			reason := "timed out"
			for time.Now().Before(deadline) && !exited(pi.Process) {
				if moduleLoaded(pi.ProcessId, "D2Client.dll") {
					reason = "D2Client.dll loaded"
					break
				}
				if gameWindow(pi.ProcessId) != 0 {
					if winSeen.IsZero() {
						winSeen = time.Now()
					} else if time.Since(winSeen) > 1500*time.Millisecond {
						reason = "game window is up"
						break
					}
				}
				time.Sleep(200 * time.Millisecond)
			}
			out <- wire.Msg{T: "note", Profile: m.Profile, Data: fmt.Sprintf("ready to inject after %.1fs (%s)", time.Since(t0).Seconds(), reason)}
			time.Sleep(500 * time.Millisecond)
			if exited(pi.Process) {
				out <- wire.Msg{T: "error", Profile: m.Profile, Data: "Game.exe ended before D2BS could be injected"}
			} else if err := inject(pi.Process, m.Dll); err != nil {
				out <- wire.Msg{T: "error", Profile: m.Profile, Data: "inject: " + err.Error()}
			}
		}
		// Give the game window the profile name as its title, then report it as the D2BS window.
		go func() {
			for i := 0; i < 600; i++ {
				if h := gameWindow(pi.ProcessId); h != 0 {
					pSetWindowText.Call(h, uintptr(unsafe.Pointer(u16(m.Profile))))
					if findWindow(m.Profile) == h {
						out <- wire.Msg{T: "attached", Profile: m.Profile, Hwnd: uint64(h)}
						return
					}
				}
				time.Sleep(500 * time.Millisecond)
			}
		}()
		syscall.WaitForSingleObject(pi.Process, syscall.INFINITE)
		var code uint32
		syscall.GetExitCodeProcess(pi.Process, &code)
		procsMu.Lock()
		delete(procs, m.Profile)
		procsMu.Unlock()
		syscall.CloseHandle(pi.Process)
		out <- wire.Msg{T: "exited", Profile: m.Profile, Pid: pi.ProcessId, Code: code}
	}()
}

func handle(m wire.Msg) {
	switch m.T {
	case "launch":
		go launch(m)
	case "send":
		h := uintptr(m.Hwnd)
		if h == 0 {
			h = findWindow(m.Profile)
		}
		if r, _, _ := pIsWindow.Call(h); h == 0 || r == 0 {
			out <- wire.Msg{T: "error", Profile: m.Profile, Data: "send: window not found"}
			return
		}
		sendCopyData(h, m.Mode, m.Data)
	case "input": // developer/testing: "key <vk>" or "click <x> <y>" posted to the profile's game window as real window messages
		h := findWindow(m.Profile)
		if r, _, _ := pIsWindow.Call(h); h == 0 || r == 0 {
			out <- wire.Msg{T: "error", Profile: m.Profile, Data: "input: window not found"}
			return
		}
		postInput(h, m.Data)
	case "kill":
		procsMu.Lock()
		h, ok := procs[m.Profile]
		procsMu.Unlock()
		if ok {
			syscall.TerminateProcess(h, 1)
		} else {
			out <- wire.Msg{T: "exited", Profile: m.Profile} // nothing running: let the manager settle on "stopped"
		}
	}
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8765", "Qolbot bridge address")
	title := flag.String("title", "D2Bot #", "title of the message window (what D2BS scripts target)")
	flag.BoolVar(&hidden, "hidden", false, "start Game.exe minimized")
	flag.Parse()

	conn, err := net.Dial("tcp", *addr)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot reach manager:", err)
		os.Exit(1)
	}
	var wmu sync.Mutex
	enc := json.NewEncoder(conn)
	send := func(m wire.Msg) { wmu.Lock(); enc.Encode(m); wmu.Unlock() }

	ready := make(chan uintptr)
	go func() { // window + message pump thread
		runtime.LockOSThread()
		ready <- createWindow(*title)
		var m msg
		for {
			r, _, _ := pGetMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
			if int32(r) <= 0 {
				os.Exit(0)
			}
			pTranslateMsg.Call(uintptr(unsafe.Pointer(&m)))
			pDispatchMsg.Call(uintptr(unsafe.Pointer(&m)))
		}
	}()
	hwnd := <-ready
	send(wire.Msg{T: "hello", Hwnd: uint64(hwnd)})

	go func() {
		for m := range out {
			send(m)
		}
	}()
	sc := bufio.NewScanner(conn)
	sc.Buffer(make([]byte, 1<<20), 1<<24)
	for sc.Scan() {
		var m wire.Msg
		if json.Unmarshal(sc.Bytes(), &m) == nil {
			handle(m)
		}
	}
	os.Exit(0) // manager went away
}

// postInput sends a key press or a mouse click to a window as window messages (no real input device needed).
//
//	key 27        presses and releases virtual key 27 (Escape)
//	click 400 300 moves the mouse to client position (400,300) and left-clicks
func postInput(h uintptr, data string) {
	f := strings.Fields(data)
	const (
		wmKeyDown, wmKeyUp                      = 0x0100, 0x0101
		wmMouseMove, wmLButtonDown, wmLButtonUp = 0x0200, 0x0201, 0x0202
	)
	num := func(i int) uintptr {
		if i >= len(f) {
			return 0
		}
		n := 0
		fmt.Sscanf(f[i], "%d", &n)
		return uintptr(n)
	}
	switch {
	case len(f) >= 1 && f[0] == "savequit":
		// What a player does to leave a game and save the character: Escape opens the game menu, then click "Save and
		// Exit Game". The menu is centred in the window, and the button sits 41 pixels above its middle (measured on a
		// 640x480 window: window centre (320,240), button at (319,199)). Posted as window messages, no real input needed.
		var rc [4]int32 // left, top, right, bottom
		pGetClientRect.Call(h, uintptr(unsafe.Pointer(&rc[0])))
		w, ht := uintptr(rc[2]-rc[0]), uintptr(rc[3]-rc[1])
		if w == 0 || ht == 0 {
			w, ht = 640, 480
		}
		pPostMessage.Call(h, wmKeyDown, 27, 0x00000001)
		time.Sleep(60 * time.Millisecond)
		pPostMessage.Call(h, wmKeyUp, 27, 0xC0000001)
		time.Sleep(1000 * time.Millisecond) // let the menu open
		x, y := w/2-1, ht/2-41
		lp := y<<16 | x&0xFFFF
		pPostMessage.Call(h, wmMouseMove, 0, lp)
		time.Sleep(80 * time.Millisecond)
		pPostMessage.Call(h, wmLButtonDown, 1, lp)
		time.Sleep(80 * time.Millisecond)
		pPostMessage.Call(h, wmLButtonUp, 0, lp)
	case len(f) >= 2 && f[0] == "key":
		vk := num(1)
		pPostMessage.Call(h, wmKeyDown, vk, 0x00000001)
		time.Sleep(60 * time.Millisecond)
		pPostMessage.Call(h, wmKeyUp, vk, 0xC0000001)
	case len(f) >= 3 && f[0] == "click":
		lp := num(2)<<16 | num(1)&0xFFFF
		pPostMessage.Call(h, wmMouseMove, 0, lp)
		time.Sleep(80 * time.Millisecond)
		pPostMessage.Call(h, wmLButtonDown, 1, lp)
		time.Sleep(80 * time.Millisecond)
		pPostMessage.Call(h, wmLButtonUp, 0, lp)
	}
}
