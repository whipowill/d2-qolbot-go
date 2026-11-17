// Tests of the three mod modules (libs/common/PlugY.js, Qol.js): every command the bots send to PlugY or to QOL.dll goes through them, and each does nothing, and says so
// once, when "Using PlugY?" / "Using QOL?" is off (the user, 2026-11-16: "put those in separate classes so they can be controlled").
const T = Tests;
T.setup = function () { World.load('common/PlugY.js'); World.load('common/Qol.js'); globalThis.clicks = []; globalThis.sendClick = function (x, y) { clicks.push([x, y]); }; globalThis.Storage = {Reload: function () {}}; me.findItems = function () { return []; }; me.screensize = 0; };

T.test('PlugY on: /save, and a new stash page is /insertpage, /swappage 1 and the click on the first page button, in that order', function () {
	Config.UsesPlugy = true;
	T.eq(PlugY.save(), true);
	T.eq(World.said.join('|'), '/save');
	World.said.length = 0;
	T.eq(PlugY.newStashPage(), true);
	T.eq(World.said.join('|'), '/insertpage|/swappage 1');
	T.eq(JSON.stringify(clicks), '[[159,402]]', 'the first page button, measured on a bot window');
	T.has(World.log, 'a new page is page 1 and in view');
});

T.test('PlugY on: a page that is not empty after the click is reported', function () {
	Config.UsesPlugy = true;
	me.findItems = function () { return [{}]; };
	T.eq(PlugY.newStashPage(), false);
	T.has(World.log, 'the page in view is not empty');
});

T.test('PlugY off: nothing is sent or clicked, and it says so once per command', function () {
	Config.UsesPlugy = false;
	T.eq(PlugY.save(), false);
	T.eq(PlugY.save(), false);
	T.eq(PlugY.newStashPage(), false);
	T.eq(World.said.length, 0, 'nothing said');
	T.eq(clicks.length, 0, 'nothing clicked');
	T.eq(World.log.filter(function (l) { return l.indexOf('/save is not sent') > -1; }).length, 1, 'said once');
});

T.test('PlugY: a config that says nothing means on (as before)', function () {
	delete Config.UsesPlugy;
	T.eq(PlugY.enabled(), true);
});

T.test('QOL on: .reset stats and .reset skills, and the mercenary options count', function () {
	Config.UsesQol = true;
	T.eq(Qol.resetStats(), true);
	T.eq(Qol.resetSkills(), true);
	T.eq(World.said.join('|'), '.reset stats|.reset skills');
	T.eq(Qol.mercEquip(true), true);
	T.eq(Qol.mercDropOnHire(true), true);
	T.eq(Qol.mercEquip(false), false);
});

T.test('QOL off: nothing is sent and the mercenary options are off, even when the plan has them', function () {
	Config.UsesQol = false;
	T.eq(Qol.resetStats(), false);
	T.eq(Qol.resetSkills(), false);
	T.eq(World.said.length, 0);
	T.eq(Qol.mercEquip(true), false);
	T.eq(Qol.mercDropOnHire(true), false);
	T.has(World.log, '.reset stats is not sent');
});

T.run();
