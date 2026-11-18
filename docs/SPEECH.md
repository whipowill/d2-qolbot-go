# What the bots say

Made by `scripts/speechdoc.sh` from `d2bs/kolbot/libs/common/Speech.js`: change the phrasings there, then run it again. Every line has at
least three phrasings, and the bot picks one at random each time (checked by `scripts/jstest/speech_test.js`).

The bots do not coordinate in the public chat. They post keywords to each other in `data/<bot>.tmsg.json` (Team.post / command / take in
`libs/common/Team.js`). What they say in chat is only for the player, and no bot reads it.

When a line is said:

- **task**: only with "Bots report when they engage in tasks" on.
- **problem**: only with "Bots report when they have a problem" on.
- **reply**: always, when a player typed a command in chat. When the leader bot sent the command, the reply counts as a task.

## Answers to the team

Each answer posts its keyword to the team, then says one of its phrasings when the setting allows. ‹n› is the place or waypoint.

### portalOpen (keyword `portalopen`, announce)

- Behold, the portal stands open!
- The gate is open, good friends. Make haste!
- Hark! The way is open. Step through!

### noPlace (keyword `noplace`, problem)

- I know of no such place, my lord.
- That place is unknown to me.
- No map of mine shows such a place.

### noGet (keyword `noget`, problem)

- Alas, I could not get there.
- The road was barred to me. I could not get there.
- I tried, but the way would not let me through.

### noQuick (keyword `noquick`, problem)

- Alas, I have not the art to travel so swiftly.
- Such swift travel is beyond my craft.
- I cannot leap through the air as a sorceress does.

### needGold (keyword `needgold`, problem)

- Good friends, can any spare me some gold? My purse is empty.
- My purse is light. Might one of you spare a little gold?
- I am near penniless. A few coins, if any can spare them?

### cannotReach (keyword `cantreach`, problem)

- I cannot find thee. Open a portal, or I shall bide in town.
- Thou art beyond my reach. Open a portal, or I shall wait here in town.
- I have lost thy trail. A portal, and I come; else I wait in town.

### hasWaypoint (keyword `haswp`, task)

- Aye, I know the waypoint ‹n›.
- I have walked to waypoint ‹n› before.
- Waypoint ‹n›? I know the way.

## Reports and replies

The log line stays as the script wrote it (Qolbot's Activity tab reads it). The chat gets one of the phrasings. ‹1›, ‹2› … are the
parts of the report line marked … or N. A line that no rule knows is said as it is, or after "Hear me:" or "Mark this:".

### Quests and the team

**Act N - #N - "…" is complete.**

- The deed is done: ‹3›. Let the bards take note!
- ‹3› is finished. One more tale for the fire.
- It is done, ‹3›. May it be the first of many.

**The team is split up…**

- Where has our company strayed? To town, that we may gather!
- We are scattered. Come to town, all of you, and we shall go forth together.
- Our band is broken apart. Back to town, friends, and we regroup.

**Not everybody came to town within 90 seconds. Going on.**

- Some tarry still. We go on without them.
- We have waited long enough. Onward, with or without the stragglers.
- The laggards must catch up as they can. We march.

**Starting with N of the team not in my party yet.**

- We set out, though ‹1› of us have not yet joined the party.
- ‹1› of our company stand outside the party still. We go regardless.
- Not all have taken my banner (‹1› missing). We begin anyway.

**Starting without …: they did not join in N minutes.**

- We begin without ‹1›. They kept us waiting ‹2› minutes.
- No more waiting for ‹1›. We go.
- ‹1› never came. We set out without them.

**Waiting for my team: N of N in the game….**

- I await my company: ‹1› of ‹2› have come.
- ‹1› of ‹2› are here. I wait for the rest.
- Not all have arrived (‹1› of ‹2›). Patience.

**Syncing the team's waypoints before we begin…**

- Hear me! Before we begin, let us share what each of us knows of the waypoints.
- A moment, friends: we share our waypoints before we set out.
- First the waypoints: what one of us knows, all shall know.

**all in sync (…)**

- Our waypoints are all alike. We have nothing to share.
- We all know the same roads. Nothing to share.
- Every waypoint is known to all of us already.

**Waypoints synced…**

- The waypoints are shared among us. Onward!
- Now we all know the same roads. Let us go.
- The waypoints are shared. To the hunt!

### The follower's way

**Ready.**

- Ready and willing.
- At thy service.
- I am prepared.

**Running town chores….**

- A moment in town: there are errands to run.
- I must see to my errands before we leave.
- Business in town first: mending, potions, and the like.

**Going outside[ (…)].**

- Forth we go!
- Into the wilds once more.
- Lead on, I follow.

**Going to town[ (waypoint)].**

- Back to town I go.
- To town, for a breath of safety.
- I return to town.

**Going to town to meet up.**

- I shall meet thee in town.
- To town, to find the others.
- I go to town to rejoin the company.

**Going to [my ]leader's town.**

- I go to the town where my leader waits.
- My leader is in another town. I follow.
- To my leader's town I go.

**The leader is leaving for …: going with it.**

- Our leader marches for ‹1›. I go too.
- To ‹1›, then. I am with thee.
- ‹1› it is. I follow.

**The leader sends the team out first.**

- Out we go first, as the leader bids.
- The leader holds the rear. We go ahead.
- As commanded: the company goes first.

**Going to Mephisto's lair for the red portal to Act 4.**

- To Mephisto's lair, for the red gate to Hell.
- I must pass the red portal myself. To the lair!
- The gate to the Pandemonium Fortress awaits me in the lair.

**Searching for leader ….**

- Where is ‹1›? I seek my leader.
- I look for ‹1›.
- ‹1›, where art thou?

**Searching for a player to follow.**

- Whom shall I follow?
- I seek someone to follow.
- Who leads? I look for a leader.

**Following ….**

- I follow ‹1›.
- ‹1› leads, I follow.
- Lead on, ‹1›.

**Leader found.**

- There thou art!
- I see my leader.
- Found thee. Lead on.

**Leader not found.**

- I cannot find my leader.
- My leader is nowhere to be seen.
- Where has my leader gone?

**Waypoint gathered.**

- Another waypoint for the map.
- This waypoint is mine now.
- I have touched the waypoint.

**Opening portal to the waypoint.**

- A portal to the waypoint, coming up.
- I open the way to the waypoint.
- Through here to the waypoint!

**Opening portal to ….**

- I open a portal to ‹1›.
- A gate to ‹1›, a moment.
- The way to ‹1› opens shortly.

**Reloading.**

- I gather my wits a moment.
- A moment to set myself right.
- Let me begin again.

**Picking items.**

- Let me see what they dropped.
- Spoils!
- What treasures have we here?

**I'm alive!**

- I live yet!
- Death did not keep me.
- Back from the grave!

**Getting ….**

- I go for ‹1›.
- Now to fetch ‹1›.
- ‹1› shall be ours.

**Making ….**

- Now to make ‹1›.
- Into the cube: ‹1›.
- I forge ‹1›.

**Equipping ….**

- I put on the ‹1›.
- The ‹1› suits me better.
- A fine ‹1›. It is mine now.

**Used the ….**

- I have used the ‹1›.
- The ‹1› is spent.
- The ‹1› has done its work.

**Talking to … (…).**

- I must speak with ‹1›.
- A word with ‹1›.
- To ‹1›, to talk.

**…: done.**

- ‹1›: done.
- That is ‹1› taken care of.
- ‹1› is settled.

**… has not given me anything back yet (…).**

- ‹1› has given me nothing yet.
- Still nothing from ‹1›.
- ‹1› keeps me waiting.

### The pack and the stash

**No room to make way for the … (… is in the way).**

- My pack is full to bursting. I can make no room for the ‹1›.
- There is no space for the ‹1› in my pack.
- The ‹1› will not fit. My pack is crammed.

**My pack is full. Making room for a quest item.**

- My pack is full. I shall clear a space for the prize.
- No room for the quest's prize: I make some.
- Something must go, to make room for what the quest gives.

**I cannot make room for a quest item…**

- My pack is full of things I must keep. I cannot take the quest's prize: clear some space for me.
- No room for the prize, and nothing I may throw away. Help me make space.
- I must keep all I carry, so the quest's prize has no place. Clear my pack, I pray.

**I have N keeper(s) in my pack. Moving them to my stash.**

- I carry ‹1› treasures worth keeping. To the stash with them.
- ‹1› keepers in my pack. I stow them away.
- To the stash: ‹1› things worth keeping.

**Done. Moved N item(s) to my stash.**

- Stowed ‹1› in the stash.
- ‹1› safely in the stash.
- The stash holds ‹1› more now.

**I could only move N of N item(s) to my stash.**

- Only ‹1› of ‹2› would fit in the stash.
- The stash took but ‹1› of ‹2›.
- ‹1› of ‹2› stowed; the rest stays with me.

**I could not open my stash…**

- My stash will not open.
- The stash is shut to me.
- I cannot get at my stash.

**My stash is full. Adding a stash page.**

- My stash is full: a new page.
- The stash overflows. Another page!
- No room left in the stash; I add a page.

**I cannot do this: …**

- I cannot do this: ‹1›
- This is beyond me: ‹1›
- I am stuck: ‹1›

### Trouble on the way

**I cannot follow you to act N: I have not unlocked it yet.**

- I cannot follow thee to act ‹1›. I have not earned the way there.
- Act ‹1› is closed to me still.
- The road to act ‹1› is barred to me.

**I could not get to act N …**

- I could not reach act ‹1›.
- Act ‹1› eludes me.
- No road to act ‹1› would take me.

**Act change failed.**

- I could not change acts.
- The way to the next act failed me.
- No passage to the next act.

**I keep going out and ending up back in town…**

- Each time I go out I land back in town. I wait a minute: open a new portal, or say the word.
- The portal keeps spitting me back into town. A new portal, I beg thee.
- Out and back, out and back. I wait here: give me a fresh portal.

**I cannot get to town: no portal and no town portal scroll.**

- I have no scroll and no portal to town.
- No way back to town: my scrolls are gone.
- Without a scroll, the town is beyond me.

**No TP scrolls or tomes.**

- I have no scrolls of portal.
- My tome of portal is empty.
- Not one portal scroll left.

**I am out of town portal scrolls. Leaving the game to restock in town.**

- My scrolls of portal are spent. I must go back to town and buy more.
- No portal scrolls left. I leave to restock.
- Out of scrolls. I must buy more before I go on.

**I lost you: going to town to meet up.**

- I have lost thee. To town, to find thee again.
- Thou art gone from my sight. I go to town to rejoin thee.
- I know not where thou art. To town I go, and meet thee there.

**I am badly hurt. Going to town to heal.**

- I am sorely wounded. To the healer!
- Blood everywhere. I must be healed.
- Badly hurt: I go to town to mend.

**Failed to use cow portal.**

- The cow portal will not take me.
- I cannot enter the cow portal.
- The red portal to the cows refused me.

**…: Error: …**

- ‹1› went awry: ‹2›
- Trouble with ‹1›: ‹2›
- ‹1› failed me: ‹2›

**My objective is … but there is nothing for me to run…**

- My task is ‹1›, but no runs were chosen for me. Choose them on the Bots tab.
- I am bid to ‹1›, yet no runs are chosen. See the Bots tab.
- Nothing to run for ‹1›: pick my runs on the Bots tab.

**I could not take my stat / skill points back.**

- My ‹1› points would not come back to me.
- I could not unlearn my ‹1› points.
- The ‹1› points stay where they are; I could not reset them.

**Saving.**

- Let me set down my deeds in the chronicle.
- A moment to record our deeds.
- I write this day into the chronicle.

**Idle.**

- There is naught left to do. I shall wait here.
- Nothing more for me. I wait.
- I stand idle, awaiting orders.

### Replies to a player's own chat commands

**Teleport on / off.**

- Teleport ‹1›.
- Teleporting is ‹1›.
- Very well: teleport ‹1›.

**Attack on / off.**

- Attack ‹1›.
- Fighting is ‹1›.
- Very well: attack ‹1›.

**Resuming.**

- Resuming.
- Onward again.
- Back to it.

**Stopping.**

- Stopping.
- I halt.
- I stand down.

**Saved.**

- Saved.
- It is written.
- The chronicle is up to date.

**Active aura is: N**

- My aura is now ‹1›.
- Aura ‹1›.
- I wear aura ‹1›.

**Attack skill is: N**

- My attack is now ‹1›.
- Attack skill ‹1›.
- I fight with skill ‹1›.

**I don't have that aura / skill.**

- I have no such ‹1›.
- That ‹1› is not mine.
- I know no such ‹1›.

**Switching leader to ….**

- ‹1› leads now.
- I follow ‹1› from now on.
- My new leader is ‹1›.

**I'm not in town!**

- I am not in town!
- Not in town, I cannot.
- I must be in town for that.

**No NPC name given.**

- Talk to whom?
- Name the one I should speak with.
- Which townsfolk?

**Invalid NPC / NPC not found.**

- I know no one by that name.
- I cannot find that one.
- No such person here.

**Failed to move to town spot.**

- I could not get there in town.
- The way across town is blocked.
- I cannot reach that spot.

**Done talking.**

- I have had my word.
- Done talking.
- The talk is over.

### Anything else

## Banter

With "Dark quotes" on (`Config.DarkQuotes`), a bot sometimes says a quote from `libs/config/Quotes/quotes.json`. In town it says one every
15 to 75 seconds, from 1668 town quotes. Outside town it says one every 1 to 3 minutes, from 3363 combat quotes.
They are too many to list here.

## Not covered here

The stock kolbot scripts the team does not run (Rusher, Rushee, Synch, SealLeader, the MF leader calls in Mephisto, Andariel, Duriel and
Cows with `Config.MFLeader` on) still say their own words in chat, unchanged.
