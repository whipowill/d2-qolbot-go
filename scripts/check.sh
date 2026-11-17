#!/bin/sh
# Everything that can be checked without a game: go vet, the Go tests, the JS smoke test and a parse of every script. Stops at the first failure.
cd "$(dirname "$0")/.." || exit 1
set -e
echo "== go vet";           go vet ./...
echo "== go test";          go test ./...
echo "== scripts parse";    python3 scripts/jsparse.py
echo "== JS modules smoke"; python3 scripts/jsmoke.py | tail -3
echo "all checks passed"
