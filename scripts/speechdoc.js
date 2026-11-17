// Writes docs/SPEECH.md: everything the bots may say in the public chat, read from libs/common/Speech.js (and the banter quote counts).
// Run by scripts/speechdoc.sh from the repository root.
const GLib = imports.gi.GLib;

function read(rel) {
	const [ok, bytes] = GLib.file_get_contents(GLib.get_current_dir() + '/' + rel);
	if (!ok) throw new Error('cannot read ' + rel);
	return new TextDecoder('iso-8859-1').decode(bytes);
}

globalThis.Config = {};
(0, eval)(read('d2bs/kolbot/libs/common/Speech.js'));

// a pattern as a reader would see the line: (\d+) -> N, (.+) -> ..., (a|b) -> a/b
function shown(re) {
	let s = re.source.replace(/^\^/, '').replace(/\$$/, '').replace(/\(\?:/g, '(');
	s = s.replace(/\\\(/g, '\u0001').replace(/\\\)/g, '\u0002').replace(/\\(.)/g, '$1'); // escaped characters first: they are text
	s = s.replace(/\(\\d\+ monsters\?\)|\(d\+ monsters\?\)/g, 'N monsters').replace(/\(d\+?\)/g, 'N')
		.replace(/\(\.\+\)|\(\.\*\)|\.\*|\.\+/g, '…')
		.replace(/\(([^()]*)\)\?/g, '[$1]')
		.replace(/\(([^()]+)\)/g, function (all, x) { return x.split('|').join(' / '); });
	return s.replace(/\u0001/g, '(').replace(/\u0002/g, ')').replace(/…+/g, '…');
}

function phr(p) { return p.replace(/\$(\d)/g, '‹$1›').replace(/\{n\}/g, '‹n›'); }

const kindName = {task: '"Bots report when they engage in tasks"', problem: '"Bots report when they have a problem"'};
const out = [];
out.push('# What the bots say');
out.push('');
out.push('Made by `scripts/speechdoc.sh` from `d2bs/kolbot/libs/common/Speech.js`: change the phrasings there, then run it again. Every line has at');
out.push('least three phrasings, and the bot picks one at random each time (checked by `scripts/jstest/speech_test.js`).');
out.push('');
out.push('The bots do not coordinate in the public chat. They post keywords to each other in `data/<bot>.tmsg.json` (Team.post / command / take in');
out.push('`libs/common/Team.js`). What they say in chat is only for the player, and no bot reads it.');
out.push('');
out.push('When a line is said:');
out.push('');
out.push('- **task**: only with "Bots report when they engage in tasks" on.');
out.push('- **problem**: only with "Bots report when they have a problem" on.');
out.push('- **reply**: always, when a player typed a command in chat. When the leader bot sent the command, the reply counts as a task.');
out.push('');
out.push('## Answers to the team');
out.push('');
out.push('Each answer posts its keyword to the team, then says one of its phrasings when the setting allows. ‹n› is the place or waypoint.');
out.push('');
Object.keys(Speech.answers).forEach(function (k) {
	const a = Speech.answers[k];
	out.push('### ' + k + ' (keyword `' + a.w + '`, ' + a.kind + ')');
	out.push('');
	a.say.forEach(function (p) { out.push('- ' + phr(p)); });
	out.push('');
});
out.push('## Reports and replies');
out.push('');
out.push('The log line stays as the script wrote it (Qolbot\'s Activity tab reads it). The chat gets one of the phrasings. ‹1›, ‹2› … are the');
out.push('parts of the report line marked … or N. A line that no rule knows is said as it is, or after "Hear me:" or "Mark this:".');
out.push('');
let section = '';
const src = read('d2bs/kolbot/libs/common/Speech.js').split('\n');
const heads = [];
src.forEach(function (l) { const m = /^\t\t\/\/ (.+)$/.exec(l); if (m && !/^\(/.test(m[1])) heads.push(m[1]); });
let hi = 0;
const firsts = {
	'quests and the team': /is complete/, 'the follower\'s way': /^\^Ready/, 'the pack and the stash': /No room to make way/,
	'trouble on the way': /cannot follow you/, 'Baal and Diablo announcements (Config.PublicMode): for players who come along, not for the bots': /Hot TP/,
	'replies to a player\'s own chat commands': /Teleport/, 'anything else: said as it is, or with one of two plain lead-ins (still three ways)': /^\^\(\.\+\)\$$/
};
Speech.rules.forEach(function (r) {
	Object.keys(firsts).forEach(function (h) {
		if (firsts[h].test(r[0].source) && section !== h) {
			section = h;
			const title = h.split(':')[0].split(' (')[0];
			out.push('### ' + title.charAt(0).toUpperCase() + title.slice(1));
			out.push('');
		}
	});
	if (section.indexOf('anything else') === 0) return;
	out.push('**' + shown(r[0]).replace(/\*/g, '\\*') + '**');
	out.push('');
	r[1].forEach(function (p) { out.push('- ' + phr(p)); });
	out.push('');
});
const q = JSON.parse(read('d2bs/kolbot/libs/config/Quotes/quotes.json'));
out.push('## Banter');
out.push('');
out.push('With "Dark quotes" on (`Config.DarkQuotes`), a bot sometimes says a quote from `libs/config/Quotes/quotes.json`. In town it says one every');
out.push('15 to 75 seconds, from ' + q.town.length + ' town quotes. Outside town it says one every 1 to 3 minutes, from ' + q.combat.length + ' combat quotes.');
out.push('They are too many to list here.');
out.push('');
out.push('## Not covered here');
out.push('');
out.push('The stock kolbot scripts the team does not run (Rusher, Rushee, Synch, SealLeader, the MF leader calls in Mephisto, Andariel, Duriel and');
out.push('Cows with `Config.MFLeader` on) still say their own words in chat, unchanged.');
out.push('');
const file = Gio_write('docs/SPEECH.md', out.join('\n'));
function Gio_write(p, t) { GLib.file_set_contents(GLib.get_current_dir() + '/' + p, new TextEncoder().encode(t)); print('wrote ' + p + ' (' + out.length + ' lines)'); }
