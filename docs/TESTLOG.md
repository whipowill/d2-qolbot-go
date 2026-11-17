# Quest test log

One row per quest: was it played by the bots in a real game, and did it work. **Tested** is `Success` only when the game itself shows the quest done
(the saved character's quest block, read by Qolbot's Quest Progress sheet), not when the script printed "complete". Other values: `Not yet`, `Partial`,
`Failed`. Newest result first in Notes; dates are 2026-11-xx.

| Act | Quest | Tested | Notes |
|---|---|---|---|
| 1 | Den of Evil | Success | 11-12 16:09 Barabas (Normal) cleared the whole den and the save shows it done (saved 16:14). `Corpsefire.js` cleared the den first, so looking for Corpsefire afterwards threw and hid the "complete" line: now he is killed first, then the den is cleared. The den must be cleared completely: it is. |
| 1 | Sisters' Burial Grounds | Not yet | |
| 1 | Search for Cain | Not yet | |
| 1 | Forgotten Tower | Not yet | |
| 1 | Tools of the Trade | Not yet | |
| 1 | Sisters to the Slaughter | Success | 11-12 16:21 Darius, then Barabas: Meir's Quick Travel portal to Andariel (killed in 5 s), the leader talked to Warriv, the saves show it done and Act 2 opened. Earlier runs killed her without credit because Warriv was never talked to (the act flag opens only then). |
| 2 | Radament's Lair | Success | 11-12 16:3x Sankt (level 17) after the Warriv trip: the save shows it done. |
| 2 | Horadric Staff | Not yet | |
| 2 | Tainted Sun | Success | 11-12 17:29 Darius and Barabas: Viper Amulet taken during the Horadric Staff pass, both saves show it done. |
| 2 | Arcane Sanctuary | Success | 11-12 17:54-17:55 all four bots complete in their saves. The Sanctuary cannot be walked without Teleport and the Harem cannot be walked at all (bots stuck at 10005,5043 in Harem Level 1), so: Palace Cellar waypoint shared by Meir, then Meir's Quick Travel portal to the Summoner (killed in 5 s). |
| 2 | Summoner | Success | 11-12 17:57 Darius and Xena done in the saves (Sankt and Barabas through their NPC visits). |
| 2 | Seven Tombs | Partial | 11-12 17:58 Darius: Tombs.js, then "Failed to move to Canyon" and move-retry loops in Tal Rasha's Tomb #1 (area 66). Needs the Duriel Quick Travel and the Horadric Staff socket step tested. |
| 3 | Blade of the Old Religion | Not yet | |
| 3 | Khalim's Will | Not yet | |
| 3 | Lam Esen's Tome | Not yet | |
| 3 | The Guardian | Not yet | |
| 4 | Fallen Angel | Not yet | |
| 4 | Hell's Forge | Not yet | |
| 4 | Terror's End | Not yet | |
| 5 | Siege on Harrogath | Not yet | |
| 5 | Rescue on Mount Arreat | Not yet | |
| 5 | Prison of Ice | Not yet | |
| 5 | Betrayal of Harrogath | Not yet | |
| 5 | Rite of Passage | Not yet | |
| 5 | Eve of Destruction | Not yet | |

## Other checks

| Check | Tested | Notes |
|---|---|---|
| Walking (Pather.moveTo retries + sidestep), Countess + Andariel Farm | Success | 2 runs, no errors (11-12) |
| Quick Travel: Countess, Andariel | Success | earlier session; Andariel again 11-12 16:15-16:22 (Meir's portal, taken by the leader within seconds) |
| Quick Travel: the other bosses | Not yet | |
| Chat command queue (portal errands) | Not yet | |
| Save before chicken (option) | Not yet | |
| Auto Waypoint option | Not yet | |
| Act change by NPC (Warriv, Meshif), leader and followers | Not yet | |
| Summoner Necromancer stands back and re-raises | Not yet | |
| Casters pick quiet spots | Not yet | |
| Team regroup | Partial | 11-12, Darius (Paladin 19) leading Xena, Sankt, Barabas on Normal Quest: fired 3 times in 11 min (every 3+ min as designed), each trip 9-18 s, followers rejoined by waypoint within seconds. But it ends the moment everybody is in town, and the leader leaves before followers do; the team drifts apart again in fights. Followers asked "I cannot reach you" 5 times in Catacombs 4 (no waypoint) and no teammate portal was seen. |

## Runs


### 2026-11-12 Normal Quest run, Darius (Paladin 19) + Xena, Sankt, Barabas
- 11:52 first run: Darius froze behind a "Diablo II Error" box in the Barracks (10 min idle). Second run (12:03): same freeze. Qolbot now restarts a bot that shows the box (UNTESTED).
- 12:26 third run: the bots moved. Darius walked Barracks -> Catacombs 4 and fought Andariel, chickened twice (12:32, 12:38) and started the walk again. A level 19 Paladin is too weak for Andariel here. No quest finished yet (Sisters to the Slaughter: Not yet).

### 2026-11-12 evening: Normal Quest, Darius leading, then Xena
- Seven Tombs: Darius and Barabas have it in their saves (Quick Travel portal, staff socketed, Duriel dead in 5 s, Tyrael talked to). Horadric Staff (quest 10) completes with it, for all four bots (as the user guessed: it finishes with the act). Xena's turn as leader: Duriel killed twice, Tyrael never found ("Unable to find NPC"), so no act 3 flag and Sankt and Xena still lack quest 14. Followers arrive 30-60 s after the leader and Meir, so they miss the kill and the credit: `Team.holdAndGather` (hold fire, wait for the team, go) was added, it needs a real test.
- Waypoint sharing reached act 3: on arrival in Kurast Docktown the sync found 7 to share (Meir to Darius) and the first went through.
- Regroup: 0 in the first 25 minutes, 1 at 19:47 (Darius apart). No ping-pong.
