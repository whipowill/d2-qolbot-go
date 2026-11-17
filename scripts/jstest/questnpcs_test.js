// Tests of libs/common/QuestNpcs.js: when does a bot talk to a quest NPC, and to whom (the user, 2026-11-16: "whenever bots are in town -- even if they are followers of a real
// player -- they should consider what quests they are on and what NPC they should talk to to complete those quests"; "act 3 gidbin that quest will have bots talk to several
// npcs"). The game is faked: quest bits per quest id, and what each NPC's talk does to them.
const T = Tests;
let state, talks;

T.setup = function () {
	state = {}; talks = [];
	// [act, quest id, title, NPCs in the order to try, the player chooses the reward]
	const rows = [[3, 19, 'Blade of the Old Religion', ['ormus', 'asheara'], false], [1, 5, 'Tools of the Trade', ['charsi'], true], [4, 27, "Hell's Forge", ['cain', 'tyrael'], false]];
	globalThis.QuestTable = {npcQuests: function () { return rows; }};
	globalThis.Quester = {note: function (m) { World.log.push(m); }, problem: function (m) { World.log.push('problem: ' + m); }, invItem: function () { return false; }, actOpen: function () { return true; },
		getQuestProgress: function (id) { return (state[id] || 0) & 1 ? 100 : 0; }, townStartedOnly: false,
		quests: [[3, 2, 'Blade of the Old Religion', 19, 'act3_blade', false], [1, 5, 'Tools of the Trade', 5, 'act1_tools', true], [4, 2, "Hell's Forge", 27, 'act4_forge', false]],
		act3_blade: function () {}, act1_tools: function () {}, act4_forge: function () {}};
	globalThis.QuestItems = {find: function () { return null; }, useAll: function () { return 0; }, hasConsumable: function () { return false; }, makeRoom: function () {}};
	globalThis.Saver = {soon: function () {}};
	globalThis.sendPacket = function () {};
	me.inTown = true; me.area = 75; // Act 3 (the harness works out me.act from the area: 1, 40, 75, 103, 109 are the towns)
	me.getQuest = function (id, bit) { return ((state[id] || 0) >> bit) & 1; };
	World.load('common/QuestNpcs.js');
	// the game: a talk to an NPC does what the test says (nothing by default)
	Quester.talkToQuestNpc = function (name) { talks.push(name); if (Quester.effect) Quester.effect(name); return true; };
};

T.test('a reward waiting for a two-NPC quest (Gidbinn): the first NPC is talked to; when he finishes it the second is not', function () {
	state[19] = 2; // reward pending
	Quester.effect = function (name) { if (name === 'ormus') state[19] = 1; }; // Ormus completes it
	Quester.questNpcs();
	T.eq(talks.join(','), 'ormus', 'only Ormus');
	T.eq(state[19], 1, 'done');
});

T.test('a reward waiting for a two-NPC quest: when the first does not finish it the next NPC is tried, and it ends when the quest does', function () {
	state[19] = 2;
	Quester.effect = function (name) { if (name === 'asheara') state[19] = 1; }; // only Asheara completes it
	Quester.questNpcs();
	T.eq(talks[talks.length - 1], 'asheara', 'the last talk is Asheara');
	T.ok(talks.indexOf('ormus') > -1 && talks.indexOf('ormus') < talks.indexOf('asheara'), 'Ormus first, then Asheara: ' + talks.join(','));
	T.eq(state[19], 1, 'done');
});

T.test('a quest nobody can finish is not talked about for ever: two sessions per game, then no more', function () {
	state[19] = 2;
	Quester.questNpcs();
	const n = talks.length;
	T.ok(n > 0, 'it tried');
	Quester.questNpcs();
	T.eq(talks.length, n, 'a second call talks to nobody');
});

T.test('a reward only the player can choose (Charsi, Larzuk) is never talked to, and is said once', function () {
	me.area = 1;
	state[5] = 2;
	Quester.questNpcs();
	T.eq(talks.length, 0, 'nobody');
	T.has(World.log, 'talk to them yourself', 'says so');
});

T.test('a quest of another act\'s town is for that town: nothing here', function () {
	me.area = 75;
	state[27] = 2; // Hell's Forge, reward waiting, but this is the Act 3 town
	Quester.questNpcs();
	T.eq(talks.length, 0);
});

T.test('nothing waiting: nobody is talked to, and a quest that is done is no reason', function () {
	state[19] = 1; // complete
	Quester.questNpcs();
	T.eq(talks.length, 0);
	T.eq(Quester.questPending(19), false);
});

T.test('townQuestsOpen: a reward waiting in this town opens the follower\'s talk, once every two minutes; not a manual one, not another town\'s', function () {
	state[19] = 2;
	T.eq(Quester.townQuestsOpen(), true, 'the Act 3 quest is waiting');
	Quester.pendingTalkAt[19] = Date.now(); // the follower has just talked
	T.eq(Quester.townQuestsOpen(), false, 'not again at once');
	World.advance(121000);
	T.eq(Quester.townQuestsOpen(), true, 'after two minutes');
	state[19] = 1;
	T.eq(Quester.townQuestsOpen(), false, 'done');
	me.area = 1; state[5] = 2;
	T.eq(Quester.townQuestsOpen(), false, 'Tools of the Trade is a manual reward');
	me.area = 103; state[27] = 2;
	T.eq(Quester.townQuestsOpen(), true, 'Hell\'s Forge in the Act 4 town (the live case)');
});

T.run();
