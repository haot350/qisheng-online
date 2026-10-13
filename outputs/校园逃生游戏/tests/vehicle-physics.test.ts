import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createDrivingPhysics,type DriveMap,type PhysicsActor} from '../src/vehicle-physics.ts';
import type {DriveInput} from '../src/types.ts';
import {DRIVE_RULES} from '../src/driving-rules.ts';
const IDLE:DriveInput={steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false};
await RAPIER.init();
function fixture(run:(car:ReturnType<typeof createDrivingPhysics>,tick:(input?:DriveInput,boosted?:boolean)=>ReturnType<ReturnType<typeof createDrivingPhysics>['afterStep']>,actors:Map<number,PhysicsActor>,world:RAPIER.World)=>void,autoReentry=true){
 const world=new RAPIER.World({x:0,y:-18,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(200,.1,200).setTranslation(0,-.1,0));world.step();
 const actors=new Map<number,PhysicsActor>(),controller=()=>{const c=world.createCharacterController(.015);c.enableAutostep(.42,.2,false);c.enableSnapToGround(.3);return c;};
 const map:DriveMap={version:12,spawn:[0,0,12],spawnYaw:0,npcSpawns:[],repairs:[],barriers:[],bounds:{min:[-200,-4,-200],max:[200,25,200]},outdoorWaypoints:[[0,0,12],[0,0,0]]};
 const car=createDrivingPhysics(world,map,actors,controller,()=>{});
 const tick=(input=IDLE,boosted=false)=>{car.beforeStep(input,boosted,1/60);world.timestep=1/60;world.propagateModifiedBodyPositionsToColliders();car.prepareContacts(1/60);world.step(car.eventQueue,car.physicsHooks);const result=car.afterStep(1/60);if(autoReentry)for(let id=0;id<8;id++)if(car.npc(id)?.phase==='respawning'&&car.reenter(id,new THREE.Vector3(-60-id*3,0,60)))result.recovered.push(id);return result;};
 try{run(car,tick,actors,world);}finally{car.dispose();for(const a of actors.values()){if(!a.thrown)world.removeCharacterController(a.controller);world.removeRigidBody(a.body);}world.free();}
}
test('four wheel suspension supports the car, real forward/reverse and brakes preserve finite poses',()=>fixture((car,tick)=>{
 for(let i=0;i<120;i++)tick();const idle=car.read();console.log('settled',idle.position.toArray(),idle.speed);
 assert.ok(idle.position.y>-.3&&idle.position.y<.15);assert.equal(idle.wheels.length,4);assert.ok(Math.abs(idle.speed)<.2);
 for(let i=0;i<180;i++)tick({...IDLE,throttle:1});const forward=car.read();console.log('forward',forward.position.toArray(),forward.speed);
 assert.ok(forward.position.z<idle.position.z-8,'local -Z is forward');assert.ok(forward.speed>4&&forward.speed<DRIVE_RULES.maxSpeed+.3);
 for(let i=0;i<120;i++)tick({...IDLE,brake:1});assert.ok(Math.abs(car.read().speed)<1);
 const stopped=car.read().position.z;for(let i=0;i<150;i++)tick({...IDLE,throttle:1,reverse:true});const backwards=car.read();console.log('reverse',backwards.position.toArray(),backwards.speed);
 assert.ok(backwards.position.z>stopped+2);assert.ok(backwards.speed< -1&&backwards.speed> -5);
 assert.equal(car.reset(),true);assert.ok(car.read().position.y>-.3);assert.ok(Math.abs(car.read().speed)<.01);
}));
test('only actual contacts above threshold launch an NPC, then a real landing starts ten-second stun and clears on recovery',()=>fixture((car,tick,actors,world)=>{
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.89,0)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),controller=world.createCharacterController(.015);actors.set(4,{body,capsule,controller,height:1.75,vertical:0,grounded:true});
 let impacts=0,maxHeight=0,landing:THREE.Vector3|undefined,recovered=0,stunFrames=0;let seen=false;
 for(let frame=0;frame<1500;frame++){const result=tick(frame<230?{...IDLE,throttle:1}:{...IDLE,brake:1});impacts+=result.impacts.length;recovered+=result.recovered.length;const state=car.npc(4);if(state){seen=true;maxHeight=Math.max(maxHeight,state.position.y);if(state.phase==='stunned'){stunFrames++;landing??=state.position.clone();}}if(result.recovered.length)break;}
 console.log('impact lifecycle',{impacts,recovered,maxHeight,stunFrames,landing:landing?.toArray(),body:actors.get(4)?.body.translation()});
 assert.equal(impacts,1,'one real collision, not repeated proximity hits');assert.ok(seen&&maxHeight>.65,'the NPC actually rises under dynamic physics');assert.ok(stunFrames>=590);assert.equal(recovered,1);assert.equal(car.npc(4),null);assert.equal(actors.get(4)?.thrown,false);assert.equal(actors.get(4)!.body.bodyType(),RAPIER.RigidBodyType.KinematicPositionBased);assert.ok(Math.abs(actors.get(4)!.body.translation().y-.9)<.08);
}));
test('static wall blocks body rays and a swept camera sphere; queries never treat the car itself as a wall',()=>fixture((car,tick,_actors,world)=>{
 world.createCollider(RAPIER.ColliderDesc.cuboid(5,2,.1).setTranslation(0,2,18));tick();
 assert.ok((car.hitDistance(new THREE.Vector3(0,1,5),new THREE.Vector3(0,0,1),12)??20)<12);
 const d=car.cameraDistance(new THREE.Vector3(0,1,12),new THREE.Vector3(0,0,1),10);assert.ok(d>5&&d<6);
 assert.equal(car.cameraDistance(new THREE.Vector3(0,1,12),new THREE.Vector3(1,0,0),10),10);
}));

test('a full-speed actual contact produces an exaggerated but finite outdoor flight',()=>fixture((car,tick,actors,world)=>{
 const origin=new THREE.Vector3(0,0,-22),body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.89,-22)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),controller=world.createCharacterController(.015);actors.set(3,{body,capsule,controller,height:1.75,vertical:0,grounded:true});
 let maxHeight=0,landing:THREE.Vector3|undefined,impacts=0,speed=0,velocity:unknown;
 for(let frame=0;frame<550;frame++){const event=tick(impacts?{...IDLE,brake:1}:{...IDLE,throttle:1});if(event.impacts.length){impacts++;speed=event.impacts[0].speed;velocity={...body.linvel()};}const p=car.npc(3);if(p){maxHeight=Math.max(maxHeight,body.translation().y);if(p.phase==='stunned'){landing=p.position.clone();break;}}}
 const range=landing?Math.hypot(landing.x-origin.x,landing.z-origin.z):0;console.log('full speed flight',{speed,velocity,maxHeight,range,landing:landing?.toArray()});assert.equal(impacts,1);assert.ok(speed>11);assert.ok(landing&&range>=8&&range<=16);
}));

test('boosted outdoor contact caps launch velocity while subsequent real collisions determine the landing',()=>fixture((car,tick,actors,world)=>{
 const origin=new THREE.Vector3(0,0,-120),body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.89,-120)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),controller=world.createCharacterController(.015);actors.set(1,{body,capsule,controller,height:1.75,vertical:0,grounded:true});
 let landing:THREE.Vector3|undefined,speed=0,hits=0;for(let frame=0;frame<900;frame++){const e=tick(hits?{...IDLE,brake:1}:{...IDLE,throttle:1},!hits);if(e.impacts.length){hits++;speed=e.impacts[0].speed;const velocity=body.linvel();assert.ok(Math.hypot(velocity.x,velocity.z)<=14.01,'launch impulse remains capped, independent of later car contact');assert.ok(velocity.y>0&&velocity.y<9);}const s=car.npc(1);if(s?.phase==='stunned'){landing=s.position.clone();break;}}
 const range=landing?Math.hypot(landing.x-origin.x,landing.z-origin.z):0;console.log('boost flight',{speed,range,landing:landing?.toArray()});assert.equal(hits,1);assert.ok(speed>DRIVE_RULES.boostSpeed*.95&&speed<DRIVE_RULES.boostSpeed+.5);assert.ok(landing&&range>=8&&landing.z>-200&&Math.abs(landing.x)<200&&landing.y<.4);
}));

test('stationary contact never launches an NPC and no simulation calls leave all timers unchanged',()=>fixture((car,tick,actors,world)=>{
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.89,10.1)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),controller=world.createCharacterController(.015);actors.set(2,{body,capsule,controller,height:1.75,vertical:0,grounded:true});
 let hits=0;for(let frame=0;frame<240;frame++)hits+=tick({...IDLE,brake:1}).impacts.length;assert.equal(hits,0);assert.equal(car.npc(2),null);const paused=car.read();for(let frame=0;frame<240;frame++)assert.deepEqual(car.read().position.toArray(),paused.position.toArray());
}));

test('steering follows signed input while preserving upright suspension',()=>fixture((car,tick)=>{
 for(let i=0;i<120;i++)tick();for(let i=0;i<150;i++)tick({...IDLE,throttle:.45,steer:-.8});const s=car.read();console.log('left turn',{position:s.position.toArray(),yaw:s.yaw,speed:s.speed});assert.ok(s.position.x< -2);assert.ok(s.yaw>.2);assert.ok(s.rotation.toArray().every(Number.isFinite));assert.ok(!s.resetRequired);
}));

test('four successive real impacts restore each airborne capsule only once after its own landing',()=>fixture((car,tick,actors,world)=>{
 for(let id=0;id<4;id++){const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.89,-16-id*28)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),controller=world.createCharacterController(.015);actors.set(id,{body,capsule,controller,height:1.75,vertical:0,grounded:true});}
 const hits=new Set<number>(),recovered=new Set<number>(),times:number[]=[];let maxConcurrent=0;for(let frame=0;frame<2500&&recovered.size<4;frame++){const e=tick(hits.size<4?{...IDLE,throttle:1}:{...IDLE,brake:1},hits.size<4);for(const h of e.impacts){assert.ok(!hits.has(h.id));hits.add(h.id);times.push(frame/60);}for(const id of e.recovered){assert.ok(!recovered.has(id));recovered.add(id);}maxConcurrent=Math.max(maxConcurrent,[0,1,2,3].filter(id=>car.npc(id)?.phase==='flying').length);}
 console.log('four NPC lifecycle',{hits:[...hits],recovered:[...recovered],times,maxConcurrent,car:car.read().position.toArray()});assert.equal(hits.size,4);assert.equal(recovered.size,4);assert.ok(maxConcurrent>=1);for(const[id,a]of actors){assert.equal(car.npc(id),null);assert.equal(a.thrown,false);assert.ok(a.body.isKinematic());assert.ok(a.body.translation().y>.85&&a.body.translation().y<1);}
}));

test('out-of-bounds recovery needs full car clearance and never overlaps a standing NPC',()=>fixture((car,tick,actors,world)=>{
 for(let frame=0;frame<120;frame++)tick();for(let frame=0;frame<100;frame++)tick({...IDLE,throttle:1});const safe=car.read().position.clone();let chassis:RAPIER.RigidBody|undefined;world.bodies.forEach(body=>{if(body.isDynamic())chassis=body;});assert.ok(chassis);
 for(const[id,p]of [[0,safe],[1,new THREE.Vector3(0,0,12)]] as const){const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y+.90,p.z)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),controller=world.createCharacterController(.015);actors.set(id,{body,capsule,controller,height:1.75,vertical:0,grounded:true});}
 chassis!.setTranslation({x:220,y:2,z:0},true);world.propagateModifiedBodyPositionsToColliders();tick();assert.equal(car.read().resetRequired,true);assert.equal(car.reset(),false,'both saved support and spawn are occupied');
 for(const a of actors.values()){world.removeCharacterController(a.controller);world.removeRigidBody(a.body);}actors.clear();world.propagateModifiedBodyPositionsToColliders();assert.equal(car.reset(),true);const restored=car.read();assert.ok(restored.position.distanceTo(safe)<.1);assert.ok(Math.abs(restored.speed)<.01);assert.ok(!restored.resetRequired);
}));

test('expired stun removes the old body and waits without advancing until a clear reentry point is provided',()=>fixture((car,tick,actors,world)=>{
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.89,-22)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),controller=world.createCharacterController(.015);actors.set(7,{body,capsule,controller,height:1.75,vertical:0,grounded:true});let hit=false,stunFrames=0;
 for(let frame=0;frame<1500;frame++){const e=tick(hit?{...IDLE,brake:1}:{...IDLE,throttle:1});if(e.impacts.length)hit=true;const s=car.npc(7);if(s?.phase==='stunned')stunFrames++;if(s?.phase==='respawning')break;}
 assert.ok(hit&&stunFrames>=590);assert.equal(car.npc(7)?.phase,'respawning');assert.equal(actors.has(7),false,'old physical body is removed');
 const paused=car.npc(7);for(let i=0;i<120;i++)assert.deepEqual(car.npc(7),paused);assert.equal(car.reenter(7,new THREE.Vector3(0,0,-240)),false,'outside driving bounds is not a recovery');
 world.createCollider(RAPIER.ColliderDesc.cuboid(1,1,1).setTranslation(-60,1,60));world.step();world.propagateModifiedBodyPositionsToColliders();assert.equal(car.reenter(7,new THREE.Vector3(-60,0,60)),false,'standing clearance is mandatory');assert.equal(car.npc(7)?.phase,'respawning');
 assert.equal(car.reenter(7,new THREE.Vector3(-70,0,60)),true);assert.equal(car.npc(7),null);assert.ok(actors.get(7)!.body.isKinematic());assert.equal(car.reenter(7,new THREE.Vector3(-80,0,60)),false,'only one body can reenter');
},false));

test('four parallel NPCs fly at the same time, collide with real wall and floor, and all recover after independent ten-second stuns',()=>fixture((car,tick,actors,world)=>{
 const wall=world.createCollider(RAPIER.ColliderDesc.cuboid(10,2,.1).setTranslation(0,2,-28));for(let id=0;id<4;id++){const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-.9+id*.6,.89,-22)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),controller=world.createCharacterController(.015);actors.set(id,{body,capsule,controller,height:1.75,vertical:0,grounded:true});}
 const hits=new Set<number>(),recovered=new Set<number>(),stunFrames=new Map<number,number>();let maxFlying=0,wallContacts=0;for(let frame=0;frame<2000&&recovered.size<4;frame++){
  const e=tick(hits.size<4?{...IDLE,throttle:1}:{...IDLE,brake:1});for(const h of e.impacts)hits.add(h.id);for(const id of e.recovered){assert.ok(!recovered.has(id));recovered.add(id);}maxFlying=Math.max(maxFlying,[0,1,2,3].filter(id=>car.npc(id)?.phase==='flying').length);
  for(const[id,a]of actors){const s=car.npc(id);if(s?.phase==='stunned')stunFrames.set(id,(stunFrames.get(id)??0)+1);if(s){world.contactPair(a.capsule,wall,m=>{if(m.numContacts())wallContacts++;});assert.ok(a.body.translation().z>-28.5,'CCD wall collision bounds the actual flying body');}}
 }
 console.log('simultaneous four',{hits:[...hits],recovered:[...recovered],maxFlying,wallContacts,stunFrames:[...stunFrames]});assert.equal(hits.size,4);assert.equal(maxFlying,4);assert.equal(recovered.size,4);assert.ok(wallContacts>0);for(const[id,a]of actors){assert.ok((stunFrames.get(id)??0)>=590);assert.ok(a.body.isKinematic());assert.equal(car.npc(id),null);}
}));

test('75 km/h turn then handbrake produces visible powered drift, progressive recovery and true world velocity',()=>fixture((car,tick,_actors,world)=>{
 for(let i=0;i<120;i++)tick();let chassis:RAPIER.RigidBody|undefined;world.bodies.forEach(b=>{if(b.isDynamic())chassis=b;});assert.ok(chassis);chassis.setLinvel({x:0,y:0,z:-75/3.6},true);
 // Current 0.6.5 calibration: establish the turn for 0.4 s before a short handbrake pull.
 for(let i=0;i<24;i++)tick({...IDLE,throttle:.4,steer:1});
 let maxAssist=0,maxSlip=0,minUp=1,minContacts=4,maxRearDrive=0,last=car.read().position.clone();
 for(let frame=0;frame<180;frame++){
  tick({...IDLE,throttle:.5,steer:frame<42?1:frame<78?.45:0,handbrake:frame<42});const state=car.read();maxAssist=Math.max(maxAssist,state.handbrakeAssist);maxSlip=Math.max(maxSlip,Math.abs(state.slipAngle));minUp=Math.min(minUp,new THREE.Vector3(0,1,0).applyQuaternion(state.rotation).y);minContacts=Math.min(minContacts,state.wheelContacts);if(state.handbrakeStage==='carry')maxRearDrive=Math.max(maxRearDrive,state.rearDriveScale??0);
  assert.ok(state.position.distanceTo(last)<.65,'movement is integrated continuously, never a forced yaw or teleport');assert.ok(!state.resetRequired);assert.ok(state.velocity.distanceTo(new THREE.Vector3(chassis.linvel().x,chassis.linvel().y,chassis.linvel().z))<1e-8);last.copy(state.position);
 }
 console.log('handbrake physical turn',{maxAssist,maxSlipDegrees:maxSlip*180/Math.PI,minUp,minContacts});
 assert.ok(maxAssist>.8);assert.ok(maxSlip>Math.PI/180*12&&maxSlip<Math.PI/180*25);assert.ok(minUp>.94&&minContacts>=3);assert.equal(car.read().handbrakeAssist,0);assert.equal(car.read().handbrake,false);assert.ok(maxRearDrive>.4,'rear drive returns during powered carry');
 car.stop();assert.equal(car.read().handbrakeAssist,0);assert.ok(car.read().velocity.length()<.01);
}));

test('a press above the current 100 km/h ceiling is braking only and cannot re-arm its drift after slowing',()=>fixture((car,tick,_actors,world)=>{
 for(let i=0;i<120;i++)tick();let chassis:RAPIER.RigidBody|undefined;world.bodies.forEach(b=>{if(b.isDynamic())chassis=b;});assert.ok(chassis);chassis.setLinvel({x:0,y:0,z:-110/3.6},true);
 let maxSlip=0;for(let i=0;i<36;i++){tick({...IDLE,steer:.8,handbrake:true},true);const state=car.read();assert.equal(state.handbrakeAssist,0);maxSlip=Math.max(maxSlip,Math.abs(state.slipAngle));assert.ok(!state.resetRequired);}
 for(let i=0;i<100;i++)tick({...IDLE,steer:.8,handbrake:true});assert.equal(car.read().handbrakeAssist,0,'the original press remains spent even after slowing below the drift speed limit');assert.ok(maxSlip<Math.PI/180*15);
 assert.equal(car.reset(),true);assert.equal(car.read().handbrake,false);assert.equal(car.read().rearDriveScale,1);assert.equal(car.read().handbrakeAssist,0);
}));
