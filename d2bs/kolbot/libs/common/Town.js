/**
*	@filename	Town.js
*	@author		kolton
*	@desc		do town chores like buying, selling and gambling
*/

include("common/Quartermaster.js");
include("common/PlugY.js");
include("common/Qol.js");

var NPC = {
	Akara: getLocaleString(2892).toLowerCase(),
	Gheed: getLocaleString(2891).toLowerCase(),
	Charsi: getLocaleString(2894).toLowerCase(),
	Kashya: getLocaleString(2893).toLowerCase(),

	Fara: getLocaleString(3025).toLowerCase(),
	Drognan: getLocaleString(3023).toLowerCase(),
	Elzix: getLocaleString(3030).toLowerCase(),
	Greiz: getLocaleString(3031).toLowerCase(),
	Lysander: getLocaleString(3026).toLowerCase(),

	Ormus: getLocaleString(1011).toLowerCase(),
	Alkor: getLocaleString(1010).toLowerCase(),
	Hratli: getLocaleString(1009).toLowerCase(),
	Asheara: getLocaleString(1008).toLowerCase(),

	Jamella: getLocaleString(1016).toLowerCase(),
	Halbu: getLocaleString(1017).toLowerCase(),
	Tyrael: getLocaleString(1013).toLowerCase(),

	Malah: getLocaleString(22478).toLowerCase(),
	Anya: getLocaleString(22477).toLowerCase(),
	Larzuk: getLocaleString(22476).toLowerCase(),
	"Qual-Kehk": getLocaleString(22480).toLowerCase(),

	Cain: getLocaleString(2890).toLowerCase()
};

include("common/Report.js");
include("common/QuestItems.js");
include("common/Chores.js"); // Chores.tune: how many spare potions to carry, whoever runs the bot
include("common/Layout.js");

var Town = {
	telekinesis: true,
	sellTimer: getTickCount(), // shop speedup test

	tasks: [
		{Heal: NPC.Akara, Shop: NPC.Akara, Gamble: NPC.Gheed, Repair: NPC.Charsi, Merc: NPC.Kashya, Key: NPC.Akara, CainID: NPC.Cain},
		{Heal: NPC.Fara, Shop: NPC.Drognan, Gamble: NPC.Elzix, Repair: NPC.Fara, Merc: NPC.Greiz, Key: NPC.Lysander, CainID: NPC.Cain},
		{Heal: NPC.Ormus, Shop: NPC.Ormus, Gamble: NPC.Alkor, Repair: NPC.Hratli, Merc: NPC.Asheara, Key: NPC.Hratli, CainID: NPC.Cain},
		{Heal: NPC.Jamella, Shop: NPC.Jamella, Gamble: NPC.Jamella, Repair: NPC.Halbu, Merc: NPC.Tyrael, Key: NPC.Jamella, CainID: NPC.Cain},
		{Heal: NPC.Malah, Shop: NPC.Malah, Gamble: NPC.Anya, Repair: NPC.Larzuk, Merc: NPC["Qual-Kehk"], Key: NPC.Malah, CainID: NPC.Cain}
	],

	ignoredItemTypes: [ // Items that won't be stashed
		//5, // Arrows
		//6, // Bolts
		18, // Book (Tome)
		22, // Scroll
		38, // Missile Potion
		41, // Key
		76, // Healing Potion
		77, // Mana Potion
		// 78, Rejuvenation Potion: STASHED (user, 2026-11-13). The Keeper tab's "Bots pick up rejuvenation potions" keeps every one the leader sees, and with this
		// type in the list nothing ever stashed them, so they filled the pack. Rejuvenation potions in the belt are not touched (only the pack is stashed).
		79, // Stamina Potion
		80, // Antidote Potion
		81 // Thawing Potion
	],

	// Do town chores
	// Qolbot: the chores run as a chore trip (Team.chore): a hop to another town for them (better potions, reviving or hiring a merc, the gambler) needs nobody's permission
	doChores: function () {
		var self = this, startAct = me.inTown ? me.act : 0, result;

		result = typeof Team === "object" && Team.chore ? Team.chore(function () { return self.doChoresRun(); }) : this.doChoresRun();

		// the user, 2026-11-16: "the only exception is town-to-town navigation from bots during chores that always brings them back to the original town": the chores
		// hop to another act's town (Alkor, Hratli, Ormus, a merc's NPC) and are free of the gate only because the bot ends where it began. UNTESTED in a game.
		if (startAct && me.inTown && me.act !== startAct) {
			try {
				print("Town: chores done in act " + me.act + ", back to act " + startAct + ".");
				Team.chore(function () { return self.goToTown(startAct); });
				this.move("portalspot");
			} catch (backError) {
				print("Town: could not get back to act " + startAct + " after the chores: " + backError);
			}
		}

		return result;
	},

	doChoresRun: function () {
		if (!me.inTown) {
			this.goToTown();
		}

		// How many spare potions to carry follows from the belt and Quartermaster (Chores.tune), on EVERY chores visit, whoever runs the bot. It was only done by Chores.needed,
		// which only the follower script calls: a bot leading its own farm kept the default of 4 healing and 4 mana spares (live 2026-11-16, Meir with a full 16-potion belt
		// and 8 Greater potions in the pack; the user: "i thought qolbot was supposed to dynamically scale how many potions had to be added to inventory above and
		// beyond what is in the belt"). UNTESTED in a game.
		if (typeof Chores === "object" && Chores.tune) {
			try {
				Chores.tune();
			} catch (tuneError) {
				print("Chores: tune: " + tuneError);
			}
		}

		var i,
			cancelFlags = [0x01, 0x02, 0x04, 0x08, 0x14, 0x16, 0x0c, 0x0f, 0x19, 0x1a];

		if (me.classid === 4 && Config.FindItem && Config.FindItemSwitch) { // weapon switch fix in case last game dropped with item find switch on
			Precast.weaponSwitch(Math.abs(Config.FindItemSwitch - 1));
		}

		if (Config.MFSwitchPercent) {
			Precast.weaponSwitch(Math.abs(Config.MFSwitch - 1));
		}

		if (Precast.haveCTA > -1) {
			Precast.weaponSwitch(Math.abs(Precast.haveCTA - 1));
		}

		this.heal();
		// What the bot put in its cube in the field to make room (Item.cubeForRoom) comes out AFTER the pack has been sorted (the user, 2026-11-16: "when it's time to sort
		// the inventory, deal with the items in the inventory first (to make room), then you'll have room to move the cube items into the inventory so they resume the normal ID
		// flow"). It used to come out first, into a pack that had no room for it. Below: the pack is identified, sold and stashed, then the cube is unloaded and the same again.
		var cubeLeft = this.cubeWaiting();

		// Qolbot: the pack carries no gold between visits (stashGoldAt: all of it goes to the stash at the end of the chores), and the shops take only the pack's
		// gold: take what the chores may need out of the stash first (potions, scrolls, repairs, the merc). What is left goes back at the end. UNTESTED in a game.
		if (typeof Gold === "object" && Gold.topUp) {
			try { Gold.topUp(100000); } catch (topUpError) { print("Gold: " + topUpError); me.cancel(); }
		}
		this.identify();
		this.shopItems();
		this.fillTome(518);

		if (Config.FieldID || Config.InventoryLayout) {
			this.fillTome(519);
		}

		this.buyPotions();
		this.clearInventory();
		Item.autoEquip();
		Item.autoMercEquip();

		// Qolbot: gear another bot dropped nearby may be an upgrade for this one: look at it, then try it on
		if (me.inTown && typeof Pickit === "object") {
			me.cancel();
			Pickit.pickItems();
			Item.autoEquip();
			Item.autoMercEquip();
		}

		// Qolbot (the user, 2026-11-16: "whenever bots are in town ... they should consider what quests they are on and what NPC they should talk to"): a reward waiting at an NPC of
		// this town is handed in on every chores visit, whatever the objective and whoever leads. UNTESTED in a game.
		if (me.inTown && typeof Quester === "object" && Quester.townQuestsOpen && Quester.questNpcs) {
			try {
				if (Quester.townQuestsOpen()) {
					Quester.questNpcs();
				}
			} catch (questTalkError) {
				print("Town: quest talk: " + questTalkError);
				me.cancel();
			}
		}

		this.buyKeys();
		this.repair();
		this.gamble();
		this.reviveMerc();
		Cubing.doCubing();
		Runewords.makeRunewords();
		this.holdCube = true; // the cube's items are not stashed unidentified in this round: the pack's own come first
		this.stash(true);
		this.holdCube = false;

		// The pack is sorted and has room now: the cube's items come out, are identified and filtered like any other (the user, 2026-11-18: "empty her inventory in town then
		// move items from cube into inventory and work from there so that all items get identified and sorted properly"). Round after round while the cube still holds
		// items and a round took some out; the cube's own items are stashed only if the normal filter wants them (cubeToStash), never because the pack was full.
		for (var round = 0; round < 6 && this.cubeWaiting(); round += 1) {
			var before = this.cubeWaiting();

			this.holdCube = true;
			this.unloadCube();
			this.identify();
			this.clearInventory();
			this.stash(true);
			this.holdCube = false;

			if (this.cubeWaiting() >= before) {
				break; // nothing came out this round: no room even now
			}
		}

		// What is still in the cube now has been through every round: the sellable has been sold and what the pickit wants has been stashed. What remains would stay in the
		// cube for good (protected, or no room in the pack), so it goes to the stash (the user, 2026-11-18: "if the bot arrives at a place where an item is going to stay in
		// the cube, it should just stash it").
		if ((me.findItems(-1, -1, 6) || []).some(function (it) { return !Item.userOwned(it) && Town.canStash(it, true); })) {
			this.cubeFinal = true;

			try {
				this.stash(true);
			} finally {
				this.cubeFinal = false;
			}
		}

		if (typeof QuestItems === "object" && QuestItems.wantRoom) { // a quest item needs room and the pack is full of what must stay: charms go to the stash
			QuestItems.stashForRoom();
		}

		this.clearScrolls();
		Layout.apply(); // Qolbot: the cube, the tomes and the keys in their places
		Layout.tidy(); // Qolbot (the user, 2026-11-14): the last chore, everything the bot keeps moves to the left of the pack, the free cells on the right
		Item.checkBigSpace(); // a yellow notice when the pack has no clear 2x4 space
		Item.dropHeldForTeam(); // Qolbot: gear taken off during the chores goes on the ground at the portal spot, where the team gathers

		for (i = 0; i < cancelFlags.length; i += 1) {
			if (getUIFlag(cancelFlags[i])) {
				delay(500);
				me.cancel();

				break;
			}
		}

		me.cancel();

		return true;
	},

	checkQuestItems: function () {
		var i, npc, item;

		// golden bird stuff
		if (me.getItem(546)) {
			this.goToTown(3);
			this.move("meshif");

			npc = getUnit(1, "meshif");

			if (npc) {
				npc.openMenu();
				me.cancel();
			}
		}

		if (me.getItem(547)) {
			this.goToTown(3);
			this.move("alkor");

			npc = getUnit(1, "alkor");

			if (npc) {
				for (i = 0; i < 2; i += 1) {
					npc.openMenu();
					me.cancel();
				}
			}
		}

		if (me.getItem(545)) {
			item = me.getItem(545);

			if (item.location > 3) {
				this.openStash();
			}

			// Qolbot: through QuestItems, which logs the use (the Activity list shows "Quest Item Used") and saves the character; a bare interact() drank
			// Xena's Potion of Life with no trace (2026-11-14: three of four bots showed it)
			if (typeof QuestItems === "object") {
				QuestItems.useAll();
			} else {
				item.interact();
			}
		}
	},

	// Start a task and return the NPC Unit
	initNPC: function (task, reason) {
		print("initNPC: " + reason);

		var npc = getInteractedNPC();

		if (npc && npc.name.toLowerCase() !== this.tasks[me.act - 1][task]) {
			me.cancel();

			npc = null;
		}

		// Jamella gamble fix
		if (task === "Gamble" && npc && npc.name.toLowerCase() === NPC.Jamella) {
			me.cancel();

			npc = null;
		}

		if (!npc) {
			npc = getUnit(1, this.tasks[me.act - 1][task]);

			if (!npc) {
				this.move(this.tasks[me.act - 1][task]);

				npc = getUnit(1, this.tasks[me.act - 1][task]);
			}
		}

		if (!npc || npc.area !== me.area || (!getUIFlag(0x08) && !npc.openMenu())) {
			return false;
		}

		print("Talking to " + npc.name);

		switch (task) {
		case "Shop":
		case "Repair":
		case "Gamble":
			if (!getUIFlag(0x0C) && !npc.startTrade(task)) {
				return false;
			}

			break;
		case "Key":
			if (!getUIFlag(0x0C) && !npc.startTrade(me.act === 3 ? "Repair" : "Shop")) {
				return false;
			}

			break;
		case "CainID":
			Misc.useMenu(0x0FB4);
			me.cancel();

			break;
		}

		return npc;
	},

	// Go to a town healer
	heal: function () {
		if (!this.needHealing()) {
			return true;
		}

		var hurt = me.hp < me.hpmax * 0.75 || me.mp < me.mpmax * 0.75;

		if (!this.initNPC("Heal", "heal")) {
			return false;
		}

		if (hurt) {
			print("Healed at the town healer.");
		}

		return true;
	},

	// Check if healing is needed, based on character config
	needHealing: function () {
		if (me.hp * 100 / me.hpmax <= Config.HealHP || me.mp * 100 / me.mpmax <= Config.HealMP) {
			return true;
		}

		// Status effects
		if (Config.HealStatus && (me.getState(2) || me.getState(9) || me.getState(61))) {
			return true;
		}

		return false;
	},

	// Whether to leave a dungeon for a healer. Config.HealHP / HealMP (100 here: "heal at every town visit") would send the bot to town
	// after every room, so out in the field only a real need counts: under half life, or poisoned / cursed.
	needFieldHealing: function () {
		if (me.hp * 100 / me.hpmax <= Math.min(Config.HealHP, 50)) {
			return true;
		}

		return !!(Config.HealStatus && (me.getState(2) || me.getState(9) || me.getState(61)));
	},

	// the potions in the pack (not the belt, not the stash), healing and mana, for the log
	packPotions: function () {
		var pot = me.getItem(-1, 0), hp = 0, mp = 0;

		if (pot) {
			do {
				if (pot.location === 3) {
					if (pot.itemType === 76) {
						hp += 1;
					} else if (pot.itemType === 77) {
						mp += 1;
					}
				}
			} while (pot.getNext());
		}

		return [hp, mp];
	},

	buyPotions: function () {
		if (me.gold < (Config.PotionGold || 1000)) { // Ain't got money fo' dat shyt
			return false;
		}

		var i, j, npc, useShift, col, beltSize, pot,
			needPots = false,
			needBuffer = true,
			buffer = {
				hp: 0,
				mp: 0
			};

		beltSize = Storage.BeltSize();
		col = this.checkColumns(beltSize);

		// HP/MP Buffer
		if (Config.HPBuffer > 0 || Config.MPBuffer > 0) {
			pot = me.getItem(-1, 0);

			if (pot) {
				do {
					if (pot.location === 3) {
						switch (pot.itemType) {
						case 76:
							buffer.hp += 1;

							break;
						case 77:
							buffer.mp += 1;

							break;
						}
					}
				} while (pot.getNext());
			}
		}

		// Check if we need to buy potions based on Config.MinColumn
		for (i = 0; i < 4; i += 1) {
			if (["hp", "mp"].indexOf(Config.BeltColumn[i]) > -1 && col[i] > (beltSize - Math.min(Config.MinColumn[i], beltSize))) {
				needPots = true;
			}
		}

		// Check if we need any potions for buffers
		if (buffer.mp < Config.MPBuffer || buffer.hp < Config.HPBuffer) {
			for (i = 0; i < 4; i += 1) {
				// We can't buy potions because they would go into belt instead
				if (col[i] >= beltSize && (!needPots || Config.BeltColumn[i] === "rv")) {
					needBuffer = false;

					break;
				}
			}
		}

		// We have enough potions in inventory
		if (buffer.mp >= Config.MPBuffer && buffer.hp >= Config.HPBuffer) {
			needBuffer = false;
		}

		// No columns to fill
		if (!needPots && !needBuffer) {
			return true;
		}

		if (me.diff === 0 && Pather.accessToAct(4) && me.act < 4) {
			this.goToTown(4);
		}

		// for the log (the user, 2026-11-16: "meir feels the need to carry 30 potions on her person at all times"): what the belt lacks, what the pack holds, what is bought for
		print("Potions: belt lacks " + col.join("/") + " per column (" + Config.BeltColumn.join("/") + "), pack holds " + this.packPotions().join("/") + " hp/mp, spares allowed " + Config.HPBuffer + "/" + Config.MPBuffer + ", buying for: " + (needPots ? "the belt " : "") + (needBuffer ? "the pack spares" : ""));

		npc = this.initNPC("Shop", "buyPotions");

		if (!npc) {
			return false;
		}

		for (i = 0; i < 4; i += 1) {
			if (col[i] > 0) {
				useShift = this.shiftCheck(col, beltSize);
				pot = this.getPotion(npc, Config.BeltColumn[i]);

				if (pot) {
					//print("ÿc2column ÿc0" + i + "ÿc2 needs ÿc0" + col[i] + " ÿc2potions");

					// Shift+buy will trigger if there's no empty columns or if only the current column is empty
					if (useShift) {
						pot.buy(true);
					} else {
						for (j = 0; j < col[i]; j += 1) {
							pot.buy(false);
						}
					}
				}
			}

			col = this.checkColumns(beltSize); // Re-initialize columns (needed because 1 shift-buy can fill multiple columns)
		}

		if (needBuffer && buffer.hp < Config.HPBuffer) {
			for (i = 0; i < Config.HPBuffer - buffer.hp; i += 1) {
				pot = this.getPotion(npc, "hp");

				if (Storage.Inventory.CanFit(pot)) {
					pot.buy(false);
				}
			}
		}

		if (needBuffer && buffer.mp < Config.MPBuffer) {
			for (i = 0; i < Config.MPBuffer - buffer.mp; i += 1) {
				pot = this.getPotion(npc, "mp");

				if (Storage.Inventory.CanFit(pot)) {
					pot.buy(false);
				}
			}
		}

		print("Potions: bought; the pack now holds " + this.packPotions().join("/") + " hp/mp, the belt lacks " + this.checkColumns(beltSize).join("/") + " per column.");

		return true;
	},

	// Check when to shift-buy potions
	shiftCheck: function (col, beltSize) {
		var i, fillType;

		for (i = 0; i < col.length; i += 1) {
			// Set type based on non-empty column
			if (!fillType && col[i] > 0 && col[i] < beltSize) {
				fillType = Config.BeltColumn[i];
			}

			if (col[i] >= beltSize) {
				switch (Config.BeltColumn[i]) {
				case "hp":
					// Set type based on empty column
					if (!fillType) {
						fillType = "hp";
					}

					// Can't shift+buy if we need to get differnt potion types
					if (fillType !== "hp") {
						return false;
					}

					break;
				case "mp":
					if (!fillType) {
						fillType = "mp";
					}

					if (fillType !== "mp") {
						return false;
					}

					break;
				case "rv": // Empty rejuv column = can't shift-buy
					return false;
				}
			}
		}

		return true;
	},

	// Return column status (needed potions in each column)
	checkColumns: function (beltSize) {
		var col = [beltSize, beltSize, beltSize, beltSize],
			pot = me.getItem(-1, 2); // Mode 2 = in belt

		if (!pot) { // No potions
			return col;
		}

		do {
			col[pot.x % 4] -= 1;
		} while (pot.getNext());

		return col;
	},

	// Get the highest potion from current npc
	getPotion: function (npc, type) {
		var i, result;

		if (!type) {
			return false;
		}

		if (type === "hp" || type === "mp") {
			for (i = 5; i > 0; i -= 1) {
				result = npc.getItem(type + i);

				if (result) {
					return result;
				}
			}
		}

		return false;
	},

	fillTome: function (code) {
		// 450 gold covers a new tome; a bot that already has its tome only needs scrolls (about 100 gold each). Barabas, 2026-11-13, had between 100
		// and 450 gold: TownChicken sent him out of the game for scrolls and this refused to buy any, so he left again every minute.
		if (me.gold < 450 && !(me.gold >= 100 && me.findItem(code, 0, 3))) {
			return false;
		}

		if (this.checkScrolls(code) >= 13) {
			return true;
		}

		var scroll, tome,
			npc = this.initNPC("Shop", "fillTome");

		if (!npc) {
			return false;
		}

		delay(500);

		if (!me.findItem(code, 0, 3)) { // Qolbot: either tome (the identify tome was never bought)
			tome = npc.getItem(code);

			if (tome && Storage.Inventory.CanFit(tome)) {
				try {
					tome.buy();
				} catch (e1) {
					print(e1);

					// Couldn't buy the tome, don't spam the scrolls
					return false;
				}
			} else {
				return false;
			}
		}

		scroll = npc.getItem(code === 518 ? 529 : 530);

		if (!scroll) {
			return false;
		}

		try {
			if (me.gold >= 1400) {
				scroll.buy(true); // fills the tome
			} else {
				// not enough gold to fill it in one go (the game refuses the whole fill): one scroll at a time, as many as the gold pays for
				for (var bought = this.checkScrolls(code); bought < 13 && me.gold >= 100; bought += 1) {
					scroll.buy(false);
					delay(250);
				}
			}
		} catch (e2) {
			print(e2.message);

			return false;
		}

		return true;
	},

	checkScrolls: function (id) {
		var tome = me.findItem(id, 0, 3);

		if (!tome) {
			switch (id) {
			case 519:
			case "ibk":
				return Config.InventoryLayout ? 0 : 20; // Ignore missing ID tome (Qolbot: not with the inventory layout, which has a place for it)
			case 518:
			case "tbk":
				return 0; // Force TP tome check
			}
		}

		return tome.getStat(70);
	},

	// Qolbot's rule for an item that is identified or being sorted (result = what the keep list says about it):
	// 1. an upgrade for me or my mercenary is kept (and put on)
	// 2. anything else on the keep list (1 keep, 2 cubing, 3 runeword, 5 crafting) is kept, and the stash takes it
	// 3. everything else is junk (0). -1 (not identified yet) and 4 (sell for gold) are passed through.
	keepVerdict: function (item, result) {
		if (result === -1) {
			return result;
		}

		// an upgrade wins over "sell for gold" (live 2026-11-14: Xena sold a rare Long Battle Bow and a rare Crossbow her Rogue could wear, because
		// GoldSell.nip matched them first and 4 was passed through before this check: "looks like auto equip for merc weapons doesn't work?")
		if (Item.autoEquipCheck(item) || Item.autoMercEquipCheck(item)) {
			return 1;
		}

		if (result === 4) {
			return result;
		}

		return [1, 2, 3, 5].indexOf(result) > -1 ? result : 0;
	},

	identify: function () {
		var i, item, tome, scroll, npc, list, timer, tpTome, result, soldName, goldBefore,
			tpTomePos = {};

		this.cainID();

		list = Item.botItems();

		if (!list) {
			return false;
		}

		// Avoid unnecessary NPC visits
		for (i = 0; i < list.length; i += 1) {
			// Only unid items or sellable junk (low level) should trigger a NPC visit
			if ((!list[i].getFlag(0x10) || Config.LowGold > 0 || Pickit.checkItem(list[i]).result === 4) && Item.isReplacable(list[i]) && ([-1, 4].indexOf(Pickit.checkItem(list[i]).result) > -1 || !list[i].getFlag(0x10))) {
				break;
			}
		}

		if (i === list.length) {
			// say what was looked at, so "he never checked his gear" can be answered from the log (at most every 2 minutes)
			if (list.length && (!this.idNoteAt || getTickCount() - this.idNoteAt > 120000)) {
				var looked = [];
				this.idNoteAt = getTickCount();
				for (var li = 0; li < list.length && li < 12; li += 1) {
					looked.push(list[li].name + (list[li].getFlag(0x10) ? " (id)" : " (unid)") + (Item.isReplacable(list[li]) ? "" : " (protected)") + " r" + Pickit.checkItem(list[li]).result);
				}
				print("Town.identify: nothing to identify or sell among " + list.length + " item(s): " + looked.join("; "));
			}

			return false;
		}

		npc = this.initNPC("Shop", "identify");

		if (!npc) {
			return false;
		}

		tome = me.findItem(519, 0, 3);

		if (tome && tome.getStat(70) < list.length) {
			this.fillTome(519);
		}

MainLoop:
		while (list.length > 0) {
			item = list.shift();

			if (!item.getFlag(0x10) && item.location === 3 && Item.isReplacable(item) && !Item.keptOutright(item) && this.ignoredItemTypes.indexOf(item.itemType) === -1) { // protected kinds (Settings tab) and keepers kept without their stats are never identified
				result = Pickit.checkItem(item);

				// Force ID for unid items matching autoEquip criteria; a "sell for gold" item (GoldSell.nip) that could be an upgrade for me or my mercenary
				// is identified first too, not sold unidentified: keepVerdict then decides (upgrade -> keep and wear, else sell)
				if ((result.result === 1 || result.result === 4) && !item.getFlag(0x10) && ((Item.hasTier(item) && Item.autoEquipCheck(item)) || (Item.hasMercTier(item) && Item.autoMercEquipCheck(item)))) {
					result.result = -1;
				}

				// Qolbot: identify every unidentified item kept by the rules (protected kinds and outright keepers never get here: keptOutright)
				if (result.result === 1 && !item.getFlag(0x10)) {
					result.result = -1;
				}

				// Qolbot: a "sell for gold" item (GoldSell.nip) is identified before it is sold: identified it fetches more (the user, 2026-11-14: Xena sold an
				// unidentified magic Ring for 900 gold at 18:35:05). The sale follows below, after keepVerdict (an upgrade is kept instead).
				if (result.result === 4 && !item.getFlag(0x10)) {
					result.result = -1;
				}

				switch (result.result) {
				// Items for gold, will sell magics, etc. w/o id, but at low levels
				// magics are often not worth iding.
				case 4:
					// only with a shop window open (identifying with Cain or at a tome does not open one: "Unit.sell: Must be used in shops" ended whole script runs,
					// 15:56 on 2026-11-13, once the sell list made this case common); what is left is sold by clearInventory at a vendor
					if (getUIFlag(0x0C)) {
						Misc.itemLogger("Sold", item);
						try { Misc.logItem("Sold", item); } catch (soldLogError) { print("Sold: " + soldLogError); } // Qolbot: the stats for the Activity entry
						soldName = item.name;
						goldBefore = me.gold;
						item.sell();
						delay(150 + me.ping);
						for (var soldWait = 0; soldWait < 10 && me.gold === goldBefore; soldWait += 1) { // the gold arrives after the sale packet: wait up to 1.5 s for it, so the line below is not "0 gold"
							delay(150);
						}
						print("Sold " + soldName + " for " + (me.gold - goldBefore) + " gold (a sell rule).");
					}

					break;
				case -1:
					if (tome) {
						this.identifyItem(item, tome);
					} else {
						scroll = npc.getItem(530);

						if (scroll) {
							if (!Storage.Inventory.CanFit(scroll)) {
								tpTome = me.findItem(518, 0, 3);

								if (tpTome) {
									tpTomePos = {x: tpTome.x, y: tpTome.y};

									tpTome.sell();
									delay(500);
								}
							}

							delay(500);

							if (Storage.Inventory.CanFit(scroll)) {
								scroll.buy();
							}
						}

						scroll = me.findItem(530, 0, 3);

						if (!scroll) {
							break MainLoop;
						}

						this.identifyItem(item, scroll);
					}

					result = Pickit.checkItem(item);

					result.result = this.keepVerdict(item, result.result);

					switch (result.result) {
					case 1:
						// Couldn't id autoEquip item. Don't log it.
						if (result.result === 1 && Config.AutoEquip && !item.getFlag(0x10) && Item.autoEquipCheck(item)) {
							break;
						}

						if (result.result === 1 && Config.AutoMercEquip && !item.getFlag(0x10) && Item.autoMercEquipCheck(item)) {
							break;
						}

						Misc.itemLogger("Kept", item);
						Misc.logItem("Kept", item, result.line);

						break;
					case -1: // unidentified
						break;
					case 2: // cubing
						Misc.itemLogger("Kept", item, "Cubing-Town");
						Cubing.update();

						break;
					case 3: // runeword (doesn't trigger normally)
						break;
					case 5: // Crafting System
						Misc.itemLogger("Kept", item, "CraftSys-Town");
						CraftingSystem.update(item);

						break;
					default:
						Misc.itemLogger("Sold", item);
						try { Misc.logItem("Sold", item); } catch (soldLogError) { print("Sold: " + soldLogError); } // Qolbot: the stats for the Activity entry
						soldName = item.name;
						goldBefore = me.gold;
						item.sell();

						for (var idSoldWait = 0; idSoldWait < 10 && me.gold === goldBefore; idSoldWait += 1) {
							delay(150);
						}

						print("Sold " + soldName + " for " + (me.gold - goldBefore) + " gold (no keep rule)."); // Qolbot: the Activity entry (this sale printed nothing)

						timer = getTickCount() - this.sellTimer; // shop speedup test

						if (timer > 0 && timer < 500) {
							delay(timer);
						}

						break;
					}

					break;
				}
			}
		}

		this.fillTome(518); // Check for TP tome in case it got sold for ID scrolls

		return true;
	},

	cainID: function () {
		if (!Config.CainID.Enable || !me.getQuest(4, 0)) { // off, or Cain is not rescued yet (he is not in town)
			return false;
		}

		// Check if we're already in a shop. It would be pointless to go to Cain if so.
		var i, cain, unids, result, item,
			npc = getInteractedNPC();

		if (npc && npc.name.toLowerCase() === this.tasks[me.act - 1].Shop) {
			return false;
		}

		// Check if we may use Cain - minimum gold
		if (me.gold < Config.CainID.MinGold) {
			//print("Can't use Cain - not enough gold.");

			return false;
		}

		me.cancel();
		this.stash(false);

		unids = this.getUnids();

		if (unids) {
			// Check if we may use Cain - number of unid items
			if (unids.length < Config.CainID.MinUnids) {
				//print("Can't use Cain - not enough unid items.");

				return false;
			}

			// Check if we may use Cain - kept unid items
			for (i = 0; i < unids.length; i += 1) {
				if (!Item.isReplacable(unids[i]) || Item.keptOutright(unids[i])) { // Cain identifies everything: not with a protected item or an outright keeper in the bag (any other item may need identifying to tell whether it is a keeper)
					//print("Can't use Cain - can't id a valid item.");

					return false;
				}
			}

			cain = this.initNPC("CainID", "cainID");

			if (!cain) {
				return false;
			}

			for (i = 0; i < unids.length; i += 1) {
				// Qolbot: Cain only identifies. A keeper is logged; junk is left for the vendor visit and the clear-inventory step to sell.
				item = me.getItem(-1, -1, unids[i].gid) || unids[i];
				result = Pickit.checkItem(item);

				if (this.keepVerdict(item, result.result) === 1) {
					Misc.itemLogger("Kept", item);
					Misc.logItem("Kept", item, result.line);
				}
			}
		}

		return true;
	},

	fieldID: function () { // not exactly a town function but whateva
		var list, tome, item, result;

		list = this.getUnids();

		if (!list) {
			return false;
		}

		tome = me.findItem(519, 0, 3);

		if (!tome || tome.getStat(70) < list.length) {
			return false;
		}

		while (list.length > 0) {
			item = list.shift();

			if (!Item.isReplacable(item) || Item.keptOutright(item)) { // protected kinds and outright keepers are never identified
				continue;
			}

			result = Pickit.checkItem(item);

			// Force ID for unid items matching autoEquip criteria
			if (result.result === 1 && !item.getFlag(0x10) && Item.hasTier(item)) {
				result.result = -1;
			}

			if (result.result === 1 && !item.getFlag(0x10) && Item.hasMercTier(item)) {
				result.result = -1;
			}

			if (result.result === -1) { // unid item that should be identified
				this.identifyItem(item, tome);
				delay(me.ping + 1);

				result = Pickit.checkItem(item);

				result.result = this.keepVerdict(item, result.result);

				switch (result.result) {
				case 0:
					Misc.itemLogger("Dropped", item, "fieldID");

					if (Config.DroppedItemsAnnounce.Enable && Config.DroppedItemsAnnounce.Quality.indexOf(item.quality)  > -1) {
						say("Dropped: [" + Pickit.itemQualityToName(item.quality).charAt(0).toUpperCase() + Pickit.itemQualityToName(item.quality).slice(1) + "] " + item.fname.split("\n").reverse().join(" ").replace(/ÿc[0-9!"+<;.*]/, "").trim());

						if (Config.DroppedItemsAnnounce.LogToOOG && Config.DroppedItemsAnnounce.OOGQuality.indexOf(item.quality) > -1) {
							Misc.logItem("Field Dropped", item, result.line);
						}
					}

					item.drop();

					break;
				case 1:
					Misc.itemLogger("Field Kept", item);
					Misc.logItem("Field Kept", item, result.line);

					break;
				default:
					break;
				}
			}
		}

		delay(200);
		me.cancel();

		return true;
	},

	getUnids: function () {
		var list = [],
			item = me.getItem(-1, 0);

		if (!item) {
			return false;
		}

		do {
			if (item.location === 3 && !item.getFlag(0x10)) {
				list.push(copyUnit(item));
			}
		} while (item.getNext());

		if (!list.length) {
			return false;
		}

		return list;
	},

	identifyItem: function (unit, tome) {
		if (Config.PacketShopping) {
			return Packet.identifyItem(unit, tome);
		}

		var i, tick;

		if (!unit || unit.getFlag(0x10)) {
			return false;
		}

		this.sellTimer = getTickCount(); // shop speedup test

CursorLoop:
		for (i = 0; i < 3; i += 1) {
			clickItem(1, tome);

			tick = getTickCount();

			while (getTickCount() - tick < 500) {
				if (getCursorType() === 6) {
					break CursorLoop;
				}

				delay(10);
			}
		}

		if (getCursorType() !== 6) {
			return false;
		}

		delay(270);

		for (i = 0; i < 3; i += 1) {
			if (getCursorType() === 6) {
				clickItem(0, unit);
			}

			tick = getTickCount();

			while (getTickCount() - tick < 500) {
				if (unit.getFlag(0x10)) {
					delay(50);

					return true;
				}

				delay(10);
			}

			delay(300);
		}

		return false;
	},

	shopItems: function () {
		if (!Config.MiniShopBot) {
			return true;
		}

		var i, item, result,
			items = [],
			npc = getInteractedNPC();

		if (!npc || !npc.itemcount) {
			return false;
		}

		item = npc.getItem();

		if (!item) {
			return false;
		}

		print("ÿc4MiniShopBotÿc0: Scanning " + npc.itemcount + " items.");

		do {
			if (this.ignoredItemTypes.indexOf(item.itemType) === -1) {
				items.push(copyUnit(item));
			}
		} while (item.getNext());

		for (i = 0; i < items.length; i += 1) {
			result = Pickit.checkItem(items[i]);

			if (result.result === 1 && (Item.autoEquipCheck(items[i]) || Item.autoMercEquipCheck(items[i]))) {
				try {
					if (Storage.Inventory.CanFit(items[i]) && me.getStat(14) + me.getStat(15) >= items[i].getItemCost(0)) {
						Misc.itemLogger("Shopped", items[i]);
						Misc.logItem("Shopped", items[i], result.line);
						items[i].buy();
					}
				} catch (e) {
					print(e);
				}
			}

			delay(2);
		}

		return true;
	},

	gambleIds: [],

	gamble: function () {
		if (!this.needGamble() || Config.GambleItems.length === 0) {
			return true;
		}

		print("Going gambling");

		Report.note("Town", "I'm going gambling, be back soon.");

		var i, item, items, npc, newItem, result,
			list = [];

		if (this.gambleIds.length === 0) {
			// change text to classid
			for (i = 0; i < Config.GambleItems.length; i += 1) {
				if (isNaN(Config.GambleItems[i])) {
					if (NTIPAliasClassID.hasOwnProperty(Config.GambleItems[i].replace(/\s+/g, "").toLowerCase())) {
						this.gambleIds.push(NTIPAliasClassID[Config.GambleItems[i].replace(/\s+/g, "").toLowerCase()]);
					} else {
						Misc.errorReport("ÿc1Invalid gamble entry:ÿc0 " + Config.GambleItems[i]);
					}
				} else {
					this.gambleIds.push(Config.GambleItems[i]);
				}
			}
		}

		if (this.gambleIds.length === 0) {
			return true;
		}

		// Fuck Alkor
		if (me.act === 3) {
			this.goToTown(2);
		}

		// Qolbot: the shop takes the pack's gold only: take what the gambling will spend out of the stash first (everything above GambleGoldStop, pack and stash
		// together). What is left goes back to the stash at the end of the chores. UNTESTED in a game.
		var spend = me.getStat(14) + me.getStat(15) - Config.GambleGoldStop;

		if (spend > me.getStat(14) && typeof Gold === "object" && Gold.topUp) {
			try {
				Gold.topUp(spend);
			} catch (gambleGoldError) {
				print("Gold: " + gambleGoldError);
				me.cancel();
			}
		}

		npc = this.initNPC("Gamble", "gamble");

		if (!npc) {
			return false;
		}

		items = me.findItems(-1, 0, 3);

		while (items && items.length > 0) {
			list.push(items.shift().gid);
		}

		var passGold; // the pack's gold at the start of a pass: a pass that buys nothing ends the gambling (no room, or too little gold in the pack for any item)

		while (me.getStat(14) + me.getStat(15) >= Config.GambleGoldStop && me.getStat(14) > 0) { // pack and stash together (Qolbot, 2026-11-16)
			passGold = me.getStat(14);

			if (!getInteractedNPC()) {
				npc.startTrade("Gamble");
			}

			item = npc.getItem();
			items = [];

			if (item) {
				do {
					if (this.gambleIds.indexOf(item.classid) > -1) {
						items.push(copyUnit(item));
					}
				} while (item.getNext());

				for (i = 0; i < items.length; i += 1) {
					if (!Storage.Inventory.CanFit(items[i])) {
						return false;
					}

					me.overhead("Buy: " + items[i].name);
					items[i].buy(false, true);

					newItem = this.getGambledItem(list);

					if (newItem) {
						result = Pickit.checkItem(newItem);

						result.result = this.keepVerdict(newItem, result.result);

						switch (result.result) {
						case 1:
							Misc.itemLogger("Gambled", newItem);
							Misc.logItem("Gambled", newItem, result.line);
							list.push(newItem.gid);

							break;
						case 2:
							list.push(newItem.gid);
							Cubing.update();

							break;
						case 5: // Crafting System
							CraftingSystem.update(newItem);

							break;
						default:
							Misc.itemLogger("Sold", newItem, "Gambling");
							try { Misc.logItem("Sold", newItem, "Gambling"); } catch (soldLogError) { print("Sold: " + soldLogError); } // Qolbot: the stats for the Activity entry
							me.overhead("Sell: " + newItem.name);
							newItem.sell();

							if (!Config.PacketShopping) {
								delay(500);
							}

							break;
						}
					}
				}
			}

			me.cancel();

			if (me.getStat(14) === passGold) {
				print("Gambling: a pass bought nothing, stopping.");

				break;
			}
		}

		return true;
	},

	needGamble: function () {
		// Qolbot (the user, 2026-11-16: "gambling not triggering anymore should be based on the total gold in the stash and pack together, not just the pack"): the
		// chores stash all the gold, so the pack alone never reached GambleGoldStart
		return Config.Gamble && (me.getStat(14) + me.getStat(15)) >= Config.GambleGoldStart;
	},

	getGambledItem: function (list) {
		var i, j,
			items = me.findItems(-1, 0, 3);

		for (i = 0; i < items.length; i += 1) {
			if (list.indexOf(items[i].gid) === -1) {
				for (j = 0; j < 3; j += 1) {
					if (items[i].getFlag(0x10)) {
						break;
					}

					delay(100);
				}

				return items[i];
			}
		}

		return false;
	},

	buyKeys: function () {
		if (!this.wantKeys()) {
			return true;
		}

		// Fuck Hratli
		if (me.act === 3) {
			this.goToTown(Pather.accessToAct(4) ? 4 : 2);
		}

		var key,
			npc = this.initNPC("Key", "buyKeys");

		if (!npc) {
			return false;
		}

		key = npc.getItem("key");

		if (!key) {
			return false;
		}

		try {
			key.buy(true);
		} catch (e) {
			print(e.message);

			return false;
		}

		return true;
	},

	checkKeys: function () {
		// Qolbot: with the inventory layout every bot keeps a few keys (they have a place), whether it opens chests or not
		if ((!Config.OpenChests && !Config.InventoryLayout) || (me.classid === 6 && !Config.InventoryLayout) || me.gold < 540 || (!me.getItem("key") && !Storage.Inventory.CanFit({sizex: 1, sizey: 1}))) {
			return 12;
		}

		var i,
			count = 0,
			key = me.findItems(543, 0, 3);

		if (key) {
			for (i = 0; i < key.length; i += 1) {
				count += key[i].getStat(70);
			}
		}

		return count;
	},

	needKeys: function () {
		return this.checkKeys() <= 0;
	},

	wantKeys: function () {
		return this.checkKeys() <= 6;
	},

	repairIngredientCheck: function (item) {
		if (!Config.CubeRepair) {
			return false;
		}

		var needRal = 0,
			needOrt = 0,
			items = this.getItemsForRepair(Config.RepairPercent, false);

		if (items && items.length) {
			while (items.length > 0) {
				switch (items.shift().itemType) {
				case 2:
				case 3:
				case 15:
				case 16:
				case 19:
				case 69:
				case 70:
				case 71:
				case 72:
				case 75:
					needRal += 1;

					break;
				default:
					needOrt += 1;

					break;
				}
			}
		}

		switch (item.classid) {
		case 617:
			if (needRal && (!me.findItems(617) || me.findItems(617) < needRal)) {
				return true;
			}

			break;
		case 618:
			if (needOrt && (!me.findItems(618) || me.findItems(618) < needOrt)) {
				return true;
			}

			break;
		}

		return false;
	},

	cubeRepair: function () {
		if (!Config.CubeRepair || !me.getItem(549)) {
			return false;
		}

		var items = this.getItemsForRepair(Config.RepairPercent, false);

		items.sort(function (a, b) {
			return a.getStat(72) * 100 / a.getStat(73) - b.getStat(72) * 100 / b.getStat(73);
		});

		while (items.length > 0) {
			this.cubeRepairItem(items.shift());
		}

		return true;
	},

	cubeRepairItem: function (item) {
		var i, rune, cubeItems,
			bodyLoc = item.bodylocation;

		if (item.mode !== 1) {
			return false;
		}

		switch (item.itemType) {
		case 2:
		case 3:
		case 15:
		case 16:
		case 19:
		case 69:
		case 70:
		case 71:
		case 72:
		case 75:
			rune = me.getItem(617); // Ral rune

			break;
		default:
			rune = me.getItem(618); // Ort rune

			break;
		}

		if (rune && Town.openStash() && Cubing.openCube() && Cubing.emptyCube()) {
			for (i = 0; i < 100; i += 1) {
				if (!me.itemoncursor) {
					if (Storage.Cube.MoveTo(item) && Storage.Cube.MoveTo(rune)) {
						transmute();
						delay(1000 + me.ping);
					}

					cubeItems = me.findItems(-1, -1, 6); // Get cube contents

					if (cubeItems.length === 1) { // We expect only one item in cube
						cubeItems[0].toCursor();
					}
				}

				if (me.itemoncursor) {
					for (i = 0; i < 3; i += 1) {
						clickItem(0, bodyLoc);
						delay(me.ping * 2 + 500);

						if (cubeItems[0].bodylocation === bodyLoc) {
							print(cubeItems[0].fname.split("\n").reverse().join(" ").replace(/ÿc[0-9!"+<;.*]/, "").trim() + " successfully repaired and equipped.");
							D2Bot.printToConsole(cubeItems[0].fname.split("\n").reverse().join(" ").replace(/ÿc[0-9!"+<;.*]/, "").trim() + " successfully repaired and equipped.", 5);

							return true;
						}
					}
				}

				delay(200);
			}

			Misc.errorReport("Failed to put repaired item back on.");
			D2Bot.stop();
		}

		return false;
	},

	// Qolbot: the repair-all bill is more than the bot has (live 18:27 on Nightmare: Barabas, 60072 gold, 58006 of it recharging an Assault Helmet's charges,
	// and his Deathspade at 1 of 24 durability went unrepaired). Repair the worn items one at a time, the most worn first, each only when its whole cost fits
	// (C->S 0x35, 17 bytes: the repairer's gid, the item's gid, 0, then the flags, negative = all, 0 = this item; D2MOO D2GAME_NPC_Repair: an item that
	// cannot be paid in full is repaired as far as the gold goes, which would spend everything: never sent). The scroll fund of needRepair is kept.
	// the worn items too dear to repair that may go (trashable), each tried once a game (a failed try must not mean a town trip every fight)
	toTrash: function () {
		var self = this, budget = me.gold + me.getStat(15) - (this.checkScrolls(518) < 5 ? 300 : 0);

		this.trashTried = this.trashTried || {};

		return this.getItemsForRepair(Config.RepairPercent, true).filter(function (it) {
			var c;

			try {
				c = it.getItemCost(2);
			} catch (e) {
				return false;
			}

			return c > budget && !self.trashTried[me.gamename + ":" + it.gid] && self.trashable(it);
		});
	},

	// may a worn item that is too dear to repair be got rid of? Only when the protection list does not keep it and no keep rule (pickit, cubing,
	// runeword, crafting) wants it
	trashable: function (item) {
		var keep;

		try {
			if (!Item.isReplacable(item)) {
				return false;
			}

			keep = Pickit.checkItem(item).result;
		} catch (e) {
			return false;
		}

		return [1, 2, 3, 5].indexOf(keep) === -1;
	},

	// take it off and sell it here (the repairer's shop is open), else drop it; says which
	trash: function (item) {
		var gid = item.gid, name = item.name, it;

		this.trashTried = this.trashTried || {};
		this.trashTried[me.gamename + ":" + gid] = true;

		try {
			if (!item.toCursor()) {
				return "could not take it off";
			}

			it = getUnit(100);

			if (it && getUIFlag(0x0C) && Storage.Inventory.CanFit(it) && Storage.Inventory.MoveTo(it)) {
				it = me.getItem(-1, 0, gid) || it;
				Misc.itemLogger("Sold", it);
				try { Misc.logItem("Sold", it); } catch (soldLogError) { print("Sold: " + soldLogError); }

				var goldBefore = me.gold, tick;

				if (it.sell()) {
					for (tick = getTickCount(); getTickCount() - tick < 1500 && me.gold === goldBefore; ) {
						delay(50);
					}

					// the line the Activity list reads ("Sold X for N gold."; live 18:31:58 "Sold Assault Helmet (too dear to repair)." was not shown)
					print("Sold " + name + " for " + (me.gold - goldBefore) + " gold (too dear to repair).");
					print("Town: " + name + " was too dear to repair and nobody keeps it");

					return "sold";
				}
			}

			it = getUnit(100) || me.getItem(-1, 0, gid);

			if (it && it.drop()) {
				print("Town: dropped " + name + ": too dear to repair and nobody keeps it");

				return "dropped";
			}
		} catch (e) {
			return "trash: " + e;
		}

		return "kept: could not drop it";
	},

	// the worn items below Config.RepairPercent whose whole repair the bot can pay for (gold and stash, the scroll fund kept)
	affordableRepairs: function () {
		var items = this.getItemsForRepair(Config.RepairPercent, true), budget = me.gold + me.getStat(15) - (this.checkScrolls(518) < 5 ? 300 : 0);

		return items.filter(function (it) {
			var c;

			try {
				c = it.getItemCost(2);
			} catch (e) {
				c = -1;
			}

			return c > 0 && c <= budget;
		});
	},

	repairSome: function (npc) {
		var items = this.getItemsForRepair(Config.RepairPercent, true), i, cost, budget, before, done = [], skipped = [];

		items.sort(function (a, b) {
			var pa = a.getStat(73) ? a.getStat(72) / a.getStat(73) : 1, pb = b.getStat(73) ? b.getStat(72) / b.getStat(73) : 1;

			return pa - pb;
		});

		for (i = 0; i < items.length; i += 1) {
			budget = me.gold + me.getStat(15) - (this.checkScrolls(518) < 5 ? 300 : 0);

			try {
				cost = items[i].getItemCost(2);
			} catch (e) {
				cost = -1;
			}

			if (cost <= 0 || cost > budget) {
				// a money sink nobody wants kept goes (the user, 2026-11-14: "no reason to keep a helmet that is a money sink if it's not on a keeper
				// list"): not protected (Item.isReplacable: the protection list, and nothing is protected below its level) and no keep rule matches it
				if (cost > budget && this.trashable(items[i])) {
					skipped.push(items[i].name + " " + cost + " (" + this.trash(items[i]) + ")");
				} else {
					skipped.push(items[i].name + " " + cost);
				}

				continue;
			}

			before = me.gold + me.getStat(15);
			sendPacket(1, 0x35, 4, npc.gid, 4, items[i].gid, 4, 0, 4, 0);

			for (var tick = getTickCount(); getTickCount() - tick < 2000 && me.gold + me.getStat(15) === before; ) {
				delay(100);
			}

			done.push(items[i].name + " " + (before - me.gold - me.getStat(15)) + " (durability now " + items[i].getStat(72) + "/" + items[i].getStat(73) + ")");
		}

		print("Town: repaired one at a time: " + (done.join(", ") || "nothing") + (skipped.length ? "; too dear: " + skipped.join(", ") : ""));

		return done.length > 0;
	},

	// Qolbot: what each worn item would cost to repair (getItemCost(2)), most expensive first, for the log
	repairCosts: function () {
		var it = me.getItem(-1, 1), out = [], c;

		if (it) {
			do {
				try {
					c = it.getItemCost(2);
				} catch (e) {
					c = -1;
				}

				if (c > 0) {
					out.push({n: it.name, c: c, d: it.getStat(72) + "/" + it.getStat(73)});
				}
			} while (it.getNext());
		}

		out.sort(function (a, b) { return b.c - a.c; });

		return out.map(function (o) { return o.n + " " + o.c + " (durability " + o.d + ")"; }).join(", ") || "no item cost known";
	},

	repair: function () {
		var i, quiver, myQuiver, npc, repairAction, bowCheck;

		this.cubeRepair();

		repairAction = this.needRepair();

		if (!repairAction || !repairAction.length) {
			return true;
		}

		for (i = 0; i < repairAction.length; i += 1) {
			switch (repairAction[i]) {
			case "repair":
				npc = this.initNPC("Repair", "repair");

				if (!npc) {
					return false;
				}

				me.repair();

				break;
			case "repairSome":
				npc = this.initNPC("Repair", "repair");

				if (!npc) {
					return false;
				}

				this.repairSome(npc);

				break;
			case "buyQuiver":
				bowCheck = Attack.usingBow();

				if (bowCheck) {
					if (bowCheck === "bow") {
						quiver = "aqv"; // Arrows
					} else {
						quiver = "cqv"; // Bolts
					}

					myQuiver = me.getItem(quiver, 1);

					if (myQuiver) {
						myQuiver.drop();
					}

					npc = this.initNPC("Repair", "repair");

					if (!npc) {
						return false;
					}

					quiver = npc.getItem(quiver);

					if (quiver) {
						quiver.buy();
					}
				}

				break;
			}
		}

		//this.shopItems();

		return true;
	},

	needRepair: function () {
		var quiver, bowCheck, quantity,
			repairAction = [],
			// the scroll fund: repairs never take the last 300 gold of a bot that is short of town portal scrolls (2026-11-13: a leader with no
			// scrolls cannot leave the field, share waypoints or run a quest)
			canAfford = me.gold - me.getRepairCost() >= (this.checkScrolls(518) < 5 ? 300 : 0);

		// Arrow/Bolt check
		bowCheck = Attack.usingBow();

		if (bowCheck) {
			switch (bowCheck) {
			case "bow":
				quiver = me.getItem("aqv", 1); // Equipped arrow quiver

				break;
			case "crossbow":
				quiver = me.getItem("cqv", 1); // Equipped bolt quiver

				break;
			}

			if (!quiver) { // Out of arrows/bolts
				repairAction.push("buyQuiver");
			} else {
				quantity = quiver.getStat(70);

				if (typeof quantity === "number" && quantity * 100 / getBaseStat("items", quiver.classid, "maxstack") <= Config.RepairPercent) {
					repairAction.push("buyQuiver");
				}
			}
		}

		// Repair durability/quantity/charges
		if (canAfford) {
			if (this.getItemsForRepair(Config.RepairPercent, true).length > 0) {
				repairAction.push("repair");
			}
		} else {
			// Qolbot: the numbers, and what costs the most, once every two minutes (live 18:24 on Nightmare: Barabas, cost 59300 with 25953 gold, said
			// dozens of times a minute)
			if (Date.now() - (this.repairSaidAt || 0) > 120000) {
				this.repairSaidAt = Date.now();
				print("ÿc4Town: ÿc1Can't afford repairs (cost " + me.getRepairCost() + ", gold " + me.gold + ", stash " + me.getStat(15) + ", tp scrolls " + this.checkScrolls(518) + "): " + this.repairCosts());
			}

			// what fits the budget can still be repaired one item at a time (Town.repairSome). Only items it can pay for: an item too dear (the helmet)
			// must not make a "needs repair" that never goes away (Attack.clearLevel goes to town whenever needRepair says so)
			if (this.affordableRepairs().length > 0 || this.toTrash().length > 0) {
				repairAction.push("repairSome");
			}
		}

		return repairAction;
	},

	getItemsForRepair: function (repairPercent, chargedItems) {
		var i, charge, quantity, durability,
			itemList = [],
			item = me.getItem(-1, 1);

		if (item) {
			do {
				if (!item.getFlag(0x400000)) { // Skip ethereal items
					switch (item.itemType) {
					// Quantity check
					case 42: // Throwing knives
					case 43: // Throwing axes
					case 44: // Javelins
					case 87: // Amazon javelins
						quantity = item.getStat(70);

						if (typeof quantity === "number" && quantity * 100 / (getBaseStat("items", item.classid, "maxstack") + item.getStat(254)) <= repairPercent) { // Stat 254 = increased stack size
							itemList.push(copyUnit(item));
						}

						break;
					// Durability check
					default:
						durability = item.getStat(72);

						if (typeof durability === "number" && durability * 100 / item.getStat(73) <= repairPercent) {
							itemList.push(copyUnit(item));
						}

						break;
					}

					if (chargedItems) {
						// Charged item check
						charge = item.getStat(-2)[204];

						if (typeof (charge) === "object") {
							if (charge instanceof Array) {
								for (i = 0; i < charge.length; i += 1) {
									if (charge[i] !== undefined && charge[i].hasOwnProperty("charges") && charge[i].charges * 100 / charge[i].maxcharges <= repairPercent) {
										itemList.push(copyUnit(item));
									}
								}
							} else if (charge.charges * 100 / charge.maxcharges <= repairPercent) {
								itemList.push(copyUnit(item));
							}
						}
					}
				}
			} while (item.getNext());
		}

		return itemList;
	},

	reviveMerc: function () {
		if (!this.needMerc()) {
			return true;
		}

		// Fuck Aheara
		if (me.act === 3) {
			this.goToTown(2);
		}

		var i, tick, dialog, lines,
			preArea = me.area,
			npc = this.initNPC("Merc", "reviveMerc");

		if (!npc) {
			return false;
		}

MainLoop:
		for (i = 0; i < 3; i += 1) {
			dialog = getDialogLines();

			for (lines = 0; lines < dialog.length; lines += 1) {
				if (dialog[lines].text.match(":", "gi")) {
					dialog[lines].handler();
					delay(Math.max(750, me.ping * 2));
				}

				// "You do not have enough gold for that."
				if (dialog[lines].text.match(getLocaleString(3362), "gi")) {
					return false;
				}
			}

			while (getTickCount() - tick < 2000) {
				if (!!me.getMerc()) {
					delay(Math.max(750, me.ping * 2));

					break MainLoop;
				}

				delay(200);
			}
		}

		Attack.checkInfinity();

		if (!!me.getMerc()) {
			if (Config.MercWatch) { // Cast BO on merc so he doesn't just die again
				print("MercWatch precast");
				Pather.useWaypoint("random");
				Precast.doPrecast(true);
				Pather.useWaypoint(preArea);
			}

			return true;
		}

		return false;
	},

	needMerc: function () {
		var i, merc;

		if (me.gametype === 0 || !Config.UseMerc || me.gold < me.mercrevivecost) { // gametype 0 = classic
			return false;
		}

		// me.getMerc() might return null if called right after taking a portal, that's why there's retry attempts
		for (i = 0; i < 3; i += 1) {
			merc = me.getMerc();

			if (merc && merc.mode !== 0 && merc.mode !== 12) {
				return false;
			}

			delay(100);
		}

		if (!me.mercrevivecost) { // In case we never had a merc and Config.UseMerc is still set to true for some odd reason
			return false;
		}

		return true;
	},

	canStash: function (item, ignoreRoom) {
		if (Item.isHeldForTeam(item)) { // Qolbot: taken off for an upgrade, waiting to be dropped at the portal spot for the team
			return false;
		}

		var ignoredClassids = [
			524, // scroll of inifuss
			525, // key to the cairn stones
			89, // horaldric malus
			552, // book of skill
			//549, // horaldric cube
			//92, // shaftofthehoradricstaff
			//521, // topofthehoradricstaff
			91, // horadricstaff
			546, // ajadefigurine
			547, // thegoldenbird
			545, // potionoflife
			87, // thegidbinn
			548, // lamesen'stome
			//553, // khalim'seye
			//554, // khalim'sheart
			//555, // khalim'sbrain
			//173, // khalim'sflail
			174, // khalim'swill
			551, // mephisto'ssoulstone
			90, // hellforgehammer
			644, // malah'spotion
			646, // scrollofresistance
		]; // Some quest items that have to be in inventory or equipped

		if (this.ignoredItemTypes.indexOf(item.itemType) > -1 || ignoredClassids.indexOf(item.classid) > -1 || (!ignoreRoom && !Storage.Stash.CanFit(item))) {
			return false;
		}

		return true;
	},

	// Is this item one a bot should put in the stash? A keeper by the keep list (or cubing, runewords, crafting), unless it is an item
	// the bot is about to wear or give to its mercenary.
	wantStash: function (item) {
		var result = (Pickit.checkItem(item).result > 0 && Pickit.checkItem(item).result < 4) || (!item.getFlag(0x10) && !Item.isReplacable(item) && Pickit.checkItem(item).result === -1) || Cubing.keepItem(item) || Runewords.keepItem(item) || CraftingSystem.keepItem(item);

		if (Config.AutoEquip && Pickit.checkItem(item).result === 1 && Item.gearTier(item) > 0 && Item.autoEquipCheck(item)) {
			result = false;
		}

		if (Config.AutoMercEquip && Pickit.checkItem(item).result === 1 && NTIP.GetMercTier(item) > 0 && Item.autoMercEquipCheck(item)) {
			result = false;
		}

		return !!result;
	},

	// REJUVENATION POTIONS, reserve and accumulation (user, 2026-11-13): the user wants them for two things, a potion on hand when the bot is about to die,
	// and as many as possible piled up over time. A potion cannot tell which it is for, a COUNT can: the bot keeps Config.RejuvReserve of them on hand (belt
	// plus pack; 4, a full belt column), every one beyond that is accumulation and goes to the stash, and when the bot is short of the reserve it takes the
	// difference out of the stash. Reserve first, accumulation from the overflow.
	rejuvCounts: function () {
		var i, items = me.getItems() || [], c = {belt: 0, pack: 0, stash: 0};

		for (i = 0; i < items.length; i += 1) {
			if (items[i].itemType === 78 && items[i].mode === 2) { // mode 2 = in the belt
				c.belt += 1;
			} else if (items[i].itemType === 78 && items[i].mode === 0) {
				if (items[i].location === 3) {
					c.pack += 1;
				} else if (items[i].location === 7) {
					c.stash += 1;
				}
			}
		}

		return c;
	},

	rejuvTopUp: function () {
		var i, items, moved = 0, c = this.rejuvCounts(), need = (Config.RejuvReserve || 4) - c.belt - c.pack;

		if (!me.inTown || need <= 0 || c.stash <= 0 || !this.openStash()) {
			return 0;
		}

		items = (me.getItems() || []).filter(function (it) {
			return it.itemType === 78 && it.mode === 0 && it.location === 7;
		});

		for (i = 0; i < items.length && moved < need; i += 1) {
			if (Storage.Inventory.MoveTo(items[i])) {
				moved += 1;
			}
		}

		me.cancel();

		if (moved) {
			print("Rejuvs: took " + moved + " rejuvenation potion(s) out of the stash for the reserve (" + (c.belt + c.pack + moved) + " on hand).");
		}

		return moved;
	},

	stash: function (stashGold) {
		if (stashGold === undefined) {
			stashGold = true;
		}

		// Settings, Game, "Using Quartermaster?": its .deposit command stores the common items (rejuvenation potions ...) first, before the stash is
		// used, and also when nothing else needs stashing: the pack fills with potions that no stash rule ever moves
		if (typeof Quartermaster === "object") {
			try {
				Quartermaster.deposit(true); // also on an emergency visit (Quartermaster.skip): .deposit before the stash
			} catch (depositError) {
				print("Quartermaster: " + depositError);
			}
		}

		try {
			if (!Config.UsesQuartermaster) { // with Quartermaster the next arrival in town deposits the pack's rejuvenation potions again: moving them out of the stash is pointless
				this.rejuvTopUp(); // short of the reserve: take rejuvenation potions out of the stash first
			}
		} catch (topUpError) {
			print("Rejuvs: " + topUpError);
			me.cancel();
		}

		try {
			this.cubeToStash();
		} catch (cubeError) {
			print("Town: the cube to the stash: " + cubeError);
			me.cancel();
		}

		if (!this.needStash()) {
			return true;
		}

		me.cancel();

		var i, result, tier, noRoom = false,
			items = Item.botItems(),
			rejuvKeep = Math.max(0, (Config.RejuvReserve || 4) - this.rejuvCounts().belt); // how many rejuvenation potions in the pack are the reserve

		if (items) {
			for (i = 0; i < items.length; i += 1) {
				if (items[i].itemType === 78 && rejuvKeep > 0) { // the reserve stays in the pack; the rest of them is accumulation and goes to the stash
					rejuvKeep -= 1;

					continue;
				}

				if (!this.canStash(items[i], true) || !this.wantStash(items[i])) {
					continue;
				}

				noRoom = false;

				if (!Storage.Stash.CanFit(items[i])) {
					if (Item.toCube(items[i])) { // Qolbot: the cube is extra storage once the stash is full
						Misc.itemLogger("Stashed", items[i]);
						try { Misc.logItem("Stashed", items[i]); } catch (stashLogError) { print("Stashed: " + stashLogError); } // Qolbot: the stats for the Activity card (live 21:19:31, Sankt's rare Small Shield had none)
						print("\xFFc7Stashed " + Pickit.itemColor(items[i]) + items[i].name + " [" + Item.stashWhy(items[i]) + "]");

						if (Item.isCharm(items[i])) {
							Item.forgetCharm(items[i]);
						}

						continue;
					}

					noRoom = true;

					if (Config.InfiniteStash && !this.noMorePages) {
						Cubing.newStashPage(); // a fresh page in view ("/insertpage")
						D2Bot.printToConsole("New Stash Created!", 7);
					}
					else {
						this.stashFullStop(items[i]); // no page can be added (or never could: the user's PlugY.ini allows one page of the personal stash)
						return false;
					}
				}

				Misc.itemLogger("Stashed", items[i]);

				if (Storage.Stash.MoveTo(items[i])) {
					try { Misc.logItem("Stashed", items[i]); } catch (stashLogError) { print("Stashed: " + stashLogError); } // Qolbot: the stats for the Activity card (live 21:19:31, Sankt's rare Small Shield had none)
					print("\xFFc7Stashed " + Pickit.itemColor(items[i]) + items[i].name + " [" + Item.stashWhy(items[i]) + "]"); // read by Qolbot's Activity list

					if (Item.isCharm(items[i])) {
						Item.forgetCharm(items[i]); // it is in the stash now: nothing to remember
					}
				} else if (noRoom) { // the page that was just asked for did not give room: PlugY does not allow another one
					this.noMorePages = true;
					this.stashFullStop(items[i]);

					return false;
				}
			}
		}

		// Stash gold
		if (stashGold) {
			if (me.getStat(14) >= this.stashGoldAt() && me.getStat(15) < 25e5 && this.openStash()) {
				gold(me.getStat(14), 3);
				delay(1000);
				me.cancel();
			}
		}

		return true;
	},

	// Qolbot: keepers that were put in the cube while the cube was storage (Item.cubeRoom, before 2026-11-15) go to the stash, a new PlugY page when the
	// shown one is full; quest items and what Town.canStash leaves alone stay. Only when the stash can grow: otherwise the cube is the storage.
	// UNTESTED in a game.
	// Qolbot: the items a town trip gets rid of (Item.tripItem) out of the cube into the pack, where the chores identify, sell and stash them (the cube was
	// filled in the field to make room: Item.cubeForRoom). Returns how many are still in the cube for want of room in the pack. UNTESTED in a game.
	// how many items wait in the cube for a town visit (what unloadCube would take out)
	cubeWaiting: function () {
		try {
			if (!me.getItem(549)) {
				return 0;
			}

			return (me.findItems(-1, -1, 6) || []).filter(function (it) { return !Item.userOwned(it) && Item.tripItem(it); }).length;
		} catch (waitError) {
			return 0;
		}
	},

	unloadCube: function () {
		var i, items, moved = 0;

		if (!me.inTown || !me.getItem(549)) {
			return 0;
		}

		items = (me.findItems(-1, -1, 6) || []).filter(function (it) { return !Item.userOwned(it) && Item.tripItem(it); });

		if (!items.length) {
			return 0;
		}

		try {
			if (!Cubing.openCube()) {
				return items.length;
			}

			for (i = 0; i < items.length; i += 1) {
				if (Storage.Inventory.CanFit(items[i]) && Storage.Inventory.MoveTo(items[i])) {
					moved += 1;
				}

				Storage.Reload();
			}
		} catch (unloadError) {
			print("Town: the cube: " + unloadError);
		}

		me.cancel();
		print("Town: took " + moved + " of " + items.length + " item(s) out of my cube for the town chores.");

		return items.length - moved;
	},

	cubeToStash: function () {
		var i, items, added = false;

		if (!Config.InfiniteStash || this.noMorePages || !me.getItem(549) || this.holdCube) {
			return true;
		}

		// Everything in the cube goes to the stash, identified or not (the user, 2026-11-16: "items go in the cube if the inventory is full, and those items in the cube
		// cannot be IDed but they will all automatically go into the stash ... is the safest way to do it"; a full inventory is a yellow alert on the Activity page).
		items = (me.findItems(-1, -1, 6) || []).filter(function (it) { return Town.canStash(it, true) && (Town.cubeFinal ? !Item.userOwned(it) : Town.wantStash(it)); }); // before the last round only what the normal filter keeps; in the last one (cubeFinal) all that is left (the user, 2026-11-18)

		if (!items.length) {
			return true;
		}

		if (!this.openStash()) {
			return false;
		}

		for (i = 0; i < items.length; i += 1) {
			if (!Storage.Stash.CanFit(items[i])) {
				if (added) {
					print("Town: no room in the stash for " + items[i].name + " from the cube, even on a new page: it stays in the cube.");

					continue;
				}

				print("Town: the stash page is full: adding a page for the items in my cube.");
				Cubing.newStashPage();
				added = true;

				if (!Storage.Stash.CanFit(items[i])) {
					continue;
				}
			}

			if (Storage.Stash.MoveTo(items[i])) {
				print("Town: moved " + items[i].name + " from my cube to the stash");

				// The Activity list is told "Stashed <item>" once per item. An item that went into the cube through Pack.stashed was announced then; the ones the field put into the
				// cube (Item.cubeForRoom, Item.cursorToCube: a farm run's keepers, uniques and sets among them) were not, and never showed on the Activity tab (the user,
				// 2026-11-16: "none of these are reflected in the activity tab"). UNTESTED in a game.
				if (!Item.stashAnnounced[items[i].gid]) {
					Item.stashAnnounced[items[i].gid] = true;

					try { Misc.logItem("Stashed", items[i]); } catch (stashLogError) { print("Stashed: " + stashLogError); }

					// from a full pack: a unique or set says what it is, anything else was not identified (it could not be, in the cube)
					print("\xFFc7Stashed " + Pickit.itemColor(items[i]) + items[i].name + " [" + (items[i].quality === 7 || items[i].quality === 5 || items[i].getFlag(0x10) ? Item.stashWhy(items[i]) : "pack was full: not identified") + "]"); // read by Qolbot's Activity list
				}
			}
		}

		return true;
	},

	// The stash is full and no page can be added: say so (Qolbot stops the whole team for it and shows a red box, fatal.go) and stop this bot cleanly.
	stashFullStop: function (item) {
		print("Stash is full: no room for " + item.name + " and no page can be added (PlugY allows one page): stopping.");
		D2Bot.printToConsole("No More Space In Stash!", 8);
		D2Bot.stop(me.profile, true);
	},

	// Qolbot: ALL the gold goes to the stash on every visit that does the chores (the user, 2026-11-15: "having any gold on their person seems meaningless --
	// make them stash all their gold every time they do chores"). Gold above the pack's cap is lost on a sale (Xena, 0 gold for a Glorious Chain Mail at
	// 580,000), and _DefaultConfig.js's StashGold of 1,000,000 was more than any of them can carry, so it never happened. The chores spend the pack's gold
	// first (potions, repair, gamble come before the stash), and Gold.js takes stash gold out when the pack runs low. Config.StashGold is not used.
	// UNTESTED in a game.
	stashGoldAt: function () {
		return 1;
	},

	needStash: function () {
		if (me.getStat(14) >= this.stashGoldAt() && me.getStat(15) < 25e5) {
			return true;
		}

		var i,
			items = Item.botItems();

		for (i = 0; i < items.length; i += 1) {
			if (Storage.Stash.CanFit(items[i])) {
				return true;
			}
		}

		return false;
	},

	openStash: function () {
		if (getUIFlag(0x19)) {
			return true;
		}

		print("Opening the stash");

		var i, tick, stash,
			telekinesis = me.classid === 1 && me.getSkill(43, 1);

		for (i = 0; i < 5; i += 1) {
			this.move("stash");

			stash = getUnit(2, 267);

			if (stash) {
				if (telekinesis) {
					Skill.cast(43, 0, stash);
				} else {
					Misc.click(0, 0, stash);
					//stash.interact();
				}

				tick = getTickCount();

				while (getTickCount() - tick < 1000) {
					if (getUIFlag(0x19)) {
						delay(200);

						return true;
					}

					delay(10);
				}
			}

			if (i > 1) {
				Packet.flash(me.gid);

				if (stash) {
					Pather.moveToUnit(stash);
				} else {
					this.move("stash");
				}

				telekinesis = false;
			}
		}

		return false;
	},

	getCorpse: function () {
		var i, corpse, gid,
			corpseList = [],
			timer = getTickCount();

		// No equipped items - high chance of dying in last game, force retries
		if (!me.getItem(-1, 1)) {
			for (i = 0; i < 5; i += 1) {
				corpse = getUnit(0, me.name, 17);

				if (corpse) {
					break;
				}

				delay(500);
			}
		} else {
			corpse = getUnit(0, me.name, 17);
		}

		if (!corpse) {
			return true;
		}

		do {
			if (corpse.dead && corpse.name === me.name && (getDistance(me.x, me.y, corpse.x, corpse.y) <= 20 || me.inTown)) {
				corpseList.push(copyUnit(corpse));
			}
		} while (corpse.getNext());

		while (corpseList.length > 0) {
			if (me.dead) {
				return false;
			}

			gid = corpseList[0].gid;

			Pather.moveToUnit(corpseList[0]);
			Misc.click(0, 0, corpseList[0]);
			delay(500);

			if (getTickCount() - timer > 3000) {
				Pather.moveTo(me.x + rand(-1, 1) * 4, me.y + rand(-1, 1) * 4);
			}

			if (getTickCount() - timer > 30000) {
				D2Bot.printToConsole("Failed to get corpse, stopping.", 9);
				D2Bot.stop();
			}

			if (!getUnit(0, -1, -1, gid)) {
				corpseList.shift();
			}
		}

		if (me.gametype === 0) {
			this.checkShard();
		}

		return true;
	},

	checkShard: function () {
		var shard,
			check = {left: false, right: false},
			item = me.getItem("bld", 0);

		if (item) {
			do {
				if (item.location === 3 && item.quality === 7) {
					shard = copyUnit(item);

					break;
				}
			} while (item.getNext());
		}

		if (!shard) {
			return true;
		}

		item = me.getItem(-1, 1);

		if (item) {
			do {
				if (item.bodylocation === 4) {
					check.right = true;
				}

				if (item.bodylocation === 5) {
					check.left = true;
				}
			} while (item.getNext());
		}

		if (!check.right) {
			shard.toCursor();

			while (me.itemoncursor) {
				clickItem(0, 4);
				delay(500);
			}
		} else if (!check.left) {
			shard.toCursor();

			while (me.itemoncursor) {
				clickItem(0, 5);
				delay(500);
			}
		}

		return true;
	},

	clearBelt: function () {
		while (!me.gameReady) {
			delay(100);
		}

		var item = me.getItem(-1, 2),
			clearList = [];

		if (item) {
			do {
				switch (item.itemType) {
				case 76: // Healing
					if (Config.BeltColumn[item.x % 4] !== "hp") {
						clearList.push(copyUnit(item));
					}

					break;
				case 77: // Mana
					if (Config.BeltColumn[item.x % 4] !== "mp") {
						clearList.push(copyUnit(item));
					}

					break;
				case 78: // Rejuvenation
					if (Config.BeltColumn[item.x % 4] !== "rv") {
						clearList.push(copyUnit(item));
					}

					break;
				}
			} while (item.getNext());

			while (clearList.length > 0) {
				clearList.shift().interact();
				delay(200);
			}
		}

		return true;
	},

	clearScrolls: function () {
		var i,
			items = me.getItems();

		for (i = 0; !!items && i < items.length; i += 1) {
			if (items[i].location === 3 && items[i].mode === 0 && items[i].itemType === 22) {
				if (getUIFlag(0xC) || (Config.PacketShopping && getInteractedNPC() && getInteractedNPC().itemcount > 0)) { // Might as well sell the item if already in shop
					print("clearInventory sell " + items[i].name);
					Misc.itemLogger("Sold", items[i]);
					try { Misc.logItem("Sold", items[i]); } catch (soldLogError) { print("Sold: " + soldLogError); } // Qolbot: the stats for the Activity entry
					items[i].sell();
				} else {
					Misc.itemLogger("Dropped", items[i], "clearScrolls");
					items[i].drop();
				}
			}
		}

		return true;
	},

	clearInventory: function () {
		var i, col, result, item, beltSize, soldName, goldBefore,
			items = [];

		this.checkQuestItems(); // only golden bird quest for now

		// Return potions to belt
		item = me.getItem(-1, 0);

		if (item) {
			do {
				if (item.location === 3 && [76, 77, 78].indexOf(item.itemType) > -1) {
					items.push(copyUnit(item));
				}
			} while (item.getNext());

			beltSize = Storage.BeltSize();
			col = this.checkColumns(beltSize);

			// Sort from HP to RV
			items.sort(function (a, b) {
				return a.itemType - b.itemType;
			});

			while (items.length) {
				item = items.shift();

				for (i = 0; i < 4; i += 1) {
					if (item.code.indexOf(Config.BeltColumn[i]) > -1 && col[i] > 0) {
						if (col[i] === beltSize) { // Pick up the potion and put it in belt if the column is empty
							if (item.toCursor()) {
								clickItem(0, i, 0, 2);
							}
						} else {
							clickItem(2, item.x, item.y, item.location); // Shift-click potion
						}

						delay(me.ping + 200);

						col = this.checkColumns(beltSize);

						// One potion goes into ONE belt column. Without this the loop went on to the next column of the same kind and clicked the potion AGAIN where it no
						// had been (a mana potion, two mana columns with room): Xena's game died there with "Halt ... Unrecoverable internal error" at every start, 2026-11-13 21:12-21:46
						break;
					}
				}
			}
		}

		// Cleanup remaining potions
		print("Potions: cleanup: the pack holds " + this.packPotions().join("/") + " hp/mp, spares allowed " + Config.HPBuffer + "/" + Config.MPBuffer + ".");
		item = me.getItem(-1, 0);

		if (item) {
			items = [
				[], // array for hp
				[] // array for mp
			];

			do {
				if (item.itemType === 76) {
					items[0].push(copyUnit(item));
				}

				if (item.itemType === 77) {
					items[1].push(copyUnit(item));
				}
			} while (item.getNext());

			// Cleanup healing potions
			while (items[0].length > Config.HPBuffer) {
				items[0].shift().interact();
				delay(200 + me.ping);
			}

			// Cleanup mana potions
			while (items[1].length > Config.MPBuffer) {
				items[1].shift().interact();
				delay(200 + me.ping);
			}
		}

		// Any leftover items from a failed ID (crashed game, disconnect etc.)
		items = Item.botItems();

		for (i = 0; !!items && i < items.length; i += 1) {
			if ([18, 41, 76, 77, 78].indexOf(items[i].itemType) === -1 && // Don't drop tomes, keys or potions
					!QuestItems.isProtected(items[i]) && // the quest items (QuestItems.keep) and the Pandemonium keys, organs, token and essences: never thrown away
					(items[i].code !== 529 || !!me.findItem(518, 0, 3)) && // Don't throw scrolls if no tome is found (obsolete code?)
					(items[i].code !== 530 || !!me.findItem(519, 0, 3)) && // Don't throw scrolls if no tome is found (obsolete code?)
					!Cubing.keepItem(items[i]) && // Don't throw cubing ingredients
					!Runewords.keepItem(items[i]) && // Don't throw runeword ingredients
					!CraftingSystem.keepItem(items[i]) && // Don't throw crafting system ingredients
					Item.sellable(items[i]) // only plain gear is ever sold or dropped: anything else stays (and goes to the stash)
					) {
				result = Pickit.checkItem(items[i]).result;

				result = this.keepVerdict(items[i], result);

				switch (result) {
				case 0: // Junk: sell it for gold (the only thing a bot drops is the item an upgrade replaces)
					try {
						this.initNPC("Shop", "clearInventory");
						print("clearInventory sell " + items[i].name);
						Misc.itemLogger("Sold", items[i]);
						try { Misc.logItem("Sold", items[i]); } catch (soldLogError) { print("Sold: " + soldLogError); } // Qolbot: the stats for the Activity entry

						if (Item.isCharm(items[i])) {
							Item.forgetCharm(items[i]); // sold: nothing to remember
						}

						soldName = items[i].name;
						goldBefore = me.gold;
						items[i].sell();
						delay(150 + me.ping);
						for (var soldWait = 0; soldWait < 10 && me.gold === goldBefore; soldWait += 1) { // the gold arrives after the sale packet: wait up to 1.5 s for it, so the line below is not "0 gold"
							delay(150);
						}
						print("Sold " + soldName + " for " + (me.gold - goldBefore) + " gold (no keep rule)."); // what an item fetched (2026-11-13: 8430 gold arrived in one visit and no log line said why)
					} catch (sellError) {
						print(sellError);
					}

					break;
				case 4: // Sell item
					// Qolbot: never sold unidentified: a keep rule may need its stats (live 18:38:59, Xena's rare Gauntlets: Generated.nip #102 keeps rare
					// gloves by their stats, GoldSell.nip sells rare gloves by kind, and the sell line won while the stats were unknown). It waits for the
					// next identify (Town.identify identifies a GoldSell item first).
					if (!items[i].getFlag(0x10)) {
						break;
					}

					try {
						print("LowGold sell " + items[i].name);
						this.initNPC("Shop", "clearInventory");
						Misc.itemLogger("Sold", items[i]);
						try { Misc.logItem("Sold", items[i]); } catch (soldLogError) { print("Sold: " + soldLogError); } // Qolbot: the stats for the Activity entry

						if (Item.isCharm(items[i])) {
							Item.forgetCharm(items[i]); // sold: nothing to remember
						}

						soldName = items[i].name;
						goldBefore = me.gold;
						items[i].sell();
						delay(150 + me.ping);
						for (var soldWait = 0; soldWait < 10 && me.gold === goldBefore; soldWait += 1) { // the gold arrives after the sale packet: wait up to 1.5 s for it, so the line below is not "0 gold"
							delay(150);
						}
						print("Sold " + soldName + " for " + (me.gold - goldBefore) + " gold (a sell rule).");
					} catch (e) {
						print(e);
					}

					break;
				}
			}
		}

		return true;
	},

	act : [{}, {}, {}, {}, {}],

	initialize: function () {
		//print("Initialize town " + me.act);

		switch (me.act) {
		case 1:
			var fire,
				wp = getPresetUnit(1, 2, 119),
				fireUnit = getPresetUnit(1, 2, 39);

			if (!fireUnit) {
				return false;
			}

			fire = [fireUnit.roomx * 5 + fireUnit.x, fireUnit.roomy * 5 + fireUnit.y];

			this.act[0].spot = {};
			this.act[0].spot.stash = [fire[0] - 7, fire[1] - 12];
			this.act[0].spot.warriv = [fire[0] - 5, fire[1] - 2];
			this.act[0].spot.cain = [fire[0] + 6, fire[1] - 5];
			this.act[0].spot[NPC.Kashya] = [fire[0] + 14, fire[1] - 4];
			this.act[0].spot[NPC.Akara] = [fire[0] + 56, fire[1] - 30];
			this.act[0].spot[NPC.Charsi] = [fire[0] - 39, fire[1] - 25];
			this.act[0].spot[NPC.Gheed] = [fire[0] - 34, fire[1] + 36];
			this.act[0].spot.portalspot = [fire[0] + 10, fire[1] + 18];
			this.act[0].spot.waypoint = [wp.roomx * 5 + wp.x, wp.roomy * 5 + wp.y];
			this.act[0].initialized = true;

			break;
		case 2:
			this.act[1].spot = {};
			this.act[1].spot[NPC.Fara] = [5124, 5082];
			this.act[1].spot.cain = [5124, 5082];
			this.act[1].spot[NPC.Lysander] = [5118, 5104];
			this.act[1].spot[NPC.Greiz] = [5033, 5053];
			this.act[1].spot[NPC.Elzix] = [5032, 5102];
			this.act[1].spot.palace = [5088, 5153];
			this.act[1].spot.sewers = [5221, 5181];
			this.act[1].spot.meshif = [5205, 5058];
			this.act[1].spot[NPC.Drognan] = [5097, 5035];
			this.act[1].spot.atma = [5137, 5060];
			this.act[1].spot.warriv = [5152, 5201];
			this.act[1].spot.portalspot = [5168, 5060];
			this.act[1].spot.stash = [5124, 5076];
			this.act[1].spot.waypoint = [5070, 5083];
			this.act[1].initialized = true;

			break;
		case 3:
			this.act[2].spot = {};
			this.act[2].spot.meshif = [5118, 5168];
			this.act[2].spot[NPC.Hratli] = [5223, 5048, 5127, 5172];
			this.act[2].spot[NPC.Ormus] = [5129, 5093];
			this.act[2].spot[NPC.Asheara] = [5043, 5093];
			this.act[2].spot[NPC.Alkor] = [5083, 5016];
			this.act[2].spot.cain = [5148, 5066];
			this.act[2].spot.stash = [5144, 5059];
			this.act[2].spot.portalspot = [5150, 5063];
			this.act[2].spot.waypoint = [5158, 5050];
			this.act[2].initialized = true;

			break;
		case 4:
			this.act[3].spot = {};
			this.act[3].spot.cain = [5027, 5027];
			this.act[3].spot[NPC.Halbu] = [5089, 5031];
			this.act[3].spot[NPC.Tyrael] = [5027, 5027];
			this.act[3].spot[NPC.Jamella] = [5088, 5054];
			this.act[3].spot.stash = [5022, 5040];
			this.act[3].spot.portalspot = [5045, 5042];
			this.act[3].spot.waypoint = [5043, 5018];
			this.act[3].initialized = true;

			break;
		case 5:
			this.act[4].spot = {};
			this.act[4].spot.portalspot = [5098, 5019];
			this.act[4].spot.stash = [5129, 5061];
			this.act[4].spot[NPC.Larzuk] = [5141, 5045];
			this.act[4].spot[NPC.Malah] = [5078, 5029];
			this.act[4].spot.cain = [5119, 5061];
			this.act[4].spot[NPC["Qual-Kehk"]] = [5066, 5083];
			this.act[4].spot[NPC.Anya] = [5112, 5120];
			this.act[4].spot.portal = [5118, 5120];
			this.act[4].spot.waypoint = [5113, 5068];
			this.act[4].spot.nihlathak = [5071, 5111];
			this.act[4].initialized = true;

			break;
		}

		return true;
	},

	move: function (spot) {
		if (!me.inTown) {
			this.goToTown();
		}

		var i, path;

		if (!this.act[me.act - 1].initialized) {
			this.initialize();
		}

		// Act 5 wp->portalspot override - ActMap.cpp crash
		if (me.act === 5 && spot === "portalspot" && getDistance(me.x, me.y, 5113, 5068) <= 8) {
			path = [5113, 5068, 5108, 5051, 5106, 5046, 5104, 5041, 5102, 5027, 5098, 5018];

			for (i = 0; i < path.length; i += 2) {
				Pather.walkTo(path[i], path[i + 1]);
			}

			return true;
		}

		// Qolbot: and the other way, portalspot -> wp: Pather.moveTo cannot find it either (live 13:48:54 on 2026-11-14: Darius, "move retry 1 at 5099,5019
		// (area 109) to 5110,5061", then 12 "waypoint retry" and "useWaypoint: Failed to use waypoint", Siege on Harrogath failed twice). UNTESTED live.
		if (me.act === 5 && spot === "waypoint" && getDistance(me.x, me.y, 5098, 5018) <= 12) {
			path = [5098, 5018, 5102, 5027, 5104, 5041, 5106, 5046, 5108, 5051, 5113, 5068];

			for (i = 0; i < path.length; i += 2) {
				Pather.walkTo(path[i], path[i + 1]);
			}

			return true;
		}

		for (i = 0; i < 3; i += 1) {
			if (this.moveToSpot(spot)) {
				return true;
			}

			Packet.flash(me.gid);
		}

		return false;
	},

	moveToSpot: function (spot) {
		var i, path, townSpot,
			longRange = (me.classid === 1 && this.telekinesis && me.getSkill(43, 1) && ["stash", "portalspot"].indexOf(spot) > -1) || spot === "waypoint";

		if (!this.act[me.act - 1].hasOwnProperty("spot") || !this.act[me.act - 1].spot.hasOwnProperty(spot)) {
			return false;
		}

		if (typeof (this.act[me.act - 1].spot[spot]) === "object") {
			townSpot = this.act[me.act - 1].spot[spot];
		} else {
			return false;
		}

		if (longRange) {
			path = getPath(me.area, townSpot[0], townSpot[1], me.x, me.y, 1, 8);

			if (path && path[1]) {
				townSpot = [path[1].x, path[1].y];
			}
		}

		for (i = 0; i < townSpot.length; i += 2) {
			//print("moveToSpot: " + spot + " from " + me.x + ", " + me.y);

			if (getDistance(me, townSpot[i], townSpot[i + 1]) > 2) {
				Pather.moveTo(townSpot[i], townSpot[i + 1], 3, false, true);
			}

			switch (spot) {
			case "stash":
				if (!!getUnit(2, 267)) {
					return true;
				}

				break;
			case "cain":
				if (!!getUnit(1, NPC.Cain)) {
					return true;
				}

				break;
			case "palace":
				if (!!getUnit(1, "jerhyn")) {
					return true;
				}

				break;
			case "portalspot":
			case "sewers":
				if (getDistance(me, townSpot[i], townSpot[i + 1]) < 10) {
					return true;
				}

				break;
			case "waypoint":
				if (!!getUnit(2, "waypoint")) {
					return true;
				}

				break;
			default:
				if (!!getUnit(1, spot)) {
					return true;
				}

				break;
			}
		}

		return false;
	},

	// Qolbot: true while Town.visitTown or PartySync.hold runs a trip that makes its own team call (goToTown then does not call)
	ownTrip: false,

	// Qolbot: ONE TO TOWN, ALL TO TOWN (the user, 2026-11-15: "if any party members portals out of the field -- for any reason -- everyone drops
	// everything and takes that portal immediately"; "there are just a thousand places those rules are being ignored"). This is the bottom of every
	// trip from the field to town (about 200 callers: quest scripts, Quick Travel, the regroup, the waypoint sync, a lost follower ...), so the call is
	// made here and not in each of them: ANY bot of a bot-led run that comes to town from the field goes through PartySync.call: the leader calls the
	// party through its portal; a follower calls nobody and tells the leader, who then calls the team through the follower's portal (the user,
	// 2026-11-15: "the leader alone issues orders. nobody else does"; TownChicken.js, PartySync.wentTown). Not when it
	// only follows somebody to town: its leader is already there, or another bot's trip is on. Trips that call by themselves (Town.visitTown,
	// PartySync.hold) set ownTrip. A Sorceress's solo Quick Travel trip calls nobody. UNTESTED in a game.
	teamFollows: function (fieldArea) {
		var towns = [1, 40, 75, 103, 109];

		try {
			if (this.ownTrip || !fieldArea || !me.inTown || typeof PartySync !== "object" || typeof Team !== "object" || Team.solo || PartySync.currentId ||
					!PartySync.enabled() || !Team.syncOn() || PartySync.tripOn()) {
				return false;
			}

			if (!Team.isLeader() && Config.Leader && towns.indexOf(Team.areas()[Config.Leader]) > -1) {
				return false; // I follow my leader, who is in town already
			}

			if (!PartySync.call(fieldArea)) {
				return false;
			}

			PartySync.currentId = 0; // no trip of mine to run here: the town gate takes everybody out together
			return true;
		} catch (callError) {
			print("Town: calling the team to town: " + callError);

			return false;
		}
	},

	goToTown: function (act, wpmenu) {
		var towns = [1, 40, 75, 103, 109], fieldArea = me.inTown ? 0 : me.area;

		if (!me.inTown) {
			print("Going back to town");

			// an open town portal close by is free (a new one costs a scroll); not for the emergency trips of the town chicken thread (reusePortals is false
			// there): with low life nobody walks to somebody else's portal
			// not in Tal Rasha's tombs or Duriel's Lair while The Summoner is open: the game refuses a mate's portal back in, so the bot needs its own to
			// return (live 2026-11-15 14:58: Sankt came to town by a mate's portal and every one of the four was refused on the way back; Quester.act2_summoner)
			if (!((me.area < 66 || me.area > 73 || me.getQuest(13, 0)) && this.reusePortals !== false && Pather.useTownPortalNear(35))) {
				if (!Pather.makePortal()) {
					throw new Error("Town.goToTown: Failed to make TP");
				}

				if (!Pather.usePortal(null, me.name)) {
					// Qolbot: a portal in a spot the bot cannot reach from where it stands (live 14:36-14:37 on 2026-11-14: Darius in the Bloody Foothills, two
					// attempts of Siege on Harrogath "Failed to take TP", 30 s each): step away and try a new one; next to Harrogath, walk in. UNTESTED live.
					print("Town.goToTown: could not take my portal at " + me.x + "," + me.y + " (area " + me.area + "): stepping away for another");
					Pather.moveTo(me.x + rand(-15, 15), me.y + rand(-15, 15));

					if (!(Pather.makePortal() && Pather.usePortal(null, me.name))) {
						if (me.area === 110) {
							Pather.moveToExit(109, true);
						}

						if (!me.inTown) {
							throw new Error("Town.goToTown: Failed to take TP");
						}
					}
				}
			}

			this.teamFollows(fieldArea);
		}

		if (act === undefined) {
			return true;
		}

		if (act < 1 || act > 5) {
			throw new Error("Town.goToTown: Invalid act");
		}

		if (act !== me.act && !Pather.accessToAct(act)) {
			throw new Error("Town.goToTown: act " + act + " is not unlocked yet");
		}

		if (act !== me.act) {
			try {
				Pather.useWaypoint(towns[act - 1], wpmenu);
			} catch (WPError) {
				throw new Error("Town.goToTown: Failed use WP");
			}
		}

		return true;
	},

	// Qolbot: back out through a mate's portal: the caller's first (the bot whose trip this is), then the leader's, then any other's, each one
	// by name. Pather.usePortal(area, null) took the first portal in view every time, and the game refuses the portal of a player who is not in my
	// party (live 2026-11-15 14:51:12: Meir's portal to Tomb #5 came first; Darius, Sankt and Xena failed on it for 30 s and walked, while the
	// portal of Barabas, who had called them, was open 20 yards away; the user: "prob not partied"). No mate's portal in view: the old any-mate try.
	mateBack: function (area, caller) {
		var i, p, name, info, order = [], owners = [];

		// Tal Rasha's tombs (66-72) and Duriel's Lair: a mate's portal there is refused while The Summoner (quest 13) is open (Quester.act2_summoner)
		if (area >= 66 && area <= 73 && !me.getQuest(13, 0)) {
			print("Town: The Summoner is not done, so a mate's portal to " + Pather.getAreaName(area) + " would be refused");

			return false;
		}

		if (caller) {
			order.push(caller); // read before PartySync.barrier, which ends the trip
		}

		try {
			info = FileTools.exists("data/bots.json") ? JSON.parse(FileTools.readText("data/bots.json")) : null;

			if (info && info.leader) {
				order.push(info.leader);
			}
		} catch (leaderError) {
			print("Town: who leads is not known (" + leaderError + ")");
		}

		p = getUnit(2, "portal");

		if (p) {
			do {
				name = p.getParent();

				if (name && name !== me.name && p.objtype === area && owners.indexOf(name) === -1) {
					owners.push(name);
				}
			} while (p.getNext());
		}

		if (!owners.length) {
			return Pather.usePortal(area, null);
		}

		owners.sort(function (a, b) {
			var ia = order.indexOf(a), ib = order.indexOf(b);

			return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
		});

		for (i = 0; i < owners.length; i += 1) {
			print("Town: going back out by " + owners[i] + "'s portal" + (owners.length > 1 ? " (" + (i + 1) + " of " + owners.length + ": " + owners.join(", ") + ")" : ""));

			if (Pather.usePortal(area, owners[i])) {
				return true;
			}
		}

		return false;
	},

	visitTown: function (is_chicken) {
		if (me.inTown) {
			this.doChores();
			this.move("stash");

			return true;
		}

		var preArea = me.area,
			preAct = me.act;

		try { // not an essential function -> handle thrown errors
			this.ownTrip = true; // this trip makes its own team call, below
			this.goToTown();
		} catch (e) {
			return false;
		} finally {
			this.ownTrip = false;
		}

		// the party trip (bot-only runs): this bot is in town now and its portal is open in the field, so the mates can come through it. EVERY trip to
		// town calls the team, whatever the reason (a heal, a repair, a full pack ...: the user, 2026-11-14: "if anyone goes to town for any reason they all
		// take the portal to town"); a bot that is answering a call (currentId set) does not call again
		if (typeof PartySync === "object" && !PartySync.currentId && (PartySync.wantCall || !is_chicken)) {
			PartySync.wantCall = false;
			PartySync.call(preArea, !!is_chicken); // the field area the trip goes back to; a town chicken trip (low life, mana, potions) is urgent
		}

		// if chicken...
		if (is_chicken) {
			print('Go to town and heal (chicken).');
			this.initNPC("Heal", "heal");
		}

		this.doChores();

		if (me.act !== preAct) {
			this.goToTown(preAct);
		}

		this.move("portalspot");

		var tripCaller = "";

		if (typeof PartySync === "object" && PartySync.currentId) {
			try { tripCaller = PartySync.makerOf(PartySync.currentId); } catch (makerError) { print("Town: who called the trip is not known (" + makerError + ")"); }

			PartySync.barrier(); // a party trip (bot-only runs): wait in town until everybody is ready; the leader goes last

			if (PartySync.stayInTown) { // the maker's mates did not go out: a follower stays in town and follows the leader from here, not alone through the portal
				PartySync.stayInTown = false;

				return true;
			}
		}

		// my own portal, else any portal of the party that leads back where I left (a mate who came by the caller's portal has none of its own)
		if (!Pather.usePortal(preArea, me.name) && !this.mateBack(preArea, tripCaller)) { // this part is essential
			// Qolbot: no portal took me back (Nightmare, Tal Rasha's Tombs, live 2026-11-15 10:22-10:36: every bot's portal back into the tomb failed, four
			// times, and the quest then looked for the Orifice in Lut Gholein): walk back by waypoint instead. UNTESTED in a game.
			try {
				print("Town: no portal took me back to " + Pather.getAreaName(preArea) + ": walking back");
				Pather.journeyTo(preArea);
			} catch (walkBackError) {
				print("Town: the walk back failed: " + walkBackError);
			}

			if (me.area !== preArea) {
				throw new Error("Town.visitTown: Failed to go back from town");
			}
		}

		if (Config.PublicMode) {
			Pather.makePortal();
		}

		return true;
	}
};