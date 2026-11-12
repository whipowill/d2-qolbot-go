/**
*	@filename	Questing.js
*	@author		whipowill
*	@desc		Play the quests, act by act (what Goal "Quest" runs). The work is in common/Quester.js: each quest is done in
*				turn, and the town parts (talking to the quest NPCs) are the same ones the followers do.
*/

function Questing()
{
	include("common/Quester.js");

	print("Questing: playing the quests.");
	Quester.runQuests(false);

	return true;
}
