// Small production-resource regression for the reported outdoor holes. It is
// separate from unit tests because it requires the finalized physical export.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';
import type {MapManifest} from '../src/types.ts';

const report:{standing:unknown[];stairs:unknown[];blockedBasements:unknown[];sourceVersion?:string;physicsRevision?:string}={standing:[],stairs:[],blockedBasements:[]};
async function fixture(run:(world:Awaited<ReturnType<typeof loadWorld>>,manifest:MapManifest)=>void){
 const manifest:MapManifest=JSON.parse(readFileSync(new URL('../public/map/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.sourceVersion,'v16');assert.equal((manifest as any).physicsRevision,'v1.1-support-20261002');
 const original=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input);return new Response(url==='/map/manifest.json'?JSON.stringify({...manifest,chunks:[]}):readFileSync(new URL('../public'+url,import.meta.url)));};
 let world:Awaited<ReturnType<typeof loadWorld>>|undefined;
 try{world=await loadWorld(new Scene(),()=>{});report.sourceVersion=manifest.sourceVersion;report.physicsRevision=(manifest as any).physicsRevision;run(world,manifest);}
 finally{world?.dispose();globalThis.fetch=original;writeFileSync(new URL('../docs/support-physics-v1.1.json',import.meta.url),JSON.stringify(report,null,2));}
}
const cases:[string,[number,number,number]][]=[['下沉广场坐阶',[54,-2,-124]],['食堂东侧地面',[20,-.01,-162]],['食堂前部通桥',[-5,.155,-140]],['下沉广场东侧底面',[50,-2.36,-125]],['庭院西侧衔接',[29,-.01,-124]],['食堂周边石板步道',[17,.16,-160]],['通桥东侧',[6,.155,-130]]];

test('confirmed holes and their immediate neighbours support standing player and NPC for 120 frames',async()=>fixture(world=>{
 for(const [label,start] of cases){for(const offset of [[0,0],[.2,0],[-.2,0],[0,.2],[0,-.2]]){
  world.resetActors();const x=start[0]+offset[0],z=start[2]+offset[1],drop=world.rayDistance(new Vector3(x,.8,z),new Vector3(0,-1,0),4),floor=.8-drop;
  assert.ok(drop<4,`${label} has its original local support, including neighbouring step levels`);
  let player=new Vector3(x,floor+.04,z),vertical=0,grounded=false;
  world.restorePlayer(player,false);
  for(let frame=0;frame<120;frame++){vertical=grounded?-.25:Math.max(-20,vertical-14/60);const moved=world.move(player,new Vector3(0,vertical/60,0),1/60,false);player=moved.position;grounded=moved.grounded;world.step(1/60);assert.ok(player.y>start[1]-.5,`${label} cannot fall through its original support`);}
  assert.ok(grounded,`${label} retains actual capsule contact`);
  assert.ok(world.rayDistance(player.clone().add(new Vector3(0,.3,0)),new Vector3(0,-1,0),.8)<.8,`${label} has static ground beneath the capsule`);
  world.restorePlayer(new Vector3(0,.15,-15),false);let npc=new Vector3(x,floor+.04,z);
  for(let frame=0;frame<120;frame++){npc=world.moveActor(20,npc,new Vector3(),1/60);world.step(1/60);}
  assert.ok(npc.y>start[1]-.5&&npc.y<start[1]+.5,`${label} uses the same real support for NPC`);
  report.standing.push({label,offset,start,player:player.toArray(),npc:npc.toArray(),grounded});
 }}
}));

test('four courtyard stair aisles preserve continuous ascent and descent through the original levels',async()=>fixture(world=>{
 for(const degrees of [-131,-55,55,131])for(const reverse of [false,true]){
  const angle=degrees*Math.PI/180,at=(r:number,y:number)=>new Vector3(44+r*Math.cos(angle),y,-124-r*Math.sin(angle));
  const path=[at(19.3,.18),at(18.55,.18),at(8.75,-2.35),at(8.1,-2.36)];if(reverse)path.reverse();
  world.resetActors();let player=path[0].clone().add(new Vector3(0,.04,0)),vertical=0,grounded=false,index=1,frames=0;world.restorePlayer(player,false);
  for(;index<path.length&&frames<900;frames++){
   const delta=path[index].clone().sub(player),flat=Math.hypot(delta.x,delta.z);if(flat<.13&&Math.abs(delta.y)<.4){index++;continue;}
   delta.y=0;if(flat>0)delta.normalize().multiplyScalar(Math.min(flat,2.8/60));vertical=grounded?-.25:Math.max(-20,vertical-14/60);delta.y=vertical/60;
   const previous=player.clone(),moved=world.move(player,delta,1/60,false);player=moved.position;grounded=moved.grounded;
   world.step(1/60);
   assert.ok(player.y>-2.65&&Math.abs(player.y-previous.y)<.45,'stair contact cannot drop into the void or skip levels');
  }
  const distance=player.distanceTo(path.at(-1)!);report.stairs.push({degrees,direction:reverse?'up':'down',frames,position:player.toArray(),distance});
  assert.ok(index===path.length&&distance<.5,`${degrees}° ${reverse?'up':'down'} reaches the original landing`);
 }
}));

test('the existing canteen basement openings remain physically blocked',async()=>fixture(world=>{
 for(const [label,x,z] of [['西地下食堂',-12,-135.8],['东地下食堂',12,-135.8]] as const){
  let position=new Vector3(x,.2,z),vertical=0,grounded=false;world.restorePlayer(position,false);
  const wall=world.rayDistance(position.clone().add(new Vector3(0,.8,0)),new Vector3(0,0,-1),4);
  assert.ok(wall<1.2,'source safety boundary remains closed');
  for(let frame=0;frame<120;frame++){vertical=grounded?-.25:Math.max(-20,vertical-14/60);const result=world.move(position,new Vector3(0,vertical/60,-.05),1/60,false);position=result.position;grounded=result.grounded;world.step(1/60);}
  assert.ok(position.z>-136.65&&position.y>-.35,'a player cannot enter the unbuilt basement');report.blockedBasements.push({label,wall,position:position.toArray()});
 }
}));
