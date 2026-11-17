// Tests of libs/common/PartySync.js, the party town trip, against the user's rules (2026-11-14): anybody goes to town -> everybody goes; the maker of the
// portal is the last one back through it.
const T = Tests;
T.setup = function () {
	World.load('common/Team.js');
	World.load('common/PartySync.js');
	__plan = {goal: 'Quest', partySync: true};
	PartySync.session = 1111;
};

function writeSync(name, id, ready) { World.files['data/' + name + '.sync.json'] = JSON.stringify({id: id, ready: ready, session: 2222, at: World.now}); }

T.test('call: the caller writes the call, its own sync file, and not twice within 15 s', function () {
	const id = PartySync.call();
	T.ok(id > 0, 'a call id');
	const c = JSON.parse(World.files['data/partycall.json']);
	T.eq(c.from, 'Xena'); T.eq(c.id, id);
	T.eq(JSON.parse(World.files['data/Xena.sync.json']).ready, false, 'not ready yet');
	T.eq(Team.heard('Xena').word, 'chickentown', 'the keyword chat says it too');
	T.eq(PartySync.call(), 0, 'a second call within a minute is refused');
	World.advance(61000);
	T.ok(PartySync.call() > 0, 'a minute later it may call again');
});

T.test('call: a town chicken trip is urgent (the mates drop whatever they are doing), a chores trip is not', function () {
	PartySync.call(76, true);
	T.eq(JSON.parse(World.files['data/partycall.json']).urgent, true, 'chicken: urgent');
	World.advance(61000);
	PartySync.call(76);
	T.eq(JSON.parse(World.files['data/partycall.json']).urgent, false, 'not urgent');
});

// ONLY THE LEADER GIVES ORDERS (the user, 2026-11-15): a follower that goes to town calls nobody; it tells the leader, and the leader calls the team
// to town through that follower's portal.
T.test('call, a follower: no call to the team, a report to the leader, and it waits in town like a caller', function () {
	__plan = {partySync: true}; // a follower: no goal
	const id = PartySync.call(76, true);
	T.ok(id > 0, 'a trip id (the barrier hands it back to the Follower)');
	T.eq(PartySync.currentId, id);
	T.ok(!World.files['data/partycall.json'], 'no call to the team');
	const r = JSON.parse(World.files['data/Xena.wenttown.json']);
	T.eq(r.name, 'Xena'); T.eq(r.area, 76); T.eq(r.urgent, true); T.eq(r.id, id);
	T.eq(JSON.parse(World.files['data/Xena.sync.json']).ready, false);
	const said = Team.heard('Xena');
	T.ok(!said || said.word !== 'chickentown', 'nothing said to the team');
	T.has(World.log, 'went to town to heal: telling the leader');
});

T.test('wentTown, the leader: sees a mate\'s fresh report once; not an old one, not one of an older session; a follower reads none', function () {
	World.addMate('Barabas', 76, 0, 0);
	writeSync('Barabas', 5000, false);
	World.files['data/Barabas.wenttown.json'] = JSON.stringify({id: 5000, name: 'Barabas', session: 2222, area: 76, at: World.now, urgent: true});
	const r = PartySync.wentTown();
	T.ok(r && r.from === 'Barabas' && r.name === 'Barabas' && r.urgent === true, 'the report');
	T.eq(PartySync.wentTown(), null, 'not twice');
	World.files['data/Barabas.wenttown.json'] = JSON.stringify({id: 5100, name: 'Barabas', session: 1, area: 76, at: World.now});
	T.eq(PartySync.wentTown(), null, 'an older session of the mate is dead');
	World.files['data/Barabas.wenttown.json'] = JSON.stringify({id: 5200, name: 'Barabas', session: 2222, area: 76, at: World.now - 61000});
	T.eq(PartySync.wentTown(), null, 'older than a minute is dead');
	World.files['data/Barabas.wenttown.json'] = JSON.stringify({id: 5300, name: 'Barabas', session: 2222, area: 76, at: World.now});
	__plan = {partySync: true};
	T.eq(PartySync.wentTown(), null, 'a follower reads no reports');
});

T.test('call, the leader for a mate that went first: the call names that mate\'s portal', function () {
	PartySync.call(76, true, 'Barabas');
	const c = JSON.parse(World.files['data/partycall.json']);
	T.eq(c.from, 'Xena', 'the leader calls'); T.eq(c.portal, 'Barabas', 'through the mate\'s portal'); T.eq(c.urgent, true);
	T.has(World.log, 'Barabas went to town: the leader calls the team to town through Barabas\'s portal');
	World.advance(61000);
	PartySync.call(76);
	T.eq(JSON.parse(World.files['data/partycall.json']).portal, 'Xena', 'its own trip: its own portal');
});

T.test('townOrder, a follower: the leader\'s newest order "town", once it is carried out not again; a newer order replaces it; the leader reads none', function () {
	PartySync.call(76, true, 'Barabas'); // the leader (Xena) calls through Barabas's portal
	me.profile = 'Sankt'; me.name = 'Sankt';
	__plan = {partySync: true};
	const o = PartySync.townOrder();
	T.ok(o && o.portal === 'Barabas' && o.urgent === true, 'the order');
	PartySync.townDone = o.n;
	T.eq(PartySync.townOrder(), null, 'carried out: not again');
	PartySync.townDone = 0;
	me.profile = 'Xena'; me.name = 'Xena'; __plan = {goal: 'Quest', partySync: true};
	World.advance(1000);
	Team.announceLeaving(83, 'waypoint');
	T.eq(PartySync.townOrder(), null, 'the leader reads no town order');
	me.profile = 'Sankt'; me.name = 'Sankt'; __plan = {partySync: true};
	T.eq(PartySync.townOrder(), null, 'a newer out replaces it');
});

T.test('townOrder: a follower that was in town (or on a waypoint) when the order came still goes once it is in the field (Barabas and Sankt, live 17:33:25)', function () {
	PartySync.call(76);
	me.profile = 'Barabas'; me.name = 'Barabas'; __plan = {partySync: true};
	PartySync.ack(); // in town: "I am here"
	T.ok(PartySync.townOrder(), 'the order still stands for it');
});

T.test('session: one per bot for the whole game, the same in every thread; a bot never answers its own call', function () {
	PartySync.session = 0; // no test value: the game's start time
	T.eq(PartySync.session, 4242, 'me.gamestarttime');
	PartySync.call(76);
	const c = JSON.parse(World.files['data/partycall.json']);
	T.eq(c.session, 4242);
	PartySync.answered = 0; PartySync.currentId = 0;
	PartySync.ack(); // my other thread, in town
	T.eq(PartySync.answered, 0, 'my own call is not answered');
	T.eq(JSON.parse(World.files['data/Xena.sync.json']).session, 4242, 'my file keeps the session');
});

T.test('call: nothing when the party sync is off (a human plays)', function () {
	__plan = {goal: 'Quest', partySync: false};
	T.eq(PartySync.call(), 0);
});

T.test('pending: a mate sees a fresh call of another bot, not its own, not an old one', function () {
	me.profile = 'Barabas'; me.name = 'Barabas';
	World.addMate('Xena', 76, 0, 0);
	writeSync('Xena', 5000, false);
	World.files['data/partycall.json'] = JSON.stringify({id: 5000, from: 'Xena', session: 2222, area: 76, at: World.now});
	T.ok(PartySync.pending(), 'sees the call');
	PartySync.answered = 5000;
	T.ok(!PartySync.pending(), 'not twice');
	PartySync.answered = 0;
	World.advance(61000);
	T.ok(!PartySync.pending(), 'a call older than a minute is dead');
	World.files['data/partycall.json'] = JSON.stringify({id: 9000, from: 'Barabas', session: 2222, area: 76, at: World.now});
	T.ok(!PartySync.pending(), 'my own call is not for me');
});

function makerSays(name, id, at) { World.files['data/' + name + '.tsay.json'] = JSON.stringify({word: 'proceed', callId: id, id: 1, area: 75, at: at === undefined ? World.now : at, ttl: 100000}); }

// THE TRIP'S END (2026-11-15): every bot says ready in town and nothing else; the town gate (Team.waitToLeaveTown) holds everybody until all are ready,
// the leader goes back out, the others follow the leader, the maker of a portal goes last (Team.sendOutFirst). No timed waits in the trip any more.
T.test('barrier, a follower: says "chores", not ready (its main loop says ready once idle), and stays in town to go out with the leader (no wait, no timer)', function () {
	__plan = {partySync: true}; // a follower: no goal
	World.addMate('Barabas', 75, 5010, 5000);
	World.files['data/partycall.json'] = JSON.stringify({id: 7000, from: 'Barabas', session: 2222, area: 76, at: World.now});
	PartySync.currentId = 7000;
	const t0 = World.now;
	PartySync.barrier();
	T.eq(World.now - t0, 0, 'no wait');
	T.eq(Team.heard('Xena').word, 'chores', 'not ready: the main script may still be busy (live 20:10:26, Sankt)');
	T.ok(PartySync.stayInTown, 'goes out with the leader');
	T.eq(PartySync.currentId, 0);
	T.eq(JSON.parse(World.files['data/Xena.sync.json']).ready, true);
});

T.test('barrier, the leader: says ready and goes back out itself (through the town gate)', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	World.files['data/partycall.json'] = JSON.stringify({id: 7100, from: 'Barabas', session: 2222, area: 76, at: World.now});
	PartySync.currentId = 7100;
	PartySync.barrier();
	T.ok(!PartySync.stayInTown, 'the leader does not stay');
	T.eq(Team.heard('Xena').word, 'ready');
});

T.test('barrier, the maker: marks its trip done', function () {
	World.addMate('Barabas', 75, 5010, 5000);
	const id = PartySync.call(76);
	PartySync.barrier();
	T.eq(JSON.parse(World.files['data/partycall.json']).done, true);
});

T.test('tripOn: a mate sees the trip from the call until the maker marks it done (every thread reads the file)', function () {
	me.profile = 'Barabas'; me.name = 'Barabas';
	T.ok(!PartySync.tripOn(), 'no call: no trip');
	World.files['data/partycall.json'] = JSON.stringify({id: 5000, from: 'Xena', session: 2222, area: 76, at: World.now});
	T.ok(PartySync.tripOn(), 'a fresh call of another bot: a trip is on');
	me.profile = 'Xena'; me.name = 'Xena';
	T.ok(!PartySync.tripOn(), 'my own call is not a trip I wait out');
	PartySync.endTrip(4999);
	me.profile = 'Barabas'; me.name = 'Barabas';
	T.ok(PartySync.tripOn(), 'endTrip of another id changes nothing');
	PartySync.endTrip(5000);
	T.ok(!PartySync.tripOn(), 'done: the trip is over');
	World.files['data/partycall.json'] = JSON.stringify({id: 6000, from: 'Xena', session: 2222, area: 76, at: World.now});
	World.advance(121000);
	T.ok(!PartySync.tripOn(), 'a maker that never ends the trip (a crash) holds nobody past 2 minutes');
});

Tests.run();
