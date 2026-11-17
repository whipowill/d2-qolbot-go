#!/usr/bin/env python3
"""Smoke test for the small libs/common modules (Plan, Throttle, Report, Saver, Team, Chores, Pack, QuestItems, Quester).

There is no JS engine for the D2BS scripts here, so this loads them into headless Firefox with the game's globals mocked and runs
scripts/jsmoke.test.js. The page reports back over a local web server (headless.py): the result is printed, and the exit code is 1 when anything failed.   usage: scripts/jsmoke.py
"""
import json, os, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
libs = os.path.join(root, "d2bs", "kolbot", "libs", "common")
mods = ["QuestTable", "Plan", "Throttle", "Report", "Saver", "Team", "QuickTravel", "Chores", "Pack", "QuestItems", "Layout", "Speech", "Waypoints"]
read = lambda p: open(p, "rb").read().decode("latin-1")
test = read(os.path.join(root, "scripts", "jsmoke.test.js"))
table = read(os.path.join(libs, "QuestTable.json"))
page = '<body style="font:15px monospace"><pre id=o>running</pre><script>window.include=function(){};window.LOADERRS="";window.print=function(){};window.FileTools={readText:function(p){if(p==="libs/common/QuestTable.json")return ' + json.dumps(table) + ';throw new Error("no file")}};</script>'
page += "<script>var QUESTER=" + json.dumps("\n".join(read(os.path.join(libs, f)) for f in ("Quester.js", "QuestNpcs.js", "QuestScripts.js"))) + ";</script>"
for m in mods:
    page += "<script>try{(0,eval)(" + json.dumps(read(os.path.join(libs, m + ".js"))) + ')}catch(e){window.LOADERRS+="LOADERR ' + m + ': "+e.message+"\\n"}</script>'
page += "<script>try{" + test + '}catch(e){var ERR="TEST ERROR: "+e.message+" (line "+e.lineNumber+")";document.getElementById("o").textContent=ERR;fetch(REPORT_URL,{method:"POST",mode:"no-cors",body:ERR})}</script>'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from headless import run_page

report = run_page(page)
if report is None:
    print("jsmoke: the page never reported (is firefox installed?)")
    sys.exit(2)
print(report)
sys.exit(1 if ("FAILED" in report or "ERROR" in report) else 0)
