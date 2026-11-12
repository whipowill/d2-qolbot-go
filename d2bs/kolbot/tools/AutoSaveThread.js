/**
*	@filename	AutoSaveThread.js
*	@desc		Saves the character every few minutes (the Settings tab's autosave). A bot that follows a player does this from the
*				Follower script; a leader bot that plays its objective has no such loop, so this thread does it.
*/

function main() {
	include("json2.js");
	include("OOG.js");
	include("common/Config.js");
	include("common/Prototypes.js");
	include("common/Misc.js");
	Config.init();
	print("AutoSaveThread: running, AutoSpec " + (typeof AutoSpec) + ".");

	while (true) {
		try {
			if (me.ingame && me.gameReady && typeof AutoSpec === "object") {
				AutoSpec.autoSave();
			}
		} catch (e) {
			print("AutoSaveThread: " + e); // it used to die silently: a leader that never autosaves loses its progress when a game ends without a save
		}

		delay(5000);
	}
}
