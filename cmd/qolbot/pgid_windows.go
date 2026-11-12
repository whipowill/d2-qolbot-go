//go:build windows

package main

import "os/exec"

func ownGroup(cmd *exec.Cmd) {}
