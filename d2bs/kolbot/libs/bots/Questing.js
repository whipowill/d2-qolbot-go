/**
*	@filename	Questing.js
*	@author		whipowill
*	@desc		Play the quests, act by act (what Goal "Quest" runs). The work is in common/Quester.js: each quest is done in
*				turn, and the town parts (talking to the quest NPCs) are the same ones the followers do.
*/

function Questing()
{
	include("common/Quester.js");

	print("Questing: playing the quests on " + ["Normal", "Nightmare", "Hell"][me.diff] + ".");

	// the game's own bits for the quests that give points, at the start of the run: compare with "saved file before start" in Qolbot's log for this bot
	// (a quest that was complete in the file and is not here was taken back by the game when the character loaded)
	[1, 9, 17, 20, 25].forEach(function (id) { Quester.logBits(id); });
	try { Quester.cainSoulstone(); } catch (cainError) { print("Quester: Cain: " + cainError); } // in Act 4 without a Soulstone: Cain gives one
	try { Quester.cubeHunt(); } catch (cubeHuntError) { print("Cube hunt: " + cubeHuntError); } // a bot without a Horadric Cube fetches one first
	Quester.runQuests(false);

	// Nothing left to do on this difficulty: stay here. Returning would end the game and start a new one, over and over (it looks like a disconnect).
	print("Questing: no quest is left to do on this difficulty. Waiting here; stop the bots when you like.");
	Quester.idle();

	return true;
}
