// Tests of the Quartermaster lock (libs/common/Quartermaster.js): no two bots send ".deposit" at the same moment (the user, 2026-11-16: "it's important that somehow the
// bots don't fire that command at the same time"). The rules are checked on their own, and then with five bots that arrive together and LOOK AT THE FILES AT THE SAME INSTANT
// (the worst case: every bot reads what the others had written before this instant, then writes its own).
const T = Tests;
T.setup = function () { World.load('common/Quartermaster.js'); };

const L = () => Quartermaster.lock;
const rec = (name, req, busy, done, at) => ({name: name, req: req || 0, busy: busy || 0, done: done || 0, at: at === undefined ? 100000 : at}); // alive at 100000 unless said otherwise

T.test('alone: go; and a bot that is sending stops everybody else', function () {
	const now = 100000, me_ = {name: 'Xena', req: now, busy: 0, done: 0, phase: 0};
	T.eq(L().decide(me_, [], now), 'go', 'alone');
	T.eq(L().decide(me_, [rec('Darius', now - 500, now - 300)], now), 'wait', 'Darius is sending');
});

T.test('a bot that crashed while holding the lock is forgotten, an old request too', function () {
	const now = 100000, mine = {name: 'Xena', req: now, busy: 0, done: 0};
	T.eq(L().decide(mine, [rec('Darius', now - 30000, now - 20000, 0, now - 20000)], now), 'go', 'busy, no heartbeat for 20 s: crashed');
	T.eq(L().decide(mine, [rec('Darius', now - 40000, 0, 0, now - 40000)], now), 'go', 'a request whose bot is gone');
	T.eq(L().decide(mine, [rec('Darius', now - 40000, 0, 0, now - 2000)], now), 'wait', 'a request that is old but alive (a slow queue) still holds its place');
	T.eq(L().decide(mine, [rec('Darius', now - 5000, now - 15000, 0, now - 1000)], now), 'wait', 'a lock held 15 s but alive: still waits for the request ahead');
});

T.test('the earlier request goes first, equal requests by name; a bot that has only just finished holds the next one back', function () {
	const now = 100000;
	T.eq(L().decide({name: 'Xena', req: now, busy: 0, done: 0}, [rec('Darius', now - 10)], now), 'wait', 'Darius asked first');
	T.eq(L().decide({name: 'Darius', req: now - 10, busy: 0, done: 0}, [rec('Xena', now)], now), 'go', 'Darius is first');
	T.eq(L().decide({name: 'Darius', req: now, busy: 0, done: 0}, [rec('Xena', now)], now), 'go', 'same moment: the name decides');
	T.eq(L().decide({name: 'Xena', req: now, busy: 0, done: 0}, [rec('Darius', now)], now), 'wait', 'same moment: Xena after Darius');
	T.eq(L().decide({name: 'Xena', req: now - 50, busy: 0, done: 0}, [rec('Darius', 0, 0, now - 400)], now), 'wait', 'Darius finished 0.4 s ago');
	T.eq(L().decide({name: 'Xena', req: now - 50, busy: 0, done: 0}, [rec('Darius', 0, 0, now - 5000)], now), 'go', 'Darius finished 5 s ago');
});

// five bots, all looking at the same instants, over many random starts
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function simulate(seed, names, spread, sendMs) {
	const rnd = mulberry32(seed), lock = Quartermaster.lock;
	const files = {};
	names.forEach(function (nm) { files[nm] = {name: nm, req: 0, busy: 0, done: 0}; });
	const bots = names.map(function (nm) {
		return {st: {name: nm, req: 0, busy: 0, done: 0, phase: 0, goAt: 0}, startAt: 100000 + Math.floor(rnd() * spread), jitter: Math.floor(rnd() * 90), nextLook: 0, state: 'idle', sendEnd: 0};
	});
	const sends = [];
	for (let now = 100000; now < 190000; now += 10) {
		const snap = JSON.parse(JSON.stringify(files)); // everybody reads what was written before this instant
		bots.forEach(function (b) {
			const st = b.st;
			if (b.state === 'idle' && now >= b.startAt) {
				st.req = now; st.at = now; files[st.name] = {name: st.name, req: st.req, busy: 0, done: st.done, at: now};
				b.state = 'wait'; b.nextLook = now + 150 + b.jitter;
			} else if (b.state === 'wait' && now >= b.nextLook) {
				const others = names.filter(function (n) { return n !== st.name; }).map(function (n) { return snap[n]; });
				const r = lock.step(st, others, now);
				if (r === 'wrote' || now - st.at >= lock.beat) { st.at = now; files[st.name] = {name: st.name, req: st.req, busy: st.busy, done: st.done, at: now}; }
				if (r === 'go') { sends.push({name: st.name, t: now}); b.state = 'sending'; b.sendEnd = now + sendMs; }
				b.nextLook = now + 150 + b.jitter;
			} else if (b.state === 'sending' && now >= b.sendEnd) {
				st.req = 0; st.busy = 0; st.done = now; st.at = now; files[st.name] = {name: st.name, req: 0, busy: 0, done: now, at: now};
				b.state = 'done';
			}
		});
	}
	return sends;
}

T.test('five bots that arrive together and read the files at the same instants: each sends once, never two at the same time (300 random starts)', function () {
	const names = ['Barabas', 'Darius', 'Meir', 'Sankt', 'Xena'];
	let worst = 1e9, slowest = 0;
	for (let seed = 1; seed <= 300; seed++) {
		const spread = [0, 50, 400, 1500][seed % 4];
		const sends = simulate(seed, names, spread, 2000).sort(function (a, b) { return a.t - b.t; });
		T.eq(sends.length, 5, 'seed ' + seed + ': every bot sent');
		T.eq(new Set(sends.map(function (s) { return s.name; })).size, 5, 'seed ' + seed + ': each once');
		for (let i = 1; i < sends.length; i++) {
			const gap = sends[i].t - sends[i - 1].t;
			worst = Math.min(worst, gap);
			T.ok(gap >= 2000, 'seed ' + seed + ': ' + sends[i - 1].name + ' and ' + sends[i].name + ' sent ' + gap + ' ms apart (a send takes 2000)');
		}
		slowest = Math.max(slowest, sends[4].t - 100000);
	}
	T.ok(worst >= 3000, 'sends are at least 3 s apart (closest: ' + worst + ' ms)');
	T.ok(slowest < 30000, 'the last of five is through in under 30 s (slowest: ' + slowest + ' ms)');
});

T.test('the earliest request is served first', function () {
	const sends = simulate(7, ['Barabas', 'Darius', 'Meir', 'Sankt', 'Xena'], 0, 2000).sort(function (a, b) { return a.t - b.t; });
	T.eq(sends.map(function (s) { return s.name; }).join(','), 'Barabas,Darius,Meir,Sankt,Xena', 'everybody asked in the same instant: by name');
});

T.test('deposit(): one bot alone waits for nothing; nothing is sent when "Using Quartermaster?" is off', function () {
	me.profile = 'Xena'; me.inTown = true; me.gameReady = true; me.itemcount = 20; me.ping = 10;
	me.getItems = function () { return []; };
	globalThis.Team = {expected: function () { return ['Barabas', 'Darius']; }};
	Config.UsesQuartermaster = false;
	T.eq(Quartermaster.deposit(true), false, 'off: nothing');
	T.eq(World.said.length, 0, 'nothing said');
	Config.UsesQuartermaster = true;
	T.eq(Quartermaster.deposit(true), true, 'on: sent');
	T.eq(World.said.join(), '.deposit', 'said once');
	T.has(World.log, '.deposit sent', 'logged');
	T.eq(JSON.parse(World.files['data/qm.Xena.json']).busy, 0, 'the lock is given back');
});

T.test('deposit(): another bot is sending: this one waits for it, then sends', function () {
	me.profile = 'Xena'; me.inTown = true; me.gameReady = true; me.itemcount = 20; me.ping = 10;
	me.getItems = function () { return []; };
	globalThis.Team = {expected: function () { return ['Darius']; }};
	Config.UsesQuartermaster = true;
	World.files['data/qm.Darius.json'] = JSON.stringify({req: World.now - 100, busy: World.now - 50, done: 0, at: World.now});
	World.at(3000, function () { World.files['data/qm.Darius.json'] = JSON.stringify({req: 0, busy: 0, done: World.now, at: World.now}); }); // Darius finishes after 3 s
	const t0 = World.now;
	T.eq(Quartermaster.deposit(true), true, 'sent');
	T.eq(World.said.length, 1, 'once');
	T.ok(World.now - t0 >= 3000 + 1200, 'it waited for Darius and the gap: ' + (World.now - t0) + ' ms');
});

T.test('deposit(): a bot that never finishes does not block for good: it is given up on after 45 s', function () {
	me.profile = 'Xena'; me.inTown = true; me.gameReady = true; me.itemcount = 20; me.ping = 10;
	me.getItems = function () { return []; };
	globalThis.Team = {expected: function () { return ['Darius']; }};
	Config.UsesQuartermaster = true;
	// Darius keeps re-asking and holding it (a bot looping): the busy stamp is renewed every 5 s
	for (let t = 0; t < 120000; t += 5000) World.at(t, function () { World.files['data/qm.Darius.json'] = JSON.stringify({req: World.now - 200, busy: World.now, done: 0, at: World.now}); });
	World.files['data/qm.Darius.json'] = JSON.stringify({req: World.now - 200, busy: World.now, done: 0, at: World.now});
	T.eq(Quartermaster.deposit(true), false, 'no turn');
	T.eq(World.said.length, 0, 'nothing sent');
	T.has(World.log, 'no turn for .deposit', 'says so');
});

T.run();
