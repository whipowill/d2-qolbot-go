/**
*	@filename	Pickit.js
*	@author		kolton
*	@desc		handle item pickup
*/

include("common/Report.js");
include("common/QuestItems.js");

var Pickit = {
	gidList: [],
	beltSize: 1,
	ignoreLog: [4, 5, 6, 22, 41, 76, 77, 78, 79, 80, 81], // Ignored item types for item logging
	// Safe mode (Bots page): pick up nothing but consumables and quest items: gold, tomes, scrolls, missile potions, keys, potions,
	// and the quest items the bots keep (the item codes below are Quest.nip's list, the same as the "never throw away" list in Town.clearInventory)
	safeOnly: false,
	// A follower of a leader bot picks up nothing except the quest consumables (the Book of Skill, the Potion of Life, ...): every character has to
	// take and use its own, the leader cannot do it for them. Set by AutoSpec.apply for a bot that has plan.noPickup.
	questOnly: false,

	// A follower of a leader bot (questOnly) takes the quest consumables AND what GoldSell.nip lists: the followers make their own gold (the user,
	// 2026-11-13: the leader loots the keepers, the followers pursue the gold, everybody frees room for a quest item). A match in GoldSell.nip is result 4.
	sellItem: function (item) {
		try {
			return this.checkItem(item).result === 4;
		} catch (sellError) {
			return false;
		}
	},
	// A follower (questOnly) also takes what would be an upgrade for itself or its mercenary (the user, 2026-11-14: "seems like bots still aren't auto equiping
	// their merc weapons (or themselves) much at all"): before, only GoldSell.nip's rares got past questOnly, so a normal or magic bow for the Rogue, or a
	// better helm, was walked past. UNTESTED live.
	upgradeItem: function (item) {
		try {
			return Item.takeable(item) && (Item.autoEquipCheck(item) || Item.autoMercEquipCheck(item));
		} catch (upgradeError) {
			return false;
		}
	},
	safeKinds: [4, 18, 22, 38, 39, 41, 76, 77, 78, 79, 80, 81],
	safeQuestIds: [87, 89, 90, 91, 92, 173, 174, 521, 524, 525, 545, 546, 547, 548, 549, 551, 552, 553, 554, 555, 644, 646],
	safeQuestCodes: ["pk1", "pk2", "pk3", "dhn", "bey", "mbr", "toa", "tes", "ceh", "bet", "fed"],

	// May a bot in safe mode pick this up?
	safeKind: function (unit) {
		return this.safeKinds.indexOf(unit.itemType) > -1 || this.safeQuestIds.indexOf(unit.classid) > -1 || this.safeQuestCodes.indexOf(unit.code) > -1;
	},

	init: function (notify) {
		var i, filename;

		for (i = 0; i < Config.PickitFiles.length; i += 1) {
			filename = "pickit/" + Config.PickitFiles[i];

			NTIP.OpenFile(filename, notify);
		}

		this.beltSize = Storage.BeltSize();
	},

	// Returns:
	// -1 - Needs iding
	// 0 - Unwanted
	// 1 - NTIP wants
	// 2 - Cubing wants
	// 3 - Runeword wants
	// 4 - Pickup to sell (triggered when low on gold)
	checkItem: function (unit, is_include_tiered_items = false) {
		// A bot following a player never takes the Pandemonium keys (or the organs, token and essences): they are the player's
		if (Config.Leader && ["pk1", "pk2", "pk3", "dhn", "bey", "mbr", "toa", "tes", "ceh", "bet", "fed"].indexOf(unit.code) > -1) {
			return {
				result: 0,
				line: null
			};
		}

		// Wirt's Leg is only for the cow portal (the user, 2026-11-14: "they don't have to pick it up, only if they want to do cow level"): the Cows run
		// takes it itself (Cows.getLeg calls Pickit.pickItem directly), nobody picks it up otherwise (a follower must not take the leg from the leader)
		if (unit.classid === 88) {
			return {
				result: 0,
				line: null
			};
		}

		var rval = NTIP.CheckItem(unit, is_include_tiered_items ? false : NTIP_CheckListNoTier, true);
		//var rval = NTIP.CheckItem(unit, false, true);

		if ((unit.classid === 617 || unit.classid === 618) && Town.repairIngredientCheck(unit)) {
			return {
				result: 6,
				line: null
			};
		}

		if (CraftingSystem.checkItem(unit)) {
			return {
				result: 5,
				line: null
			};
		}

		if (Cubing.checkItem(unit)) {
			return {
				result: 2,
				line: null
			};
		}

		if (Runewords.checkItem(unit)) {
			return {
				result: 3,
				line: null
			};
		}

		// If total gold is less than 10k pick up anything worth 10 gold per
		// square to sell in town.
		// Qolbot: a match in GoldSell.nip (loaded only on a gold hunt, after every keep list) is picked up to be SOLD, never kept. Only gear a bot may sell
		// (Item.takeable: never a kind the Equipment tab protects, which would be picked up and then never sold, clogging the pack).
		if (rval.result === 1 && rval.line && String(rval.line).indexOf("GoldSell.nip") === 0) {
			return Item.takeable(unit) ? {result: 4, line: rval.line} : {result: 0, line: null};
		}

		// If total gold is less than 10k pick up anything worth 10 gold per
		// square to sell in town.
		if (rval.result === 0 && Town.ignoredItemTypes.indexOf(unit.itemType) === -1 && me.gold < Config.LowGold && unit.itemType !== 39) {
			// Gold doesn't take up room, just pick it up
			if (unit.classid === 523) {
				return {
					result: 4,
					line: null
				};
			}

			if (unit.getItemCost(1) / (unit.sizex * unit.sizey) >= 10) {
				return {
					result: 4,
					line: null
				};
			}
		}

		return rval;
	},

	pickItems: function () {
		var status, status_tiers, item, canFit, intoCube, cubeGid, cubeName, cubeSize, profit, gidNow, name, consumable,
			needMule = false,
			pickList = [];

		Town.clearBelt();

		if (me.dead) {
			return false;
		}

		while (!me.idle) {
			delay(40);
		}

		item = getUnit(4);

		if (item) {
			do {
				if ((item.mode === 3 || item.mode === 5) && !this.leaveForPlayer(item) && getDistance(me, item) <= Config.PickRange && (!this.questOnly || QuestItems.isConsumable(item) || QuestItems.isShared(item) || this.sellItem(item) || this.upgradeItem(item))) {
					pickList.push(copyUnit(item));
				}
			} while (item.getNext());
		}

		while (pickList.length > 0) {
			if (me.dead) {
				return false;
			}

			pickList.sort(this.sortItems);

			// Check if the item unit is still valid and if it's on ground or being dropped
			if (copyUnit(pickList[0]).x !== undefined && (pickList[0].mode === 3 || pickList[0].mode === 5) &&
					(Pather.useTeleport || me.inTown || !checkCollision(me, pickList[0], 0x1))) { // Don't pick items behind walls/obstacles when walking

				// Check if the item should be picked
				status = this.checkItem(pickList[0]);
				status_tiers = this.checkItem(pickList[0], true); // flag true to include tiered items too -whipowill

				// Qolbot: a protected kind is never identified, so "needs identifying" would never be settled: leave it where it is
				if (status.result === -1 && !pickList[0].getFlag(0x10) && !Item.isReplacable(pickList[0])) {
					status.result = 0;
				}

				// Items in a category the player protected (Settings tab, Equipment: unique, set, ...) are left for the player: a bot only
				// picks up a possible upgrade (to try on, or to sell if it is not one) outside those categories (Item.takeable).
				// if you can pick the item, and the item is keepable, or item is equipable...
				if (this.canPick(pickList[0]) && (status.result || ((status_tiers.result || Item.gearTier(pickList[0]) > 0) && Item.takeable(pickList[0]) && (Item.autoEquipCheck(pickList[0]) || Item.autoMercEquipCheck(pickList[0]))))) {
					intoCube = false;
					// Override canFit for scrolls, potions and gold
					canFit = Storage.Inventory.CanFit(pickList[0]) || [4, 22, 76, 77, 78].indexOf(pickList[0].itemType) > -1;

					// Try to make room with FieldID
					if (!canFit && Config.FieldID && Town.fieldID()) {
						canFit = Storage.Inventory.CanFit(pickList[0]) || [4, 22, 76, 77, 78].indexOf(pickList[0].itemType) > -1;
					}

					// A quest consumable is never left behind for want of room: make room (town chores, spare potions, junk) and look again
					if (!canFit && QuestItems.isConsumable(pickList[0]) && QuestItems.makeRoom(pickList[0].sizex, pickList[0].sizey)) {
						return this.pickItems();
					}

					// Qolbot: the cube first: a town trip for a full pack only once the cube is full too (Item.cubeForRoom)
					if (!canFit && Item.cubeForRoom(pickList[0])) {
						canFit = true;
					}

					// Qolbot: the cube takes the pickup itself when the pack has no room (Item.cursorToCube, after the pickup below)
					if (!canFit && Item.cubeTakesPickup(pickList[0])) {
						canFit = true;
						intoCube = true;
					}

					// Try to make room by selling items in town
					if (!canFit) {
						// Check if any of the current inventory items can be stashed or need to be identified and eventually sold to make room
						if (this.canMakeRoom()) {
							print("ÿc7Trying to make room for " + this.itemColor(pickList[0]) + pickList[0].name);

							// Go to town and do town chores
							if (Town.visitTown()) {
								// Recursive check after going to town. We need to remake item list because gids can change.
								// Called only if room can be made so it shouldn't error out or block anything.
								// (no second Town.doChores() here: visitTown did the chores and is back in the field, and doChores in the field goes to town and stays:
								// live 13:36:34 Barabas went back through the portal, at once "Going back to town" again, and Terror's End looked for seal 392 in town)
								return this.pickItems();
							}

							// Town visit failed - abort
							print("ÿc7Not enough room for " + this.itemColor(pickList[0]) + pickList[0].name);
							Item.reportFull(pickList[0]); // the red box, when the cube is full too

							return false;
						}

						// Can't make room - trigger automule
						Misc.itemLogger("No room for", pickList[0]);
						print("ÿc7Not enough room for " + this.itemColor(pickList[0]) + pickList[0].name);
						Item.reportFull(pickList[0]); // the red box, when the cube is full too

						needMule = true;
					}

					// Item can fit - pick it up
					if (canFit) {
						cubeGid = pickList[0].gid;
						cubeName = pickList[0].name;
						cubeSize = {sizex: pickList[0].sizex, sizey: pickList[0].sizey};

						if (profit) {
							gidNow = pickList[0].gid;
							name = pickList[0].name;
							this.pickItem(pickList[0], 4, null);

							if (me.getItem(-1, -1, gidNow)) {
								Report.note("Pickit", "This might bring a little profit: " + name);
							}
						} else {
							consumable = QuestItems.isConsumable(pickList[0]);
							this.pickItem(pickList[0], status.result, status.line);

							if (consumable) {
								QuestItems.useAll(); // read it at once: a chicken before the next town visit must not take the points with it
							}
						}

						if (intoCube) {
							Item.cursorToCube(cubeGid, cubeName, cubeSize);
						}
					}
				}
			}

			pickList.shift();
		}

		// Quit current game and transfer the items to mule
		if (needMule && typeof AutoMule === "object" && AutoMule.getInfo() && AutoMule.getInfo().hasOwnProperty("muleInfo") && AutoMule.getMuleItems().length > 0) {
			scriptBroadcast("mule");
			scriptBroadcast("quit");
		}

		return true;
	},

	// Check if we can even free up the inventory
	pickedGids: {}, // items this bot picked up in this game (item ids are only good for one game)

	// Qolbot: WITH YOU LEADING ("I'm playing": the plan's partySync is off), a quest item (QuestItems.keep: the Gidbinn, the Horadric Malus, Khalim's parts ...)
	// is left on the ground for you unless another copy of it lies there too (the user, 2026-11-15: "if only one item drops, then I need to be the one to pick it
	// up for quest progression ... let's suppose the Gidbinn for example only drops one knife, i don't want the bots to pick it up bc i'm the one to do it").
	// One copy per player: each bot takes one while two or more are left, the last one is yours. Two bots that look at the same moment could both take
	// one; the leader bot of a bot-led run is not affected. UNTESTED in a game.
	leaveForPlayer: function (item) {
		var n = 0, u;

		try {
			if (QuestItems.keep.indexOf(item.classid) < 0 || typeof Plan !== "object" || !Plan.get() || Plan.get().partySync || (typeof Team === "object" && Team.isLeader())) {
				return false;
			}

			u = getUnit(4, item.classid);

			if (u) {
				do {
					if (u.mode === 3 || u.mode === 5) {
						n += 1;
					}
				} while (u.getNext());
			}

			return n < 2;
		} catch (e) {
			return false;
		}
	},

	canMakeRoom: function () {
		if (!Config.MakeRoom) {
			return false;
		}

		var i,
			items = Item.botItems();

		if (items) {
			for (i = 0; i < items.length; i += 1) {
				switch (this.checkItem(items[i]).result) {
				case -1: // Item needs to be identified
					// For low level chars that can't actually get id scrolls -> prevent an infinite loop
					if (me.getStat(14) + me.getStat(15) < 100) {
						return false;
					}

					return true;
				case 0: // Qolbot: junk is sold in town (an upgrade check that found nothing better), so a pack full of it is room that can be made
				case 4:
					if (Item.sellable(items[i]) && Item.isReplacable(items[i]) && Date.now() - (this.lastRoomTrip || 0) > 60000) { // at most one such trip a minute: no loop if the sale fails
						this.lastRoomTrip = Date.now();

						return true;
					}

					break;
				default: // Check if a kept item can be stashed
					if (Town.canStash(items[i]) || (Town.canStash(items[i], true) && Item.cubeRoom(items[i]))) {
						return true;
					}

					break;
				}
			}
		}

		return false;
	},

	pickItem: function (unit, status, keptLine) {
		if (this.safeOnly && !this.safeKind(unit)) { // safe mode
			return false;
		}

		if (this.questOnly && !QuestItems.isConsumable(unit) && !QuestItems.isShared(unit) && !this.sellItem(unit) && !this.upgradeItem(unit)) {
			return false;
		}

		function ItemStats(unit) {
			this.ilvl = unit.ilvl;
			this.type = unit.itemType;
			this.classid = unit.classid;
			this.name = unit.name;
			this.color = Pickit.itemColor(unit);
			this.gold = unit.getStat(14);
			this.useTk = Config.UseTelekinesis && me.classid === 1 && me.getSkill(43, 1) && (this.type === 4 || this.type === 22 || (this.type > 75 && this.type < 82)) &&
						getDistance(me, unit) > 5 && getDistance(me, unit) < 20 && !checkCollision(me, unit, 0x4);
			this.picked = false;
		}

		var i, item, tick, gid, stats,
			itemCount = me.itemcount;

		if (unit.gid) {
			gid = unit.gid;
			item = getUnit(4, -1, -1, gid);
		}

		if (!item) {
			return false;
		}

		stats = new ItemStats(item);

MainLoop:
		for (i = 0; i < 3; i += 1) {
			if (!getUnit(4, -1, -1, gid)) {
				break MainLoop;
			}

			if (me.dead) {
				return false;
			}

			while (!me.idle) {
				delay(40);
			}

			if (item.mode !== 3 && item.mode !== 5) {
				break MainLoop;
			}

			if (stats.useTk) {
				Skill.cast(43, 0, item);
			} else {
				if (getDistance(me, item) > (Config.FastPick === 2 && i < 1 ? 6 : 4) || checkCollision(me, item, 0x1)) {
					if (Pather.useTeleport) {
						Pather.moveToUnit(item);
					} else if (!Pather.moveTo(item.x, item.y, 0)) {
						continue MainLoop;
					}
				}

				if (Config.FastPick < 2) {
					Misc.click(0, 0, item);
				} else {
					sendPacket(1, 0x16, 4, 0x4, 4, item.gid, 4, 0);
				}
			}

			tick = getTickCount();

			while (getTickCount() - tick < 1000) {
				item = copyUnit(item);

				if (stats.classid === 523) {
					if (!item.getStat(14) || item.getStat(14) < stats.gold) {
						print("ÿc7Picked up " + stats.color + (item.getStat(14) ? (item.getStat(14) - stats.gold) : stats.gold) + " " + stats.name);

						return true;
					}
				}

				if (item.mode !== 3 && item.mode !== 5) {
					switch (stats.classid) {
					case 543: // Key
						print("ÿc7Picked up " + stats.color + stats.name + " ÿc7(" + Town.checkKeys() + "/12)");

						return true;
					case 529: // Scroll of Town Portal
					case 530: // Scroll of Identify
						print("ÿc7Picked up " + stats.color + stats.name + " ÿc7(" + Town.checkScrolls(stats.classid === 529 ? "tbk" : "ibk") + "/20)");

						return true;
					}

					break MainLoop;
				}

				delay(20);
			}

			// TK failed, disable it
			stats.useTk = false;

			//print("pick retry");
		}

		stats.picked = me.itemcount > itemCount || !!me.getItem(-1, -1, gid);

		if (stats.picked) {
			this.pickedGids[gid] = true; // Item.userOwned: a charm picked up here is the bot's, not yours

			try {
				Misc.notePicked(me.getItem(-1, -1, gid) || unit); // the audit record (Misc.auditTouch)
			} catch (noteError) {
				print("picked list: " + noteError);
			}

			if (Item.isCharm(unit) && me.getItem(-1, -1, gid)) {
				Item.rememberCharm(me.getItem(-1, -1, gid)); // and remembered for after a restart
			}
		}

		if (stats.picked) {
			DataFile.updateStats("lastArea");

			switch (status) {
			case 1:
				print("ÿc7Picked up " + stats.color + stats.name + " ÿc0(ilvl " + stats.ilvl + (keptLine ? ") (" + keptLine + ")" : ")"));

				if (this.ignoreLog.indexOf(stats.type) === -1) {
					Misc.itemLogger("Kept", item);

					if (["pk1", "pk2", "pk3"].indexOf(item.code) > -1 && !TorchSystem.LogKeys) {
						break;
					}

					if (["dhn", "bey", "mbr"].indexOf(item.code) > -1 && !TorchSystem.LogOrgans) {
						break;
					}

					Misc.logItem("Kept", item, keptLine);
				}

				break;
			case 2:
				print("ÿc7Picked up " + stats.color + stats.name + " ÿc0(ilvl " + stats.ilvl + ")" + " (Cubing)");
				Misc.itemLogger("Kept", item, "Cubing " + me.findItems(item.classid).length);
				Cubing.update();

				break;
			case 3:
				print("ÿc7Picked up " + stats.color + stats.name + " ÿc0(ilvl " + stats.ilvl + ")" + " (Runewords)");
				Misc.itemLogger("Kept", item, "Runewords");
				Runewords.update(stats.classid, gid);

				break;
			case 5: // Crafting System
				print("ÿc7Picked up " + stats.color + stats.name + " ÿc0(ilvl " + stats.ilvl + ")" + " (Crafting System)");
				CraftingSystem.update(item);

				break;
			default:
				print("ÿc7Picked up " + stats.color + stats.name + " ÿc0(ilvl " + stats.ilvl + (keptLine ? ") (" + keptLine + ")" : ")"));

				break;
			}
		}

		return true;
	},

	itemQualityToName: function (quality) {
		var qualNames = ["", "lowquality", "normal", "superior", "magic", "set", "rare", "unique", "crafted"];

		return qualNames[quality];
	},

	itemColor: function (unit, type) {
		if (type === undefined) {
			type = true;
		}

		if (type) {
			switch (unit.itemType) {
			case 4: // gold
				return "ÿc4";
			case 74: // runes
				return "ÿc8";
			case 76: // healing potions
				return "ÿc1";
			case 77: // mana potions
				return "ÿc3";
			case 78: // juvs
				return "ÿc;";
			}
		}

		switch (unit.quality) {
		case 4: // magic
			return "ÿc3";
		case 5: // set
			return "ÿc2";
		case 6: // rare
			return "ÿc9";
		case 7: // unique
			return "ÿc4";
		case 8: // crafted
			return "ÿc8";
		}

		return "ÿc0";
	},

	canPick: function (unit) {
		var tome, charm, i, potion, needPots, buffers, pottype, myKey, key;

		if (this.safeOnly && !this.safeKind(unit)) {
			return false;
		}

		if (this.questOnly && !QuestItems.isConsumable(unit) && !QuestItems.isShared(unit) && !this.sellItem(unit) && !this.upgradeItem(unit)) {
			return false;
		}

		switch (unit.classid) {
		case 92: // Staff of Kings
		case 173: // Khalim's Flail
		case 521: // Viper Amulet
		case 546: // Jade Figurine
		case 549: // Cube
		case 551: // Mephisto's Soulstone
		case 552: // Book of Skill
		case 553: // Khalim's Eye
		case 554: // Khalim's Heart
		case 555: // Khalim's Brain
			if (me.getItem(unit.classid)) {
				return false;
			}

			break;
		}

		switch (unit.itemType) {
		case 4: // Gold
			if (me.getStat(14) === me.getStat(12) * 10000) { // Check current gold vs max capacity (cLvl*10000)
				return false; // Skip gold if full
			}

			break;
		case 22: // Scroll
			tome = me.getItem(unit.classid - 11, 0); // 518 - Tome of Town Portal or 519 - Tome of Identify, mode 0 - inventory/stash

			if (tome) {
				do {
					if (tome.location === 3 && tome.getStat(70) === 20) { // In inventory, contains 20 scrolls
						return false; // Skip a scroll if its tome is full
					}
				} while (tome.getNext());
			} else {
				return false; // Don't pick scrolls if there's no tome
			}

			break;
		case 41: // Key (new 26.1.2013)
			if (me.classid === 6) { // Assassins don't ever need keys
				return false;
			}

			myKey = me.getItem(543, 0);
			key = getUnit(4, -1, -1, unit.gid); // Passed argument isn't an actual unit, we need to get it

			if (myKey && key) {
				do {
					if (myKey.location === 3 && myKey.getStat(70) + key.getStat(70) > 12) {
						return false;
					}
				} while (myKey.getNext());
			}

			break;
		case 82: // Small Charm
		case 83: // Large Charm
		case 84: // Grand Charm
			if (unit.quality === 7) { // Unique
				charm = me.getItem(unit.classid, 0);

				if (charm) {
					do {
						if (charm.quality === 7) {
							return false; // Skip Gheed's Fortune, Hellfire Torch or Annihilus if we already have one
						}
					} while (charm.getNext());
				}
			}

			break;
		case 76: // Healing Potion
		case 77: // Mana Potion
		case 78: // Rejuvenation Potion
			needPots = 0;

			for (i = 0; i < 4; i += 1) {
				if (typeof unit.code === "string" && unit.code.indexOf(Config.BeltColumn[i]) > -1) {
					needPots += this.beltSize;
				}
			}

			potion = me.getItem(-1, 2);

			if (potion) {
				do {
					if (potion.itemType === unit.itemType) {
						needPots -= 1;
					}
				} while (potion.getNext());
			}

			if (needPots < 1 && this.checkBelt()) {
				buffers = ["HPBuffer", "MPBuffer", "RejuvBuffer"];

				for (i = 0; i < buffers.length; i += 1) {
					if (Config[buffers[i]]) {
						switch (buffers[i]) {
						case "HPBuffer":
							pottype = 76;

							break;
						case "MPBuffer":
							pottype = 77;

							break;
						case "RejuvBuffer":
							pottype = 78;

							break;
						}

						if (unit.itemType === pottype) {
							if (!Storage.Inventory.CanFit(unit)) {
								return false;
							}

							needPots = Config[buffers[i]];
							potion = me.getItem(-1, 0);

							if (potion) {
								do {
									if (potion.itemType === pottype && potion.location === 3) {
										needPots -= 1;
									}
								} while (potion.getNext());
							}
						}
					}
				}
			}

			if (needPots < 1) {
				potion = me.getItem();

				if (potion) {
					do {
						if (potion.itemType === unit.itemType && ((potion.mode === 0 && potion.location === 3) || potion.mode === 2)) {
							if (potion.classid < unit.classid) {
								potion.interact();
								needPots += 1;

								break;
							}
						}
					} while (potion.getNext());
				}
			}

			if (needPots < 1) {
				return false;
			}

			break;
		case undefined: // Yes, it does happen
			print("undefined item (!?)");

			return false;
		}

		return true;
	},

	checkBelt: function () {
		var check = 0,
			item = me.getItem(-1, 2);

		if (item) {
			do {
				if (item.x < 4) {
					check += 1;
				}
			} while (item.getNext());
		}

		return check === 4;
	},

	// Just sort by distance for general item pickup
	sortItems: function (unitA, unitB) {
		return getDistance(me, unitA) - getDistance(me, unitB);
	},

	// Prioritize runes and unique items for fast pick
	sortFastPickItems: function (unitA, unitB) {
		if (unitA.itemType === 74 || unitA.quality === 7) {
			return -1;
		}

		if (unitB.itemType === 74 || unitB.quality === 7) {
			return 1;
		}

		return getDistance(me, unitA) - getDistance(me, unitB);
	},

	fastPick: function () {
		var item, gid, status,
			itemList = [];

		while (this.gidList.length > 0) {
			gid = this.gidList.shift();
			item = getUnit(4, -1, -1, gid);

			if (item && (item.mode === 3 || item.mode === 5) && !this.leaveForPlayer(item) && Town.ignoredItemTypes.indexOf(item.itemType) === -1 && getDistance(me, item) <= Config.PickRange && (!this.questOnly || QuestItems.isConsumable(item) || QuestItems.isShared(item) || this.sellItem(item) || this.upgradeItem(item))) {
				itemList.push(copyUnit(item));
			}
		}

		while (itemList.length > 0) {
			itemList.sort(this.sortFastPickItems);

			item = copyUnit(itemList.shift());

			// Check if the item unit is still valid
			if (item.x !== undefined) {
				status = this.checkItem(item);
				if (status.result === -1 && !item.getFlag(0x10) && !Item.isReplacable(item)) { // protected kinds are never identified
					status.result = 0;
				}

				if (status.result && this.canPick(item) && (Storage.Inventory.CanFit(item) || [4, 22, 76, 77, 78].indexOf(item.itemType) > -1)) {
					this.pickItem(item, status.result, status.line);
				}
			}
		}

		return true;
	}
};