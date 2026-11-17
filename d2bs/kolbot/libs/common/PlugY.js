/**
*	@filename	PlugY.js
*	@desc		Everything the bots ask of PlugY, in one place (the user, 2026-11-16: "for functions that use Plugy, QOL.dll, or Quartermaster.dll put those in separate
*	            classes so they can be controlled"). Settings, Game, "Using PlugY?" (plan.plugy, Config.UsesPlugy) switches it all: with it off none of the commands below
*	            sends anything, and each says so once in the log.
*
*	            What PlugY gives the bots: "/save" (the character file is written now: Saver, ForceSave, the leader's "save" order), and the stash pages: "/insertpage"
*	            puts an empty page after the one in view, "/swappage 1" swaps it with page 1, and a click on the "first page" button under the stash grid shows page 1
*	            ("/page 1" does not move the view: the user, 2026-11-16). Nothing else in the bot scripts talks to PlugY.
*/

var PlugY = {
	said: {},

	// "Using PlugY?" (AutoSpec sets Config.UsesPlugy from the plan; a config without it means yes, as before)
	enabled: function () {
		// the autosave thread has no Config (it loaded only Saver.js): there the plan decides, and a missing plan means yes, as before
		if (typeof Config === "object") {
			return Config.UsesPlugy !== false;
		}

		return !(typeof Plan === "object" && Plan.get() && Plan.get().plugy === false);
	},

	// not used: say so once for this command
	off: function (what) {
		if (!this.said[what]) {
			this.said[what] = true;
			print("PlugY: " + what + " is not sent: \"Using PlugY?\" is off.");
		}

		return false;
	},

	// "/save": the character file is written (it takes a few seconds: the callers wait)
	save: function () {
		if (!this.enabled()) {
			return this.off("/save");
		}

		say("/save");

		return true;
	},

	// "/insertpage": a new empty page after the one in view, which it shows
	insertPage: function () {
		if (!this.enabled()) {
			return this.off("/insertpage");
		}

		say("/insertpage");

		return true;
	},

	// "/swappage n": the page in view swaps with page n
	swapPage: function (n) {
		if (!this.enabled()) {
			return this.off("/swappage");
		}

		say("/swappage " + n);

		return true;
	},

	// PlugY's "first page" button under the stash grid (the bar and arrow pointing left, the first of the row of five). MEASURED on a bot's own window (2026-11-16,
	// Darius's stash open on the bots' hidden display :2): the game runs at 640x480 there (me.screensize 0), its drawing area starts at 3,29 on that display, the
	// button is centred at 162,431 on it: 159,402 in the game's own coordinates. The other size (800x600, me.screensize 1) is a guess from the user's screenshot (his UI
	// is 800x600 drawn 1.44 times as big, centred: 142,499) and is logged. Verified live 2026-11-16 12:36:10 at 159,402: "a new page is page 1 and in view".
	firstPage: function () {
		var x = 159, y = 402;

		if (!this.enabled()) {
			return this.off("the first page click");
		}

		if (me.screensize === 1) {
			x = 142;
			y = 499;
		}

		print("Stash: clicking the first page button at " + x + "," + y + " (screensize " + me.screensize + ").");

		try {
			sendClick(x, y);
		} catch (clickError) {
			print("Stash: " + clickError);
		}

		return true;
	},

	// A NEW STASH PAGE (the user, 2026-11-15: "/insertpage adds a page after the one you're looking at"; "you have to /insertpage then /swappage 1 then click back to
	// page one"; 2026-11-16: "writing /page 1 won't move the current view to page 1, the only way to do it is to click the back button"). The stash opens on page 1.
	// "/insertpage" puts an empty page after the one in view and shows it, "/swappage 1" swaps it with page 1 (the full page moves to page 2, the empty one is page 1),
	// the view stays on the page that now holds the full one, and the click on the "first page" button shows page 1, the empty one. The newest page is always page 1, the
	// one every stash visit opens on. The result is checked (page 1 in view must be empty) and logged.
	newStashPage: function () {
		if (!this.enabled()) {
			return this.off("a new stash page");
		}

		this.insertPage();
		delay(1000);
		this.swapPage(1);
		delay(1000);
		this.firstPage();
		delay(1000);
		Storage.Reload();

		if ((me.findItems(-1, -1, 7) || []).length) {
			print("Stash: after adding a page the page in view is not empty: the first page button did not work (screensize " + me.screensize + ").");

			return false;
		}

		print("Stash: a new page is page 1 and in view.");

		return true;
	}
};
