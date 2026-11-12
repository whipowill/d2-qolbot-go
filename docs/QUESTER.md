# Quester: how the bots play the quests

The quest system is `d2bs/kolbot/libs/common/Quester.js` (about 1,900 lines, written for this project) plus a 16-line launcher,
`d2bs/kolbot/libs/bots/Questing.js`. This page explains what it does, quest by quest, how the leader and the followers share the work, and
an audit of what is solid and what is risky. For the other automations see `AUTOMATION.md`; for the state of play see `../NOTES.md`.

**Status: unproven end to end.** The 2026-11-10 quest test ran for about eight minutes and no quest finished (see "What has been tested").
Read the audit before trusting a long unattended Quest run.

## The two jobs

| Job | Who | Where | Code |
|---|---|---|---|
| **Play the quests**: travel, clear areas, kill bosses, fetch quest items | the **leader bot** only (Quest mode) | the field | `Quester.runQuests(false)`, called by `Questing.js` |
| **Quest NPC visits**: talk to the NPCs who have a reward or want an item, use what they hand over | **every bot**, leader or follower | town | `Quester.questNpcs()`, called from the town chores |

Getting from the Bots page to a running quest:

1. On the Bots page choose **Objective: Quest** and press Start on the leader.
2. Qolbot writes the leader's plan with `script: "Goal"` and `goal: "Quest"` (see `AUTOMATION.md`).
3. `AutoSpec.apply()` turns the Follower script off for the leader, sets `Config.WaitForTeam`, and enables the `Questing` script
   (`AutoSpec: goal Quest: running Questing` in the log).
4. The leader waits (up to four minutes) for its team to join, then `Questing.js` prints `Questing: playing the quests.` and calls
   `Quester.runQuests(false)`.
5. The followers follow the leader as usual (`Follower.js`). They do not play the quests; they pick up nothing while you are not playing
   (the leader does the looting), and they do the quest NPC visits when they are in town.

## `runQuests`: the main loop

`runQuests(is_town_only, is_status_only)` walks the quest table (`Quester.quests`) **in table order**, act by act, and for each quest:

1. **Can it enter the act?** `Pather.accessToAct(act)`. If not, skip the quest.
2. **Is it already done?** `getQuestProgress(quest_id)` asks the server for a fresh copy of the quest state (`sendPacket(1, 0x40)`, half a
   second) and returns **100 if the quest's "complete" bit is set, otherwise 0**. Complete quests are skipped. (The partial-progress bits
   were tried and are unreliable in multiplayer, so there is no in-between.)
3. **Do it.** It sets `progress = 50` on purpose ("progress detect doesn't work, for now, so just lie"; the effect is that every quest
   script will also talk to its NPCs), then calls the quest's function, up to **three attempts**, inside a `try`/`catch`. The first attempt
   that returns true ends the loop.
4. **Report.** After the attempts, if the quest is now complete, it says `Act N - #n - "Title" is complete.` Qolbot turns that line into a
   **Quest Complete** entry on the Activity list.

When the loop reaches the end, `runQuests` returns, `Questing` returns, and the leader's run is over. The next game starts the table again
from the top, and the quests that are complete are skipped by step 2.

Two other ways it is called: `runQuests(true, true)` (status only, no doing) when the player the followers follow types `status` in chat (a bot leader cannot,
so this is for games where you lead), which lists every completed quest of the act the bot is in (and fills the Activity list with Quest
Complete entries); and `is_town_only` for the town parts.

## The quests, one by one

"Clear X" means `clearAndCapture`: go there by waypoint or exit, grab the waypoint, clear the level. Area names are from `sdk/areas.txt`.

| Act | Quest | What the bot does |
|---|---|---|
| 1 | Den of Evil | clears Blood Moor, runs the Corpsefire script with `ClearDen`; talks to Akara |
| 1 | Sisters' Burial Grounds | clears Cold Plains, runs Mausoleum (Blood Raven, crypt); talks to Kashya |
| 1 | Search for Cain | talks to Akara if it has no Scroll of Inifuss; clears Stony Field, Underground Passage 1, Dark Wood; runs Tristram; talks to Cain |
| 1 | Forgotten Tower | clears Black Marsh, runs Countess |
| 1 | Tools of the Trade | clears Tamoe Highland and the Outer Cloister (only travels through them if the option above is unchecked), clears the Barracks; picks up the Horadric Malus from its chest; (Charsi's imbue is chosen by you) |
| 1 | Sisters to the Slaughter | waypoint to Outer Cloister, then clears Barracks through Catacombs Level 4. **Killing Andariel completes it** |
| 2 | Radament's Lair | clears Sewers 1 and 2, runs Radament, picks up and uses the Book of Skill, clears Sewers 3; talks to Atma |
| 2 | Horadric Staff | fetches the Cube (Halls of the Dead), the Staff of Kings (Maggot Lair) and the Viper Amulet (Claw Viper Temple); talks to Drognan; assembles the Staff in the Cube |
| 2 | Arcane Sanctuary | clears the Harem, Palace Cellar and Arcane Sanctuary; opens Horazon's Journal; takes the Canyon of the Magi waypoint |
| 2 | Seven Tombs | runs the Tombs script (Duriel); uses the Horadric Staff on the keyhole; talks to Tyrael. **Killing Duriel completes it** |
| 3 | Khalim's Will | fetches Khalim's Eye, Brain, Heart and Flail across the Spider Cavern, Flayer Dungeon, Sewers and Kurast; makes Khalim's Will in the Cube; equips it and smashes the orb at Travincal |
| 3 | Blade of the Old Religion | Flayer Jungle for the Gidbinn; talks to Ormus and Asheara |
| 3 | Lam Esen's Tome | runs KurastTemples, fetches the tome from the Ruined Temple; talks to Alkor |
| 3 | The Guardian | Travincal, then the Mephisto script. **Killing Mephisto completes it** |
| 4 | Fallen Angel | clears Outer Steppes, talks to Izual and Tyrael, clears Plains of Despair... City of the Damned |
| 4 | Hell's Forge | River of Flame; equips the Hellforge Hammer and smashes the forge |
| 4 | Terror's End | runs the Diablo script; talks to Tyrael. **Killing Diablo completes it** |
| 5 | Siege on Harrogath | clears Bloody Foothills |
| 5 | Rescue on Mount Arreat | clears Frigid Highlands and Arreat Plateau |
| 5 | Prison of Ice | clears Crystalized Passage and Frozen River, takes a portal, talks to Anya (Anya's personalize is chosen by you) |
| 5 | Betrayal of Harrogath | Pindleskin, Halls of Pain, Nihlathak |
| 5 | Rite of Passage | clears Glacial Trail, Frozen Tundra, Ancient's Way, Arreat Summit and Worldstone Keep levels 1 and 2 (and opens one object on the way) |
| 5 | Eve of Destruction | clears Worldstone Keep Level 3, runs Baal, goes to town, then **idles for good** (the last quest) |

**Quests that finish themselves.** Some quests complete just by killing the act's boss: Sisters to the Slaughter (Andariel), Seven Tombs
(Duriel), The Guardian (Mephisto), Terror's End (Diablo) and Eve of Destruction (Baal). The Quester still runs the boss script or clears
the boss's level for those, and the NPC visits afterwards only collect rewards.

**In the table but with no function of their own: Tainted Sun and Summoner (act 2).** Their work happens inside Horadric Staff (the Viper
Amulet) and Arcane Sanctuary (the Summoner's level and the journal), and the NPC visits hand out the rewards. See audit item 3.

**Commented out of the table:** Golden Bird and Blackened Temple (act 3). The Jade Figurine and the Golden Bird are handled by the NPC
item visits instead (below).

## The "clear every monster in every zone" option (Settings, Quests tab)

By default the leader clears every area a quest passes through, as it always has: it is slower, but the bots level up as they go instead of
rushing ahead of their level. Unchecking **"Bots clear every monster in every zone"** means `Attack.clearLevel` is never called by the Quester: the bots travel, take the
waypoints and fight what is in their way, and the quest scripts (Tristram, Countess, Andariel and so on) kill their own targets.

The setting is `"questClearAll"` in `qolbot.json` and in the bot's plan. In the code, `clearAndCapture` skips `Attack.clearLevel()` for every area
when `Config.QuestClearAll` is false (the old `is_pass_through` argument is no longer used). Nothing here has been run in a real game yet.

## The helper actions

Each prints a short line to the log when it starts (`Attempting to ...`; these are not shown as a status on the bot cards).

| Helper | What it does |
|---|---|
| `clearAndCapture(area, block_town)` | precast, `Pather.journeyTo(area)`, take the waypoint, `Attack.clearLevel()`, then town chores (unless blocked) |
| `townAndTalk(name, travel_code)` | go to town, walk to the NPC (hard-coded coordinates for some), open the dialogue three times to clear it, optionally pick a travel menu entry |
| `talkToNPC(name, portal)` | the same for an NPC out in the field (Izual, Tyrael) |
| `pickAndPlunder(chest, item, consume)` | open a chest and/or pick up a quest item (`Pickit.pickItem`) |
| `keyAndKeyhole(object, item)` | open a keyhole object and put the key item in (the Horadric Staff at the Tombs) |
| `cubeAndCreate(result, i1..i4)` | open the stash and Cube, empty it, put the ingredients in, transmute, take the result |
| `equipAndAttack(object, item)` | swap in a quest weapon, hit an object (the orb, the forge), swap back |

All the helpers report problems through `Quester.error`, which **stops the bot for good** (audit item 1).

## Quest NPC visits (every bot, in town)

This part is the most developed and the safest. It does nothing unless something is waiting.

- **What triggers it.** The "quest NPC" town chore (`Quester.questNpcPending`), and arriving in a new act's town. The tables
  `npcQuests` (quest id, title, the NPCs who can pay out, "you must choose an item") and `npcItems` (an item an NPC wants) say who to see.
- **"Waiting" means:** the quest's *reward pending* bit is set and its *reward granted* bit is not (`getQuest(id,1) && !getQuest(id,0)`),
  or the bot carries an item an NPC wants (Scroll of Inifuss to Akara, Lam Esen's Tome and the Golden Bird to Alkor, Jade Figurine to Meshif).
- **How it talks.** For each waiting quest it talks to the listed NPCs in order, up to eight rounds each. After every talk it uses what was
  handed over (Potion of Life, Book of Skill, Malah's Potion, Scroll of Resistance), asks the server for fresh quest state, and talks
  again if the NPC gave something. Alkor needs a few seconds to brew the Potion of Life, so it comes back to him. It looks again after each
  pass, up to three passes (Meshif's bird sends it on to Alkor).
- **Limits.** Each quest is tried at most **twice per game**; a talk that gets nothing waits and gives up after a few rounds.
- **Rewards that need your choice** (Charsi's imbue, Larzuk's socket, Anya's personalize) are left for you: the bots write a line in their log but say nothing in chat.
- **Status.** Each conversation prints `Talking to <NPC>`, which shows on the bot card.

## Items and quest credit

- In a party everyone gets the quest *progress* the leader earns, even without touching the NPCs or items. What each player still has to do
  is pick up and use the quest items that are consumed (Book of Skill, Potion of Life, Malah's Potion, Scroll of Resistance), and to
  have room for them in the inventory.
- `pickit/QOL/Quest.nip` keeps the quest items bots pick up. Several (Inifuss, Key to the Cairn Stones, Malus, Jade Figurine, Golden Bird,
  Gidbinn, Lam Esen's Tome, Hellforge Hammer, Malah's Potion) are commented out there because the Quester fetches them itself with
  `pickAndPlunder`, or the NPC visits handle them.
- **Safe Mode** still lets bots pick up the quest items (their item codes are on its allow list). **Followers pick up nothing while you are
  not playing**, so only the leader picks up quest items then.

## The leader bot's reliability helpers

The same helpers that keep a Farm run alive keep a Quest run alive: the town chores (heal, repair, potions, stash), the chicken thread
(the bot goes to town when its life is low), auto-save every few minutes, and the follower's request for a town portal when it cannot reach
the leader.

## What has been tested

From `../NOTES.md` and the logs:

- **2026-11-10 quest test** (Darius leading, Xena following, Normal): Questing started ("Attempting to clear and capture", the Forgotten
  Tower area), the leader fought and chickened when low, and level 16 was reached. **No quest finished in about eight minutes.**
- A **portal loop** in `Attack.clearLevel` was found and fixed in that test (the bot went to town after every room because "heal at every
  town visit" made `needHealing` always true).
- The logs of 2026-11-10 18:22 show the loop skipping completed quests: the first quest Darius tried was Tools of the Trade, because the
  earlier act 1 quests were already complete.
- **Not verified in a game:** every quest function other than that first approach, the Cube and orb steps, the Tombs, all of acts 2 to 5,
  and the idle-at-the-end behaviour.

## Audit: what to know before an unattended run

Ordered by how much they can hurt.

1. **`Quester.error()` ends the run for good.** It prints the message to the console, then calls `idle()`, which says "Idle." once and
   loops forever. Any helper that hits trouble (an NPC or chest not found, the Cube will not open, the pickup fails) stops the leader
   permanently, and the three-attempt retry in `runQuests` never gets a turn because `error` never returns. The followers keep following a
   leader that is standing still. `Eve of Destruction` ends in `idle()` on purpose, but every other `error` is a dead end. *Suggestion:*
   make `error` throw so the retry loop can use it, and let a quest give up after three failures and move on.
2. **Failures are invisible.** The `catch` around the quest function is empty. An exception (a typo, a missing unit) leaves no trace, and
   the quest is silently tried twice more. *Suggestion:* print the exception and the quest name.
3. **Two quests call functions that do not exist.** `act2_tainted_sun` and `act2_summoner` are in the table but never written. Each run
   throws a `TypeError` three times for each, swallowed by the empty `catch`. Harmless, but wasteful and a sign that the table and the
   functions have drifted. *Suggestion:* skip a quest whose function is missing, or write the two (they would only check the quest bit and
   talk to the NPC).
4. **No partial progress.** A quest is either complete or begun again from its first step. If a game ends mid-quest (the bot dies, the host
   leaves), the next run repeats the quest's work from the start (for example the whole Khalim's Will collection).
5. **Quest state is per difficulty.** Normal, Nightmare and Hell each need the quests done again. The Bots page difficulty decides which
   one the leader plays; the loop reads the quest bits of the difficulty it is in, so it will happily start act 1 again on Nightmare.
6. **Hard-coded town coordinates.** `townAndTalk` moves to fixed coordinates for most NPCs (for example Kashya at 4492,4632). They match
   the standard town layouts; a modded town would break them. The newer NPC visit code (`talkToQuestNpc`) walks to the NPC by name instead.
7. **`talkToNPC` portal step.** After talking to Tyrael or Izual it calls `Pather.usePortal(id)` and a comment says "this never works?".
   The quests that rely on it (Seven Tombs, Terror's End) might leave the bot in the field.
8. **Dead code.** `grindLevels` (level up by clearing zones, driven by `Config.Leveling`) is never called and `Config.Leveling` is never set.
9. **The "lie".** `progress = 50` makes every quest function talk to its NPC even when nothing is waiting. It costs a little time per
   quest and is not harmful, but it is why the log fills with "Attempting to town and talk".
10. **Strong characters assumed.** The scripts clear whole levels (Catacombs, Worldstone Keep) with the leader's current build and gear.
    A weak leader will chicken and rest repeatedly, which is what happened at level 15.

## Where to look when something goes wrong

| Look at | For |
|---|---|
| `d2bs/d2bs.log` and `logs/bot-<name>.log` | the quest function names printed as each starts (`act1_tools_of_the_trade`), the `Attempting to ...` lines, `Talking to ...`, `AutoSpec: quest talk ...` |
| the leader's last status on the Bots page | "Embarking on quest" means the script is running; a card that stays on one status for minutes after "Idle." is item 1 above |
| `d2bs/kolbot/logs/ScriptErrorLog.txt` | script errors |
| the Activity list | Quest Complete entries (also created by the `status` chat command for every quest already done) |
| `d2bs/kolbot/data/<profile>.spec.json` | `goal: "Quest"` and `script: "Goal"` for the leader |
