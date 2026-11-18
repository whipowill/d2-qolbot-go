// Tests of libs/common/Team.js (the team sync) in the simulated world of harness.js.
const T = Tests;
T.setup = function () { World.load('common/Team.js'); }; // every test starts with a fresh Team

T.test('isLeader: objective and nobody to follow', function () {
	T.ok(Team.isLeader(), 'a bot with a goal and no Config.Leader leads');
	Config.Leader = 'Barabas';
	T.ok(!Team.isLeader(), 'a follower is not the leader');
	Config.Leader = '';
	__plan = {};
	T.ok(!Team.isLeader(), 'no goal: not the leader');
});

T.test('roster: expected bots with where they are', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.addMate('Sankt', 76, 5200, 5000);
	World.addMate('Darius', 0, 0, 0);
	const r = Team.roster();
	T.eq(r.length, 3, 'three mates (not me)');
	const by = {}; r.forEach(function (x) { by[x.name] = x; });
	T.ok(by.Barabas.here && by.Barabas.inGame, 'Barabas is here');
	T.ok(!by.Sankt.here && by.Sankt.inGame, 'Sankt is in the game, elsewhere');
	T.ok(by.Darius.loading && !by.Darius.inGame, 'Darius is loading');
});

T.test('gather: returns at once when everybody is here', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	const t0 = World.now;
	T.ok(Team.gather(), 'true');
	T.eq(World.now - t0, 0, 'no waiting');
});

T.test('gather: waits for a mate that arrives', function () {
	World.addMate('Barabas', 76, 0, 0);
	World.at(12000, function () { World.party.Barabas.area = 75; });
	const t0 = World.now;
	T.ok(Team.gather(), 'true');
	T.ok(World.now - t0 >= 12000 && World.now - t0 < 14000, 'waited about 12 s, took ' + (World.now - t0));
	T.has(World.log, 'waiting for Barabas (area');
});

T.test('gather: no give-up: with no scroll for a regroup it keeps waiting, and says so every 30 s', function () {
	me.scrolls = 0;
	World.addMate('Barabas', 76, 0, 0);
	World.at(100000, function () { World.party.Barabas.area = 75; });
	const t0 = World.now;
	T.ok(Team.gather(), 'true once it came');
	T.ok(World.now - t0 >= 100000 && World.now - t0 < 102000, 'took ' + (World.now - t0));
	T.has(World.log, 'still waiting for Barabas');
	T.ok(!World.log.some(function (l) { return /not waiting any longer/.test(l); }), 'never gives up');
});

T.test('gather: a mate not in the game is nobody to wait for', function () {
	World.addMate('Barabas', 0, 0, 0);
	delete World.party.Barabas; // left the game
	T.ok(Team.gather());
});

T.test('gather: a follower never waits', function () {
	World.addMate('Barabas', 76, 0, 0);
	Config.Leader = 'Barabas';
	const t0 = World.now;
	T.ok(Team.gather());
	T.eq(World.now - t0, 0, 'no waiting');
});

function cmds() { return JSON.parse(World.files['data/' + me.profile + '.tmsg.json'] || '{"msgs":[]}').msgs.filter(function (m) { return m.w === 'cmd'; }).map(function (m) { return m.a[0]; }).join(','); }

T.test('holdAndGather: commands hold, then go, around the wait (by the message log)', function () {
	World.addMate('Barabas', 76, 0, 0);
	World.at(5000, function () { World.party.Barabas.area = 75; });
	T.ok(Team.holdAndGather(30000));
	T.eq(cmds(), 'hold,go');
	T.eq(World.said.length, 0, 'nothing in the public chat');
});

T.test('holdAndGather: no give-up: waits past the timer for a mate that comes late, then commands go', function () {
	me.scrolls = 0;
	World.addMate('Barabas', 76, 0, 0);
	World.at(50000, function () { World.party.Barabas.area = 75; });
	T.ok(Team.holdAndGather(10000));
	T.eq(cmds(), 'hold,go');
});

T.test('holdAndGather: a follower says nothing', function () {
	World.addMate('Barabas', 75, 0, 0);
	Config.Leader = 'Barabas';
	Team.holdAndGather(1000);
	T.eq(World.said.length, 0);
	T.eq(cmds(), '', 'and commands nothing');
});

function say_ready(name, area) { World.files['data/' + name + '.tsay.json'] = JSON.stringify({word: 'ready', id: 1, area: area === undefined ? 75 : area, at: World.now, ttl: 20000}); }

T.test('waitToLeaveTown: leaves when every mate has said it is ready in my town', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.addMate('Sankt', 40, 0, 0);          // in another act's town: not here yet
	say_ready('Barabas');
	World.at(10000, function () { World.party.Sankt.area = 75; });
	World.at(14000, function () { say_ready('Sankt'); });
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown());
	const took = World.now - t0;
	T.ok(took >= 14000 && took < 16000, 'Sankt says ready at 14 s: took ' + took);
	T.has(World.log, 'we leave together');
});

T.test('waitToLeaveTown: a mate in town that has not said "ready" is waited for, and stops holding once it says so', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.at(30000, function () { say_ready('Barabas'); });
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown());
	T.ok(World.now - t0 >= 30000 && World.now - t0 < 32000, 'took ' + (World.now - t0));
});

T.test('waitToLeaveTown: a "ready" that is old (over 20 s), from another area, or "busy" is not ready', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.files['data/Barabas.tsay.json'] = JSON.stringify({word: 'ready', id: 1, area: 75, at: World.now - 25000, ttl: 20000});
	T.ok(!Team.isReady('Barabas'), 'old');
	say_ready('Barabas', 40);
	T.ok(!Team.isReady('Barabas'), 'ready in another area');
	World.files['data/Barabas.tsay.json'] = JSON.stringify({word: 'chores', id: 1, area: 75, at: World.now, ttl: 150000});
	T.ok(!Team.isReady('Barabas'), 'busy');
	T.ok(Team.isBusy('Barabas'), 'and it says busy');
	say_ready('Barabas');
	T.ok(Team.isReady('Barabas'), 'ready now');
});

T.test('waitToLeaveTown: NO time limit: a mate in the field is called to town every 30 s, and the gate waits until it is here and ready', function () {
	World.addMate('Barabas', 76, 0, 0); // in the field
	const calls = [];
	globalThis.PartySync = {enabled: function () { return true; }, call: function (a) { calls.push(a); return 1; }, currentId: 0};
	World.at(400000, function () { World.party.Barabas.area = 75; });
	World.at(405000, function () { say_ready('Barabas'); });
	const t0 = World.now;
	try {
		T.ok(Team.waitToLeaveTown(104));
	} finally {
		delete globalThis.PartySync;
	}
	T.ok(World.now - t0 >= 405000 && World.now - t0 < 407000, 'waited past every old limit, until ready: ' + (World.now - t0));
	T.ok(calls.length >= 12, 'called to town again and again: ' + calls.length);
	T.eq(calls[0], 75, 'the call is from my town');
	T.ok(!World.log.some(function (l) { return /not waiting any longer/.test(l); }), 'never gives up');
});

T.test('waitToLeaveTown: a mate that is not ready holds the gate for as long as it is in the game; once it leaves the game it holds nobody', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.at(600000, function () { delete World.party.Barabas; });
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown(104));
	T.ok(World.now - t0 >= 600000 && World.now - t0 < 602000, 'until it left the game: ' + (World.now - t0));
});

T.test('waitToLeaveTown: a mate already out where I am going (it left a moment ago in this departure) does not hold me', function () {
	World.addMate('Barabas', 104, 0, 0);
	World.addMate('Sankt', 75, 5010, 5000);
	say_ready('Sankt');
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown(104));
	T.eq(World.now - t0, 0);
});

// An act change (the user, 2026-11-16: "the leader shouldn't have left the town if the team wasn't ready"): gated like any departure: every mate here and ready, a mate in the
// field or in another town waited for until it is here ("see how simple the system is?"), a mate already in the town I am going to not.
T.test('waitToLeaveTown, an act change: a mate in this town that is not ready is waited for', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.at(20000, function () { say_ready('Barabas'); });
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown(103));
	T.ok(World.now - t0 >= 20000 && World.now - t0 < 22000, 'held until Barabas said ready: ' + (World.now - t0));
});

T.test('waitToLeaveTown, an act change: a mate still in the field (arriving) is called to town and waited for, as for a departure into the field', function () {
	World.addMate('Barabas', 76, 0, 0);
	const calls = [];
	globalThis.PartySync = {enabled: function () { return true; }, call: function (a) { calls.push(a); return 1; }, currentId: 0};
	World.at(70000, function () { World.party.Barabas.area = 75; });
	World.at(75000, function () { say_ready('Barabas'); });
	const t0 = World.now;
	try {
		T.ok(Team.waitToLeaveTown(103));
	} finally {
		delete globalThis.PartySync;
	}
	T.ok(World.now - t0 >= 75000 && World.now - t0 < 77000, 'waited for the mate in the field: ' + (World.now - t0));
	T.ok(calls.length >= 2, 'called to town: ' + calls.length);
});

T.test('waitToLeaveTown, an act change: a mate in ANOTHER town is not ready either: it is waited for until it is here and says ready (it follows its leader\'s town)', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.addMate('Sankt', 40, 0, 0); // in the Act 2 town, on its way
	say_ready('Barabas');
	World.at(9000, function () { World.party.Sankt.area = 75; });
	World.at(12000, function () { say_ready('Sankt'); });
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown(103));
	T.ok(World.now - t0 >= 12000 && World.now - t0 < 14000, 'the leader waited for Sankt: ' + (World.now - t0));
});

T.test('waitToLeaveTown, an act change: a mate already in the town I am going to does not hold me, and the same town is no hop at all', function () {
	World.addMate('Barabas', 103, 0, 0);
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown(103));
	T.ok(Team.waitToLeaveTown(75));
	T.ok(World.now - t0 < 2000, 'no wait: ' + (World.now - t0));
});

// Chore trips (the user, 2026-11-16: "if a party member needs to leave town during chores to a) buy maybe better potions somewhere or b) revive a dead merc or c) to hire a new
// merc then they can leave town without permission and come back to the original town, then report ready"): inside Team.chore() no hop to another town waits for anybody.
T.test('a chore trip to another town needs nobody\'s permission: the leader is not held by a mate that is not ready, and the marker resets afterwards', function () {
	World.addMate('Barabas', 75, 5010, 5000); // in my town, not ready
	const t0 = World.now;
	const r = Team.chore(function () { return Team.waitToLeaveTown(40); }); // a chore hop to the Act 2 town
	T.ok(r, 'left');
	T.eq(World.now - t0, 0, 'no wait');
	T.eq(Team.onChore, false, 'the marker is off again');
	World.at(8000, function () { say_ready('Barabas'); });
	const t1 = World.now;
	T.ok(Team.waitToLeaveTown(40)); // the same hop as an act change waits
	T.ok(World.now - t1 >= 8000, 'an act change outside a chore waits for the ready: ' + (World.now - t1));
});

T.test('a chore trip: the marker is reset even when the chores fail, and nests', function () {
	try { Team.chore(function () { throw new Error('boom'); }); } catch (e) { /* the chores failed */ }
	T.eq(Team.onChore, false, 'reset after an error');
	Team.chore(function () { Team.chore(function () { T.eq(Team.onChore, true, 'inside'); }); T.eq(Team.onChore, true, 'still inside the outer chore'); });
	T.eq(Team.onChore, false, 'off after both');
});

T.test('a chore trip does not hide a departure into the field: that is gated as before', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.at(6000, function () { say_ready('Barabas'); });
	const t0 = World.now;
	Team.chore(function () { return Team.waitToLeaveTown(104); }); // the field: still gated (only town targets are chore trips)
	T.ok(World.now - t0 >= 6000, 'waited: ' + (World.now - t0));
});

T.test('waitToLeaveTown: the leader\'s gate only: a follower carrying out the leader\'s order is never held, by a mate not ready, a mate in the field or the leader itself, and calls nobody (Meir and Sankt, live 17:01-17:06)', function () {
	__plan = {partySync: true}; // a follower of a bot-led run
	Config.Leader = 'Sankt';
	World.addMate('Sankt', 75, 5020, 5000);   // the leader, in town, not saying ready
	World.addMate('Barabas', 75, 5010, 5000); // not ready
	World.addMate('Darius', 76, 0, 0);        // in the field
	const calls = [];
	globalThis.PartySync = {enabled: function () { return true; }, call: function (a) { calls.push(a); return 1; }, currentId: 0};
	const t0 = World.now;
	try {
		T.ok(Team.waitToLeaveTown(85));
	} finally {
		delete globalThis.PartySync;
	}
	T.eq(World.now - t0, 0, 'no wait');
	T.eq(calls.length, 0, 'no call from a follower');
	T.ok(!World.log.some(function (l) { return /waiting in town until|calling them to town/.test(l); }), 'nothing about waiting or calling');
});

T.test('waitToLeaveTown: the answer is good for the 12 s grace, in the same town (retries do not wait again)', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	say_ready('Barabas');
	T.ok(Team.waitToLeaveTown());
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown());
	T.eq(World.now - t0, 0, 'the second call is free');
});

T.test('keyword chat: say / heard / heardLately, ready at most every 4 s, chores expire by themselves', function () {
	me.profile = 'Barabas';
	Team.markReady();
	T.eq(Team.heard('Barabas').word, 'ready');
	const id = Team.heard('Barabas').id;
	World.advance(2000);
	Team.markReady();
	T.eq(Team.heard('Barabas').id, id, 'not said again within 4 s');
	World.advance(3000);
	Team.markReady();
	T.ok(Team.heard('Barabas').id !== id, 'said again after 4 s');
	Team.markBusy(5000);
	T.eq(Team.heard('Barabas').word, 'chores');
	T.ok(Team.isBusy('Barabas'), 'busy');
	World.advance(6000);
	T.ok(!Team.isBusy('Barabas'), 'the chores word expires by itself');
	Team.markBusy(50000);
	Team.clearBusy();
	T.eq(Team.heard('Barabas').word, 'idle', 'cleared');
	T.eq(Team.heard('Nobody'), null, 'nobody said anything');
	Team.say('chickentown', {callId: 5, area: 76});
	T.eq(Team.heardLately('Barabas', 'chickentown').callId, 5, 'extra fields travel with the word');
	T.eq(Team.heardLately('Barabas', 'ready'), null, 'another word');
});

T.test('waitToLeaveTown: not in town, or a follower of a run without party sync: no wait', function () {
	World.addMate('Barabas', 76, 0, 0);
	me.area = 76; // in the field
	let t0 = World.now;
	T.ok(Team.waitToLeaveTown());
	T.eq(World.now - t0, 0, 'field');
	me.area = 75;
	Config.Leader = 'Barabas';
	t0 = World.now;
	T.ok(Team.waitToLeaveTown());
	T.eq(World.now - t0, 0, 'follower');
});

T.test('keepClose: the leader stops for a mate that fell behind, then walks back to it (2026-11-15)', function () {
	me.area = 76;
	World.addMate('Barabas', 76, 5100, 5000); // 100 units behind
	World.mover = function (ms) { const b = World.party.Barabas; if (b.x > me.x + 10) b.x -= ms * 0.02; }; // 20 units a second
	const t0 = World.now;
	Team.closeAt = 0;
	Team.keepClose();
	const took = World.now - t0;
	T.ok(took >= 2000 && took < 10000, 'waited 2 s, then went back: took ' + took);
	T.ok(Math.abs(World.party.Barabas.x - me.x) <= Team.limits.closeDist + 1, 'the mate is close now');
	T.ok(World.moves.length > 0, 'the leader walked');
	T.has(World.log, 'fell behind');
	T.has(World.log, 'going back to Barabas');
});

T.test('keepClose: a mate farther than 150 units (a stale party-list spot) is not walked to', function () {
	me.area = 76;
	World.addMate('Barabas', 76, 5300, 5000); // 300 units behind
	World.mover = function (ms) { const b = World.party.Barabas; if (b.x > me.x + 10) b.x -= ms * 0.02; };
	Team.closeAt = 0;
	Team.keepClose();
	T.ok(World.log.indexOf('going back') < 0 || World.party.Barabas.x - me.x < 150, 'no walk while it was 150+ away');
	T.ok(World.party.Barabas.x - me.x <= Team.limits.closeDist + 1, 'the mate came close');
});

T.test('keepClose: a stuck mate holds the leader at most 20 s, then not again for a minute', function () {
	me.area = 76;
	World.addMate('Barabas', 76, 5500, 5000); // stuck far away
	Team.closeAt = 0;
	let t0 = World.now;
	Team.keepClose();
	T.ok(World.now - t0 >= Team.limits.close && World.now - t0 < Team.limits.close + 1500, 'first call: ' + (World.now - t0));
	t0 = World.now;
	Team.keepClose();
	T.eq(World.now - t0, 0, 'the next call does not wait');
	World.advance(61000);
	t0 = World.now;
	Team.keepClose();
	T.ok(World.now - t0 >= Team.limits.close, 'after a minute it waits again');
});

T.test('keepClose: nothing in town, as a follower, for a mate in another area, or for a close mate', function () {
	World.addMate('Barabas', 76, 5500, 5000);
	me.area = 75; // town
	Team.closeAt = 0;
	let t0 = World.now;
	Team.keepClose();
	T.eq(World.now - t0, 0, 'town');
	me.area = 76; Config.Leader = 'Barabas'; Team.closeAt = 0;
	Team.keepClose();
	T.eq(World.now - t0, 0, 'follower');
	Config.Leader = ''; World.party.Barabas.area = 77; Team.closeAt = 0;
	Team.keepClose();
	T.eq(World.now - t0, 0, 'other area');
	World.party.Barabas.area = 76; World.party.Barabas.x = 5020; Team.closeAt = 0;
	Team.keepClose();
	T.eq(World.now - t0, 0, 'a close mate');
});

T.test('the other side of an exit: the leader waits there until every mate has come through', function () {
	me.area = 76;
	World.addMate('Barabas', 75, 0, 0);  // still in town, coming
	World.addMate('Sankt', 76, 5010, 5000);
	Team.lastArea = 75;                    // I just came from area 75
	World.at(8000, function () { World.party.Barabas.area = 76; World.party.Barabas.x = 5015; World.party.Barabas.y = 5000; });
	const t0 = World.now;
	Team.keepClose();
	T.ok(World.now - t0 >= 8000 && World.now - t0 < 10000, 'waited for Barabas: ' + (World.now - t0));
	T.has(World.log, 'waiting at the exit for Barabas to come through');
});

T.test('the other side of an exit: in combat the leader does not wait, and asks again when the fight is over', function () {
	me.area = 76;
	World.addMate('Barabas', 75, 0, 0);
	Team.lastArea = 75;
	World.monsters = [{attackable: true, x: 5005, y: 5000}]; // a fight right at the exit
	let t0 = World.now;
	Team.keepClose();
	T.eq(World.now - t0, 0, 'no waiting in a fight');
	T.ok(Team.arrivalPending, 'still owed');
	World.monsters = [];                                       // the fight is over, Barabas still not here
	World.at(5000, function () { World.party.Barabas.area = 76; World.party.Barabas.x = 5010; World.party.Barabas.y = 5000; });
	t0 = World.now;
	Team.keepClose();
	T.ok(World.now - t0 >= 5000 && World.now - t0 < 7000, 'now it waits: ' + (World.now - t0));
	T.ok(!Team.arrivalPending, 'paid');
});

T.test('the other side of an exit: a fight that starts while waiting stops the wait', function () {
	me.area = 76;
	World.addMate('Barabas', 75, 0, 0);
	Team.lastArea = 75;
	World.at(4000, function () { World.monsters = [{attackable: true, x: 5001, y: 5000}]; });
	const t0 = World.now;
	Team.keepClose();
	T.ok(World.now - t0 >= 4000 && World.now - t0 < 6000, 'left the wait when the fight began: ' + (World.now - t0));
	T.ok(Team.arrivalPending, 'still owed');
});

T.test('the other side of an exit: no give-up: with no scroll for a regroup it keeps waiting until the mate comes', function () {
	me.area = 76;
	me.scrolls = 0;
	World.addMate('Barabas', 75, 0, 0);
	Team.lastArea = 75;
	World.at(70000, function () { World.party.Barabas.area = 76; World.party.Barabas.x = me.x + 5; World.party.Barabas.y = me.y; }); // comes through, next to me
	const t0 = World.now;
	Team.keepClose();
	T.ok(World.now - t0 >= 70000 && World.now - t0 < 72000, 'took ' + (World.now - t0));
	T.ok(!Team.arrivalPending, 'not owed any more');
});

T.test('at the exit (before crossing): a mate of my area that is still far from me is waited for', function () {
	me.area = 76;
	World.addMate('Barabas', 76, 5400, 5000); // same area, 400 units away
	World.mover = function (ms) { const b = World.party.Barabas; if (b.x > me.x + 10) b.x -= ms * 0.05; }; // 50 units a second
	const t0 = World.now;
	T.ok(Team.gather(0, false, true));
	T.ok(World.now - t0 >= 6000 && World.now - t0 < 9000, 'waited until Barabas reached the exit: ' + (World.now - t0));
	T.has(World.log, 'waiting for Barabas (area');
});

T.test('arrival: no wait in town, as a follower, or with the whole team here', function () {
	World.addMate('Barabas', 75, 0, 0);
	Team.lastArea = 40;
	let t0 = World.now;
	Team.keepClose(); // in town (75)
	T.eq(World.now - t0, 0, 'town');
	me.area = 76; Config.Leader = 'Barabas'; Team.lastArea = 75;
	Team.keepClose();
	T.eq(World.now - t0, 0, 'follower');
	Config.Leader = ''; World.party.Barabas.area = 76; World.party.Barabas.x = 5010; World.party.Barabas.y = 5000; Team.lastArea = 75; Team.arrivalPending = false;
	Team.keepClose();
	T.eq(World.now - t0, 0, 'everybody is here');
});

T.test('separated: a mate across an exit during a fight is not "apart", and the clock restarts after the fight', function () {
	me.area = 76;
	World.addMate('Barabas', 77, 0, 0); // one step over the exit
	World.monsters = [{attackable: true, x: 5003, y: 5000}];
	World.advance(60000);
	T.eq(Team.separated(30000).length, 0, 'in a fight nobody is apart, however long');
	World.monsters = [];
	T.eq(Team.separated(30000).length, 0, 'the clock starts when the fight is over');
	// checked every few seconds, as the bots do: a gap of more than 10 s without a check resets the clocks (Team.separated, live 22:50:58)
	for (let i = 0; i < 6; i += 1) { World.advance(5200); Team.separated(30000); }
	T.eq(Team.separated(30000).join(','), 'Barabas', 'apart for 30 s after the fight');
});

T.test('sendOutFirst: the maker of the portal waits until the mates have gone out through it, then goes', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.addMate('Sankt', 75, 5020, 5000);
	World.at(4000, function () { World.party.Barabas.area = 76; });
	World.at(7000, function () { World.party.Sankt.area = 76; });
	const t0 = World.now;
	T.ok(Team.sendOutFirst(76, true));
	T.ok(World.now - t0 >= 7000 && World.now - t0 < 8500, 'left after the last mate: ' + (World.now - t0));
	T.eq(Team.heard('Xena').word, 'idle', 'the call is over: the leader says idle again');
	T.has(World.log, 'I made this portal, so I go last');
	T.has(World.log, 'the maker goes last');
});

T.test('sendOutFirst: a mate that cannot enter the portal says so and the maker does not wait for it', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.addMate('Sankt', 75, 5020, 5000);
	World.at(2000, function () { World.party.Barabas.area = 76; });
	World.at(3000, function () { const who = me.profile; me.profile = 'Sankt'; me.name = 'Sankt'; Team.post('cantreach'); me.profile = who; me.name = who; });
	const t0 = World.now;
	T.ok(Team.sendOutFirst(76, true));
	T.ok(World.now - t0 < 6000, 'the maker went out, Sankt still in town: ' + (World.now - t0));
	T.has(World.log, 'Sankt cannot get through my portal');
});

T.test('portalRefused: gated by the act quest it is a problem for the Activity list, not gated it asks for a new portal, said once per 20 s', function () {
	globalThis.getBaseStat = function () { return 4; }; // every area is in act 5
	World.acts = [1, 2, 3, 4];
	Team.refusedAt = 0;
	T.eq(Team.portalRefused(129, 'Barabas'), true, 'act 5 is not open for me');
	T.has(World.log, 'act 5 is not open for me');
	World.acts = [1, 2, 3, 4, 5];
	World.advance(21000);
	T.eq(Team.portalRefused(129, 'Barabas'), false, 'nothing gates it');
	T.has(World.log, 'asking the leader for a new portal');
	const n = World.log.length;
	Team.portalRefused(129, 'Barabas');
	T.eq(World.log.length, n, 'not said again within 20 s');
	World.acts = null;
});

T.test('sendOutFirst: a follower hears "proceed" from the leader while it waits, once', function () {
	// the leader's side
	World.addMate('Barabas', 75, 5010, 5000);
	let heard = null;
	World.at(1000, function () {
		// switch to the follower's point of view for a moment: Barabas reads the leader's file
		const lead = {profile: me.profile, name: me.name};
		me.profile = 'Barabas'; me.name = 'Barabas';
		World.addMate('Xena', 75, 5000, 5000);
		heard = Team.returnCall();
		const again = Team.returnCall();
		T.eq(again, null, 'not twice');
		me.profile = lead.profile; me.name = lead.name;
		delete World.party.Xena;
		World.party.Barabas.area = 76;
	});
	Team.sendOutFirst(76, true);
	T.ok(heard && heard.word === 'proceed' && heard.area === 76 && heard.from === 'Xena', 'the follower hears "proceed" from the leader');
});

T.test('sendOutFirst: nobody in town, a follower, or no portal area: no wait and no call', function () {
	World.addMate('Barabas', 76, 5010, 5000); // in the field
	let t0 = World.now;
	T.ok(Team.sendOutFirst(76));
	T.eq(World.now - t0, 0, 'nobody in town');
	T.ok(!World.files['data/Xena.tsay.json'], 'nothing said');
	World.party.Barabas.area = 75;
	Config.Leader = 'Barabas';
	Team.sendOutFirst(76);
	T.eq(World.now - t0, 0, 'a follower never sends anybody');
	Config.Leader = '';
	Team.sendOutFirst(0);
	T.eq(World.now - t0, 0, 'no destination area');
});

T.test('sendOutFirst, a follower that made the portal (a Sorceress): only the leader gives orders: it says no "proceed", it only goes last', function () {
	__plan = {partySync: true}; // a follower of a bot-led run
	World.files['data/order.json'] = JSON.stringify({game: 'qb-1', team: {n: 1, word: 'out', by: 'portal', owner: 'Xena', area: 76, leader: 'Barabas'}}); // the leader's order: out through my portal
	World.addMate('Barabas', 75, 5010, 5000);
	World.at(40000, function () { World.party.Barabas.area = 76; }); // the leader's order sent it out
	const t0 = World.now;
	T.ok(Team.sendOutFirst(76, true));
	T.ok(World.now - t0 >= 40000 && World.now - t0 < 41500, 'went after the mate: ' + (World.now - t0));
	const said = Team.heard('Xena');
	T.ok(!said || said.word !== 'proceed', 'never said proceed');
	T.ok(!World.log.some(function (l) { return /telling them again/.test(l); }), 'never told anybody again');
	T.has(World.log, 'waiting for Barabas to go out first');
});

// THE LAST ORDER TRUMPS ALL (live 20:10:29-20:12: Meir waited to go last for ever after the regroup's "town" brought everybody back)
T.test('sendOutFirst, a follower that made the portal: a newer order than "out" ends the wait, and it does not go out', function () {
	__plan = {partySync: true};
	World.files['data/order.json'] = JSON.stringify({game: 'qb-1', team: {n: 1, word: 'out', by: 'portal', owner: 'Xena', area: 76, leader: 'Barabas'}});
	World.addMate('Sankt', 75, 5010, 5000); // Sankt never goes out
	World.at(30000, function () { World.files['data/order.json'] = JSON.stringify({game: 'qb-1', team: {n: 2, word: 'town', portal: 'Barabas', leader: 'Barabas'}}); });
	const t0 = World.now;
	T.eq(Team.sendOutFirst(76, true), false, 'does not go out');
	T.ok(World.now - t0 >= 30000 && World.now - t0 < 31500, 'right after the new order: ' + (World.now - t0));
	T.has(World.log, 'the leader\'s order is now "town": I do not go out through my portal');
	T.eq(Team.heard('Xena').word, 'idle');
});

T.test('sendOutFirst: no time limit: a mate still in town is told again every 30 s, and the maker goes when it is out or has left the game', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.at(95000, function () { delete World.party.Barabas; });
	const t0 = World.now;
	Team.sendOutFirst(76, true);
	T.ok(World.now - t0 >= 95000 && World.now - t0 < 96500, 'took ' + (World.now - t0));
	T.has(World.log, 'still in town: telling them again to go out through my portal');
	T.ok(!World.log.some(function (l) { return /not waiting any longer/.test(l); }), 'never gives up');
});

T.test('sendOutFirst: a portal that somebody else made: the leader is not the maker, does not wait and writes no call', function () {
	World.addMate('Barabas', 75, 5010, 5000); // the maker of the portal, still in town and waiting for the leader to leave
	let t0 = World.now;
	T.ok(Team.sendOutFirst(76, false));
	T.eq(World.now - t0, 0, 'no waiting (the maker waits for me: a deadlock otherwise)');
	T.ok(!World.files['data/Xena.tsay.json'], 'nothing said');
});

T.test('returnCall: the last order trumps all: a newer "town" replaces the portal order; an order of another game is nothing', function () {
	Team.say('proceed', {area: 76, owner: 'Meir'});
	World.advance(1000);
	Team.order('town', {portal: 'Xena', callId: 9});
	me.profile = 'Barabas'; me.name = 'Barabas';
	T.eq(Team.returnCall('Xena'), null, 'the newer town order counts, not the portal');
	me.profile = 'Xena'; me.name = 'Xena';
	Team.say('proceed', {area: 76, owner: 'Meir'});
	me.profile = 'Barabas'; me.name = 'Barabas'; me.gamename = 'qb-2';
	T.eq(Team.returnCall('Xena'), null, 'another game');
});

function stubRegroup() { Team.regroupCalls = 0; Team.regroup = function () { Team.regroupCalls += 1; Object.keys(World.party).forEach(function (n) { World.party[n].area = me.area; World.party[n].x = me.x + 5; World.party[n].y = me.y; }); }; }

T.test('escalation: a gather that times out in the field becomes a regroup, then looks again', function () {
	me.area = 76;
	World.addMate('Barabas', 77, 0, 0);
	stubRegroup();
	const t0 = World.now;
	T.ok(Team.gather());
	T.eq(Team.regroupCalls, 1, 'one regroup');
	T.ok(World.now - t0 >= Team.limits.gather && World.now - t0 < Team.limits.gather + 2000, 'after the wait: ' + (World.now - t0));
	T.has(World.log, 'Sync broken: the team did not catch up');
	T.has(World.log, 'Party regroup in town');
});

T.test('escalation: no scroll, no regroup: it keeps waiting and says so', function () {
	me.area = 76;
	me.scrolls = 0;
	World.addMate('Barabas', 77, 0, 0);
	stubRegroup();
	World.at(70000, function () { World.party.Barabas.area = 76; });
	T.ok(Team.gather());
	T.eq(Team.regroupCalls, 0);
	T.has(World.log, 'still waiting for Barabas');
});

T.test('escalation: no cap: a regroup every timer until the mate is here (each one reported as a sync bug)', function () {
	me.area = 76;
	World.addMate('Barabas', 77, 0, 0);
	Team.regroup = function () { Team.regroupCalls = (Team.regroupCalls || 0) + 1; if (Team.regroupCalls === 5) { World.party.Barabas.area = 76; } };
	Team.regroupCalls = 0;
	T.ok(Team.gather());
	T.eq(Team.regroupCalls, 5, 'five regroups, then it was here');
});

T.test('escalation: the regroup\'s own gather does not start another regroup', function () {
	me.area = 76;
	World.addMate('Barabas', 77, 0, 0);
	stubRegroup();
	World.at(40000, function () { World.party.Barabas.area = 76; });
	T.ok(Team.gather(5000, true));
	T.eq(Team.regroupCalls, 0);
});

T.test('escalation: a follower never regroups', function () {
	me.area = 76;
	World.addMate('Barabas', 77, 0, 0);
	Config.Leader = 'Barabas';
	stubRegroup();
	T.ok(Team.gather());
	T.eq(Team.regroupCalls, 0);
});

T.test('in town: everybody present but one slow: the leader keeps waiting well past 60 s', function () {
	World.addMate('Barabas', 75, 5010, 5000);   // in town, busy
	World.files['data/Barabas.tsay.json'] = JSON.stringify({word: 'chores', id: 1, area: 75, at: World.now, ttl: 1000000});
	World.at(120000, function () { say_ready('Barabas'); });
	let t0 = World.now;
	T.ok(Team.waitToLeaveTown());
	T.ok(World.now - t0 >= 120000 && World.now - t0 < 122000, 'waited until ready: ' + (World.now - t0));
});

T.test('the other side of an exit: a mate that does not come through becomes a regroup', function () {
	me.area = 76;
	World.addMate('Barabas', 75, 0, 0);
	Team.lastArea = 75;
	stubRegroup();
	Team.keepClose();
	T.eq(Team.regroupCalls, 1, 'one regroup');
	T.ok(!Team.arrivalPending, 'the arrival is paid');
});

T.test('stepAside: the leader walks a few steps off the doorway, not toward an exit', function () {
	me.area = 76; me.x = 5000; me.y = 5000;
	World.exits = [{x: 4995, y: 5000}];                    // the exit it just came through
	T.ok(Team.stepAside(), 'moved');
	const m = World.moves[0];
	const d = Math.sqrt((m[0] - 5000) * (m[0] - 5000) + (m[1] - 5000) * (m[1] - 5000));
	T.ok(d >= 8.5 && d <= 15.5, 'a few steps away: ' + d);
	T.ok(Math.sqrt((m[0] - 4995) * (m[0] - 4995) + (m[1] - 5000) * (m[1] - 5000)) >= 14, 'not near the exit');
});

T.test('stepAside: nowhere valid, or already stepping: no move', function () {
	me.area = 76;
	World.valid = function () { return false; };
	T.ok(!Team.stepAside());
	T.eq(World.moves.length, 0);
});

T.test('makeRoom: only near an exit, never in town', function () {
	me.area = 76;
	World.exits = [{x: 5200, y: 5000}];
	T.ok(!Team.makeRoom(), 'far from the exit: stays');
	World.exits = [{x: 5004, y: 5000}];
	T.ok(Team.makeRoom(), 'near the exit: moves');
	me.area = 75; World.moves = [];
	T.ok(!Team.makeRoom(), 'in town: no');
});

T.test('arrival wait: the leader steps aside first, then waits', function () {
	me.area = 76;
	World.exits = [{x: 5001, y: 5000}];
	World.addMate('Barabas', 75, 0, 0);
	Team.lastArea = 75;
	World.at(6000, function () { World.party.Barabas.area = 76; World.party.Barabas.x = 5012; World.party.Barabas.y = 5000; });
	Team.keepClose();
	T.ok(World.moves.length >= 1, 'it stepped off the entrance');
	T.has(World.log, 'waiting at the exit for Barabas');
});

T.test('gather: waiting near a doorway, the leader first makes room', function () {
	me.area = 76;
	World.exits = [{x: 5003, y: 5000}];
	World.addMate('Barabas', 75, 0, 0);
	World.at(5000, function () { World.party.Barabas.area = 76; World.party.Barabas.x = 5010; World.party.Barabas.y = 5000; });
	T.ok(Team.gather());
	T.ok(World.moves.length >= 1, 'it moved off the doorway');
});

T.test('leaving: the leader announces a destination in the field, once; a follower in town hears it once', function () {
	T.ok(Team.announceLeaving(104), 'announced');
	T.eq(Team.currentOrder().word, 'out', 'the order record says out');
	T.eq(Team.currentOrder().area, 104);
	// a follower's view
	me.profile = 'Barabas'; me.name = 'Barabas';
	World.addMate('Xena', 75, 5000, 5000);
	const call = Team.leavingCall();
	T.ok(call && call.area === 104 && call.from === 'Xena', 'heard');
	T.eq(Team.leavingCall(), null, 'not twice');
});

T.test('leaving: no announcement for a town, for the follower, or without a destination', function () {
	T.ok(!Team.announceLeaving(103), 'a town (another act): they follow normally');
	T.ok(!Team.announceLeaving(0));
	T.ok(!Team.announceLeaving('x'));
	Config.Leader = 'Barabas';
	T.ok(!Team.announceLeaving(104), 'a follower announces nothing');
	Config.Leader = ''; me.area = 76;
	T.ok(!Team.announceLeaving(104), 'not in town');
});

T.test('leaving: the last order trumps all: after the leader\'s newer call to town, the older "leaving" is not followed (Barabas and Sankt, live 17:33:21-28)', function () {
	World.addMate('Barabas', 75, 0, 0);
	T.ok(Team.announceLeaving(83, 'waypoint'));
	World.advance(4000);
	Team.order('town', {portal: 'Xena', callId: 7});
	me.profile = 'Barabas'; me.name = 'Barabas';
	T.eq(Team.leavingCall(), null, 'not the old leaving');
	T.eq(Team.currentOrder().word, 'town', 'the newest order is town');
});

T.test('progress: a mate that does not move is regrouped for', function () {
	me.area = 76;
	World.addMate('Barabas', 76, 5400, 5000); // far and still
	stubRegroup();
	T.ok(Team.gather(0, false, true));
	T.eq(Team.regroupCalls, 1, 'regroup');
});

function botsFile(firstAct) { World.files['data/bots.json'] = JSON.stringify({team: ['Xena', 'Barabas'], bots: ['Xena', 'Barabas'], firstAct: firstAct}); }

T.test('firstActHop: a hunt starts in the act of its first place: everybody goes there first', function () {
	botsFile(1);
	me.area = 103; // saved in act 4
	T.ok(Team.firstActHop(), 'hopped');
	T.eq(World.hops.join(','), '1');
	T.eq(me.area, 1);
	T.has(World.log, 'the run starts in act 1');
});

T.test('firstActHop: nothing when no hunt is on, when already there, not in town, or the act is not unlocked', function () {
	botsFile(0);
	me.area = 103;
	T.ok(!Team.firstActHop(), 'no hunt');
	botsFile(1); me.area = 1;
	T.ok(!Team.firstActHop(), 'already there');
	me.area = 103; World.acts = [3, 4];
	T.ok(!Team.firstActHop(), 'act 1 not unlocked? (always is: here it is not in the list)');
	World.acts = null; me.area = 104;
	T.ok(!Team.firstActHop(), 'in the field');
	T.eq(World.hops.length, 0, 'no hop at all');
	delete World.files['data/bots.json'];
	me.area = 103;
	T.ok(!Team.firstActHop(), 'no bots file');
});

function humanLeads() { __plan = {}; Config.Leader = 'RealPlayer'; }   // a real person leads: the bots are plain followers, nobody has an objective

T.test('a real player leads: NONE of the team sync applies (the user: "does not apply when a real person is the leader")', function () {
	humanLeads();
	me.area = 76;
	World.addMate('Barabas', 77, 0, 0);       // a mate far away and not coming
	World.monsters = [];
	stubRegroup();
	const t0 = World.now;
	T.ok(Team.gather(), 'gather');
	T.ok(Team.holdAndGather(), 'hold');
	T.eq(World.said.length, 0, 'says nothing');
	Team.lastArea = 75; Team.keepClose();
	me.area = 75;
	T.ok(Team.waitToLeaveTown(), 'leave town');
	T.ok(Team.sendOutFirst(76, true), 'send out');
	T.ok(!Team.announceLeaving(104), 'announce');
	T.ok(!Team.escalate(['Barabas'], 'x'), 'escalate');
	T.eq(World.now - t0, 0, 'no waiting at all');
	T.eq(Team.regroupCalls, 0, 'no regroup');
	T.eq(World.files['data/Xena.tsay.json'], undefined, 'nothing said in the keyword chat');
});

T.test('a real player leads: the party trip is off too', function () {
	humanLeads();
	__plan = {partySync: false};
	World.load('common/PartySync.js');
	T.eq(PartySync.call(), 0, 'no call');
	T.ok(!PartySync.enabled(), 'not enabled');
});

T.test('stepAside: the step itself must not start the exit wait (the first live test: the leader never left the entrance tile)', function () {
	me.area = 76; me.x = 5000; me.y = 5000;
	World.exits = [{x: 4995, y: 5000}];
	World.addMate('Barabas', 75, 0, 0);       // still in the other area: a wait is due
	Team.lastArea = 75;
	World.at(30000, function () { World.party.Barabas.area = 76; World.party.Barabas.x = 5012; World.party.Barabas.y = 5000; });
	Team.keepClose();                          // the arrival: steps aside, THEN waits
	const t0 = 1700000000000;
	T.ok(World.moves.length >= 1, 'it moved');
	T.ok(World.moveTimes[0] - t0 < 1000, 'it stepped aside at the START of the wait, not after it (moved at +' + (World.moveTimes[0] - t0) + ' ms)');
	T.ok(World.moves[0][0] !== 5000 || World.moves[0][1] !== 5000, 'off the entrance tile');
	T.eq(me.x === 5000 && me.y === 5000, false, 'and stands somewhere else while it waits');
	T.ok(World.now - 1700000000000 >= 30000, 'the wait ran after the step: ' + (World.now - 1700000000000));
});

T.test('towardExit: only a step toward a near exit is refused', function () {
	me.area = 76; me.x = 5000; me.y = 5000;
	World.exits = [{x: 5004, y: 5000}];
	T.ok(Team.towardExit(5003, 5000), 'toward the exit: refused');
	T.ok(!Team.towardExit(4994, 5000), 'away from it: fine');
	T.ok(!Team.towardExit(5000, 5006), 'along it: fine');
	World.exits = [{x: 5400, y: 5000}];
	T.ok(!Team.towardExit(5006, 5000), 'a far exit: fine');
	World.exits = [];
	T.ok(!Team.towardExit(5006, 5000), 'no exits: fine');
});

T.test('gather at a boss (no proximity): everybody in the area is enough, however far from the leader', function () {
	me.area = 105;
	World.addMate('Barabas', 105, 5600, 5000);   // in the area, 600 units away
	stubRegroup();
	const t0 = World.now;
	T.ok(Team.holdAndGather());
	T.eq(World.now - t0, 0, 'no waiting');
	T.eq(Team.regroupCalls, 0, 'no regroup');
});

T.test('describe: what the leader sees of each late mate', function () {
	me.area = 76; me.x = 5000; me.y = 5000;
	World.addMate('Barabas', 76, 5300, 5000);
	World.addMate('Sankt', 40, 0, 0);
	const d = Team.describe(['Barabas', 'Sankt', 'Nobody']);
	T.has([d], 'Barabas (area 76, 300 units)');
	T.has([d], 'Sankt (area 40)');
	T.has([d], 'Nobody (not in the game)');
});


T.test('keepClose / waitToLeaveTown: no team wait in the town chicken thread (Xena, River of Flame, 12:52: an exit wait on the way to her own portal)', function () {
	me.area = 107;
	World.addMate('Barabas', 103, 5000, 5000); // the mates are in town on a party trip
	World.addMate('Sankt', 103, 5000, 5000);
	Team.lastArea = 0; Team.closeAt = 0; // a fresh thread: its copy of Team has never seen this area
	globalThis.getScript = function () { return {name: 'tools\\TownChicken.js'}; };
	try {
		let t0 = World.now;
		Team.keepClose();
		T.eq(World.now - t0, 0, 'no exit wait on the way to the town portal');
		T.ok(!World.log.some(function (l) { return /waiting at the exit|regroup/.test(l); }), 'no exit wait, no regroup');
		me.area = 103;
		World.party.Barabas.area = 107;
		World.party.Sankt.area = 107;
		World.files['data/' + me.profile + '.afterparty.json'] = JSON.stringify({until: World.now + 30000}); // right after a party trip (its barrier did the waiting)
		t0 = World.now;
		T.ok(Team.waitToLeaveTown(107), 'no leave-town wait right after a party trip: the mates are already out where I go');
		T.eq(World.now - t0, 0);
		delete World.files['data/' + me.profile + '.afterparty.json'];
		World.party.Barabas.area = 103; // a mate that rejoined and is not ready yet (PartySync.hold, live 13:01:44): the wait does run in this thread
		World.party.Sankt.area = 103;
		Team.leaveOkAt = 0;
		World.at(5000, function () { say_ready('Barabas', 103); say_ready('Sankt', 103); });
		t0 = World.now;
		Team.waitToLeaveTown(107);
		T.ok(World.now - t0 >= 5000, 'waited for the mates to be ready: ' + (World.now - t0));
		globalThis.getScript = function () { return {name: 'default.dbj'}; };
		T.ok(Team.mainThread(), 'the main script does wait');
	} finally {
		delete globalThis.getScript;
	}
});

T.test('sendOutFirst: two makers do not wait for each other: a mate at its own portal (it says proceed) does not hold me (Darius and Sankt, 13:08:20)', function () {
	World.addMate('Sankt', 75, 5010, 5000);
	World.files['data/Sankt.tsay.json'] = JSON.stringify({word: 'proceed', id: 1, area: 76, at: World.now, ttl: 30000});
	me.area = 75;
	const t0 = World.now;
	T.ok(Team.sendOutFirst(76, true));
	T.eq(World.now - t0, 0, 'no wait: Sankt waits at its own portal');
});

T.test('waitToLeaveTown: no wait right after a party trip, in the main script too (Darius waited for the mates he had just sent out, 13:13:57)', function () {
	World.load('common/PartySync.js');
	me.area = 75;
	World.addMate('Barabas', 76, 5000, 5000); // already back out
	World.files['data/' + me.profile + '.afterparty.json'] = JSON.stringify({until: World.now + 30000});
	const t0 = World.now;
	T.ok(Team.waitToLeaveTown(76));
	T.eq(World.now - t0, 0, 'no wait, no regroup');
	T.ok(!World.log.some(function (l) { return /waiting in town|regroup/.test(l); }));
});

// THE BOTS' MESSAGE LOG (Team.post / command / take): coordination by keywords, not the public chat
function postAs(name, word, args, to) { const keep = me.profile; me.profile = name; Team.post(word, args, to); me.profile = keep; }

T.test('message log: a command reaches the followers, once, and nothing is said in chat', function () {
	World.addMate('Barabas', 75, 5000, 5000);
	postAs('Barabas', 'cmd', ['portal andy']);
	const got = Team.take('follower', ['Barabas'], ['cmd']);
	T.eq(got.length, 1, 'one command');
	T.eq(got[0].a[0], 'portal andy');
	T.eq(got[0].from, 'Barabas');
	T.eq(Team.take('follower', ['Barabas'], ['cmd']).length, 0, 'not taken twice');
	T.eq(World.said.length, 0, 'no public chat');
});

T.test('message log: every reader has its own place, and a word filter leaves the rest unread', function () {
	World.addMate('Sankt', 75, 5000, 5000);
	postAs('Sankt', 'needgold', []);
	postAs('Sankt', 'portalopen', ['andy']);
	T.eq(Team.take('qt', ['Sankt'], ['portalopen', 'noget']).map(function (m) { return m.w; }).join(), 'portalopen');
	T.eq(Team.take('gold', null, ['needgold']).length, 1, 'gold still sees needgold');
	T.eq(Team.take('gold', null, ['needgold']).length, 0, 'once');
});

T.test('message log: a message to another bot is not mine; old messages and a restarted log', function () {
	World.addMate('Sankt', 75, 5000, 5000);
	World.files['data/Sankt.tmsg.json'] = JSON.stringify({n: 3, msgs: [{n: 3, at: World.now - 60000, w: 'portalopen', a: [], to: ''}]});
	postAs('Sankt', 'portalopen', [], 'Barabas');
	T.eq(Team.take('qt', ['Sankt']).length, 0, 'an old message and one for Barabas: nothing');
	World.files['data/Sankt.tmsg.json'] = JSON.stringify({n: 0, msgs: []}); // Sankt's log started again
	postAs('Sankt', 'noget', []);
	T.eq(Team.take('qt', ['Sankt']).length, 1, 'the new log is read from the start');
});

T.test('message log: keeps the last 30', function () {
	for (let i = 0; i < 40; i++) Team.post('cmd', ['x' + i]);
	const log = JSON.parse(World.files['data/Xena.tmsg.json']);
	T.eq(log.msgs.length, 30);
	T.eq(log.n, 40);
	T.eq(log.msgs[0].a[0], 'x10');
});

// the user, 2026-11-15: "even if it's a waypoint hunt and not everybody needs that waypoint -- they all go to keep the party safe"
function loadWaypoints(lacking) {
	World.load('common/Waypoints.js');
	Waypoints.save = function () {};
	Waypoints.receivers = function () { return lacking(); };
}

T.test('waypoint share: the leader waits for the WHOLE team at the waypoint, also the mates that already have it', function () {
	me.area = 76;
	World.addMate('Barabas', 76, 5005, 5000);  // lacks it, came at once
	World.addMate('Sankt', 75, 0, 0);          // has it already, still coming through the portal
	let taken = false;
	World.at(3000, function () { taken = true; });
	World.at(15000, function () { World.party.Sankt.area = 76; World.party.Sankt.x = 5003; World.party.Sankt.y = 5000; });
	loadWaypoints(function () { return taken ? [] : ['Barabas']; });
	const t0 = World.now;
	T.ok(Waypoints.waitForTeam(76));
	T.ok(World.now - t0 >= 15000, 'waited for Sankt too, took ' + (World.now - t0));
});

T.test('waypoint share: a follower does not gather the team', function () {
	me.area = 76;
	Config.Leader = 'Barabas';
	World.addMate('Sankt', 75, 0, 0);
	loadWaypoints(function () { return []; });
	const t0 = World.now;
	T.ok(Waypoints.waitForTeam(76));
	T.ok(World.now - t0 < 2000, 'no wait, took ' + (World.now - t0));
});

T.test('waypoint share: the leader at the waypoint names its portal ("proceed", owner and area) so every follower in town takes it', function () {
	me.area = 76;
	World.load('common/Waypoints.js');
	Waypoints.sendTeam();
	const m = Team.heard('Xena');
	T.eq(m.word, 'proceed'); T.eq(m.owner, 'Xena'); T.eq(m.area, 76);
	me.profile = 'Barabas'; me.name = 'Barabas';
	World.addMate('Xena', 76, 0, 0);
	const rc = Team.returnCall('Xena');
	T.ok(rc && rc.area === 76 && rc.owner === 'Xena', 'a follower hears it, with the portal to take');
});

T.test('announceLeaving: says how the leader goes (exit or waypoint)', function () {
	World.addMate('Barabas', 75, 0, 0);
	T.ok(Team.announceLeaving(76, 'waypoint'));
	T.eq(Team.currentOrder().by, 'waypoint');
	T.eq(Team.currentOrder().area, 76);
});

T.test('order: only the leader writes one; n counts up; a follower writes nothing', function () {
	const a = Team.order('out', {area: 76, by: 'exit'});
	const b = Team.order('town', {portal: 'Xena'});
	T.ok(b.n > a.n, 'n counts up');
	T.eq(Team.currentOrder().word, 'town', 'the newest');
	Config.Leader = 'Barabas'; __plan = {partySync: true}; // a follower of a bot-led team
	T.eq(Team.order('out', {area: 77}), null, 'a follower gives no order');
	T.eq(Team.currentOrder().word, 'town', 'unchanged');
	humanLeads();
	T.eq(Team.currentOrder(), null, 'a real player leads: a leftover order of an older game (empty game name) counts for nothing');
});

T.test('order: an order written before this game began (an older game with the same empty name) is ignored', function () {
	World.files['data/order.json'] = JSON.stringify({game: 'qb-1', team: {n: 1, word: 'town', at: World.now - 3600000, leader: 'Barabas'}});
	me.gamestarttime = getTickCount() - 60000; // this game began a minute ago
	T.eq(Team.currentOrder(), null, 'an hour-old order is an older game\'s');
	World.files['data/order.json'] = JSON.stringify({game: 'qb-1', team: {n: 2, word: 'town', at: World.now - 30000, leader: 'Barabas'}});
	T.eq(Team.currentOrder().word, 'town', 'an order of this game counts');
});

T.test('order: an errand is the newest order only for the bot it is for; a newer team order replaces it for that bot too', function () {
	Team.order('town', {portal: 'Xena'});
	World.advance(1000);
	Team.order('errand', {to: 'Meir', place: 'sewers'});
	me.profile = 'Meir'; me.name = 'Meir';
	T.eq(Team.currentOrder().word, 'errand', 'Meir: her errand');
	me.profile = 'Barabas'; me.name = 'Barabas';
	T.eq(Team.currentOrder().word, 'town', 'Barabas: still town');
	me.profile = 'Xena'; me.name = 'Xena';
	World.advance(1000);
	Team.say('proceed', {area: 92, owner: 'Meir'});
	me.profile = 'Meir'; me.name = 'Meir';
	T.eq(Team.currentOrder().word, 'out', 'Meir: the newer out');
});

T.test('order: a new game starts with no orders; the leader\'s first order there drops the old game\'s', function () {
	Team.order('town', {portal: 'Xena'});
	me.gamename = 'qb-2';
	T.eq(Team.currentOrder(), null, 'no orders in the new game');
	Team.order('out', {area: 2, by: 'exit'});
	T.eq(Team.currentOrder().word, 'out');
	T.ok(!JSON.parse(World.files['data/order.json']).errand, 'nothing of the old game kept');
});

// NOBODY LEAVES TOWN UNTIL THE LEADER SAYS (the user, 2026-11-15; live 19:48:34, Sankt took his own portal back out while the order was "town")
T.test('mayLeaveTown: a follower in town goes toward the field only on "out" or an errand to it; another town, the field and the leader are free', function () {
	Team.order('town', {portal: 'Xena'}); // Xena leads
	T.ok(Team.mayLeaveTown(83), 'the leader is free');
	Config.Leader = 'Xena'; __plan = {partySync: true}; me.profile = 'Sankt'; me.name = 'Sankt';
	T.ok(!Team.mayLeaveTown(83), 'order "town": stays');
	T.has(World.log, 'the leader has not sent the team out (last order: town)');
	T.ok(!Team.mayLeaveTown(null), 'a portal of unknown destination: stays');
	T.ok(Team.mayLeaveTown(40), 'to another town (an act change): free');
	me.area = 83;
	T.ok(Team.mayLeaveTown(84), 'in the field: not asked');
	me.area = 75;
	Config.Leader = ''; __plan = {goal: 'Quest', partySync: true}; me.profile = 'Xena'; me.name = 'Xena';
	World.advance(1000);
	Team.order('errand', {to: 'Meir', place: 'sewers'});
	Config.Leader = 'Xena'; __plan = {partySync: true};
	me.profile = 'Meir'; me.name = 'Meir';
	T.ok(Team.mayLeaveTown(83), 'Meir: her errand');
	me.profile = 'Sankt'; me.name = 'Sankt';
	T.ok(!Team.mayLeaveTown(83), 'Sankt: still town');
	Config.Leader = ''; __plan = {goal: 'Quest', partySync: true}; me.profile = 'Xena'; me.name = 'Xena';
	World.advance(1000);
	Team.announceLeaving(83, 'waypoint');
	Config.Leader = 'Xena'; __plan = {partySync: true}; me.profile = 'Sankt'; me.name = 'Sankt';
	T.ok(Team.mayLeaveTown(83), 'order "out": goes');
	__plan = {partySync: false};
	World.files['data/order.json'] = JSON.stringify({game: 'qb-1', team: {n: 1, word: 'town'}});
	T.ok(Team.mayLeaveTown(83), 'no party sync (a human leads): free');
});

T.test('proceed: the leader taking a portal out is the order "out" by that portal, also when nobody is in town', function () {
	Team.say('proceed', {area: 76, owner: 'Xena'});
	const o = Team.currentOrder();
	T.eq(o.word, 'out'); T.eq(o.by, 'portal'); T.eq(o.owner, 'Xena'); T.eq(o.area, 76);
	me.profile = 'Barabas'; me.name = 'Barabas';
	const rc = Team.returnCall('Xena');
	T.ok(rc && rc.area === 76 && rc.owner === 'Xena', 'the follower takes it');
	T.eq(Team.returnCall('Xena'), null, 'once');
});

Tests.run();
