#!/usr/bin/env python3
"""Syntax check of every script the bots run (d2bs/kolbot: .js and .dbj), in headless Firefox. Exit code 1 when one does not parse.

The scripts have mixed line endings and are not UTF-8 (CRLF, LF and CR-only occur), so each is read as bytes and its line endings are made
uniform for the check only.   usage: scripts/jsparse.py
"""
import glob, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from headless import run_page

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
base = os.path.join(root, "d2bs", "kolbot")
files = []
for pat in ("libs/**/*.js", "tools/*.js", "*.dbj"):
    files += glob.glob(os.path.join(base, pat), recursive=True)
src = {}
for f in sorted(set(files)):
    b = open(f, "rb").read().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    src[os.path.relpath(f, base)] = b.decode("latin-1")
html = "<script>var S=" + json.dumps(src) + r""";var bad=[],n=0;
for(var f in S){n++;try{new Function(S[f])}catch(e){bad.push(f+": "+e.message)}}
fetch(REPORT_URL,{method:"POST",mode:"no-cors",body:bad.length?"PARSE ERRORS in "+bad.length+" of "+n+" files:\n"+bad.join("\n"):"ALL "+n+" SCRIPTS PARSE"});</script>"""
report = run_page(html)
if report is None:
    print("jsparse: the page never reported (is firefox installed?)")
    sys.exit(2)
print(report)
sys.exit(1 if "ERRORS" in report else 0)
