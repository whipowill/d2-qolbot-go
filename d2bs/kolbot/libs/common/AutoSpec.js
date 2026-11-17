/**
*	@filename	AutoSpec.js
*	@desc		Applies the build plan qolbot detected for this character (data/<profile>.spec.json).
*	            qolbot reads the character's save before every start (internal/spec), decides what kind of
*	            character it is, and writes the plan. This file only applies it:
*	              mode "template" / "fresh": include the chosen template (libs/config/Templates/<Class>/<Name>.js) and run it
*	              mode "custom":             keep adding to the skills the character already has, stats stay put, rest to vitality
*	            Nothing here can stop a bot from starting: any problem is printed and the default config is kept.
*/

include("common/Plan.js");
include("common/Report.js");
include("common/Pack.js");
include("common/Qol.js");

var AutoSpec = {
	apply: function () {
		var plan = Plan.read(), main, i;

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

		// A follower of a leader bot picks nothing up but the quest consumables: the leader does the looting, the followers are support, but each
		// character has to take and use its own Book of Skill and the like.
		if (plan.noPickup && typeof Pickit === "object") {
			Pickit.questOnly = true;
			print("AutoSpec: this bot picks up only quest consumables (the leader does the looting).");
		}

		// Container sizes and the full-stash policy: the game cannot be asked, so they are settings (web page, Settings tab).
		if (plan.storage) {
			Config.StorageSizeInventory = plan.storage.inventory;
			Config.StorageSizeStash = plan.storage.stash;
			Config.StorageSizeCube = plan.storage.cube;
			Config.InfiniteStash = !!plan.storage.addStashPages; // true: add a PlugY stash page when full; false: stop the bot

			try {
				Pack.lockMatrix(plan.storage);
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
				// in the order of the farm list (the Bots tab): Loader runs Scripts in its key order, and a key the config already declares keeps its old place
				// (live 21:47, Catacombs, Durance and Chaos Sanctuary are not in _BaseConfigFile.js and ran after Baal; Nihlathak ran before Eldritch). Deleted
				// and set again, each farm run goes to the end in list order. UNTESTED.
				for (i = 0; i < plan.farm.length; i += 1) {
					delete Scripts[plan.farm[i]];
				}

				for (i = 0; i < plan.farm.length; i += 1) {
					Scripts[plan.farm[i]] = true;
				}

				print("AutoSpec: goal Farm: " + plan.farm.join(", "));
			} else {
				Report.problem("AutoSpec", "My objective is " + (plan.goal || "unknown") + " but there is nothing for me to run: choose the farm runs (or Quest) on the Bots tab.");
			}
		}

		// ForceSave (PlugY's /save) is the LAST script: a TCP/IP game that ends with quit() does not save (Saver.js), so what a run picked up is lost unless something saves
		// after it. The farm runs above were deleted and set again to put them in the user's order, which put them AFTER ForceSave (declared in _DefaultConfig.js):
		// live 2026-11-16, Meir: Mephisto's uniques and sets were picked up and placed in the cube, and none of them was in the save after the game, 24 runs. It saves at the
		// START of each game then. Deleted and set again, it is the last key. UNTESTED in a game.
		if (Scripts.ForceSave) {
			delete Scripts.ForceSave;
			Scripts.ForceSave = true;
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
		Config.UsesQuartermaster = !!plan.quartermaster; // the Quartermaster mod's ".deposit" chat command is sent before the stash is used (Quartermaster.js)
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
		Config.MercChoice = plan.merc || ""; // the bot card: the merc to have (MercHire.js replaces one of another kind first thing in a game)
		Config.MercCandidates = plan.mercCandidates || {}; // "act-difficulty" -> the kinds a hire list entry is rolled among (MercHire.rollKind)
		Config.MercKinds = plan.mercKinds || []; // the mercs of THIS game (its Hireling.txt, or the 1.13d ones; Qolbot reads them, mercs.go)
		Config.UsesQol = !!plan.qol; // "Using QOL?": Qol.js sends nothing and the two mercenary options are off without it
		Config.MercQolEquip = Qol.mercEquip(plan.mercQolEquip); // QOL mod, qol.ini [mercenary] equip=1: mercs take more weapon kinds (Item.mercWeapons)
		Config.MercDropOnHire = Qol.mercDropOnHire(plan.mercDropOnHire); // QOL mod, qol.ini [mercenary] drop_items=1: a replaced merc drops its gear
		Config.Regroup = plan.regroup !== false; // Behavior > Party > Auto Regroup
		Config.RegroupSeconds = plan.regroupSeconds || 30; // Behavior > Party: how long a teammate is lost before the leader fetches the team
		Config.InventoryLayout = plan.inventoryLayout !== false; // Behavior: the cube, tomes and keys have fixed places in the pack (Layout.js)
		Config.QuestWaypoints = plan.questWaypoints === true; // Behavior, Quests: collect every waypoint of an act before moving on (Quester.leaveAct)
		Config.HuntClear = plan.hunt === "gold"; // a gold hunt clears every area it passes through on the way to its bosses (Pather.moveToExit)
		if (plan.huntAreas && plan.huntAreas.length) { // a gold hunt: the places the manager chose (huntplaces.go), cleared in full by ClearAnyArea
			Config.ClearAnyArea.AreaList = plan.huntAreas;
			Config.HuntGoal = plan.huntGoal || 0; // Gold.js: during a hunt a bot above this gold gives its surplus to one below it
			print("AutoSpec: gold hunt, clearing areas " + plan.huntAreas.join(", "));
		}
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
