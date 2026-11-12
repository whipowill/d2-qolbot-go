# Qolbot

Go manager that runs Diablo II (1.13d) bots: it starts the game under Wine (or natively on Windows), injects D2BS and runs the Kolbot scripts in `d2bs/kolbot`. A web page on 127.0.0.1:8080 controls it.

Read `NOTES.md` first: code map, what is verified in a real game and what is not, and the hard-won facts. Details: `docs/AUTOMATION.md` (specs, gear, item rules), `docs/QUESTER.md` (quests), `README.md` (user-facing).

## Commands

- `go test ./...` runs the tests.
- `./build.sh` builds every platform into `bin/` plus `d2bridge.exe`. Run it after Go changes before a live test, because the `./qolbot` launcher runs `bin/`.
- `QOLBOT_DEV=1 ./qolbot` serves the web page from the file and shows demo data, so the UI can be edited with no game running.

## Rules

- Never add or change files in the user's real Diablo II folder without asking. Qolbot only reads from it.
- Never `pkill -x Game.exe` (it kills the user's own game) and never `pkill -f` with text from your own command line. Stop bots through the Qolbot API or its PID.
- The JS under `d2bs/kolbot/libs` is not UTF-8 and has mixed line endings. Edit it as bytes and keep the original line endings.
- There is no JS engine here, so script changes are untested until run in a real game. Say so in `NOTES.md`.
- `README.md` is the user's own text: make small edits only.
- Do not commit personal data: `qolbot.json`, logs, saves and `reset.sh` are git-ignored on purpose.
