import test from 'node:test';
import assert from 'node:assert/strict';
import {EscapeAttack,EscapeFireCoordinator,FIRE_READINESS} from '../src/escape/fire.ts';
import {EscapeTactics,type TacticalAgent,type TacticalProbe} from '../src/escape/tactics.ts';
import {NpcPathBudget} from '../src/escape/path-budget.ts';
import {npcDisplaySkill,npcWeaponRaised,chooseNpcPose} from '../src/npc-locomotion.ts';
import {stairRouteKey,stairLandingDirection} from '../src/navigation/stair-route.ts';
import {eyeAt,muzzleAt,npcAimAngles,lookDirection,dot,normal,sub} from '../src/multiplayer/shared/combat.ts';
import {RoomSimulation} from '../src/multiplayer/shared/simulation.ts';
import type {SimWorld} from '../src/multiplayer/shared/sim-world.ts';
import type {Vec3,MapIdentity} from '../src/multiplayer/shared/protocol.ts';
import {Magazine} from '../src/rules.ts';
import {NpcMovingAccuracy} from '../src/npc-combat-motion.ts';
import {RoomStairTraffic} from '../src/multiplayer/shared/stair-traffic.ts';

const agent=(changes:Partial<TacticalAgent>={}):TacticalAgent=>({id:0,position:[0,0,0],known:[0,0,20],sees:true,hasSeen:true,memory:8,active:true,busy:false,reloading:false,needsReload:false,attackPhase:'search',patrolTarget:[0,0,-10],weapon:'m4a1',...changes});
const open:TacticalProbe={project:p=>[...p],route:(a,b)=>[[...a],[...b]],safe:()=>true,visible:()=>true};

test('an unready raised gun yields its seat; readiness is never required to begin raising',()=>{
 const fire=new EscapeFireCoordinator('standard',1),a={id:0,eligible:true,reloading:false,automatic:true,attack:new EscapeAttack(),ready:false},b={...a,id:1,attack:new EscapeAttack(),ready:true};
 fire.update(0,[a,b]);assert.equal(fire.owns(0),true);assert.equal(a.attack.phase,'aim');
 for(let i=0;i<150;i++)fire.update(1/60,[a,b]);
 assert.equal(fire.owns(0),false);assert.equal(fire.owns(1),true);assert.equal(fire.canFire(0),false);
 assert.ok(FIRE_READINESS.wait>1);fire.update(1,[a,b]);assert.equal(fire.canFire(1),true);
});

test('nine eligible NPCs rotate finite bursts without exceeding the configured fire cap',()=>{
 const fire=new EscapeFireCoordinator('hard'),agents=Array.from({length:9},(_,id)=>({id,eligible:true,reloading:false,automatic:true,attack:new EscapeAttack(),ready:true})),shots=new Set<number>();
 for(let i=0;i<1200;i++){fire.update(1/60,agents);assert.ok(fire.active<=4);for(const a of agents)if(fire.canFire(a.id)){shots.add(a.id);fire.fired(a.id,()=>0);}}
 assert.equal(shots.size,9);
});

test('moving fire keeps the gait, while empty intent, reload and a special dash lower the gun',()=>{
 const motion={pose:'run-a' as const,speed:3.5,phase:.2,bob:.01},base={aim:true,firing:false,suppressed:0,reloading:false};
 const pose=chooseNpcPose(motion,{suppressed:0,attackPhase:'fire'},false);
 assert.equal(pose,'combat-run-a');assert.equal(npcWeaponRaised(pose,base),true);
 assert.equal(npcWeaponRaised(pose,{...base,aim:false}),false);
 assert.equal(npcWeaponRaised(pose,{...base,reloading:true}),false);
 assert.equal(npcWeaponRaised(pose,{...base,skill:'sprint'}),false);
 assert.equal(npcDisplaySkill('meng','callout',undefined),'callout');
 assert.equal(chooseNpcPose(motion,{suppressed:0,skill:npcDisplaySkill('meng','callout',undefined)},true),'skill');
 assert.equal(npcDisplaySkill('wangdi','callout',undefined),undefined);
});

test('the same actual crouched aim point satisfies muzzle readiness at close weapon ranges',()=>{
 for(const distance of [1.5,3,4.8,6.5,13])for(const crouched of [false,true]){
  const feet:Vec3=[0,0,0],target=eyeAt([0,0,-distance],crouched),aim=npcAimAngles(feet,target),muzzle=muzzleAt(feet,aim.yaw,aim.pitch);
  assert.ok(dot(lookDirection(aim.yaw,aim.pitch),normal(sub(target,muzzle)))>.9999);
 }
 const target=eyeAt([0,0,-3],true),wrong=muzzleAt([0,0,0],0,0);
 assert.ok(dot([0,0,-1],normal(sub(target,wrong)))<Math.cos(.12),'old standing-height tracking could never become ready');
});

test('peek selection rejects visible eyes with a blocked muzzle and remembers the bad position',()=>{
 const tactics=new EscapeTactics(),a=agent({position:[0,0,10],attackPhase:'cooldown'});let checks=0;
 const blocked={...open,muzzleVisible:()=>{checks++;return false;}};
 tactics.update(.2,[a],'easy');assert.notEqual(tactics.decide(a,blocked,[a]).state,'peek');assert.ok(checks>0);
 checks=0;tactics.update(1.4,[a],'easy');tactics.decide(a,blocked,[a]);assert.equal(checks,0,'same blocked standpoints remain excluded briefly');
});

test('each fixed clue dispatches at most three/four/five distinct search nodes and then returns to patrol',()=>{
 for(const [difficulty,limit]of [['easy',3],['standard',4],['hard',5]] as const){
  const tactics=new EscapeTactics();let a=agent({known:[0,0,1],sees:false}),patrol=false;const visited:Vec3[]=[];
  for(let i=0;i<30;i++){tactics.update(2,[a],difficulty);const decision=tactics.decide(a,open,[a]);if(decision.state==='patrol'){patrol=true;break;}if(decision.moving){visited.push(decision.goal);a={...a,position:decision.goal};}}
  assert.equal(patrol,true);assert.equal(visited.length,limit);assert.equal(tactics.read(0)?.searchCount,limit);
  assert.equal(new Set(visited.map(p=>p.join(','))).size,limit);
 }
});

test('weapon stopping distance uses a hysteresis band instead of alternating each small step',()=>{
 const tactics=new EscapeTactics();let a=agent({known:[0,0,13.1]});
 tactics.update(.2,[a],'easy');assert.equal(tactics.decide(a,open,[a]).moving,true);
 for(const range of [12.9,13.1,12.8]){a={...a,known:[0,0,range]};tactics.update(.1,[a],'easy');assert.equal(tactics.decide(a,open,[a]).moving,true);}
 a={...a,known:[0,0,12.2]};tactics.update(.1,[a],'easy');assert.equal(tactics.decide(a,open,[a]).moving,false);
 a={...a,known:[0,0,13.1]};tactics.update(.1,[a],'easy');assert.equal(tactics.decide(a,open,[a]).moving,false);
});

test('path work is capped per step and all nine agents eventually receive a turn',()=>{
 const budget=new NpcPathBudget(2),seen=new Set<string>();
 for(let step=0;step<9;step++){budget.begin(1/60);for(let id=0;id<9;id++){const result=budget.run(String(id),()=>id);if(result!==undefined)seen.add(String(result));}assert.ok(budget.queries<=2);}
 assert.equal(seen.size,9);assert.ok(budget.pending<=9);budget.reset();assert.equal(budget.pending,0);
});

test('similarly named flights in different buildings have separate ownership and local landing exits',()=>{
 const south={core:'west',from_floor:1,to_floor:2,points:[[0,0,0],[0,1,-2],[0,3,-4]] as Vec3[]},north={...south,points:south.points.map(([x,y,z])=>[x+50,y,z-60] as Vec3)};
 assert.notEqual(stairRouteKey(south),stairRouteKey(north));
 assert.deepEqual(stairLandingDirection(south,true),[0,0,1]);assert.deepEqual(stairLandingDirection(south,false),[0,0,-1]);
});

test('a deferred stair-yield search resumes beyond failed candidates within its per-step route budget',()=>{
 let calls=0;
 const world={manifest:{stairRoutes:[{core:'west',from_floor:1,to_floor:2,points:[[0,0,0],[0,1.5,-2],[0,3,-4]]}]},nearest:(p:Vec3)=>p,supportAt:()=>({clear:true}),safeRoute:()=>true,path:(a:Vec3,b:Vec3)=>{calls++;return calls<=2?[]:[a,b];}} as unknown as SimWorld;
 const traffic=new RoomStairTraffic(world),members=[{id:0,position:[0,1.5,-2] as Vec3,goal:[0,3,-4] as Vec3,active:true},{id:1,position:[0,1.5,-2] as Vec3,goal:[0,0,0] as Vec3,active:true}];
 traffic.update(1/60,members,[]);assert.deepEqual(traffic.motion(1,members[1].position,1/60),[0,0,0]);assert.equal(calls,2);
 traffic.update(1/60,members,[]);const motion=traffic.motion(1,members[1].position,1/60);assert.ok(motion&&Math.hypot(...motion)>0);assert.equal(calls,4);
});

// Open-floor adapter isolates the real RoomSimulation perception/attack loop.
// Collision and final-map movement are covered by the separate spatial run.
function simulation(crouched:boolean,moving=false){
 const world={manifest:{spawn:[0,0,0],spawnYaw:0,npcSpawns:[],supplies:[],stairRoutes:[]},actors:new Map(),supportAt:(p:Vec3)=>({height:p[1],clear:true,normalY:1}),nearest:(p:Vec3)=>[...p],visible:()=>true,visionVisible:()=>true,actorPath:(_id:string,a:Vec3,b:Vec3)=>[[...a],[...b]],safeRoute:()=>true,rayDistance:(_a:Vec3,_b:Vec3,range:number)=>range,addActor(){},removeActor(){},move:(_id:string,p:Vec3,d:Vec3)=>({position:[p[0]+d[0],p[1],p[2]+d[2]],grounded:true}),dispose(){}} as unknown as SimWorld;
 const sim=new RoomSimulation('npc-regression',world,{} as MapIdentity,{mode:'coop',difficulty:'standard'});
 const player=sim.addPlayer({id:'p0',nickname:'test',shortId:'test'});player.position=[0,0,moving?-15:-4.8];player.crouched=crouched;player.loading=false;player.health=100000;
 const n={state:{id:'npc-0',identity:'luan',generation:1,position:[0,0,0],yaw:0,pose:'idle',aim:false,firing:false,reloading:false,weapon:'r870',active:true,health:100,targetId:'p0'},slot:0,gun:new Magazine('r870'),attack:new EscapeAttack(),lastKnown:[...player.position],memory:8,sense:10,path:[],repath:0,goal:[0,0,0],sees:true,reaction:0,pitch:0,actualSpeed:0,vertical:0,grounded:true,gait:0,bob:0,respawnAt:Infinity,stuck:0,shotSerial:0,movingAccuracy:new NpcMovingAccuracy(),hasSeen:true,skillProbe:0} as typeof sim.npcs[number];
 sim.npcs.push(n);sim.phase='playing';sim.elapsed=11;
 const internals=sim as unknown as {updateNPCs:(dt:number)=>void;npcCombat:(dt:number)=>void;tactics:{decide:(a:TacticalAgent)=>unknown;read:()=>null}};
 internals.tactics.decide=a=>({state:'chase',goal:[...player.position],moving,canReload:false});internals.tactics.read=()=>null;
 return{sim,n,player,internals};
}

test('the authoritative cooperative R870 actually fires at a close crouched player',()=>{
 const {sim,n,internals}=simulation(true);
 try{for(let i=0;i<110;i++){internals.updateNPCs(1/60);internals.npcCombat(1/60);}
  assert.ok(n.shotSerial>=1);assert.equal(n.gun.ammo,6-n.shotSerial);const shot=sim.events.find(e=>e.type==='shot');assert.equal(shot?.data?.ends?.length,8);
 }finally{sim.dispose();}
});

test('normal running retains authoritative shots while reload never emits a duplicate shot',()=>{
 const {sim,n,internals}=simulation(false,true);
 try{for(let i=0;i<110;i++){internals.updateNPCs(1/60);internals.npcCombat(1/60);}
  assert.ok(n.actualSpeed>2.5);assert.ok(n.shotSerial>=1);assert.ok(String(n.state.pose).startsWith('combat-run-'));
  const serial=n.shotSerial;n.gun.ammo=0;n.gun.reload();for(let i=0;i<10;i++){internals.updateNPCs(1/60);internals.npcCombat(1/60);}assert.equal(n.shotSerial,serial);assert.equal(n.state.aim,false);
 }finally{sim.dispose();}
});
