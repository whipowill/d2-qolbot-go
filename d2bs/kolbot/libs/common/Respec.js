/**
*	@filename	Respec.js
*	@desc		Auto Respec (Automation tab, needs PlugY or "Using QOL?", whose chat commands replace the PlugY click): a bot in town whose skill points are badly placed takes them all back, ONCE, and AutoSkill
*	            spends them again along the build. Qolbot clicks PlugY's X button on the skill page (RPC D2Bot.respec -> d2bridge); this file decides
*	            whether it is worth it and checks that it worked. Never loops: one try per character and build, remembered in data/<profile>.respec.json.
*
*	            THE JUDGEMENT: the bot asks "if I had all my points to spend again, right now, at my level, where would AutoSkill put them?" (the real
*	            allocator, run on paper: Respec.simulate). Points that sit somewhere else are MISPLACED. It respecs when
*	              - at least 6 points are misplaced AND they are a quarter or more of the points it has (a few strays are not worth it), and
*	              - the paper plan can place at least 60% of the points (a build whose main skills are all far from opening would mostly bank or
*	                skip them: a respec would change little), or
*	              - the build was chosen by hand on the Bots page (plan.respecForce) and at least 3 points are misplaced.
*	            A character in custom mode (no build matches) is left alone unless the build was chosen by hand.
*	            UNTESTED in a game (no JS engine here); the button position is set in cmd/qolbot/respec.go.
*/

include("json2.js");
include("common/Throttle.js");
include("common/Plan.js"); // the leader loads this file too (default.dbj)
include("common/Qol.js");

var Respec = {
	// AutoSkill's own decisions with no points spent, for `total` points at the current level: {got: {skill id: points}, spent: points placed}
	simulate: function (total) {
		var saved = {hard: AutoSkill.hardPoints, added: AutoSkill.added, banked: AutoSkill.banked}, got = {}, spent = 0, id;

		AutoSkill.hardPoints = {};
		AutoSkill.added = {};
		AutoSkill.banked = {};

		try {
			while (spent < total) {
				id = AutoSkill.skillToAdd(Config.AutoSkill.Build);

				if (!id) {
					break;
				}

				AutoSkill.added[id] = (AutoSkill.added[id] || 0) + 1;
				got[id] = AutoSkill.added[id];
				spent += 1;
			}
		} finally {
			AutoSkill.hardPoints = saved.hard;
			AutoSkill.added = saved.added;
			AutoSkill.banked = saved.banked;
		}

		return {got: got, spent: spent};
	},

	// {misplaced, invested, total, spent}: how many of the spent points the paper plan would not have put where they are
	judge: function (plan) {
		var id, invested = 0, kept = 0, paper, total;

		for (id in plan.skillPoints) {
			if (plan.skillPoints.hasOwnProperty(id)) {
				invested += plan.skillPoints[id];
			}
		}

		total = invested + me.getStat(5);
		paper = this.simulate(total);

		for (id in plan.skillPoints) {
			if (plan.skillPoints.hasOwnProperty(id)) {
				kept += Math.min(plan.skillPoints[id], paper.got[id] || 0);
			}
		}

		return {misplaced: invested - kept, invested: invested, total: total, spent: paper.spent};
	},

	// ---- STAT POINTS (the same AutoRespec setting governs them: the user, 2026-11-13) ----
	// Class base stats, indexed by classid (Amazon, Sorceress, Necromancer, Paladin, Barbarian, Druid, Assassin): strength, dexterity, vitality, energy.
	// (Checked against the saves of Sankt, Xena and Barabas: energy 25, 25 and 10 at the start.)
	baseStats: [[20, 25, 20, 15], [10, 25, 10, 35], [15, 25, 15, 25], [25, 20, 25, 15], [30, 20, 25, 10], [15, 20, 25, 20], [20, 20, 20, 25]],

	statKeys: ["str", "dex", "vit", "energy"],

	statKey: function (name) {
		switch (String(name).toLowerCase()) {
		case "s": case "str": case "strength": case "0":
			return 0;
		case "d": case "dex": case "dexterity": case "2":
			return 1;
		case "v": case "vit": case "vitality": case "3":
			return 2;
		case "e": case "enr": case "energy": case "1":
			return 3;
		}

		return -1;
	},

	// where AutoStat would put ALL the character's stat points if it started from the class base: {plan: [str, dex, vit, energy], actual: [...], misplaced, total}
	judgeStats: function () {
		var i, k, e, add, base = this.baseStats[me.classid], build = Config.AutoStat.Build || [],
			actual = [AutoStat.getHardStats(sdk.stats.Strength), AutoStat.getHardStats(sdk.stats.Dexterity), AutoStat.getHardStats(sdk.stats.Vitality), AutoStat.getHardStats(sdk.stats.Energy)],
			plan = base.slice(0), total = me.getStat(4), misplaced = 0;

		for (i = 0; i < 4; i += 1) {
			total += Math.max(0, actual[i] - base[i]);
		}

		for (i = 0; i < build.length && total > 0; i += 1) {
			k = this.statKey(build[i][0]);
			e = build[i][1];

			if (k < 0) {
				continue;
			}

			if (e === "all") {
				plan[k] += total;
				total = 0;

				break;
			}

			if (plan[k] < e) {
				add = Math.min(total, e - plan[k]);
				plan[k] += add;
				total -= add;
			}
		}

		for (i = 0; i < 4; i += 1) {
			misplaced += Math.max(0, actual[i] - plan[i]);
		}

		return {plan: plan, actual: actual, misplaced: misplaced, total: me.getStat(4) + actual[0] + actual[1] + actual[2] + actual[3] - base[0] - base[1] - base[2] - base[3]};
	},

	// Called in town before AutoStat.init. Takes back the stat points that sit above the paper plan (Alt click through Qolbot), once per character and build.
	maybeStats: function () {
		var plan, j, prior, i, before, after, taken = 0, record;

		plan = Plan.get();

		if (!plan || !plan.respecStat || !plan.autoStat || !me.inTown || typeof AutoStat !== "object" || (plan.mode === "custom" && !plan.respecForce)) {
			return false;
		}

		prior = this.tried();

		if (prior && prior.statsSpec === plan.spec) {
			return false;
		}

		j = this.judgeStats();

		// worth it: at least 10 points above the paper plan and a fifth of the points or more (a few strays are not worth ten Alt clicks)
		if (!(j.misplaced >= 10 && j.misplaced * 5 >= j.total)) {
			if (Throttle.due("respecstatjudge", 3600000)) {
				print("Respec: stat points are fine (" + j.misplaced + " of " + j.total + " above the plan; now " + j.actual.join("/") + ", plan " + j.plan.join("/") + ").");
			}

			return false;
		}

		if (!plan.statButtons) { // Qolbot has no position for the stat buttons yet: nothing can be clicked, and this attempt must not be used up
			if (Throttle.due("respecstatnobuttons", 3600000)) {
				print("Respec: " + j.misplaced + " of " + j.total + " stat points are above the plan (now " + j.actual.join("/") + ", plan " + j.plan.join("/") + " as str/dex/vit/energy), but the stat buttons have not been measured yet: nothing done.");
			}

			return false;
		}

		before = me.getStat(4);
		print("Respec: " + j.misplaced + " of " + j.total + " stat points are above the plan (now " + j.actual.join("/") + ", plan " + j.plan.join("/") + " as str/dex/vit/energy): taking them back through PlugY.");
		record = prior || {};
		record.statsSpec = plan.spec;
		record.statsAt = new Date().toString();
		record.statsMisplaced = j.misplaced;

		try {
			FileTools.writeText(this.path(), JSON.stringify(record));
		} catch (writeError) {
			print("Respec: cannot record the attempt (" + writeError + "), not trying");

			return false;
		}

		Town.move("portalspot");

		if (plan.qol) {
			// "Using QOL?": one chat command puts every stat point back to be spent again (the user's own mod; PlugY's Alt click could not be posted)
			var statSnap = function () { return [me.getStat(0), me.getStat(2), me.getStat(3), me.getStat(1)].join("/") + " unspent " + me.getStat(4); },
				statSum = function () { return me.getStat(0) + me.getStat(1) + me.getStat(2) + me.getStat(3); },
				sum0 = statSum();

			print("Respec: before .reset stats: " + statSnap() + " (str/dex/vit/energy)");
			Qol.resetStats();

			// up to 15 s: the unspent points rose, or a base stat went down (what the user's own mod does); a line every 3 s says what the bot sees
			for (i = 0; i < 30 && me.getStat(4) <= before && statSum() >= sum0; i += 1) {
				delay(500);

				if (i % 6 === 5) {
					print("Respec: " + (i + 1) / 2 + " s after .reset stats: " + statSnap());
				}
			}

			delay(500);
			print("Respec: after .reset stats: " + statSnap());
		} else {
			for (i = 0; i < 4; i += 1) {
				if (j.actual[i] > j.plan[i]) {
					D2Bot.respecstat(this.statKeys[i], j.actual[i] - j.plan[i]);
					delay(2000 + 600 * (j.actual[i] - j.plan[i]));
				}
			}
		}

		after = me.getStat(4);
		taken = after - before;

		if (taken <= 0 && plan.qol && typeof statSum === "function" && statSum() < sum0) {
			taken = sum0 - statSum(); // the base stats went down: the reset worked even if the unspent count has not caught up
		}

		if (taken <= 0) {
			print("Respec: failed: no stat point came back (still " + after + " unspent). Nothing is tried again for this build.");

			if (typeof Report === "object") {
				Report.problem("Respec", "I could not take my stat points back.");
			}

			return false;
		}

		// Qolbot: AutoStat counts the points spent in each stat (not an estimate from the gear): a full reset puts them back to the class's base, a partial take-back is not counted
		if (typeof AutoStat === "object" && AutoStat.resetHard) {
			if (plan.qol) {
				AutoStat.resetHard(this.baseStats[me.classid]);
			} else {
				AutoStat.forgetHard();
			}
		}

		print("Respec: done, " + taken + " stat points to spend again (were " + before + "). " + j.misplaced + " of " + j.total + " had been above the plan.");

		return true;
	},

	path: function () {
		return "data/" + me.profile + ".respec.json";
	},

	tried: function () {
		try {
			return FileTools.exists(this.path()) ? JSON.parse(FileTools.readText(this.path())) : null;
		} catch (e) {
			return null;
		}
	},

	// Called in town before AutoSkill.init. Returns true when a respec was done.
	maybe: function () {
		var plan, j, before, after, prior, tries, worth;

		plan = Plan.get();

		if (!plan || !plan.respec || !plan.autoSkill || !me.inTown || !plan.skillPoints || (plan.mode === "custom" && !plan.respecForce)) {
			return false;
		}

		prior = this.tried();

		if (prior && prior.spec === plan.spec) {
			return false; // once per character and build, whatever came of it
		}

		j = this.judge(plan);

		if (plan.respecForce) {
			worth = j.misplaced >= 3;
		} else {
			worth = j.misplaced >= 6 && j.misplaced * 4 >= j.invested && j.spent * 10 >= j.total * 6;
		}

		if (!worth) {
			if (Throttle.due("respecjudge", 3600000)) {
				print("Respec: not worth it (" + j.misplaced + " of " + j.invested + " points are misplaced for the " + plan.spec + " build; the paper plan places " + j.spent + " of " + j.total + ").");
			}

			return false;
		}

		before = me.getStat(5);
		print("Respec: " + j.misplaced + " of " + j.invested + " skill points are misplaced for the " + plan.spec + " build" + (plan.respecForce ? " (chosen by hand)" : "") + ": taking them back" + (plan.qol ? " (.reset skills)" : " through PlugY") + ".");

		try {
			FileTools.writeText(this.path(), JSON.stringify({spec: plan.spec, at: new Date().toString(), misplaced: j.misplaced, invested: j.invested, unspentBefore: before}));
		} catch (writeError) {
			print("Respec: cannot record the attempt (" + writeError + "), not trying");

			return false;
		}

		Town.move("portalspot");

		if (plan.qol) {
			Qol.resetSkills(); // "Using QOL?": the chat command of the user's own mod puts every skill point back
		} else {
			D2Bot.respec();
		}

		for (tries = 0; tries < 20; tries += 1) { // the click and the page closing take about 3 s
			delay(500);

			if (me.getStat(5) > before) {
				break;
			}
		}

		delay(500);
		after = me.getStat(5);

		if (after <= before) {
			print("Respec: failed: the unspent skill points are still " + after + ". Nothing is tried again for this build.");

			if (typeof Report === "object") {
				Report.problem("Respec", "I could not take my skill points back.");
			}

			return false;
		}

		print("Respec: done, " + after + " skill points to spend (were " + before + "). " + j.misplaced + " of " + j.invested + " points had been misplaced.");

		if (typeof AutoSkill === "object") {
			AutoSkill.hardPoints = {}; // nothing is invested now: AutoSkill counts from this, not from the old plan
			AutoSkill.added = {};
		}

		return true;
	}
};
