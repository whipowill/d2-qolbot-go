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
	Quester.runQuests(false);

	// Nothing left to do on this difficulty: stay here. Returning would end the game and start a new one, over and over (it looks like a disconnect).
	print("Questing: no quest is left to do on this difficulty. Waiting here; stop the bots when you like.");
	Quester.idle();

	return true;
}
