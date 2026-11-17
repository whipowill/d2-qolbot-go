// Tests of Chores.tune (libs/common/Chores.js): how many spare potions a character carries beyond its belt. The user, 2026-11-16: "the only players who should be filling
// their inventory with spares are low level char, so over time the allowed spares should drift to zero"; ".deposit function only removes rejuv potions" (no Quartermaster exception).
const T = Tests;
let rows;

T.setup = function () {
	rows = 1;
	me.charlvl = 5; me.classid = 3; me.diff = 0;
	globalThis.Config = {MinColumn: [0, 0, 0, 0], BeltColumn: ['hp', 'hp', 'mp', 'mp'], UsesQuartermaster: false};
	globalThis.Storage = {BeltSize: function () { return rows; }};
	globalThis.Throttle = {due: function () { return false; }};
	World.load('common/Chores.js');
};

function spares() { Chores.tune(); return Config.HPBuffer + '/' + Config.MPBuffer; }

T.test('a low level character with a tiny belt carries spares', function () {
	T.eq(spares(), '4/2');
	rows = 2;
	T.eq(spares(), '2/1');
});

T.test('the spares drift to zero with the level, 12 and under keep all of them, 30 and over none', function () {
	rows = 1;
	me.charlvl = 12; T.eq(spares(), '4/2');
	me.charlvl = 21; T.eq(spares(), '2/1', 'half way');
	me.charlvl = 29; T.eq(spares(), '0/0', 'almost none');
	me.charlvl = 30; T.eq(spares(), '0/0');
	me.charlvl = 80; T.eq(spares(), '0/0');
});

T.test('a belt of three rows or more carries none, at any level', function () {
	rows = 3; me.charlvl = 5; T.eq(spares(), '0/0');
	rows = 4; T.eq(spares(), '0/0');
});

T.test('Quartermaster changes nothing: .deposit takes only rejuvenation potions', function () {
	rows = 1; me.charlvl = 5;
	Config.UsesQuartermaster = true;
	T.eq(spares(), '4/2');
});

T.run();
