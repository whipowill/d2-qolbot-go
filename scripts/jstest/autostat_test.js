// Tests of libs/common/AutoStat.js: the points are counted from the character's save and from what AutoStat itself spends, NOT estimated from the gear (the user,
// 2026-11-16: "fix the stat balance issue"). Live that day Barabas (Barbarian, 300 points to spend, +str/+dex/+energy gear) ended on 113/118/144 instead of 125/125/125
// because the estimate thought he already had 95/75 in strength and dexterity.
const T = Tests;

function readLib(rel) {
	return new TextDecoder('utf-8').decode(GLib.file_get_contents(GLib.get_current_dir() + '/d2bs/kolbot/libs/' + rel)[1]);
}

// a fresh AutoStat (a new game: new script instance), on the game's own constants
function freshAutoStat() {
	(0, eval)(readLib('modules/sdk.js') + '\nglobalThis.sdk = sdk;');
	(0, eval)(readLib('common/AutoStat.js') + '\nglobalThis.AutoStat = AutoStat;');
}

// the game: base: stat id -> points without gear (0 strength, 1 energy, 2 dexterity, 3 vitality), gear: stat id -> what the worn items add on top
function game(base, gear, unspent) {
	const st = {base: base, gear: gear, unspent: unspent};
	me.charlvl = 60;
	me.ping = 10;
	me.classid = 4;
	me.profile = 'Barabas';
	me.getStat = function (id) { return id === 4 ? st.unspent : (st.base[id] || 0) + (st.gear[id] || 0); };
	me.getItems = function () { return []; };
	globalThis.useStatPoint = function (type) { if (st.unspent > 0) { st.unspent -= 1; st.base[type] += 1; } };
	globalThis.getLocaleString = function (n) { return 'stat' + n; };
	return st;
}

// the melee order of the templates: strength, dexterity and vitality equal, one point at a time, to 180, then all vitality
function meleeOrder() {
	const b = [];
	for (let n = 21; n <= 180; n += 1) b.push(['s', n], ['d', n], ['v', n]);
	b.push(['v', 'all']);
	return b;
}

const BARB = {0: 30, 1: 10, 2: 20, 3: 25}; // a Barbarian's base: strength 30, energy 10, dexterity 20, vitality 25
const GEAR = {0: 12, 1: 8, 2: 6};          // what Barabas's gear added: the game shows 42 strength where the save has 30

T.setup = function () { freshAutoStat(); };

T.test('300 points on a Barbarian in gear come out equal: the gear does not fool the count', function () {
	const st = game(Object.assign({}, BARB), GEAR, 300);
	__plan = {hardStats: [30, 20, 25, 10], hardStatsAt: World.now}; // strength, dexterity, vitality, energy, from the save
	AutoStat.init(meleeOrder(), 0, 0, false);
	T.eq(st.unspent, 0, 'all points spent');
	T.eq(st.base[0], 125, 'strength');
	T.eq(st.base[2], 125, 'dexterity');
	T.eq(st.base[3], 125, 'vitality');
	T.eq(st.base[1], 10, 'energy untouched');
});

T.test('without the plan the old estimate is used (and is fooled by gear that is not in the item list)', function () {
	const st = game(Object.assign({}, BARB), GEAR, 300);
	__plan = {};
	AutoStat.init(meleeOrder(), 0, 0, false);
	T.ok(st.base[0] < 125, 'strength came out short: ' + st.base[0]); // the bug this replaces: the gear counted as spent points
	T.eq(st.unspent, 0, 'all points spent anyway');
});

T.test('the points spent are kept, and the next game of the same run starts from them', function () {
	const st = game(Object.assign({}, BARB), GEAR, 300);
	__plan = {hardStats: [30, 20, 25, 10], hardStatsAt: World.now};
	AutoStat.init(meleeOrder(), 0, 0, false);
	const rec = JSON.parse(World.files['data/Barabas.hard.json']);
	T.eq(JSON.stringify(rec.v), JSON.stringify([125, 125, 125, 10]), 'the record');
	// a later game: a new script, the old plan still in the file, five new points
	World.advance(60000);
	freshAutoStat();
	st.unspent = 5;
	AutoStat.init(meleeOrder(), 0, 0, false);
	T.eq(st.base[0], 127, 'strength');
	T.eq(st.base[2], 127, 'dexterity');
	T.eq(st.base[3], 126, 'vitality');
});

T.test('a plan newer than the record wins: Qolbot read the save again (the user changed stats by hand)', function () {
	const st = game({0: 140, 1: 10, 2: 100, 3: 100}, {}, 3);
	World.files['data/Barabas.hard.json'] = JSON.stringify({v: [125, 125, 125, 10], at: World.now - 5000});
	__plan = {hardStats: [140, 100, 100, 10], hardStatsAt: World.now}; // read after the record was written
	AutoStat.init(meleeOrder(), 0, 0, false);
	// strength 140, dexterity 100, vitality 100: the first target that is not met is dexterity 101, then vitality 101, then dexterity 102
	T.eq(st.base[2], 102, 'dexterity');
	T.eq(st.base[3], 101, 'vitality');
	T.eq(st.base[0], 140, 'strength not touched');
});

T.test('a respec puts the count back to the class base and keeps it', function () {
	game({0: 113, 1: 10, 2: 118, 3: 144}, GEAR, 0); // Barabas as he was after the first respend
	__plan = {hardStats: [113, 118, 144, 10], hardStatsAt: World.now};
	AutoStat.loadHard();
	T.eq(AutoStat.getHardStats(sdk.stats.Strength), 113, 'before');
	AutoStat.resetHard([30, 20, 25, 10]);
	T.eq(AutoStat.getHardStats(sdk.stats.Strength), 30, 'strength after the reset');
	T.eq(AutoStat.getHardStats(sdk.stats.Vitality), 25, 'vitality after the reset');
	T.eq(JSON.parse(World.files['data/Barabas.hard.json']).v[0], 30, 'kept');
});

T.test('a record that does not fit the character is not trusted', function () {
	game({0: 50, 1: 10, 2: 40, 3: 40}, {}, 10);
	World.files['data/Barabas.hard.json'] = JSON.stringify({v: [300, 300, 300, 10], at: World.now});
	__plan = {};
	AutoStat.loadHard();
	T.eq(AutoStat.hard, null, 'no count');
	T.has(World.log, 'do not fit the character', 'says so');
});

T.run();
