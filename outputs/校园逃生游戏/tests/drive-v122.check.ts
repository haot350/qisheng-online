// Production v16 mesh/Recast/Bao 5 integration, without rendering or generated substitutes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';
import {pathMotion} from '../src/path-following.ts';
import {drivePointAllowed,type DriveMap} from '../src/vehicle-physics.ts';
import type {DriveInput,Vec3} from '../src/types.ts';
import VEHICLE from '../src/vehicle-definition.json' with {type:'json'};
const IDLE:DriveInput={steer:0,throttle:0,brake:0,reverse:false,boost:false,reset:false},dt=1/60;
type RegionalMap=DriveMap&{releaseVersion:string;npcRegions:{npcId:number;id:string;label:string;home:Vec3;spawnPoints:Vec3[];respawnPoints:Vec3[];patrolPoints:Vec3[]}[];collisionSha256:string;navigationSha256:string};
const report:{version:string;vehicle:string;paths:unknown[];cars:unknown[];guards:unknown[];hashes:unknown[]}={version:'1.2.2',vehicle:VEHICLE.model,paths:[],cars:[],guards:[],hashes:[]};
async function fixture(run:(world:Awaited<ReturnType<typeof loadWorld>>,map:RegionalMap)=>void){
 const map:RegionalMap=JSON.parse(readFileSync(new URL('../public/map/drive-v122.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(readFileSync(new URL('../public/map/manifest.json',import.meta.url),'utf8'));
 const original=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input);return new Response(url==='/map/manifest.json'?JSON.stringify({...manifest,chunks:[]}):readFileSync(new URL('../public'+url,import.meta.url)));};
 let world:Awaited<ReturnType<typeof loadWorld>>|undefined;
 try{world=await loadWorld(new Scene(),()=>{});run(world,map);}finally{world?.dispose();globalThis.fetch=original;writeFileSync(new URL('../docs/drive-physics-v1.2.2.json',import.meta.url),JSON.stringify(report,null,2));}
}
const heightAt=(world:Awaited<ReturnType<typeof loadWorld>>,x:number,z:number)=>1-world.rayDistance(new Vector3(x,1,z),new Vector3(0,-1,0),2);
test('all 28 respawn points and both sports patrol loops have exact supported coordinates and real outdoor routes',async()=>fixture((world,map)=>{
 assert.equal(map.releaseVersion,'1.2.2');assert.equal(map.npcRegions.length,4);assert.equal(map.barriers.filter(b=>b.reason==='下沉庭院边缘').length,72);
 const car=world.startDriving(map);
 for(const region of map.npcRegions){
  assert.equal(region.respawnPoints.length,region.npcId===0||region.npcId===3?9:5);
  assert.equal(region.patrolPoints.length,region.npcId===0||region.npcId===3?8:3);
  for(const p of [...region.spawnPoints,...region.respawnPoints,region.home]){assert.ok(world.supportAt(new Vector3(...p))?.clear,`NPC ${region.npcId} has supported clearance at ${p}`);assert.ok(drivePointAllowed(map,new Vector3(...p)));}
  for(const p of region.respawnPoints){const point=new Vector3(...p),home=new Vector3(...region.home);if(point.distanceTo(home)<.1)continue;const route=world.pathOutdoor(point,home);assert.ok(route.length>1&&route.at(-1)!.distanceTo(home)<1.5,'every safe respawn has a complete outdoor return route');}
  for(const a of region.patrolPoints)for(const b of region.patrolPoints){if(a===b)continue;const path=world.pathOutdoor(new Vector3(...a),new Vector3(...b));assert.ok(path.length>1);assert.ok(path.at(-1)!.distanceTo(new Vector3(...b))<1.5);for(let i=0;i<path.length;i++){assert.ok(Math.hypot(path[i].x-region.home[0],path[i].z-region.home[2])<32);if(i){const n=Math.ceil(path[i].distanceTo(path[i-1])/.4);for(let j=0;j<=n;j++)assert.ok(drivePointAllowed(map,path[i-1].clone().lerp(path[i],j/Math.max(1,n))));}}}
 }
 for(const [asset,sha] of [['collision.bin',map.collisionSha256],['navigation.bin',map.navigationSha256]]){const actual=createHash('sha256').update(readFileSync(new URL('../public/map/'+asset,import.meta.url))).digest('hex');assert.equal(actual,sha);report.hashes.push({asset,sha:actual});}
 car.dispose();
}));
test('Bao 5 west courtyard road is free of added air walls across its full length in both directions',async()=>fixture((world,map)=>{
 const before=[26,27,28,29].map(x=>world.rayDistance(new Vector3(x,1,-110),new Vector3(0,0,-1),24));
 const checking=world.startDriving(map);world.step(dt);const after=[26,27,28,29].map(x=>world.rayDistance(new Vector3(x,1,-110),new Vector3(0,0,-1),24));assert.deepEqual(after,before);assert.ok(after.every(d=>d===24));report.guards.push({westRoadRays:after});checking.dispose();
 for(const direction of [-1,1]){const z=direction<0?-98:-149,y=heightAt(world,25,z),car=world.startDriving({...map,spawn:[25,y+.02,z],spawnYaw:direction<0?0:Math.PI});let frames=0,maxDeviation=0,minY=Infinity;
  for(;frames<1000;frames++){car.beforeStep({...IDLE,throttle:.6},false,dt);world.step(dt);car.afterStep(dt);const s=car.read();maxDeviation=Math.max(maxDeviation,Math.abs(s.position.x-25));minY=Math.min(minY,s.position.y);assert.ok(!s.resetRequired);if(direction<0?s.position.z< -147:s.position.z> -100)break;}
  assert.ok(frames<1000,'the complete straight road is traversed');assert.ok(maxDeviation<.6,'the guard cannot deflect the vehicle out of its lane');assert.ok(minY>-.3);report.cars.push({route:'west-courtyard-road',direction,frames,maxDeviation,minY,position:car.read().position.toArray()});car.dispose();
 }
}));
test('the SUV reaches all 28 random return points and launches NPCs through actual body contact',async()=>fixture((world,map)=>{
 for(const region of map.npcRegions)for(const p of region.respawnPoints){world.resetActors();const z=p[2]+12,y=heightAt(world,p[0],z),car=world.startDriving({...map,spawn:[p[0],y+.02,z],spawnYaw:0});let position=new Vector3(...p),hitSpeed=0,frames=0;
  for(;frames<400&&!hitSpeed;frames++){position=world.moveActor(region.npcId,position,new Vector3(),dt);car.beforeStep({...IDLE,throttle:.75},false,dt);world.step(dt);const hit=car.afterStep(dt).impacts.find(h=>h.id===region.npcId);if(hit)hitSpeed=hit.speed;assert.ok(!car.read().resetRequired);}
  assert.ok(hitSpeed>=3,`${region.npcId} at ${p} is physically reachable`);assert.equal(car.npc(region.npcId)?.phase,'flying');report.cars.push({route:'respawn-contact',id:region.npcId,point:p,frames,hitSpeed});car.dispose();
 }
}));
test('sports patrol loops remain continuous walking over the real track and field surfaces',async()=>fixture((world,map)=>{
 for(const region of map.npcRegions.filter(r=>r.npcId===0||r.npcId===3)){world.resetActors();const car=world.startDriving(map);let position=new Vector3(...region.patrolPoints[0]),frames=0,maxStep=0;
  for(let index=1;index<=region.patrolPoints.length;index++){const target=new Vector3(...region.patrolPoints[index%region.patrolPoints.length]),route=world.pathOutdoor(position,target);let segment=0;
   while(position.distanceTo(target)>.7&&segment++<2500){const before=position.clone();position=world.moveActor(region.npcId,position,pathMotion(position,route,2,dt),dt);car.beforeStep({...IDLE,brake:1},false,dt);world.step(dt);car.afterStep(dt);maxStep=Math.max(maxStep,position.distanceTo(before));assert.ok(drivePointAllowed(map,position));frames++;}
   assert.ok(segment<2500,'each real patrol edge remains reachable by a capsule');
  }
  assert.ok(maxStep<.12);report.paths.push({id:region.npcId,route:'sports-loop',frames,maxStep,position:position.toArray()});car.dispose();
 }
}));
test('SUV suspension traverses canteen, dormitory and sports surfaces; genuine descending stairs still block the car',async()=>fixture((world,map)=>{
 for(const [label,x,z,length] of [['canteen-road',-25,-136,39],['dorm-road',82,-130,35],['sports-north',-126,-88,30],['sports-west-track',-145,-88,30],['courtyard-rim',44,-100,0]] as const){world.resetActors();const y=heightAt(world,x,z),car=world.startDriving({...map,spawn:[x,y+.02,z],spawnYaw:0});let minY=Infinity;
  for(let frame=0;frame<390;frame++){car.beforeStep({...IDLE,throttle:.65},false,dt);world.step(dt);car.afterStep(dt);minY=Math.min(minY,car.read().position.y);assert.ok(!car.read().resetRequired);if(label!=='courtyard-rim'&&car.read().position.z<z-length)break;}
  const p=car.read().position;assert.ok(minY>-.3);if(label==='courtyard-rim')assert.ok(p.z> -104,'SUV front bumper stops at the true upper rim');else assert.ok(p.z<z-length,`${label} is traversable`);report.cars.push({route:label,position:p.toArray(),minY});car.dispose();
 }
}));
test('the larger SUV turns from the gate cross-road and continues into the sports field',async()=>fixture((world,map)=>{
 const car=world.startDriving(map);const points=[[25,-55],[25,-60],[23,-63],[20,-66],[16,-66],[-66,-66],[-70,-66],[-73,-67],[-75.5,-69],[-77,-72],[-77,-96],[-77,-173]];let index=0,frames=0,minY=Infinity,maxY=-Infinity;
 for(;index<points.length&&frames<12000;frames++){const state=car.read(),[x,z]=points[index],delta=new Vector3(x-state.position.x,0,z-state.position.z),distance=delta.length();if(distance<2.5){index++;continue;}const goal=Math.atan2(-delta.x,-delta.z),error=Math.atan2(Math.sin(goal-state.yaw),Math.cos(goal-state.yaw)),bend=Math.abs(error),speed=Math.abs(state.speed),wanted=bend>.45?2.8:Math.min(6,Math.max(3,distance*.55));car.beforeStep({...IDLE,steer:Math.max(-1,Math.min(1,-error*2.8)),throttle:speed<wanted?.55:0,brake:speed>wanted+.8?.25:0},false,dt);world.step(dt);car.afterStep(dt);const next=car.read();minY=Math.min(minY,next.position.y);maxY=Math.max(maxY,next.position.y);assert.ok(!next.resetRequired);}
 report.cars.push({route:'gate-crossroad-sports',index,waypoints:points.length,frames,minY,maxY,position:car.read().position.toArray()});assert.equal(index,points.length);car.dispose();
}));
test('disposing mode-only guards restores the exact walking visibility queries and repeated switches do not retain them',async()=>fixture((world,map)=>{
 const angle=-55*Math.PI/180,eye=new Vector3(44+20.3*Math.cos(angle),.98,-124-20.3*Math.sin(angle)),direction=new Vector3(-Math.cos(angle),0,Math.sin(angle)),base=world.rayDistance(eye,direction,4);
 for(let cycle=0;cycle<4;cycle++){const car=world.startDriving(map);world.step(dt);assert.ok(world.rayDistance(eye,direction,4)<base,'mode guards bridge only the existing pedestrian stair aisle');car.dispose();assert.equal(world.rayDistance(eye,direction,4),base);world.restorePlayer(new Vector3(25,.043,-124),false);assert.ok(world.supportAt(new Vector3(25,.043,-124))?.clear);}
 report.guards.push({ordinaryWalkingRayRestored:base});
}));
