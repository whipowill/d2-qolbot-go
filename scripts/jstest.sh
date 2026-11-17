#!/bin/sh
# Runs the JavaScript tests of the bot scripts (the team sync) with gjs, from the repository root. A simulated game, no Diablo II needed.
# Then parses the web page's script the way a browser does: one stray apostrophe in it and the bots list never loads (2026-11-16).
cd "$(dirname "$0")/.." || exit 1
status=0
for t in scripts/jstest/*_test.js; do
	cat scripts/jstest/harness.js "$t" > /tmp/qolbot-jstest-$$.js
	gjs /tmp/qolbot-jstest-$$.js || status=1
done
rm -f /tmp/qolbot-jstest-$$.js
python3 - <<'PY' > /tmp/qolbot-page-$$.js || status=1
import re
s = open('cmd/qolbot/web/index.html', encoding='utf-8').read()
print(max(re.findall(r'<script[^>]*>(.*?)</script>', s, re.S), key=len))
PY
if gjs -c "let s=imports.byteArray.toString(imports.gi.GLib.file_get_contents('/tmp/qolbot-page-$$.js')[1]); try{ new Function(s); print('PASS the web page script parses') }catch(e){ print('FAIL the web page script does not parse: '+e); imports.system.exit(1) }"; then :; else status=1; fi
rm -f /tmp/qolbot-page-$$.js
exit $status
