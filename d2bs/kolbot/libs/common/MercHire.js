/**
*	@filename	MercHire.js
*	@desc		The merc the player chose on the bot card (Config.MercChoice, "a2-def" and so on; "" keeps the one it has). First thing in a game
*	            (default.dbj, next to Auto Respec), a bot whose merc is of another kind goes to the merc seller of that act and replaces it.
*
*	            STEP 2 (2026-11-14, UNTESTED in a game): the hire list is read, each entry's kind worked out the way the game does it (rollKind), the
*	            first of the chosen kind hired, its kind checked by its skills, and the old merc's dropped gear picked up and put on.
*
*	            The kinds are those of the player's own game (Config.MercKinds): Qolbot reads its Data/global/excel/Hireling.txt and Skills.txt, or
*	            uses the 1.13d mercs when the game has no Hireling.txt (cmd/qolbot/mercs.go). Each kind has, per difficulty, a skill no other kind of
*	            its act has (tell); an act with one kind has none.
*/

include("common/Report.js");

var MercHire = {
	done: false, // tried this game

	// the chosen kind's entry of Config.MercKinds, or null
	kind: function (id) {
		var i, kinds = Config.MercKinds || [];

		for (i = 0; i < kinds.length; i += 1) {
			if (kinds[i].id === id) {
				return kinds[i];
			}
		}

		return null;
	},

	// Does the merc have the skill? (D2BS: getSkill on the merc unit; any error counts as no)
	hasSkill: function (merc, skill) {
		try {
			return !!merc.getSkill(skill, 1);
		} catch (e) {
			return false;
		}
	},

	// The kind of the current merc ("" when there is none or it is not one of the kinds): its class and, when its act sells more than one kind,
	// the tell skill of this difficulty
	current: function () {
		var merc = me.getMerc(), kinds = Config.MercKinds || [], i, k, tell;

		if (!merc) {
			return "";
		}

		for (i = 0; i < kinds.length; i += 1) {
			k = kinds[i];
			tell = k.tell ? k.tell[me.diff] : 0;

			if (k.classids.indexOf(merc.classid) > -1 && (!tell || this.hasSkill(merc, tell))) {
				return k.id;
			}
		}

		return "";
	},

	// what is known of the current merc, for the log
	describe: function () {
		var merc = me.getMerc(), has = [], kinds = Config.MercKinds || [], i, tell;

		if (!merc) {
			return "no merc";
		}

		for (i = 0; i < kinds.length; i += 1) {
			tell = kinds[i].tell ? kinds[i].tell[me.diff] : 0;

			if (tell && has.indexOf(tell) === -1 && this.hasSkill(merc, tell)) {
				has.push(tell);
			}
		}

		return merc.name + " (class " + merc.classid + ", level " + merc.charlvl + ", tell skills it has: " + (has.join(",") || "none") + ")";
	},

	// One piece of the old merc's gear from the ground (the user, 2026-11-14): picked up onto the cursor and put straight on the new merc, so no
	// inventory room is needed; a piece the new merc cannot wear (another kind of weapon, too high a requirement) goes to the inventory, or the stash.
	// Returns "worn", "stored" or "left".
	moveGear: function (item) {
		var gid = item.gid, name = item.name, classid = item.classid, locs, j, tick, cursor;

		for (j = 0; j < 3 && !(getCursorType() === 3 && getUnit(100) && getUnit(100).gid === gid); j += 1) {
			if (getDistance(me, item) > 4) {
				Pather.moveTo(item.x, item.y, 0);
			}

			// C->S 0x16 pick up: unit type 4, gid, then 1 = onto the cursor (0 = into the inventory, as Pickit does). UNTESTED: if the item does not
			// come to the cursor, Pickit.pickItem below takes it to the inventory instead.
			sendPacket(1, 0x16, 4, 4, 4, gid, 4, 1);

			for (tick = getTickCount(); getTickCount() - tick < 1500 && !(getCursorType() === 3 && getUnit(100) && getUnit(100).gid === gid); ) {
				delay(50);
			}
		}

		cursor = getUnit(100);

		if (!cursor || cursor.gid !== gid) {
			print("MercHire: " + name + " did not come to my cursor: picking it up into my inventory");
			Pickit.pickItem(item, 1, "the old merc's gear");

			return me.getItem(-1, -1, gid) ? "stored" : "left";
		}

		locs = Item.canMercEquip(cursor) ? Item.getBodyLoc(cursor) : false;

		for (j = 0; locs && j < locs.length; j += 1) {
			if (this.mercSlotUsed(locs[j])) {
				continue; // a ring slot the new merc already filled
			}

			clickItem(4, locs[j]);

			// the item gets a NEW gid on the merc (live 17:58:24: Liaza wore the Cap and the Breast Plate as gids 102 and 103, and both were counted
			// "left on the ground"): worn = the slot holds an item of this classid and the cursor is empty
			for (tick = getTickCount(); getTickCount() - tick < 3000 && !this.slotHolds(locs[j], classid); ) {
				delay(100);
			}

			if (this.slotHolds(locs[j], classid) && getCursorType() !== 3) {
				print("Equipped " + name + " on the mercenary");

				try { Misc.logItem("Merc Equipped", Item.wornIn(me.getMerc(), locs[j], classid)); } catch (logError) { print("MercHire: item log: " + logError); }

				return "worn";
			}

			cursor = getUnit(100);

			if (!cursor || cursor.gid !== gid) {
				break;
			}
		}

		cursor = getUnit(100);

		if (cursor && cursor.gid === gid) {
			print("MercHire: my new merc cannot wear " + name + ": storing it");

			if (Item.putAway(cursor)) {
				return "stored";
			}

			print("MercHire: no room for " + name + ": dropped");
			cursor.drop();

			return "left";
		}

		return me.getItem(-1, -1, gid) ? "stored" : "left";
	},

	// does the merc wear an item of this classid in the slot?
	slotHolds: function (loc, classid) {
		var merc = me.getMerc(), it = merc ? merc.getItem() : null;

		if (it) {
			do {
				if (it.mode === 1 && it.bodylocation === loc && it.classid === classid) {
					return true;
				}
			} while (it.getNext());
		}

		return false;
	},

	// Take off everything the merc wears (a game without the QOL drop_items): each piece to the cursor (a click on the merc's slot with an empty
	// cursor, as Item.mercEquip does to swap) and put away. False when a piece has no room: it goes back on and nothing more is taken off.
	stripMerc: function () {
		var locs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], j, tick, cursor, name;

		for (j = 0; j < locs.length; j += 1) {
			if (!this.mercSlotUsed(locs[j])) {
				continue;
			}

			clickItem(4, locs[j]);

			for (tick = getTickCount(); getTickCount() - tick < 3000 && getCursorType() !== 3; ) {
				delay(100);
			}

			cursor = getUnit(100);

			if (!cursor) {
				print("MercHire: could not take off my merc's item in slot " + locs[j]);

				return false;
			}

			name = cursor.name;

			if (!Item.putAway(cursor)) {
				print("MercHire: no room for my merc's " + name + ": putting it back on");
				clickItem(4, locs[j]);
				delay(500);

				return false;
			}

			print("MercHire: took " + name + " off my merc (kept for the new one)");
		}

		return true;
	},

	// does the merc wear something in the slot?
	mercSlotUsed: function (loc) {
		var merc = me.getMerc(), it = merc ? merc.getItem() : null;

		if (it) {
			do {
				if (it.mode === 1 && it.bodylocation === loc) {
					return true;
				}
			} while (it.getNext());
		}

		return false;
	},

	hex: function (bytes) {
		var out = [], i;

		for (i = 0; i < bytes.length; i += 1) {
			out.push((bytes[i] < 16 ? "0" : "") + bytes[i].toString(16));
		}

		return out.join(" ");
	},

	// The kind the game gives a hire list entry (D2MOO, MONSTERS_HirelingInit): a seed state low = the entry's id, high = 666; ONE roll
	// (state = high + 0x6AC690C5 * low, 64 bits); the candidate (Config.MercCandidates, "act-difficulty", from the game's Hireling.txt) is
	// roll & (n - 1) when n is a power of two, else (low 32 bits of the roll) % n. Only the low 32 bits are needed, computed in 16-bit halves.
	rollKind: function (id, act) {
		var c = (Config.MercCandidates || {})[act + "-" + me.diff], m = 0x6AC690C5, lo, hi, roll;

		if (!c || !c.length) {
			return "";
		}

		lo = ((id & 0xFFFF) * m) % 4294967296;
		hi = (((id >>> 16) * m) % 65536) * 65536;
		roll = (lo + hi + 666) % 4294967296;

		return c[(c.length & (c.length - 1)) === 0 ? roll & (c.length - 1) : roll % c.length];
	},

	// First thing in a game: is the merc the chosen kind? If not, go to that act's merc seller, read the hire list (server packets: "4f" clears
	// it, then one "4e" per merc: 2-byte name string id, 4-byte id), work out each entry's kind (rollKind), hire the first of the chosen kind
	// (C->S 0x36: seller gid, merc name id), check the new merc's kind by its skills, pick up the gear the old one dropped (QOL drop_items=1) and put it on.
	// A hire whose kind turns out wrong is logged and nothing more is hired this game. UNTESTED live (the derivation is from D2MOO, the 1.10 code).
	// Qolbot: a merc hire runs as a chore trip (Team.chore): the trip to the act of the merc needs nobody's permission, and it comes back to the act it left (preAct)
	maybe: function () {
		var self = this;

		return typeof Team === "object" && Team.chore ? Team.chore(function () { return self.maybeRun(); }) : this.maybeRun();
	},

	maybeRun: function () {
		var want = Config.MercChoice, kind, have, preAct = me.act, npc, list = [], seen = {}, listener, tick, i, name, pick = null, oldMerc,
			oldGid, merc, gold, items, item, oldGear, near, result, done = {worn: 0, stored: 0, left: 0}, before = {};

		if (!want || !me.inTown || this.done) {
			return false;
		}

		this.done = true; // once per game

		kind = this.kind(want);

		if (!kind) {
			print("MercHire: unknown merc choice " + want);

			return false;
		}

		// A DEAD merc reads as "no merc" (me.getMerc() is null; so it is for a moment after a portal): revive it first, it may wear the bot's gear.
		// Live 19:31 on Nightmare: Xena's Kyoko (wearing the Plate Mail she gave him) had died; "I have no merc", and a new one was hired for 7800 gold.
		for (i = 0; i < 5 && !me.getMerc(); i += 1) {
			delay(200);
		}

		if (!me.getMerc() && me.mercrevivecost > 0) {
			print("MercHire: my merc is dead: reviving it first (" + me.mercrevivecost + " gold)");

			try {
				Town.reviveMerc();
			} catch (reviveError) {
				print("MercHire: revive: " + reviveError);
			}

			if (!me.getMerc()) {
				print("MercHire: could not revive my merc: not hiring this game (its gear would be lost)");

				return false;
			}
		}

		have = this.current();
		print("MercHire: chosen " + kind.label + "; I have " + this.describe() + (have ? " = " + this.kind(have).label : ""));

		if (have === want) {
			return true;
		}

		if (!Pather.accessToAct(kind.act)) {
			print("MercHire: act " + kind.act + " is not open for me yet: keeping my merc");

			return false;
		}

		oldMerc = me.getMerc();

		if (me.itemoncursor) {
			print("MercHire: something is on my cursor (the old merc's gear needs it empty): not hiring now");

			return false;
		}

		// take everything off the old merc first (into my inventory, or the stash); autoMercEquip puts it on the new merc after the hire. A piece
		// with no room goes back on and the merc is kept. Always done, with qol.dll's drop_items too (the user, 2026-11-14: "always the non-qol.dll
		// method"): the drop left the gear on the ground where the bot did not find it (live 20:03:09, Sankt). The ground pickup below stays as a
		// backstop for anything still worn at the hire.
		if (oldMerc && oldMerc.getItem() && !this.stripMerc()) {
			print("MercHire: no room for my merc's gear (this game destroys it on a new hire): keeping my merc");

			return false;
		}

		oldGid = oldMerc ? oldMerc.gid : -1;

		// the old merc's gear: what it wore, by gid (dropped at my feet on the hire with QOL drop_items, the gids kept)
		oldGear = [];

		if (oldMerc) {
			item = oldMerc.getItem();

			if (item) {
				do {
					oldGear.push(item.gid);
				} while (item.getNext());
			}
		}

		listener = function (bytes) {
			var id;

			if (bytes && bytes[0] === 0x4E && bytes.length >= 7) {
				id = (bytes[3] | (bytes[4] << 8) | (bytes[5] << 16) | (bytes[6] << 24)) >>> 0;

				if (!seen[id]) {
					seen[id] = true;
					list.push({nameId: bytes[1] | (bytes[2] << 8), id: id});
				}
			}

			return false; // never block a packet
		};

		try {
			Town.goToTown(kind.act);
			name = Town.tasks[kind.act - 1].Merc;
			Town.move(name);
			npc = getUnit(1, name);

			if (!npc) {
				print("MercHire: " + name + " not found in town");

				return false;
			}

			addEventListener("gamepacket", listener);

			for (i = 0; i < 3 && !getUIFlag(0x08); i += 1) {
				npc.openMenu();
				delay(500);
			}

			Misc.useMenu(0x0D45); // Hire

			for (tick = getTickCount(); getTickCount() - tick < 3000; ) {
				delay(100);
			}

			for (i = 0; i < list.length; i += 1) {
				list[i].kind = this.rollKind(list[i].id, kind.act);
				list[i].name = getLocaleString(list[i].nameId) || ("name " + list[i].nameId);

				if (!pick && list[i].kind === want) {
					pick = list[i];
				}
			}

			print("MercHire: " + name + "'s hire list: " + list.map(function (e) { return e.name + " = " + (e.kind || "?"); }).join(", "));

			if (!pick) {
				print("MercHire: no " + kind.label + " on the list this game: keeping my merc");

				return false;
			}

			gold = me.gold + me.getStat(15);
			print("MercHire: hiring " + pick.name + " (" + pick.kind + "), gold " + gold);

			// what already lies on the ground here, so the old merc's dropped gear can be told apart from it (live 20:03:09: Sankt's act 1 merc,
			// replaced in Lut Gholein, dropped gear that was neither at the old gids nor within 8 yards half a second later, and it was lost)
			item = getUnit(4, -1, 3);

			if (item) {
				do {
					before[item.gid] = true;
				} while (item.getNext());
			}

			// C->S 0x36 (D2MOO, SUnitNpc.cpp D2GAME_NPC_HireMerc): the seller's gid, then the merc's NAME id (the server finds the roster entry by
			// it); the 4-byte id of the list is the entry's seed (dwSeed, what MONSTERS_HirelingInit rolls the kind from). The seller must be the
			// unit I am talking to. Live 17:42:49: the seed sent here instead did nothing.
			sendPacket(1, 0x36, 4, npc.gid, 4, pick.nameId);

			for (tick = getTickCount(); getTickCount() - tick < 5000; ) {
				delay(200);
				merc = me.getMerc();

				if (merc && merc.gid !== oldGid) {
					break;
				}
			}
		} catch (hireError) {
			print("MercHire: " + hireError);
		} finally {
			removeEventListener("gamepacket", listener);
			me.cancel();
			delay(300);
			me.cancel();
		}

		merc = me.getMerc();

		if (pick && merc && merc.gid !== oldGid) {
			// the gold update comes a moment after the merc (18:02:30 and 18:04:15 said "for 0 gold")
			for (tick = getTickCount(); getTickCount() - tick < 3000 && me.gold + me.getStat(15) === gold; ) {
				delay(100);
			}

			have = this.current();
			print("Hired merc " + merc.name + ": " + (have || "unknown") + " for " + (gold - me.gold - me.getStat(15)) + " gold"); // the Activity entry (cmd/qolbot activity.go)
			print("MercHire: hired " + merc.name + " for " + (gold - me.gold - me.getStat(15)) + " gold; it is " + this.describe() + " -> " +
				(have === want ? "the chosen kind (the derivation was right)" : "NOT the chosen kind (" + (have || "unknown") + "): the derivation is wrong, nothing more hired"));

			// the old merc's gear on the ground at my feet (QOL drop_items=1): each piece onto the cursor and onto the new merc (moveGear)
			if (oldGear.length && Config.MercDropOnHire) {
				// wait up to 4 s for the drop: by the old gids, else anything new on the ground within 40 yards (the old merc may stand away from
				// me, and the drop may come late, e.g. after a waypoint to another act)
				for (tick = getTickCount(); ; ) {
					delay(250);
					item = getUnit(4, -1, 3);
					items = [];
					near = [];

					if (item) {
						do {
							if (oldGear.indexOf(item.gid) > -1) {
								items.push(copyUnit(item));
							} else if (!before[item.gid] && getDistance(me, item) < 40) {
								near.push(copyUnit(item));
							}
						} while (item.getNext());
					}

					if (!items.length) {
						items = near;
					}

					if (items.length >= oldGear.length || getTickCount() - tick > 4000) {
						break;
					}
				}

				print("MercHire: the old merc wore " + oldGear.length + " item(s); found " + items.length + " on the ground");

				for (i = 0; i < items.length; i += 1) {
					try {
						result = this.moveGear(items[i]);
					} catch (moveError) {
						print("MercHire: " + items[i].name + ": " + moveError);
						result = "left";
					}

					done[result] += 1;

					if (result === "left") {
						print("MercHire: " + items[i].name + " is still on the ground");
					}
				}

				print("MercHire: the old merc's " + items.length + " item(s): " + done.worn + " put on the new merc, " + done.stored + " stored, " + done.left + " left on the ground");
			}

			try { Item.autoMercEquip(); } catch (equipError) { print("MercHire: equip: " + equipError); }
		} else if (pick) {
			print("MercHire: the hire did not happen (gold " + me.gold + ")");
		}

		try {
			if (me.act !== preAct) {
				Town.goToTown(preAct);
			}
		} catch (backError) {
			print("MercHire: back to act " + preAct + ": " + backError);
		}

		return !!pick;
	}
};
