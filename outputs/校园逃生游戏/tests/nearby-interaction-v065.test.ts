import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {resolveNearbyInteraction,collectTaskInteractionCandidates}=await import('../src/nearby-interaction.ts');
const {RoomSimulation}=await import('../src/multiplayer/shared/simulation.ts');
const {TeamTasks}=await import('../src/multiplayer/shared/tasks.ts');
const {RecipientReplicator}=await import('../src/multiplayer/shared/wire.ts');
const {DrivingChallenge}=await import('../src/driving-challenge.ts');
const {DAFEI_BEST_KEY,LEGACY_DAFEI_BEST_KEY,rankingRuleVersion,RANKING_RULE_VERSION,DAFEI_RULE_VERSION}=await import('../src/ranking/shared.ts');
const candidate=(kind:any,id:string,distance:number,available=true)=>({kind,id,distance,available,action:kind,position:[distance,0,0] as [number,number,number],range:3});
function simulation(count=1,mode:'coop'|'pvp'='pvp'){
 const world={manifest:{spawn:[0,0,0],spawnYaw:0,supplies:[]},actors:new Map(),visible:()=>true,removeActor(id:string){this.actors.delete(id);},move:(_id:string,p:number[])=>({position:p})};
 const sim=new RoomSimulation('interaction',world as any,{sourceVersion:'fixture',manifestHash:'m',collisionHash:'c',navigationHash:'n'},{mode,variant:'ffa',maxPlayers:8});
 (sim as any).findSpawn=()=>[0,0,0];for(let i=0;i<count;i++){const s=sim.addPlayer({id:'p'+i,nickname:'Player '+i,shortId:'T'+i});s.loading=false;}return sim;
}
function tasks(sim:ReturnType<typeof simulation>,entries:any[]){
 const value=Object.create(TeamTasks.prototype);Object.assign(value,{world:sim.world,difficulty:'standard',tasks:entries,plan:{extraction:{position:[40,0,0]}},extractionStarted:false});sim.tasks=value;return value as InstanceType<typeof TeamTasks>;
}
const task=(id:string,x:number,kind='hold')=>({id,kind,label:id,positions:[[x,0,0]],floors:[0],status:'pending',progress:0,duration:15,radius:6,visited:[],carrierId:null,drop:null,blocked:null});
test('valid nearby interactions prioritize rescue, task, weapon and supply, then nearest with stable ties',()=>{
 const all=[candidate('supply','s',.1),candidate('weapon','w',.2),candidate('task','z',2),candidate('task','a',1)];
 assert.equal(resolveNearbyInteraction(all)!.id,'a');assert.equal(resolveNearbyInteraction([...all,candidate('revive','r',2)])!.id,'r');
 assert.equal(resolveNearbyInteraction([candidate('weapon','a',.1,false),candidate('weapon','b',1)])!.id,'b');
 assert.equal(resolveNearbyInteraction([candidate('task','z',1),candidate('task','a',1)])!.id,'a');
});
test('task candidates omit old endpoints and respect a dropped delivery item and its current carrier',()=>{
 const activation={...task('a',0,'activate'),positions:[[0,0,0],[2,0,0]],visited:['0']};
 const delivery={...task('d',0,'deliver'),positions:[[0,0,0],[4,0,0]],drop:[1,0,0]};
 let c=collectTaskInteractionCandidates([activation,delivery] as any,'p0',[0,0,0]);assert.deepEqual(c.map(x=>[x.action,x.siteId,x.position[0]]),[['activate','1',2],['carry','0',1]]);
 c=collectTaskInteractionCandidates([{...delivery,carrierId:'p1'}] as any,'p0',[0,0,0]);assert.equal(c.length,0);
 c=collectTaskInteractionCandidates([{...delivery,carrierId:'p0'}] as any,'p0',[0,0,0]);assert.equal(c[0].action,'deliver');assert.equal(c[0].position[0],4);
});
test('server commits the nearest valid task, and stale candidates cannot repeat a reward',()=>{
 const sim=simulation(),p=sim.players.get('p0')!,team=tasks(sim,[task('far',2),task('near',.5)]);
 const selected=resolveNearbyInteraction(team.candidates('p0',[0,0,0]))!;assert.equal(selected.taskId,'near');
 assert.equal(team.commit('p0',[0,0,0],selected)!.task!.id,'near');assert.equal(team.commit('p0',[0,0,0],selected),null);
 assert.equal(team.tasks[0].status,'pending');assert.equal(team.tasks[1].status,'active');
});
test('the actual second activation endpoint is reported, rather than the first endpoint',()=>{
 const sim=simulation(),team=tasks(sim,[{...task('activate',30,'activate'),positions:[[30,0,0],[.5,0,0]]}]);
 const c=team.candidates('p0',[0,0,0])[0];assert.equal(c.siteId,'1');const result=team.commit('p0',[0,0,0],c)!;assert.deepEqual(result.position,[.5,0,0]);assert.deepEqual(result.task!.visited,['1']);
});
test('a weapon takes precedence over a closer supply and keeps the eight-drop exchange atomic',()=>{
 const sim=simulation(),p=sim.players.get('p0')!;sim.supplies.push({id:'s',position:[.1,0,0],usedBy:[]});
 for(let i=0;i<8;i++)sim.drops.push({id:'d'+i,weapon:'mp5',ammo:7,reserve:13,position:i?[30+i,0,0]:[1,0,0],left:45});
 (sim as any).interact(p);assert.equal(p.primary,'mp5');assert.deepEqual(sim.supplies[0].usedBy,[]);assert.equal(sim.drops.length,8);assert.ok(sim.drops.some(d=>d.weapon==='m4a1'));
});
test('a completely full supply is not consumed; one useful refill consumes only the nearest supply once',()=>{
 const sim=simulation(),p=sim.players.get('p0')!;sim.supplies.push({id:'far',position:[2,0,0],usedBy:[]},{id:'near',position:[.5,0,0],usedBy:[]});
 for(const gun of p.guns.values())gun.reserve*=2;
 (sim as any).interact(p);assert.deepEqual(sim.supplies.map(s=>s.usedBy),[[],[]]);assert.equal(sim.events.length,0);
 assert.equal((sim as any).nearbyInteraction(p).available,false);assert.equal((sim as any).nearbyInteraction(p).reason,'full');
 p.state.health=90;(sim as any).interact(p);assert.equal(p.state.health,100);assert.deepEqual(sim.supplies.map(s=>s.usedBy),[[],['p0']]);
 (sim as any).interact(p);assert.deepEqual(sim.supplies.map(s=>s.usedBy),[[],['p0']]);assert.equal(sim.events.length,1);
});
test('occluded and wrong-floor candidates cannot intercept the actionable nearest interaction',()=>{
 const sim=simulation(),p=sim.players.get('p0')!;sim.supplies.push({id:'wrong-floor',position:[0,2,0],usedBy:[]},{id:'occluded',position:[.1,0,0],usedBy:[]},{id:'valid',position:[1,0,0],usedBy:[]});
 (sim.world as any).visible=(_eye:any,to:number[])=>to[0]!==.1;p.state.health=80;(sim as any).interact(p);assert.deepEqual(sim.supplies.map(s=>s.usedBy),[[],[],['p0']]);
});
test('a full same-weapon drop is retained and does not block a useful supply',()=>{
 const sim=simulation(),p=sim.players.get('p0')!;p.guns.get('m4a1')!.reserve=180;sim.drops.push({id:'ammo',weapon:'m4a1',ammo:30,reserve:60,position:[.5,0,0],left:45});sim.supplies.push({id:'heal',position:[1,0,0],usedBy:[]});p.state.health=70;
 (sim as any).interact(p);assert.equal(sim.drops.length,1);assert.deepEqual(sim.supplies[0].usedBy,['p0']);
});
test('a nearby downed teammate exclusively receives E instead of a colocated task, weapon or supply',()=>{
 const sim=simulation(2,'coop'),p=sim.players.get('p0')!,down=sim.players.get('p1')!;down.state.life='downed';down.state.position=[.5,0,0];
 tasks(sim,[task('hold',.2)]);sim.drops.push({id:'gun',weapon:'mp5',ammo:7,reserve:13,position:[.3,0,0],left:45});sim.supplies.push({id:'s',position:[.1,0,0],usedBy:[]});
 (sim as any).interact(p);assert.equal(sim.tasks!.tasks[0].status,'pending');assert.equal(sim.drops.length,1);assert.deepEqual(sim.supplies[0].usedBy,[]);assert.equal(sim.events.length,0);
 assert.equal((sim as any).nearbyInteraction(p).kind,'revive');p.input.interact=true;(sim as any).revive(.5);assert.equal(down.revive,.5);
});
test('interaction summaries contain no coordinates and are sent only as the owning player state',()=>{
 const sim=simulation(2),p=sim.players.get('p0')!;sim.drops.push({id:'gun',weapon:'mp5',ammo:7,reserve:13,position:[.7,0,0],left:45});
 const snapshot=sim.snapshot(),own=new RecipientReplicator('p0').build(snapshot,{visible:()=>true} as any,{forceFull:true}),other=new RecipientReplicator('p1').build(snapshot,{visible:()=>true} as any,{forceFull:true});
 assert.equal(own.self.interaction!.id,'gun');assert.equal('position' in own.self.interaction!,false);assert.equal((other.players.find(v=>v.id==='p0') as any).interaction,undefined);
});
test('new driving records neither import nor overwrite the old rule record',t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map([[LEGACY_DAFEI_BEST_KEY,'8000']]);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as any).localStorage;});
 const drive=new DrivingChallenge([]);assert.equal(drive.bestScore,null);assert.equal(drive.legacyBestScore,8000);drive.score.hit('a',0);drive.finish();assert.equal(data.get(DAFEI_BEST_KEY),'100');assert.equal(data.get(LEGACY_DAFEI_BEST_KEY),'8000');assert.equal(new DrivingChallenge([]).bestScore,100);
 assert.equal(rankingRuleVersion('escape'),RANKING_RULE_VERSION);assert.equal(rankingRuleVersion('dafei'),DAFEI_RULE_VERSION);
});

test('all four task types select only live endpoints and commit once, including the extraction endpoint',()=>{
 const sim=simulation(),p=sim.players.get('p0')!;const team=tasks(sim,[task('take',.3,'take'),{...task('activate',10,'activate'),positions:[[10,0,0],[.5,0,0]]},{...task('deliver',20,'deliver'),positions:[[20,0,0],[.7,0,0]],carrierId:'p0'}]);
 const initial=p.guns.get('m4a1')!.reserve;(sim as any).interact(p);assert.equal(team.tasks[0].status,'complete');assert.equal(p.guns.get('m4a1')!.reserve,initial+30);assert.equal(sim.events.filter(e=>e.type==='task'&&e.data?.action==='complete'&&e.data?.taskId==='take').length,1);
 (sim as any).interact(p);assert.deepEqual(team.tasks[1].visited,['1']);(sim as any).interact(p);assert.equal(team.tasks[2].status,'complete');
 const candidate=team.candidates('p0',[10,0,0])[0];assert.equal(candidate.action,'activate');assert.equal(candidate.siteId,'0');team.commit('p0',[10,0,0],candidate);assert.equal(team.completed,3);
 const extract=team.candidates('p0',[40,0,0])[0];assert.equal(extract.action,'extract');assert.equal(team.commit('p0',[40,0,0],extract)!.type,'extract');assert.equal(team.commit('p0',[40,0,0],extract),null);
 const holdTeam=tasks(sim,[task('hold',.2)]),hold=holdTeam.candidates('p0',[0,0,0])[0];assert.equal(hold.action,'hold');holdTeam.commit('p0',[0,0,0],hold);assert.equal(holdTeam.candidates('p0',[0,0,0]).length,0);
});
