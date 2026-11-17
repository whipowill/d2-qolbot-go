/**
*	@filename	Misc.js
*	@author		kolton
*	@desc		misc library containing Skill, Misc and Sort classes
*/

var Skill = {
	usePvpRange: false,

	getRange: function (skillId) {
		switch (skillId) {
		case 0: // Normal Attack
			return Attack.usingBow() ? 20 : 3;
		case 10: // Jab
		case 14: // Power Strike
		case 19: // Impale
		case 24: // Charged Strike
		case 30: // Fend
		case 34: // Lightning Strike
		case 73: // Poison Dagger
		case 96: // Sacrifice
		case 97: // Smite
		case 106: // Zeal
		case 112: // Blessed Hammer
		case 116: // Conversion
		case 126: // Bash
		case 133: // Double Swing
		case 139: // Stun
		case 144: // Concentrate
		case 147: // Frenzy
		case 152: // Berserk
		case 232: // Feral Rage
		case 233: // Maul
		case 238: // Rabies
		case 239: // Fire Claws
		case 242: // Hunger
		case 248: // Fury
		case 255: // Dragon Talon
		case 260: // Dragon Claw
		case 270: // Dragon Tail
			return 3;
		case 146: // Battle Cry
		case 154: // War Cry
			return 4;
		case 44: // Frost Nova
		case 240: // Twister
		case 245: // Tornado
			return 5;
		case 500: // Summoner: Qolbot, 2026-11-15: 5 sent the Necromancer (544 life) next to every monster his army fought; he stays back now
			return 15;
		case 38: // Charged Bolt
			return 6;
		case 48: // Nova
		case 151: // Whirlwind
			return 7;
		case 92: // Poison Nova
			return 8;
		case 101: // Holy Bolt
		case 107: // Charge
		case 130: // Howl
		case 132: // Leap
		case 225: // Firestorm
		case 229: // Molten Boulder
		case 230: // Arctic Blast
		case 243: // Shock Wave
			return 10;
		case 64: // Frozen Orb
		case 67: // Teeth
		case 234: // Fissure
		case 244: // Volcano
		case 251: // Fire Blast
		case 256: // Shock Web
		case 257: // Blade Sentinel
		case 266: // Blade Fury
			return 15;
		case 121: // Fist of the Heavens
		case 253: // Psychic Hammer
		case 275: // Dragon Flight
			return 20;
		// Variable range
		case 42: // Static Field
			if (me.gametype === 1) {
				return Math.floor((me.getSkill(42, 1) + 4) * 2 / 3);
			}

			return 20;
		case 49: // Lightning
		case 84: // Bone Spear
		case 93: // Bone Spirit
			if (this.usePvpRange) {
				return 40;
			}

			return 15;
		case 47:
		case 51:
		case 53:
		case 56:
		case 59:
		case 273: // Mind Blast
			if (this.usePvpRange) {
				return 40;
			}

			return 20;
		}

		// Every other skill
		if (this.usePvpRange) {
			return 40;
		}

		return 20;
	},

	getHand: function (skillId) {
		switch (skillId) {
		case 6:
		case 7:
		case 9:
		case 10:
		case 11:
		case 12:
		case 13:
		case 14:
		case 15:
		case 16:
		case 18:
		case 19:
		case 20:
		case 21:
		case 22:
		case 23:
		case 24:
		case 25:
		case 26:
		case 27:
		case 29:
		case 30:
		case 31:
		case 33:
		case 34:
		case 35:
		case 36:
		case 37:
		case 38:
		case 39:
		case 41:
		case 45:
		case 47:
		case 49:
		case 53:
		case 55:
		case 61:
		case 63:
		case 64:
		case 65:
		case 67:
		case 73:
		case 79:
		case 84:
		case 89:
		case 93:
		case 101:
		case 107:
		case 111:
		case 112:
		case 121:
		case 132:
		case 140:
		case 143:
		case 151:
		case 225:
		case 229:
		case 230:
		case 240:
		case 243:
		case 245:
		case 251:
		case 254:
		case 256:
		case 257:
		case 259:
		case 263:
		case 265:
		case 266:
		case 269:
		case 274:
		case 275:
			return 1;
		case 0: // Normal Attack
		case 96: // Sacrifice
		case 97: // Smite
		case 106: // Zeal
		case 116: // Conversion
		case 126: // Bash
		case 133: // Double Swing
		case 139: // Stun
		case 144: // Concentrate
		case 147: // Frenzy
		case 152: // Berserk
		case 232: // Feral Rage
		case 233: // Maul
		case 238: // Rabies
		case 239: // Fire Claws
		case 242: // Hunger
		case 248: // Fury
		case 255: // Dragon Talon
		case 260: // Dragon Claw
		case 270: // Dragon Tail
			return 2; // Shift bypass
		}

		// Every other skill
		return 0;
	},

	charges: [],

	// Cast a skill on self, Unit or coords
	cast: function (skillId, hand, x, y) {
		if (me.inTown && !this.townSkill(skillId)) {
			return false;
		}

		if (!me.getSkill(skillId, 1)) {
			return false;
		}

		if (!this.wereFormCheck(skillId)) {
			return false;
		}

		// No mana to cast
		if (this.getManaCost(skillId) > me.mp) {
			// Maybe delay on ALL skills that we don't have enough mana for?
			if (Config.AttackSkill.concat([42, 54]).concat(Config.LowManaSkill).indexOf(skillId) > -1) {
				delay(300);
			}

			return false;
		}

		if (skillId === undefined) {
			throw new Error("Skill.cast: Must supply a skill ID");
		}

		var i, n, clickType, shift;

		if (hand === undefined) {
			hand = 0;
		}

		if (x === undefined) {
			x = me.x;
		}

		if (y === undefined) {
			y = me.y;
		}

		if (!this.setSkill(skillId, hand)) {
			return false;
		}

		if (Config.PacketCasting > 1) {
			switch (typeof x) {
			case "number":
				Packet.castSkill(hand, x, y);
				delay(250);

				break;
			case "object":
				Packet.unitCast(hand, x);
				delay(250);

				break;
			}
		} else {
			switch (hand) {
			case 0: // Right hand + No Shift
				clickType = 3;
				shift = 0;

				break;
			case 1: // Left hand + Shift
				clickType = 0;
				shift = 1;

				break;
			case 2: // Left hand + No Shift
				clickType = 0;
				shift = 0;

				break;
			case 3: // Right hand + Shift
				clickType = 3;
				shift = 1;

				break;
			}

MainLoop:
			for (n = 0; n < 3; n += 1) {
				if (typeof x === "object") {
					clickMap(clickType, shift, x);
				} else {
					clickMap(clickType, shift, x, y);
				}

				delay(20);

				if (typeof x === "object") {
					clickMap(clickType + 2, shift, x);
				} else {
					clickMap(clickType + 2, shift, x, y);
				}

				for (i = 0; i < 8; i += 1) {
					if (me.attacking) {
						break MainLoop;
					}

					delay(20);
				}
			}

			while (me.attacking) {
				delay(10);
			}
		}

		if (this.isTimed(skillId)) { // account for lag, state 121 doesn't kick in immediately
			for (i = 0; i < 10; i += 1) {
				if ([4, 9].indexOf(me.mode) > -1) {
					break;
				}

				if (me.getState(121)) {
					break;
				}

				delay(10);
			}
		}

		return true;
	},

	// Put a skill on desired slot
	setSkill: function (skillId, hand) {
		// Check if the skill is already set
		if (me.getSkill(hand === 0 ? 2 : 3) === skillId) {
			return true;
		}

		if (!me.getSkill(skillId, 1)) {
			return false;
		}

		if (hand === undefined || hand === 3) {
			hand = 0;
		}

		var charge = this.getCharge(skillId);

		if (!!charge) {
			// charge.charges is a cached value from Attack.getCharges
			/*if (charge.charges > 0 && me.setSkill(skillId, hand, charge.unit)) {
				return true;
			}*/

			return false;
		}

		if (me.setSkill(skillId, hand)) {
			return true;
		}

		return false;
	},

	// Charged skill
	getCharge: function (skillId) {
		var i;

		for (i = 0; i < this.charges.length; i += 1) {
			if (this.charges[i].skill === skillId && me.getSkill(skillId, 0) === this.charges[i].level && me.getSkill(skillId, 0) === me.getSkill(skillId, 1)) {
				return this.charges[i];
			}
		}

		return false;
	},

	// Timed skills
	isTimed: function (skillId) {
		return [15, 25, 27, 51, 56, 59, 62, 64, 121, 225, 223, 228, 229, 234, 244, 247, 249, 250, 256, 268, 275, 277, 279].indexOf(skillId) > -1;
	},

	// Wereform skill check
	wereFormCheck: function (skillId) {
		if (!me.getState(139) && !me.getState(140)) {
			return true;
		}

		// Can be cast by both
		if ([0, 1, 221, 222, 226, 227, 231, 236, 237, 239, 241, 242, 246, 247, 249].indexOf(skillId) > -1) {
			return true;
		}

		// Can be cast by werewolf only
		if (me.getState(139) && [223, 232, 238, 248].indexOf(skillId) > -1) {
			return true;
		}

		// Can be cast by werebear only
		if (me.getState(140) && [228, 233, 243].indexOf(skillId) > -1) {
			return true;
		}

		return false;
	},

	// Skills that cn be cast in town
	townSkill: function (skillId) {
		return [32, 40, 43, 50, 52, 58, 60, 68, 75, 85, 94, 117, 221, 222, 226, 227, 235, 236, 237, 246, 247, 258, 267, 268, 277, 278, 279].indexOf(skillId) > -1;
	},

	manaCostList: {},

	// Get mana cost of the skill (mBot)
	getManaCost: function (skillId) {
		if (skillId < 6) {
			return 0;
		}

		if (this.manaCostList.hasOwnProperty(skillId)) {
			return this.manaCostList[skillId];
		}

		var skillLvl = me.getSkill(skillId, 1),
			effectiveShift = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
			lvlmana = getBaseStat(3, skillId, "lvlmana") === 65535 ? -1 : getBaseStat(3, skillId, "lvlmana"), // Correction for skills that need less mana with levels (kolton)
			ret = Math.max((getBaseStat(3, skillId, "mana") + lvlmana * (skillLvl - 1)) * (effectiveShift[getBaseStat(3, skillId, "manashift")] / 256), getBaseStat(3, skillId, "minmana"));

		if (!this.manaCostList.hasOwnProperty(skillId)) {
			this.manaCostList[skillId] = ret;
		}

		return ret;
	}
};

var Item = {
	hasTier: function (item) {
		return Config.AutoEquip && NTIP.GetTier(item) > 0;
	},

	hasMercTier: function (item) {
		return Config.AutoMercEquip && NTIP.GetMercTier(item) > 0;
	},

	canEquip: function (item) {
		if (item.type !== 4) { // Not an item
			return false;
		}

		if (!item.getFlag(0x10)) { // Unid item
			return false;
		}

		if (item.getStat(92) > me.getStat(12) || item.dexreq > me.getStat(2) || item.strreq > me.getStat(0)) { // Higher requirements
			return false;
		}

		return true;
	},

	canMercEquip: function (item) {
		if (item.type !== 4) { // Not an item
			return false;
		}

		if (!item.getFlag(0x10)) { // Unid item
			return false;
		}

		var merc = me.getMerc();

		if (!merc || item.getStat(92) > merc.getStat(12) || item.dexreq > merc.getStat(2) || item.strreq > merc.getStat(0)) { // Higher requirements
			return false;
		}

		return true;
	},

	// Equips an item and throws away the old equipped item
	// Qolbot (the user, 2026-11-14): gear taken off in town was dropped at the vendor, mid-chores, where no teammate looked (8 drops, 0 picked up).
	// In town it now goes into the pack and is dropped at the portal spot when the chores are done (dropHeldForTeam). gid -> name. UNTESTED live.
	heldForTeam: {},

	holdForTeam: function (item) {
		if (me.inTown && Storage.Inventory.CanFit(item) && Storage.Inventory.MoveTo(item)) {
			this.heldForTeam[item.gid] = item.name;
			print("Equip: holding " + item.name + " to drop at the portal spot for the others");

			return true;
		}

		item.drop();

		return false;
	},

	isHeldForTeam: function (item) {
		return !!item && this.heldForTeam.hasOwnProperty(item.gid);
	},

	dropHeldForTeam: function () {
		var gid, item, any = false;

		for (gid in this.heldForTeam) {
			if (this.heldForTeam.hasOwnProperty(gid)) {
				any = true;

				break;
			}
		}

		if (!any) {
			return;
		}

		if (me.inTown) {
			try {
				Town.move("portalspot");
			} catch (moveError) {
				print("Equip: could not reach the portal spot (" + moveError + "): dropping here");
			}
		}

		me.cancel();

		for (gid in this.heldForTeam) {
			if (this.heldForTeam.hasOwnProperty(gid)) {
				item = me.getItem(-1, -1, Number(gid));

				if (item && item.location === 3) {
					item.drop();
					delay(me.ping + 200);
					print("Equip: dropped " + this.heldForTeam[gid] + (me.inTown ? " at the portal spot" : "") + " for the others");
				}

				delete this.heldForTeam[gid];
			}
		}
	},

	// Qolbot: put an item that is on the cursor (the one just taken off) into the inventory, or, in town, the stash. True when it is stored.
	putAway: function (item) {
		if (Storage.Inventory.CanFit(item) && Storage.Inventory.MoveTo(item)) {
			return true;
		}

		if (me.inTown && Town.openStash() && Storage.Stash.CanFit(item) && Storage.Stash.MoveTo(item)) {
			return true;
		}

		return false;
	},

	equip: function (item, bodyLoc) {
		if (!this.canEquip(item)) {
			return false;
		}

		// Already equipped in the right slot
		if (item.mode === 1 && item.bodylocation === bodyLoc) {
			return true;
		}

		var i, cursorItem, keepResult, keepInfo, left;

		// Qolbot: a two-handed weapon needs the left hand free: the shield (not arrows or bolts) comes off first
		if (bodyLoc === 4 && typeof qolgear === "object" && qolgear.twoHanded(item) && (item.location !== 7 || me.inTown)) {
			left = this.wornIn(me, 5);

			if (left && [5, 6].indexOf(left.itemType) < 0 && !this.takeOff(5)) {
				return false;
			}
		}

		if (item.location === 7) {
			if (!me.inTown) { // never make a trip to town just to try an item from the stash: it waits for the next town visit
				return false;
			}

			print("Taking an item out of the stash.");
			if (!Town.openStash()) {
				return false;
			}
		}

		for (i = 0; i < 3; i += 1) {
			if (item.toCursor()) {
				clickItem(0, bodyLoc);
				delay(me.ping * 2 + 500);

				if (item.bodylocation === bodyLoc) {
					if (getCursorType() === 3) {
						//Misc.click(0, 0, me);

						cursorItem = getUnit(100);

						// Qolbot: the item just taken off may be on the keep list: a better item must never cost a good one
						if (cursorItem) {
							keepInfo = Pickit.checkItem(cursorItem);
							keepResult = keepInfo.result;
							print("Equip: took off " + cursorItem.name + ": keep rule result " + keepResult + " (1 keeper, 2 cube, 3 runeword, 5 craft)" + (keepInfo.line ? " [" + String(keepInfo.line).substr(0, 70) + "]" : "") + ": " + ([1, 2, 3, 5].indexOf(keepResult) > -1 ? "stored" : "dropped for the others"));
						}

						if (cursorItem && [1, 2, 3, 5].indexOf(keepResult) > -1) {
							this.putAway(cursorItem);
						} else if (cursorItem) {
							// Qolbot: not on the keep list: drop it. The other bots may try it on (the items trickle down the party). In town it is held
							// until the chores are done and dropped at the portal spot, where the team gathers (holdForTeam)
							this.holdForTeam(cursorItem);
						}
					}

					return true;
				}
			}
		}

		return false;
	},

	// The gid of what the mercenary wears in bodyLoc (0: nothing)
	mercSlotGid: function (bodyLoc) {
		var merc = me.getMerc(), it;

		if (merc) {
			it = merc.getItem();

			if (it) {
				do {
					if (it.mode === 1 && it.bodylocation === bodyLoc) {
						return it.gid;
					}
				} while (it.getNext());
			}
		}

		return 0;
	},

	// Is the swap done? The item gets a NEW gid on the merc (live 14:52:46 on 2026-11-14: Sankt's, Barabas's and Darius's mercs wore the bow and the circlet,
	// every one reported "cannot use"): the slot holds something else than before, of this item's class
	mercSwapped: function (bodyLoc, oldGid, classid) {
		var merc = me.getMerc(), it;

		if (merc) {
			it = merc.getItem();

			if (it) {
				do {
					if (it.mode === 1 && it.bodylocation === bodyLoc && it.gid !== oldGid && it.classid === classid) {
						return true;
					}
				} while (it.getNext());
			}
		}

		return false;
	},

	// Qolbot: what `owner` (me or the merc) wears in bodyLoc, of this classid when given; null if nothing. An item gets a NEW gid when it is put on (live
	// 2026-11-14 17:58 and 18:02: the merc wore the Cap and the Breast Plate under new gids), so the item log of an equip looks it up by slot, not by gid.
	wornIn: function (owner, bodyLoc, classid) {
		var it = owner ? owner.getItem() : null;

		if (it) {
			do {
				if (it.mode === 1 && it.bodylocation === bodyLoc && (classid === undefined || it.classid === classid)) {
					return copyUnit(it);
				}
			} while (it.getNext());
		}

		return null;
	},

	// Does the mercenary wear the item `gid` (in bodyLoc)?
	mercWears: function (gid, bodyLoc) {
		var merc = me.getMerc(), it;

		if (!merc) {
			return false;
		}

		it = merc.getItem();

		if (it) {
			do {
				if (it.gid === gid && it.mode === 1 && (bodyLoc === undefined || it.bodylocation === bodyLoc)) {
					return true;
				}
			} while (it.getNext());
		}

		return false;
	},

	mercEquip: function (item, bodyLoc) {
		if (!this.canMercEquip(item)) {
			return false;
		}

		// Already equipped in the right slot
		if (item.mode === 1 && item.bodylocation === bodyLoc) {
			return true;
		}

		var i, cursorItem, keepResult, keepInfo, tick, gid = item.gid, name = item.name, classid = item.classid, oldGid;

		// An item the merc already refused (wrong weapon type for this merc, etc.) is not retried, and neither is
		// another item of a type it has refused for that slot (a merc that cannot wear rings refuses every ring).
		this.mercRejected = this.mercRejected || {};
		this.mercRejectedType = this.mercRejectedType || {};

		if (this.mercRejected[item.gid + ":" + bodyLoc] || this.mercRejectedType[item.itemType + ":" + bodyLoc]) {
			return false;
		}

		// Qolbot: no swap with a dead merc (wait for the revive, no refusal). (The "refusals" of 14:41 were swaps that worked: see mercSwapped.)
		if (!me.getMerc() || me.getMerc().mode === 0 || me.getMerc().mode === 12) {
			return false;
		}

		if (item.location === 7) { // it is in the stash: take it out, but only while in town (no trips just for this)
			if (!me.inTown) {
				return false;
			}

			if (!Town.openStash()) {
				return false;
			}
		}

		for (i = 0; i < 3; i += 1) {
			if (item.toCursor()) {
				oldGid = this.mercSlotGid(bodyLoc);
				clickItem(4, bodyLoc);

				// Qolbot: wait for the game's answer up to 3 s (it was one 0.5 s wait: under Wine the swap often came later, and the merc was never equipped in
				// any log; Darius, 14:21:48 on 2026-11-14: a better Splint Mail "refused"). Worn = the merc has this gid in the slot, or the old item is on the cursor.
				tick = getTickCount();

				// the item's unit goes stale once the merc wears it (live 14:34:56, Xena's Long War Bow: worn, but reported as "cannot use undefined"): look by the gid kept above
				while (getTickCount() - tick < 3000 && !this.mercWears(gid, bodyLoc) && !this.mercSwapped(bodyLoc, oldGid, classid)) {
					if (getCursorType() === 3 && getUnit(100) && getUnit(100).gid !== gid) {
						break;
					}

					delay(100);
				}

				if (this.mercWears(gid, bodyLoc) || this.mercSwapped(bodyLoc, oldGid, classid)) {
					if (getCursorType() === 3) {
						//Misc.click(0, 0, me);

						cursorItem = getUnit(100);

						if (cursorItem) {
							// Qolbot: a keep-list item is stored (inventory, or the stash in town); anything else is dropped for the other bots to try on
							keepInfo = Pickit.checkItem(cursorItem);
							keepResult = keepInfo.result;
							print("Equip: took off the mercenary's " + cursorItem.name + ": keep rule result " + keepResult + " (1 keeper, 2 cube, 3 runeword, 5 craft)" + (keepInfo.line ? " [" + String(keepInfo.line).substr(0, 70) + "]" : "") + ": " + ([1, 2, 3, 5].indexOf(keepResult) > -1 ? "stored" : "dropped for the others"));

							if ([1, 2, 3, 5].indexOf(keepResult) === -1 || !this.putAway(cursorItem)) {
								this.holdForTeam(cursorItem);
							}
						}
					}

					return true;
				}

				// The click did not put it on the merc. If it is still on the cursor, put it back in the
				// inventory (retrying with a full cursor was what broke merc weapons) and remember it.
				if (getCursorType() === 3) {
					cursorItem = getUnit(100);

					if (cursorItem && Storage.Inventory.CanFit(cursorItem)) {
						Storage.Inventory.MoveTo(cursorItem);
					}
				}

				this.mercRejected[gid + ":" + bodyLoc] = true; // this item only: one refusal no longer bars every item of its type for the rest of the game
				print("mercEquip: merc cannot use " + name + " (slot " + bodyLoc + "), skipping it from now on. Cursor: " + (getUnit(100) ? getUnit(100).name : "empty") +
					", merc level " + (me.getMerc() ? me.getMerc().charlvl : "?") + ", str " + (me.getMerc() ? me.getMerc().getStat(0) : "?") + ", dex " + (me.getMerc() ? me.getMerc().getStat(2) : "?") +
					", item needs level " + item.lvlreq + ", str " + item.strreq + ", dex " + item.dexreq);

				return false;
			}
		}

		return false;
	},

	// ---- What a bot may pick up and sell ----------------------------------------------------------------------------------
	// One rule for all of it: the "never replace" list the player checks (Settings tab, Equipment: unique, set, crafted, rare, magic,
	// socketed, runeword, ethereal). An item in a checked category is the player's keeper: a bot never picks it up as an upgrade,
	// never picks it up to sell, and never sells it. Weapons, armor, rings and amulets count.
	sellTypes: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 42, 43, 44, 67, 68, 69, 72, 85, 86, 87, 88, 2, 70, 71, 3, 15, 16, 19, 37, 75],

	// may a bot pick this up as an upgrade, pick it up to sell, or sell it?
	takeable: function (item) {
		try {
			return !!item && item.type === 4 && (this.sellTypes.indexOf(item.itemType) > -1 || [10, 12].indexOf(item.itemType) > -1) &&
				this.isReplacable(item);
		} catch (e) {
			return false;
		}
	},

	sellable: function (item) {
		// a charm the bot picked up itself that turned out not to be a keeper is sold like any other junk; the player's own charms never are
		if (item && item.type === 4 && this.isCharm(item)) {
			return !this.userOwned(item) && this.isReplacable(item);
		}

		return this.takeable(item);
	},

	isCharm: function (item) {
		return [13, 21, 82, 83, 84].indexOf(item.itemType) > -1;
	},

	// Charms the bot picked up are remembered in data/<profile>.charms.json, so that after a restart (the game's item ids are only good
	// for one game) a charm the bot found is still told apart from one you put in the pack. An entry is a signature of the item (kind,
	// quality, item level and, once identified, a hash of its stats) plus this game's item id. It is dropped when the bot stashes or sells it.
	charmSig: function (item) {
		var i, h = 0, d = "u", text;

		if (item.getFlag(0x10)) {
			text = String(item.description || "");

			for (i = 0; i < text.length; i += 1) {
				h = (h * 31 + text.charCodeAt(i)) % 1000000007;
			}

			d = String(h);
		}

		return item.classid + "|" + item.quality + "|" + item.ilvl + "|" + d;
	},

	charmList: function () {
		var text;

		if (!this.charmCache) {
			this.charmCache = [];

			try {
				if (FileTools.exists("data/" + me.profile + ".charms.json")) {
					text = Misc.fileAction("data/" + me.profile + ".charms.json", 0);
					this.charmCache = JSON.parse(text) || [];
				}
			} catch (e) {
				this.charmCache = [];
			}
		}

		return this.charmCache;
	},

	charmSave: function () {
		try {
			Misc.fileAction("data/" + me.profile + ".charms.json", 1, JSON.stringify(this.charmList()));
		} catch (e) {
			print("charm list: " + e);
		}
	},

	rememberCharm: function (item) {
		var i, list = this.charmList(), sig = this.charmSig(item), game = me.gamename;

		for (i = 0; i < list.length; i += 1) {
			if (list[i].g === item.gid && list[i].n === game) {
				if (list[i].s !== sig) {
					list[i].s = sig;
					this.charmSave();
				}

				return;
			}
		}

		list.push({s: sig, g: item.gid, n: game, p: [item.x, item.y]}); // p: where the game put it

		if (list.length > 60) {
			list.shift();
		}

		this.charmSave();
	},

	// Once per game, the first time the pack is looked at: drop every remembered charm that is not in the pack any more (stashed some other
	// way, sold, lost, traded, or never there after a restore from an older save). Entries are matched to pack charms one for one by
	// signature, so what is left is only what the bot is still carrying.
	pruneCharms: function () {
		if (this.charmPruned || !me.gameReady) {
			return;
		}

		this.charmPruned = true;

		var i, sig, item, list = this.charmList(), have = {}, kept = [];

		try {
			item = me.getItem();

			if (item) {
				do {
					if (item.mode === 0 && item.location === 3 && this.isCharm(item)) {
						sig = this.charmSig(item);
						have[sig] = (have[sig] || 0) + 1;
					}
				} while (item.getNext());
			}

			for (i = 0; i < list.length; i += 1) {
				if (have[list[i].s] > 0) {
					have[list[i].s] -= 1;
					kept.push(list[i]);
				}
			}

			if (kept.length !== list.length) {
				this.charmCache = kept;
				this.charmSave();
			}
		} catch (e) {
			print("charm list: " + e);
		}
	},

	// the remembered entry for this charm: the one for this game's item id, else the first with the same signature
	charmEntry: function (item) {
		var i, list = this.charmList(), sig = this.charmSig(item), game = me.gamename;

		for (i = 0; i < list.length; i += 1) {
			if (list[i].g === item.gid && list[i].n === game) {
				return list[i];
			}
		}

		for (i = 0; i < list.length; i += 1) {
			if (list[i].s === sig) {
				return list[i];
			}
		}

		return null;
	},

	forgetCharm: function (item) {
		var i, list = this.charmList(), sig = this.charmSig(item), game = me.gamename;

		for (i = 0; i < list.length; i += 1) {
			if ((list[i].g === item.gid && list[i].n === game) || list[i].s === sig) {
				list.splice(i, 1);
				this.charmSave();

				return;
			}
		}
	},

	// Qolbot: can the Horadric Cube hold this item? The cube is extra storage for what no longer fits in the stash. Only while the bot
	// carries a cube and nothing is set up to transmute (a recipe or a runeword would consume what is inside).
	// The cube is storage only when the stash cannot grow (the user, 2026-11-15: "barabas cube is full of items, so it means when he is in town he is not
	// doing the job of stashing items"): with PlugY pages that can be added (Config.InfiniteStash, Town.noMorePages not set) a full page gets a new page
	// instead, and the cube stays free for recipes and quest cubing (Barabas's Partizan and Lance sat in his cube from 14:50 and 15:10).
	cubeRoom: function (item) {
		try {
			if (Config.InfiniteStash && !Town.noMorePages) {
				return false;
			}

			return !!me.getItem(549) && !Config.Cubing && !Config.MakeRunewords && !(Config.Recipes && Config.Recipes.length) &&
				!(Config.Runewords && Config.Runewords.length) && Storage.Cube.CanFit(item);
		} catch (e) {
			return false;
		}
	},

	// Qolbot: THE CUBE BEFORE A TRIP (the user, 2026-11-15: "make it so trips to town for reason of full inventory happens when bots have maxed out their
	// cube also"). The pack is full in the field: what a town trip would get rid of (to identify, junk to sell, keepers to stash: tripItem) goes into the
	// Horadric Cube until `want` fits. Town.unloadCube takes it out again first thing in town, and Cubing.emptyCube empties the cube before any transmute,
	// so nothing of it becomes part of a recipe. True when `want` fits now. UNTESTED in a game.
	cubeForRoom: function (want) {
		var i, items, moved = 0;

		if (me.inTown || !me.getItem(549)) {
			return false;
		}

		try {
			items = (this.botItems() || []).filter(function (it) { return it.gid !== want.gid && it.classid !== 549 && Item.tripItem(it); });

			for (i = 0; i < items.length && !Storage.Inventory.CanFit(want); i += 1) {
				if (!Storage.Cube.CanFit(items[i])) {
					continue;
				}

				if (!Cubing.openCube()) {
					break;
				}

				if (Storage.Cube.MoveTo(items[i])) {
					moved += 1;
				}

				Storage.Reload();
			}
		} catch (cubeError) {
			print("Cube: " + cubeError);
		}

		me.cancel();

		if (moved) {
			print("Cube: moved " + moved + " item(s) from my pack into my cube to make room (the town trip waits until the cube is full too).");
			this.noteFullPack(want);
		}

		return Storage.Inventory.CanFit(want);
	},

	// NO CLEAR 2x4 SPACE (the user, 2026-11-16: "if a char doesn't have a clear 2x4 space, there should be a yellow alert on the activity page"): the biggest items (polearms,
	// two-handed weapons, staves) are two cells wide and four high, and the pack is four rows. With no such strip free the bot walks past them. Said once per game, after the
	// chores have tidied the pack (Layout.tidy); Qolbot shows it as the yellow notice. UNTESTED in a game.
	checkBigSpace: function () {
		try {
			if (this.bigSpaceSaid || Storage.Inventory.CanFit({sizex: 2, sizey: 4, gid: -1, classid: -1})) {
				return true;
			}

			this.bigSpaceSaid = true;
			print("Pack: NOTICE: no clear 2x4 space in the pack: " + me.name + " cannot pick up the biggest items (polearms, two-handed weapons). Take a look at " + me.name + "'s inventory and clear a strip two cells wide and the full height.");

			return false;
		} catch (spaceError) {
			print("Pack: " + spaceError);

			return true;
		}
	},

	// WHY AN ITEM IS KEPT, in words, for the Activity tab's "Stashed" entries (the user, 2026-11-16: "the activity log is stashing items but i don't know why (keeper?)").
	// The pickit says which rule kept it ("Generated.nip #2" is a number nobody reads): a unique or a set item is kept by the Keeper tab's "[quality] == unique/set", a rune,
	// gem or charm by its own rule, a quest item because a quest wants it; anything else is named by the kind of rule (keeper, cube recipe, runeword) and its line.
	stashWhy: function (item) {
		var res, line = "";

		try {
			if (QuestItems.keep.indexOf(item.classid) > -1) {
				return "quest item";
			}

			res = Pickit.checkItem(item);
			line = res && res.line ? " (" + res.line + ")" : "";

			if (res && res.result === 2) {
				return "kept for a cube recipe" + line;
			}

			if (res && res.result === 3) {
				return "kept for a runeword" + line;
			}

			if (item.quality === 7) {
				return "keeper: unique";
			}

			if (item.quality === 5) {
				return "keeper: set";
			}

			if (item.itemType === 74) {
				return "keeper: rune";
			}

			if (/Topaz|Sapphire|Ruby|Emerald|Diamond|Amethyst|Skull/.test(item.name) && item.itemType !== 74) {
				return "keeper: gem";
			}

			if (this.isCharm(item)) {
				return "keeper: charm";
			}

			if (res && res.result === 1) {
				return "keeper rule" + line;
			}

			// An item that is NOT identified, whose rule needs its stats (result -1), and that the Equipment protection list covers: kept as it is rather than sold, so that it
			// can be looked at (the user, 2026-11-16: "esp since these are non IDed rare items"). Town.wantStash's third clause. Said with what protects it.
			if (res && res.result === -1 && !item.getFlag(0x10)) {
				return "not identified, " + this.protectedBy(item) + line;
			}
		} catch (whyError) {
			return "stashed";
		}

		return "stashed";
	},

	// what in the Settings > Equipment protection list covers an item (isReplacable says only yes or no)
	protectedBy: function (item) {
		var p = Config.Protect || {}, q = item.quality;

		if (p.classIds && p.classIds.indexOf(item.classid) > -1) {
			return "protected item";
		}

		if (p.minLevel > 0 && me.charlvl < p.minLevel) {
			return "kept to look at";
		}

		if (p.unique && q === 7) { return "protected: unique"; }
		if (p.set && q === 5) { return "protected: set"; }
		if (p.crafted && q === 8) { return "protected: crafted"; }
		if (p.rare && q === 6) { return "protected: rare"; }
		if (p.magic && q === 4) { return "protected: magic"; }
		if (p.socketed && item.getStat(194) > 0) { return "protected: socketed"; }
		if (p.runeword && item.getFlag(0x4000000)) { return "protected: runeword"; }
		if (p.ethereal && item.getFlag(0x400000)) { return "protected: ethereal"; }

		return "kept to look at";
	},

	// the items (by id, for this game) whose "Stashed" line the Activity list has already been given, so that a cube item that moves on to the stash is not listed twice
	stashAnnounced: {},

	// Would an item of this size (sizex, sizey) fit in the pack if everything a town visit takes away (tripItem: to stash, to sell, to identify) were gone? True when it
	// would NOT: the rest of the pack stays for good. An error counts as "does not fit", so a doubtful case still raises the alert.
	packStaysFull: function (size) {
		var w, h, grid = [], items, i, x, y, it, free, sx = (size && size.sizex) || 1, sy = (size && size.sizey) || 1;

		try {
			w = Storage.Inventory.width;
			h = Storage.Inventory.height;

			for (y = 0; y < h; y += 1) {
				grid.push([]);

				for (x = 0; x < w; x += 1) {
					grid[y].push(0);
				}
			}

			items = me.findItems(-1, -1, 3) || [];

			for (i = 0; i < items.length; i += 1) {
				it = items[i];

				if (this.tripItem(it) && !this.userOwned(it)) {
					continue; // this one goes to the stash or the shop at the next town visit
				}

				for (y = it.y; y < it.y + it.sizey && y < h; y += 1) {
					for (x = it.x; x < it.x + it.sizex && x < w; x += 1) {
						grid[y][x] = 1;
					}
				}
			}

			for (y = 0; y + sy <= h; y += 1) {
				for (x = 0; x + sx <= w; x += 1) {
					free = true;

					for (i = 0; i < sy * sx && free; i += 1) {
						free = !grid[y + Math.floor(i / sx)][x + (i % sx)];
					}

					if (free) {
						return false;
					}
				}
			}

			return true;
		} catch (stayError) {
			return true;
		}
	},

	// A FULL INVENTORY is a yellow alert on the Activity page (the user, 2026-11-16: "items go in the cube if the inventory is full, and those items in the cube cannot be
	// IDed but they will all automatically go into the stash ... but it should put an alert on the activity page saying the character has a full inventory"). Said once per
	// game, the first time the bot puts something in its cube because the pack has no room.
	//
	// But only when the pack is full of what STAYS (the user, 2026-11-16: "the yellow 'inventory full' alert should only fire if the items in the inventory are the kind that
	// will never get moved out -- such as stash or sale"): a pack full of things the next town visit stashes or sells is a normal, passing state. The pack is looked at as it
	// would be with all of those gone (what stays: charms, tomes, keys, the cube, potions, quest items); the alert is for a pack in which `size` (sizex, sizey) does not fit even then.
	noteFullPack: function (size) {
		if (this.fullPackSaid || !this.packStaysFull(size)) {
			return;
		}

		this.fullPackSaid = true;
		print("Pack: NOTICE: " + me.name + " has a full inventory: items go into the cube, are not identified, and all go to the stash. Take a look at " + me.name + "'s inventory and fix that, so this backup is no longer needed.");
	},

	// PICKUPS STRAIGHT INTO THE CUBE (the user, 2026-11-16: "bots can use their cube to pickup stuff"; "in the event that items begin being placed directly in the cube, put a
	// yellow alert on the activity page"). Meir walked past loot with a 7x4 cube empty because cubeForRoom moves only the pack's trip items. A pickup that does not fit in
	// the pack but fits in the cube is picked up (the game puts it on the cursor when the pack has no room) and put into the cube. Town.unloadCube takes it out in town.
	// cubeTakesPickup says whether the cube may take it (the same rules as cubeRoom: no recipes, no infinite stash), cursorToCube does it. UNTESTED in a game.
	cubeTakesPickup: function (item) {
		try {
			// NOT cubeRoom: its "infinite stash" clause (add stash pages: the stash can still grow) is about stashing, and for Meir (add stash pages true) it said no for every
			// pickup. The rules are cubeForRoom's: a cube in the pack, in the field, a free spot in it. UNTESTED in a game.
			return !!me.getItem(549) && !me.inTown && Storage.Cube.CanFit(item);
		} catch (e) {
			return false;
		}
	},

	cursorToCube: function (gid, name, size) {
		var cur, placed = false;

		try {
			cur = getUnit(100);

			if (!cur || cur.gid !== gid) {
				return !!me.getItem(-1, -1, gid); // it went into the pack after all, or it was not picked up
			}

			Storage.Reload();

			if (Cubing.openCube()) {
				cur = getUnit(100) || cur;
				placed = Storage.Cube.MoveTo(cur);
			}

			Storage.Reload();
		} catch (cubeError) {
			print("Cube: " + cubeError);
		}

		me.cancel();

		try {
			if (me.itemoncursor) { // the cube would not take it: it must not stay in the hand
				print("Cube: could not put " + name + " into the cube: dropping it again.");
				getUnit(100).drop();
				placed = false;
			}
		} catch (dropError) {
			print("Cube: " + dropError);
		}

		if (placed) {
			print("Cube: picked up " + name + " straight into my cube (no room in the pack).");

			this.noteFullPack(size);
		}

		return placed;
	},

	// TRULY FULL (the user, 2026-11-16: "only if the bot truly cannot pick up anything because all their space is full, including their cube"): not one free cell in the
	// pack, and none in the Horadric Cube either (or no cube). Said once every ten minutes, in a log line Qolbot turns into the red box of the Activity page
	// (fatal.go, packfull). Pickit calls it where it prints "Not enough room". UNTESTED in a game.
	reportFull: function (item) {
		var cell = {sizex: 1, sizey: 1, gid: -1, classid: -1}, cube;

		try {
			if (Date.now() - (this.fullSaid || 0) < 600000 || Storage.Inventory.CanFit(cell)) {
				return false;
			}

			cube = me.getItem(549);

			if (cube && Storage.Cube.CanFit(cell)) {
				return false;
			}

			this.fullSaid = Date.now();
			print("Pack: FULL: no room in the pack and none in the cube" + (cube ? "" : " (no cube)") + ": " + me.name + " cannot pick up anything, not even " + (item && item.name ? item.name : "one item") + ".");

			return true;
		} catch (fullError) {
			print("Pack: " + fullError);

			return false;
		}
	},

	// an item a town trip gets rid of: to identify, junk to sell, a keeper to stash. Never quest items, gold, potions or scrolls.
	tripItem: function (it) {
		try {
			if (QuestItems.keep.indexOf(it.classid) > -1 || QuestItems.isConsumable(it) || [4, 22, 76, 77, 78].indexOf(it.itemType) > -1) {
				return false;
			}

			switch (Pickit.checkItem(it).result) {
			case -1:
				return true;
			case 0:
			case 4:
				return Item.sellable(it) && Item.isReplacable(it);
			default:
				return Town.canStash(it, true);
			}
		} catch (e) {
			return false;
		}
	},

	// put an item in the cube; true if it is there
	toCube: function (item) {
		if (!this.cubeRoom(item)) {
			return false;
		}

		try {
			if (!Cubing.openCube()) {
				return false;
			}

			var moved = Storage.Cube.MoveTo(item);

			me.cancel();

			return !!moved;
		} catch (e) {
			me.cancel();

			return false;
		}
	},

	// Qolbot: what you keep in a pack on purpose, and a bot leaves alone wherever it sits: charms (small, large, grand and the Torch),
	// tomes, keys and the Horadric Cube. The charms count only if the bot did not pick them up itself in this game (Pickit.pickedGids).
	// Everything else, the torch parts included, is just a keeper or junk and goes to the stash or is sold.
	userOwned: function (item) {
		try {
			// a charm the bot picked up itself during this game is the bot's to identify and stash like any other keeper: only the charms
			// that were already in the pack are yours
			if (this.isCharm(item)) {
				var entry = this.charmEntry(item);

				// a charm the bot found stays where the game put it until the bot stashes or sells it: if it has been moved, you have taken
				// it for yourself (you moved it in the pack, or took it out of the stash again): it is yours from now on
				if (entry && entry.p && (entry.p[0] !== item.x || entry.p[1] !== item.y)) {
					this.forgetCharm(item);

					if (typeof Pickit === "object" && Pickit.pickedGids) {
						delete Pickit.pickedGids[item.gid];
					}

					return true;
				}

				if (typeof Pickit === "object" && Pickit.pickedGids && Pickit.pickedGids[item.gid]) {
					if (item.getFlag(0x10)) {
						this.rememberCharm(item); // identified now: remember what it looks like, for after a restart
					}

					return false;
				}

				return !entry; // not picked up in this game: the bot's only if it remembers picking it up in an earlier one
			}

			// the tomes, the keys, the cube and every quest item the quests need on the way (the Staff of Kings, the Amulet of the Viper, the Horadric Staff, Khalim's
			// parts, the Hellforge hammer ...: QuestItems.keep) stay in the pack, where the bot can reach them in the field (the Horadric Staff goes into the socket
			// of Tal Rasha's tomb; a bot that had stashed the Staff of Kings could not do that away from town)
			return [518, 519, 543, 549].indexOf(item.classid) > -1 || (typeof QuestItems === "object" && QuestItems.keep.indexOf(item.classid) > -1);
		} catch (e) {
			return false;
		}
	},

	// The items a bot may sell, stash or identify: everything in its pack (every cell counts) except what userOwned says to leave alone.
	// Like Storage.Inventory.Compare it returns false when the pack cannot be read.
	botItems: function () {
		this.pruneCharms();

		var list = Storage.Inventory.Compare(Config.Inventory);

		if (!list) {
			return list;
		}

		return list.filter(function (it) {
			return !Item.userOwned(it);
		});
	},

	// Items auto-equip must never replace. The rules come from qolbot.json ("protect", editable on the web page)
	// through AutoSpec.js as Config.Protect; these defaults apply when no plan was loaded.
	isReplacable: function (item) {
		var p = Config.Protect || {unique: true, set: true, crafted: true, socketed: true, runeword: true, classIds: [174]},
			q = item.quality;

		// the items named by class id (Khalim's Will) are protected at every level
		if (p.classIds && p.classIds.indexOf(item.classid) > -1) {
			return false;
		}

		// Settings, Equipment: the list only protects a character of level p.minLevel or higher (the user, 2026-11-13: a low-level character should be free to
		// swap its early uniques and rares for better ones); below it nothing on the list is protected
		if (p.minLevel > 0 && me.charlvl < p.minLevel) {
			return true;
		}

		if ((p.unique && q === 7) || (p.set && q === 5) || (p.crafted && q === 8) || (p.rare && q === 6) || (p.magic && q === 4)) {
			return false;
		}

		if (p.socketed && item.getStat(194) > 0) {
			return false;
		}

		if (p.runeword && item.getFlag(0x4000000)) {
			return false;
		}

		if (p.ethereal && item.getFlag(0x400000)) {
			return false;
		}

		if (p.classIds && p.classIds.indexOf(item.classid) > -1) {
			return false;
		}

		return true;
	},

	getEquippedItem: function (bodyLoc) {
		var item = me.getItem();

		if (item) {
			do {
				if (item.bodylocation === bodyLoc) {
					return {
						classid: item.classid,
						tier: NTIP.GetTier(item),
						isReplacable: Item.isReplacable(item),
					};
				}
			} while (item.getNext());
		}

		// Don't have anything equipped in there
		return {
			classid: -1,
			tier: -1,
			isReplacable: true,
		};
	},

	getMercEquippedItem: function (bodyLoc) {
		var merc = me.getMerc();
		if(merc) {
			var item = merc.getItem();

			if (item) {
				do {
					if (item.bodylocation === bodyLoc) {
						return {
							classid: item.classid,
							tier: NTIP.GetMercTier(item),
							isReplacable: Item.isReplacable(item),
						};
					}
				} while (item.getNext());
			}
		}

		// Don't have anything equipped in there
		return {
			classid: -1,
			tier: -1,
			isReplacable: true,
		};
	},

	getBodyLoc: function (item) {
		var bodyLoc;

		switch (item.itemType) {
		case 2: // Shield
		case 70: // Auric Shields
			bodyLoc = 5;

			break;
		case 3: // Armor
			bodyLoc = 3;

			break;
		case 5: // Arrows
		case 6: // Bolts
			bodyLoc = 5;

			break;
		case 10: // Ring
			bodyLoc = [6, 7];

			break;
		case 12: // Amulet
			bodyLoc = 2;

			break;
		case 15: // Boots
			bodyLoc = 9;

			break;
		case 16: // Gloves
			bodyLoc = 10;

			break;
		case 19: // Belt
			bodyLoc = 8;

			break;
		case 37: // Helm
		case 71: // Barb Helm
		case 75: // Circlet
			bodyLoc = 1;

			break;
		case 24: //
		case 25: //
		case 26: //
		case 27: //
		case 28: //
		case 29: //
		case 30: //
		case 31: //
		case 32: //
		case 33: //
		case 34: //
		case 35: //
		case 36: //
		case 42: //
		case 43: //
		case 44: //
		case 67: // Handtohand (Assasin Claw)
		case 68: //
		case 69: //
		case 72: //
		case 85: //
		case 86: //
		case 87: //
		case 88: //
			bodyLoc = 4;

			break;
		default:
			return false;
		}

		// Qolbot: a build that fights with a weapon in each hand (Frenzy, Double Throw: Gear.js) takes a one-handed weapon in the left hand too
		if (bodyLoc === 4 && typeof qolgear === "object" && qolgear.dual(item)) {
			bodyLoc = [4, 5];
		}

		if (typeof bodyLoc === "number") {
			bodyLoc = [bodyLoc];
		}

		return bodyLoc;
	},

	// Qolbot (2026-11-15, gear by build): what an item must beat in a hand slot. A two-handed weapon frees the left hand too, so it must beat the
	// weapon AND the shield together (and the shield must be one that may be taken off); a shield, or a second weapon, cannot go next to a
	// two-handed weapon. Arrows and bolts in the left hand stay where they are (a bow needs them). Other slots: what is worn there.
	handSlot: function (item, loc) {
		var worn = this.getEquippedItem(loc), left, right;

		if (typeof qolgear !== "object" || (loc !== 4 && loc !== 5)) {
			return worn;
		}

		if (loc === 4 && qolgear.twoHanded(item)) {
			left = this.wornIn(me, 5);

			if (left && [5, 6].indexOf(left.itemType) < 0) {
				left = this.getEquippedItem(5);

				return {classid: worn.classid, tier: Math.max(worn.tier, 0) + Math.max(left.tier, 0), isReplacable: worn.isReplacable && left.isReplacable && left.classid !== 174};
			}

			return worn;
		}

		if (loc === 5 && [5, 6].indexOf(item.itemType) < 0) {
			right = this.wornIn(me, 4);

			if (right && qolgear.twoHanded(right)) {
				return {classid: worn.classid, tier: Infinity, isReplacable: false};
			}
		}

		return worn;
	},

	// Qolbot: take off what is worn in bodyLoc (the shield, before a two-handed weapon goes on): kept when a keep rule wants it, else held for the team
	// like any gear an upgrade replaced. True when the slot is empty afterwards.
	takeOff: function (bodyLoc) {
		var i, cursorItem, keepResult;

		for (i = 0; i < 3 && !getUnit(100); i += 1) {
			clickItem(0, bodyLoc);
			delay(me.ping * 2 + 500);
		}

		cursorItem = getUnit(100);

		if (!cursorItem) {
			return false;
		}

		keepResult = Pickit.checkItem(cursorItem).result;
		print("Equip: took off " + cursorItem.name + " to free both hands: " + ([1, 2, 3, 5].indexOf(keepResult) > -1 ? "stored" : "dropped for the others"));

		if ([1, 2, 3, 5].indexOf(keepResult) > -1) {
			this.putAway(cursorItem);
		} else {
			this.holdForTeam(cursorItem);
		}

		return !this.wornIn(me, bodyLoc);
	},

	// Qolbot: the tier of an item for the auto-equip rules. A bare armor slot (helm, body armor, belt, boots, gloves with nothing in it) is
	// the lenient case: any piece the keep rules gave no tier at all still beats wearing nothing, so it gets a tiny tier (1 plus its
	// defense / 1000, so the sturdiest piece goes first). Any real tier from the rules is higher, and replaces it later.
	gearTier: function (item) {
		var tier = NTIP.GetTier(item), loc;

		if (tier > 0 || !Config.AutoEquip) {
			return tier;
		}

		loc = this.getBodyLoc(item);

		if (loc && loc.length === 1 && [1, 3, 8, 9, 10].indexOf(loc[0]) > -1 && this.getEquippedItem(loc[0]).classid === -1) {
			return 1 + (item.getStatEx(31) || 0) / 1000;
		}

		return tier;
	},

	// Qolbot: KEEPER RULES TRUMP AUTOEQUIP RULES (the user, 2026-11-14, after Barabas took an Infernal Cranium, a set Cap, out of his stash and put it on;
	// "a bot can use anything in stash so long as it's not on a keeper list"):
	// an identified item a keep rule matches (the pickit's keep lists 1, cubing 2, runeword 3, crafting 5; not GoldSell's "sell" 4, and not the
	// autoequip tier lines) is kept for the player, never worn by a bot or its merc. An unidentified item is a keeper when a rule keeps it without
	// needing its stats ("[quality] == unique"): it stays unidentified (keptOutright); one whose rule needs the stats is identified first.
	isKeeper: function (item) {
		try {
			return [1, 2, 3, 5].indexOf(Pickit.checkItem(item).result) > -1;
		} catch (e) {
			return false;
		}
	},

	// Qolbot (the user, 2026-11-15: "i thought the NIP would qualify all sets and uniques as keepers outright, so no ID is required"): an unidentified
	// item a keep rule keeps without its stats (the Keeper tab's "[quality] == unique" / "[quality] == set") is stashed as it is, never identified.
	keptOutright: function (item) {
		try {
			return !item.getFlag(0x10) && Pickit.checkItem(item).result === 1;
		} catch (e) {
			return false;
		}
	},

	autoEquipCheck: function (item) {
		if (!Config.AutoEquip) {
			return false;
		}

		// Qolbot: the protected list (Settings tab) also means: never wear, so never an upgrade; and a keeper is kept, not worn
		if (!this.isReplacable(item) || this.isKeeper(item)) {
			return false;
		}

		var i, worn,
			tier = this.gearTier(item),
			bodyLoc = this.getBodyLoc(item);

		if (tier > 0 && bodyLoc) {
			for (i = 0; i < bodyLoc.length; i += 1) {
				worn = this.handSlot(item, bodyLoc[i]); // Qolbot: both hands for a two-handed weapon

				// Low tier items shouldn't be kept if they can't be equipped
				if (tier > worn.tier && (this.canEquip(item) || !item.getFlag(0x10)) && worn.isReplacable) {
					return true;
				}
			}
		}

		return false;
	},

	autoMercEquipCheck: function (item) {
		if (!Config.AutoMercEquip) {
			return false;
		}

		// Qolbot: the protected list (Settings tab) also means: never wear, so never an upgrade; and a keeper is kept, not worn
		if (!this.isReplacable(item) || this.isKeeper(item)) {
			return false;
		}

		// Qolbot: something this mercenary cannot wear (a Desert Guard has no use for a shield, no mercenary wears a ring) is no upgrade: the
		// equip step already refuses it, so the bot must not pick it up or keep it for the mercenary either
		if (!this.mercCanWear(item)) {
			return false;
		}

		var i,
			tier = NTIP.GetMercTier(item),
			bodyLoc = this.getBodyLoc(item);

		if (tier > 0 && bodyLoc) {
			for (i = 0; i < bodyLoc.length; i += 1) {
				// Low tier items shouldn't be kept if they can't be equipped
				if (tier > this.getMercEquippedItem(bodyLoc[i]).tier && (this.canMercEquip(item) || !item.getFlag(0x10)) && this.getMercEquippedItem(bodyLoc[i]).isReplacable) {
					return true;
				}
			}
		}

		return false;
	},

	// return value is irrelevant, this only scans and equips better tiered items in inventory -whipowill
	autoEquip: function () {
		if (!Config.AutoEquip) {
			return true;
		}

		var i, j, tier, bodyLoc, tome, gid, mercName, mercGid,
			items = me.findItems(-1, 0);

		if (!items) {
			return false;
		}

		function sortEq(a, b) {
			if (Item.canEquip(a)) {
				return -1;
			}

			if (Item.canEquip(b)) {
				return 1;
			}

			return 0;
		}

		me.cancel();

		// remove items from consideration w/out tier
		for (i = 0; i < items.length; i += 1) {
			if (this.gearTier(items[i]) === 0 || !Item.isReplacable(items[i]) || this.isKeeper(items[i])) { // protected categories are never worn; keepers stay kept
				items.splice(i, 1);

				i -= 1;
			}
		}

		while (items.length > 0) {
			items.sort(sortEq);

			tier = this.gearTier(items[0]);
			bodyLoc = this.getBodyLoc(items[0]);

			if (tier > 0 && bodyLoc)
			{
				for (j = 0; j < bodyLoc.length; j += 1)
				{
					// if ?? and new item is better and old item is not khalims will
					var worn = this.handSlot(items[0], bodyLoc[j]); // Qolbot: both hands for a two-handed weapon

					if ([3, 7].indexOf(items[0].location) > -1 && tier > worn.tier && worn.classid !== 174 && worn.isReplacable)
					{
						// if needs identification...
						if (!items[0].getFlag(0x10))
						{
							tome = me.findItem(519, 0, 3);

							if (tome && tome.getStat(70) > 0) {
								if (items[0].location === 7) {
									Town.openStash();
								}

								Town.identifyItem(items[0], tome);
							}
						}

						// equip the item
						var selfName = items[0].name, selfGid = items[0].gid, selfClassid = items[0].classid; // read before: the unit can go stale once worn

						if (this.equip(items[0], bodyLoc[j])) {
							if (typeof Speech === "object") {
								Speech.task("Equipping " + selfName + "."); // said with task reports on, in three ways (Speech.js)
							}
							print("Equipped " + selfName + " (gear upgrade)");
							// the stats for the Activity entry: the worn item by its slot (its gid can change when it is put on)
							try { Misc.logItem("Equipped", me.getItem(-1, -1, selfGid) || this.wornIn(me, bodyLoc[j], selfClassid)); } catch (selfLogError) { print("Equipped: " + selfLogError); }
						}

						break;
					}
				}
			}

			items.shift();
		}

		return true;
	},

	// What each mercenary can wear. Stock D2 is narrower; this is the wider list that qol.dll enables
	// ([mercenary] equip=1 in qol.ini): Rogue bows/crossbows; Desert Guard polearms/spears/javelins;
	// Iron Wolf shields, 1H swords, wands, scepters, maces, orbs; Barbarian swords/axes/maces/hammers.
	// Every merc: helms, armor, rings, amulets, boots, gloves, belts. A merc class we do not know is not restricted
	// here (a refused item is simply put back and not retried), so a wrong table can only cost a few tries.
	mercWeapons: {
		// Qolbot, 2026-11-14: the 1.13d rules (the old lists let a Rogue take a crossbow, an Iron Wolf a wand or a mace, a Barbarian an axe: picked up and
		// kept, never worn). UNTESTED live.
		271: [27],                       // Rogue Scout: bow (no crossbow, no Amazon bow)
		338: [33, 34],                   // Desert Guard: spear, polearm (no javelin, no Amazon spear)
		359: [2, 30],                    // Iron Wolf: shield, sword
		560: [30],                       // Barbarian: sword
		561: [30]
	},

	// QOL mod with qol.ini [mercenary] equip=1 (Config.MercQolEquip; its own words: "Rogue: bows, crossbows; Desert: polearms, spears (also Amazon),
	// javelins; Iron Wolf: shields, 1H swords, wands, scepters, maces, orbs; Barbarian: swords, axes, maces, hammers, Barbarian helms"). Amazon bows and
	// javelins are a guess (a refusal bars only that item). UNTESTED live.
	mercWeaponsQol: {
		271: [27, 35, 85],               // bow, crossbow, Amazon bow
		338: [33, 34, 86, 44, 87],       // spear, polearm, Amazon spear, javelin, Amazon javelin
		359: [2, 30, 25, 24, 36, 68],    // shield, sword, wand, scepter, mace, orb
		560: [30, 28, 36, 31],           // sword, axe, mace, hammer
		561: [30, 28, 36, 31]
	},

	mercCanWear: function (item) {
		var merc = me.getMerc(), weaponTypes = [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 42, 43, 44, 67, 68, 69, 72, 85, 86, 87, 88, 2, 70],
			allowed, extra;

		// rings, amulets, boots, gloves and belts: the base game gives a mercenary only a helm, body armor, a weapon and (Iron Wolf) a
		// shield. Some mods allow more; the Automation tab says which (Config.MercWear).
		extra = Config.MercWear || {};

		if ((item.itemType === 10 && !extra.rings) || (item.itemType === 12 && !extra.amulets) || (item.itemType === 15 && !extra.boots) ||
				(item.itemType === 16 && !extra.gloves) || (item.itemType === 19 && !extra.belts)) {
			return false;
		}

		// class gear: primal helms are the Barbarian's (only a Barbarian mercenary wears one), pelts are the Druid's and voodoo heads the Necromancer's
		// (a Barbarian merc wears a primal helm only in the QOL mod with equip=1; the base game gives it none)
		if (merc && ((item.itemType === 71 && ([560, 561].indexOf(merc.classid) === -1 || !Config.MercQolEquip)) || item.itemType === 72 || item.itemType === 69)) {
			return false;
		}

		if (!merc || weaponTypes.indexOf(item.itemType) === -1) {
			return true; // armor and belts are not class restricted
		}

		allowed = (Config.MercQolEquip ? this.mercWeaponsQol : this.mercWeapons)[merc.classid];

		if (!allowed) {
			if (!this.mercClassLogged) {
				this.mercClassLogged = true;
				print("mercCanWear: merc class " + merc.classid + " is not in the table, trying weapons by trial.");
			}

			return true;
		}

		return allowed.indexOf(item.itemType) > -1;
	},

	autoMercEquip: function () {
		if (!Config.AutoMercEquip) {
			return true;
		}

		var i, j, tier, bodyLoc, tome, gid,
			items = me.findItems(-1, 0);

		if (!items) {
			return false;
		}

		function sortEq(a, b) {
			if (Item.canMercEquip(a)) {
				return -1;
			}

			if (Item.canMercEquip(b)) {
				return 1;
			}

			return 0;
		}

		me.cancel();

		// Remove items without tier
		for (i = 0; i < items.length; i += 1) {
			if (NTIP.GetMercTier(items[i]) === 0 || !Item.isReplacable(items[i]) || this.isKeeper(items[i])) {
				items.splice(i, 1);

				i -= 1;
			}
		}

		var report = typeof Throttle === "object" ? Throttle.due("mercreport", 120000) : true;

		if (report) print("autoMercEquip: merc " + (me.getMerc() ? me.getMerc().name + " (class " + me.getMerc().classid + ")" : "none") + ", " + items.length + " item(s) with a merc tier");

		for (i = 0; report && i < items.length; i += 1) {
			bodyLoc = this.getBodyLoc(items[i]);
			print("autoMercEquip: candidate " + items[i].name + " (type " + items[i].itemType + ", quality " + items[i].quality + ") tier " + NTIP.GetMercTier(items[i]) +
				(bodyLoc ? " vs slot " + bodyLoc[0] + " tier " + this.getMercEquippedItem(bodyLoc[0]).tier : " (no slot)") +
				", merc can wear: " + this.mercCanWear(items[i]) + ", can equip: " + this.canMercEquip(items[i]));
		}

		while (items.length > 0) {
			items.sort(sortEq);

			if (!this.mercCanWear(items[0])) {
				items.shift();

				continue;
			}

			tier = NTIP.GetMercTier(items[0]);
			bodyLoc = this.getBodyLoc(items[0]);

			if (tier > 0 && bodyLoc) {
				for (j = 0; j < bodyLoc.length; j += 1) {
					if ([3, 7].indexOf(items[0].location) > -1 && tier > this.getMercEquippedItem(bodyLoc[j]).tier && this.getMercEquippedItem(bodyLoc[j]).classid !== 174 && this.getMercEquippedItem(bodyLoc[j]).isReplacable) { // khalim's will adjustment
						if (!items[0].getFlag(0x10)) { // unid
							tome = me.findItem(519, 0, 3);

							if (tome && tome.getStat(70) > 0) {
								if (items[0].location === 7) {
									Town.openStash();
								}

								Town.identifyItem(items[0], tome);
							}
						}

						// equip the item
						var mercName = items[0].name, mercClassid = items[0].classid; // read before: the unit is stale once the merc wears it

						if (this.mercEquip(items[0], bodyLoc[j])) {
							say("Equipping merc w/ " + mercName + ".");
							print("Equipped " + mercName + " on the mercenary");
							try { Misc.logItem("Merc Equipped", this.wornIn(me.getMerc(), bodyLoc[j], mercClassid)); } catch (mercLogError) { print("Merc Equipped: " + mercLogError); }

							break;
						}
						// refused in this slot: try the next one (rings have two)
					}
				}
			}

			items.shift();
		}

		return true;
	}
};

var Misc = {
	// Click something
	click: function (button, shift, x, y) {
		if (arguments.length < 2) {
			throw new Error("Misc.click: Needs at least 2 arguments.");
		}

		while (!me.gameReady) {
			delay(100);
		}

		switch (arguments.length) {
		case 2:
			clickMap(button, shift, me.x, me.y);
			delay(20);
			clickMap(button + 2, shift, me.x, me.y);

			break;
		case 3:
			if (typeof (x) !== "object") {
				throw new Error("Misc.click: Third arg must be a Unit.");
			}

			clickMap(button, shift, x);
			delay(20);
			clickMap(button + 2, shift, x);

			break;
		case 4:
			clickMap(button, shift, x, y);
			delay(20);
			clickMap(button + 2, shift, x, y);

			break;
		}

		return true;
	},

	// Check if a player is in your party
	inMyParty: function (name) {
		if (me.name === name) {
			return true;
		}

		while (!me.gameReady) {
			delay(100);
		}

		var player, myPartyId;

		try {
			player = getParty();

			if (!player) {
				return false;
			}

			myPartyId = player.partyid;
			player = getParty(name); // May throw an error

			if (player && player.partyid !== 65535 && player.partyid === myPartyId) {
				return true;
			}
		} catch (e) {
			player = getParty();

			if (player) {
				myPartyId = player.partyid;

				while (player.getNext()) {
					if (player.partyid !== 65535 && player.partyid === myPartyId) {
						return true;
					}
				}
			}
		}

		return false;
	},

	// Get number of players within getUnit distance
	getNearbyPlayerCount: function () {
		var count = 0,
			player = getUnit(0);

		if (player) {
			do {
				if (!player.dead) {
					count += 1;
				}
			} while (player.getNext());
		}

		return count;
	},

	// Get total number of players in game
	getPlayerCount: function () {
		var count = 0,
			party = getParty();

		if (party) {
			do {
				count += 1;
			} while (party.getNext());
		}

		return count;
	},

	// Open a chest Unit
	openChest: function (unit) {
		// Skip invalid and Countess chests
		if (!unit || unit.x === 12526 || unit.x === 12565) {
			return false;
		}

		// already open
		if (unit.mode) {
			return true;
		}

		// locked chest, no keys
		if (me.classid !== 6 && unit.islocked && !me.findItem(543, 0, 3)) {
			return false;
		}

		var i, tick;

		for (i = 0; i < 3; i += 1) {
			if (Pather.moveTo(unit.x + 1, unit.y + 2, 3) && getDistance(me, unit.x + 1, unit.y + 2) < 5) {
				//Misc.click(0, 0, unit);
				sendPacket(1, 0x13, 4, unit.type, 4, unit.gid);
			}

			tick = getTickCount();

			while (getTickCount() - tick < 1000) {
				if (unit.mode) {
					return true;
				}

				delay(10);
			}
		}

		if (!me.idle) {
			Misc.click(0, 0, me.x, me.y); // Click to stop walking in case we got stuck
		}

		return false;
	},

	// Open all chests that have preset units in an area
	openChestsInArea: function (area, chestIds) {
		var i, coords, presetUnits;

		if (!area) {
			area = me.area;
		}

		// testing
		if (area !== me.area) {
			Pather.journeyTo(area);
		}

		coords = [];
		presetUnits = getPresetUnits(area, 2);

		if (!chestIds) {
			chestIds = [
				5, 6, 87, 104, 105, 106, 107, 143, 140, 141, 144, 146, 147, 148, 176, 177, 181, 183, 198, 240, 241,
				242, 243, 329, 330, 331, 332, 333, 334, 335, 336, 354, 355, 356, 371, 387, 389, 390, 391, 397, 405,
				406, 407, 413, 420, 424, 425, 430, 431, 432, 433, 454, 455, 501, 502, 504, 505, 580, 581
			];
		}

		if (!presetUnits) {
			return false;
		}

		while (presetUnits.length > 0) {
			if (chestIds.indexOf(presetUnits[0].id) > -1) {
				coords.push({
					x: presetUnits[0].roomx * 5 + presetUnits[0].x,
					y: presetUnits[0].roomy * 5 + presetUnits[0].y
				});
			}

			presetUnits.shift();
		}

		while (coords.length) {
			coords.sort(Sort.units);
			Pather.moveToUnit(coords[0], 1, 2);
			this.openChests(20);

			for (i = 0; i < coords.length; i += 1) {
				if (getDistance(coords[i].x, coords[i].y, coords[0].x, coords[0].y) < 20) {
					coords.shift();
				}
			}
		}

		return true;
	},

	openChests: function (range) {
		var unit,
			unitList = [],
			containers = ["chest", "chest3", "armorstand", "weaponrack"];

		if (!range) {
			range = 15;
		}

		// Testing all container code
		if (Config.OpenChests === 2) {
			containers = [
				"chest", "loose rock", "hidden stash", "loose boulder", "corpseonstick", "casket", "armorstand", "weaponrack", "barrel", "holeanim", "tomb2",
				"tomb3", "roguecorpse", "ratnest", "corpse", "goo pile", "largeurn", "urn", "chest3", "jug", "skeleton", "guardcorpse", "sarcophagus", "object2",
				"cocoon", "basket", "stash", "hollow log", "hungskeleton", "pillar", "skullpile", "skull pile", "jar3", "jar2", "jar1", "bonechest", "woodchestl",
				"woodchestr", "barrel wilderness", "burialchestr", "burialchestl", "explodingchest", "chestl", "chestr", "groundtomb", "icecavejar1", "icecavejar2",
				"icecavejar3", "icecavejar4", "deadperson", "deadperson2", "evilurn", "tomb1l", "tomb3l", "groundtombl"
			];
		}

		unit = getUnit(2);

		if (unit) {
			do {
				if (unit.name && unit.mode === 0 && getDistance(me.x, me.y, unit.x, unit.y) <= range && containers.indexOf(unit.name.toLowerCase()) > -1) {
					unitList.push(copyUnit(unit));
				}
			} while (unit.getNext());
		}

		while (unitList.length > 0) {
			unitList.sort(Sort.units);

			unit = unitList.shift();

			if (unit && (Pather.useTeleport || !checkCollision(me, unit, 0x4)) && this.openChest(unit)) {
				Pickit.pickItems();
			}
		}

		return true;
	},

	shrineStates: false,

	scanShrines: function (range) {
		if (!Config.ScanShrines.length) {
			return false;
		}

		if (!range) {
			range = Pather.useTeleport ? 25 : 15;
		}

		var i, j, shrine,
			index  = -1,
			shrineList = [];

		// Initiate shrine states
		if (!this.shrineStates) {
			this.shrineStates = [];

			for (i = 0; i < Config.ScanShrines.length; i += 1) {
				switch (Config.ScanShrines[i]) {
				case 0: // None
				case 1: // Refilling
				case 2: // Health
				case 3: // Mana
				case 4: // Health Exchange (doesn't exist)
				case 5: // Mana Exchange (doesn't exist)
				case 16: // Enirhs (doesn't exist)
				case 17: // Portal
				case 18: // Gem
				case 19: // Fire
				case 20: // Monster
				case 21: // Exploding
				case 22: // Poison
					this.shrineStates[i] = 0; // no state

					break;
				case 6: // Armor
				case 7: // Combat
				case 8: // Resist Fire
				case 9: // Resist Cold
				case 10: // Resist Lightning
				case 11: // Resist Poison
				case 12: // Skill
				case 13: // Mana recharge
				case 14: // Stamina
				case 15: // Experience
					// Both states and shrines are arranged in same order with armor shrine starting at 128
					this.shrineStates[i] = Config.ScanShrines[i] + 122;

					break;
				}
			}
		}

		shrine = getUnit(2, "shrine");

		if (shrine) {
			// Build a list of nearby shrines
			do {
				if (shrine.mode === 0 && getDistance(me.x, me.y, shrine.x, shrine.y) <= range) {
					shrineList.push(copyUnit(shrine));
				}
			} while (shrine.getNext());

			// Check if we have a shrine state, store its index if yes
			for (i = 0; i < this.shrineStates.length; i += 1) {
				if (me.getState(this.shrineStates[i])) {
					index = i;

					break;
				}
			}

			for (i = 0; i < Config.ScanShrines.length; i += 1) {
				for (j = 0; j < shrineList.length; j += 1) {
					// Get the shrine if we have no active state or to refresh current state or if the shrine has no state
					// Don't override shrine state with a lesser priority shrine
					if (index === -1 || i <= index || this.shrineStates[i] === 0) {
						if (shrineList[j].objtype === Config.ScanShrines[i] && (Pather.useTeleport || !checkCollision(me, shrineList[j], 0x4))) {
							this.getShrine(shrineList[j]);

							// Gem shrine - pick gem
							if (Config.ScanShrines[i] === 18) {
								Pickit.pickItems();
							}
						}
					}
				}
			}
		}

		return true;
	},

	// Use a shrine Unit
	getShrine: function (unit) {
		if (unit.mode) {
			return false;
		}

		var i, tick;

		for (i = 0; i < 3; i += 1) {
			if (getDistance(me, unit) < 4 || Pather.moveToUnit(unit, 3, 0)) {
				Misc.click(0, 0, unit);
				//unit.interact();
			}

			tick = getTickCount();

			while (getTickCount() - tick < 1000) {
				if (unit.mode) {
					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	// Check all shrines in area and get the first one of specified type
	getShrinesInArea: function (area, type, use) {
		var i, coords, shrine,
			shrineLocs = [],
			shrineIds = [2, 81, 83],
			unit = getPresetUnits(area);

		if (unit) {
			for (i = 0; i < unit.length; i += 1) {
				if (shrineIds.indexOf(unit[i].id) > -1) {
					shrineLocs.push([unit[i].roomx * 5 + unit[i].x, unit[i].roomy * 5 + unit[i].y]);
				}
			}
		}

		while (shrineLocs.length > 0) {
			shrineLocs.sort(Sort.points);

			coords = shrineLocs.shift();

			Pather.moveTo(coords[0], coords[1], 2);

			shrine = getUnit(2, "shrine");

			if (shrine) {
				do {
					if (shrine.objtype === type && shrine.mode === 0) {
						Pather.moveTo(shrine.x - 2, shrine.y - 2);

						if (!use || this.getShrine(shrine)) {
							return true;
						}
					}
				} while (shrine.getNext());
			}
		}

		return false;
	},

	getItemDesc: function (unit) {
		var i, desc,
			stringColor = "";

		desc = unit.description;

		if (!desc) {
			return "";
		}

		desc = desc.split("\n");

		// Lines are normally in reverse. Add color tags if needed and reverse order.
		for (i = 0; i < desc.length; i += 1) {
			if (desc[i].indexOf(getLocaleString(3331)) > -1) { // Remove sell value
				desc.splice(i, 1);

				i -= 1;
			} else {
				if (desc[i].match(/^(y|ÿ)c/)) {
					stringColor = desc[i].substring(0, 3);
				} else {
					desc[i] = stringColor + desc[i];
				}
			}

			desc[i] = desc[i].replace(/(y|ÿ)c([0-9!"+<;.*])/g, "\\xffc$2");
		}

		if (desc[desc.length - 1]) {
			//desc[desc.length - 1] = desc[desc.length - 1].trim() + " (" + unit.ilvl + ")";
			desc[desc.length - 1] = desc[desc.length - 1].trim();
		}

		desc = desc.reverse().join("\n");

		return desc;
	},

	getItemSockets: function (unit) {
		var i, code,
			sockets = unit.getStat(194),
			subItems = unit.getItems(),
			tempArray = [];

		if (subItems) {
			switch (unit.sizex) {
			case 2:
				switch (unit.sizey) {
				case 3: // 2 x 3
					switch (sockets) {
					case 4:
						tempArray = [subItems[0], subItems[3], subItems[2], subItems[1]];

						break;
					case 5:
						tempArray = [subItems[1], subItems[4], subItems[0], subItems[3], subItems[2]];

						break;
					case 6:
						tempArray = [subItems[0], subItems[3], subItems[1], subItems[4], subItems[2], subItems[5]];

						break;
					}

					break;
				case 4: // 2 x 4
					switch (sockets) {
					case 5:
						tempArray = [subItems[1], subItems[4], subItems[0], subItems[3], subItems[2]];

						break;
					case 6:
						tempArray = [subItems[0], subItems[3], subItems[1], subItems[4], subItems[2], subItems[5]];

						break;
					}

					break;
				}

				break;
			}

			if (tempArray.length === 0 && subItems.length > 0) {
				tempArray = subItems.slice(0);
			}
		}

		for (i = 0; i < sockets; i += 1) {
			if (tempArray[i]) {
				code = tempArray[i].code;

				if ([10, 12, 58, 82, 83, 84].indexOf(tempArray[i].itemType) > -1) {
					code += (tempArray[i].gfx + 1);
				}
			} else {
				code = "gemsocket";
			}

			tempArray[i] = code;
		}

		return tempArray;
	},

	useItemLog: true, // Might be a bit dirty

	// AUDIT of the rule "a bot only touches items it picked up itself" (user, 2026-11-13). Every item the bot picks up is noted (class|quality|item level)
	// in data/<profile>.picked.json; every sale and every stash step then prints one "Audit:" line saying whether the item is in that record. A line that
	// ends in "<-- check" is an item the bot sold or stashed without a record of picking it up (yours, bought, or from before the record). Logging only:
	// nothing is blocked. NOTE: only charms, tomes, keys, the cube and quest items have a "mine or yours" check in the code (userOwned); everything else in a
	// pack is touched unless its kind is protected on the Settings page, so this is how to see whether that is good enough.
	pickedSig: function (item) {
		return item.classid + "|" + item.quality + "|" + item.ilvl;
	},

	pickedList: function () {
		var text;

		if (!this.pickedCache) {
			this.pickedCache = [];

			try {
				if (FileTools.exists("data/" + me.profile + ".picked.json")) {
					text = this.fileAction("data/" + me.profile + ".picked.json", 0);
					this.pickedCache = JSON.parse(text) || [];
				}
			} catch (e) {
				this.pickedCache = [];
			}
		}

		return this.pickedCache;
	},

	pickedSave: function () {
		try {
			this.fileAction("data/" + me.profile + ".picked.json", 1, JSON.stringify(this.pickedList()));
		} catch (e) {
			print("picked list: " + e);
		}
	},

	notePicked: function (item) {
		var list = this.pickedList();

		list.push(this.pickedSig(item));

		if (list.length > 600) {
			list.shift();
		}

		this.pickedSave();
	},

	auditTouch: function (action, item, text) {
		var i, how, list;

		if ((action !== "Sold" && action !== "Stashed") || !item || text === "Gambling") { // gambled items were bought, not picked up
			return;
		}

		list = this.pickedList();
		i = list.indexOf(this.pickedSig(item));

		if (typeof Pickit === "object" && Pickit.pickedGids && Pickit.pickedGids[item.gid]) {
			how = "picked up by me in this game";
		} else if (i > -1) {
			how = "picked up by me earlier (the same kind of item is in my record)";
		} else {
			how = "NOT IN MY PICK-UP RECORD <-- check";
		}

		if (action === "Sold" && i > -1) { // it left the pack: one record less
			list.splice(i, 1);
			this.pickedSave();
		}

		print("Audit: " + action + " " + item.name + " (quality " + item.quality + ", ilvl " + item.ilvl + "): " + how);
	},

	itemLogger: function (action, unit, text) {
		try {
			this.auditTouch(action, unit, text);
		} catch (auditError) {
			print("Audit: " + auditError);
		}

		if (!Config.ItemInfo || !this.useItemLog) {
			return false;
		}

		var desc,
			date = new Date(),
			h = date.getHours(),
			m = date.getMinutes(),
			s = date.getSeconds(),
			dateString = "[" + (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s) + "]";

		switch (action) {
		case "Sold":
			if (Config.ItemInfoQuality.indexOf(unit.quality) === -1) {
				return false;
			}

			desc = this.getItemDesc(unit).split("\n").join(" | ").replace(/(\\xff|ÿ)c[0-9!"+<;.*]/gi, "").trim();

			break;
		case "Kept":
		case "Field Kept":
		case "Runeword Kept":
		case "Cubing Kept":
		case "Shopped":
		case "Gambled":
		case "Dropped":
			desc = this.getItemDesc(unit).split("\n").join(" | ").replace(/(\\xff|ÿ)c[0-9!"+<;.*]/gi, "").trim();

			break;
		case "No room for":
			desc = unit.name;

			break;
		default:
			desc = unit.fname.split("\n").reverse().join(" ").replace(/(\\xff|ÿ)c[0-9!"+<;.*]/gi, "").trim();

			break;
		}

		return this.fileAction("logs/ItemLog.txt", 2, dateString + " <" + me.profile + "> <" + action + "> (" + Pickit.itemQualityToName(unit.quality) + ") " + desc + (text ? " {" + text + "}" : "") + "\n");
	},

	// Log kept item stats in the manager.
	logItem: function (action, unit, keptLine) {
		if (!this.useItemLog) {
			return false;
		}

		// an item unit that is no longer valid (it was picked up or moved while the bot was busy) has no name: nothing to log, and the exception ended a whole
		// script run ("unit.fname is undefined", Pickit.fastPick, 16:28 on 2026-11-13)
		if (!unit || unit.fname === undefined) {
			return false;
		}

		var i, lastArea, code, desc, sock, itemObj,
			color = -1,
			name = unit.fname.split("\n").reverse().join(" ").replace(/ÿc[0-9!"+<;.*]/, "").trim();

		desc = this.getItemDesc(unit);
		color = unit.getColor();

		if (action.match("kept", "i")) {
			lastArea = DataFile.getStats().lastArea;

			if (lastArea) {
				desc += ("\n\\xffc0Area: " + lastArea);
			}
		}

		if (unit.getFlag(0x10)) {
			switch (unit.quality) {
			case 5: // Set
				switch (unit.classid) {
				case 27: // Angelic sabre
					code = "inv9sbu";

					break;
				case 74: // Arctic short war bow
					code = "invswbu";

					break;
				case 308: // Berserker's helm
					code = "invhlmu";

					break;
				case 330: // Civerb's large shield
					code = "invlrgu";

					break;
				case 31: // Cleglaw's long sword
				case 227: // Szabi's cryptic sword
					code = "invlsdu";

					break;
				case 329: // Cleglaw's small shield
					code = "invsmlu";

					break;
				case 328: // Hsaru's buckler
					code = "invbucu";

					break;
				case 306: // Infernal cap / Sander's cap
					code = "invcapu";

					break;
				case 30: // Isenhart's broad sword
					code = "invbsdu";

					break;
				case 309: // Isenhart's full helm
					code = "invfhlu";

					break;
				case 333: // Isenhart's gothic shield
					code = "invgtsu";

					break;
				case 326: // Milabrega's ancient armor
				case 442: // Immortal King's sacred armor
					code = "invaaru";

					break;
				case 331: // Milabrega's kite shield
					code = "invkitu";

					break;
				case 332: // Sigon's tower shield
					code = "invtowu";

					break;
				case 325: // Tancred's full plate mail
					code = "invfulu";

					break;
				case 3: // Tancred's military pick
					code = "invmpiu";

					break;
				case 113: // Aldur's jagged star
					code = "invmstu";

					break;
				case 234: // Bul-Kathos' colossus blade
					code = "invgsdu";

					break;
				case 372: // Grizwold's ornate plate
					code = "invxaru";

					break;
				case 366: // Heaven's cuirass
				case 215: // Heaven's reinforced mace
				case 449: // Heaven's ward
				case 426: // Heaven's spired helm
					code = "inv" + unit.code + "s";

					break;
				case 357: // Hwanin's grand crown
					code = "invxrnu";

					break;
				case 195: // Nalya's scissors suwayyah
					code = "invskru";

					break;
				case 395: // Nalya's grim helm
				case 465: // Trang-Oul's bone visage
					code = "invbhmu";

					break;
				case 261: // Naj's elder staff
					code = "invcstu";

					break;
				case 375: // Orphan's round shield
					code = "invxmlu";

					break;
				case 12: // Sander's bone wand
					code = "invbwnu";

					break;
				}

				break;
			case 7: // Unique
				for (i = 0; i < 401; i += 1) {
					if (unit.fname.split("\n").reverse()[0].indexOf(getLocaleString(getBaseStat(17, i, 2))) > -1) {
						code = getBaseStat(17, i, "invfile");

						break;
					}
				}

				break;
			}
		}

		if (!code) {
			if (["ci2", "ci3"].indexOf(unit.code) > -1) { // Tiara/Diadem
				code = unit.code;
			} else {
				code = getBaseStat(0, unit.classid, 'normcode') || unit.code;
			}

			code = code.replace(" ", "");

			if ([10, 12, 58, 82, 83, 84].indexOf(unit.itemType) > -1) {
				code += (unit.gfx + 1);
			}
		}

		sock = unit.getItem();

		if (sock) {
			do {
				if (sock.itemType === 58) {
					desc += "\n\n";
					desc += this.getItemDesc(sock);
				}
			} while (sock.getNext());
		}

		if (keptLine) {
			desc += ("\n\\xffc0Line: " + keptLine);
		}

		itemObj = {
			title: action + " " + name,
			description: desc,
			image: code,
			textColor: unit.quality,
			itemColor: color,
			header: "",
			sockets: this.getItemSockets(unit)
		};

		D2Bot.printToItemLog(itemObj);

		return true;
	},

	// Change into werewolf or werebear
	shapeShift: function (mode) {
		var i, tick, skill, state;

		switch (mode.toString().toLowerCase()) {
		case "0":
			return false;
		case "1":
		case "werewolf":
			state = 139;
			skill = 223;

			break;
		case "2":
		case "werebear":
			state = 140;
			skill = 228;

			break;
		default:
			throw new Error("shapeShift: Invalid parameter");
		}

		if (me.getState(state)) {
			return true;
		}

		for (i = 0; i < 3; i += 1) {
			Skill.cast(skill, 0);

			tick = getTickCount();

			while (getTickCount() - tick < 2000) {
				if (me.getState(state)) {
					delay(250);

					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	// Change back to human shape
	unShift: function () {
		var i, tick;

		if (me.getState(139) || me.getState(140)) {
			for (i = 0; i < 3; i += 1) {
				Skill.cast(me.getState(139) ? 223 : 228);

				tick = getTickCount();

				while (getTickCount() - tick < 2000) {
					if (!me.getState(139) && !me.getState(140)) {
						delay(250);

						return true;
					}

					delay(10);
				}
			}
		} else {
			return true;
		}

		return false;
	},

	// Teleport with slot II
	teleSwitch: function () {
		this.oldSwitch = me.weaponswitch;

		Precast.weaponSwitch();

		return true;
	},

	// Go to town when low on hp/mp or when out of potions. can be upgraded to check for curses etc.
	townCheck: function () {
		var i, potion, check,
			needhp = true,
			needmp = true;

		// Can't tp from uber trist or when dead
		if (me.area === 136 || me.dead) {
			return false;
		}

		if (Config.TownCheck && !me.inTown) {
			try {
				if (me.gold > 1000) {
					for (i = 0; i < 4; i += 1) {
						if (Config.BeltColumn[i] === "hp" && Config.MinColumn[i] > 0) {
							potion = me.getItem(-1, 2); // belt item

							if (potion) {
								do {
									if (potion.code.indexOf("hp") > -1) {
										needhp = false;

										break;
									}
								} while (potion.getNext());
							}

							if (needhp) {
								print("We need healing potions");

								check = true;
							}
						}

						if (Config.BeltColumn[i] === "mp" && Config.MinColumn[i] > 0) {
							potion = me.getItem(-1, 2); // belt item

							if (potion) {
								do {
									if (potion.code.indexOf("mp") > -1) {
										needmp = false;

										break;
									}
								} while (potion.getNext());
							}

							if (needmp) {
								print("We need mana potions");

								check = true;
							}
						}
					}
				}

				if (Config.OpenChests && Town.needKeys()) {
					check = true;
				}
			} catch (e) {
				check = false;
			}
		}

		if (check) {
			scriptBroadcast("townCheck");
			delay(500);

			return true;
		}

		return false;
	},

	// Log someone's gear
	spy: function (name) {
		if (!isIncluded("oog.js")) {
			include("oog.js");
		}

		if (!isIncluded("common/prototypes.js")) {
			include("common/prototypes.js");
		}

		var item,
			unit = getUnit(-1, name);

		if (!unit) {
			print("player not found");

			return false;
		}

		item = unit.getItem();

		if (item) {
			do {
				this.logItem(unit.name, item);
			} while (item.getNext());
		}

		return true;
	},

	// hopefully multi-thread and multi-profile friendly txt func
	/*fileAction: function (path, mode, msg) {
		var i, file,
			contents = "";

MainLoop:
		for (i = 0; i < 30; i += 1) {
			try {
				file = File.open(path, mode);

				switch (mode) {
				case 0: // read
					contents = file.readLine();

					break MainLoop;
				case 1: // write
				case 2: // append
					file.write(msg);

					break MainLoop;
				}
			} catch (e) {

			} finally {
				if (file) {
					file.close();
				}
			}

			delay(100);
		}

		return mode === 0 ? contents : true;
	},*/

	fileAction: function (path, mode, msg) {
		var i,
			contents = "";

MainLoop:
		for (i = 0; i < 30; i += 1) {
			try {
				switch (mode) {
				case 0: // read
					contents = FileTools.readText(path);

					break MainLoop;
				case 1: // write
					FileTools.writeText(path, msg);

					break MainLoop;
				case 2: // append
					FileTools.appendText(path, msg);

					break MainLoop;
				}
			} catch (e) {

			}

			delay(100);
		}

		return mode === 0 ? contents : true;
	},

	errorConsolePrint: true,
	screenshotErrors: false,

	// Report script errors to logs/ScriptErrorLog.txt
	errorReport: function (error, script) {
		var i, h, m, s, date, msg, oogmsg, filemsg, source, stack,
			stackLog = "";

		date = new Date();
		h = date.getHours();
		m = date.getMinutes();
		s = date.getSeconds();

		if (typeof error === "string") {
			msg = error;
			oogmsg = error.replace(/ÿc[0-9!"+<;.*]/gi, "");
			filemsg = "[" + (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s) + "] <" + me.profile + "> " + error.replace(/ÿc[0-9!"+<;.*]/gi, "") + "\n";
		} else {
			source = error.fileName.substring(error.fileName.lastIndexOf("\\") + 1, error.fileName.length);
			msg = "ÿc1Error in ÿc0" + script + " ÿc1(" + source + " line ÿc1" + error.lineNumber + "): ÿc1" + error.message;
			oogmsg = " Error in " + script + " (" + source + " #" + error.lineNumber + ") " + error.message + " (Area: " + me.area + ", Ping:" + me.ping + ", Game: " + me.gamename + ")";
			filemsg = "[" + (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s) + "] <" + me.profile + "> " + msg.replace(/ÿc[0-9!"+<;.*]/gi, "") + "\n";

			if (error.hasOwnProperty("stack")) {
				stack = error.stack;

				if (stack) {
					stack = stack.split("\n");

					if (stack && typeof stack === "object") {
						stack.reverse();
					}

					for (i = 0; i < stack.length; i += 1) {
						if (stack[i]) {
							stackLog += stack[i].substr(0, stack[i].indexOf("@") + 1) + stack[i].substr(stack[i].lastIndexOf("\\") + 1, stack[i].length - 1);

							if (i < stack.length - 1) {
								stackLog += ", ";
							}
						}
					}
				}
			}

			if (stackLog) {
				filemsg += "Stack: " + stackLog + "\n";
			}
		}

		if (this.errorConsolePrint) {
			D2Bot.printToConsole(oogmsg, 10);
		}

		showConsole();
		print(msg);
		this.fileAction("logs/ScriptErrorLog.txt", 2, filemsg);

		if (this.screenshotErrors) {
			takeScreenshot();
			delay(500);
		}
	},

	debugLog: function (msg) {
		if (!Config.Debug) {
			return;
		}

		debugLog(me.profile + ": " + msg);
	},

	// Use a NPC menu. Experimental function, subject to change
	// id = string number (with exception of Ressurect merc). http://www.blizzhackers.cc/viewtopic.php?f=209&t=378493
	useMenu: function (id) {
		//print("useMenu " + getLocaleString(id));

		var i, npc, lines;

		switch (id) {
		case 0x1507: // Resurrect (non-English dialog)
		case 0x0D44: // Trade (crash dialog)
			npc = getInteractedNPC();

			if (npc) {
				npc.useMenu(id);
				delay(750);

				return true;
			}

			break;
		}

		lines = getDialogLines();

		if (!lines) {
			return false;
		}

		for (i = 0; i < lines.length; i += 1) {
			if (lines[i].selectable && lines[i].text.indexOf(getLocaleString(id)) > -1) {
				getDialogLines()[i].handler();
				delay(750);

				return true;
			}
		}

		return false;
	},

	clone: function (obj) {
		var i, copy, attr;

		// Handle the 3 simple types, and null or undefined
		if (null === obj || "object" !== typeof obj) {
			return obj;
		}

		// Handle Date
		if (obj instanceof Date) {
			copy = new Date();

			copy.setTime(obj.getTime());

			return copy;
		}

		// Handle Array
		if (obj instanceof Array) {
			copy = [];

			for (i = 0; i < obj.length; i += 1) {
				copy[i] = this.clone(obj[i]);
			}

			return copy;
		}

		// Handle Object
		if (obj instanceof Object) {
			copy = {};

			for (attr in obj) {
				if (obj.hasOwnProperty(attr)) {
					copy[attr] = this.clone(obj[attr]);
				}
			}

			return copy;
		}

		throw new Error("Unable to copy obj! Its type isn't supported.");
	},

	copy: function (from) {
		var i,
			obj = {};

		for (i in from) {
			if (from.hasOwnProperty(i)) {
				obj[i] = this.clone(from[i]);
			}
		}

		return obj;
	}
};

var Sort = {
	// Sort units by comparing distance between the player
	units: function (a, b) {
		return Math.round(getDistance(me.x, me.y, a.x, a.y)) - Math.round(getDistance(me.x, me.y, b.x, b.y));
	},

	// Sort preset units by comparing distance between the player (using preset x/y calculations)
	presetUnits: function (a, b) {
		return getDistance(me, a.roomx * 5 + a.x, a.roomy * 5 + a.y) - getDistance(me, b.roomx * 5 + b.x, b.roomy * 5 + b.y);
	},

	// Sort arrays of x,y coords by comparing distance between the player
	points: function (a, b) {
		return getDistance(me, a[0], a[1]) - getDistance(me, b[0], b[1]);
	},

	numbers: function (a, b) {
		return a - b;
	}
};

var Experience = {
	totalExp: [0, 0, 500, 1500, 3750, 7875, 14175, 22680, 32886, 44396, 57715, 72144, 90180, 112725, 140906, 176132, 220165, 275207, 344008, 430010, 537513, 671891, 839864, 1049830, 1312287, 1640359, 2050449, 2563061, 3203826, 3902260, 4663553, 5493363, 6397855, 7383752, 8458379, 9629723, 10906488, 12298162, 13815086, 15468534, 17270791, 19235252, 21376515, 23710491, 26254525, 29027522, 32050088, 35344686, 38935798, 42850109, 47116709, 51767302, 56836449, 62361819, 68384473, 74949165, 82104680, 89904191, 98405658, 107672256, 117772849, 128782495, 140783010, 153863570, 168121381, 183662396, 200602101, 219066380, 239192444, 261129853, 285041630, 311105466, 339515048, 370481492, 404234916, 441026148, 481128591, 524840254, 572485967, 624419793, 681027665, 742730244, 809986056, 883294891, 963201521, 1050299747, 1145236814, 1248718217, 1361512946, 1484459201, 1618470619, 1764543065, 1923762030, 2097310703, 2286478756, 2492671933, 2717422497, 2962400612, 3229426756, 3520485254, 0, 0],
	nextExp: [0, 500, 1000, 2250, 4125, 6300, 8505, 10206, 11510, 13319, 14429, 18036, 22545, 28181, 35226, 44033, 55042, 68801, 86002, 107503, 134378, 167973, 209966, 262457, 328072, 410090, 512612, 640765, 698434, 761293, 829810, 904492, 985897, 1074627, 1171344, 1276765, 1391674, 1516924, 1653448, 1802257, 1964461, 2141263, 2333976, 2544034, 2772997, 3022566, 3294598, 3591112, 3914311, 4266600, 4650593, 5069147, 5525370, 6022654, 6564692, 7155515, 7799511, 8501467, 9266598, 10100593, 11009646, 12000515, 13080560, 14257811, 15541015, 16939705, 18464279, 20126064, 21937409, 23911777, 26063836, 28409582, 30966444, 33753424, 36791232, 40102443, 43711663, 47645713, 51933826, 56607872, 61702579, 67255812, 73308835, 79906630, 87098226, 94937067, 103481403, 112794729, 122946255, 134011418, 146072446, 159218965, 173548673, 189168053, 206193177, 224750564, 244978115, 267026144, 291058498, 0, 0],

	// Percent progress into the current level. Format: xx.xx%
	progress: function () {
		return me.getStat(12) === 99 ? 0 : (((me.getStat(13) - this.totalExp[me.getStat(12)]) / this.nextExp[me.getStat(12)]) * 100).toFixed(2);
	},

	// Total experience gained in current run
	gain: function () {
		return (me.getStat(13) - DataFile.getStats().experience);
	},

	// Percent experience gained in current run
	gainPercent: function () {
		return me.getStat(12) === 99 ? 0 : (this.gain() * 100 / this.nextExp[me.getStat(12)]).toFixed(6);
	},

	// Runs until next level
	runsToLevel: function () {
		return Math.round(((100 - this.progress()) / 100) * this.nextExp[me.getStat(12)] / this.gain());
	},

	// Total runs needed for next level (not counting current progress)
	totalRunsToLevel: function () {
		return Math.round(this.nextExp[me.getStat(12)] / this.gain());
	},

	// Total time till next level
	timeToLevel: function () {
		var tTLrawSeconds = (Math.floor((getTickCount() - me.gamestarttime) / 1000)).toString(),
			tTLrawtimeToLevel = this.runsToLevel() * tTLrawSeconds,
			tTLDays = Math.floor(tTLrawtimeToLevel / 86400),
			tTLHours = Math.floor((tTLrawtimeToLevel % 86400) / 3600),
			tTLMinutes = Math.floor(((tTLrawtimeToLevel % 86400) % 3600) / 60),
			tTLSeconds = ((tTLrawtimeToLevel % 86400) % 3600) % 60;

		//return tDays + "d " + tTLHours + "h " + tTLMinutes + "m " + tTLSeconds + "s";
		//return tTLDays + "d " + tTLHours + "h " + tTLMinutes + "m";
		return (tTLDays ? tTLDays + " d " : "") + (tTLHours ? tTLHours + " h " : "") + (tTLMinutes ? tTLMinutes + " m" : "");
	},

	// Get Game Time
	getGameTime: function () {
		var rawMinutes = Math.floor((getTickCount() - me.gamestarttime) / 60000).toString(),
			rawSeconds = (Math.floor((getTickCount() - me.gamestarttime) / 1000) % 60).toString();

		if (rawMinutes <= 9) {
			rawMinutes = "0" + rawMinutes;
		}

		if (rawSeconds <= 9) {
			rawSeconds = "0" + rawSeconds;
		}

		//return rawMinutes + "m " + rawSeconds + "s";
		return " (" + rawMinutes + ":" + rawSeconds + ")";
	},

	// Log to manager
	log: function () {
		var string,
			gain = this.gain(),
			progress = this.progress(),
			runsToLevel = this.runsToLevel(),
			totalRunsToLevel = this.totalRunsToLevel(),
			getGameTime = this.getGameTime(),
			timeToLevel = this.timeToLevel();

		//string = "[Game: " + me.gamename + (me.gamepassword ? "//" + me.gamepassword : "") + getGameTime + "] [Level: " + me.getStat(12) + " (" + progress + "%)] [XP: " + gain + "] [Games ETA: " + runsToLevel + "] [Time ETA: " + timeToLevel + "]";
		string = "[Game: " + me.gamename + (me.gamepassword ? "//" + me.gamepassword : "") + getGameTime + "] [Level: " + me.getStat(12) + " (" + progress + "%)] [XP: " + gain + "] [Games ETA: " + runsToLevel + "]";

		if (gain) {
			D2Bot.printToConsole(string, 4);

			if (me.getStat(12) > DataFile.getStats().level) {
				D2Bot.printToConsole("Congrats! You gained a level. Current level:" + me.getStat(12), 5);
			}
		}
	}
};

var Packet = {
	openMenu: function (unit) {
		if (unit.type !== 1) {
			throw new Error("openMenu: Must be used on NPCs.");
		}

		if (getUIFlag(0x08)) {
			return true;
		}

		var i, j;

		for (i = 0; i < 5; i += 1) {
			if (getDistance(me, unit) > 5) {
				Pather.moveToUnit(unit);
			}

			if (i > 0) {
				Packet.flash(me.gid);
			}

			if (!getUIFlag(0x08)) {
				sendPacket(1, 0x13, 4, 1, 4, unit.gid);
			}

			for (j = 0; j < 40; j += 1) {
				if (j > 0 && j % 8 === 0 && !getUIFlag(0x08)) {
					me.cancel();
					delay(300);
					sendPacket(1, 0x13, 4, 1, 4, unit.gid);
				}

				if (getUIFlag(0x08)) {
					delay(Math.max(500, me.ping * 2));

					return true;
				}

				delay(25);
			}
		}

		return false;
	},

	startTrade: function (unit, mode) {
		if (unit.type !== 1) {
			throw new Error("Unit.startTrade: Must be used on NPCs.");
		}

		if (getUIFlag(0x0C)) {
			return true;
		}

		var i,
			gamble = mode === "Gamble";

		if (this.openMenu(unit)) {
			for (i = 0; i < 10; i += 1) {
				delay(200);

				if (i % 2 === 0) {
					sendPacket(1, 0x38, 4, gamble ? 2 : 1, 4, unit.gid, 4, 0);
				}

				if (unit.itemcount > 0) {
					delay(200);

					return true;
				}
			}
		}

		return false;
	},

	buyItem: function (unit, shiftBuy, gamble) {
		var i, tick,
			oldGold = me.getStat(14) + me.getStat(15),
			itemCount = me.itemcount,
			npc = getInteractedNPC();

		if (!npc) {
			throw new Error("buyItem: No NPC menu open.");
		}

		if (me.getStat(14) + me.getStat(15) < unit.getItemCost(0)) { // Can we afford the item?
			return false;
		}

		for (i = 0; i < 3; i += 1) {
			sendPacket(1, 0x32, 4, npc.gid, 4, unit.gid, 4, shiftBuy ? 0x80000000 : gamble ? 0x2 : 0x0, 4, 0);

			tick = getTickCount();

			while (getTickCount() - tick < Math.max(2000, me.ping * 2 + 500)) {
				if (shiftBuy && me.getStat(14) + me.getStat(15) < oldGold) {
					return true;
				}

				if (itemCount !== me.itemcount) {
					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	sellItem: function (unit) {
		if (unit.type !== 4) { // Check if it's an item we want to buy
			throw new Error("Unit.sell: Must be used on items.");
		}

		var i, tick, npc,
			itemCount = me.itemcount;

		npc = getInteractedNPC();

		if (!npc) {
			return false;
		}

		for (i = 0; i < 5; i += 1) {
			sendPacket(1, 0x33, 4, npc.gid, 4, unit.gid, 4, 0, 4, 0);

			tick = getTickCount();

			while (getTickCount() - tick < 2000) {
				if (me.itemcount !== itemCount) {
					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	identifyItem: function (unit, tome) {
		var i, tick;

		if (!unit || unit.getFlag(0x10)) {
			return false;
		}

CursorLoop:
		for (i = 0; i < 3; i += 1) {
			sendPacket(1, 0x27, 4, unit.gid, 4, tome.gid);

			tick = getTickCount();

			while (getTickCount() - tick < 2000) {
				if (getCursorType() === 6) {
					break CursorLoop;
				}

				delay(10);
			}
		}

		if (getCursorType() !== 6) {
			return false;
		}

		for (i = 0; i < 3; i += 1) {
			if (getCursorType() === 6) {
				sendPacket(1, 0x27, 4, unit.gid, 4, tome.gid);
			}

			tick = getTickCount();

			while (getTickCount() - tick < 2000) {
				if (unit.getFlag(0x10)) {
					delay(50);

					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	itemToCursor: function (item) {
		var i, tick;

		if (me.itemoncursor) { // Something already on cursor
			if (getUnit(100).gid === item.gid) { // Return true if the item is already on cursor
				return true;
			}

			this.dropItem(getUnit(100)); // If another item is on cursor, drop it
		}

		for (i = 0; i < 15; i += 1) {
			if (item.mode === 1) { // equipped
				sendPacket(1, 0x1c, 2, item.bodylocation);
			} else {
				sendPacket(1, 0x19, 4, item.gid);
			}

			tick = getTickCount();

			while (getTickCount() - tick < Math.max(500, me.ping * 2 + 200)) {
				if (me.itemoncursor) {
					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	dropItem: function (item) {
		var i, tick;

		if (!this.itemToCursor(item)) {
			return false;
		}

		for (i = 0; i < 15; i += 1) {
			sendPacket(1, 0x17, 4, item.gid);

			tick = getTickCount();

			while (getTickCount() - tick < Math.max(500, me.ping * 2 + 200)) {
				if (!me.itemoncursor) {
					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	castSkill: function (hand, wX, wY) {
		hand = (hand === 0) ? 0x0c : 0x05;
		sendPacket(1, hand, 2, wX, 2, wY);
	},

	unitCast: function (hand, who) {
		hand = (hand === 0) ? 0x11 : 0x0a;
		sendPacket(1, hand, 4, who.type, 4, who.gid);
	},

	moveNPC: function (npc, dwX, dwY) {
		sendPacket(1, 0x59, 4, npc.type, 4, npc.gid, 4, dwX, 4, dwY);
	},

	teleWalk: function (x, y, maxDist) {
		var i;

		if (maxDist === undefined) {
			maxDist = 5;
		}

		if (!this.telewalkTick) {
			this.telewalkTick = 0;
		}

		if (getDistance(me, x, y) > 10 && getTickCount() - this.telewalkTick > 3000 && Attack.validSpot(x, y)) {
			for (i = 0; i < 5; i += 1) {
				sendPacket(1, 0x5f, 2, x + rand(-1, 1), 2, y + rand(-1, 1));
				delay(me.ping + 1);
				sendPacket(1, 0x4b, 4, me.type, 4, me.gid);
				delay(me.ping + 1);

				if (getDistance(me, x, y) < maxDist) {
					delay(200);

					return true;
				}
			}

			this.telewalkTick = getTickCount();
		}

		return false;
	},

	flash: function (gid) {
		sendPacket(1, 0x4b, 4, 0, 4, gid);
	},

	changeStat: function (stat, value) {
		if (value > 0) {
			getPacket(1, 0x1d, 1, stat, 1, value);
		}
	}
};

var Messaging = {
	sendToScript: function (name, msg) {
		var script = getScript(name);

		if (script && script.running) {
			script.send(msg);

			return true;
		}

		return false;
	},

	sendToProfile: function (profileName, mode, message, getResponse) {
		var response;

		function copyDataEvent(mode2, msg) {
			if (mode2 === mode) {
				var obj;

				try {
					obj = JSON.parse(msg);
				} catch (e) {
					return false;
				}

				if (obj.hasOwnProperty("sender") && obj.sender === profileName) {
					response = Misc.copy(obj);
				}

				return true;
			}

			return false;
		}

		if (getResponse) {
			addEventListener("copydata", copyDataEvent);
		}

		if (!sendCopyData(null, profileName, mode, JSON.stringify({message: message, sender: me.profile}))) {
			//print("sendToProfile: failed to get response from " + profileName);

			if (getResponse) {
				removeEventListener("copydata", copyDataEvent);
			}

			return false;
		}

		if (getResponse) {
			delay(200);
			removeEventListener("copydata", copyDataEvent);

			if (!!response) {
				return response;
			}

			return false;
		}

		return true;
	}
};

var Events = {
	// gamepacket
	gamePacket: function (bytes) {
		var temp;

		switch (bytes[0]) {
		// Block movement after using TP/WP/Exit
		case 0x0D: // Player Stop
			// This can mess up death screen so disable for characters that are allowed to die
			if (Config.LifeChicken > 0) {
				return true;
			}

			break;
		// Block poison skills that might crash the client
		case 0x4C: // Cast skill on target
		case 0x4D: // Cast skill on coords
			temp = Number("0x" + bytes[7].toString(16) + bytes[6].toString(16));

			// Match Poison Javelin, Plague Javelin or Poison Nova
			if (temp && [15, 25, 92].indexOf(temp) > -1) {
				return true;
			}

			break;
		}

		return false;
	}
};