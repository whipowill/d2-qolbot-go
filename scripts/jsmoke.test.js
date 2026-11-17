// Run by scripts/jsmoke.py in headless Firefox with the D2BS globals mocked (print, say, me, Config, Storage, Town ...).
// Every check prints PASS or FAIL. The new libs/common modules are loaded as they are on disk.
var out=[],fail=0;
function ok(c,msg){ out.push((c?"PASS  ":"FAIL  ")+msg); if(!c) fail++; }
var printed=[],said=[],T=1000000,files={"data/Bot.spec.json":JSON.stringify({autoSaveMinutes:2,storage:{clearOnLoad:false}}),"data/bots.json":JSON.stringify({bots:["Bot","Vanity"],team:["Reform"]})};
var realNow=Date.now; Date.now=function(){return T;};
window.scriptBroadcast=function(){}; window.print=function(m){printed.push(m)}; window.say=function(m){said.push(m)}; window.delay=function(){};
window.me={profile:"Bot",name:"Bot",ping:10,gold:5000,classid:1,charlvl:80,area:40,inTown:true,act:2,getStat:function(){return 0}};
window.Config={QuietChat:false,QuietProblems:false,MinColumn:[2,2,2,2],BeltColumn:["hp","mp","mp","rv"],PotionGold:1000,HPBuffer:0,MPBuffer:0,Inventory:null};
window.FileTools={writeText:function(p,t){files[p]=t},readText:function(p){if(!(p in files))throw new Error("no file");return files[p]},exists:function(p){return p in files}};
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
var heard=null; window.addEventListener=function(t,f){heard=f}; window.removeEventListener=function(){}; window.say=function(m){said.push(m);if(heard&&/^portal /.test(m))heard("Sorca",Speech.answers.portalOpen[0])};
window.getUnit=function(){return null}; window.Town.move=function(){}; var tries=0; window.Pather={usePortal:function(a,o){tries++;if(tries===3)me.area=a;return tries===3}};
ok(QuickTravel.portal("pit",12)===true&&tries===3,"portalFromSorc keeps looking for her portal and takes it when it shows");
ok(QuickTravel.portalsInView()==="none","portalsInView says none when nothing is in sight");
// ---- Saver.beforeLeaving (the "save before a chicken" setting)
window.say=function(m){said.push(m)}; reset();
plan({autoSaveMinutes:2,saveOnChicken:true}); ok(Saver.beforeLeaving()===true&&said[0]==="/save","beforeLeaving asks for a save when the setting is on");
plan({autoSaveMinutes:2}); reset(); ok(Saver.beforeLeaving()===false&&said.length===0,"beforeLeaving does nothing when the setting is off");
plan({autoSaveMinutes:0,saveOnChicken:true}); reset(); ok(Saver.beforeLeaving()===false&&said.length===0,"beforeLeaving does nothing when saving is switched off altogether");
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
at({Bot:6,Vanity:1,Reform:6}); Team.apartSince={}; Team.separated(60000); T+=61000; ok(Team.separated(60000).join()==="Vanity"&&Team.lost(60000).length===0,"lost: a teammate waiting in town is not lost");
at({Bot:6,Vanity:3,Reform:6}); Team.apartSince={}; Team.separated(60000); T+=61000; ok(Team.lost(60000).join()==="Vanity","lost: a teammate in another field area is");
reset(); window.Pather={usePortal:function(a){me.area=a;return true}}; window.Town.goToTown=function(){me.area=1;at({Bot:1,Vanity:1,Reform:1})}; window.Town.move=function(){};
ok(Team.regroup()===true&&me.area===6&&printed.some(function(l){return l.indexOf("Team: The team is split up")===0})&&Team.lastRegroup===T,"regroup goes to town, waits for the team and goes back out");
// ---- Team.gather: the leader does not leave an area before the team caught up
(function(){
var oldGet=Plan.get, oldDelay=window.delay, calls;
Plan.get=function(){return {goal:"Quest"}}; window.Config={Leader:""}; me.area=6;
window.delay=function(ms){T+=ms; calls++; if(calls===3) at({Bot:6,Vanity:6,Reform:6})};
calls=0; at({Bot:6,Vanity:6,Reform:1}); var t0=T;
ok(Team.gather()===true&&calls===3&&T-t0<10000&&printed.some(function(l){return l.indexOf("waiting for Reform")>=0}),"gather: waits until the late teammate is in my area");
window.delay=function(ms){T+=ms}; at({Bot:6,Vanity:6,Reform:1}); t0=T;
ok(Team.gather(20000)===false&&T-t0>=20000&&T-t0<=22000,"gather: gives up at the limit");
at({Bot:6,Vanity:6,Reform:0}); ok(Team.gather()===true,"gather: somebody loading an area is not waited for");
window.Config={Leader:"Boss"}; at({Bot:6,Vanity:6,Reform:1}); t0=T; ok(Team.gather()===true&&T===t0,"gather: a follower never waits");
window.Config={Leader:""}; Plan.get=function(){return {}}; ok(Team.gather()===true&&T===t0,"gather: a bot without an objective never waits");
Plan.get=oldGet; window.delay=oldDelay;
})();
// ---- Layout: the cube top left, the tomes beneath it, the keys beside it
(function(){
var inv, cursor=null, oldMe=window.me, oldCfg=window.Config, oldSt=window.Storage;
function mk(name,code,x,y,w,h,gid){return {name:name,classid:code,x:x,y:y,sizex:w,sizey:h,gid:gid,location:3,mode:0,toCursor:function(){inv=inv.filter(function(i){return i!==this}.bind(this));cursor=this}}}
window.Storage={Inventory:{width:10,height:4}};
window.Config={InventoryLayout:true};
window.getTickCount=function(){T+=300;return T};
window.clickItem=function(a,x,y,loc){if(cursor){cursor.x=x;cursor.y=y;inv.push(cursor);cursor=null}};
window.me={gameReady:true,dead:false,ping:10,get itemoncursor(){return !!cursor},getItems:function(){return inv.slice()},findItem:function(code){return inv.filter(function(i){return i.classid===code})[0]||null}};
function at(code){var i=me.findItem(code);return i?i.x+","+i.y:"none"}
var junk=mk("Ring",999,0,0,1,1,1), tp=mk("Tome of Town Portal",518,4,0,1,2,2), idt=mk("Tome of Identify",519,7,2,1,2,3), key=mk("Key",543,0,1,1,1,4), cube=mk("Horadric Cube",549,3,2,2,2,5), junk2=mk("Charm",998,1,2,1,3,6);
inv=[junk,tp,idt,key,cube,junk2];
var n=Layout.apply();
ok(at(549)==="0,0"&&at(518)==="0,2"&&at(519)==="1,2"&&at(543)==="2,0","layout: cube 0,0, tomes beneath it, key beside it (got "+at(549)+" "+at(518)+" "+at(519)+" "+at(543)+")");
var cells={},bad=false;inv.forEach(function(i){for(var x=i.x;x<i.x+i.sizex;x++)for(var y=i.y;y<i.y+i.sizey;y++){if(cells[x+","+y])bad=true;cells[x+","+y]=1}});
ok(!bad&&inv.length===6&&n>0,"layout: nothing overlaps or got lost after the moves");
ok(Layout.apply()===0,"layout: a second pass changes nothing");
Config.InventoryLayout=false;inv=[mk("Key",543,5,3,1,1,9)];ok(Layout.apply()===0&&inv[0].x===5,"layout: switched off, nothing moves");
Config.InventoryLayout=true;inv=[mk("Tome of Town Portal",518,0,0,1,2,7)];Layout.apply();ok(at(518)==="0,2","layout: without a cube the tome still goes below its place");
window.me=oldMe;window.Config=oldCfg;window.Storage=oldSt;
})();
// ---- Speech: the bots talk in character, and still understand each other
(function(){
var k, all = true, n;
for (k in Speech.answers) { for (n = 0; n < Speech.answers[k].length; n++) { if (!Speech.is(Speech.answers[k][n].replace("{n}", 25), k, 25)) all = false; } }
ok(all,"speech: every phrasing is recognised for its own answer");
ok(!Speech.is(Speech.answers.portalOpen[0],"noGet")&&Speech.isPortalAnswer(Speech.answers.noPlace[1])&&!Speech.isPortalAnswer("Hello there"),"speech: answers do not mix, a portal answer is only a portal answer");
ok(Speech.is(Speech.text("hasWaypoint",37),"hasWaypoint",37)&&!Speech.is(Speech.text("hasWaypoint",37),"hasWaypoint",38),"speech: the waypoint number is part of the answer");
ok(Speech.flavor('Act 2 - #1 - "Radament\'s Lair" is complete.').indexOf("Radament's Lair")>-1&&Speech.flavor("Something unknown")==="Something unknown","speech: reports are dressed up, unknown ones stay as they are");
var said2=[]; var oldSay=window.say; window.say=function(m){said2.push(m)}; var oldQ=Config.QuietChat; Config.QuietChat=false;
Report.note("Team","The team is split up (Xena apart, regroup no. 1). Going to town so we all meet.");
ok(said2.length===1&&said2[0].indexOf("regroup no")<0&&printed.some(function(l){return l.indexOf("Team: The team is split up (Xena apart, regroup no. 1)")===0}),"speech: the chat is in character, the log line stays plain for Qolbot");
window.say=oldSay; Config.QuietChat=oldQ;
})();
// ---- Waypoints: who lacks what, and the sync at the start of a game
(function(){
var oldMe=window.me, oldCfg=window.Config, oldP=window.Pather, oldGW=window.getWaypoint, oldTown=window.Town, oldQT=window.QuickTravel_waypoint, shared=[];
window.Pather={wpAreas:[1,3,4,5,40],accessToAct:function(){return true},getAreaName:function(a){return "area"+a},useWaypoint:function(){},makePortal:function(){},getWP:function(){}};
var mine={0:true}; window.getWaypoint=function(i){return !!mine[i]};
window.me={name:"Bot",inTown:true,dead:false,act:1,gameReady:true};
window.Config={QuestWaypoints:true,Leader:""};
files["data/bots.json"]=JSON.stringify({bots:["Bot","Vanity"],team:["Reform"]});
files["data/waypoints-Vanity.json"]="[1,3,4]"; files["data/waypoints-Reform.json"]="[1]";
at({Bot:1,Vanity:1,Reform:1});
Waypoints.syncedActs={}; Waypoints.lastSaved=""; Waypoints.loaded=true;
ok(Waypoints.lacking(3).join()==="Bot,Reform"&&Waypoints.having(3).join()==="Vanity","waypoints: lacking and having are worked out from the lists");
ok(Waypoints.has(1)===true&&Waypoints.has(99)===true,"waypoints: an area without a waypoint is never lacking");
window.Town={goToTown:function(){}}; Waypoints.share=function(a){shared.push(a);return true};
var n=Waypoints.sync();
ok(n===2&&shared.join()==="3,4"&&printed.some(function(l){return l.indexOf("Waypoints: Syncing")===0}),"waypoints: sync shares the ones somebody has and somebody lacks ("+shared.join()+" / "+n+")");
ok(JSON.parse(files["data/waypoints-Bot.json"]).join()==="1","waypoints: my own list is written");
files["data/waypoints-Bot.json"]="[1,3]";Waypoints.loaded=false;window.me.inTown=false;Waypoints.lastSaved="";Waypoints.save();ok(files["data/waypoints-Bot.json"]==="[1,3]","waypoints: nothing is written before the game has told me my waypoints");window.me.inTown=true;
// gates: who may be let into a place the game keeps shut until a quest is done
window.me.getQuest=function(id){return id===11?0:1}; Waypoints.gates={4:11}; files["data/wpquests-Vanity.json"]="[1,11]"; files["data/wpquests-Reform.json"]="[1]";
ok(Waypoints.canEnter("Bot",4)===false&&Waypoints.canEnter("Vanity",4)===true&&Waypoints.canEnter("Reform",4)===false&&Waypoints.canEnter("Reform",3)===true,"waypoints: a gate keeps out the bots that have not done its quest");
files["data/waypoints-Vanity.json"]="[1,3]"; files["data/waypoints-Reform.json"]="[1,3,4]";
ok(Waypoints.receivers(4).indexOf("Reform")<0&&Waypoints.gated(4)===true,"waypoints: a bot behind the gate is not a receiver, and the leader behind it does not go");
Waypoints.gates={}; delete window.me.getQuest;
window.me=oldMe;window.Config=oldCfg;window.Pather=oldP;window.getWaypoint=oldGW;window.Town=oldTown;
})();
Date.now=realNow;
var REPORT=window.LOADERRS+out.join("\n")+"\n\n"+(fail?fail+" FAILED":"ALL PASSED");
document.getElementById("o").textContent=REPORT;
fetch(REPORT_URL,{method:"POST",mode:"no-cors",body:REPORT});
