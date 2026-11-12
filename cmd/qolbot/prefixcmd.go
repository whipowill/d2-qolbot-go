package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// defaultPrefix is where the bots' own Wine prefix lives unless "winePrefix" says otherwise: ~/.qolbot_wine_prefix,
// so it survives moving or re-downloading the program folder. (Without a home folder: ./wineprefix.)
func (m *Manager) defaultPrefix() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".qolbot_wine_prefix")
	}
	return filepath.Join(m.root, "wineprefix")
}

// prefixPath is the Wine prefix the bots use: "winePrefix" from qolbot.json, default ~/.qolbot_wine_prefix.
func (m *Manager) prefixPath() string {
	if m.cfg.WinePrefix != "" {
		return m.cfg.WinePrefix
	}
	return m.defaultPrefix()
}

// ownsPrefix reports whether qolbot may create, run and delete this prefix: only its own default one, or one
// strictly inside the app folder. Any other prefix (for example the one your own games use) is never touched.
func (m *Manager) ownsPrefix(path string) bool {
	abs, err := filepath.Abs(path)
	if err != nil {
		return false
	}
	if def, err := filepath.Abs(m.defaultPrefix()); err == nil && abs == def {
		return true
	}
	return strings.HasPrefix(abs, m.root+string(filepath.Separator))
}

// noteOldPrefix mentions the prefix older versions kept next to the program: it is not used any more.
func (m *Manager) noteOldPrefix() {
	if m.cfg.WinePrefix != "" || m.root == "" {
		return
	}
	old := filepath.Join(m.root, "wineprefix")
	if old == m.defaultPrefix() {
		return
	}
	if _, err := os.Stat(filepath.Join(old, "system.reg")); err == nil {
		m.logf(0, "", "the old Wine prefix %s is not used any more (it now lives in %s); you can delete it", old, m.defaultPrefix())
	}
}

// cliPrefix builds the app's own Wine prefix without starting a game: `qolbot prefix` creates it if it is
// missing, `qolbot prefix --rebuild` deletes it and builds it again. It only ever touches a folder inside the
// app's own directory. The recipe (wineboot, the runner's vkd3d libraries if it ships any, Windows 7) is the one
// the game needs; see setupPrefix.
func (m *Manager) cliPrefix(args []string) {
	if runtime.GOOS == "windows" {
		fmt.Println("Windows does not use a Wine prefix.")
		return
	}
	rebuild := len(args) > 0 && args[0] == "--rebuild"
	prefix := m.prefixPath()
	if !m.ownsPrefix(prefix) {
		fmt.Fprintf(os.Stderr, "winePrefix %q is not one Qolbot manages; it only manages %s and folders inside %s.\n"+
			"Leave winePrefix empty to use the default.\n", prefix, m.defaultPrefix(), m.root)
		os.Exit(1)
	}
	m.openLog()
	if rebuild {
		// Only delete something that looks like a Wine prefix, so a typo can never remove another folder.
		if _, err := os.Stat(filepath.Join(prefix, "system.reg")); err == nil {
			fmt.Printf("deleting the old prefix %s\n", prefix)
			if err := os.RemoveAll(prefix); err != nil {
				fmt.Fprintln(os.Stderr, "cannot delete it:", err)
				os.Exit(1)
			}
		} else if _, err := os.Stat(prefix); err == nil {
			fmt.Fprintf(os.Stderr, "%s exists but does not look like a Wine prefix; not deleting it.\n", prefix)
			os.Exit(1)
		}
	}
	env := append(os.Environ(), "WINEPREFIX="+prefix, "WINEDLLOVERRIDES=winemenubuilder.exe=d")
	if runtime.GOOS == "linux" {
		display, err := m.startXvfb() // wineboot wants a display; this one is invisible
		if err != nil {
			fmt.Fprintln(os.Stderr, "warning:", err)
		} else {
			env = append(env, "DISPLAY="+display)
			defer m.killHelpers()
		}
	}
	if _, err := exec.LookPath(m.cfg.Wine); err != nil {
		fmt.Fprintf(os.Stderr, "cannot find %q (\"wine\" in qolbot.json): %v\n", m.cfg.Wine, err)
		os.Exit(1)
	}
	if err := m.setupPrefix(prefix, env); err != nil {
		fmt.Fprintf(os.Stderr, "cannot set up the Wine prefix:\n%v\n", err)
		os.Exit(1)
	}
	if _, err := os.Stat(filepath.Join(prefix, ".d2botd-ready")); err != nil {
		fmt.Fprintln(os.Stderr, "the prefix is not ready; see the messages above and logs/qolbot.log")
		os.Exit(1)
	}
	fmt.Printf("Wine prefix ready: %s (Windows %s)\n", prefix, m.cfg.WinVersion)
}

// absPrefix is the prefix path as an absolute path.
func (m *Manager) absPrefix() string {
	abs, err := filepath.Abs(m.prefixPath())
	if err != nil {
		return m.prefixPath()
	}
	return abs
}
