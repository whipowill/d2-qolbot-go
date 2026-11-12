// Run by scripts/jsmoke.py in headless Firefox with the D2BS globals mocked (print, say, me, Config, Storage, Town ...).
// Every check prints PASS or FAIL. The new libs/common modules are loaded as they are on disk.
var out=[],fail=0;
function ok(c,msg){ out.push((c?"PASS  ":"FAIL  ")+msg); if(!c) fail++; }
var printed=[],said=[],T=1000000,files={"data/Bot.spec.json":JSON.stringify({autoSaveMinutes:2,storage:{clearOnLoad:false}}),"data/bots.json":JSON.stringify({bots:["Bot","Vanity"],team:["Reform"]})};
var realNow=Date.now; Date.now=function(){return T;};
window.print=function(m){printed.push(m)}; window.say=function(m){said.push(m)}; window.delay=function(){};
window.me={profile:"Bot",name:"Bot",ping:10,gold:5000,classid:1,charlvl:80,area:40,inTown:true,act:2,getStat:function(){return 0}};
window.Config={QuietChat:false,QuietProblems:false,MinColumn:[2,2,2,2],BeltColumn:["hp","mp","mp","rv"],PotionGold:1000,HPBuffer:0,MPBuffer:0,Inventory:null};
window.FileTools={readText:function(p){if(!(p in files))throw new Error("no file");return files[p]},exists:function(p){return p in files}};
window.D2Bot={saved:function(){printed.push("D2Bot.saved")},printToConsole:function(m){printed.push("console:"+m)}};
var party=[{name:"Bot",partyid:7,getNext:function(){return false}}];
window.getParty=function(){var i=0,l=party.map(function(p){return p});var cur=l[0];if(!cur)return null;cur.getNext=function(){i++;cur=l[i];if(!cur)return false;Object.assign(this,cur);return true};return cur};
function reset(){printed.length=0;said.length=0}

// ---- Plan
ok(Plan.read().autoSaveMinutes===2,"Plan.read reads the plan file");
ok(Plan.get().storage.clearOnLoad===false,"Plan.get caches the plan");
files["data/Bot.spec.json"]="{broken"; ok(Plan.read()===null,"a broken plan file reads as null");
files["data/Bot.spec.json"]=JSON.stringify({autoSaveMinutes:2,storage:{clearOnLoad:false}});

// ---- Throttle
ok(Throttle.due("a",1000)===true,"Throttle: first call is due");
ok(Throttle.due("a",1000)===false,"Throttle: second call at once is not");
T+=1000; ok(Throttle.due("a",1000)===true,"Throttle: due again after the period");
Throttle.reset("a"); ok(Throttle.due("a",99999)===true,"Throttle.reset makes it due");

// ---- Report
reset(); Report.note("X","hello"); ok(printed[0]==="X: hello"&&said[0]==="hello","Report.note logs and says");
reset(); Config.QuietChat=true; Report.note("X","hush"); ok(printed[0]==="X: hush"&&said.length===0,"Report.note stays quiet in chat when switched off"); Config.QuietChat=false;
reset(); Report.problem("X","bad"); ok(printed[0]==="X: problem: bad"&&said[0]==="bad","Report.problem logs and says");
reset(); Report.fail("X","cannot"); ok(printed.some(function(l){return l==="X: ERROR: cannot"})&&printed.some(function(l){return l.indexOf("console:Bot: cannot")===0}),"Report.fail logs the error and tells the console");
var o={}; Report.mixin(o,"Obj"); reset(); o.note("n"); o.problem("p"); o.log("l"); ok(printed.join("|")==="Obj: n|Obj: problem: p|Obj: l","Report.mixin gives log/note/problem under the name");

// ---- Saver
ok(Saver.minutes()===2,"Saver.minutes from the plan");
reset(); Saver.now(true); ok(said[0]==="/save"&&printed.indexOf("D2Bot.saved")>-1,"Saver.now says /save and acknowledges");
reset(); Saver.lastSave=T; ok(Saver.auto()===false,"Saver.auto: not yet");
T+=121000; reset(); ok(Saver.auto()===true&&said[0]==="/save"&&printed[0].indexOf("Saver: saving the character (every 2 min)")===0,"Saver.auto saves after the interval");
reset(); ok(Saver.soon("level up")===true&&said[0]==="/save","Saver.soon saves");
reset(); ok(Saver.soon("again")===false&&said.length===0,"Saver.soon is limited to one per 15 s");
T+=16000; reset(); ok(Saver.soon("later")===true,"Saver.soon again after 15 s");

// ---- Team
reset(); party=[{name:"Bot",partyid:7},{name:"Vanity",partyid:7},{name:"Reform",partyid:7}];
ok(Team.wait()===true&&printed.some(function(l){return l.indexOf("Team: the whole team is here")===0}),"Team.wait returns when everybody is in the party");
files["data/bots.json"]=JSON.stringify({bots:[],team:[]}); ok(Team.wait()===true,"Team.wait with nobody to wait for returns at once");

// ---- Chores
reset(); window.Storage={BeltSize:function(){return 4}};
ok(JSON.stringify(Chores.needed(true))==="[\"first visit\"]","Chores.needed(first) is the first visit");
window.Town={needHealing:function(){return false},needRepair:function(){return []},needMerc:function(){return false},needStash:function(){return false},checkScrolls:function(){return 20},getUnids:function(){return false},checkColumns:function(){return [0,0,0,0]},visitTown:function(){},doChores:function(){}};
window.Item={autoEquipCheck:function(){return false},autoMercEquipCheck:function(){return false}};
me.findItems=function(){return []};
ok(Chores.needed(false).length===0,"Chores.needed(false) finds nothing to do for a tidy character");
Town.needHealing=function(){return true}; ok(Chores.needed(false).indexOf("heal")>-1,"Chores.needed names the reason");

// ---- Pack
Pack.lockMatrix({inventory:[10,4]}); ok(Config.Inventory.length===4&&Config.Inventory[0].length===10&&Config.Inventory[3][9]===1,"Pack.lockMatrix builds one entry per cell");
ok(Pack.freePickupArea()===true,"Pack.freePickupArea does nothing when clearOnLoad is false");

// ---- QuestItems
var cells=0; window.Storage.Inventory={CanFit:function(){return cells>=1}};
window.Item.botItems=function(){return []}; window.Cubing={keepItem:function(){return false}}; window.Runewords={keepItem:function(){return false}}; window.CraftingSystem={keepItem:function(){return false}};
window.Pickit={pickItem:function(){return true},checkItem:function(){return {result:0}}}; Town.keepVerdict=function(){return 0}; Item.sellable=function(){return true};
me.getItem=function(){return null};
reset(); ok(QuestItems.find(552)===null&&QuestItems.hasConsumable()===false,"QuestItems.find / hasConsumable with an empty pack");
ok(QuestItems.isProtected({classid:552,code:"x"})&&QuestItems.isProtected({classid:1,code:"pk1"})&&!QuestItems.isProtected({classid:1,code:"x"}),"QuestItems.isProtected");
reset(); cells=0; ok(QuestItems.makeRoom(2,2)===false&&printed.some(function(l){return l==="QuestItems: no room could be made"}),"makeRoom says so when nothing can be freed");
reset(); cells=1; ok(QuestItems.makeRoom(2,2)===true,"makeRoom with room already is true");
ok(QuestItems.pickUp(null,true)==="missing","pickUp of nothing is missing");
reset(); var book={sizex:2,sizey:2,name:"Book"}; ok(QuestItems.pickUp(book,false)==="taken"&&printed.some(function(l){return l==="QuestItems: picking up the Book"}),"pickUp takes an item");
Pickit.pickItem=function(){return false}; ok(QuestItems.pickUp(book,false)==="failed","pickUp reports a failed pickup");
// useAll: a book in the pack that disappears when used
var have=true,gid=5; me.getItem=function(id){if(id===552&&have){return {classid:552,gid:gid,location:3,getNext:function(){return false}}}return null};
window.copyUnit=function(i){return i}; window.clickItem=function(){have=false};
reset(); var used=QuestItems.useAll(); ok(used===1&&printed.some(function(l){return l.indexOf("QuestItems: used the Book of Skill")===0}),"useAll uses the book and logs it");
ok(said.some(function(l){return l==="Used the Book of Skill."}),"useAll tells the player");

// ---- Quester (loads and mixes in)
(0,eval)(QUESTER);
ok(typeof Quester.note==="function"&&typeof Quester.logState==="function","Quester loads with note/problem and logState");
ok(Quester.quests.length===25&&Quester.quests[0].join()==="1,1,Den of Evil,1,act1_den_of_evil,false"&&Quester.npcQuests.length>20,"Quester.quests and npcQuests come from QuestTable.json");
ok(QuestTable.manualIds().join()==="3,35,38"&&Quester.quests.filter(function(q){return q[5]}).length===3,"the manual (choose-the-reward) quests are Charsi, Larzuk and Anya");
reset(); Throttle.reset("questreport"); me.getQuest=function(){return 0}; window.sendPacket=function(){}; Quester.logState(true); ok(printed.some(function(l){return l.indexOf("Quester: quest state: area 40")===0}),"Quester.logState logs the quest state");
reset(); me.getQuest=function(id,i){return i===0||i===15?1:0}; Quester.logBits(9); ok(printed[0]==="Quester: quest 9 bits (0-15): 1000000000000001","Quester.logBits writes the sixteen bits");
// ---- Team.sorcs / chosenSorc, QuickTravel.sorc
function pt(){return Array.prototype.map.call(arguments,function(n){return {name:n,partyid:7,area:1}})}
function plan(o){files["data/Bot.spec.json"]=JSON.stringify(o);Plan.cached=null}
me.classid=3; me.getSkill=function(){return 0};
files["data/bots.json"]=JSON.stringify({bots:["Bot","Sorca","Zed"],team:[],sorcs:["Zed","Sorca"]});
party=pt("Bot","Sorca","Zed");
ok(Team.sorcs().join()==="Sorca,Zed"&&Team.chosenSorc()==="Sorca","chosenSorc: the first Sorceress by name, the same answer for every bot");
party=pt("Bot","Zed"); ok(Team.chosenSorc()==="Zed","chosenSorc: one that is not in the game is not chosen");
party=pt("Bot"); ok(Team.chosenSorc()===null,"chosenSorc: no Sorceress in the game");
party=pt("Bot","Sorca","Zed");
plan({goal:"Farm"}); ok(QuickTravel.sorc()===null,"the setting off: never used, not even in farm mode");
plan({teleportTeam:true,goal:"Farm"}); ok(QuickTravel.sorc()==="Sorca","farm mode with the setting on");
plan({teleportTeam:true,goal:"Farm",questClearAll:true}); ok(QuickTravel.sorc()==="Sorca","farm mode: Full Clear does not matter");
plan({teleportTeam:true,goal:"Quest",questClearAll:false}); ok(QuickTravel.sorc()==="Sorca","quest mode: setting on, Full Clear off");
plan({teleportTeam:false,goal:"Quest",questClearAll:false}); ok(QuickTravel.sorc()===null,"quest mode: setting off");
plan({teleportTeam:true,goal:"Quest",questClearAll:true}); ok(QuickTravel.sorc()===null,"quest mode: Full Clear on");
plan({teleportTeam:true,questClearAll:false}); ok(QuickTravel.sorc()===null,"no objective (a follower of a player): not used");
plan({teleportTeam:true,goal:"Farm"}); party=pt("Bot"); ok(QuickTravel.sorc()===null,"no Sorceress in the game: not used");
party=pt("Bot","Sorca");
plan({teleportTeam:true,goal:"Farm"}); me.classid=1; me.getSkill=function(){return 1}; ok(QuickTravel.sorc()===null,"a Sorceress leader teleports itself");
me.classid=3; me.getSkill=function(){return 0};
// portalFromSorc: the request has no name; no answer in time -> false and not asked again
plan({teleportTeam:true,goal:"Farm"}); reset(); var asked=0; window.say=function(m){said.push(m);if(m==="portal andy")asked++}; window.addEventListener=function(){}; window.removeEventListener=function(){};
var wentTo=0; window.Town.goToTown=function(act){wentTo=act;me.act=act}; me.act=4;
ok(QuickTravel.portal("andy",37)===false&&asked===1,"portalFromSorc asks with \"portal andy\" (no name) and gives up without an answer");
ok(wentTo===1,"portalFromSorc first goes to the town of the boss's act (Act 1 for Andariel), not the town it happens to be in");
ok(QuickTravel.portal("andy",37)===false&&asked===1,"and does not ask again this game");
// portalFromSorc: she answers, her portal is found on the third look (it was still opening)
plan({teleportTeam:true,goal:"Farm"}); party=pt("Bot","Sorca"); me.area=1; me.act=1; me.inTown=true;
var heard=null; window.addEventListener=function(t,f){heard=f}; window.removeEventListener=function(){}; window.say=function(m){said.push(m);if(heard&&/^portal /.test(m))heard("Sorca","Portal is open.")};
window.getUnit=function(){return null}; window.Town.move=function(){}; var tries=0; window.Pather={usePortal:function(a,o){tries++;if(tries===3)me.area=a;return tries===3}};
ok(QuickTravel.portal("pit",12)===true&&tries===3,"portalFromSorc keeps looking for her portal and takes it when it shows");
ok(QuickTravel.portalsInView()==="none","portalsInView says none when nothing is in sight");
// ---- Team.separated / Team.regroup
files["data/bots.json"]=JSON.stringify({bots:["Bot","Vanity","Reform"],team:[]});
function at(areas){party=Object.keys(areas).map(function(n){return {name:n,partyid:7,area:areas[n]}})}
me.area=6; Team.apartSince={}; at({Bot:6,Vanity:6,Reform:1});
ok(Team.separated(60000).length===0,"separated: a teammate just left is not separated yet");
T+=61000; ok(Team.separated(60000).join()==="Reform","separated: a teammate in another area for a minute is");
at({Bot:6,Vanity:6,Reform:6}); ok(Team.separated(60000).length===0&&Object.keys(Team.apartSince).length===0,"separated: back together clears it");
at({Bot:6,Vanity:6,Reform:0}); T+=99000; ok(Team.separated(60000).length===0,"separated: somebody loading an area (0) is not separated");
at({Bot:6,Vanity:6}); T+=99000; ok(Team.separated(60000).length===0,"separated: somebody not in the game is not counted");
at({Bot:6,Vanity:6,Reform:1}); Team.separated(60000); T+=61000; ok(Team.separated(60000).length===1,"separated again after the team split anew");
reset(); window.Pather={usePortal:function(a){me.area=a;return true}}; window.Town.goToTown=function(){me.area=1;at({Bot:1,Vanity:1,Reform:1})}; window.Town.move=function(){};
ok(Team.regroup()===true&&me.area===6&&said.some(function(l){return l.indexOf("The team is split up")===0})&&Team.lastRegroup===T,"regroup goes to town, waits for the team and goes back out");
Date.now=realNow;
document.getElementById("o").textContent=window.LOADERRS+out.join("\n")+"\n\n"+(fail?fail+" FAILED":"ALL PASSED");
