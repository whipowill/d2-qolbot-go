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
	firstPage: function (dx, dy) {
		var x = 159, y = 402;

		if (!this.enabled()) {
			return this.off("the first page click");
		}

		if (me.screensize === 1) {
			x = 142;
			y = 499;
		}

		x += dx || 0;
		y += dy || 0;
		print("Stash: clicking the first page button at " + x + "," + y + " (screensize " + me.screensize + ", stash open " + !!getUIFlag(0x19) + ").");

		try {
			sendClick(x, y);
		} catch (clickError) {
			print("Stash: " + clickError);
		}

		return true;
	},

	// A NEW STASH PAGE (the user, 2026-11-15: "you have to /insertpage then /swappage 1 then click back to page one"; 2026-11-18: "i'm betting this procedure is correct ...
	// but perhaps the click back to page one is failing"). "/insertpage" puts an empty page after the one in view, "/swappage 1" makes it page 1, and the click on the
	// "first page" button brings page 1 into view. The sequence worked live 2026-11-16 and 2026-11-18 09:38, and failed at 09:56 and 11:46 with the click doing nothing
	// (the page in view stayed full, a reopen of the stash too). So the CLICK is retried: each time with the stash window checked open first, at the measured spot and
	// then a few pixels around it (a button hit slightly off, or a click that needs the pointer over it first), looking at the page in view after each. If page 1 is
	// still not in view the stash is closed and opened again; as a last way one more page is added and used where it is, so the team is not stopped for a full stash.
	newStashPage: function () {
		if (!this.enabled()) {
			return this.off("a new stash page");
		}

		var i, spots = [[0, 0], [0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]],
			inView = function () {
				Storage.Reload();

				return (me.findItems(-1, -1, 7) || []).length;
			};

		this.insertPage();
		delay(1000);

		if (inView()) {
			print("Stash: after /insertpage the page in view still holds " + inView() + " item(s): the page may not have been added.");
		}

		this.swapPage(1);
		delay(1000);

		for (i = 0; i < spots.length && inView(); i += 1) {
			if (!getUIFlag(0x19) && typeof Town === "object" && Town.openStash) {
				print("Stash: the stash window is not open: opening it before the click.");
				Town.openStash();
				delay(500);
			}

			this.firstPage(spots[i][0], spots[i][1]);
			delay(1000);
		}

		if (inView() && typeof Town === "object" && Town.openStash) {
			print("Stash: page 1 is still not in view: closing the stash and opening it again (it opens on page 1).");
			me.cancel();
			me.cancel();
			delay(800);
			Town.openStash();
			delay(1000);
		}

		if (inView()) {
			print("Stash: page 1 cannot be brought into view (" + inView() + " item(s) in view, screensize " + me.screensize + "): adding a page and using it where it is.");
			this.insertPage();
			delay(1500);

			if (!inView()) {
				print("Stash: the new page is in view and empty: using it.");

				return true;
			}

			print("Stash: no empty page in view even now (" + inView() + " item(s)).");

			return false;
		}

		print("Stash: a new page is page 1 and in view.");

		return true;
	}
};
