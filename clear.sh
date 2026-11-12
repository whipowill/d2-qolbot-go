#!/bin/sh
# Clears every log Qolbot and the bots write, and the copies of character files a point restore kept in backups/. Safe to run while Qolbot is running: live logs are emptied in place
# (not deleted), so open file handles keep working. Leaves d2bs/kolbot/logs/ItemLog.txt (loot history) alone.
cd "$(dirname "$0")" || exit 1

n=0
# rotated copies: delete
for f in logs/qolbot.*.log logs/*.log.1 logs/bot-*.log d2bs/d2bs.log.1; do
  [ -f "$f" ] && rm -f "$f" && n=$((n+1))
done
# copies of character files made before a point restore (the folder goes too when it is empty)
for f in backups/*.d2s; do
  [ -f "$f" ] && rm -f "$f" && n=$((n+1))
done
rmdir backups 2>/dev/null
# live logs: truncate in place
for f in logs/qolbot.log logs/wine.log d2bs/d2bs.log d2bs/kolbot/logs/ScriptErrorLog.txt; do
  [ -f "$f" ] && : > "$f" && n=$((n+1))
done
echo "cleared $n file(s)"
