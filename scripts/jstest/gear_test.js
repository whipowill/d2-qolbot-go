// Tests of libs/common/Gear.js: auto-equip scores by BUILD, not class (the user, 2026-11-15: "a paladin can play as either a melee or a magic build").
const T = Tests;
T.setup = function () { World.load('common/Gear.js'); };

const CLASS = {Amazon: 0, Sorceress: 1, Necromancer: 2, Paladin: 3, Barbarian: 4, Druid: 5, Assassin: 6};
function as(cls, spec, hard) { // play a character of this class and build; hard: skill id -> hard points
	__plan = {class: cls, spec: spec};
	me.classid = CLASS[cls];
	me.getSkill = function (id) { return (hard || {})[id] || 0; };
}
// a fake item: type, stats {id: value} or {id: {sub: value}}, ethereal
function item(type, stats, eth) {
	stats = stats || {};
	const get = function (id, sub) { const v = stats[id]; if (v === undefined) return 0; if (typeof v === 'object') return v[sub] || 0; return v; };
	return {itemType: type, getStatEx: get, getStat: get, getFlag: function (f) { return f === 0x400000 ? !!eth : false; }};
}
const sword = item(30, {21: 10, 22: 30});                        // a one-handed sword: 10-30
const greatSword = item(30, {21: 12, 22: 34, 23: 30, 24: 70});   // one-or-two-handed (a Barbarian holds it in one)
const greatAxe = item(28, {23: 30, 24: 80});                     // two-handed only
const axe = item(28, {21: 8, 22: 32});
const scepterSkills = item(24, {21: 4, 22: 10, 83: {3: 2}, 188: {24: 2}});
const bow = item(27, {21: 6, 22: 20});
const shield = item(2, {31: 40, 20: 30, 39: 10});
const resShield = item(2, {31: 40, 20: 30, 39: 10, 21: 20, 22: 40});
const orb = item(68, {105: 20, 127: 1});
const staff = item(26, {23: 3, 24: 9, 188: {10: 3}});
const boots = item(15, {31: 10, 21: 20, 22: 40});
const plainBoots = item(15, {31: 10});

T.test('a Hammerdin is a caster: +skills beat damage, and no bows', function () {
	as('Paladin', 'Hammerdin');
	T.ok(qolgear.tier(scepterSkills) > qolgear.tier(sword) * 2, 'scepter of skills ' + qolgear.tier(scepterSkills) + ' vs sword ' + qolgear.tier(sword));
	T.eq(qolgear.tier(bow), 0, 'no bow');
	T.ok(qolgear.tier(shield) > 0, 'shield');
});

T.test('a Zealot fights with a one-handed weapon and a shield: weapon damage counts, two-handed ones do not', function () {
	as('Paladin', 'Zeal');
	T.ok(qolgear.tier(sword) > 1500, 'sword damage counts: ' + qolgear.tier(sword));
	T.eq(qolgear.tier(greatAxe), 0, 'no two-handed axe');
	T.eq(qolgear.tier(greatSword), 0, 'a Paladin cannot hold a great sword in one hand');
	T.ok(qolgear.tier(shield) > 0);
});

T.test('a Smiter counts the shield damage', function () {
	as('Paladin', 'Smiter');
	const s = qolgear.tier(resShield);
	as('Paladin', 'Zeal');
	T.ok(s > qolgear.tier(resShield) + 2000, 'smiter ' + s + ' vs zealot ' + qolgear.tier(resShield));
});

T.test('a Whirlwind Barbarian uses the weapon of his mastery, one or two hands', function () {
	as('Barbarian', 'Whirlwind', {128: 10}); // Axe Mastery
	T.ok(qolgear.tier(axe) > 0 && qolgear.tier(greatAxe) > qolgear.tier(axe), 'axes; the two-handed one hits harder');
	T.eq(qolgear.tier(sword), 0, 'no sword: his points are in axes');
	as('Barbarian', 'Whirlwind', {127: 5}); // Sword Mastery
	T.ok(qolgear.tier(greatSword) > 0 && qolgear.tier(axe) === 0, 'swords now');
	T.ok(!qolgear.twoHanded(greatSword), 'a Barbarian holds a great sword in one hand');
	as('Barbarian', 'Whirlwind');
	T.ok(qolgear.tier(sword) > 0 && qolgear.tier(axe) > 0, 'no mastery yet: any melee weapon');
});

T.test('a Frenzy Barbarian holds a weapon in each hand and no shield', function () {
	as('Barbarian', 'Frenzy', {127: 8});
	T.ok(qolgear.dual(sword), 'a sword may go in the left hand');
	T.ok(qolgear.dual(greatSword) && qolgear.tier(greatSword) > 0, 'a two-handed sword in each hand: a Barbarian holds them in one');
	T.eq(qolgear.tier(shield), 0, 'no shield');
	T.eq(qolgear.tier(greatAxe), 0, 'no two-handed weapon');
	as('Barbarian', 'Whirlwind', {127: 8});
	T.ok(qolgear.dual(sword), 'a Whirlwind Barbarian may hold a second sword (Barabas wore a blade and an axe)');
	T.eq(qolgear.tier(shield), 0, 'a Barbarian holds no shield');
	T.ok(qolgear.tier(greatSword) > 0 && qolgear.twoHanded(item(30, {23: 30, 24: 70})), 'a two-handed sword is fine too');
	as('Barbarian', 'Throw');
	T.eq(qolgear.tier(shield), 0, 'no shield for a thrower either');
	as('Paladin', 'Zeal');
	T.ok(!qolgear.dual(sword), 'a Zealot keeps his shield');
});

T.test('a Bowazon wants a bow and no shield; a Javazon javelins and a shield', function () {
	as('Amazon', 'Bowazon');
	T.ok(qolgear.tier(bow) > 0);
	T.eq(qolgear.tier(shield), 0);
	T.eq(qolgear.tier(sword), 0);
	as('Amazon', 'Javazon');
	T.eq(qolgear.tier(bow), 0);
	T.ok(qolgear.tier(item(44, {21: 6, 22: 20})) > 0 && qolgear.tier(shield) > 0);
	T.ok(qolgear.tier(item(87, {21: 8, 22: 24})) > 0, 'Amazon javelins');
	T.eq(qolgear.tier(item(86, {23: 10, 24: 30})), 0, 'no Amazon spear: Lightning Fury is thrown');
	as('Amazon', 'Bowazon');
	T.ok(qolgear.tier(item(85, {21: 8, 22: 24})) > 0, 'Amazon bows');
	T.eq(qolgear.tier(item(87, {21: 8, 22: 24})), 0, 'no javelins for a Bowazon');
	__plan = null; me.classid = 0;
	T.ok(qolgear.tier(item(86, {23: 10, 24: 30})) > 0, 'no plan: her spears count too');
});

T.test('a Kick Assassin counts the boots, not the claws\' damage', function () {
	as('Assassin', 'Kick');
	T.ok(qolgear.tier(boots) > qolgear.tier(plainBoots) + 1000, 'kick boots ' + qolgear.tier(boots) + ' vs ' + qolgear.tier(plainBoots));
	const claw = item(67, {21: 20, 22: 60});
	T.eq(qolgear.tier(claw), 1, 'claw damage is worth nothing to a kicker');
	as('Assassin', 'Trapsin');
	T.eq(qolgear.tier(boots), qolgear.tier(plainBoots) + 0, 'a trapper does not kick');
});

T.test('a Sorceress may use a staff of her tree; the right tree counts', function () {
	as('Sorceress', 'FrozenOrb');
	const cold = qolgear.tier(staff);
	as('Sorceress', 'Lightning');
	T.ok(cold > qolgear.tier(staff) + 1500, 'cold skills count for the Frozen Orb: ' + cold + ' vs ' + qolgear.tier(staff));
	T.ok(qolgear.tier(orb) > 0);
});

T.test('another class\'s gear, ethereal gear and charms are worth nothing', function () {
	as('Sorceress', 'FrozenOrb');
	T.eq(qolgear.tier(item(72, {127: 2})), 0, 'a druid pelt');
	T.eq(qolgear.tier(item(37, {127: 1}, true)), 0, 'ethereal');
	T.ok(qolgear.tier(item(37, {127: 1, 152: 1}, true)) > 0, 'ethereal but indestructible');
	T.eq(qolgear.tier(item(82, {127: 1})), 0, 'a charm');
});

T.test('no plan: by class', function () {
	__plan = null;
	me.classid = 1;
	me.getSkill = function () { return 0; };
	T.ok(qolgear.tier(orb) > 0 && qolgear.tier(bow) === 0);
});

T.test('each class ranks its own class gear, and only that class', function () {
	const own = [ // [class, spec, item type, what]
		['Paladin', 'Zeal', 70, 'Paladin shield'], ['Paladin', 'Hammerdin', 70, 'Paladin shield'], ['Paladin', 'Smiter', 70, 'Paladin shield'],
		['Necromancer', 'Summon', 69, 'Necromancer head'], ['Barbarian', 'Whirlwind', 71, 'Barbarian helm'], ['Druid', 'Summon', 72, 'Druid pelt'],
		['Sorceress', 'FrozenOrb', 68, 'Sorceress orb'], ['Assassin', 'Kick', 67, 'claw'], ['Amazon', 'Bowazon', 85, 'Amazon bow'], ['Amazon', 'Javazon', 87, 'Amazon javelin']
	];
	own.forEach(function (o) {
		as(o[0], o[1]);
		T.ok(qolgear.tier(item(o[2], {39: 20, 31: 50, 21: 5, 22: 15})) > 1, o[0] + ' ' + o[1] + ': ' + o[3]);
		as(o[0] === 'Paladin' ? 'Sorceress' : 'Paladin', o[0] === 'Paladin' ? 'FrozenOrb' : 'Zeal');
		T.eq(qolgear.tier(item(o[2], {39: 20, 31: 50, 21: 5, 22: 15})), 0, 'another class: no ' + o[3]);
	});
	as('Paladin', 'Zeal');
	T.ok(qolgear.tier(item(70, {39: 30, 41: 30, 43: 30, 45: 30, 31: 60, 20: 40})) > qolgear.tier(item(2, {31: 60, 20: 40})), 'a Paladin shield\'s resistances count');
});

Tests.run();
