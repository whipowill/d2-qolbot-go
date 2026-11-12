/**
*	@filename	QuestItems.js
*	@author		whipowill
*	@desc		The quest items a bot must never lose: the consumables that raise stats or give skill points for good (the Book of
*				Skill, the Potion of Life, the Scroll of Resistance), and the quest items it must never throw away.
*
*				It makes room in the pack for them (town chores, drinking spare potions, dropping junk), uses them up at once, and says
*				what it did in the bot's log with the prefix "QuestItems:". Qolbot reads those lines for the Activity tab (cmd/qolbot/activity.go).
*
*				Who calls it: Quester.js (the quests and the quest NPC visits). Town.clearInventory keeps its own copy of the "never throw
*				away" list (Town.js); keep the two in step.
*/

include("common/Report.js");
include("common/Saver.js");

var QuestItems = {

	// Used up the moment they are held: [class id, name]. A Book of Skill gives 1 skill point, a Potion of Life 20 life, a Scroll of
	// Resistance 10 to every resistance; Malah's Potion only cures the cold.
	consumables: [[545, "Potion of Life"], [552, "Book of Skill"], [644, "Malah's Potion"], [646, "Scroll of Resistance"]],

	// Quest items that must never be sold, dropped or stashed away from the quest: class ids
	keep: [524, 525, 89, 552, 549, 92, 521, 91, 546, 547, 545, 87, 548, 553, 554, 555, 173, 174, 90, 644, 646],

	// Pandemonium keys, organs, token and essences: the player needs these
	pandemonium: ["pk1", "pk2", "pk3", "dhn", "bey", "mbr", "toa", "tes", "ceh", "bet", "fed"],

	// the first copy of an item in the inventory (not stash, not worn), or null
	find: function (classid) {
		var item = me.getItem(classid);

		if (item) {
			do {
				if (item.location === 3) {
					return copyUnit(item);
				}
			} while (item.getNext());
		}

		return null;
	},

	// is this item (on the ground or in the pack) one of the consumables?
	isConsumable: function (item) {
		var i;

		for (i = 0; i < this.consumables.length; i += 1) {
			if (this.consumables[i][0] === item.classid) {
				return true;
			}
		}

		return false;
	},

	// is a consumable waiting in the pack?
	hasConsumable: function () {
		var i;

		for (i = 0; i < this.consumables.length; i += 1) {
			if (this.find(this.consumables[i][0])) {
				return true;
			}
		}

		return false;
	},

	// an item no bot may sell, drop or throw away
	isProtected: function (item) {
		return this.keep.indexOf(item.classid) > -1 || this.pandemonium.indexOf(item.code) > -1;
	},

	// Use every consumable in the pack (right click), up to four of each. Returns how many were used. Logs each use with the unspent
	// skill and stat points before and after, so a Book of Skill that did its work shows ("skill points 0 -> 1").
	useAll: function () {
		var i, n, item, used = 0, name, skillsBefore, statsBefore, left;

		for (i = 0; i < this.consumables.length; i += 1) {
			name = this.consumables[i][1];

			for (n = 0; n < 4; n += 1) {
				item = this.find(this.consumables[i][0]);

				if (!item) {
					break;
				}

				skillsBefore = me.getStat(5); // unspent skill points
				statsBefore = me.getStat(4); // unspent stat points
				this.log("using the " + name + " (unspent skill points " + skillsBefore + ", stat points " + statsBefore + ")");

				clickItem(1, item);
				delay(900);

				left = this.find(this.consumables[i][0]);

				if (!left || left.gid !== item.gid) {
					used += 1;
					this.log("used the " + name + " (unspent skill points " + skillsBefore + " -> " + me.getStat(5) + ", stat points " + statsBefore + " -> " + me.getStat(4) + ")");
					this.note("Used the " + name + ".");

					// save now: a chicken quit or a crash right after must not take the points with it (the exit save does not always keep them)
					Saver.soon("used the " + name);
				} else {
					this.log("the " + name + " would not be used, it stays in the pack");

					break; // leave it alone
				}
			}
		}

		return used;
	},

	// Make room for an item of w x h cells, whatever it takes: town chores first (junk is sold, keepers go to the stash), then drink the
	// spare health and mana potions, then drop what the bot would sell anyway, then (last resort) drink the rejuvenation potions. Quest items, tomes, keys, cube, cubing and runeword parts,
	// charms and anything the player owns are never touched. Returns true when the item fits.
	makeRoom: function (w, h) {
		var spot = {sizex: w, sizey: h}, n, item, pots, junk, i;

		if (Storage.Inventory.CanFit(spot)) {
			return true;
		}

		this.log("the pack is full, making room for a " + w + "x" + h + " item");
		this.note("My pack is full. Making room for a quest item.");

		// 1. town chores
		try {
			if (me.inTown) {
				Town.doChores();
			} else {
				Town.visitTown();
			}
		} catch (townError) {
			this.log("town chores failed: " + townError);
		}

		if (Storage.Inventory.CanFit(spot)) {
			this.log("room made by the town chores");

			return true;
		}

		// 2. drink the spare potions in the pack (health, then mana; rejuvenation potions are the last resort)
		for (n = 0; n < 40; n += 1) {
			pots = [];
			item = me.getItem(-1, 0);

			if (item) {
				do {
					if (item.location === 3 && [76, 77].indexOf(item.itemType) > -1) {
						pots.push(copyUnit(item));
					}
				} while (item.getNext());
			}

			if (!pots.length) {
				break;
			}

			pots.sort(function (a, b) { return a.itemType - b.itemType; });
			this.log("drinking " + pots[0].name + " to make room");
			pots[0].interact();
			delay(300 + me.ping);

			if (Storage.Inventory.CanFit(spot)) {
				this.log("room made by drinking potions");

				return true;
			}
		}

		// 3. drop the junk: the things a bot sells anyway, the biggest first
		junk = (Item.botItems() || []).filter(function (it) {
			return it.location === 3 && [18, 41, 76, 77, 78].indexOf(it.itemType) === -1 && !QuestItems.isProtected(it) &&
				!Cubing.keepItem(it) && !Runewords.keepItem(it) && !CraftingSystem.keepItem(it) &&
				Item.sellable(it) && Town.keepVerdict(it, Pickit.checkItem(it).result) === 0;
		});
		junk.sort(function (a, b) { return b.sizex * b.sizey - a.sizex * a.sizey; });

		for (i = 0; i < junk.length; i += 1) {
			this.log("dropping " + junk[i].name + " to make room");
			junk[i].drop();
			delay(300 + me.ping);

			if (Storage.Inventory.CanFit(spot)) {
				this.log("room made by dropping junk");

				return true;
			}
		}

		// 4. last resort: drink the rejuvenation potions too
		for (n = 0; n < 40; n += 1) {
			item = me.getItem(-1, 0);
			pots = [];

			if (item) {
				do {
					if (item.location === 3 && item.itemType === 78) {
						pots.push(copyUnit(item));
					}
				} while (item.getNext());
			}

			if (!pots.length) {
				break;
			}

			this.log("drinking " + pots[0].name + " to make room (last resort)");
			pots[0].interact();
			delay(300 + me.ping);

			if (Storage.Inventory.CanFit(spot)) {
				this.log("room made by drinking rejuvenation potions");

				return true;
			}
		}

		this.log("no room could be made");
		this.problem("I cannot make room for a quest item: my pack is full of things I must keep. Please clear some space.");

		return false;
	},

	// Pick up a quest item lying on the ground (an object the caller found with getUnit), making room first, and use it up at once
	// when it is a consumable. Returns "taken", "failed" (it is there but would not be picked up) or "missing" (item is null).
	pickUp: function (item, consume) {
		if (!item) {
			return "missing";
		}

		this.makeRoom(item.sizex, item.sizey); // every quest item needs room, not only the consumables

		this.log("picking up the " + item.name);

		if (!Pickit.pickItem(item)) {
			this.log("could not pick up the " + item.name);

			return "failed";
		}

		delay(500);

		if (consume) {
			this.useAll();
		}

		return "taken";
	}
};

Report.mixin(QuestItems, "QuestItems"); // QuestItems.log / note / problem, written under its own name
