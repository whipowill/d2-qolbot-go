#!/bin/sh
# Writes docs/SPEECH.md (everything the bots may say in the public chat) from d2bs/kolbot/libs/common/Speech.js. Needs gjs.
cd "$(dirname "$0")/.." || exit 1
exec gjs scripts/speechdoc.js
