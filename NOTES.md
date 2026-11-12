# Working notes

Read this first when picking the project back up. Other docs: `README.md` (user-facing), `docs/AUTOMATION.md` (the auto-spec: skills, stats, gear, item rules)
and `docs/QUESTER.md` (the quest system). This file is the state of play: how it fits together, what is verified, what is not, and the facts that cost time to learn.
Last reorganised 2026-11-11.

## What it is

Qolbot (Go) replaces `D2Bot.exe`. It starts Diablo II under Wine (hidden Xvfb display on Linux), injects `D2BS.dll`, and runs
the Kolbot scripts in `d2bs/kolbot`. A web page (127.0.0.1:8080) controls everything. Two modes, chosen by the "Are you playing?"
toggle (`Config.NotPlaying`):

- **Playing (Yes):** you host a TCP/IP game; bots join (`D2BotTcpIpJoin.dbj`) and follow you (`Follower.js`): town chores, skill and
  stat points, gear upgrades, fighting, quest NPC visits. They pick up possible gear upgrades (to try on, identify and sell if they are not) and what the keeper rules keep; see docs/AUTOMATION.md "What bots do with items".
- **Not playing (No):** one bot is the **leader** (`roleOf` = host when `NotPlaying && Player == Character`). It hosts
  (`D2BotTcpIpHost.dbj` + `default.dbj`), runs the objective (Farm: chosen locations in act order; Quest: `Questing.js` ->
  `Quester.runQuests(false)`) on the chosen difficulty, and is the only bot that picks up loot. The others are followers.
  Start launches the leader first, waits for its `Game:` status, passes `team=` so the leader waits (max 4 min) for its team.

## Code map

| Where | What |
|---|---|
| `cmd/qolbot/main.go` | Config struct, Manager, profile start/stop, watchdog, prefix setup |
| `settings.go` | `roleOf`, `setPlaying`, farm catalog (`farmAll`), `setGoal`, playing/goal/difficulty state |
| `specplan.go`, `internal/spec/` | reads the `.d2s`, plans skills/stats/build, writes `d2bs/kolbot/data/<profile>.spec.json` per bot |
| `ini.go` | writes `d2bs/d2bs.ini` every start (starter + script per role); never hand-edit |
| `rpc.go` | `D2Bot.*` calls from scripts arrive as WM_COPYDATA from `cmd/d2bridge` (Win32 helper under Wine) |
| `save.go` | graceful stop: "prepexit" -> bridge `savequit` (ESC, click Save and Exit) -> poll the `.d2s` stamp -> PlugY `/save` fallback |
| `pickit.go` | Keeper tab rules -> `pickit/Generated.nip`; base-item rules; import of the loot filter; `autoequipFile(class)` |
| `botlog.go` | tails `d2bs/d2bs.log` per bot -> `logs/bot-<name>.log`; `reProblem` raises "script problem" console lines; keeps each bot's last activity line (`State.Activity`) and parses the pickit's "Picked up ..." lines into `PickedItem`s (newest 200 in memory, 60 sent in `/api/state` as `items`) for the Status tab |
| `logfile.go` | logging, preflight (Wine / Xvfb / game path, with install hints), `clearLogs` |
| `web.go`, `web/index.html` | API and the single embedded page (`go:embed`). `QOLBOT_DEV=1 ./qolbot` serves the page from the file on every request |
| `prefixcmd.go` | private Wine prefix `~/.qolbot_wine_prefix` (`ownsPrefix` guards: only that or one inside the app folder is touched) |
| `botgame.go` | read-only checks of PlugY.ini / BaseMod.ini (World Event warnings); repoints an old `botgame/` config |
| `joinwatch.go` | warns when a bot sits on Join Game 50 s, quoting the game's own `D2YYMMDD.txt` load errors |
| `d2bs/kolbot/libs/common/AutoSpec.js` | applies the plan (`apply()`): scripts, goal, farm, pickit lists, noPickup, PublicMode, auto-save, storage, report switches |
| `libs/bots/Follower.js`, `Questing.js`, `common/Quester.js` | following, quest NPC logic (talk only when a reward is pending, repeat talks, consume handed-over items) |
| `libs/common/Misc.js`, `Pickit.js`, `Town.js` | gear swap rules, `Item.takeable/sellable` (both use `Config.Protect`), pickups, selling, gambling |
| `D2BotTcpIpHost.dbj` | host starter; screen 20 (difficulty) via `chooseDifficulty` |

Tests: `go test ./...` (pickit, autoequip lists, web page mocks, preflight, prefix ownership, logs, save, spec planner). Always
run `./build.sh` after Go changes before a live test (the launcher runs `bin/`); do a live start after touching code that runs
under `m.mu` (unit tests missed a deadlock once).

## Keeper rules and gear (two separate jobs)

- **Keep (Keeper tab, leader only, Farm and Quest):** `PickitRules` in `Config.PickitRules` -> `Generated.nip`. Sub-tabs (Gems & Runes, Uniques & Sets, Magic & Rares, Base Items; tabs above the card like Config): Uniques and
  sets (base tier "X or higher": Normal/Exceptional/Elite, no item-level rules because Hell drops are ilvl 80+), Runes and gems,
  Magic and rare (`cmd/qolbot/magic.go`: one column per item type or charm size, each with a primary and a secondary pool of stat codes and minimums such as `ias 20`, and how many of each pool an item needs; the Miscellaneous tab has an "Anything Else" text area of raw pickit lines, the `trophy` field; the starter entries come from the author's old Rares.nip and the shorter pickits, which are reference only and not loaded),
  Bases (base-tier checkbox "from X quality or higher" = `BasesOn`/`BaseMin`, ethereal armor and helm of a chosen base tier (default exceptional), per-row nickname + item code rows). Every line on the page is a checkbox; runes, gems, resist total and base tier have a dropdown that only counts when checked. No NIP is ever shown on the page; hand-made lists
  are hidden (`customPickitLists = false`). Followers pick nothing up while you are not playing (`plan.noPickup`).
- **Self-gearing (Autoequip lists, every bot):** `Autoequip/caster.nip` (Sorceress, Necromancer, Druid) and `melee.nip` (Amazon,
  Paladin, Barbarian, Assassin), chosen by `autoequipFile(class)` (also in `_DefaultConfig.js` for hand-run bots); `merc.nip` for the
  mercenary. Tier = resists*100 + build stats + defense/damage. The parser splits on `[`, `==` and `#`, so tier expressions may not
  contain them (`autoequip_test.go` checks every line). Weapon lines exist only where "better" is clear: Sorc orb/wand, Necro wand
  and voodoo heads, Amazon javelins (type `javelin` OR `amazonjavelin`), Paladin scepter/mace/hammer, Barbarian primal helms and
  throwing weapons, Assassin claws, shields for all that use them. Unique, set, crafted and socketed gear already worn is never
  replaced (Equipment tab, `Config.Protect`: the protected kinds are also never identified, worn, sold or picked up as upgrades; keep-list pickups ignore it).
  Item rules (docs/AUTOMATION.md "What bots do with items"): no sell/pickup-gear/jewelry options any more; `Town.keepVerdict` (upgrade > keep list > sell), `Item.putAway`; all UNTESTED in a real game (edited 2026-11-10, no JS engine here). Crafting is forced off in AutoSpec.apply; bots look at dropped gear at the end of `Town.doChores` and in Follower's 30 s equip block; unidentified protected items are ignored by the pickup (`Pickit.pickItems`/`fastPick`).
- Quest mode uses both: the keep rules for loot and the Autoequip lists for dressing the leader.
- Desirable bases start from `defaultBases()` (pickit.go): the 27 plain bases the user's `qol_ui_filter.cfg` exempts from hiding at filter
  level 1+ (kite/dragon shield, monarch, polearms, scythes, big swords and axes incl. thresher, light armors). Shown until the list is
  saved once (`BasesSeeded`); after that an empty list stays empty.
- NIP log format: `Valid entries: <non-tier>/<all valid>`; `0/4` on merc.nip means 4 valid tier rules.
- Magic & Rares leniency (`lenient` in the rules, off by default): when on, each numeric minimum becomes `(stat)*100 >= minimum*[charlevel]`, so a bot asks for its own level in percent of the number (level 10: 10%, at least one point of the stat; 99: all of it). `[charlevel]` is a keyword added to `libs/NTItemParser.dbl` (it becomes `me.charlvl`, 100 at 99). Skill bonuses, sockets, durability and level limits are never scaled. It is evaluated per item in game, so a level-up counts at once. Auto-equip (the Autoequip lists and `Item.autoEquip`) decides what to wear on its own and is untouched by these rules. UNTESTED in game.
- Desirable class items (Base Items page; `cmd/qolbot/classitems.go`, `classskills.go`): a checkbox with a base tier, and one button per class (Barbarian primal helms, Druid pelts, Paladin auric shields, Necromancer voodoo heads, Sorceress orbs, Assassin claws, Amazon weapons). Each opens an input box of that class's individual skills and a minimum (`hurricane 3`), "at least N of"; written as `[skill<name>] >= n` for magic, rare and crafted items of that kind. The skill list per class was generated from `libs/NTItemAlias.dbl` and `sdk/skills.txt` (`classSkillList`). I could not find single-skill bonuses for class items in this game's MagicPrefix/MagicSuffix/AutoMagic tables, so that part rests on the author's say-so and the other pickits (`[skillfrozenorb] >= 3` on orbs); UNTESTED in game.

## Status tab

Two columns. Left: a pod per running bot (class, level, role "Leading Farm" / "Following X", state, **zone**, last activity + age). Right: **Activity**
list (newest 60 of the newest 200 events, memory only): items kept for a reason (click for the item's stats), gear equipped, boss kills (with
zone), quests completed, level ups (achievement pod with confetti), stat and skill points spent. Potions and tier-only pickups are not listed:
an upgrade shows when the bot actually equips it.

How it is fed: `followBotLogs` tails `d2bs/d2bs.log` per bot. `activity.go` has `friendlyActivity` (log line -> plain sentence, everything else
dropped) and `parseEvent` (line -> Activity entry). The scripts print the lines on purpose: `Engaging X` / `Killed X (Area)` (Attack.kill and
Attack.clear in Attack.js), `Traveling to X` (Pather.useWaypoint), `Going back to town` / `Going gambling` (Town.js), `Equipped X (gear upgrade)`
(Misc.js autoEquip), `Leveled up to level N` and the zone (ToolsThread.js; the zone goes by RPC `D2Bot.zone` -> `State.Zone`). Stat and skill
spending come from AutoStat.js / AutoSkill.js prints (only when the Automation switches allow it: Safe mode turns them all off). Item stat text comes from the RPC `printToItemLog` that
`Misc.logItem` already sends: `noteItemDesc` matches it to the entry by bot, time (20 s) and name; no match = "stats unknown" in the modal
(unidentified or unlogged). The pane id must not be `status` (`window.status` shadows it): it is `stpane`. Colour codes in a "Picked up" line
arrive as U+FFFD, 0xFF or "ÿ". The page routes by URL (/status, /pickit/base-items, /config/game ...; the server returns the page for any path).

With `QOLBOT_DEV=1`, `/api/state` also carries a `demo` block (`devdemo.go`: four made-up bots, a dozen events of every kind) and the Status tab shows it instead of real data, so its look can be edited with no game running. Real data is never replaced outside dev mode.

- Inventory view (click a bot card on the Status tab): `tools/ToolsThread.js` `reportInventory` sends `D2Bot.inventory(json)` every 10 s when the bot's items moved (equipped, inventory, belt, cube, stash; stat text for anything above normal quality); Qolbot keeps the last JSON in `State.Inv` and serves it at `/api/inventory?name=`; the page draws it in `invdlg` (grids at the configured sizes, click an item for its stats). UNTESTED in a real game: it assumes `D2Bot.<anything>` is passed through like `D2Bot.zone`, and that `item.fname`, `item.description` and `item.sizex` behave as they do in the item logger. The dev demo has a sample inventory.

## Bot card statuses and their icons (the card text is `friendlyActivity` in `activity.go`; the icon table is `actIcons` in `web/index.html`)

A status is what the bot is doing right now and it changes every few seconds. The bots print these lines as things happen; things that happened
(kills, quests, level-ups, points, gear, drinking a potion) are Activity entries or nothing, never a status. The dev demo (`QOLBOT_DEV=1`,
`devdemo.go`) has one bot per row.

| Icon | Status | Printed by |
|---|---|---|
| ⚔️ | Fighting demons | `Attack.noteFighting` before each attack, at most every 4 s; also "Detected hostile monsters" |
| 👹 | Engaging X (a boss) | `Attack.js` |
| 🧭 | Traveling (a long walk, at most every 4 s), Traveling to X (an exit, or a farm script starting), Going back to town | `Pather.noteTravel`, `Pather.moveToExit`, the script label, `Town.visitTown` |
| 🗺️ | Taking waypoint to X | `Pather.useWaypoint` |
| 🌀 | Taking portal | `Pather.usePortal` |
| 💬 | Talking to X (an NPC) | `Town.initNPC` |
| 🗄️ | Opening the stash | `Town.openStash` |
| ⏳ | Waiting on teammates, Waiting for a portal, Waiting for leader (idle in town, every 8 s), Waiting for first report | the leader's team wait, the follower's request to the leader, `Follower.autoFollow`, no report yet |
| 🔌 / 🚪 | Disconnected / Joining game, Creating game, Choosing difficulty | Qolbot (`noteStarterStatus`, `rpc.go`): the starter's "Game: ..." status turning into "Join Game" while the bot should be running is a disconnect (an Activity entry too); the card then shows the menu status and the zone "Menu" |
| 👣 / 👀 | Following X, Following the leader / Searching for leader X | Follower |
| 📜 / 💾 / 🚀 | Embarking on quest / Saving the character / Team is here | script labels, the team wait |
| 📍 | Just arrived (set on every zone change; the first attack replaces it) | Qolbot (`rpc.go`) |
| ▶️ | any other status (a script with no label: "Running X"): every bot card has exactly one icon | |

## Logs

`logs/qolbot.log` (also `/log`), `logs/wine.log`, `logs/bot-<name>.log`, `d2bs/d2bs.log` (D2BS console incl. `SAY:` lines from the
`say()` wrapper in `default.dbj`). Older runs: `logs/qolbot.prev*.log`.

## Verified live, and not

VERIFIED (real games): join and follow; town chores; pickup-area clearing; graceful save (Save and Exit works without PlugY, 2-4 s per
bot); Ctrl-C and Stop saving; Xvfb display selection; prefix rebuild from scratch (~37 s); storage settings plumbing.

NOT VERIFIED in a real game (unit tests / mocks only): everything in not-playing mode (host start, difficulty screen click coordinates
264,297/340/383, leader waiting for team, Farm scripts, Questing idles forever after some quests), quest NPC names, FollowNoFight /
FollowDistance (Summon druid), caster.nip / melee.nip tiers and the Assassin claw line, the stat-based pickit rules (NIP parse
check: watch `Loaded NIP: Generated.nip ... Valid entries`), merc equips, macOS/Windows
builds (compile only).

Next planned test: farm mode on Normal with high-level characters, every location script, logs checked; then Quest. The user must stop
their own Qolbot first and name the leader and follower. Only characters they name may be started as bots (earlier rule: Darius, Temp).

## Live test history

### Farm, 2026-11-10 (Darius level 15 Paladin leading, Temp level 1 Barbarian following, Normal, Corpsefire)

WORKED: not-playing start (leader hosts, "team" wait, Temp joined, Farm script Corpsefire ran, items and kill reported, ForceSave "Saving."),
the run loop repeats (Run duration 60-200 s), Status tab fed live, saves of both characters changed (their saves were backed up before the test;
the backups are not in the repo). Not confirmed: the difficulty-select screen click (the characters were already at/near Normal).
SEEN: Game.exe exits with 0xC0000005 right as a run's scripts end (leader), then Qolbot restarts the bot (~1 min); the user's `PlugY.ini` still has the
World Event / AutoSell on, which crashes bots (warned at start; not changed because Qolbot never writes the game folder). "Paladin.Darius.js not
found!" is Kolbot's harmless per-character config probe (no longer raised as a problem). Test settings were restored in `qolbot.json` afterwards
(player Reform, Hell, Corpsefire + Mausoleum).

### Quest, 2026-11-10 (Darius leading, Xena following, Normal)

Questing started ("Attempting to clear and capture", the Forgotten Tower: Tamoe Highland -> Black Marsh), the leader fights and chickens when low, level 16 was
reported. NO quest finished in ~8 minutes, so the quest logic is still unproven end to end. FOUND AND FIXED: **portal loop** in `Attack.clearLevel`:
`Town.needHealing()` uses `Config.HealHP/HealMP = 100` (the user's "heal at every town visit"), which is true at all times (`<=` 100), so the bot went to town after
every room. Out in the field `Town.needFieldHealing()` now counts only life at or under 50% (or poisoned/cursed). Also: level-ups were never reported (`me.charlevel`
does not exist, it is `me.charlvl`), a bot's status kept the sentence from the area it had left (a zone change now sets "Just arrived", replaced by "Fighting demons" when the bot starts attacking). Test settings restored.

## Hard-won facts (do not rediscover)

1. **Wine prefix recipe:** a bare prefix crashes the game (stack overflow in a D2 DLL). `setupPrefix`: `wineboot -i`, copy the
   runner's vkd3d dlls if it ships any, Windows 7. No winetricks needed. System wine 11 works; GE-Proton is not required. The bots
   need their own prefix: the user cannot play while bots share theirs, and a shared prefix with Xvfb dies with `X BadWindow`.
   Never export/resolve `WINEPREFIX` from the parent shell (it once ran a prefix update on the user's real prefix); Qolbot always sets it.
2. **D2BS reads switch values only inside double quotes** (`-profile "Temp"`). All values are quoted in `startProfile`.
3. **Window title = profile name**; scripts address each other by it. The bridge sets the title by PID.
4. The first `Handle` message is lost; the manager repeats it every 2 s until the script's first call arrives.
5. **`-direct -txt` is required** (the mod's Data folder). No `-3dfx` (cannot combine with `-w`). `-ns` works for the bots (the old
   warning that it crashes was wrong in this setup).
6. **Crash cause: PlugY World Event / ActiveAutoSell** (and the BaseMod World Event). They crash D2BS-injected games (0xC0000417 in
   msvcrt) within minutes. Set both off in `PlugY.ini` and `BaseMod.ini`; Qolbot only reads them and warns. `PlugY.ini` is CRLF: edit
   with CR-aware regexes (`sed` eats the `\r` and PlugY then reads defaults).
7. **Saving:** killing a game saves nothing. `quit()`/`quitGame()` do not save. Save and Exit through the in-game menu does (needs a
   follower to hold still first: `prepexit`). When the host leaves, every follower's unsaved progress is lost, and followers rejoin
   a new host by themselves (~85 s). Periodic auto-save exists (`autoSaveMinutes`, default 5; the AutoSaveThread for the leader).
8. **Config.Inventory matrix:** 1 = the bot's cells, 0 = locked. Matrix size must equal the inventory size or `Compare` throws.
   Container sizes cannot be detected (`getBaseStat("Inventory")` returns garbage), so `storage` is a setting.
9. **Loader tolerance:** `AutoSpec.apply` must tolerate plan fields an older Qolbot did not write (one threw and broke the bot config).
10. `.d2s` header: name @20, status @36 (0x04 hardcore, 0x20 expansion), class @40, level @43.
11. **JS files** under `libs/common` are not UTF-8 (`grep -a`); `Misc.js`/`Town.js`/`Pickit.js` are latin-1 with mixed line endings,
    `Quester.js` CRLF. Edit as bytes. There is no JS engine here except headless Firefox (`new Function(src)` + mocked globals).
12. Never `pkill -x Game.exe` (kills the user's own game) and never `pkill -f` with text from your own command line. Stop bots through
    the Qolbot API or its PID.
13. Unknown URLs on the web server return the page with HTTP 200, so a stale running binary looks like "button does nothing":
    restart Qolbot after Go changes (dev mode only refreshes the page file).
14. Quest status bits: `getQuest(id,1) && !getQuest(id,0)` = reward pending. Quest credit needs the main player to have it too.
15. Wine/Go gotchas fixed with regression tests: stale Xvfb socket files made bots start visible (`TestStartXvfbSurvivesStaleDisplayFiles`);
    `writeSpec` held `m.mu` while calling a function that takes it (`TestWriteSpecDoesNotDeadlock...`).

## Rules from the user

- Never add or change files in the real Diablo II folder without asking. Qolbot reads `PlugY.ini`,
  `BaseMod.ini` and `qol_ui_filter.cfg` there and writes nothing.
- Copy of the save folder before tests; Normal difficulty with their high-level characters is acceptable.
- Web copy: "you" not "I"; Qolbot capitalised; Solarized colours only in the console; class pills; flag icon for the leader.
- README.md is the user's own: small edits only.

## Recent changes, UNTESTED in a real game

- Sorceress templates: the Static Field point (`[42, 1, false]`) was removed from Meteorb and Lightning (their `CastStatic` is 100 = never cast, so the point was wasted; AutoSkill adds real prerequisites by itself). FrozenOrb keeps it (`CastStatic = 60`).
- Merc upgrades: `Item.autoMercEquipCheck` now also asks `mercCanWear` (a Desert Guard cannot wear shields in the script table, nobody wears rings), so the bots stop picking up and keeping gear their mercenary will refuse. Before, such items piled up in the pickup corner and were swept into the stash on the next join (Meir stashed three kite shields). Check the `Item.mercWeapons` table if a mercenary turns out to wear more than it says.
- Activity entries for items: a kept pickup ("Picked up" line, 🏆 or the item icon, "Keeper"), a stash ("Stashed <item>" printed by `Town.stash` and `AutoSpec.freePickupArea`, 🗄️, "Stashed"). Both carry the quality colour, so Qolbot reads the raw log line (`rawD2BSText`) for them.
- Kill watching (ON by default, `"watchKills": false` in qolbot.json turns it off; docs/AUTOMATION.md "Kills the bots report as they watch"): `tools/ToolsThread.js` `watchKills` (it first lived in PickThread.js, which these bots never load: default.dbj hooks fast pickit itself) (a boss dying, `spectype & 0x05`: super unique or unique, no champions; scanned every 2 s), Qolbot dedupes by monster id in `addEvent`. Followers loading the Keeper rules while you play ("followerKeepers") and "Saw drop" reports were tried and REMOVED: a follower picked up something it should not have. UNTESTED in a game.
- Config, Quests tab: `questClearAll` (default true). When false, `Quester.clearAndCapture` never calls `Attack.clearLevel` (the quest scripts kill their own targets). UNTESTED.
- Quester audit (docs/QUESTER.md): `Quester.error()` idles the leader forever (the 3-attempt retry never runs after an error), the catch around a quest function is empty, `act2_tainted_sun` and `act2_summoner` are in the table but have no function, no partial progress, quest state is per difficulty, `grindLevels` is dead code.
- Follower, leader out in an area with no waypoint (e.g. Tamoe Highland): `useWaypoint` throws "Invalid area" and the old code then tried the leader's portal, which went nowhere ("area 1 -> 1", 4 trips in 6 s, then the "I keep going out" chat line; seen in logs/bot-Xena.log 2026-11-10 18:23). Now the stuck follower says "I cannot reach you. Open a town portal ..." (repeated every 45 s) and the LEADER bot's `tools/TownChicken.js` thread (a `chatmsg` listener, only when `Config.Leader` is empty) pauses default.dbj, calls `Pather.makePortal()` and resumes; until it does the follower waits in town (it never walks out alone: user rule). UNTESTED in a game.
- Stopping: `Manager.stopMany` / `saveAllAndWait` stop the followers first, wait until they are stopped, then the leader (the host must leave last or the followers lose unsaved progress); used by Stop selected (`/api/stopmany`), Stop all and Ctrl-C. Stopping the leader while other bots are still running is refused (`Manager.stopBlocked`, the page shows the message): stop them first or use Stop all.

## To do

- Verify the not-playing path end to end (above), including the difficulty screen coordinates with a screenshot.
- Questing: idle-forever after some quests; farm scripts depend on `_DefaultConfig` options per script.
- Bots' audio still plays on the user's speakers (route Wine audio to a null sink); not done.
- Possible: shorten the 60 s wait before D2BS injection; headless Linux box setup.
- "JMOD"-style magic trophy items: the user mentioned them for the Keeper tab; the term was not identified, so nothing was built.
