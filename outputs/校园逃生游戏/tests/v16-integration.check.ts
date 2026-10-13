// Explicit production-map check: run only after the v16 export is finalized.
// Uses the real collision/navmesh and GameWorld; visual GLB decoding is excluded here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';
import {pathMotion} from '../src/path-following.ts';
import type {MapManifest,Vec3} from '../src/types.ts';
const file=(url:string)=>readFileSync(new URL(`../public${url}`,import.meta.url));
async function fixture(run:(world:Awaited<ReturnType<typeof loadWorld>>,manifest:MapManifest)=>void){
  const manifest:MapManifest=JSON.parse(file('/map/manifest.json').toString());assert.equal(manifest.sourceVersion,'v16','final v16 export is required');assert.equal(manifest.floors?.length,4);
  const original=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input);if(url==='/map/manifest.json')return new Response(JSON.stringify({...manifest,chunks:[]}));return new Response(file(url));};
  let world:Awaited<ReturnType<typeof loadWorld>>|undefined;
  try{world=await loadWorld(new Scene(),()=>{});run(world,manifest);}finally{world?.dispose();globalThis.fetch=original;}
}
function walk(world:Awaited<ReturnType<typeof loadWorld>>,points:Vec3[],actor:number|null){
  let position=new Vector3(...points[0]),vertical=0,grounded=false,index=1,steps=0;const path=points.map(p=>new Vector3(...p));
  for(;index<path.length&&steps<3600;steps++){
    const delta=path[index].clone().sub(position),flat=Math.hypot(delta.x,delta.z);
    if(flat<.13&&Math.abs(delta.y)<.48){index++;continue;}
    delta.y=0;if(flat>1e-6)delta.normalize().multiplyScalar(Math.min(flat,2.8/60));
    const before=position.clone();
    if(actor===null){vertical=grounded?-.25:Math.max(-20,vertical-14/60);delta.y=vertical/60;const moved=world.move(position,delta,1/60,false);position=moved.position;grounded=moved.grounded;}
    else position=world.moveActor(actor,position,delta,1/60);
    world.step(1/60);
    assert.ok(Math.abs(position.y-before.y)<.5,'a frame cannot teleport to another floor');assert.ok(Number.isFinite(position.y)&&position.y>-5);
  }
  const target=path.at(-1)!;return {position:position.toArray(),distance:position.distanceTo(target),steps,complete:index===path.length};
}
test('production v16 entry and both stairs carry player and NPC continuously to all four floors',async()=>fixture((world,manifest)=>{
  const entry:Vec3[]=[[-31.65,.06,-86],[-31.65,.61,-83.12],[-31.65,.61,-80.5]];
  const entrance=walk(world,entry,null);console.log('north entry',entrance);assert.ok(entrance.complete&&entrance.distance<.6,'original opened entrance is physically passable');
  assert.equal(manifest.stairRoutes?.length,6);
  for(const route of manifest.stairRoutes!){for(const reverse of [false,true]){
    const points=reverse?[...route.points].reverse():route.points;world.resetActors();world.move(new Vector3(0,0,0),new Vector3(),1/60,false);
    const npc=walk(world,points,1);console.log(`NPC ${route.core} ${reverse?route.to_floor:route.from_floor}→${reverse?route.from_floor:route.to_floor}`,npc);assert.ok(npc.complete&&npc.distance<.6,'NPC traverses real stair collision');
    world.resetActors();const player=walk(world,points,null);assert.ok(player.complete&&player.distance<.6,'player traverses real stair collision');
    const from=new Vector3(...points[0]),to=new Vector3(...points.at(-1)!);const path=world.path(from,to);
    assert.ok(path.length>1,'the navigation mesh connects the staircase');assert.ok(path.at(-1)!.distanceTo(to)<1,'navigation reaches the requested floor rather than a partial lower-floor route');
    world.resetActors();world.move(new Vector3(0,0,0),new Vector3(),1/60,false);const npcNavigation=walk(world,path.map(p=>p.toArray()),2);
    console.log(`nav-follow ${route.core} ${reverse?'down':'up'}`,npcNavigation);assert.ok(npcNavigation.complete&&npcNavigation.distance<.6,'NPC follows the actual Recast path through physical stair geometry');
  }}
}));
test('production navigation reaches the south teaching corridor from the actual outdoor spawn',async()=>fixture((world,manifest)=>{
  const spawn=new Vector3(...manifest.spawn);
  for(const floor of manifest.floors!){const target=new Vector3(-51,floor.elevation,-77.4),path=world.path(spawn,target);assert.ok(path.length>1,`spawn route to floor ${floor.id}`);assert.ok(path.at(-1)!.distanceTo(target)<1.5,`complete route to floor ${floor.id}`);}
}));
test('one NPC can pursue continuously from the outdoor spawn to the fourth floor while replanning on stairs',async()=>fixture((world,manifest)=>{
  let position=new Vector3(...manifest.spawn),route:Vector3[]=[];const target=new Vector3(-51,manifest.floors!.at(-1)!.elevation,-77.4);
  let steps=0,highest=position.y;
  for(;steps<6000&&position.distanceTo(target)>.7;steps++){
    if(steps%54===0)route=world.path(position,target);
    const desired=pathMotion(position,route,2.9,1/60);
    const before=position.clone();position=world.moveActor(3,position,desired,1/60);highest=Math.max(highest,position.y);
    world.step(1/60);
    assert.ok(Math.abs(position.y-before.y)<.5,'replanning cannot relocate the capsule to another floor');
  }
  console.log('continuous spawn→fourth floor NPC', {steps,position:position.toArray(),distance:position.distanceTo(target),highest});
  assert.ok(position.distanceTo(target)<.7,'one persistent NPC capsule reaches the fourth-floor target');
}));
test('all five outdoor clues are reachable in both directions with continuous NPC replanning',async()=>fixture((world,manifest)=>{
 for(const clue of manifest.clues){for(const reverse of [false,true]){
  world.resetActors();world.move(new Vector3(0,0,0),new Vector3(),1/60,false);
  const target=new Vector3(...(reverse?manifest.spawn:clue.position));let position=new Vector3(...(reverse?clue.position:manifest.spawn)),route:Vector3[]=[],steps=0;
  for(;steps<11400&&position.distanceTo(target)>1;steps++){
   if(steps%54===0)route=world.path(position,target);
   const desired=pathMotion(position,route,2.9,1/60);
   const before=position.clone();position=world.moveActor(4,position,desired,1/60);assert.ok(Math.abs(position.y-before.y)<.5);
   world.step(1/60);
  }
  console.log(`continuous ${clue.id} ${reverse?'return':'outbound'}`,{steps,position:position.toArray(),distance:position.distanceTo(target)});
  assert.ok(position.distanceTo(target)<1,`${clue.id} ${reverse?'return':'outbound'} reaches the target with actual NPC collision`);
 }}
}));
test('both staircases support every up and down segment while continuously replanning',async()=>fixture((world,manifest)=>{
 for(const item of manifest.stairRoutes!){for(const reverse of [false,true]){
  world.resetActors();world.move(new Vector3(0,0,0),new Vector3(),1/60,false);
  const points=reverse?[...item.points].reverse():item.points,target=new Vector3(...points.at(-1)!);let position=new Vector3(...points[0]),route:Vector3[]=[],steps=0;
  for(;steps<3600&&position.distanceTo(target)>.3;steps++){
   if(steps%54===0)route=world.path(position,target);
   const before=position.clone();position=world.moveActor(5,position,pathMotion(position,route,2.9,1/60),1/60);assert.ok(Math.abs(position.y-before.y)<.5);
   world.step(1/60);
  }
  console.log(`continuous stair ${item.core} ${reverse?item.to_floor:item.from_floor}→${reverse?item.from_floor:item.to_floor}`,{steps,distance:position.distanceTo(target)});
  assert.ok(position.distanceTo(target)<.3,`continuous ${item.core} ${reverse?'down':'up'} reaches its landing`);
 }}
}));
test('a target partway up the same real flight does not send the NPC to the wrong landing',async()=>fixture((world,manifest)=>{
 for(const item of manifest.stairRoutes!){
  world.resetActors();world.move(new Vector3(0,0,0),new Vector3(),1/60,false);
  const a=item.points[3],b=item.points[8],target=new Vector3(...b);let position=new Vector3(...a),route:Vector3[]=[];
  for(let steps=0;steps<1200&&position.distanceTo(target)>.3;steps++){
   if(steps%54===0)route=world.path(position,target);
   position=world.moveActor(6,position,pathMotion(position,route,2.9,1/60),1/60);
   world.step(1/60);
  }
  assert.ok(position.distanceTo(target)<.3,`same-flight target ${item.core} ${item.from_floor}`);
 }
}));
test('reserved room 08 stays closed on every level and navigation never invents a fifth floor',async()=>fixture((world,manifest)=>{
 for(const floor of manifest.floors!){
  world.resetActors();world.move(new Vector3(0,0,0),new Vector3(),1/60,false);
  const start=new Vector3(-38.8,floor.elevation,-78.3),wall=world.rayDistance(start.clone().add(new Vector3(0,1,0)),new Vector3(0,0,-1),3);let npc=start.clone();
  assert.ok(wall<1.2,'a real wall exists across the reserved entrance');
  for(let frame=0;frame<120;frame++){npc=world.moveActor(7,npc,new Vector3(0,0,-.05),1/60);world.step(1/60);}
  console.log(`closed room 08 level ${floor.id}`,{position:npc.toArray(),wall});assert.ok(npc.z>start.z-wall+.25,'the original closed boundary blocks the NPC capsule before its centre reaches the wall');
  world.resetActors();let player=start.clone(),vertical=0,grounded=false;
  for(let frame=0;frame<120;frame++){vertical=grounded?-.25:Math.max(-20,vertical-14/60);const result=world.move(player,new Vector3(0,vertical/60,-.05),1/60,false);player=result.position;grounded=result.grounded;world.step(1/60);}
  assert.ok(player.z>start.z-wall+.25,'the same boundary blocks the player');
 }
 for(const stair of manifest.stairRoutes!.filter(r=>r.to_floor===4)){
  const from=new Vector3(...stair.points.at(-1)!),to=from.clone().setY(16.38),path=world.path(from,to);
  assert.ok(path.length===0||path.at(-1)!.y<13.5,'the fifth floor cannot be reached by snapping to an invented navigation surface');
 }
}));
