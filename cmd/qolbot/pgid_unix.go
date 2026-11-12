//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

// ownGroup puts the child in its own process group. A terminal Ctrl-C goes to every process in the foreground group;
// without this the bridge, Wine and the games die at the same instant as the manager and the polite Save and Exit
// never reaches them. The manager stops them itself during shutdown.
func ownGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
