/**
*	@filename	Layout.js
*	@desc		The bot's pack has a fixed layout (Behavior > Inventory Layout): the Horadric Cube in the top left corner, the two tomes (town portal,
*	            identify) beneath it, the keys to the right of the cube. Town.doChores calls Layout.apply(): when one of them is somewhere else it
*	            moves what stands in the way to a free cell and puts the item where it belongs. Nothing here can stop a bot: any problem is printed
*	            and the pack is left as it is.
*
*	            (column, row), the cube being 2 wide and 2 high in the pack:
*	                 0 1 2 3 ...
*	              0  C C K .
*	              1  C C . .
*	              2  T I . .      T = Tome of Town Portal, I = Tome of Identify (both 1 wide, 2 high)
*	              3  T I . .
*/

include("common/Report.js");

var Layout = {
	// the codes of the items that have a place: cube, town portal tome, identify tome, keys
	items: [["cube", 549], ["tp", 518], ["id", 519], ["key", 543]],

	// Where each one goes. The cube's real size is used when the bot has it (2x2 in the pack); until then the places of the others are worked
	// out for a 2x2 cube.
	spots: function () {
		var cube = me.findItem(549, 0, 3), cw = cube ? cube.sizex : 2, ch = cube ? cube.sizey : 2;

		return {
			cube: {x: 0, y: 0, w: cw, h: ch},
			tp: {x: 0, y: ch, w: 1, h: 2},
			id: {x: 1, y: ch, w: 1, h: 2},
			key: {x: cw, y: 0, w: 1, h: 1}
		};
	},

	// the items in the inventory proper (location 3, not on the cursor or the ground)
	packItems: function () {
		var list = me.getItems() || [];

		return list.filter(function (it) { return it.location === 3 && it.mode === 0; });
	},

	overlaps: function (it, x, y, w, h) {
		return it.x < x + w && it.x + it.sizex > x && it.y < y + h && it.y + it.sizey > y;
	},

	// the first free place for something w x h: not on an item that stays (everything but `skip`), not on a place of the layout
	findFree: function (w, h, skip, spots) {
		var x, y, i, k, ok, items = this.packItems(), names = Object.keys(spots),
			W = Storage.Inventory.width, H = Storage.Inventory.height;

		for (y = 0; y + h <= H; y += 1) {
			for (x = 0; x + w <= W; x += 1) {
				ok = true;

				for (i = 0; i < items.length && ok; i += 1) {
					if (items[i].gid !== skip && this.overlaps(items[i], x, y, w, h)) {
						ok = false;
					}
				}

				for (k = 0; k < names.length && ok; k += 1) {
					if (x < spots[names[k]].x + spots[names[k]].w && x + w > spots[names[k]].x && y < spots[names[k]].y + spots[names[k]].h && y + h > spots[names[k]].y) {
						ok = false;
					}
				}

				if (ok) {
					return {x: x, y: y};
				}
			}
		}

		return null;
	},

	// put an item on the cell (x, y) of the pack and wait until the game says it is there
	moveTo: function (item, x, y) {
		var n, tick;

		if (me.itemoncursor && item.mode !== 4) {
			return false;
		}

		item.toCursor();

		for (n = 0; n < 5; n += 1) {
			clickItem(0, x, y, 3);
			tick = getTickCount();

			while (getTickCount() - tick < Math.max(1000, me.ping * 3 + 500)) {
				if (!me.itemoncursor) {
					delay(200);

					return true;
				}

				delay(10);
			}
		}

		return !me.itemoncursor;
	},

	// put an item into the stash (town only); true when it is there
	toStash: function (item) {
		var done = false;

		try {
			if (Town.openStash() && Storage.Stash.CanFit(item)) {
				done = !!Storage.Stash.MoveTo(item);
				Storage.Reload();
			}

			me.cancel();
		} catch (stashError) {
			print("Layout: cannot stash " + item.name + ": " + stashError);
		}

		return done;
	},

	// Put the cube, the tomes and the keys where they belong. Returns how many items it moved.
	apply: function () {
		var spots, i, k, moved = 0, item, spec, others, spot, name, code, W, H;

		if (!Config.InventoryLayout || !me.gameReady || me.dead) {
			return 0;
		}

		try {
			spots = this.spots();
			W = Storage.Inventory.width;
			H = Storage.Inventory.height;

			for (name in spots) {
				if (spots.hasOwnProperty(name) && (spots[name].x + spots[name].w > W || spots[name].y + spots[name].h > H)) {
					print("Layout: the pack (" + W + "x" + H + ") is too small for the layout, leaving it alone.");

					return 0;
				}
			}

			for (i = 0; i < this.items.length; i += 1) {
				name = this.items[i][0];
				code = this.items[i][1];
				item = me.findItem(code, 0, 3);
				spec = spots[name];

				if (!item || (item.x === spec.x && item.y === spec.y)) {
					continue;
				}

				// whatever stands on the place goes to a free cell elsewhere first
				others = this.packItems().filter(function (it) {
					return it.gid !== item.gid && Layout.overlaps(it, spec.x, spec.y, item.sizex, item.sizey);
				});

				for (k = 0; k < others.length; k += 1) {
					spot = this.findFree(others[k].sizex, others[k].sizey, others[k].gid, spots);

					// a full pack: in town the item that is in the way can wait in the stash (it stays with the character)
					if (!spot && me.inTown && this.toStash(others[k])) {
						moved += 1;

						continue;
					}

					if (!spot || !this.moveTo(others[k], spot.x, spot.y)) {
						Report.note("Layout", "No room to make way for the " + item.name + " (" + others[k].name + " is in the way).");

						return moved;
					}

					moved += 1;
				}

				if (this.moveTo(item, spec.x, spec.y)) {
					moved += 1;
					print("Layout: " + item.name + " is at " + spec.x + "," + spec.y + " now.");
				} else {
					print("Layout: could not move " + item.name + " to " + spec.x + "," + spec.y);
				}
			}
		} catch (layoutError) {
			print("Layout: " + layoutError);
		}

		return moved;
	},

	// The first free place for something w x h, by COLUMNS from the left (the left column top to bottom, then the next): not on another item, not on a place
	// of the layout. Null when there is none.
	findLeft: function (w, h, skip, spots) {
		var x, y, i, k, ok, items = this.packItems(), names = Object.keys(spots),
			W = Storage.Inventory.width, H = Storage.Inventory.height;

		for (x = 0; x + w <= W; x += 1) {
			for (y = 0; y + h <= H; y += 1) {
				ok = true;

				for (i = 0; i < items.length && ok; i += 1) {
					if (items[i].gid !== skip && this.overlaps(items[i], x, y, w, h)) {
						ok = false;
					}
				}

				for (k = 0; k < names.length && ok; k += 1) {
					if (x < spots[names[k]].x + spots[names[k]].w && x + w > spots[names[k]].x && y < spots[names[k]].y + spots[names[k]].h && y + h > spots[names[k]].y) {
						ok = false;
					}
				}

				if (ok) {
					return {x: x, y: y};
				}
			}
		}

		return null;
	},

	// TIDY (the user, 2026-11-14: "make the inventory tidy a default step in town chores -- where they move over to the left everything that they won't be
	// selling or stashing"). The last town chore, after selling and stashing, so what is left in the pack is what the bot keeps: every item moves to the
	// leftmost free place (by columns), the cube, the tomes and the keys keep their layout places, and the free cells end up together on the right, room for
	// what the next trip picks up (a big quest item or a 2x4 armor). The rightmost items move first; passes repeat until nothing moves. Every cell of the
	// pack is the bot's (Pack.lockMatrix): moving an item does not change whether it is kept or sold. Returns how many items it moved.
	tidy: function () {
		var spots = {}, fixed = [], pass, i, items, item, spot, moved = 0, name, from;

		if (!me.inTown || !me.gameReady || me.dead || me.itemoncursor) {
			return 0;
		}

		try {
			if (Config.InventoryLayout) { // the layout's items stay on their places, and nothing else goes there
				spots = this.spots();

				for (i = 0; i < this.items.length; i += 1) {
					fixed.push(this.items[i][1]);
				}
			}

			for (pass = 0; pass < 4; pass += 1) {
				items = this.packItems().filter(function (it) {
					return fixed.indexOf(it.classid) === -1;
				});
				items.sort(function (a, b) {
					return (b.x - a.x) || (b.y - a.y);
				});

				name = moved;

				for (i = 0; i < items.length; i += 1) {
					item = items[i];
					spot = this.findLeft(item.sizex, item.sizey, item.gid, spots);

					if (spot && (spot.x < item.x || (spot.x === item.x && spot.y < item.y))) {
						from = item.x + "," + item.y;

						if (this.moveTo(item, spot.x, spot.y)) {
							moved += 1;
							print("Layout: tidy: " + item.name + " " + from + " -> " + spot.x + "," + spot.y); // which items move on every trip (live 12:52: 4-8 moves per bot each visit)
						} else {
							if (me.itemoncursor) { // could not put it down there: back where it was
								clickItem(0, item.x, item.y, 3);
								delay(300);
							}

							print("Layout: tidy: could not move " + item.name + " to " + spot.x + "," + spot.y);

							return moved;
						}
					}
				}

				if (moved === name) {
					break;
				}
			}

			if (moved) {
				print("Layout: tidied the pack (" + moved + " move(s) to the left).");
			}
		} catch (tidyError) {
			print("Layout: tidy: " + tidyError);
		}

		if (me.itemoncursor) {
			me.cancel();
		}

		return moved;
	}
};
