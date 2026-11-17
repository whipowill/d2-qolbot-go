// Tests of libs/common/Speech.js: every public phrase has at least three phrasings (the user, 2026-11-15), the report lines the scripts make are
// known to a rule of their own, and the settings decide what is said.
const T = Tests;
T.setup = function () { World.load('common/Team.js'); World.load('common/Speech.js'); };

T.test('every answer and every rule has at least three different phrasings', function () {
	Object.keys(Speech.answers).forEach(function (k) {
		const say = Speech.answers[k].say;
		T.ok(say.length >= 3 && new Set(say).size === say.length, k + ' has ' + say.length);
		T.ok(/^[a-z]+$/.test(Speech.answers[k].w), k + ': the keyword is one lower-case word');
	});
	Speech.rules.forEach(function (r) {
		T.ok(r[1].length >= 3 && new Set(r[1]).size === r[1].length, String(r[0]) + ' has ' + r[1].length);
	});
});

// what the scripts say (Report.note / problem, Speech.task / problem / reply): each must have a rule of its own, not the catch-all
const samples = [
	'Act 2 - #3 - "The Horadric Staff" is complete.',
	'The team is split up (Sankt apart, regroup no. 2). Going to town so we all meet.',
	'Not everybody came to town within 90 seconds. Going on.',
	'Starting with 2 of the team not in my party yet.',
	'Starting without Sankt, Meir: they did not join in 3 minutes.',
	'Waiting for my team: 3 of 5 in the game (not yet: Sankt, Meir).',
	"Syncing the team's waypoints before we begin (3 to share, 1 to fetch).",
	'all in sync (Sankt, Meir)',
	'Waypoints synced (3 of 3 shared, 1 of 1 fetched) with Sankt',
	'No room to make way for the Horadric Cube (Short Sword is in the way).',
	'I have 3 keeper(s) in my pack. Moving them to my stash.',
	'I could not open my stash, so my pack stays as it is.',
	'My stash is full. Adding a stash page.',
	'I cannot do this: my stash is full and I cannot make room (adding stash pages is off). Stopping.',
	'Done. Moved 3 item(s) to my stash.',
	'I could only move 2 of 3 item(s) to my stash.',
	'My objective is Level but there is nothing for me to run: choose the farm runs (or Quest) on the Bots tab.',
	'I could not take my stat points back.',
	'I could not take my skill points back.',
	'Opening portal to the Pit.',
	'Opening portal to the waypoint.',
	'Getting the Horadric Cube.', 'Equipping Short Sword.',
	"Making Kalim's Will.",
	'Act change failed.',
	'Teleport on.', 'Attack off.', 'Resuming.', 'Stopping.', 'Saved.', 'Saving.', 'Idle.',
	'Active aura is: 122', 'Attack skill is: 151', "I don't have that aura.", "I'm not in town!", 'No NPC name given.', 'Invalid NPC.', 'NPC not found.',
	'Failed to move to town spot.', 'Done talking.', 'Switching leader to Sankt.', 'Leader not found.', "I'm alive!", 'Failed to use cow portal.',
	'Reloading.', 'Picking items.', 'Going outside.', 'Going to town.', "Going to leader's town.", 'No TP scrolls or tomes.'
];

T.test('every report line the scripts make has a rule of its own', function () {
	const last = Speech.rules[Speech.rules.length - 1][0];
	samples.forEach(function (s) {
		const r = Speech.rules.find(function (x) { return x[0].test(s); });
		T.ok(r && r[0] !== last, 'no rule for: ' + s);
	});
});

T.test('flavor fills in the pieces and leaves no $', function () {
	samples.forEach(function (s) {
		for (let i = 0; i < 6; i++) {
			const out = Speech.flavor(s);
			T.ok(out.length > 0 && !/\$\d/.test(out), s + ' -> ' + out);
		}
	});
	T.ok(Speech.flavor('Starting without Sankt: they did not join in 3 minutes.').indexOf('Sankt') > -1, 'the name stays');
});

T.test('say: the keyword always goes to the team; the words only when the setting allows', function () {
	Config.QuietProblems = true;
	Speech.say('noGet', 'andy');
	let log = JSON.parse(World.files['data/Xena.tmsg.json']);
	T.eq(log.msgs[0].w, 'noget');
	T.eq(log.msgs[0].a[0], 'andy');
	T.eq(World.said.length, 0, 'problems off: nothing said');
	Config.QuietProblems = false;
	Speech.say('noGet');
	T.eq(World.said.length, 1, 'problems on: said');
	T.ok(Speech.answers.noGet.say.indexOf(World.said[0]) > -1);
});

T.test('task words follow "Bots report when they engage in tasks"; replies to a player always', function () {
	Config.QuietChat = true;
	Speech.task('Going outside.');
	T.eq(World.said.length, 0, 'tasks off');
	Speech.say('portalOpen'); // "the portal is open" is always said, over the head (the user, 2026-11-15)
	T.eq(World.said.length, 1, 'the portal announcement is said with tasks off');
	T.ok(World.said[0].charAt(0) === '!', 'the portal announcement is a bubble: ' + World.said[0]);
	Speech.reply('Teleport on.');
	T.eq(World.said.length, 2, 'a reply to a player is said');
	Speech.fromLog = true;
	Speech.reply('Teleport on.');
	Speech.fromLog = false;
	T.eq(World.said.length, 2, 'an answer to a bot command is a task: not said');
	Config.QuietChat = false;
	Speech.task('!Picking items.');
	T.ok(World.said[2].charAt(0) === '!', 'the over-the-head mark stays: ' + World.said[2]);
});

T.test('hasWaypoint fills in the area', function () {
	Config.QuietChat = false;
	Speech.say('hasWaypoint', 35);
	T.ok(World.said[0].indexOf('35') > -1, World.said[0]);
	T.eq(JSON.parse(World.files['data/Xena.tmsg.json']).msgs[0].w, 'haswp');
});

Tests.run();
