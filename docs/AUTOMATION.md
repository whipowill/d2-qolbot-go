# Automation: how a bot decides what to be

A bot can do three things for itself: **Auto Skill** (spend its skill points), **Auto Stat** (spend its stat points) and **Auto Equip**
(put on better gear). This page explains how the program works out what each bot should be, the plan it writes for every bot when it
starts, what the three switches and safe mode do, and how bots treat items. For quests see `QUESTER.md`. For setup and running see
`../README.md`; for the state of play and test history see `../NOTES.md`.

## The three automations

| | What it does | When it runs | Switch |
|---|---|---|---|
| **Auto Skill** | spends skill points along the build's skill order (kolbot `AutoSkill`) | when a game starts (`AutoSkill.init` in `default.dbj`) | Config, Automation tab: `"autoSkill"` |
| **Auto Stat** | spends stat points along the build's stat order (kolbot `AutoStat`) | when a game starts (`AutoStat.init`) | Config, Automation tab: `"autoStat"` |
| **Auto Equip** | puts on better gear for the bot and its mercenary | in town chores, and every 30 seconds while a follower waits or follows (`Item.autoEquip`) | Config, Automation tab: `"autoEquip"` |

All three are on by default. **Safe Mode** (Bots page) switches all three off for every bot started afterwards, whatever the Automation tab
says. Points a bot earns during a game are spent at the start of its next game.

## The plan: what happens when you press Start

Nothing about a bot is remembered between runs except its save file. Each time a bot is started, Qolbot builds a fresh **plan** for it:

1. **Start** (`startProfile` in `cmd/qolbot/main.go`) calls `writeSpec`, which makes the plan (`cmd/qolbot/specplan.go`).
2. **Read the save.** The character file (`<Game dir>/Save/<Name>.d2s`, read-only) gives the class, level, base stats, unspent points and
   the points in each of the 30 class skills (`internal/spec/d2s.go`).
3. **Choose a build** (`Detect` in `internal/spec/plan.go`): a template when the points fit one, a fresh-character default, or a custom
   build around the skills the character already uses. See "How the build is chosen" below.
4. **Add the settings** from `qolbot.json` and the web page: the container sizes and stash policy, which kinds of items are protected,
   the keeper lists for the bot's role (leader or follower), the objective (Quest or Farm and the locations), chat and saving options,
   and the three automation switches. Safe mode is folded in here: with it on, the plan carries `autoEquip`, `autoStat` and `autoSkill`
   as false.
5. **Write it** to `d2bs/kolbot/data/<profile>.spec.json`, then Qolbot writes `d2bs/d2bs.ini` (which starter script and script this bot
   runs) and launches the game.
6. **The game applies it.** The class config file (`libs/config/<Class>.js`) calls `AutoSpec.apply()` (`libs/common/AutoSpec.js`), which
   reads the plan, loads the build template (attack skills, skill order, stat order), applies every setting, and applies the switches
   last, so no template can switch one back on.
7. **During the game:** `AutoSkill` and `AutoStat` spend points as the game starts, and Auto Equip runs as described above.

The plan is a plain JSON file. Look at `d2bs/kolbot/data/<profile>.spec.json` after a start to see exactly what a bot was told:

| Group | Fields |
|---|---|
| Who | `name`, `class`, `level`, `mode` (template / fresh / custom), `template`, `spec`, `reason` |
| Custom build | `skills`, `stats`, `main` (custom mode only) |
| Automation | `autoEquip`, `autoStat`, `autoSkill`, `safeMode` |
| Items | `protect`, `pickit` (the lists), `noPickup` (a follower while a leader bot farms), `storage`, `gamble` |
| Objective | `script` ("Goal" for the leader), `goal` (Quest or Farm), `farm` (the locations) |
| Behaviour | `plugy`, `autoTown`, `autoSaveMinutes`, `reportTasks`, `reportProblems`, `banter`, `banterBubble` |

Because the plan is written at start, **changing a setting only affects bots started afterwards.**

See what Qolbot thinks of your characters, without starting anything:

    ./qolbot spec            # every character
    ./qolbot spec Darius     # one

The web page also has a **Spec** column (hover for the reason).

## What gets read from the save

Class, level, base stats (strength, dexterity, vitality, energy), unspent skill and stat points, and the hard
points in each of the 30 class skills. Checked against the in-game values for Darius (level, vitality, energy, all
five skills and unspent points match exactly; the save holds base stats, so strength and dexterity read lower than
in game, where gear adds to them).

## How the build is chosen

1. **Brand new (0 or 1 skill point spent):** the class default path (below).
2. **A template fits:** each template's skill list is scored against the character. The character must share at
   least one exact skill with the template, and at least **75%** of its spent points must sit in the skill trees that
   template uses. Points in the same tree count, so prerequisites and support skills are not held against a build
   (for example Might on a Zealot). The best score wins.
3. **Early and unclear (under 8 points spent, no fit):** the class default path, because with so few points almost
   any build looks the same.
4. **Established but nothing fits:** a **custom** continuation (see below).

You can override all of this per character in `qolbot.json`: `"spec": "Hammerdin"` on the profile (the name is the
template file name, case-insensitive). The web page shows `(set)` next to a forced build.

### Brand-new characters

A new character, or one with no clear direction yet, follows this default for its class:

| Class | Default | Why |
|---|---|---|
| Amazon | **Bowazon** | ranged, safe for a follower |
| Sorceress | **Blizzard** | the standard cold build |
| Necromancer | **Summon** | minions fight for it |
| Paladin | **Zeal** | sturdy, forgiving |
| Barbarian | **Whirlwind** | the standard Barbarian build |
| Druid | **Summon** | minions fight for it |
| Assassin | **Kick** | martial arts; simplest to run |

Because the default path is what spends the early points, the next start detects it and the choice sticks.
It is hard to read the right build at the lowest levels, so if you already know which one you want, force it.

## All specs

Every `.js` file under `d2bs/kolbot/libs/config/Templates/<Class>/` is a spec. Adding a file adds a spec; no code
change is needed (see below).

| Class | Specs |
|---|---|
| Amazon | Bowazon, Javazon |
| Sorceress | Blizzard, FrozenOrb, Lightning, Meteor, Meteorb |
| Necromancer | Summon, Bone, PoisonNova |
| Paladin | Zeal, Hammerdin, Smiter |
| Barbarian | Whirlwind, Frenzy, Throw |
| Druid | Summon, Wind, Fire, Fury |
| Assassin | Kick, Trapsin |

(22 in total. `Smiter` is the Fist of the Heavens build. `Meteorb` is Meteor plus Frozen Orb. `Kick` is the martial-arts build. `Lightning` is Chain
Lightning. `Wind` is Tornado/Hurricane. `Fire` is Fissure/Volcano/Armageddon. `Fury` is the werewolf.)

Twelve of these (`FrozenOrb`, `Lightning`, `Meteorb`, `Bone`, `PoisonNova`, `Hammerdin`, `Smiter`, `Wind`, `Fire`,
`Fury`, `Trapsin`, and the filled-in Necromancer `Summon`) were written for this project from published build guides
(point allocations, which skill is the attack, which buffs and pets, stat priorities), then expressed in kolbot's
template format. They have a header comment saying so. The guides are for the current Resurrected balance, so some
numbers (for example Concentration as a Hammerdin synergy) can differ from this 1.14 game; edit freely.
Skills are listed in the order the guides spend them: one point in each prerequisite, then the main skill, then
synergies and buffs. Precast already casts Energy Shield, Cyclone Armor, Fade, Burst of Speed, Bone Armor, the
Druid pets and so on by itself once they are learned, so the templates only choose what to learn and what to attack with.

### Custom (no template fits)

A character with plenty of points that matches no template, such as a fire/cold hybrid Sorceress, is not forced
into one. It gets a custom plan:

- **Skills:** keep building what it already has, most-invested skill first, up to 20 points each. Prerequisites are
  handled automatically by `AutoSkill`.
- **Main attack skill:** the most-invested attack skill, but only if it has at least 5 points (1 to 4 points is usually
  a prerequisite, not a main skill).
- **Stats:** strength goes up to 180 (it stays where it is above that), dexterity stays where it is, everything else goes to vitality.

## Skill points

Done by kolbot's `AutoSkill`, using the template's `Config.AutoSkill.Build`: a list of
`[skill id, target count, satisfy]` entries. Counts are absolute targets (capped at 20), not "add this many", so a
character that is already past a target skips it. `satisfy = true` means "finish this before moving on";
`false` means "keep going through the list". Prerequisite skills are added automatically at one point each, using the
requirements stored in the game data, so modded skill trees are respected.

Points are spent when a game starts, so points earned during a game are spent at the start of the next one (`AutoSkill.init` runs once, in `default.dbj`).

## Stat points

Done by `AutoStat` from the template's `Config.AutoStat.Build` (strength, dexterity, energy and vitality, as
absolute targets, ending with the rest into vitality). New templates use a caster plan (strength for armour, then
vitality; no energy: 2026-11-13 the Necromancer, Sorceress, Summon Druid and Javazon templates lost their energy lines, which had put 50 points into energy, as on Sankt, whose
life was 187 at level 25) or a melee plan (strength and dexterity for gear, rest vitality). Vitality is what keeps these bots alive. Points already spent stay spent.

### Stat rules by build kind (the user, 2026-11-16)

Every build ends with at least 180 strength (an Elite Monarch needs 156). "Equal" means one point at a time to whichever of the listed stats is lowest, so they stay equal at
every level; the templates generate the order in a loop (`Config.AutoStat.Build.push(["s", n], ["d", n], ["v", n])` for n from 21 to 180, then `["v", "all"]`). Equal means equal
totals, not equal points added (the lowest catch up first).

| Kind | Builds | Equal stats, up to 180 each | After 180 | Energy | Dexterity |
|---|---|---|---|---|---|
| Melee | Whirlwind and Frenzy Barbarian, Zeal and Smiter Paladin, Kick Assassin, Fury Druid | strength, dexterity, vitality | all vitality | none | yes |
| Ranged melee | Javazon, Throw Barbarian, Bowazon | strength, dexterity, vitality | all vitality | none | yes |
| Summoners | Summon Druid, Summon Necromancer | strength, vitality | all vitality | none | none |
| Casters (every other build) | the five Sorceress builds, Bone and Poison Nova Necromancer, Trapsin, Fire and Wind Druid, Hammerdin | strength, energy, vitality | all vitality | yes | none |
| Custom (no template fits) | built from the character's own skills | strength goes up to 180 first | all vitality | none | stays where it is |

A new build gets one of these four kinds; say which when adding it. The tests (`internal/spec/plan_test.go`) accept the generated order as long as it ends with the `["v", "all"]` push.

### Game mods: one module each

Everything a bot asks of a mod is in a class of its own under `d2bs/kolbot/libs/common/`, so it can be controlled in one place (the user, 2026-11-16). Nothing else in the bot
scripts sends these commands: `scripts/jstest.sh` has tests for each module, and a grep for `say("/save`, `say(".reset`, `say(".deposit` outside these files finds nothing.

| Module | The mod | Settings, Game checkbox | What it does |
|---|---|---|---|
| `PlugY.js` (`PlugY`) | PlugY | "Using PlugY?" (`plan.plugy`, `Config.UsesPlugy`) | `/save` (Saver, ForceSave, the leader's "save" order), `/insertpage`, `/swappage n`, the first-page click, `newStashPage()` (Pack, Cubing) |
| `Qol.js` (`Qol`) | the user's QOL mod (qol.dll) | "Using QOL?" (`plan.qol`, `Config.UsesQol`) | `.reset stats`, `.reset skills` (Respec); the mercenary options `equip` and `drop_items` count only with it on |
| `Quartermaster.js` (`Quartermaster`) | Quartermaster (Quartermaster.dll) | "Using Quartermaster?" (`plan.quartermaster`, `Config.UsesQuartermaster`) | `.deposit` (on arrival in town, in the chores' stash step, at the start of a game in `Pack.freePickupArea`) |

With a mod's box unchecked its module sends nothing and says so once in the log. A new command for one of these mods goes into its module, not into the script that needs it.

**`.deposit` never fires from two bots at the same moment.** Every send takes a lock first (`Quartermaster.lock`): one small file per bot, `data/qm.<profile>.json`, written by that bot alone
(`req` when it asked, `busy` while it holds the lock, `done` when it last finished, `at` a heartbeat). A bot sends only when no other bot is sending, none finished within 1.2 s, and no
other bot asked before it (order by request time, then name); after taking the lock it waits 0.4 s and looks again, and gives it back if a bot ahead of it took it too. A bot whose heartbeat
is 10 s old (crashed, left the game) is ignored; a bot that waits 45 s (20 s on an emergency visit) skips this deposit. Five bots arriving together are through in about 15 s, at least 3 s apart.
`scripts/jstest/quartermaster_test.js` simulates five bots reading the files at the same instants, 300 random starts: each sends once, never two together.

### Auto Respec (PlugY)

Settings tab, Automation, **AutoRespec** (off by default; needs AutoSkill and PlugY). A bot in town whose skill points are badly placed takes
them all back once, and AutoSkill spends them again along the build. Only skill points: PlugY's stat un-assign needs a held key.

**Warning (2026-11-16):** with the user's own mod (`.reset stats`) it also takes back STAT points that sit above the template's plan, once per character and build, and spends them again by the template. Stats you set by hand that the template would not choose are undone: Barabas's 145/141/146/18 became 84/69/222/10 on 2026-11-16 (run 7 start). Uncheck AutoRespec once a character's stats are as you want them, or make the template match what you want first.

How a bot judges it (`libs/common/Respec.js`): it runs AutoSkill's own allocator on paper, with all the points it has (spent and unspent), at its
current level, and compares that with where its points are. Points the paper plan would have put elsewhere are *misplaced*. It respecs when at least
6 points are misplaced and they are a quarter of its points or more, and the paper plan can place at least 60% of the points; or, when you chose the
build by hand on the Bots page, when at least 3 are misplaced. A bot whose points match no build (custom mode) is left alone unless you chose a build
by hand. One try per character and build (`data/<profile>.respec.json`), whatever came of it. The click is PlugY's X button at the top right of the
skill page (T), sent through the bridge; the bot checks that its unspent points went up and says so in the Activity list ("Respec" or "Respec failed").

### Gold

Bots keep gold in the pack (pays for scrolls, potions, repairs) and in PlugY's stash gold. Before the town chores a bot takes gold out of its stash
up to 2000 in the pack. A bot in town with under 400 gold in total asks the team in chat; every other bot in the same town with at least 1000 gold (a bot
under 1000 gives nothing) drops 200 to 1000 of it beside the asker (half of what is above a 600 reserve, once per request), and the asker picks it up. A gold pickup mod that
takes dropped gold back in town defeats this: the donor logs "came straight back to me". PlugY's shared gold is not used (this install has
`ActiveSharedStashInMultiPlayer=0`, so it does not exist in the bots' TCP/IP games).

When nobody is playing and the objective is Quest, two **hunts** can interrupt the quests, and the leader's card says which one it is leading
("Leading level hunt", "Leading gold hunt"; "Leading waypoint hunt" while the team shares waypoints at the start of a game; otherwise "Leading quest"):

- **Level hunt:** the chicken limit tripped. The team levels on an easy Farm run until its weakest bot has gained 3 levels, then goes back to the
  quests. If the limit trips again during the hunt, everybody stops (a fatal event, red box on the Activity page).
- **Gold hunt:** the team holds under 1000 gold per bot (pack plus stash, the team's total divided by its bots; every bot writes its purse to
  `data/<profile>.purse.json`). It runs the same easy Farm list until EVERY bot holds at least 10000, with no time limit, and not again within an
  hour of the last one. On the way to each boss it clears every area it passes through (Forgotten Tower and Tower Cellar 1-4 for the Countess,
  Catacombs 3 for Andariel): more kills, more gold. Who picks up what, while nobody is playing (in Farm and in Quest mode): the **leader** picks up the keepers and the quest items; the followers, and the
leader on a gold hunt, also pick up what `pickit/GoldSell.nip` lists, to sell it in town: every ring and amulet, rare and crafted gear, and magic gear
of any item level (from level 1: before 2026-11-14 only item level 60 or more). The leader loads the file only on a gold hunt (normally it picks up whatever might be a keeper or an upgrade and sells the rest anyway); the
followers load it always. The file is plain NIP, edit it freely. It is read after every keep list, so a keeper is kept as always (and stashed); a bot's upgrade is put on; a
kind the Equipment tab protects is not picked up at all. Each follower therefore earns its own gold. Room: a quest item gets room from every bot (it makes
space for it); a keeper that does not fit on the leader sends it to town to sell the gold items first, so gold items never keep out a keeper. If nobody has town portal scrolls or the gold for any, everybody stops instead (a fatal event).

The leader is never a bot with no scrolls and under 150 gold, if another can lead. Repairs never take the last 300 gold of a bot that has fewer than 5
scrolls.

## Gear

Auto-equip is on by default (turn it off for every bot with `"autoEquip": false` in `qolbot.json`, on the web page's
Settings tab, Advancement, or use safe mode). The bot looks through its inventory and stash (while in town) and equips an item when
it beats what is in that slot.

- **What counts as better:** each piece is scored for the character's build, not just its class (`libs/common/Gear.js`, used by
  `pickit/Autoequip/gear.nip`; `merc.nip` for the mercenary). A Hammerdin is ranked as a caster (skills, cast rate), a Zealot as a fighter
  with a one-handed weapon and a shield, a Bowazon wants a bow and no shield. A Whirlwind or Frenzy Barbarian wants the weapon kind of his
  mastery, and a Kick Assassin's boots count for their kick damage. Every score adds resistances, the build's skills (all, class, its skill
  trees, its own skills), its stats, then defense. Weapons and shields the build does not use score 0. A two-handed weapon must beat the
  weapon and the shield together; the shield comes off first. Unidentified items are identified with a Tome of Identify first if the bot
  has one.
- **What is never replaced is configurable.** The defaults are the rules you asked for: **unique, set, crafted, and
  anything socketed or runeword**, plus Khalim's Will. Change them on the web page (**Settings** tab) or in
  `qolbot.json`:

      "protect": {"unique": true, "set": true, "crafted": true, "rare": false, "magic": false,
                  "socketed": true, "runeword": true, "ethereal": false, "classIds": [174]}

  `classIds` protects specific items by class id. Changes apply to bots started afterwards. The check itself is
  `Item.isReplacable()` in `libs/common/Misc.js`, which reads these values.

### Mercenary gear

The merc uses the same protection rules and `pickit/Autoequip/merc.nip`, which now has rules for helms, body armor,
**weapons, shields, rings, amulets, belts, boots and gloves**. It used to have helm and armor rules only, so a merc
weapon never had a score and was never equipped; that, rather than anything in the equip click, is why merc weapons
"didn't work".

Which item types a merc can wear is decided in code (`Item.mercWeapons` in `libs/common/Misc.js`), following what
your `qol.dll` allows (`qol.ini` `[mercenary] equip=1`): Rogue bows and crossbows; Desert Guard polearms, spears and
javelins; Iron Wolf shields, 1H swords, wands, scepters, maces and orbs; Barbarian swords, axes, maces and hammers;
rings, amulets, boots, gloves and belts only when you check them under **Mercenaries can wear these items** on the Equipment tab
(`"mercWear"` in `qolbot.json`; the base game allows none of them, some mods allow all, and the default is none). This needs `qol.dll` loaded (the bot game folder's `PlugY.ini`
has `DllToLoad=Basemod.dll|qol.dll`) and BaseMod's `[MercMod]` options all `0`.

- Items the merc cannot wear are skipped without trying, so nothing gets stuck on the cursor.
- If the game refuses an item anyway, it goes back in the inventory and is not retried for that slot.
- The log prints `autoMercEquip: merc <name> (class N)` and one `candidate` line per item with its score, the score of
  what the merc wears, and whether it can be worn, so you can see why something was or was not equipped.
- Verified in game: a Rogue (class 271) correctly skips two Paladin shields. Not yet seen: an actual equip click,
  because that needs something the merc can wear in the bag. Drop a bow, a crossbow or any ring, amulet, belt, boots or
  gloves in a bot's inventory to try it.

## Inventory, stash and picking up items

Picking up items and stashing run on kolbot's `Storage` grids, which track every cell of the inventory, stash and cube from
the positions of the items in them (`Storage.Inventory.CanFit(item)`, `openPositions`). A bot only picks something up
if it fits, and moves things to the stash from town. For that to be right, the grids must be the real size.

- **Sizes are settings, not detected.** The game does not let a script read them (the data table that holds them
  returns garbage when asked), so they are on the web page's Settings tab under **Inventory and stash**, or in
  `qolbot.json`:

      "storage": {"inventory": [10, 6], "stash": [10, 10], "cube": [3, 4], "addStashPages": true}

  Each pair is columns x rows. The defaults are a 10x6 inventory, PlugY's 10x10 big stash and the
  standard cube. If a size is wrong, items get placed in cells that do not exist or space is never used.
- **When the stash is full** the bot does one of two things, your choice (`addStashPages`):
  - **on (default):** it inserts a new PlugY stash page (`/insertpage`) and keeps going. This changes the character's
    stash, and needs PlugY's chat commands (`ActiveCommands=1`).
  - **off:** it stops itself with "No More Space In Stash!".

  It never deletes or sells anything from the stash to make room.
- **What a bot leaves alone in its pack.** There is no pick up area setting any more: the bots use every cell of their
  pack. What they never sell, stash or identify is what you keep there on purpose, recognised by what it is, wherever it
  sits (`Item.userOwned` in `libs/common/Misc.js`): charms (small, large, grand and the Torch), tomes, keys and the
  Horadric Cube. Endgame materials (the Pandemonium keys, organs, tokens) are ordinary keepers and go to the stash. A charm
  the bot picked up itself in this game is the bot's: if it is a keeper it is stashed, if it turns out not to be one it is
  sold. The bot also writes down what it picked up (`data/<profile>.charms.json`: the charm's kind, quality, item level and,
  once identified, a hash of its stats), because the game's item ids are only good for one game. After a restart a charm that
  matches an entry is still the bot's; an entry is dropped when the charm is stashed or sold. The entry also holds the cell the game put the charm in: if the charm is found anywhere else (you moved it in the pack, or took it
  out of the stash again) the bot takes that as you claiming it, forgets it and leaves it alone from then on. As a safety net, the first time a bot looks at its pack in each game it drops every entry that no longer matches a charm in the pack
  (stashed some other way, sold, lost, traded, or never there after a restore from an older save), and the list never holds more than 60. A charm you put in the pack
  that happens to look exactly like one the bot is carrying is the one case it could mix up. Older `pickupArea` and `pickupCorner` entries in `qolbot.json` are ignored.
- **The cube as extra storage.** When a keeper no longer fits in the stash, the bot puts it in the Horadric Cube (if it
  carries one and nothing is set to transmute: no cubing recipes and no runewords) before it adds a stash page or stops.
  Items in the cube show in the bot's inventory view. Nothing is ever taken back out.
- **Keepers in the pack when a bot joins.** Right after a follower is in your party, and before its town chores, it
  checks its pack. If a keeper is in it, the bot says so in chat ("I have 3 keeper(s) in my pack. Moving them to my
  stash."), moves it to the stash, and reports when it is done. Junk is left for the town chores to sell. If the stash is
  full it follows the stash-full choice above (add a page, or say so and stop). Turn this off with
  `"clearOnLoad": false`.

## A bot that may not be ready for where it is sent

**On by default.** A bot that keeps chickening (leaving the game because its life ran low) or dying is out of its depth, and
going round the same loop for hours helps nobody. When a bot has chickened or died **3 times within 30 minutes**, Qolbot
stops it (saved and exited, like the Stop button) and puts a **Stopped: may not be ready** entry on the Activity tab: how many, how long,
which difficulty and areas, and the last thing the bot said about it (for example "Life Chicken (164/811) to Champion Apparition").
A leader that is stopped takes the whole team with it (the followers first, the leader last).

Qolbot judges the pattern, not the character: it does not read level or gear. Turn it off or change the two numbers on the **Settings tab, Behavior,
Safety** (a checkbox: unchecked means never stop a bot for this); it applies at once, because Qolbot does the counting, and is kept in
`qolbot.json` as `chickenLimit` (0 = off) and `chickenWindowMinutes`. The count starts again after a stop.

## Kills the bots report as they watch

**On by default.** Turn it off with `"watchKills": false` in `qolbot.json` (no checkbox yet) and restart the bots, if the scan costs you too much CPU.

When you play, the bots stand next to you and decide almost nothing, so there is little for them to say. Every bot
(`tools/ToolsThread.js`, whether you play or a bot leads) looks at the monsters near it every two seconds. When a
boss (an act boss, a super unique or a gold-named unique) that it saw alive dies, it writes `Killed <name> (<zone>) [id]`, and the Activity list shows
"<name> Defeated". Champions are not reported. A death it did not watch (a corpse lying there when it arrived) is not reported.
Minions are not.

Three bots see the same kill, so each line carries the monster's id and Qolbot shows an id once (within two minutes). When a bot leads,
its own kill lines (which have no id) and the followers' lines for the same boss in the same place are merged into one entry. It only
works near the bot: a bot far away sees nothing.

Items are reported only when a bot picks them up (the "Picked up" lines: a kept item, with its quality colour). The bots do not report
items they merely see on the ground, because only the bots that load your Keeper rules can tell a keeper from junk: the leader while a bot
leads, and nobody while you play.

## Chat

Bots say a quote now and then (`libs/config/Quotes/quotes.json`). On the Settings tab, **Chat** can turn that off, and
can start each quote with `!` so the game shows it in a bubble over the bot's head (`"banter": true`,
`"banterBubble": true` in `qolbot.json`). Whether `!` produces a bubble in your game is something to confirm by eye.

## Saving

A Diablo II character is only written to disk when the game saves it. **Killing a game saves nothing**, so a bot that
is stopped loses everything it did since its last save: experience, loot, skill points, items it moved to the stash.
Measured on a real character (the file compared before and after):

| What the bot does | Character file written? |
|---|---|
| nothing, then the game is killed | no |
| `quit()` from a script (leave the game) | no, even after waiting 40 seconds |
| `quitGame()` from a script | no (and it did not even close the game) |
| `/save` chat command, PlugY's commands **on** | yes |
| `/save` chat command, PlugY's commands **off** | no: it is a PlugY command |
| the game's own **Save and Exit Game** menu button, PlugY's commands **off** | **yes** |

The last row is what a player does, and it needs no PlugY at all. Qolbot does it for the bot: the script closes any
open panel, then `d2bridge.exe` presses Escape and clicks "Save and Exit Game" (posted as window messages, placed
relative to the window's size). The saved file was checked to hold the real state (a purchase made just before: total gold
down by exactly its price, the new item added).

**What Qolbot does**

- **Before a bot is stopped** (the Stop button, `qolbot stop`, and Ctrl-C) every bot that is in a game is saved first,
  all bots at once, and only then is the game killed. A save is confirmed by the character file really changing. If Save
  and Exit does not write it within 12 seconds, Qolbot tries PlugY's `/save` (when PlugY's commands are on). If neither
  works the log says so and the bot is stopped anyway. A bot that is not in a game yet is stopped at once.
  A stop takes about 2 seconds per bot, and the whole Ctrl-C shutdown about 6.
- **While a bot follows you**, it also saves every few minutes (default 5) and right after it moves items to its stash,
  but only through PlugY's `/save`, because leaving the game to save would drop the bot out of your party every time.
  With PlugY's commands off, periodic saving is unavailable (the Settings tab says so); saving on stop still works.

Both are on the Settings tab under **Saving** (`"saveOnStop": true`, `"autoSaveMinutes": 5`, 0 = never). The first
Ctrl-C does all of this; a second Ctrl-C skips the saving and forces everything down at once.

## Automation switches and safe mode

The **Automation** tab (Config) has three checkboxes, all on by default: "Bots can auto-equip items they deem to be an
upgrade" (`"autoEquip"`), "Bots can auto spend stat points" (`"autoStat"`) and "Bots can auto spend skill points"
(`"autoSkill"`), all in `qolbot.json`. With auto-equip off a bot never picks up gear to try on, because nothing could be an
upgrade.

The **Safe Mode** checkbox on the Bots page (`"safeMode"`) says "Bots are prohibited from AutoEquip, AutoStat, and
AutoSkill": it switches all three off whatever the Advancement tab says. It also limits what they pick up to potions, scrolls, tomes, keys, gold and the quest items they keep (nothing else, whatever the
keeper rules say). Qolbot
folds it into the plan it writes for each bot, and the plan is applied after the template loads, so no template can switch
any of it back on. It only affects bots started after you change it.

## Adding or changing a spec

1. Copy a template in `libs/config/Templates/<Class>/` and change the attack skills, the `AutoSkill.Build` and the
   `AutoStat.Build`. It must keep `function LoadTemplate()` and a non-empty skill build.
2. Run `go test ./internal/spec/`. It checks every template's brackets, that each skill belongs to the right class and
   that the stat plan ends with an "all" entry.
3. `./qolbot spec` shows whether characters start matching it. To change a class default, edit `DefaultTemplate`
   in `internal/spec/plan.go`.

## Limits, and what has actually been tested

Tested for real:
- The save parser against the in-game values for Darius.
- Detection on all seven characters in this install (Darius Zeal, Reform Druid Summon, Vanity Javazon,
  Barabas Barbarian Throw, new Temp Whirlwind default, Meir a custom fire/cold Sorceress, Xena a custom Assassin).
- All 22 templates for structure (`go test`).
- The whole chain on a real follower: a host bot invites a joiner, the joiner gets the plan, runs `AutoSkill` and
  `AutoStat`, does its town chores and then follows. Darius (Paladin, Zeal) did this with auto-equip on.
- The loader in a running game: a new Barbarian was detected, given the Whirlwind template, and followed a leader
  with it. Safe mode was also run live: with it on, the loader reported `AutoSkill=false AutoStat=false` even
  though the Whirlwind template enables both. The web page shows the spec column and the safe-mode checkbox.

Seen working since (logs of 2026-11-10): `AutoSkill: Using skill point in Skill: Blessed Aim` and `AutoStat: Using 4 stat points in
Vitality` / `1 stat points in Dexterity` on Darius when a game started, and a plan file with the three automation switches.

Not yet seen working in a game:
- Auto-equip choosing and swapping gear, the crafted-item protection, and anything with a mercenary.
- Every template other than Whirlwind has never been run in a game. Only Darius (Paladin) and Temp (Barbarian)
  may be started as test bots, so the other classes' templates are checked only for structure.
- Spec detection on the very first levels is guesswork by nature; see the new-character section.

The plan comes from the save file as of the last exit, and the build is re-chosen at each start, so a build
change you make by hand is picked up next time with no extra step.

## Following you between town and the field

Bots watch where you are. When you walk out of town they follow (exit, waypoint or your portal); when you go back to
town they take your portal (or open their own) and run town chores. If they cannot reach you (the area you are in has no waypoint, or an act they have not unlocked) they say so in chat, and a leader
that is a bot answers by opening a town portal for them, as soon as it is out in the field. Until then they wait in town and ask
again every 45 seconds; a bot never walks out alone to find the leader.
Switch it off with `autoTown: false` in the plan. Town chores only run the parts that are needed (heal when hurt,
potions when low, repair/sell/stash when the bag is full or gear is worn, spend points when there are any); the
first visit of a game does the full round. Gear pickup and selling follow the rules in "What bots do with items" below.

## Using Quartermaster?

Settings tab, Game, checkbox **Using Quartermaster?** (off by default). Quartermaster is a mod that takes chat commands; `.deposit` stores the common
items a character carries, rejuvenation potions above all, in the mod's own storage. The bots' pickit takes every rejuvenation potion it sees and
nothing else ever moves them, so the pack fills up with them (seen 2026-11-13). With the box checked a bot sends `.deposit` (as chat, the way it
sends PlugY's `/save`) every time it is in town: once on arrival, and again at the start of its stash step, at most every 20 seconds. The bots take turns, because the mod may misbehave when two of them send it at the same moment and they all arrive together at the
start of a game: a bot's turn is its place in the sorted list of the team's profile names times 4 seconds after it arrived, plus a small offset of its own. The pack filled
because the stash step skipped potions and the Keeper tab keeps every rejuvenation potion the leader sees; rejuvenation potions are now stashed.
The mod also prints "Congratulations! You are __% complete on your Holy Grail quest." when an item is new to the quest. That is not a chat message, and
reading it might crash a bot, so the bots do NOT listen for it and the Activity list does not show it.
Every bot deposits, whatever its belt. A bot with a small belt keeps spare healing and mana potions in its pack, so a deposit takes them and the next
chores would buy them again, which cost one bot about 850 gold in a single visit. So a bot with Quartermaster on keeps no spare potions in the pack at all (the belt is
its supply and is refilled when a column is half empty). One safeguard: if a deposit takes potions out of the BELT the bot says so and stops using it for
that game. Gems, runes and essences are no problem: bots never craft, and nothing else needs them in the pack.
`libs/common/Quartermaster.js`, called from the Follower main loop, the team wait and `Town.stash`; the plan carries `quartermaster`, AutoSpec sets `Config.UsesQuartermaster`.

## Is this PlugY?

The Settings tab has an "Is this PlugY?" checkbox. Unchecked, anything that needs PlugY (extra stash pages, `/save`
auto-saves) is rejected by the web page, and a bot that is asked to do such a thing says so in chat and in the
console instead of silently skipping it. Saving when stopped still works without PlugY (Save and Exit).

## Row colours

Rows of running bots are tinted green, starting/stopping bots amber.

## Potions (worked out by the bot)

The bot reads the belt it wears and sets its own potion rules each time it checks town chores: it buys when a belt
column is half empty (so a big belt full of potions needs no trip), keeps spare healing/mana potions in the inventory
while the belt is tiny (a fresh level-2 character: 4 healing spares with a 1-row belt, 2 with 2 rows, none with 3 or 4; casters keep 1 spare mana
potion more), and lowers the gold it needs before shopping at low levels (100 gold under level 15, else 1000). The belt columns are healing, mana,
mana, rejuvenation. Nothing to configure.

What a bot picks up: the QOL potion list takes up to 3 of each healing and mana kind (the kinds that fit its level: minor up to level 12, light up to 24,
normal up to 36, greater up to 48, super always) and up to 3 rejuvenation potions (full rejuvenation always, plain up to level 48), counting the belt and
the pack. Separately the Keeper tab's "Bots pick up rejuvenation potions" (on by default) keeps EVERY rejuvenation potion the leader sees, with no limit.
Healing and mana spares in the pack above the bot's own buffer are used up in town. Rejuvenation potions serve two purposes, and the bot tells them apart by COUNT: it keeps 4 of them on hand (belt plus pack, a
full belt column) so it has one when it is about to die, and every one beyond that is accumulation and goes to the stash. When it is below 4 it takes
the difference out of the stash in town. (They used to be on the list of things the stash step never touches, so they piled up.) With Quartermaster the
`.deposit` command may store the reserve as well; the bots have no way to take those back.

## Quest NPCs

(The whole quest system, including this part, is described in `QUESTER.md`.)

In town a bot looks for quest rewards that are waiting: a quest whose "reward pending" bit is set (and "reward granted"
is not), or an item an NPC wants (Scroll of Inifuss, Lam Esen's Tome, Jade Figurine, The Golden Bird). It talks to the
NPCs for those quests and nobody else, as many times as it takes: some NPCs (Malah, Alkor) hand out an item on each
further talk, and the bot uses each handed-over item (Potion of Life, Book of Skill, Malah's Potion, Scroll of
Resistance) before talking again. It looks again after every round, so Meshif's bird then sends it on to Alkor.
Rewards that need you to pick an item (Charsi's imbue, Larzuk's socket, Anya's personalize) are left for you: the
bots write a line in their log but say nothing in chat. The check runs on every town visit that is worth a trip ("quest NPC" in the chore list) and when a bot
arrives in a new act's town. Each quest is tried at most twice a game.

## What bots do with items (the rules)

There are no loot options on the Settings tab. This is always what happens:

1. **They pick up gear that might be an upgrade** (armor, weapons, rings and amulets) for themselves or their mercenary, and
   whatever your keeper rules keep. Charms, jewels, runes, gems and keys are only picked up if a keeper rule keeps them.
2. **They identify it** in town (a Cain visit once the Search for Cain quest is done, otherwise a scroll or tome), so most of
   what they pick up is identified and then sold.
3. **After identifying** (`Town.keepVerdict`): an upgrade is kept and put on; anything else on the keeper list is kept and
   goes to the stash; only what is neither an upgrade nor on the keep list is sold for gold (the gold feeds their gambling).
4. **When an upgrade replaces something they wear**, the old piece goes to the stash if your keeper rules keep it (or to the
   inventory first), and is dropped on the ground otherwise, so the other bots can pick it up and try it on. At the end of their
   town chores (and every 30 seconds while they wait in town) bots look at gear lying nearby, pick up what is an upgrade for them
   or their mercenary and try it on. That can chain down the party: one upgrade can become several.
5. **Bots never craft.** Cubing recipes and runeword making are switched off for every bot, whatever a template says.

A keeper is never sold or dropped by a bot.

The Equipment tab's "Bots never auto-equip, replace, identify or sell items that are:" list (unique, set, crafted, rare, magic,
socketed, runeword, ethereal) is the one list of protected kinds. For an item in a checked kind a bot never auto-equips it, never
replaces one it wears, never identifies it, never sells it, and never picks it up as a gear upgrade. It still picks up what
the Keeper tab keeps (farm and quest mode) when a rule already knows it without identifying (a unique or set rule needs no stats),
and puts it in the stash for you. An unidentified item of a checked kind that would need identifying to be judged (a rare against
a stat rule) is left on the ground: the bot can never identify it. Uncheck a kind to let bots
identify and auto-equip it. With the defaults (unique, set, crafted, socketed and runeword checked) a bot may pick up a rare or magic
item that would be an upgrade for it or its mercenary. Cain is never used while a protected item is unidentified in the bag (he
identifies everything); scrolls do the identifying then. Any other unidentified item may be identified: that is how a bot learns
whether it is a keeper, unless the pickit rules already know without it (a unique or set rule needs no stats).

While you are not playing, only the leader picks up loot (the followers pick nothing up). While you play, the followers pick up possible
upgrades but know nothing of your Keeper rules, so they leave keepers to you.

## The "pick" chat command

Type `pick` (or `p`) in the game chat. Every bot following you then runs its normal pick up once, right where it stands, and
opens containers (chests, urns, barrels, corpses, ...) within 20 units. It uses the same rules as above: it will not pick up
a keeper. Only the character you follow can give it.
