//go:build windows

package main

import (
	"fmt"
	"os"
	"syscall"
	"unsafe"
)

// extractMPQ reads one file out of an MPQ archive with the game folder's StormLib.dll and writes it to stdout (d2bridge -extract). Qolbot uses it
// for the game's music (the Activity page's music button): the music is stored with the ADPCM and Huffman compressions, which Qolbot's own reader
// (internal/mpq) lacks. Nothing is written to disk, here or in the game folder (the user: the music must not be extracted to files).
func extractMPQ(gameDir, archive, name string) error {
	dll := syscall.NewLazyDLL(gameDir + `\StormLib.dll`)
	if err := dll.Load(); err != nil {
		return fmt.Errorf("StormLib.dll: %v", err)
	}
	ansi := func(s string) uintptr { b := append([]byte(s), 0); return uintptr(unsafe.Pointer(&b[0])) }
	var arc, f uintptr
	// SFileOpenArchive takes a TCHAR path: this build of StormLib is ANSI (live: the wide form gave "file not found"); 0x100 = STREAM_FLAG_READ_ONLY
	if r, _, e := dll.NewProc("SFileOpenArchive").Call(ansi(archive), 0, 0x100, uintptr(unsafe.Pointer(&arc))); r == 0 {
		return fmt.Errorf("open %s: %v", archive, e)
	}
	defer dll.NewProc("SFileCloseArchive").Call(arc)
	if r, _, e := dll.NewProc("SFileOpenFileEx").Call(arc, ansi(name), 0, uintptr(unsafe.Pointer(&f))); r == 0 {
		return fmt.Errorf("open %s: %v", name, e)
	}
	defer dll.NewProc("SFileCloseFile").Call(f)
	n, _, _ := dll.NewProc("SFileGetFileSize").Call(f, 0)
	if n == 0 || n == 0xFFFFFFFF {
		return fmt.Errorf("%s: no size", name)
	}
	buf := make([]byte, n)
	var got uint32
	if r, _, e := dll.NewProc("SFileReadFile").Call(f, uintptr(unsafe.Pointer(&buf[0])), n, uintptr(unsafe.Pointer(&got)), 0); r == 0 && got == 0 {
		return fmt.Errorf("read %s: %v", name, e)
	}
	_, err := os.Stdout.Write(buf[:got])
	return err
}

// infoMPQ prints, for each named file of an MPQ, "<name>\t<size>\t<bytes per second>" (d2bridge -info): the size from the archive and the byte rate
// from the WAV header (the first 44 bytes, nothing more is read). Qolbot works out the tracks' lengths for the Music tab from it.
func infoMPQ(gameDir, archive string, names []string) error {
	dll := syscall.NewLazyDLL(gameDir + `\StormLib.dll`)
	if err := dll.Load(); err != nil {
		return fmt.Errorf("StormLib.dll: %v", err)
	}
	ansi := func(s string) uintptr { b := append([]byte(s), 0); return uintptr(unsafe.Pointer(&b[0])) }
	var arc uintptr
	if r, _, e := dll.NewProc("SFileOpenArchive").Call(ansi(archive), 0, 0x100, uintptr(unsafe.Pointer(&arc))); r == 0 {
		return fmt.Errorf("open %s: %v", archive, e)
	}
	defer dll.NewProc("SFileCloseArchive").Call(arc)
	for _, name := range names {
		var f uintptr
		if r, _, _ := dll.NewProc("SFileOpenFileEx").Call(arc, ansi(name), 0, uintptr(unsafe.Pointer(&f))); r == 0 {
			continue
		}
		n, _, _ := dll.NewProc("SFileGetFileSize").Call(f, 0)
		head := make([]byte, 44)
		var got uint32
		dll.NewProc("SFileReadFile").Call(f, uintptr(unsafe.Pointer(&head[0])), 44, uintptr(unsafe.Pointer(&got)), 0)
		dll.NewProc("SFileCloseFile").Call(f)
		rate := uint32(0)
		if got >= 32 && string(head[:4]) == "RIFF" {
			rate = uint32(head[28]) | uint32(head[29])<<8 | uint32(head[30])<<16 | uint32(head[31])<<24
		}
		fmt.Printf("%s\t%d\t%d\n", name, n, rate)
	}
	return nil
}
