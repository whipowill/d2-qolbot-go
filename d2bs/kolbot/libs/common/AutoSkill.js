/**
*  @filename    AutoSkill.js
*  @author      Original work by Nad42, edited by IMBA
*  @desc        Automatically allocate skill points and its pre-requisites if necessary
*
*/

const AutoSkill = new function () {
	this.skillBuildOrder = [];
	this.save = 0;

	/*	skillBuildOrder - array of skill points to spend in order
		save - number of skill points that will not be spent and saved

		skillBuildOrder Settings
		Set skillBuildOrder in the array form: [[skill, count, satisfy], [skill, count, satisfy], ... [skill, count, satisfy]]
		 skill - skill id number (see /sdk/skills.txt)
		 count - maximum number of skill points to allocate for that skill
		 satisfy - boolean value to stop(true) or continue(false) further allocation until count is met. Defaults to true if not specified.

		skillBuildOrder = [
			[37, 1, true], [42, 1, true], [54, 1, true], //warmth, static, teleport
			[59, 1, false], [55, 7, true], [45, 13, true], //blizzard, glacial spike, ice blast
			[59, 7, false], [65, 1, true], //blizzard, cold mastery
			[59, 20, false], [65, 20, true], //max blizzard, max cold mastery
			[55, 20, true], [45, 20, true], //max glacial spike, max ice blast
		];
	*/

	// Skill prerequisites and required levels, read from the game's Skills.txt (skill id: [required level, [prerequisite ids]]).
	// after a PlugY reset, AutoSkill kept trying to put a point in Teleport (which needs Telekinesis) and gave up, so the prerequisites are looked up here first.
	this.reqTable = {
		6: [1, []], 7: [1, []], 8: [1, []], 9: [1, []], 10: [1, []], 11: [6, []],
		12: [6, [6]], 13: [6, []], 14: [6, [10]], 15: [6, []], 16: [12, [7, 12]], 17: [12, [8]],
		18: [12, [13]], 19: [12, [10]], 20: [12, [15]], 21: [18, [11]], 22: [18, [11, 12]], 23: [18, [9]],
		24: [18, [14, 20]], 25: [18, [20]], 26: [24, [22]], 27: [24, [16]], 28: [24, [17]], 29: [24, [18]],
		30: [24, [19]], 31: [30, [21]], 32: [30, [28, 29]], 33: [30, [23]], 34: [30, [24]], 35: [30, [25]],
		36: [1, []], 37: [1, []], 38: [1, []], 39: [1, []], 40: [1, []], 41: [6, []],
		42: [6, []], 43: [6, []], 44: [6, []], 45: [6, [39]], 46: [12, [41]], 47: [12, [36]],
		48: [12, [42]], 49: [12, [38]], 50: [12, [45, 40]], 51: [18, [46]], 52: [18, [37, 47]], 53: [18, [49]],
		54: [18, [43]], 55: [18, [45]], 56: [24, [47, 51]], 57: [24, [48, 53]], 58: [24, [54, 53]], 59: [24, [44, 55]],
		60: [24, [50]], 61: [30, []], 62: [30, [52]], 63: [30, []], 64: [30, [59]], 65: [30, []],
		66: [1, []], 67: [1, []], 68: [1, []], 69: [1, [70]], 70: [1, []], 71: [6, []],
		72: [6, [66]], 73: [6, []], 74: [6, [67]], 75: [6, []], 76: [12, [66]], 77: [12, [72]],
		78: [12, [68]], 79: [12, [75]], 80: [12, [70]], 81: [18, [71]], 82: [18, [76]], 83: [18, [73, 74]],
		84: [18, [74]], 85: [18, [75]], 86: [24, [81]], 87: [24, [77]], 88: [24, [78, 84]], 89: [24, [79]],
		90: [24, [85]], 91: [30, [82, 87]], 92: [30, [83]], 93: [30, [84]], 94: [30, [90]], 95: [30, [80, 90]],
		96: [1, []], 97: [1, []], 98: [1, []], 99: [1, []], 100: [1, []], 101: [6, []],
		102: [6, [98]], 103: [6, []], 104: [6, []], 105: [6, []], 106: [12, [96]], 107: [12, [97]],
		108: [12, [98]], 109: [12, [99]], 110: [12, []], 111: [18, [106]], 112: [18, [101]], 113: [18, [108]],
		114: [18, [102]], 115: [18, [109, 104]], 116: [24, [111]], 117: [24, [107, 112]], 118: [24, [114]], 119: [24, [103, 114]],
		120: [24, [109]], 121: [30, [112, 116]], 122: [30, [113]], 123: [30, [119]], 124: [30, [115]], 125: [30, []],
		126: [1, []], 127: [1, []], 128: [1, []], 129: [1, []], 130: [1, []], 131: [1, []],
		132: [6, []], 133: [6, [126]], 134: [6, []], 135: [6, []], 136: [6, []], 137: [6, [130]],
		138: [6, [130]], 139: [12, [126]], 140: [12, [133]], 141: [12, []], 142: [12, [131]], 143: [18, [132]],
		144: [18, [139]], 145: [18, []], 146: [18, [137]], 147: [24, [140]], 148: [24, [141]], 149: [24, [138]],
		150: [24, [142]], 151: [30, [143, 144]], 152: [30, [144]], 153: [30, [145]], 154: [30, [146, 149]], 155: [30, [149]],
		221: [1, []], 222: [1, []], 223: [1, []], 224: [1, [223]], 225: [1, []], 226: [6, []],
		227: [6, [221]], 228: [6, []], 229: [6, [225]], 230: [6, []], 231: [12, [222]], 232: [12, [223]],
		233: [12, [228]], 234: [12, [229]], 235: [12, [230]], 236: [18, [226]], 237: [18, [226, 227]], 238: [18, [232]],
		239: [18, [232, 233]], 240: [18, [235]], 241: [24, [231]], 242: [24, [239]], 243: [24, [233]], 244: [24, [234]],
		245: [24, [240]], 246: [30, [236]], 247: [30, [237]], 248: [30, [238]], 249: [30, [244, 250]], 250: [30, [245]],
		251: [1, []], 252: [1, []], 253: [1, []], 254: [1, []], 255: [1, []], 256: [6, [251]],
		257: [6, []], 258: [6, [252]], 259: [6, []], 260: [6, [255]], 261: [12, [256]], 262: [12, [251]],
		263: [12, [252]], 264: [12, [253]], 265: [12, [254]], 266: [18, [257, 262]], 267: [18, [258]], 268: [18, [264, 263]],
		269: [18, [259]], 270: [18, [260]], 271: [24, [261]], 272: [24, [262]], 273: [24, [264]], 274: [24, [269]],
		275: [24, [270]], 276: [30, [271]], 277: [30, [266]], 278: [30, [267]], 279: [30, [268]], 280: [30, [265, 274]]
	};

	// Hard points per skill. The game's me.getSkill() adds bonuses from gear (a Sorceress wearing +3 Telekinesis "has" Telekinesis
	// before she has spent a point in it, so Teleport's prerequisite looked met and the game refused the point). Qolbot writes the
	// points the save holds into the plan (hardPoints, set by AutoSpec); points spent since are counted here.
	this.hardPoints = null;
	this.added = {};

	this.points = function (id) {
		if (this.hardPoints === null) { // not handed over by AutoSpec.apply: read the plan file ourselves, once
			try {
				let plan = typeof AutoSpec === "object" ? (AutoSpec.plan || AutoSpec.read()) : null;

				this.hardPoints = plan && plan.skillPoints ? plan.skillPoints : false;
				print("AutoSkill: skill points come from " + (this.hardPoints ? "the save (" + JSON.stringify(this.hardPoints) + ")" : "the game (the plan has none)"));
			} catch (planError) {
				this.hardPoints = false;
				print("AutoSkill: cannot read the plan (" + planError + "), using the game's skill points");
			}
		}

		if (!this.hardPoints) {
			return me.getSkill(id, sdk.skills.subindex.HardPoints);
		}

		return (this.hardPoints[id] || 0) + (this.added[id] || 0);
	};

	//a function to return false if have all prereqs or a skill if not
	this.needPreReq = function (skillid) {
		let entry = this.reqTable[skillid];

		if (entry) {
			for (let q = 0; q < entry[1].length; q += 1) {
				if (!this.points(entry[1][q])) {
					return entry[1][q];
				}
			}

			return false;
		}

		//a loop to go through each reqskill
		for (let t = sdk.stats.PreviousSkillLeft; t >= sdk.stats.PreviousSkillRight; t--) {
			// Check ReqSkills
			let preReq = (getBaseStat("skills", skillid, t));

			if (preReq > sdk.skills.Attack && preReq < 356 && !this.points(preReq)) {
				return preReq;
			}
		}

		return false;
	};

	this.skillCheck = function (skillid, count) {
		let minLevel = this.reqTable[skillid] ? this.reqTable[skillid][0] : getBaseStat("skills", skillid, sdk.stats.MinimumRequiredLevel);

		if (this.points(skillid) <= me.charlvl - minLevel && this.points(skillid) < count) {
			return true;
		}

		return false;
	};

	this.skillToAdd = function (inputArray) {
		for (let i = 0; i < inputArray.length; i += 1) {
			// limit maximum allocation count to 20
			if (inputArray[i][1] > 20) {
				print("AutoSkill: Skill build index " + i + " has allocation count of " + inputArray[i][1] + " and it will be limited to 20");
				inputArray[i][1] = 20;
			}

			// set satify condition as default if not specified
			if (inputArray[i][2] === undefined) {
				inputArray[i][2] = true;
			}

			// check to see if skill count in previous array is satisfied
			if (i > 0 && inputArray[i - 1][2] && (!this.points(inputArray[i - 1][0]) ? 0 : this.points(inputArray[i - 1][0])) < inputArray[i - 1][1]) {
				return false;
			}

			if (this.points(inputArray[i][0]) && this.skillCheck(inputArray[i][0], inputArray[i][1])) {
				return inputArray[i][0];
			}

			let reqIn;
			let reqOut = this.needPreReq(inputArray[i][0]);

			if (!reqOut && this.skillCheck(inputArray[i][0], inputArray[i][1])) {
				return inputArray[i][0];
			}

			while (reqOut) {
				reqIn = reqOut;
				reqOut = this.needPreReq(reqIn);
			}

			if (reqIn && this.skillCheck(reqIn, 1)) { // reqIn is unset when the skill has all its prerequisites: go on to the next entry
				return reqIn;
			}
		}

		return false;
	};

	this.allocate = function () {
		let tick = getTickCount();

		let spentOn = 0;

		this.remaining = me.getStat(sdk.stats.NewSkills);

		if (!getUIFlag(sdk.uiflags.TradePrompt)) {
			let addTo = this.skillToAdd(this.skillBuildOrder);

			if (addTo) {
				print("AutoSkill: Using skill point in Skill: " + getSkillById(addTo) + " ID: " + addTo);
				delay(100);
				useSkillPoint(addTo, 1);
				spentOn = addTo;
			}
		}

		while (getTickCount() - tick < 1500 + 2 * me.ping) {
			if (this.remaining > me.getStat(sdk.stats.NewSkills)) {
				if (spentOn) {
					this.added[spentOn] = (this.added[spentOn] || 0) + 1;
				}

				return true;
			}

			delay(100);
		}

		return false;
	};

	this.remaining = 0;
	this.count = 0;

	this.init = function (skillBuildOrder, save = 0) {
		this.skillBuildOrder = skillBuildOrder;
		this.save = save;

		if (!this.skillBuildOrder || !this.skillBuildOrder.length) {
			print("AutoSkill: No build array specified");

			return false;
		}

		while (me.getStat(sdk.stats.NewSkills) > this.save) {
			this.allocate();
			delay(200 + me.ping); // may need longer delay under high ping

			// break out of loop if we have skill points available but cannot allocate further due to unsatisfied skill
			if (me.getStat(sdk.stats.NewSkills) === this.remaining) {
				this.count += 1;
			}

			if (this.count > 2) {
				break;
			}
		}

		print("AutoSkill: Finished allocating skill points");

		return true;
	};

	return true;
};
