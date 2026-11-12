/**
*	@filename	AutoSaveThread.js
*	@desc		Saves the character every few minutes (the Settings tab's autosave). A bot that follows a player does this from the
*				Follower script; a leader bot that plays its objective has no such loop, so this thread does it. All it needs is Saver.js.
*/

include("common/Saver.js");

function main() {
	print("AutoSaveThread: running, saving every " + Saver.minutes() + " min (0 = never).");

	while (true) {
		try {
			if (me.ingame && me.gameReady) {
				Saver.auto();
			}
		} catch (e) {
			print("AutoSaveThread: " + e); // it used to die silently: a leader that never autosaves loses its progress when a game ends without a save
		}

		delay(5000);
	}
}
