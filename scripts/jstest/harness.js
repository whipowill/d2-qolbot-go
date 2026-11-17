// A small simulated D2BS world for testing the team-sync code (d2bs/kolbot/libs/common/Team.js and friends) with gjs (SpiderMonkey), run by scripts/jstest.sh.
// It fakes the game's globals (me, getParty, delay, say, print, Date, FileTools ...) and a clock that only moves when the code under test calls delay(),
// so a 60 second wait takes no time. The files under test are Latin-1 with mixed line endings: they are decoded as such and evaluated at global scope.

imports.gi.versions.GLib = '2.0';
const GLib = imports.gi.GLib;

const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(GLib.path_get_dirname(imports.system.programInvocationName === 'gjs' ? GLib.get_current_dir() + '/scripts/jstest/x' : GLib.get_current_dir() + '/scripts/jstest/x')));

function World_scrolls() { return globalThis.me.scrolls; }

var World = {
	now: 1700000000000,
	towns: [1, 40, 75, 103, 109],
	files: {},
	log: [],
	said: [],
	timers: [],
	party: {},        // name -> {name, area, x, y}
	monsters: [],     // hostile monsters in sight: {attackable, x, y}
	exits: [],        // exits of the area: {x, y}
	moves: [],        // where Pather.moveTo was asked to go
	moveTimes: [],    // the clock at each of those moves
	hops: [],         // Town.goToTown(act) calls
	acts: null,       // acts unlocked (null: all)
	valid: null,      // function(x, y) -> bool, default: everywhere
	mover: null,      // optional function(dtMs) called as the clock moves: moves the mates

	reset: function () {
		this.now = 1700000000000;
		this.files = {};
		this.log = [];
		this.said = [];
		this.timers = [];
		this.party = {};
		this.monsters = [];
		this.exits = [];
		this.moves = [];
		this.moveTimes = [];
		this.hops = [];
		this.acts = null;
		this.valid = null;
		this.mover = null;
		globalThis.Config = {Leader: '', RegroupSeconds: 30};
		globalThis.__plan = {goal: 'Quest'};
		globalThis.me = {name: 'Xena', profile: 'Xena', gamename: 'qb-1', gamestarttime: 4242, area: 75, x: 5000, y: 5000, gameReady: true, dead: false, scrolls: 5, findItem: function (code) { return (code === 'tbk' && this.scrolls > 0) ? {getStat: function () { return World_scrolls(); }} : null; }, get act() { const a = this.area; return a <= 39 ? 1 : (a <= 74 ? 2 : (a <= 102 ? 3 : (a <= 108 ? 4 : 5))); }, get inTown() { return World.towns.indexOf(this.area) > -1; }};
		this.setBots(['Xena']);
	},

	setBots: function (names) { // data/bots.json: who Qolbot started
		this.files['data/bots.json'] = JSON.stringify({team: names, bots: names});
	},

	addMate: function (name, area, x, y) {
		this.party[name] = {name: name, area: area, x: x, y: y};
		const all = Object.keys(this.party).concat([me.name]);
		const cur = JSON.parse(this.files['data/bots.json'] || '{"team":[],"bots":[]}');
		this.files['data/bots.json'] = JSON.stringify({team: all, bots: all});
	},

	at: function (ms, fn) { this.timers.push({at: this.now + ms, fn: fn}); },

	advance: function (ms) {
		const end = this.now + ms;
		while (this.now < end) {
			const step = Math.min(100, end - this.now);
			this.now += step;
			if (this.mover) this.mover(step);
			for (let i = 0; i < this.timers.length; i++) {
				if (this.timers[i].at <= this.now) {
					const t = this.timers.splice(i, 1)[0];
					i--;
					t.fn();
				}
			}
		}
	},

	load: function (relPath) { // evaluate a file of d2bs/kolbot/libs at global scope
		const path = GLib.get_current_dir() + '/d2bs/kolbot/libs/' + relPath;
		const [ok, bytes] = GLib.file_get_contents(path);
		if (!ok) throw new Error('cannot read ' + path);
		const text = new TextDecoder('iso-8859-1').decode(bytes);
		(0, eval)(text);
	}
};

class FakeDate extends Date {
	constructor(...a) { if (a.length) super(...a); else super(World.now); }
	static now() { return World.now; }
}
globalThis.Date = FakeDate;
globalThis.World = World;

globalThis.include = function () { return true; };
globalThis.print = function (m) { World.log.push(String(m)); };
globalThis.say = function (m) { World.said.push(String(m)); };
globalThis.delay = function (ms) { World.advance(ms); };
globalThis.getTickCount = function () { return World.now; };
globalThis.getDistance = function (a, b, c, d) {
	let x1, y1, x2, y2;
	if (typeof a === 'object') { x1 = a.x; y1 = a.y; if (typeof b === 'object') { x2 = b.x; y2 = b.y; } else { x2 = b; y2 = c; } }
	else { x1 = a; y1 = b; x2 = c; y2 = d; }
	return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
};
globalThis.getParty = function () {
	const names = Object.keys(World.party);
	const units = [{name: me.name, area: me.area, x: me.x, y: me.y}].concat(names.map(function (n) { return World.party[n]; }));
	let i = 0;
	const first = units[0];
	first.getNext = function () { i += 1; if (i >= units.length) return false; Object.assign(first, units[i]); return true; };
	return first;
};
globalThis.getArea = function () { return {exits: World.exits}; };
globalThis.Attack = { validSpot: function (x, y) { return World.valid ? World.valid(x, y) : true; } };
globalThis.Pather = { getAreaName: function (a) { return 'area ' + a; }, moveTo: function (x, y) { if (typeof Team === 'object' && Team.keepClose) Team.keepClose(); World.moves.push([x, y]); World.moveTimes.push(World.now); me.x = x; me.y = y; return true; }, accessToAct: function (a) { return World.acts ? World.acts.indexOf(a) > -1 : true; } };
globalThis.Town = { goToTown: function (act) { World.hops.push(act); me.area = World.towns[act - 1]; } };
globalThis.getUnit = function (type) {
	if (type !== 1 || !World.monsters.length) return null;
	let i = 0;
	const list = World.monsters;
	const first = Object.assign({}, list[0]);
	first.getNext = function () { i += 1; if (i >= list.length) return false; Object.assign(first, list[i]); return true; };
	return first;
};
globalThis.FileTools = {
	exists: function (p) { return Object.prototype.hasOwnProperty.call(World.files, p); },
	readText: function (p) { return World.files[p]; },
	writeText: function (p, t) { World.files[p] = t; },
	appendText: function (p, t) { World.files[p] = (World.files[p] || '') + t; }
};
globalThis.Plan = { get: function () { return globalThis.__plan; } };
globalThis.Gold = { tick: function () {} };
globalThis.Report = { note: function () {}, problem: function (w, m) { World.log.push(w + ': ' + m); } };
globalThis.Misc = { inMyParty: function () { return true; }, errorReport: function () {} };
globalThis.JSON2 = JSON;

// tiny test runner
var Tests = {
	passed: 0, failed: 0, list: [],
	test: function (name, fn) { this.list.push({name: name, fn: fn}); },
	eq: function (got, want, what) {
		if (got !== want) throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
	},
	ok: function (cond, what) { if (!cond) throw new Error(what || 'not true'); },
	has: function (arr, text, what) {
		if (!arr.some(function (l) { return l.indexOf(text) > -1; })) throw new Error((what || 'log') + ': no line with "' + text + '" in ' + JSON.stringify(arr.slice(-6)));
	},
	run: function () {
		for (const t of this.list) {
			World.reset();
			if (this.setup) this.setup();
			try { t.fn(); this.passed++; print_('PASS ' + t.name); }
			catch (e) { this.failed++; print_('FAIL ' + t.name + ': ' + e.message); }
		}
		print_('\n' + this.passed + ' passed, ' + this.failed + ' failed');
		imports.system.exit(this.failed ? 1 : 0);
	}
};
function print_(s) { imports.system.programArgs; log_(s); }
function log_(s) { print_out(s); }
function print_out(s) { const w = new Gio.UnixOutputStream({fd: 1}); w.write_all(s + '\n', null); }
imports.gi.versions.Gio = '2.0';
const Gio = imports.gi.Gio;
globalThis.Tests = Tests;
