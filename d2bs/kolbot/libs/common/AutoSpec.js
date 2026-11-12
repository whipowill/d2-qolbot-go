/**
*	@filename	AutoSpec.js
*	@desc		Applies the build plan qolbot detected for this character (data/<profile>.spec.json).
*	            qolbot reads the character's save before every start (internal/spec), decides what kind of
*	            character it is, and writes the plan. This file only applies it:
*	              mode "template" / "fresh": include the chosen template (libs/config/Templates/<Class>/<Name>.js) and run it
*	              mode "custom":             keep adding to the skills the character already has, stats stay put, rest to vitality
*	            Nothing here can stop a bot from starting: any problem is printed and the default config is kept.
*/

var AutoSpec = {
	read: function () {
		try {
			return JSON.parse(FileTools.readText("data/" + me.profile + ".spec.json"));
		} catch (e) {
			return null;
		}
	},

	timers: {},

	// true at most once per ms milliseconds for each name (used to rate-limit work that runs in a tight loop)
	due: function (name, ms) {
		var now = Date.now();

		if (!this.timers[name] || now - this.timers[name] >= ms) {
			this.timers[name] = now;

			return true;
		}

		return false;
	},

	// A bot that is asked to do something it cannot must say so loudly, not carry on silently: it says it in chat and
	// prints it to qolbot's console in red.
	fail: function (message) {
		this.problem("I cannot do this: " + message);
		print("AutoSpec: ERROR: " + message);
		D2Bot.printToConsole(me.name + ": " + message, 1);
	},

	// A leader bot waits for its team before it starts the run: every bot qolbot started (data/bots.json) has to be in the game,
	// and then in the leader's party. Bots that never show up are given up on after a while, and the leader says who is missing.
	waitForTeam: function () {
		var start = Date.now(), said = 0, who, now, expected, missing, i, bj, mine, inParty, inGame,
			gameLimit = 240000, partyLimit = 45000, allInAt = 0;

		who = function () {
			var res = {}, p = getParty();

			if (p) {
				do {
					res[p.name] = p.partyid;
				} while (p.getNext());
			}

			return res;
		};

		for (;;) {
			expected = [];

			try {
				if (FileTools.exists("data/bots.json")) {
					bj = JSON.parse(FileTools.readText("data/bots.json"));
					// "team" is who the Start button started it with (known before they have joined), "bots" is every bot running now
					expected = (bj.team || []).concat(bj.bots || []).filter(function (n, k, all) { return n !== me.name && all.indexOf(n) === k; });
				}
			} catch (readError) {
				print("AutoSpec: cannot read the team list: " + readError);
			}

			if (!expected.length) {
				return true; // nobody to wait for
			}

			now = who();

			mine = now[me.name];
			missing = [];
			inGame = 0;
			inParty = 0;

			for (i = 0; i < expected.length; i += 1) {
				if (now[expected[i]] !== undefined) {
					inGame += 1;

					if (mine !== undefined && mine !== 65535 && now[expected[i]] === mine) {
						inParty += 1;
					}
				} else {
					missing.push(expected[i]);
				}
			}

			if (inGame === expected.length) {
				allInAt = allInAt || Date.now();

				if (inParty === expected.length) {
					print("AutoSpec: the whole team is here (" + expected.join(", ") + ")");

					return true;
				}

				if (Date.now() - allInAt > partyLimit) {
					this.problem("Starting with " + (expected.length - inParty) + " of the team not in my party yet.");

					return false;
				}
			} else if (Date.now() - start > gameLimit) {
				this.problem("Starting without " + missing.join(", ") + ": they did not join in " + Math.round(gameLimit / 60000) + " minutes.");

				return false;
			}

			if (Date.now() - said > 30000) {
				said = Date.now();
				this.note("Waiting for my team: " + inGame + " of " + expected.length + " in the game" + (missing.length ? " (not yet: " + missing.join(", ") + ")" : "") + ".");
			}

			delay(1000);
		}
	},

	// Routine chat ("Ready", "Running town chores", ...): hidden when the player chose quiet bots (Settings tab). Problems and
	// requests for the player still use say() directly.
	note: function (message) {
		if (Config.QuietChat) {
			print("AutoSpec (quiet): " + message);
		} else {
			say(message);
		}
	},

	// A problem report ("I cannot reach you", ...): hidden when the player switched problem reports off.
	problem: function (message) {
		if (Config.QuietProblems) {
			print("AutoSpec (quiet problem): " + message);
		} else {
			say(message);
		}
	},

	// Works out how many potions this character needs from the belt it wears and its level, so nothing is configured by
	// hand: a bare level-2 character (a 1-row belt, or none) carries spares in the inventory, and a big belt is only
	// refilled when it is half empty, so the bot does not walk to the potion seller for nothing.
	// Quest state for the log: what the game says about "Sisters to the Slaughter" (6) and the Act 2 travel flag (7), before and
	// after asking the server for a fresh copy (packet 0x40). Added to find out why a bot was not credited for a boss kill.
	questReport: function (force) {
		var every = me.area === 37 ? 3000 : 300000, read, before, after, extra = "", a, p;

		if (!force && !this.due("questreport", every)) {
			return;
		}

		try {
			read = function () { return "q6=" + me.getQuest(6, 0) + "/" + me.getQuest(6, 1) + "/" + me.getQuest(6, 2) + " q7=" + me.getQuest(7, 0) + "/" + me.getQuest(7, 1); };

			if (me.area === 37) { // Andariel's lair: log what is going on around the kill (distance, her state, mine)
				a = getUnit(1, 156);
				extra = a ? " andariel mode " + a.mode + " hp " + a.hp + " dist " + Math.round(getDistance(me, a)) : " andariel not in view";
				p = Config.Leader ? getUnit(0, Config.Leader) : null;
				extra += p ? " leader dist " + Math.round(getDistance(me, p)) : " leader not in view";
				extra += " myhp " + me.hp + " mymode " + me.mode;
			}

			before = read();

			if (me.area !== 37 || this.due("questrefresh", 15000)) {
				sendPacket(1, 0x40);
				delay(400);
				after = read();
			} else {
				after = before;
			}

			print("AutoSpec: quests: area " + me.area + " diff " + me.diff + " " + before + (after !== before ? " -> after refresh " + after : "") + extra);
		} catch (e) {
			print("AutoSpec: quests: " + e);
		}
	},

	tunePotions: function () {
		var rows = Storage.BeltSize(), hp, mp;

		Config.MinColumn[0] = Config.MinColumn[1] = Math.max(1, Math.ceil(rows / 2));
		hp = rows <= 1 ? 4 : (rows === 2 ? 2 : 0); // spares in the inventory while the belt is tiny
		mp = me.classid === 1 || me.classid === 2 || me.classid === 5 ? 1 : 0; // casters also want a spare mana potion
		mp = rows <= 1 ? Math.max(mp, 2) : (rows === 2 ? Math.max(mp, 1) : 0);
		Config.HPBuffer = hp;
		Config.MPBuffer = mp;
		Config.PotionGold = me.charlvl < 15 ? 100 : 1000; // low levels have little gold and potions are cheap
		if (this.due("potreport", 600000)) {
			print("AutoSpec: potions: belt " + rows + " row(s), buy when a column is below " + Config.MinColumn[0] + ", spares in inventory hp " + hp + " mp " + mp + ", needs " + Config.PotionGold + " gold");
		}
	},

	// Does a potion belt column or the potion buffer need topping up? (the same test Town.buyPotions starts with)
	needPotions: function () {
		var i, pot, beltSize = Storage.BeltSize(), col = Town.checkColumns(beltSize), buffer = {hp: 0, mp: 0};

		for (i = 0; i < 4; i += 1) {
			if (["hp", "mp"].indexOf(Config.BeltColumn[i]) > -1 && col[i] > (beltSize - Math.min(Config.MinColumn[i], beltSize))) {
				return true;
			}
		}

		if (Config.HPBuffer > 0 || Config.MPBuffer > 0) {
			pot = me.getItem(-1, 0);

			if (pot) {
				do {
					if (pot.location === 3) {
						buffer.hp += pot.itemType === 76 ? 1 : 0;
						buffer.mp += pot.itemType === 77 ? 1 : 0;
					}
				} while (pot.getNext());
			}

			return buffer.hp < Config.HPBuffer || buffer.mp < Config.MPBuffer;
		}

		return false;
	},

	// Why a trip through the town chores is worth making right now. The first visit of a game does everything once;
	// after that only what is actually needed, so the bot does not walk around town for nothing. Any check that fails
	// counts as "needed" (doing too much is safer than skipping something).
	choresNeeded: function (first) {
		var reasons = [], checks, i, items, it;

		try { this.tunePotions(); } catch (tuneError) { print("AutoSpec: tunePotions: " + tuneError); }

		if (first) {
			return ["first visit"];
		}

		checks = [
			["heal", function () { return Town.needHealing(); }],
			["repair", function () { var r = Town.needRepair(); return !!(r && r.length); }],
			["revive mercenary", function () { return Town.needMerc(); }],
			["stash", function () { return Town.needStash(); }],
			["town portal scrolls", function () { return me.gold >= 450 && Town.checkScrolls(518) < 13; }],
			["identify", function () { return !!Town.getUnids(); }],
			["quest NPC", function () { return typeof Quester === "object" && Quester.questNpcPending(true); }],
			["potions", function () { return me.gold >= (Config.PotionGold || 1000) && AutoSpec.needPotions(); }],
			["spend points", function () { return me.getStat(5) > 0 || me.getStat(4) > 0; }],
			["equip", function () {
				items = me.findItems(-1, 0) || [];

				for (it = 0; it < items.length; it += 1) {
					if (Item.autoEquipCheck(items[it]) || Item.autoMercEquipCheck(items[it])) {
						return true;
					}
				}

				return false;
			}]
		];

		for (i = 0; i < checks.length; i += 1) {
			try {
				if (checks[i][1]()) {
					reasons.push(checks[i][0]);
				}
			} catch (e) {
				reasons.push(checks[i][0] + "?");
			}
		}

		return reasons;
	},

	lastSave: 0,

	// A character is only written to disk when the game saves it. Killing the game saves nothing, and leaving a TCP/IP
	// game with quit() does not save either (tested). PlugY's /save chat command does, so that is what bots use.
	// acknowledge = true when qolbot asked for it because it is about to stop this bot.
	saveNow: function (acknowledge) {
		say("/save");
		this.lastSave = Date.now();
		delay(5000); // let the file be written

		if (acknowledge) {
			D2Bot.saved();
		}

		return true;
	},

	// Called from the follower's main loop: saves every plan.autoSaveMinutes minutes (0 = never).
	autoSave: function () {
		var plan = this.plan || (this.plan = this.read());

		if (!plan || !plan.autoSaveMinutes) {
			return false;
		}

		if (!this.lastSave) {
			this.lastSave = Date.now();

			return false;
		}

		if (Date.now() - this.lastSave < plan.autoSaveMinutes * 60000) {
			return false;
		}

		print("AutoSpec: saving the character (every " + plan.autoSaveMinutes + " min)");

		return this.saveNow(false);
	},

	// Config.Inventory says which inventory cells the bot may use. Every cell is the bot's: the things you keep in your pack on purpose
	// (charms, tomes, keys, the cube, torch parts) are recognised by what they are, see Item.userOwned in Misc.js. The matrix must have
	// exactly one entry per cell of the inventory, so it is built from the inventory size.
	buildLockMatrix: function (st) {
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
		var plan = this.read(), items, i, moved = 0, area, item,
			keep = [518, 519, 529, 530, 543, 549], // tome of town portal, tome of identify, tp scroll, id scroll, key, horadric cube
			potions = [76, 77, 78]; // healing, mana, rejuvenation

		if (!plan || !plan.storage || plan.storage.clearOnLoad === false || !me.inTown) {
			return true;
		}

		items = Item.botItems();

		if (!items) {
			print("AutoSpec: cannot read the inventory to look for keepers.");

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
			print("AutoSpec: no keepers in my pack.");

			return true;
		}

		this.note("I have " + items.length + " keeper(s) in my pack. Moving them to my stash.");
		me.cancel();

		if (!Town.openStash()) {
			this.problem("I could not open my stash, so my pack stays as it is.");

			return false;
		}

		for (i = 0; i < items.length; i += 1) {
			item = items[i];

			if (!Storage.Stash.CanFit(item) && Item.toCube(item)) { // the cube is extra storage once the stash is full
				moved += 1;
				Misc.itemLogger("Stashed", item);

				if (Item.isCharm(item)) {
					Item.forgetCharm(item);
				}

				if (typeof Pickit === "object") {
					print("\xFFc7Stashed " + Pickit.itemColor(item) + item.name); // read by Qolbot's Activity list
				}

				continue;
			}

			if (!Storage.Stash.CanFit(item)) {
				if (plan.storage.addStashPages) {
					this.problem("My stash is full. Adding a stash page.");
					say("/insertpage");
					delay(1000);
					say("/swappage 1"); // only works with PlugY v14
					delay(1000);
					Storage.Reload();
				} else {
					this.fail("my stash is full and I cannot make room (" + (plan.plugy === false ? "the game does not use PlugY, so I cannot add a stash page" : "adding stash pages is off") + "). Stopping.");
					D2Bot.stop(me.profile, true);

					return false;
				}
			}

			if (Storage.Stash.MoveTo(item)) {
				moved += 1;
				Misc.itemLogger("Stashed", item);

				if (Item.isCharm(item)) {
					Item.forgetCharm(item);
				}

				if (typeof Pickit === "object") {
					print("\xFFc7Stashed " + Pickit.itemColor(item) + item.name); // read by Qolbot's Activity list
				}
			}
		}

		me.cancel();

		if (moved > 0 && plan.autoSaveMinutes) {
			this.saveNow(false); // keep what was just moved
		}

		if (moved === items.length) {
			this.note("Done. Moved " + moved + " item(s) to my stash.");
		} else {
			this.problem("I could only move " + moved + " of " + items.length + " item(s) to my stash.");
		}

		return moved === items.length;
	},

	apply: function () {
		var plan = this.read(), main, i;

		if (!plan) {
			print("AutoSpec: no plan for " + me.profile + ", keeping the default config.");

			return false;
		}

		try {
			if (plan.template) {
				if (include(plan.template) && typeof LoadTemplate === "function") {
					LoadTemplate();
					print("AutoSpec: " + plan.mode + " -> " + plan.spec + " (" + plan.reason + ")");
				} else {
					print("AutoSpec: cannot load template " + plan.template);
				}
			} else if (plan.mode === "custom") {
				Config.AutoSkill.Enabled = true;
				Config.AutoSkill.Build = plan.skills || [];
				Config.AutoStat.Enabled = true;
				Config.AutoStat.Build = plan.stats || [["vitality", "all"]];

				main = plan.main;

				if (main > 0) {
					Config.AttackSkill[1] = me.getSkill(main, 1) ? main : 0;
					Config.AttackSkill[3] = me.getSkill(main, 1) ? main : 0;
					Config.AttackSkill[5] = 0;
				}				else {
					// no attack skill to speak of yet: fight with the weapon (the default config attacks with nothing at all)
					Config.AttackSkill[1] = Config.AttackSkill[3] = 0;
					Config.AttackSkill[5] = 0;
				}

				print("AutoSpec: custom build, main skill " + main + " (" + plan.reason + ")");
			}
		} catch (e) {
			print("AutoSpec: error applying the plan: " + e);
		}

		// a config that attacks with nothing leaves the bot standing still: always fall back to the weapon
		if (Config.AttackSkill[1] < 0 && Config.AttackSkill[2] < 0) { Config.AttackSkill[1] = 0; }
		if (Config.AttackSkill[3] < 0 && Config.AttackSkill[4] < 0) { Config.AttackSkill[3] = 0; }

		// Automation switches (Settings tab, Automation): skill points, stat points and gear are only handled when the plan says so.
		// Safe mode (Bots page) is already folded into these flags by Qolbot. Applied last so no template can switch them back on.
		if (plan.autoSkill === false) {
			Config.AutoSkill.Enabled = false;
		}

		if (plan.autoStat === false) {
			Config.AutoStat.Enabled = false;
		}

		if ((plan.autoSkill === false || plan.autoStat === false) && Config.AutoBuild) {
			Config.AutoBuild.Enabled = false; // kolbot's older level-up spender does both
		}

		if (typeof Pickit === "object") {
			Pickit.safeOnly = !!plan.safeMode; // safe mode: only consumables are picked up (see Pickit.safeKinds)
		}

		if (plan.safeMode) {
			print("AutoSpec: SAFE MODE: AutoEquip, AutoStat and AutoSkill are off, and only potions, scrolls, keys and the like are picked up.");
		}

		// A follower of a leader bot picks nothing up: the leader does the looting, the followers are support.
		if (plan.noPickup && typeof Pickit === "object") {
			Pickit.pickItems = function () { return true; };
			Pickit.pickItem = function () { return false; };
			Pickit.fastPick = function () { return true; };
			print("AutoSpec: this bot picks nothing up (the leader does the looting).");
		}

		// Container sizes and the full-stash policy: the game cannot be asked, so they are settings (web page, Settings tab).
		if (plan.storage) {
			Config.StorageSizeInventory = plan.storage.inventory;
			Config.StorageSizeStash = plan.storage.stash;
			Config.StorageSizeCube = plan.storage.cube;
			Config.InfiniteStash = !!plan.storage.addStashPages; // true: add a PlugY stash page when full; false: stop the bot

			try {
				this.buildLockMatrix(plan.storage);
			} catch (matrixError) {
				print("AutoSpec: could not build the inventory lock matrix, keeping the default: " + matrixError);
			}
		}

		// Chat: quotes on or off, and with a leading "!" so the quote shows in a bubble over the bot's head.
		if (plan.gamble === false) { // the Settings tab checkbox: no gambling at all
			Config.Gamble = false;
			Config.GambleItems = [];
		}

		// Script "Goal" = the objective (web page, Bots tab): Quest plays the quests (Questing.js, which runs Quester), Farm runs the chosen farm
		// scripts in order. Nothing is chosen = nothing to run, and the bot says so.
		if (plan.script === "Goal") {
			Scripts.Follower = false;
			Config.PublicMode = 3; // invite the followers into the party (the others only accept)
			Config.RunAutoSave = true; // tools/AutoSaveThread.js
			Config.WaitForTeam = true; // default.dbj: wait for the followers before the first script

			if (plan.goal === "Quest") {
				Scripts.Questing = true;
				print("AutoSpec: goal Quest: running Questing");
			} else if (plan.goal === "Farm" && plan.farm && plan.farm.length) {
				for (i = 0; i < plan.farm.length; i += 1) {
					Scripts[plan.farm[i]] = true;
				}

				print("AutoSpec: goal Farm: " + plan.farm.join(", "));
			} else {
				this.problem("My objective is " + (plan.goal || "unknown") + " but there is nothing for me to run: choose the farm runs (or Quest) on the Bots tab.");
			}
		}

		// The item lists this bot loads (web page, Settings tab, Pickit): one set for followers, one for the leader bot.
		if (plan.pickit && plan.pickit.length) {
			Config.PickitFiles = plan.pickit.slice();
			print("AutoSpec: pickit lists: " + Config.PickitFiles.join(", "));
		}

		Config.QuietChat = plan.reportTasks === false; // Settings tab: "Bots report when they engage in tasks" off
		Config.QuietProblems = plan.reportProblems === false; // Settings tab: "Bots report when they have a problem" off
		Config.AutoTown = plan.autoTown !== false; // follow the leader between town and the field without being told
		Config.UsesPlugy = plan.plugy !== false;
		Config.DarkQuotes = plan.banter !== false;
		Config.BanterBubble = !!plan.banterBubble;

		print("AutoSpec: storage inventory " + Config.StorageSizeInventory.join("x") + ", stash " + Config.StorageSizeStash.join("x") + ", cube " +
			Config.StorageSizeCube.join("x") + ", add stash pages " + Config.InfiniteStash + "; plugy " + Config.UsesPlugy + ", auto town " + Config.AutoTown + "; banter " + Config.DarkQuotes + ", bubble " + Config.BanterBubble);
		if (typeof AutoSkill === "object") {
			AutoSkill.hardPoints = plan.skillPoints || null; // the points the save holds (me.getSkill adds gear bonuses)
		}

		print("AutoSpec: final switches: AutoSkill=" + Config.AutoSkill.Enabled + " AutoStat=" + Config.AutoStat.Enabled + " AutoEquip=" + !!plan.autoEquip + " safeMode=" + !!plan.safeMode);

		Config.Protect = plan.protect; // which equipped items auto-equip must never replace (read by Item.isReplacable)

		// gear: better pieces only; Item.autoEquip never replaces unique, set, crafted or socketed (runeword) items
		Config.AutoEquip = !!plan.autoEquip;
		Config.CainID.Enable = true; // free identifying at Cain once he is rescued (Town.cainID checks); never used while a protected item is unidentified in the bag
		Config.MercWear = plan.mercWear || {}; // Automation tab: extra slots a mercenary can wear in this game
		Config.QuestClearAll = plan.questClearAll !== false; // Config, Quests tab: clear every area a quest passes through
		Config.WatchKills = plan.watchKills === true; // qolbot.json "watchKills": the bot reports the bosses, uniques and champions it sees die (tools/PickThread.js)
		// Bots never craft: no cubing recipes and no runeword making, whatever a template says (the multi-profile crafting system is inert unless a profile is listed in its Teams)
		Config.Cubing = false;
		Config.MakeRunewords = false;
		Config.Recipes = [];
		Config.Runewords = [];
		Config.AutoMercEquip = !!plan.autoEquip;

		return true;
	}
};
