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

	while (true) {
		if (me.ingame && me.gameReady && typeof AutoSpec === "object") {
			AutoSpec.autoSave();
		}

		delay(5000);
	}
}
