include("common/PlugY.js");

function ForceSave() {

	delay(5000);

	// use plugy command to save
	if (!Config.QuietChat) { // a task report: only with "Bots report when they engage in tasks" on (the user, 2026-11-15)
		say(Speech.flavor("Saving."));
	}
	PlugY.save();
	delay(5000);

	// send update
	D2Bot.updateRuns();
	delay(5000);

	// For reasons I don't fully understand, this was not working reliably.
	// Switching the order of events, to save first before updating run counts,
	// and adding additional wait time, seems to have fixed this.

	// return
	return true;
}