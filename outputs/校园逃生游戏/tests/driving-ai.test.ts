import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seeded} from '../src/rules.ts';
import {DRIVE_AI,DrivingPatrol,DrivingAttack,DrivingFireCoordinator,type DrivingAttacker,type NPCRegion} from '../src/driving-ai.ts';
import type {Vec3} from '../src/types.ts';
const region:NPCRegion={npcId:0,id:'road',label:'road',home:[0,0,0],spawnPoints:[[0,0,-12],[0,0,0],[0,0,12]],patrolPoints:[[0,0,-12],[0,0,0],[0,0,12]]};
const brain=()=>new DrivingPatrol(region,seeded(1));
const clear={sees:true,hears:false},sound={sees:false,hears:true},nothing={sees:false,hears:false};
function updateFor(b:DrivingPatrol,seconds:number,npc:Vec3,car:Vec3,sense=clear){for(let i=0;i<Math.round(seconds*60);i++)b.update(1/60,npc,car,sense);}

test('fixed seeds cover every regional spawn and both patrol directions without prior target knowledge',()=>{
 const map=JSON.parse(readFileSync(new URL('../public/map/drive-v121.json',import.meta.url),'utf8'));
 const seen=new Map<number,Set<string>>(),directions=new Set<number>();
 for(let seed=1;seed<=80;seed++){const random=seeded(seed);for(const r of map.npcRegions){const b=new DrivingPatrol(r,random);const points=seen.get(r.npcId)??new Set();points.add(JSON.stringify(b.spawn));seen.set(r.npcId,points);directions.add(b.direction);assert.equal(b.state,'patrol');assert.equal(b.target,null);assert.equal(b.sees,false);assert.equal(b.canSense(map.spawn),false,'all four regional cores exclude car spawn');}}
 for(const r of map.npcRegions)assert.equal(seen.get(r.npcId)?.size,3);assert.equal(directions.size,2);
});
test('engine sound starts investigation, never authorizes shooting; parked patrols can still see',()=>{
 const b=brain();b.wait=1.7;b.update(1/60,[0,0,0],[0,0,20],sound);assert.equal(b.state,'investigate');assert.equal(b.sees,false);assert.deepEqual(b.target,[0,0,20]);
 b.update(1/60,[0,0,0],[0,0,20],clear);assert.equal(b.state,'chase');assert.equal(b.sees,true);
 const hidden=brain();hidden.update(1/60,[0,0,0],[0,0,20],nothing);assert.equal(hidden.target,null);assert.equal(hidden.state,'patrol');
});
test('a principal callout starts investigation without authorizing an attack seat',()=>{
 const b=brain(),target:Vec3=[0,0,20];assert.equal(b.receiveCallout(target),true);target[2]=30;assert.deepEqual(b.target,[0,0,20]);assert.equal(b.state,'investigate');assert.equal(b.sees,false);
 const attack=new DrivingAttack(),coordinator=new DrivingFireCoordinator();
 coordinator.update(.9,[{id:0,eligible:b.sees&&b.state==='chase',reloading:false,automatic:true,attack}]);assert.equal(coordinator.active,0);assert.equal(attack.phase,'search');
 b.update(1/60,[0,0,0],[0,0,20],clear);assert.equal(b.state,'chase');assert.equal(b.sees,true);
 coordinator.update(.9,[{id:0,eligible:b.sees&&b.state==='chase',reloading:false,automatic:true,attack}]);assert.equal(coordinator.owns(0),true);assert.equal(attack.phase,'fire','personal sight is required before a callout recipient may fire');
});
test('callout memory holds a fixed point for five seconds then returns, even as the unseen car moves',()=>{
 const b=brain();b.receiveCallout([0,0,20]);updateFor(b,4.9,[0,0,12],[0,0,25],nothing);assert.equal(b.state,'investigate');assert.deepEqual(b.target,[0,0,20]);assert.equal(b.sees,false);
 updateFor(b,.2,[0,0,12],[0,0,25],nothing);assert.equal(b.state,'return');assert.equal(b.target,null);assert.equal(b.memory,0);
});
test('callouts cannot send a patrol beyond its region or interrupt return and reacquisition',()=>{
 const b=brain();assert.equal(b.receiveCallout([44.01,0,0]),false);assert.equal(b.state,'patrol');assert.equal(b.target,null);
 assert.equal(b.receiveCallout([44,0,0]),true);b.update(1/60,[0,0,12],[45,0,0],nothing);assert.equal(b.state,'return');assert.equal(b.receiveCallout([0,0,20]),false);
 b.update(1/60,[0,0,.5],[0,0,20],nothing);assert.equal(b.state,'patrol');assert.equal(b.receiveCallout([0,0,20]),false,'two-second return wait rejects new commands');
 updateFor(b,2.01,[0,0,.5],[0,0,20],nothing);assert.equal(b.receiveCallout([0,0,20]),true);
 b.update(1/60,[0,0,.5],[0,0,20],clear);assert.equal(b.receiveCallout([0,0,10]),false,'an ally already seeing the player is not an investigation recipient');
});
test('initial discovery is bounded by 32 metres and pursuit stops immediately past 44',()=>{
 const b=brain();assert.equal(b.canSense([32,0,0]),true);assert.equal(b.canSense([32.01,0,0]),false);
 b.update(1/60,[0,0,0],[32,0,0],clear);assert.equal(b.state,'chase');assert.equal(b.canSense([43,0,0]),true);
 b.update(1/60,[0,0,0],[44.01,0,0],clear);assert.equal(b.state,'return');assert.equal(b.sees,false);assert.equal(b.target,null);
});
test('continuous visibility cannot extend a chase beyond six seconds outside the core',()=>{
 const b=brain();b.update(1/60,[0,0,0],[20,0,0],clear);updateFor(b,5.9,[0,0,-12],[35,0,0]);assert.equal(b.state,'chase');updateFor(b,.2,[0,0,-12],[35,0,0]);assert.equal(b.state,'return');
});
test('lost visual and sound memory lasts three seconds then returns with no target',()=>{
 const b=brain();b.update(1/60,[0,0,0],[10,0,0],clear);updateFor(b,2.9,[0,0,12],[10,0,0],nothing);assert.equal(b.state,'chase');updateFor(b,.2,[0,0,12],[10,0,0],nothing);assert.equal(b.state,'return');assert.equal(b.sees,false);assert.equal(b.memory,0);
});
test('landing recovery returns on foot, then blocks new perception for two seconds',()=>{
 const b=brain(),landing:Vec3=[0,0,25];b.recover();b.update(1/60,landing,[0,0,20],clear);assert.deepEqual(landing,[0,0,25]);assert.deepEqual(b.destination,region.home);assert.equal(b.speed,2);assert.equal(b.state,'return');
 b.update(1/60,[0,0,.5],[0,0,20],clear);assert.equal(b.state,'patrol');assert.equal(b.canSense([0,0,20]),false);
 updateFor(b,1.9,[0,0,.5],[0,0,20]);assert.equal(b.state,'patrol');updateFor(b,.15,[0,0,.5],[0,0,20]);assert.equal(b.state,'chase');
});
const agents=():DrivingAttacker[]=>Array.from({length:4},(_,id)=>({id,eligible:true,reloading:false,automatic:true,attack:new DrivingAttack()}));
test('four simultaneous pursuers fairly share two seats and first shots are staggered',()=>{
 const coordinator=new DrivingFireCoordinator(),npcs=agents(),shots:{id:number,time:number;first:boolean}[]=[];const magazineReady=[0,0,0,0];
 for(let frame=0;frame<12*60;frame++){coordinator.update(1/60,frame%2?[...npcs].reverse():npcs);assert.ok(coordinator.active<=2);for(const n of npcs){if(coordinator.canFire(n.id,n.attack)&&coordinator.time>=magazineReady[n.id]){shots.push({id:n.id,time:coordinator.time,first:n.attack.firstInBurst});coordinator.shot(n.id,n.attack,()=>0);magazineReady[n.id]=coordinator.time+.1;}}}
 const firsts=shots.filter(s=>s.first);for(let i=1;i<firsts.length;i++)assert.ok(firsts[i].time-firsts[i-1].time>=DRIVE_AI.firstShotGap-1e-8);assert.ok(firsts[0].time>=.9-1e-8);
 for(const id of [0,1,2,3])assert.ok(shots.filter(s=>s.id===id).length>=4,'nobody starves');assert.deepEqual(firsts.slice(0,4).map(s=>s.id),[0,1,2,3]);
 for(let i=0;i<shots.length-1;i+=2)assert.equal(shots[i].id,shots[i+1].id,'automatic bursts contain exactly two shots');
});
test('cooldown progresses without a seat or visibility and first/next aim timings differ',()=>{
 const coordinator=new DrivingFireCoordinator(),a=agents()[0];coordinator.update(.9,[a]);assert.equal(a.attack.phase,'fire');coordinator.shot(a.id,a.attack,()=>0);coordinator.shot(a.id,a.attack,()=>0);assert.equal(a.attack.phase,'cooldown');assert.equal(coordinator.active,0);
 a.eligible=false;coordinator.update(1,[a]);assert.ok(Math.abs(a.attack.left-.8)<1e-8);assert.equal(a.attack.phase,'cooldown');a.eligible=true;coordinator.update(.8,[a]);assert.equal(a.attack.phase,'fire','new .55 second aiming was fully consumed by this long test step');
});
test('losing sight, reloading and suppression release seats immediately and reset clears priority',()=>{
 const c=new DrivingFireCoordinator(),n=agents();c.update(.01,n);assert.equal(c.active,2);n[0].eligible=false;n[1].reloading=true;c.update(.01,n);assert.equal(c.owns(0),false);assert.equal(c.owns(1),false);assert.equal(c.owns(2),true);assert.equal(c.owns(3),true);assert.equal(n[0].attack.phase,'search');assert.equal(n[1].attack.phase,'reload');
 c.release(2);n[2].attack.cancel('suppressed');assert.equal(c.owns(2),false);c.reset();assert.equal(c.active,0);assert.deepEqual(c.priority,[]);assert.equal(c.time,0);
});
