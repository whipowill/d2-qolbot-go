#!/bin/sh
# Clears every log Qolbot and the bots write. Safe to run while Qolbot is running: live logs are emptied in place
# (not deleted), so open file handles keep working. Leaves d2bs/kolbot/logs/ItemLog.txt (loot history) alone.
cd "$(dirname "$0")" || exit 1

n=0
# rotated copies: delete
for f in logs/qolbot.*.log logs/*.log.1 logs/bot-*.log d2bs/d2bs.log.1; do
  [ -f "$f" ] && rm -f "$f" && n=$((n+1))
done
# live logs: truncate in place
for f in logs/qolbot.log logs/wine.log d2bs/d2bs.log d2bs/kolbot/logs/ScriptErrorLog.txt; do
  [ -f "$f" ] && : > "$f" && n=$((n+1))
done
echo "cleared $n log file(s)"
