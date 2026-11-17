/**
*	@filename	ToolsThread.js
*	@author		kolton
*	@desc		several tools to help the player - potion use, chicken, Diablo clone stop, map reveal, quit with player
*/

js_strict(true);

include("json2.js");
include("NTItemParser.dbl");
include("OOG.js");
include("AutoMule.js");
include("Gambling.js");
include("CraftingSystem.js");
include("TorchSystem.js");
include("MuleLogger.js");
include("common/Attack.js");
include("common/Cubing.js");
include("common/CollMap.js");
include("common/Config.js");
include("common/Loader.js");
include("common/Misc.js");
include("common/Pickit.js");
include("common/Pather.js");
include("common/Precast.js");
include("common/Prototypes.js");
include("common/Runewords.js");
include("common/Storage.js");
include("common/Town.js");
include("common/Saver.js");
include("common/QuestTable.js"); // the quests, for watchQuests
include("common/MercHire.js"); // the kind of the merc for the bot card (MercHire.current: class and a skill only that kind has)

function main() {
	var i, mercHP, ironGolem, tick, merc,
		debugInfo = {area: 0, currScript: "no entry"},
		pingTimer = [],
		quitFlag = false,
		cloneWalked = false,
		canQuit = true,
		timerLastDrink = [];

	print("ÿc3Start ToolsThread script");
	D2Bot.init();
	Config.init(false);
	Pickit.init(false);
	Storage.Init();
	CraftingSystem.buildLists();
	Runewords.init();
	Cubing.init();

	for (i = 0; i < 5; i += 1) {
		timerLastDrink[i] = 0;
	}

	// Reset core chicken
	me.chickenhp = -1;
	me.chickenmp = -1;

	// General functions
	this.checkPing = function (print) {
		// Quit after at least 5 seconds in game
		if (getTickCount() - me.gamestarttime < 5000) {
			return false;
		}

		var i;

		for (i = 0; i < Config.PingQuit.length; i += 1) {
			if (Config.PingQuit[i].Ping > 0) {
				if (me.ping >= Config.PingQuit[i].Ping) {
					me.overhead("High Ping");

					if (pingTimer[i] === undefined || pingTimer[i] === 0) {
						pingTimer[i] = getTickCount();
					}

					if (getTickCount() - pingTimer[i] >= Config.PingQuit[i].Duration * 1000) {
						if (print) {
							D2Bot.printToConsole("High ping (" + me.ping + "/" + Config.PingQuit[i].Ping + ") - leaving game.", 9);
						}

						scriptBroadcast("pingquit");

						return true;
					}
				} else {
					pingTimer[i] = 0;
				}
			}
		}

		return false;
	};

	this.initQuitList = function () {
		var i, string, obj,
			temp = [];

		for (i = 0; i < Config.QuitList.length; i += 1) {
			if (FileTools.exists("data/" + Config.QuitList[i] + ".json")) {
				string = Misc.fileAction("data/" + Config.QuitList[i] + ".json", 0);

				if (string) {
					obj = JSON.parse(string);

					if (obj && obj.hasOwnProperty("name")) {
						temp.push(obj.name);
					}
				}
			}
		}

		Config.QuitList = temp.slice(0);
	};

	this.getPotion = function (pottype, type) {
		var i,
			items = me.getItems();

		if (!items || items.length === 0) {
			return false;
		}

		// Get highest id = highest potion first
		items.sort(function (a, b) {
			return b.classid - a.classid;
		});

		for (i = 0; i < items.length; i += 1) {
			if (type < 3 && items[i].mode === 0 && items[i].location === 3 && items[i].itemType === pottype) {
				print("ÿc2Drinking potion from inventory.");

				return copyUnit(items[i]);
			}

			if (items[i].mode === 2 && items[i].itemType === pottype) {
				return copyUnit(items[i]);
			}
		}

		return false;
	};

	this.togglePause = function () {
		var i,	script,
			scripts = ["default.dbj", "tools/townchicken.js", "tools/antihostile.js", "tools/party.js", "tools/rushthread.js"];

		for (i = 0; i < scripts.length; i += 1) {
			script = getScript(scripts[i]);

			if (script) {
				if (script.running) {
					if (i === 0) { // default.dbj
						print("ÿc1Pausing.");
					}

					// don't pause townchicken during clone walk
					if (scripts[i] !== "tools/townchicken.js" || !cloneWalked) {
						script.pause();
					}
				} else {
					if (i === 0) { // default.dbj
						print("ÿc2Resuming.");
					}

					script.resume();
				}
			}
		}

		return true;
	};

	this.stopDefault = function () {
		var script = getScript("default.dbj");

		if (script && script.running) {
			script.stop();
		}

		return true;
	};

	// inDanger: a chicken, so the "save before a chicken" setting applies (Saver.beforeLeaving)
	this.exit = function (inDanger) {
		this.stopDefault();

		if (inDanger) {
			Saver.beforeLeaving();
		}

		quit();
	};

	this.drinkPotion = function (type) {
		var pottype, potion,
			tNow = getTickCount();

		switch (type) {
		case 0:
		case 1:
			if ((timerLastDrink[type] && (tNow - timerLastDrink[type] < 1000)) || me.getState(type === 0 ? 100 : 106)) {
				return false;
			}

			break;
		case 2:
		case 4:
			if (timerLastDrink[type] && (tNow - timerLastDrink[type] < 300)) { // small delay for juvs just to prevent using more at once
				return false;
			}

			break;
		default:
			if (timerLastDrink[type] && (tNow - timerLastDrink[type] < 8000)) {
				return false;
			}

			break;
		}

		if (me.mode === 0 || me.mode === 17 || me.mode === 18) { // mode 18 - can't drink while leaping/whirling etc.
			return false;
		}

		switch (type) {
		case 0:
		case 3:
			pottype = 76;

			break;
		case 1:
			pottype = 77;

			break;
		default:
			pottype = 78;

			break;
		}

		potion = this.getPotion(pottype, type);

		if (potion) {
			if (me.mode === 0 || me.mode === 17) {
				return false;
			}

			if (type < 3) {
				potion.interact();
			} else {
				try {
					clickItem(2, potion);
				} catch (e) {
					print("Couldn't give the potion to merc.");
				}
			}

			timerLastDrink[type] = getTickCount();

			return true;
		}

		return false;
	};

	this.getNearestMonster = function () {
		var gid, distance,
			monster = getUnit(1),
			range = 30;

		if (monster) {
			do {
				if (monster.hp > 0 && Attack.checkMonster(monster) && !monster.getParent()) {
					distance = getDistance(me, monster);

					if (distance < range) {
						range = distance;
						gid = monster.gid;
					}
				}
			} while (monster.getNext());
		}

		if (gid) {
			monster = getUnit(1, -1, -1, gid);
		} else {
			monster = false;
		}

		if (monster) {
			return " to " + monster.name;
		}

		return "";
	};

	this.checkVipers = function () {
		var owner,
			monster = getUnit(1, 597);

		if (monster) {
			do {
				if (monster.getState(96)) {
					owner = monster.getParent();

					if (owner && owner.name !== me.name) {
						return true;
					}
				}
			} while (monster.getNext());
		}

		return false;
	};

	this.getIronGolem = function () {
		var owner,
			golem = getUnit(1, 291);

		if (golem) {
			do {
				owner = golem.getParent();

				if (owner && owner.name === me.name) {
					return copyUnit(golem);
				}
			} while (golem.getNext());
		}

		return false;
	};

	this.getNearestPreset = function () {
		var i, unit, dist, id;

		unit = getPresetUnits(me.area);
		dist = 99;

		for (i = 0; i < unit.length; i += 1) {
			if (getDistance(me, unit[i].roomx * 5 + unit[i].x, unit[i].roomy * 5 + unit[i].y) < dist) {
				dist = getDistance(me, unit[i].roomx * 5 + unit[i].x, unit[i].roomy * 5 + unit[i].y);
				id = unit[i].type + " " + unit[i].id;
			}
		}

		return id || "";
	};

	// Event functions
	this.keyEvent = function (key) {
		switch (key) {
		case 19: // Pause/Break key
			this.togglePause();

			break;
		case 123: // F12 key
			me.overhead("Revealing " + Pather.getAreaName(me.area));
			revealLevel(true);

			break;
		case 107: // Numpad +
			showConsole();
			print("ÿc4MF: ÿc0" + me.getStat(80) + " ÿc4GF: ÿc0" + me.getStat(79) + " ÿc1FR: ÿc0" + me.getStat(39) +
				" ÿc3CR: ÿc0" + me.getStat(43) + " ÿc9LR: ÿc0" + me.getStat(41) + " ÿc2PR: ÿc0" + me.getStat(45));

			break;
		case 101: // numpad 5
			if (AutoMule.getInfo() && AutoMule.getInfo().hasOwnProperty("muleInfo")) {
				if (AutoMule.getMuleItems().length > 0) {
					print("ÿc2Mule triggered");
					scriptBroadcast("mule");
					this.exit();
				} else {
					me.overhead("No items to mule.");
				}
			} else {
				me.overhead("Profile not enabled for muling.");
			}

			break;
		case 102: // Numpad 6
			MuleLogger.logChar();

			break;
		case 109: // Numpad -
			Misc.spy(me.name);

			break;
		case 110: // decimal point
			say("/fps");

			break;
		case 105: // numpad 9 - get nearest preset unit id
			print(this.getNearestPreset());

			break;
		}
	};

	this.gameEvent = function (mode, param1, param2, name1, name2) {
		switch (mode) {
		case 0x00: // "%Name1(%Name2) dropped due to time out."
		case 0x01: // "%Name1(%Name2) dropped due to errors."
		case 0x03: // "%Name1(%Name2) left our world. Diablo's minions weaken."
			if ((typeof Config.QuitList === "string" && Config.QuitList.toLowerCase() === "any") ||
					(Config.QuitList instanceof Array && Config.QuitList.indexOf(name1) > -1)) {
				print(name1 + (mode === 0 ? " timed out" : " left"));

				quitFlag = true;
			}

			if (Config.AntiHostile) {
				scriptBroadcast("remove " + name1);
			}

			break;
		case 0x06: // "%Name1 was Slain by %Name2" 
			if (Config.AntiHostile && param2 === 0x00 && name2 === me.name) {
				scriptBroadcast("mugshot " + name1);
			}

			break;
		case 0x07:
			if (Config.AntiHostile && param2 === 0x03) { // "%Player has declared hostility towards you."
				scriptBroadcast("findHostiles");
			}

			break;
		case 0x11: // "%Param1 Stones of Jordan Sold to Merchants"
			if (Config.DCloneQuit === 2) {
				D2Bot.printToConsole("SoJ sold in game. Leaving.");

				quitFlag = true;

				break;
			}

			if (Config.SoJWaitTime && me.gametype === 1) { // only do this in expansion
				D2Bot.printToConsole(param1 + " Stones of Jordan Sold to Merchants on IP " + me.gameserverip.split(".")[3], 7);
				Messaging.sendToScript("default.dbj", "soj");
			}

			break;
		case 0x12: // "Diablo Walks the Earth"
			if (Config.DCloneQuit > 0) {
				D2Bot.printToConsole("Diablo walked in game. Leaving.");

				quitFlag = true;

				break;
			}

			if (Config.StopOnDClone && me.gametype === 1) { // only do this in expansion
				D2Bot.printToConsole("Diablo Walks the Earth", 7);

				cloneWalked = true;

				this.togglePause();
				Town.goToTown();
				showConsole();
				print("ÿc4Diablo Walks the Earth");

				me.maxgametime = 0;

				if (Config.KillDclone) {
					load("tools/clonekilla.js");
				}
			}

			break;
		}
	};

	this.scriptEvent = function (msg) {
		var obj;

		switch (msg) {
		case "toggleQuitlist":
			canQuit = !canQuit;

			break;
		case "quit":
			quitFlag = true;

			break;
		default:
			try {
				obj = JSON.parse(msg);
			} catch (e) {
				return;
			}

			if (obj) {
				if (obj.hasOwnProperty("currScript")) {
					debugInfo.currScript = obj.currScript;
				}

				if (obj.hasOwnProperty("lastAction")) {
					debugInfo.lastAction = obj.lastAction;
				}

				//D2Bot.store(JSON.stringify(debugInfo));
				DataFile.updateStats("debugInfo", JSON.stringify(debugInfo));
			}

			break;
		}
	};

	// Cache variables to prevent a bug where d2bs loses the reference to Config object
	Config = Misc.copy(Config);
	tick = getTickCount();

	addEventListener("keyup", this.keyEvent);
	addEventListener("gameevent", this.gameEvent);
	addEventListener("scriptmsg", this.scriptEvent);
	addEventListener("gamepacket", Events.gamePacket);

	// Load Fastmod
	Packet.changeStat(105, Config.FCR);
	Packet.changeStat(99, Config.FHR);
	Packet.changeStat(102, Config.FBR);
	Packet.changeStat(93, Config.IAS);

	if (Config.QuitListMode > 0) {
		this.initQuitList();
	}

	// Qolbot ("watchKills" in qolbot.json, on by default): the bot tells the Activity list when a boss (an act boss, a super unique or a gold-named unique) near it dies. Champions are left out.
	// While you play the bots stand next to you and decide little, so this is most of what they have to report. Several bots see the same
	// kill; Qolbot shows it once (the monster's id is in the line). (spectype & 0x5 is how the other scripts tell a boss from plain monsters and champions.)
	var watchKills = !!Config.WatchKills, seenMon = {}, saidMon = {}, saidCount = 0, lastScan = 0;

	// Qolbot: every bot says when one of its quests becomes complete, the moment the game sets it, in the Quester's words (the user, 2026-11-14:
	// followers' completions only reached the Activity list from their saves, a minute or two later). The first look in a game only remembers what is
	// done; the leader's Quester says it too, and the manager shows one entry per bot and quest.
	var questDone = null, questAt = 0;

	this.watchQuests = function () {
		var i, q, rows, done;

		if (getTickCount() - questAt < 3000) {
			return;
		}

		questAt = getTickCount();
		rows = QuestTable.rows || [];

		if (!questDone) {
			questDone = {};

			for (i = 0; i < rows.length; i += 1) {
				questDone[rows[i].id] = !!me.getQuest(rows[i].id, 0);
			}

			return;
		}

		for (i = 0; i < rows.length; i += 1) {
			q = rows[i];
			done = !!me.getQuest(q.id, 0);

			if (done && !questDone[q.id]) {
				print("Quester: Act " + q.act + " - #" + q.num + " - \"" + q.title + "\" is complete."); // read by Qolbot's Activity list
			}

			questDone[q.id] = done;
		}
	};

	this.watchKills = function () {
		var now = getTickCount(), mon, spec, dead, label;

		if (now - lastScan < 2000) { // a look at the monsters near the bot every two seconds is plenty
			return;
		}

		lastScan = now;

		if (saidCount > 3000) { // a long game: start over rather than grow
			seenMon = {};
			saidMon = {};
			saidCount = 0;
		}

		mon = getUnit(1);

		if (mon) {
			do {
				spec = mon.spectype;

				// a super unique (0x01: Corpsefire, Bishibosh, ...), not its minions (0x08). Not the random uniques (0x04): their name reads wrong here, every
				// one of them was "Mind Maw the Slasher" (live 18:14-18:17 on Nightmare: gids 45, 46, 49, 92 in the Blood Moor and 183 in the Den of Evil)
				if ((spec & 0x01) && !(spec & 0x08)) {
					dead = mon.hp === 0 || mon.mode === 0 || mon.mode === 12;

					if (!dead) {
						seenMon[mon.gid] = true;
					} else if (seenMon[mon.gid] && !saidMon[mon.gid]) { // only a death we watched: corpses lying around are not news
						saidMon[mon.gid] = true;
						saidCount += 1;
						print("Killed " + mon.name + " (" + Pather.getAreaName(me.area) + ") [" + mon.gid + "]");
					}
				}
			} while (mon.getNext());
		}
	};

	var lastZone = 0, lastVitals = 0, lastLifePct = -1;
	var lastLevel = 0;

	// Start
	while (true) {
		try {
			if (me.gameReady && me.charlvl !== lastLevel) {
				if (lastLevel > 0 && me.charlvl > lastLevel) {
					print("Leveled up to level " + me.charlvl); // read by Qolbot's Activity list

					Saver.soon("level up");
				}

				lastLevel = me.charlvl;
			}

			if (me.gameReady && me.area !== lastZone) {
				lastZone = me.area;
				D2Bot.zone(typeof Pather !== "undefined" && Pather.getAreaName ? Pather.getAreaName(me.area) : "Area " + me.area, ["Normal", "Nightmare", "Hell"][me.diff]);
			}

			// life in percent for the face on the bot's card (Qolbot): when it changed by 3 or more, and at least every 10 seconds
			if (me.gameReady && me.hpmax > 0 && getTickCount() - lastVitals > 1500) {
				var lifePct = Math.max(0, Math.min(100, Math.round(me.hp * 100 / me.hpmax)));

				if (Math.abs(lifePct - lastLifePct) >= 3 || getTickCount() - lastVitals > 10000) {
					lastVitals = getTickCount();
					lastLifePct = lifePct;
					D2Bot.vitals(lifePct);
				}
			}

			// gold and town portal scrolls, for Qolbot (data/<profile>.purse.json): it picks a leader that has scrolls and starts a gold hunt when the
			// team is broke. Every 30 seconds.
			if (me.gameReady && getTickCount() - (this.lastPurse || 0) > 30000) {
				this.lastPurse = getTickCount();

				try {
					// a big change in gold gets a line of its own, so the next drop can be traced to what the bot was doing (2026-11-13: 2600 gold went in
					// ten minutes and the logs could not say where: a mercenary revival, potions, scrolls?)
					if (this.lastGold !== undefined && Math.abs(me.getStat(14) + me.getStat(15) - this.lastGold) >= 300) {
						print("Purse: " + this.lastGold + " -> " + (me.getStat(14) + me.getStat(15)) + " gold (" + (me.inTown ? "in town" : "in the field") + ", " + Town.checkScrolls(518) + " scrolls)");
					}

					this.lastGold = me.getStat(14) + me.getStat(15);
					// once per game: does this bot hold the Gidbinn (87) or the Gidbinn quest item? (the altar gives nothing to a bot whose party mate already has it?)
					if (!this.gidbinnNoted) {
						this.gidbinnNoted = true;
						print("Quest items: the Gidbinn is " + (me.getItem(87) ? "HELD (" + me.getItem(87).location + ")" : "not held"));
					}
					FileTools.writeText("data/" + me.profile + ".purse.json", JSON.stringify({gold: me.getStat(14), stash: me.getStat(15), scrolls: Town.checkScrolls(518), at: Date.now()}));
				} catch (purseError) {
					print("purse: " + purseError);
				}
			}

			if (me.gameReady) {
				try {
					this.watchQuests();
				} catch (questError) {
					print("watchQuests: " + questError);
				}
			}

			if (watchKills && me.gameReady && !me.inTown) {
				try {
					this.watchKills();
				} catch (watchError) {
					print("watchKills: " + watchError);
				}
			}

			if (me.gameReady && !me.inTown) {
				if (Config.UseHP > 0 && me.hp < Math.floor(me.hpmax * Config.UseHP / 100)) {
					this.drinkPotion(0);
				}

				if (Config.UseRejuvHP > 0 && me.hp < Math.floor(me.hpmax * Config.UseRejuvHP / 100)) {
					this.drinkPotion(2);
				}

				// a rejuvenation potion just drunk heals at once, but the life the client sees catches up a moment later: give it that moment before
				// leaving, unless life is already very low (2026-11-15: the bots chickened with rejuvs in the belt)
				if (Config.LifeChicken > 0 && me.hp <= Math.floor(me.hpmax * Config.LifeChicken / 100)
						&& !(timerLastDrink[2] && getTickCount() - timerLastDrink[2] < 600 && me.hp > Math.floor(me.hpmax * 0.15))) {
					D2Bot.printToConsole("Life Chicken (" + me.hp + "/" + me.hpmax + ")" + this.getNearestMonster() + " in " + Pather.getAreaName(me.area) + ". Ping: " + me.ping, 9);
					D2Bot.updateChickens();
					this.exit(true);

					break;
				}

				if (Config.UseMP > 0 && me.mp < Math.floor(me.mpmax * Config.UseMP / 100)) {
					this.drinkPotion(1);
				}

				if (Config.UseRejuvMP > 0 && me.mp < Math.floor(me.mpmax * Config.UseRejuvMP / 100)) {
					this.drinkPotion(2);
				}

				if (Config.ManaChicken > 0 && me.mp <= Math.floor(me.mpmax * Config.ManaChicken / 100)) {
					D2Bot.printToConsole("Mana Chicken: (" + me.mp + "/" + me.mpmax + ") in " + Pather.getAreaName(me.area), 9);
					D2Bot.updateChickens();
					this.exit(true);

					break;
				}

				if (Config.IronGolemChicken > 0 && me.classid === 2) {
					if (!ironGolem || copyUnit(ironGolem).x === undefined) {
						ironGolem = this.getIronGolem();
					}

					if (ironGolem) {
						if (ironGolem.hp <= Math.floor(128 * Config.IronGolemChicken / 100)) { // ironGolem.hpmax is bugged with BO
							D2Bot.printToConsole("Irom Golem Chicken in " + Pather.getAreaName(me.area), 9);
							D2Bot.updateChickens();
							this.exit(true);

							break;
						}
					}
				}

				if (Config.UseMerc) {
					mercHP = getMercHP();
					merc = me.getMerc();

					if (mercHP > 0 && merc && merc.mode !== 12) {
						if (mercHP < Config.MercChicken) {
							D2Bot.printToConsole("Merc Chicken in " + Pather.getAreaName(me.area), 9);
							D2Bot.updateChickens();
							this.exit(true);

							break;
						}

						if (mercHP < Config.UseMercHP) {
							this.drinkPotion(3);
						}

						if (mercHP < Config.UseMercRejuv) {
							this.drinkPotion(4);
						}
					}
				}

				if (Config.ViperCheck && getTickCount() - tick >= 250) {
					if (this.checkVipers()) {
						D2Bot.printToConsole("Revived Tomb Vipers found. Leaving game.", 9);

						quitFlag = true;
					}

					tick = getTickCount();
				}

				if (this.checkPing(true)) {
					quitFlag = true;
				}
			}
		} catch (e) {
			Misc.errorReport(e, "ToolsThread");

			quitFlag = true;
		}

		if (quitFlag && canQuit) {
			print("ÿc8Run duration ÿc2" + ((getTickCount() - me.gamestarttime) / 1000));

			if (Config.LogExperience) {
				Experience.log();
			}

			this.checkPing(false); // In case of quitlist triggering first
			this.exit();

			break;
		}

		if (debugInfo.area !== Pather.getAreaName(me.area)) {
			debugInfo.area = Pather.getAreaName(me.area);

			//D2Bot.store(JSON.stringify(debugInfo));
			DataFile.updateStats("debugInfo", JSON.stringify(debugInfo));
		}

		delay(20);
	}

	return true;
}