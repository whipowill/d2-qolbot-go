# Standing rules, and what protects each one

The user's rules for how the bots behave, in their own words where they were given, with where each one is enforced and which test fails if it breaks.
Written 2026-11-16 because "we have so many rules and things I'm worried about changes that it undoes some other fix we previously made".

**Before changing code that touches a rule below:** read its row, run `./scripts/jstest.sh` and `go test ./...`, and say in the change note which rules the change touches
and whether any of them is now looser, stricter or different. A rule with "no test" is protected only by this page and by `NOTES.md`: say so when you change it and add a test
if the code can be run without the game. A rule is "verified" only when a live log line has shown it (see `NOTES.md`, the verification ledger).

## What "gate" means here (two different things)

- **The town gate** (`Team.waitToLeaveTown`, `libs/common/Team.js`): the leader does not leave town for the field until every mate has said it is ready. A follower has no gate of its
  own: it acts on the leader's orders. Town to town (a chore, an act change) is not gated. This is a team-sync rule; it is the one the tests below protect.
- **A condition that decides whether a bot does something** (for example "the follower talks to the quest NPCs only when the goal is Quest"). These are ordinary `if` tests in the
  scripts, not team-sync rules. When they are removed or added, the change note says which.

## Team sync

| Rule (the user's words) | Enforced in | Tests |
|---|---|---|
| "bots always stick together, with maybe a 12 second grace period. if anyone goes to town they all go to town. if anyone goes back to the field they all go back to the field" | `Team.js`, `PartySync.js` | `team_test.js`, `partysync_test.js` (call, townOrder, barrier, sendOutFirst, escalation) |
| "if any party members portals out of the field -- for any reason -- everyone drops everything and takes that portal immediately. they wait in town until every single party member reports that they are ready. then they all go back into the field together" | `PartySync.js`, `Follower.js` (`droptask`) | `partysync_test.js` (call, townOrder, barrier); the "drops everything" part (`Follower.js`) has no test, live-verified 2026-11-15 and 2026-11-16 |
| "the leader alone issues orders. nobody else does"; a bot that leaves the field may do so without permission, and the leader tells the rest to take its portal | `Team.js` (`isLeader`, `say`), `PartySync.js` | `team_test.js` (follower never waits, never regroups, only the leader's gate, the maker's "go last") |
| The town gate: "the leader is excempt from being ready himself"; "nobody can leave town again until all the bots report ready (unless ... another town for some chore reason ...)"; a send-out on a false "ready" "shouldn't have happened"; 2026-11-16: "the leader shouldn't have left the town if the team wasn't ready" (an act change is gated like any departure: every mate here and ready, none in the field or on its way from another town) | `Team.waitToLeaveTown` (`actChange`), `Pather.useWaypoint`, `ActTravel.change`, `Team.readyHere` | `team_test.js` (waitToLeaveTown: ready, not ready, old "ready", busy, no time limit, 12 s grace, and the four act-change tests) |
| A chore trip to another town (better potions, reviving a dead merc, hiring a merc) needs nobody's permission: the bot goes, comes back to the town it left, then reports ready (2026-11-16: "every seam or transition between zones and acts the team moves together. the only exception is town-to-town navigation from bots during chores that always brings them back to the original town"); `Town.doChores` itself now records its act and returns to it (before, only `visitTown` did) | `Team.chore` (set by `Town.doChores`, `MercHire.maybe`), `Team.onChore` | `team_test.js` (a chore trip is free, the marker resets, a field departure is still gated) |
| A mate that cannot enter the leader's portal out of town (the user, 2026-11-17: "if a member can't take a portal (perhaps they are gated somehow) ... either make a new portal to the destination, or see what the member requires to ungate that area"): it says which. GATED (the act's quest is not done for it): a problem on the Activity list, and the leader's plan gets it ready. NOT GATED: it posts "cantreach"; the maker does not wait for it, goes out, and `TownChicken.js` opens a new portal for it. No timers added | `Team.portalRefused`, `Team.sendOutFirst`, `TownChicken.js` (`portalAsked`), `Follower.js` | `team_test.js` (the maker does not wait for a mate that cannot enter; gated vs not gated, said once per 20 s) |
| "yes, last order trumps all" | `Team.currentOrder`, `Team.order`, `Follower.js` | `team_test.js` (returnCall, leaving), `partysync_test.js` (townOrder) |
| "they erase their goals when they go to town, and nobody can leave again until the leader says" | `Follower.js` (`dropTask`, `dropError`, `Pather.interrupt`) | none (live-verified); `Follower.js` keeps an errand (a portal the leader asked for) alive across the drop |
| "every transition between the zones and seams of the game are team crossings"; at the red portal the leader goes first and the followers "stay there when they arrive" | `Pather.js` (`useUnit`, `usePortal`), `Quester.act3_guardian`, `Follower.js` | `team_test.js` covers exits and arrival waits; portals, stairs and the red portal have no test (live: exits and portals verified, the leader-first red portal not) |
| "a bot that left the game is not waited for; one that rejoins is covered at once" | `Team.roster`, `Team.waitToLeaveTown` | `team_test.js` (a mate not in the game holds nobody) |
| "does not apply when a real person is the leader" | `Team.syncOn` (`plan.partySync`) | `team_test.js` (a real player leads: none of the team sync applies) |
| In "I'm playing" mode the followers pick up quest items (and use them) and talk to the proper NPCs; "i'm the one to pick up" a lone quest item | `Pickit.js` (`leaveForPlayer`), `Follower.js` | none (not run with a person leading) |

## Quests

| Rule | Enforced in | Tests |
|---|---|---|
| One smash of the Hellstone credits the whole team, each hands in to Cain with its own character | `Quester.smashForge`, `act4_hells_forge`, `Follower.townQuestTalk`, `Quester.townQuestsOpen` | none; the smash is verified live (2026-11-16 13:16), the hand-in is not |
| "whenever bots are in town -- even if they are followers of a real player -- they should consider what quests they are on and what NPC they should talk to"; a quest with several NPCs (Gidbinn: Ormus, Asheara) is talked through to the end | `Quester.questNpcs`, `Quester.townQuestsOpen`, `Follower.townQuestTalk`, `Town.doChores`, `Chores.js` | `scripts/jstest/questnpcs_test.js` (which NPCs, in what order, the retry cap, manual rewards skipped); the follower step and the chores call have no test, not verified live |
| All bots show credit for a quest at about the same time (2026-11-16: "not just leaders and then by chance later the followers"): the leader does not leave town, into the field or for the next act, before the team is ready, and a follower is ready only after its own quest talks | the town gate (above), `Follower.townQuestTalk` | the gate: `team_test.js`; the follower's talk before "ready": none, not verified live |
| A teammate without Act 4 reports "noact 4"; the team goes back for Mephisto together, the leader crosses first | `Team.noActMates`, `Quester.act3_guardian` | none; the report and the trip back verified live 2026-11-15 |
| An act change where some mates cannot follow (they lack the access): NO pre-check and no change to the gate. The leader goes, the mates who cannot say so (`noact 4`, on the message log), and the leader changes the plan to get them ready so they can go (the user, 2026-11-16: "I don't think a change is needed. i think the leader goes to [B], some followers say they can't, then the leader changes the plan to get the followers ready such that they can go to B"). The report exists for Act 4 only; for the other acts a follower that cannot get in logs "I could not get to act N" and nothing more: leave it unless it shows up in a run | `Follower.followToAct`, `Team.noActMates`, `Quester.runQuests` | none; the Act 4 report and the trip back verified live 2026-11-15 |
| Rewards the player chooses stay manual and the bots do not claim them: Siege on Harrogath (Larzuk's socket), Tools of the Trade (Charsi's imbue) (the user, 2026-11-16, about Siege: "leave that final part as manual. the bots don't need to claim it"). The bots log "a reward is waiting ... I cannot choose the item" and go on; their saves show the reward-pending bit and not the complete bit, and that is expected. Betrayal of Harrogath is manual too (the user, 2026-11-17, final: "on these 3 quests the final answer from me is these are manual completion quests"; on 2026-11-16 it was automated, and the followers' talk to Anya showed the progress bit move and never the complete bit) | `QuestTable.json` (`"manual": true`), `Quester.questNpcPlan`, `Quester.townQuestsOpen` | `questnpcs_test.js` (manual rewards skipped) |
| When every bot has finished every quest on a difficulty the bots IDLE; nothing starts the next difficulty (the user, 2026-11-17: "i want the bots to idle when all quests are complete in a difficulty, forcing me to restart them"). The manager logs `quests: nothing left to do on X; the bots wait until you restart them` once | `dynamicLeaderLoop` (`dynleader.go`), `Questing.js` ("no quest is left to do") | none |
| Wirt's Leg is only for the Cow Level | `QuestItems.js` | none |

## Items, gear and gold

| Rule | Enforced in | Tests |
|---|---|---|
| Gold and level hunt zones are the user's table: never change, re-rank or skip them | `huntplaces.go` | `huntplaces_test.go` |
| Never change what the autoequip protection list protects; fix the ranking, and point to the setting | `plan.protect` (Settings), `Town.js`, `QuestItems.js` (`isProtected`), `Gear.js` (the ranking) | `scripts/jstest/gear_test.js` (the ranking), `autoequip_test.go` (the settings); the protection check itself has no test |
| "keeper rules trump autoequip rules"; gear taken off for an upgrade goes on the ground for the team unless a keeper rule matches (then stored); all uniques and sets are keepers, stashed without identification | `Item.isKeeper`, `Item.dropHeldForTeam`, `keeperdefaults.go` | `keeperdefaults_test.go`, `autoequip_test.go` (partly) |
| Auto-equip is by build and class: Barbarians hold no shield and may use 2H weapons and dual 2H swords, Amazons use Amazon weapons, Paladins paladin shields | `Gear.js` | `scripts/jstest/gear_test.js` |
| All gold goes to the stash on every chores visit; up to 100,000 comes out first for the chores | `Town.stash`, `Town.stashGoldAt`, `Gold.topUp` | none; verified live 2026-11-16 |
| Gambling counts the gold of the pack and the stash together | `Town.needGamble`, `Town.gamble` | none; not verified live (nobody has 1,000,000 gold) |
| Runes, gems and potions go in with `.deposit` when "Using Quartermaster?" is on, not by hand to the stash (the user's question, 2026-11-16: "why are bots not running .deposit and instead are depositing runes into stash") | `Quartermaster.js`, `Pack.freePickupArea`, `Town.stash` | `quartermaster_test.js` for the lock; the hand-stash path has no test, not verified live |

## Characters

| Rule | Enforced in | Tests |
|---|---|---|
| Stat points: melee, ranged melee and summoners keep their stats equal to about 180, casters strength/energy/vitality, every build at least 180 strength, hard points only (never counting gear or charms) | `libs/config/Templates/*/*.js`, `AutoStat.js`, `specplan.go` | `scripts/jstest/autostat_test.js`, `plan_test.go` |
| Auto Respec never undoes stats the user set by hand (it did to Barabas, 2026-11-16): tell the user before a run when it is on and the template disagrees with a character | `Respec.js` | none (the user keeps it checked: "no problem") |
| Summon Druid skills: Werebear 1, Lycanthropy 1, then Grizzly, Dire Wolf, Spirit Wolf and Heart of Wolverine, then Lycanthropy | `Templates/Druid/Summon.js` | none |
| Merc hires always use the non-qol.dll strip method | `MercHire.js` | none (`mercs_test.go` covers the merc table in Go, not the hire) |

## Mods

| Rule | Enforced in | Tests |
|---|---|---|
| PlugY, QOL.dll and Quartermaster.dll commands live in one class each and follow their Settings checkbox | `PlugY.js`, `Qol.js`, `Quartermaster.js` | `scripts/jstest/mods_test.js`, `quartermaster_test.js` |
| "it's important that ... the bots don't fire [.deposit] at the same time" | `Quartermaster.lock` | `quartermaster_test.js` (five bots reading the files at the same instants, 300 random starts) |
| Qolbot works for players without the user's mods | the "Using ...?" checkboxes | none |

## Working rules (from `CLAUDE.md` and the user)

- Never add or change files in the real Diablo II folder without asking. Qolbot only reads from it.
- Never `pkill -x Game.exe`; never `pkill -f` with text from the command line; stop bots through the Qolbot API or their PID. Restart the Qolbot server only by its PID and only with no game running.
- The JS under `d2bs/kolbot/libs` is not UTF-8 and has mixed line endings: edit it as bytes and keep the original line endings. There is no JS engine for the game here: script changes
  are untested until a live log line shows them, and `NOTES.md` says so.
- "if you are confused, ask me before you make an assumption and make code changes"; no hypothetical scenarios; no new "one-liners all over the codebase": put a rule in the shared layer.
- Do not call a script change fixed before a live log line shows it; when a problem comes back, look for the earlier change aimed at it before treating it as new. One behavior change per live run.
- `README.md` is the user's own text: small edits only. Do not commit `qolbot.json`, logs, saves or `reset.sh`.
