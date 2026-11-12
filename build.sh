#!/bin/sh
# Builds qolbot for every platform it supports, into ./bin, plus the Windows helper the bots use under Wine.
# Needs only Go 1.22+ (no C compiler, no .NET, no Wine). Go cross-compiles, so one machine builds them all.
# `./qolbot` (Linux/macOS) and `qolbot.cmd` (Windows) then run the right one for the computer they are on.
set -e
cd "$(dirname "$0")"
mkdir -p bin
for t in linux/amd64 linux/arm64 darwin/arm64 darwin/amd64 windows/amd64; do
  os=${t%/*}; arch=${t#*/}; ext=""
  [ "$os" = windows ] && ext=".exe"
  CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath -ldflags "-s -w" -o "bin/qolbot-$os-$arch$ext" ./cmd/qolbot
  echo "built bin/qolbot-$os-$arch$ext"
done
GOOS=windows GOARCH=386 go build -trimpath -ldflags "-s -w" -o d2bridge.exe ./cmd/d2bridge   # Win32 helper, runs under Wine (32-bit like Game.exe)
echo "built d2bridge.exe"
