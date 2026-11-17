// Tests of Item.cubeTakesPickup and Item.cursorToCube (libs/common/Misc.js): a pickup that does not fit in the pack goes into the Horadric Cube (the user, 2026-11-16: "bots can
// use their cube to pickup stuff"), with a notice line the first time, and an item that cannot be put there is dropped, never left on the cursor. The game is faked.
const T = Tests;
let cursor, cubeFree, cubeOpens, moves, packItems;

T.setup = function () {
	cursor = null; cubeFree = true; cubeOpens = true; moves = []; packItems = [];
	me.area = 102; me.inTown = false; me.name = 'Meir'; me.itemoncursor = false;
	me.getItem = function (id) { return id === 549 ? {classid: 549} : null; };
	me.cancel = function () {};
	globalThis.getUnit = function (t) { return t === 100 ? cursor : null; };
	globalThis.Storage = {
		Reload: function () {},
		Inventory: {width: 10, height: 4},
		Cube: {
			CanFit: function () { return cubeFree; },
			MoveTo: function (it) { moves.push(it.name); if (!cubeFree) return false; cursor = null; me.itemoncursor = false; return true; }
		}
	};
	globalThis.Cubing = {openCube: function () { return cubeOpens; }};
	me.findItems = function () { return packItems; };
	World.load('common/Misc.js');
	Item.fullPackSaid = false;
	Item.tripItem = function (it) { return !!it.goes; };   // goes: a town visit stashes or sells it
	Item.userOwned = function (it) { return !!it.charm; };  // a charm, a tome ... stays
};

// fills the whole 10x4 pack with 1x4 items; goes = true: they are for the stash or the shop, false: they stay
function fillPack(goes) {
	packItems = [];
	for (let x = 0; x < 10; x += 1) packItems.push({x: x, y: 0, sizex: 1, sizey: 4, goes: goes});
}

function onCursor(gid, name) {
	cursor = {gid: gid, name: name, drop: function () { cursor = null; me.itemoncursor = false; World.log.push('dropped ' + name); }};
	me.itemoncursor = true;
}

T.test('the cube takes a pickup when it is in the pack, in the field and has a spot (infinite stash on or off does not matter)', function () {
	globalThis.Config = {InfiniteStash: true};
	T.ok(Item.cubeTakesPickup({name: 'Glaive'}), 'yes');
	cubeFree = false;
	T.ok(!Item.cubeTakesPickup({name: 'Glaive'}), 'no spot: no');
	cubeFree = true; me.area = 75; me.inTown = true;
	T.ok(!Item.cubeTakesPickup({name: 'Glaive'}), 'in town: no');
});

T.test('an item on the cursor goes into the cube, and the notice is printed once per game, when the pack is full of what stays', function () {
	fillPack(false);
	onCursor(7, 'Glaive');
	T.ok(Item.cursorToCube(7, 'Glaive', {sizex: 2, sizey: 3}));
	T.eq(moves.join(','), 'Glaive');
	T.eq(me.itemoncursor, false, 'cursor empty');
	T.ok(World.log.some(function (l) { return /Pack: NOTICE: Meir has a full inventory/.test(l); }), 'notice');
	T.ok(World.log.some(function (l) { return /Take a look at Meir's inventory/.test(l); }), 'tells what to do');
	World.log.length = 0;
	onCursor(8, 'Hatchet');
	T.ok(Item.cursorToCube(8, 'Hatchet', {sizex: 2, sizey: 3}));
	T.ok(!World.log.some(function (l) { return /Pack: NOTICE/.test(l); }), 'not again');
});

T.test('a cube that will not open: the item is dropped, not kept in the hand', function () {
	cubeOpens = false;
	onCursor(9, 'Casque');
	T.ok(!Item.cursorToCube(9, 'Casque'));
	T.eq(me.itemoncursor, false, 'cursor empty');
	T.has(World.log, 'dropped Casque');
	T.ok(!World.log.some(function (l) { return /Pack: NOTICE/.test(l); }), 'no notice: nothing went into the cube');
});

T.test('a cube that takes nothing: the item is dropped', function () {
	cubeFree = false;
	onCursor(10, 'Helm');
	T.ok(!Item.cursorToCube(10, 'Helm'));
	T.has(World.log, 'dropped Helm');
});

T.test('the item is not on the cursor (it went into the pack after all): nothing to do, no notice', function () {
	cursor = null;
	me.getItem = function (id, a, gid) { return gid === 11 ? {gid: 11} : (id === 549 ? {classid: 549} : null); };
	T.ok(Item.cursorToCube(11, 'Ring'));
	T.eq(moves.length, 0);
});

T.test('a pack full of what a town visit stashes or sells is a passing state: the item goes into the cube, but no alert', function () {
	fillPack(true);
	onCursor(12, 'Glaive');
	T.ok(Item.cursorToCube(12, 'Glaive', {sizex: 2, sizey: 3}));
	T.ok(!World.log.some(function (l) { return /Pack: NOTICE/.test(l); }), 'no notice');
	T.eq(Item.fullPackSaid, undefined === Item.fullPackSaid ? undefined : false, 'not marked as said, a later check may still fire');
	fillPack(false);
	onCursor(13, 'Hatchet');
	Item.cursorToCube(13, 'Hatchet', {sizex: 2, sizey: 3});
	T.ok(World.log.some(function (l) { return /Pack: NOTICE: Meir has a full inventory/.test(l); }), 'the alert once what stays fills the pack');
});

T.test('a pack with a free strip the size of the item that did not fit is not full of what stays', function () {
	fillPack(false);
	packItems.pop(); // one column of 1x4 free: a 1x4 item fits, a 2x3 does not
	T.ok(!Item.packStaysFull({sizex: 1, sizey: 4}), 'a 1x4 fits');
	T.ok(Item.packStaysFull({sizex: 2, sizey: 3}), 'a 2x3 does not');
});

T.run();
