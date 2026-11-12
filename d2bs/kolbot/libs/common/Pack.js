/**
*	@filename	Pack.js
*	@desc		The bot's inventory: which cells it may use, and moving the keepers it finds in the pack to the stash when it joins a game.
*/

include("common/Plan.js");
include("common/Report.js");
include("common/Saver.js");

var Pack = {
	// the book-keeping after an item went to the stash (or the cube)
	stashed: function (item) {
		Misc.itemLogger("Stashed", item);

		if (Item.isCharm(item)) {
			Item.forgetCharm(item);
		}

		if (typeof Pickit === "object") {
			print("\xFFc7Stashed " + Pickit.itemColor(item) + item.name); // read by Qolbot's Activity list
		}
	},

	// Config.Inventory says which inventory cells the bot may use. Every cell is the bot's: the things you keep in your pack on purpose
	// (charms, tomes, keys, the cube, torch parts) are recognised by what they are, see Item.userOwned in Misc.js. The matrix must have
	// exactly one entry per cell of the inventory, so it is built from the inventory size.
	lockMatrix: function (st) {
		var w = st.inventory[0], h = st.inventory[1], r, c, row, matrix = [];

		for (r = 0; r < h; r += 1) {
			row = [];

			for (c = 0; c < w; c += 1) {
				row.push(1);
			}

			matrix.push(row);
		}

		Config.Inventory = matrix;
	},

	// When a bot joins a game its pack should hold no keepers. If one is in it, move it to the
	// stash and say what is happening. Tomes, keys, potions, scrolls, the cube and quest items stay where they are.
	freePickupArea: function () {
		var plan = Plan.get(), items, i, moved = 0, area, item,
			keep = [518, 519, 529, 530, 543, 549], // tome of town portal, tome of identify, tp scroll, id scroll, key, horadric cube
			potions = [76, 77, 78]; // healing, mana, rejuvenation

		if (!plan || !plan.storage || plan.storage.clearOnLoad === false || !me.inTown) {
			return true;
		}

		items = Item.botItems();

		if (!items) {
			print("Pack: cannot read the inventory to look for keepers.");

			return false;
		}

		// Only keepers go to the stash. Anything else (an item the mercenary or I cannot use, junk) is left for the town chores
		// that follow, which identify it and sell it. Items that are not plain gear (runes, gems, keys...) and protected kinds count as keepers.
		function keeper(it) {
			try {
				if (!Item.sellable(it) || !Item.isReplacable(it)) {
					return true;
				}

				return !!it.getFlag(0x10) && Town.keepVerdict(it, Pickit.checkItem(it).result) > 0;
			} catch (e) {
				return true; // cannot tell: stashing is the safe choice
			}
		}

		items = items.filter(function (it) {
			return it.mode === 0 && it.location === 3 && keep.indexOf(it.classid) === -1 && potions.indexOf(it.itemType) === -1 && it.itemType !== 39 && keeper(it); // 39 = quest item
		});

		if (!items.length) {
			print("Pack: no keepers in my pack.");

			return true;
		}

		Report.note("Pack", "I have " + items.length + " keeper(s) in my pack. Moving them to my stash.");
		me.cancel();

		if (!Town.openStash()) {
			Report.problem("Pack", "I could not open my stash, so my pack stays as it is.");

			return false;
		}

		for (i = 0; i < items.length; i += 1) {
			item = items[i];

			if (!Storage.Stash.CanFit(item) && Item.toCube(item)) { // the cube is extra storage once the stash is full
				moved += 1;
				this.stashed(item);

				continue;
			}

			if (!Storage.Stash.CanFit(item)) {
				if (plan.storage.addStashPages) {
					Report.problem("Pack", "My stash is full. Adding a stash page.");
					say("/insertpage");
					delay(1000);
					say("/swappage 1"); // only works with PlugY v14
					delay(1000);
					Storage.Reload();
				} else {
					Report.fail("Pack", "my stash is full and I cannot make room (" + (plan.plugy === false ? "the game does not use PlugY, so I cannot add a stash page" : "adding stash pages is off") + "). Stopping.");
					D2Bot.stop(me.profile, true);

					return false;
				}
			}

			if (Storage.Stash.MoveTo(item)) {
				moved += 1;
				this.stashed(item);
			}
		}

		me.cancel();

		if (moved > 0 && Saver.minutes()) {
			Saver.now(false); // keep what was just moved
		}

		if (moved === items.length) {
			Report.note("Pack", "Done. Moved " + moved + " item(s) to my stash.");
		} else {
			Report.problem("Pack", "I could only move " + moved + " of " + items.length + " item(s) to my stash.");
		}

		return moved === items.length;
	}
};
