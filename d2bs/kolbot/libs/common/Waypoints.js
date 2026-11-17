/**
*	@filename	Waypoints.js
*	@desc		Waypoints are a TEAM matter (Behavior > Quests > Waypoint Collection): every bot writes which waypoints it has to
*	            data/waypoints-<name>.json, every bot can read the others', and the leader works out who lacks what:
*	              - Waypoints.sync()  at the start of a game: the waypoints a team member has and another lacks are shared before the run begins
*	              - Waypoints.lacking(area)  who in the game lacks the waypoint of an area (the leader's sweep before an act change uses it)
*	            The way to share one: someone who has it takes it, and everybody else comes through a portal (Pather.makePortal, QuickTravel.waypoint)
*	            and clicks it (the Follower takes a waypoint that is close by, Follower.gatherWaypoint).
*	            Nothing here can stop a bot: any problem is printed and the bot goes on.
*/

include("json2.js");
include("common/Report.js");
include("common/Team.js");
include("common/QuickTravel.js");

var Waypoints = {
	towns: [1, 40, 75, 103, 109],
	lastSaved: "",
	lastQuests: "",
	questsAt: 0,
	syncedActs: {}, // act -> the sync for the town of that act is done (once when a game starts, and once on arriving in each new act)

	actOf: function (area) {
		return area <= 39 ? 1 : (area <= 74 ? 2 : (area <= 102 ? 3 : (area <= 108 ? 4 : 5)));
	},

	path: function (name) {
		return "data/waypoints-" + name + ".json";
	},

	// Has this bot (name omitted) or another bot (from its file) the waypoint of the area? getWaypoint(-1) crashes the game: only listed areas are asked.
	has: function (area, name) {
		var index = Pather.wpAreas.indexOf(area), list;

		if (index < 0) {
			return true; // an area without a waypoint has nothing to lack
		}

		if (!name || name === me.name) {
			// The game only tells the client its waypoints once the waypoint menu has been opened, so before that getWaypoint is false for ALL of them.
			// Then trust the list I saved last time (2026-11-13 19:10: the menu did not open at the start, the leader looked like it lacked 23 waypoints it
			// has, and the team walked to every one of them for nothing).
			if (!getWaypoint(index) && !this.loaded) {
				list = this.read(me.name);

				return !!list && list.indexOf(area) > -1;
			}

			return !!getWaypoint(index);
		}

		list = this.read(name);

		return !!list && list.indexOf(area) > -1;
	},

	read: function (name) {
		try {
			if (FileTools.exists(this.path(name))) {
				return JSON.parse(FileTools.readText(this.path(name)));
			}
		} catch (readError) {
			print("Waypoints: cannot read the list of " + name + ": " + readError);
		}

		return null;
	},

	// getWaypoint is only true for what the server has told the client, and the server tells it when the waypoint menu is opened (not when the game
	// starts: before that only the first town's waypoint shows). So a list written at the start of a game would wipe the real one. load() opens the
	// menu of the town waypoint once per game and closes it again; save() waits for it.
	loaded: false,

	// Open and close the waypoint menu of the town I stand in: the game tells me my waypoints, and the town's own waypoint is taken (a new act's town
	// waypoint is not taken until somebody clicks it).
	touchTown: function () {
		var wp, i, opened = false;

		if (!me.inTown) {
			return false;
		}

		try {
			Town.move("waypoint");
			wp = getUnit(2, "waypoint");

			for (i = 0; wp && i < 6 && !opened; i += 1) {
				Misc.click(0, 0, wp);
				delay(600);

				if (getUIFlag(0x14)) {
					delay(500); // the list arrives with the menu
					me.cancel();
					opened = true;
				}
			}
		} catch (loadError) {
			print("Waypoints: cannot open the waypoint menu: " + loadError);
		}

		if (!opened) {
			print("Waypoints: the waypoint menu did not open: my waypoints are not known from the game this time (using my saved list)");
		}

		return opened;
	},

	load: function () {
		if (this.loaded) {
			return true;
		}

		this.loaded = this.touchTown();

		return this.loaded;
	},

	// write my waypoints (only when they changed, and only once the game has told me what they are)
	save: function () {
		var list = [], i, text, quests;

		if (!this.loaded && !this.load()) {
			return;
		}

		try {
			for (i = 0; i < Pather.wpAreas.length; i += 1) {
				if (getWaypoint(i)) {
					list.push(Pather.wpAreas[i]);
				}
			}

			text = JSON.stringify(list);

			if (text !== this.lastSaved) {
				FileTools.writeText(this.path(me.name), text);
				this.lastSaved = text;
			}

			// the quests I have done (for the gates): at most once a minute, it asks the game
			if (Date.now() - this.questsAt > 60000) {
				this.questsAt = Date.now();
				quests = this.doneIds();
				text = quests ? JSON.stringify(quests) : "";

				if (text && text !== this.lastQuests) {
					FileTools.writeText(this.questsPath(me.name), text);
					this.lastQuests = text;
				}
			}
		} catch (saveError) {
			print("Waypoints: cannot save my waypoints: " + saveError);
		}
	},

	// the bots in the game (me and the team)
	members: function () {
		var areas = Team.areas();

		return [me.name].concat(Team.expected().filter(function (n) { return areas[n] !== undefined; }));
	},

	// Places the game is KNOWN to keep shut until a quest is done: area -> the quest (me.getQuest id) that must be complete. Empty: it was guessed that the
	// Palace Cellar needs Radament's Lair, and Darius still could not enter Palace Cellar Level 1, the Arcane Sanctuary or the Canyon of the Magi by portal
	// with it done (2026-11-12 17:13). What the game refuses is LEARNED instead: a portal that does not work costs at most 40 seconds (QuickTravel.portal),
	// is remembered (rememberBlocked) and is not tried again until the leader has done another quest.
	// Seen in the 2026-11-12 tests: portals to the Palace Cellar (52) and the Arcane Sanctuary (74) were refused until Tainted Sun was done (11), the Canyon
	// of the Magi (46) until the Arcane Sanctuary quest was done (12); Durance of Hate (101) opens with Khalim's Will (18, from the game's rules).
	// Each bot writes the quests it has done (wpquests-<name>.json) beside its waypoints, so the sync knows WHO can be let in: the leader has to meet the
	// gate to go there, and a bot that does not is not a receiver (it would only stand in town). Places not listed are learned (rememberBlocked).
	// From the user's memory of the game: act 2 from the Harem on is all behind quests (the Palace Cellar levels 52-54 with the Arcane Sanctuary, and the Canyon),
	// in act 3 Durance of Hate and with it Mephisto's lair (100-102), in act 4 nothing, in act 5 the Worldstone Keep (128-132, after the Ancients: Rite of Passage,
	// 39) and Nihlathak's temple (121-124, after Anya's rescue: Prison of Ice, 37). Those last two are guesses at WHICH quest.
	gates: {52: 11, 53: 11, 54: 11, 74: 11, 46: 12, 100: 18, 101: 18, 102: 18, 121: 37, 122: 37, 123: 37, 124: 37, 128: 39, 129: 39, 130: 39, 131: 39, 132: 39},

	// the ids of the quests this character has done
	doneIds: function () {
		var rows = typeof QuestTable === "object" ? QuestTable.playable() : [], i, out = [];

		try {
			sendPacket(1, 0x40);
			delay(300);

			for (i = 0; i < rows.length; i += 1) {
				if (me.getQuest(rows[i][3], 0)) {
					out.push(rows[i][3]);
				}
			}
		} catch (e) {
			return null;
		}

		return out;
	},

	questsPath: function (name) {
		return "data/wpquests-" + name + ".json";
	},

	// may this bot be let into the area (the gate's quest is done)? Unknown for a bot that has not written its list: it is taken to meet the gate.
	canEnter: function (name, area) {
		var quest = this.gates[area], list;

		if (quest === undefined) {
			return true;
		}

		if (name === me.name) {
			try {
				return !!me.getQuest(quest, 0);
			} catch (e) {
				return true;
			}
		}

		try {
			if (FileTools.exists(this.questsPath(name))) {
				list = JSON.parse(FileTools.readText(this.questsPath(name)));

				return list.indexOf(quest) > -1;
			}
		} catch (e) {
			return true;
		}

		return true;
	},

	// How many quests this character has done (what the game lets it into changes only when this does)
	doneCount: function () {
		var rows = typeof QuestTable === "object" ? QuestTable.playable() : [], i, n = 0;

		try {
			sendPacket(1, 0x40);
			delay(300);

			for (i = 0; i < rows.length; i += 1) {
				if (me.getQuest(rows[i][3], 0)) {
					n += 1;
				}
			}
		} catch (e) {
			return -1;
		}

		return n;
	},

	blockedPath: function () {
		return "data/wpblocked-" + me.name + ".json";
	},

	// A portal to this area did not work for me (the game keeps the place shut): remember it until I have done another quest, so the next games
	// (the lead is handed over often) do not spend half a minute on it again.
	rememberBlocked: function (area) {
		var map = {}, count = this.doneCount();

		try {
			if (FileTools.exists(this.blockedPath())) {
				map = JSON.parse(FileTools.readText(this.blockedPath()));
			}

			map[area] = count;
			FileTools.writeText(this.blockedPath(), JSON.stringify(map));
		} catch (e) {
			print("Waypoints: cannot remember the closed place: " + e);
		}
	},

	blockedNow: function (area) {
		try {
			if (FileTools.exists(this.blockedPath())) {
				var map = JSON.parse(FileTools.readText(this.blockedPath()));

				return map[area] !== undefined && map[area] === this.doneCount();
			}
		} catch (e) {
			return false;
		}

		return false;
	},

	gated: function (area) {
		if (this.blockedNow(area)) {
			return true; // it did not work last time and nothing has changed since
		}

		sendPacket(1, 0x40); // the game's quest state, fresh
		delay(300);

		return !this.canEnter(me.name, area); // the leader itself has to meet the gate
	},

	// who in the game lacks the waypoint of this area (a bot without a list yet is taken to lack it)
	lacking: function (area) {
		return this.members().filter(function (n) { return !Waypoints.has(area, n); });
	},

	// Can this bot get to the act of the area at all? Act 1 always; another act when it has taken that act's town waypoint (it has been there).
	// For me the game says it (Pather.accessToAct).
	canReach: function (name, act) {
		if (act === 1) {
			return true;
		}

		if (name === me.name) {
			return !!Pather.accessToAct(act);
		}

		return this.has(this.towns[act - 1], name);
	},

	// Who can GET this waypoint now: the ones that lack it and have reached its act. The matrix of the whole team, every act: for each area who has it
	// (the givers), and who lacks it and could be brought (the receivers). A bot that lacks a waypoint of an act it has not opened is not a receiver yet.
	receivers: function (area) {
		var act = this.actOf(area);

		return this.lacking(area).filter(function (n) { return Waypoints.canReach(n, act) && Waypoints.canEnter(n, area); });
	},

	// who in the game has it
	having: function (area) {
		return this.members().filter(function (n) { return Waypoints.has(area, n); });
	},

	// Stay beside the waypoint until the WHOLE TEAM is here (the user, 2026-11-15: "even if it's a waypoint hunt and not everybody needs that waypoint
	// -- they all go to keep the party safe": the leader does not go back to town while a mate that already has the waypoint is still coming through
	// the portal, Team.gather, which ends in the regroup if they do not come), and then until the others who lack it have taken it (their lists say so),
	// at most ms. Tested in the simulation (scripts/jstest/team_test.js); UNTESTED in a game.
	waitForTeam: function (area, ms) {
		var start, late, areas, followed;

		if (typeof Team === "object" && Team.isLeader()) {
			Team.gather(Team.limits.gather);
		}

		start = Date.now();

		for (;;) {
			this.save();
			late = this.receivers(area);

			if (!late.length || me.dead || Date.now() - start > (ms || 45000)) {
				return !late.length;
			}

			// Some places are closed to a character that has not done what the game wants first (the Arcane Sanctuary, say): its portal brings nobody.
			// If after 25 seconds none of the ones who lack the waypoint is in this area, they are not coming: go on.
			if (Date.now() - start > 25000) {
				areas = Team.areas();
				followed = late.some(function (n) { return areas[n] === me.area; });

				if (!followed) {
					print("Waypoints: nobody who lacks the waypoint of " + Pather.getAreaName(area) + " has come (the game may not let them in yet): going on");

					return false;
				}
			}

			delay(1500);
		}
	},

	// THE WHOLE TEAM COMES THROUGH MY PORTAL (the user, 2026-11-15: "the entire team should always be together in the field. always. no exceptions ... if one
	// person is missing a waypoint in a waypoint hunt and wanders into the field by themselves ... we have failed"): the leader at the waypoint has
	// just opened its portal; "proceed" names it, and every follower in town takes it at once (Follower: Team.returnCall), the ones that have the
	// waypoint too. UNTESTED in a game.
	sendTeam: function () {
		if (typeof Team === "object" && Team.isLeader() && Team.say) {
			Team.say("proceed", {area: me.area, owner: me.name}, Team.limits.sync);
		}
	},

	// Share the waypoint of one area: from the leader's point of view, `kind` says how it gets there
	share: function (area) {
		var act = this.actOf(area), here = false;

		if (!Pather.accessToAct(act)) {
			return false;
		}

		Town.goToTown(act);

		if (this.has(area)) { // I have it: go there by waypoint, open a portal for the ones who lack it, wait until they have it
			Pather.useWaypoint(area); // it opens my portal and names it already when a mate lacks the waypoint (the wrapper at the end of Pather.js)

			if (!Pather.getPortal(null, me.name)) {
				Pather.makePortal(); // stays open: the ones who lack it cannot take the waypoint, they take this
			}

			this.sendTeam();
			here = true;
		} else if (QuickTravel.waypoint(area)) { // someone has it: its portal brought me; I take it too
			Pather.getWP(area);
			Pather.makePortal();
			this.sendTeam();
			here = true;
		}

		if (here) {
			this.waitForTeam(area);
			Pather.useWaypoint(this.towns[act - 1]); // back to town by waypoint: no scroll
		}

		return here;
	},

	// The act the whole team has reached: the lowest of each member's highest act (a member's act is open when it has that act's town waypoint;
	// for me the game says it). 1 when nothing is known.
	teamAct: function () {
		var names = this.members(), lowest = 5, i, act, best;

		for (i = 0; i < names.length; i += 1) {
			best = 1;

			for (act = 2; act <= 5; act += 1) {
				if (this.canReach(names[i], act)) {
					best = act;
				}
			}

			lowest = Math.min(lowest, best);
		}

		return lowest;
	},

	// FETCH (the user, 2026-11-15: the waypoint hunt should "go and fetch waypoints nobody on the team has? -- yes, but only for acts below their current
	// progress"): the waypoints of the acts BELOW the team's act (teamAct) that nobody in the team has, and that the game lets the leader into
	// (gated). Those acts are behind the team, so their monsters are easy for it.
	fetchList: function () {
		var i, area, out = [], below = this.teamAct();

		for (i = 0; i < Pather.wpAreas.length; i += 1) {
			area = Pather.wpAreas[i];

			if (this.towns.indexOf(area) < 0 && this.actOf(area) < below && !this.having(area).length && !this.gated(area)) {
				out.push(area);
			}
		}

		return out;
	},

	// Fetch one: the leader goes there with the team (from the act's town; journeyTo takes every waypoint on the way, and the team follows it close,
	// Team.keepClose), takes it, waits beside it until the mates have taken it too (Follower.gatherWaypoint), and goes back to town by it.
	fetch: function (area) {
		var act = this.actOf(area);

		if (!Pather.accessToAct(act)) {
			return false;
		}

		Town.goToTown(act);
		print("Waypoints: fetching " + Pather.getAreaName(area) + " (nobody in the team has it)");

		if (area === 101) {
			Pather.toDurance(); // no way from Travincal into the Durance in journeyTo: its stairs
		} else {
			Pather.journeyTo(area);
		}

		if (me.area !== area || !Pather.getWP(area)) {
			print("Waypoints: could not fetch " + Pather.getAreaName(area) + " (in " + Pather.getAreaName(me.area) + ")");
			Town.goToTown(act);

			return false;
		}

		this.waitForTeam(area);
		Pather.useWaypoint(this.towns[act - 1]); // back to town by waypoint: no scroll

		return true;
	},

	// At the start of a game, the leader (Behavior > Quests > Waypoint Collection): "we are going to sync up the waypoints before we begin".
	// Waypoints that somebody in the team has and somebody else lacks are shared; the ones nobody has are fetched in the acts below the team's act
	// (fetchList, the user 2026-11-15), and in the team's own act collected on the way (Quester). UNTESTED in a game (the fetch).
	sync: function () {
		var i, area, shared = 0, todo = [], fetch = [], fetched = 0, startAct;

		if (this.syncedActs[me.act] || Config.Leader || !Config.QuestWaypoints || !me.inTown) {
			print("Waypoints: no sync (done for this act already: " + !!this.syncedActs[me.act] + ", I have a leader: " + !!Config.Leader + ", option: " + !!Config.QuestWaypoints + ", in town: " + me.inTown + ")");

			return 0;
		}

		// Alone in the game (the user, 2026-11-16: "dont run waypoint sync if only one bot is in the game"): there is nobody to share with, so nothing is opened, saved or
		// waited for, and the act is not marked as done: the sync runs when a mate is in the game. UNTESTED in a game.
		if (this.members().length < 2) {
			if (!this.aloneSaid) {
				this.aloneSaid = true;
				print("Waypoints: no sync: I am the only bot in the game.");
			}

			return 0;
		}

		this.syncedActs[me.act] = true;
		startAct = me.act;

		this.save(); // opens the waypoint menu once, so that the game tells me my waypoints; then writes them

		// the others write their lists as they start: wait (at most 20 s) until every list is there
		for (i = 0; i < 20 && this.members().some(function (n) { return n !== me.name && !Waypoints.read(n); }); i += 1) {
			delay(1000);
		}

		for (i = 0; i < Pather.wpAreas.length; i += 1) {
			area = Pather.wpAreas[i];

			// only the acts the leader can get to: a team mate with waypoints of an act the leader has not opened has nothing to share yet
			if (this.towns.indexOf(area) < 0 && Pather.accessToAct(this.actOf(area)) && this.receivers(area).length && this.having(area).length) {
				print("Waypoints: " + Pather.getAreaName(area) + ": " + this.having(area).join("+") + " can give it to " + this.receivers(area).join("+"));

				if (this.gated(area)) {
					print("Waypoints: not sharing " + Pather.getAreaName(area) + " yet: the game keeps it shut until a quest is done");

					continue;
				}

				todo.push(area);
			}
		}

		try {
			fetch = this.fetchList();
		} catch (listError) {
			print("Waypoints: the list to fetch: " + listError);
		}

		if (fetch.length) {
			print("Waypoints: nobody in the team has " + fetch.map(function (a) { return Pather.getAreaName(a); }).join(", ") + " (acts below act " + this.teamAct() + "): fetching");
		}

		if (!todo.length && !fetch.length) {
			Report.note("Waypoints", "all in sync (" + this.members().join(", ") + ")");

			return 0;
		}

		Report.note("Waypoints", "Syncing the team's waypoints before we begin (" + todo.length + " to share, " + fetch.length + " to fetch).");

		// The leader goes from waypoint to waypoint with the team in tow: TownChicken's "the team is split up" regroup must not fight with it
		scriptBroadcast("wpsync1");

		try {
			for (i = 0; i < todo.length; i += 1) {
				try {
					if (this.share(todo[i])) {
						shared += 1;
					}
				} catch (shareError) {
					print("Waypoints: sharing " + Pather.getAreaName(todo[i]) + ": " + shareError);

					try {
						Town.goToTown();
					} catch (townError) {
						return shared;
					}
				}
			}

			for (i = 0; i < fetch.length; i += 1) {
				try {
					// taken on the way to an earlier one (journeyTo takes every waypoint it passes): shared now, if a mate still lacks it
					if (this.having(fetch[i]).length) {
						if (this.receivers(fetch[i]).length && this.share(fetch[i])) {
							fetched += 1;
						}
					} else if (this.fetch(fetch[i])) {
						fetched += 1;
					}
				} catch (fetchError) {
					print("Waypoints: fetching " + Pather.getAreaName(fetch[i]) + ": " + fetchError);

					try {
						Town.goToTown();
					} catch (townError) {
						return shared + fetched;
					}
				}
			}

			if (fetch.length && me.act !== startAct) {
				Town.goToTown(startAct); // the run begins where the game did
			}
		} finally {
			scriptBroadcast("wpsync0");
		}

		Report.note("Waypoints", "Waypoints synced (" + shared + " of " + todo.length + " shared, " + fetched + " of " + fetch.length + " fetched) with " + this.members().join(", "));

		return shared + fetched;
	}
};
