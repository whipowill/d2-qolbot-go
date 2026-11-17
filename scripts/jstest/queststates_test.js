// Tests of libs/common/QuestStates.js: the record of the quests' states (the user, 2026-11-16: "start keeping a lot of states and let's try to make this perfect").
// It writes a line when a quest's bits or the quest items in the pack changed, and nothing otherwise.
const T = Tests;
let state, items;

T.setup = function () {
	state = {}; items = [];
	me.gameReady = true; me.diff = 1; me.area = 109; me.profile = 'Barabas';
	me.getQuest = function (id, bit) { return ((state[id] || 0) >> bit) & 1; };
	me.getItems = function () { return items; };
	globalThis.sendPacket = function () {};
	World.files = {};
	World.load('common/QuestStates.js');
};

T.test('the first look records every quest that has a bit set, with the quest items', function () {
	state[37] = 0b0000000000001110; state[38] = 1; items = [{itemType: 39, classid: 644}, {itemType: 4, classid: 9}];
	T.ok(QuestStates.snapshot('first look'));
	const text = World.files['data/queststates.Barabas.log'];
	T.ok(text.indexOf('37: 0111000000000000') > -1, 'quest 37, bit 0 first');
	T.ok(text.indexOf('38: 1000000000000000') > -1, '38: 1000000000000000');
	T.ok(text.indexOf('items 644') > -1, 'only the quest item');
	T.ok(text.indexOf('diff 1 | area 109 | first look') > -1, 'diff 1 | area 109 | first look');
});

T.test('nothing changed: nothing written', function () {
	state[37] = 0b1110;
	QuestStates.snapshot('a');
	const len = World.files['data/queststates.Barabas.log'].length;
	T.ok(!QuestStates.snapshot('b'), 'no line');
	T.eq(World.files['data/queststates.Barabas.log'].length, len);
});

T.test('a change is written with the bits before and after, the NPC and the reason', function () {
	state[37] = 0b1110;
	QuestStates.snapshot('a');
	state[37] = 0b11110;
	T.ok(QuestStates.snapshot('after talking to anya', 'anya', true));
	const lines = World.files['data/queststates.Barabas.log'].trim().split('\n');
	T.ok(lines[1].indexOf('37: 0111000000000000 > 0111100000000000') > -1, '37: 0111000000000000 > 0111100000000000');
	T.ok(lines[1].indexOf('npc anya') > -1, 'npc anya');
	T.ok(lines[1].indexOf('after talking to anya') > -1, 'after talking to anya');
});

T.test('a quest item arriving or leaving is a change too', function () {
	QuestStates.snapshot('a');
	items = [{itemType: 39, classid: 646}];
	T.ok(QuestStates.snapshot('scroll given'));
	T.ok(World.files['data/queststates.Barabas.log'].indexOf('items 646') > -1, 'items 646');
	items = [];
	T.ok(QuestStates.snapshot('scroll used'));
});

T.test('a game that is not ready, or an error, never throws', function () {
	me.gameReady = false;
	T.ok(!QuestStates.snapshot('closing'));
	me.gameReady = true;
	me.getQuest = function () { throw new Error('boom'); };
	T.ok(!QuestStates.snapshot('broken'));
});

T.run();
