#!/usr/bin/env python3
"""Smoke test for the small libs/common modules (Plan, Throttle, Report, Saver, Team, Chores, Pack, QuestItems, Quester).

There is no JS engine for the D2BS scripts here, so this loads them into headless Firefox with the game's globals mocked and runs
scripts/jsmoke.test.js. It writes a PNG of the result: look for "ALL PASSED".   usage: scripts/jsmoke.py out.png
"""
import json, os, subprocess, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
libs = os.path.join(root, "d2bs", "kolbot", "libs", "common")
mods = ["QuestTable", "Plan", "Throttle", "Report", "Saver", "Team", "QuickTravel", "Chores", "Pack", "QuestItems"]
read = lambda p: open(p, "rb").read().decode("latin-1")
test = read(os.path.join(root, "scripts", "jsmoke.test.js"))
table = read(os.path.join(libs, "QuestTable.json"))
page = '<body style="font:15px monospace"><pre id=o>running</pre><script>window.include=function(){};window.LOADERRS="";window.print=function(){};window.FileTools={readText:function(p){if(p==="libs/common/QuestTable.json")return ' + json.dumps(table) + ';throw new Error("no file")}};</script>'
page += "<script>var QUESTER=" + json.dumps("\n".join(read(os.path.join(libs, f)) for f in ("Quester.js", "QuestNpcs.js", "QuestScripts.js"))) + ";</script>"
for m in mods:
    page += "<script>try{(0,eval)(" + json.dumps(read(os.path.join(libs, m + ".js"))) + ')}catch(e){window.LOADERRS+="LOADERR ' + m + ': "+e.message+"\\n"}</script>'
page += "<script>try{" + test + '}catch(e){document.getElementById("o").textContent="TEST ERROR: "+e.message+" (line "+e.lineNumber+")"}</script>'
out = sys.argv[1] if len(sys.argv) > 1 else "jsmoke.png"
html = out + ".html"
open(html, "w").write(page)
subprocess.run(["firefox", "--headless", "--screenshot", os.path.abspath(out), "--window-size=1100,1300", "file://" + os.path.abspath(html)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
os.remove(html)
print("wrote", out)
