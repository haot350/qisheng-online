// Focused v1.2.1 production physics check. Base collision and navigation stay read-only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';
import {pathMotion} from '../src/path-following.ts';
import {drivePointAllowed,type DriveMap} from '../src/vehicle-physics.ts';
import type {DriveInput} from '../src/types.ts';
const IDLE:DriveInput={steer:0,throttle:0,brake:0,reverse:false,boost:false,reset:false},dt=1/60;
type RegionalMap=DriveMap&{releaseVersion:string;npcRegions:{npcId:number;id:string;label:string;home:[number,number,number];spawnPoints:[number,number,number][];patrolPoints:[number,number,number][]}[]};
const report:{paths:unknown[];car:unknown[];guards:unknown[]}={paths:[],car:[],guards:[]};
async function fixture(run:(world:Awaited<ReturnType<typeof loadWorld>>,map:RegionalMap)=>void){
 const map:RegionalMap=JSON.parse(readFileSync(new URL('../public/map/drive-v121.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(readFileSync(new URL('../public/map/manifest.json',import.meta.url),'utf8'));
 const original=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input);return new Response(url==='/map/manifest.json'?JSON.stringify({...manifest,chunks:[]}):readFileSync(new URL('../public'+url,import.meta.url)));};
 let world:Awaited<ReturnType<typeof loadWorld>>|undefined;
 try{world=await loadWorld(new Scene(),()=>{});run(world,map);}finally{world?.dispose();globalThis.fetch=original;writeFileSync(new URL('../docs/drive-physics-v1.2.1.json',import.meta.url),JSON.stringify(report,null,2));}
}
test('all twelve regional spawns have real capsule support, separated homes and outdoor routes',async()=>fixture((world,map)=>{
 assert.equal(map.releaseVersion,'1.2.1');assert.equal(map.npcRegions.length,4);assert.equal(map.repairs.length,2);
 const car=world.startDriving(map),spawn=new Vector3(...map.spawn);
 for(const region of map.npcRegions){
  assert.equal(region.spawnPoints.length,3);assert.deepEqual(map.npcSpawns[region.npcId],region.home);
  const home=new Vector3(...region.home);assert.ok(home.distanceTo(spawn)>70,'starting car is outside every regional discovery and chase radius');
  for(const other of map.npcRegions)if(other.npcId!==region.npcId)assert.ok(home.distanceTo(new Vector3(...other.home))>50,'regional homes cannot form the old opening cluster');
  for(const p of region.spawnPoints){const position=new Vector3(...p);assert.ok(world.supportAt(position)?.clear,`NPC ${region.npcId} has actual supported capsule clearance at ${p}`);assert.ok(drivePointAllowed(map,position));}
  for(const a of region.patrolPoints)for(const b of region.patrolPoints){
   if(a===b)continue;const route=world.pathOutdoor(new Vector3(...a),new Vector3(...b));assert.ok(route.length>1);assert.ok(route.at(-1)!.distanceTo(new Vector3(...b))<1.5);
   for(let i=0;i<route.length;i++){assert.ok(route[i].distanceTo(home)<26,'patrol stays in the core');if(i){const count=Math.ceil(route[i].distanceTo(route[i-1])/.3);for(let j=0;j<=count;j++)assert.ok(drivePointAllowed(map,route[i-1].clone().lerp(route[i],j/Math.max(1,count))));}}
  }
 }
 car.dispose();
}));
test('regional patrol endpoints remain physically walkable at patrol speed and recovery returns continuously',async()=>fixture((world,map)=>{
 for(const region of map.npcRegions){
  world.resetActors();const car=world.startDriving(map),target=new Vector3(...region.patrolPoints[2]);
  let position=new Vector3(...region.patrolPoints[0]),route:Vector3[]=[];let frames=0,maxMs=0;
  for(;frames<2000&&position.distanceTo(target)>.6;frames++){
   if(frames%54===0){const time=performance.now();route=world.pathOutdoor(position,target);maxMs=Math.max(maxMs,performance.now()-time);assert.ok(route.length>1);}
   position=world.moveActor(region.npcId,position,pathMotion(position,route,2,dt),dt);car.beforeStep({...IDLE,brake:1},false,dt);world.step(dt);car.afterStep(dt);
   assert.ok(drivePointAllowed(map,position));assert.ok(Math.hypot(position.x-region.home[0],position.z-region.home[2])<26);
  }
  assert.ok(position.distanceTo(target)<.6,`NPC ${region.npcId} physically reaches its far patrol point`);
  const home=new Vector3(...region.home);route=world.pathOutdoor(position,home);let returning=0;
  for(;returning<1300&&position.distanceTo(home)>.6;returning++){const before=position.clone();position=world.moveActor(region.npcId,position,pathMotion(position,route,2,dt),dt);world.step(dt);assert.ok(before.distanceTo(position)<.12,'returning is real walking, never a teleport');}
  assert.ok(position.distanceTo(home)<.6);report.paths.push({id:region.npcId,frames,returning,maxMs,remaining:position.distanceTo(home),position:position.toArray()});car.dispose();
 }
}));
test('a real car can reach and physically launch the NPC at every randomized regional spawn',async()=>fixture((world,map)=>{
 for(const region of map.npcRegions)for(const p of region.spawnPoints){
  world.resetActors();const z=p[2]+12,y=1-world.rayDistance(new Vector3(p[0],1,z),new Vector3(0,-1,0),2),car=world.startDriving({...map,spawn:[p[0],y+.02,z],spawnYaw:0});
  let position=new Vector3(...p),hitSpeed=0,frames=0;
  for(;frames<400&&!hitSpeed;frames++){
   position=world.moveActor(region.npcId,position,new Vector3(),dt);car.beforeStep({...IDLE,throttle:.75},false,dt);world.step(dt);
   const hit=car.afterStep(dt).impacts.find(h=>h.id===region.npcId);if(hit)hitSpeed=hit.speed;
   assert.ok(!car.read().resetRequired,'the approach retains suspension support');
  }
  report.car.push({route:'regional-contact',id:region.npcId,point:p,frames,hitSpeed,position:car.read().position.toArray()});
  assert.ok(hitSpeed>=3,`NPC ${region.npcId} at ${p} is genuinely reachable by the car body`);assert.equal(car.npc(region.npcId)?.phase,'flying');car.dispose();
 }
}));
test('car crosses the original road lip, static walls still occlude gun rays and disposal restores pedestrian stairs',async()=>fixture((world,map)=>{
 const car=world.startDriving(map),spawn=new Vector3(...map.spawn);for(let i=0;i<120;i++){car.beforeStep(IDLE,false,dt);world.step(dt);car.afterStep(dt);}
 const target=spawn.clone().add(new Vector3(0,.95,0)),eye=target.clone().add(new Vector3(0,.55,-8)),direction=target.clone().sub(eye).normalize(),range=eye.distanceTo(target);
 assert.ok(world.rayDistance(eye,direction,range)>=range-.01,'the car target cannot occlude its own NPC visibility');assert.ok((car.hitDistance(eye,direction,range)??Infinity)<range,'separate car combat collider remains hittable');
 let maxSpeed=0;for(let i=0;i<360;i++){car.beforeStep(i<260?{...IDLE,throttle:1}:{...IDLE,brake:1},false,dt);world.step(dt);car.afterStep(dt);maxSpeed=Math.max(maxSpeed,Math.abs(car.read().speed));assert.ok(!car.read().resetRequired&&Number.isFinite(car.read().position.y));}
 const state=car.read();report.car.push({route:'administration east road to cross-road',position:state.position.toArray(),maxSpeed});console.log('real campus car',report.car.at(-1));assert.ok(state.position.z< -61&&state.position.y>-.3&&state.position.y<.3,'four wheels cross the existing road lip continuously');
 assert.equal(car.reset(),true);
 const angle=-55*Math.PI/180,p=new Vector3(44+20.3*Math.cos(angle),.18,-124-20.3*Math.sin(angle)),inward=new Vector3(-Math.cos(angle),0,Math.sin(angle)),ray=p.clone().add(new Vector3(0,.8,0)),guard=world.rayDistance(ray,inward,4);
 assert.ok(guard<2,'driving rim guard blocks entrance to the genuine lowered courtyard');car.dispose();const after=world.rayDistance(ray,inward,4);report.guards.push({guard,after});assert.ok(after>guard+.5,'mode-only barrier removal restores the human stair route');
 world.restorePlayer(p,false);assert.ok(world.supportAt(p)?.clear,'a restored walking capsule still uses original local support');
}));

test('real car can turn onto the campus cross-road and continue beside the sports field',async()=>fixture((world,map)=>{
 const car=world.startDriving(map);const points=[[25,-55],[25,-60],[23,-63],[20,-66],[16,-66],[-66,-66],[-70,-66],[-73,-67],[-75.5,-69],[-77,-72],[-77,-96],[-77,-173]];let index=0,frames=0,minY=Infinity,maxY=-Infinity;
 for(;index<points.length&&frames<9500;frames++){
  const state=car.read(),[x,z]=points[index],delta=new Vector3(x-state.position.x,0,z-state.position.z),distance=delta.length();if(distance<2.3){index++;continue;}
  const goal=Math.atan2(-delta.x,-delta.z),error=Math.atan2(Math.sin(goal-state.yaw),Math.cos(goal-state.yaw)),bend=Math.abs(error),speed=Math.abs(state.speed),wanted=bend>.45?2.8:Math.min(6,Math.max(3,distance*.55));
  car.beforeStep({...IDLE,steer:Math.max(-1,Math.min(1,-error*2.8)),throttle:speed<wanted?.55:0,brake:speed>wanted+.8?.25:0},false,dt);world.step(dt);car.afterStep(dt);const next=car.read();minY=Math.min(minY,next.position.y);maxY=Math.max(maxY,next.position.y);assert.ok(!next.resetRequired,'outdoor turns cannot overturn or lose all ground support');
 }
 const final=car.read();report.car.push({route:'gate-crossroad-sports',index,waypoints:points.length,frames,minY,maxY,position:final.position.toArray()});console.log('campus road loop',report.car.at(-1));assert.equal(index,points.length,'the real suspension reaches both tested road turns');car.dispose();
}));

test('canteen and dorm roads support driving while the courtyard guard stops the car above the true lower levels',async()=>fixture((world,map)=>{
 for(const [label,x,z,length]of [['canteen west road',-25,-158,19],['dorm east road',82,-146,23],['courtyard guard',44,-100,5]] as const){
  const y=1-world.rayDistance(new Vector3(x,1,z),new Vector3(0,-1,0),2),car=world.startDriving({...map,spawn:[x,y+.02,z],spawnYaw:0});let minY=Infinity;
  for(let frame=0;frame<270;frame++){car.beforeStep({...IDLE,throttle:1},false,dt);world.step(dt);car.afterStep(dt);minY=Math.min(minY,car.read().position.y);assert.ok(!car.read().resetRequired);}
  const p=car.read().position;report.car.push({route:label,position:p.toArray(),minY});console.log('local route',report.car.at(-1));if(label==='courtyard guard'){assert.ok(p.z>-105&&p.z<z+1,'the car stops before the real sunken opening');assert.ok(minY>-.25);}else assert.ok(p.z<z-length&&minY>-.3);car.dispose();
 }
}));

test('repeated driving start and dispose remove all mode-only bodies before ordinary movement resumes',async()=>fixture((world,map)=>{
 const p=new Vector3(...map.spawn);for(let cycle=0;cycle<6;cycle++){
  const car=world.startDriving(map);for(let frame=0;frame<30;frame++){car.beforeStep(IDLE,false,dt);world.step(dt);car.afterStep(dt);}assert.ok(Number.isFinite(car.read().position.y));car.dispose();assert.equal(car.hitDistance(new Vector3(25,1,-35),new Vector3(0,0,1),15),null);
  world.restorePlayer(p.clone().add(new Vector3(0,.04,0)),false);let position=p.clone().add(new Vector3(0,.04,0));for(let frame=0;frame<30;frame++){position=world.move(position,new Vector3(0,-.01,0),dt,false).position;world.step(dt);}console.log('restart walk',cycle,position.toArray(),world.supportAt(position));assert.ok(world.supportAt(position)?.clear);assert.ok(position.y>-.1);
 }
}));

test('outdoor re-planning routes around the courtyard instead of using lower stairs',async()=>fixture((world,map)=>{
 const car=world.startDriving(map),target=new Vector3(...map.outdoorWaypoints![15]);let position=new Vector3(...map.outdoorWaypoints![17]),route:Vector3[]=[],frames=0,maxMs=0;
 for(;frames<8000&&position.distanceTo(target)>1;frames++){
  if(frames%54===0){const started=performance.now();route=world.pathOutdoor(position,target);maxMs=Math.max(maxMs,performance.now()-started);assert.ok(route.length>1);}
  position=world.moveActor(9,position,pathMotion(position,route,2.9,dt),dt);car.beforeStep(IDLE,false,dt);world.step(dt);car.afterStep(dt);assert.ok(drivePointAllowed(map,position));
 }
 report.paths.push({route:'around-courtyard',frames,maxMs,remaining:position.distanceTo(target),position:position.toArray()});console.log('courtyard outdoor path',report.paths.at(-1));assert.ok(position.distanceTo(target)<1);car.dispose();
}));
