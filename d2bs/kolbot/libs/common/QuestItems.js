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
	consumables: [[545, "Potion of Life"], [552, "Book of Skill"], [646, "Scroll of Resistance"]], // not Malah's Potion (644): the bot cannot use it, it thaws Anya (the user, 2026-11-14)

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

	// quest items a FOLLOWER picks up too (Pickit.questOnly): the ones it finishes by handing in to an NPC (Follower town quests): the Jade Figurine and
	// the Golden Bird (Meshif, Alkor), Lam Esen's Tome (Alkor). The server drops one copy per player who has not done the quest (the user, 2026-11-14:
	// the Staff of Kings dropped several times in one run), so a follower taking its own copy does not rob the leader. NOT the pieces of Khalim's Will:
	// a follower cannot cube them or smash the orb, and they would only fill its pack.
	shared: [546, 547, 548, 549, 551], // 549: the Horadric Cube (the team's cube hunt: the chest gives one to each bot that has none) // 551: Mephisto's Soulstone (Act 4's Hellforge quest; only the leader took it, 2026-11-14 10:39)

	isShared: function (item) {
		return this.shared.indexOf(item.classid) > -1;
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
		// Wirt's Leg, for a bot that farms the Cow Level (Scripts.Cows): kept, not sold, for the next cow portal (Cows.getLeg uses one it has)
		if (item.classid === 88 && typeof Scripts === "object" && Scripts.Cows) {
			return true;
		}

		return this.keep.indexOf(item.classid) > -1 || this.pandemonium.indexOf(item.code) > -1;
	},

	// Use every consumable in the pack (right click), up to four of each. Returns how many were used. Logs each use with the unspent
	// skill and stat points before and after, so a Book of Skill that did its work shows ("skill points 0 -> 1").
	// Malah's Potion (644) thaws Anya. The game has only one: Malah gives none while a bot of the game holds one (live 2026-11-14 15:07, Darius got
	// none, Sankt held it), so whoever holds it uses it on frozen Anya (object 558) when she is near. Follower.js calls this in the Frozen River,
	// the leader's Prison of Ice too. UNTESTED live.
	thawAnya: function () {
		var anya = getUnit(2, 558), i;

		if (!anya || !me.getItem(644) || getDistance(me, anya) > 40) {
			return false;
		}

		for (i = 0; i < 3 && me.getItem(644); i += 1) {
			Pather.moveToUnit(anya);
			anya.interact();
			delay(1000);
			me.cancel();
		}

		print("QuestItems: Malah's Potion " + (me.getItem(644) ? "is still in my pack after trying Anya." : "used on Anya."));

		return !me.getItem(644);
	},

	useAll: function () {
		var i, n, item, used = 0, name, skillsBefore, statsBefore, left;

		for (i = 0; i < this.consumables.length; i += 1) {
			name = this.consumables[i][1];

			for (n = 0; n < 4; n += 1) {
				item = this.find(this.consumables[i][0]);

				if (!item) {
					break;
				}

				if (!me.gameReady) {
					return used; // the game is closing: nothing is used now, the next game does it (it is still in the pack)
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

					if (typeof QuestStates === "object") {
						QuestStates.snapshot("used the " + name, "", true);
					}
				} else {
					this.log("the " + name + " would not be used, it stays in the pack");

					break; // leave it alone
				}
			}
		}

		return used;
	},

	// Move the items of the pack toward its first cells, the last first, so the free cells join up (Darius, 2026-11-14: Khalim's Flail is 2x3, the
	// pack had 14 free cells but the Heart sat in the one spot that split them, and everything else in it is protected: "no room could be made").
	// An item only moves when the first free spot for it comes before the spot it is on (columns first, as Storage.FindSpot scans). Up to three passes.
	// True when `spot` fits afterwards.
	repack: function (spot) {
		var pass, i, item, items, pos, moved;

		try {
			for (pass = 0; pass < 3; pass += 1) {
				moved = false;
				items = (me.getItems() || []).filter(function (it) {
					return it.mode === 0 && it.location === 3;
				});
				items.sort(function (a, b) {
					return (b.x - a.x) || (b.y - a.y);
				});

				for (i = 0; i < items.length; i += 1) {
					item = items[i];
					pos = Storage.Inventory.FindSpot(item); // {x: row, y: column}

					if (pos && (pos.y < item.x || (pos.y === item.x && pos.x < item.y))) {
						this.log("moving the " + item.name + " from " + item.x + "," + item.y + " to " + pos.y + "," + pos.x + " in the pack");

						if (Storage.Inventory.MoveTo(item)) {
							moved = true;
						}

						if (me.itemoncursor) {
							me.cancel();
						}

						if (Storage.Inventory.CanFit(spot)) {
							return true;
						}
					}
				}

				if (!moved) {
					break;
				}
			}
		} catch (repackError) {
			this.log("repack: " + repackError);

			if (me.itemoncursor) {
				me.cancel();
			}
		}

		return Storage.Inventory.CanFit(spot);
	},

	// STASH FOR ROOM (the user, 2026-11-14: "might need to drop some stuff in stash to accomplish the task"). When rearranging the pack was not enough, the
	// next town visit puts the charms in the stash, the biggest first, until the item fits. Their names are written to data/<char>.roomstash.json
	// (item ids change from game to game) and restoreStashed() takes them back once the quest item has done its work. The Horadric Cube's own
	// 7x4 space is NOT used: whatever sits in it when the bot transmutes is part of the recipe.
	wantRoom: null, // {sizex, sizey}: set by makeRoom around its town visit

	roomFile: function () {
		return "data/" + me.name + ".roomstash.json";
	},

	stashedNames: function () {
		try {
			if (FileTools.exists(this.roomFile())) {
				return JSON.parse(FileTools.readText(this.roomFile())) || [];
			}
		} catch (readError) {
			this.log("cannot read " + this.roomFile() + ": " + readError);
		}

		return [];
	},

	stashForRoom: function () {
		var spot = this.wantRoom, items, i, names;

		this.wantRoom = null;

		if (!spot || !me.inTown || Storage.Inventory.CanFit(spot)) {
			return false;
		}

		items = (me.getItems() || []).filter(function (it) {
			return it.mode === 0 && it.location === 3 && [82, 83, 84].indexOf(it.itemType) > -1; // small, large and grand charms
		});
		items.sort(function (a, b) {
			return b.sizex * b.sizey - a.sizex * a.sizey;
		});

		if (!items.length || !Town.openStash()) {
			return false;
		}

		names = this.stashedNames();

		for (i = 0; i < items.length; i += 1) {
			this.log("putting the " + items[i].name + " in the stash to make room for a " + spot.sizex + "x" + spot.sizey + " quest item");

			if (Storage.Stash.MoveTo(items[i])) {
				names.push(items[i].name);

				try { FileTools.writeText(this.roomFile(), JSON.stringify(names)); } catch (writeError) { this.log("cannot write " + this.roomFile() + ": " + writeError); }
			}

			if (Storage.Inventory.CanFit(spot)) {
				break;
			}
		}

		me.cancel();

		return Storage.Inventory.CanFit(spot);
	},

	// Put what stashForRoom took back in the pack (in town, with room for it). Returns how many came back.
	restoreStashed: function () {
		var names = this.stashedNames(), items, i, k, back = 0, left = [];

		if (!names.length || !me.inTown || !Town.openStash()) {
			return 0;
		}

		items = (me.getItems() || []).filter(function (it) {
			return it.mode === 0 && it.location === 7;
		});

		for (i = 0; i < items.length; i += 1) {
			k = names.indexOf(items[i].name);

			if (k > -1 && Storage.Inventory.CanFit(items[i]) && Storage.Inventory.MoveTo(items[i])) {
				names.splice(k, 1);
				back += 1;
				this.log("took the " + items[i].name + " back out of the stash");
			}
		}

		left = names;

		try { FileTools.writeText(this.roomFile(), JSON.stringify(left)); } catch (writeError) { this.log("cannot write " + this.roomFile() + ": " + writeError); }

		me.cancel();

		return back;
	},

	// Make room for an item of w x h cells, whatever it takes: town chores first (junk is sold, keepers go to the stash), then drink the
	// spare health and mana potions, then drop what the bot would sell anyway, then (last resort) drink the rejuvenation potions. Quest items, tomes, keys, cube, cubing and runeword parts,
	// charms and anything the player owns are never touched. Returns true when the item fits.
	makeRoom: function (w, h) {
		var spot = {sizex: w, sizey: h}, n, item, pots, junk, i;

		if (Storage.Inventory.CanFit(spot)) {
			return true;
		}

		// 0. free cells that are scattered are not room: slide the items together first (nothing is sold, dropped or stashed)
		if (this.repack(spot)) {
			this.log("room made by moving the items together in the pack");

			return true;
		}

		this.log("the pack is full, making room for a " + w + "x" + h + " item");
		this.note("My pack is full. Making room for a quest item.");

		// 1. town chores (Town.doChores calls stashForRoom at its end when wantRoom is set)
		this.wantRoom = spot;
		try {
			if (me.inTown) {
				Town.doChores();
			} else {
				Town.visitTown();
			}
		} catch (townError) {
			this.log("town chores failed: " + townError);
		}

		this.wantRoom = null;

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

		var spotX = item.x, spotY = item.y, spotArea = me.area, fresh;

		this.makeRoom(item.sizex, item.sizey); // every quest item needs room, not only the consumables

		// a town visit in the middle of making room (chores, the stash) leaves the unit I hold stale, and the portal back comes out far from where the item
		// lies, out of sight (Xena, Travincal, 2026-11-14 10:21: "picking up the undefined"): walk back to the spot and look at the ground again
		fresh = getUnit(4, item.classid);

		if (!fresh && !me.inTown && me.area === spotArea && spotX !== undefined) {
			try {
				Pather.moveTo(spotX, spotY);
			} catch (backError) {
				this.log("cannot walk back to the item: " + backError);
			}

			fresh = getUnit(4, item.classid);
		}

		if (!fresh) {
			return "missing";
		}

		item = fresh;

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
