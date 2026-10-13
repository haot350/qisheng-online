import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Scene,Vector3} from 'three';
import {loadWorld,type GameWorld} from '../src/world.ts';
import {pathMotion} from '../src/path-following.ts';
const manifest=JSON.parse(readFileSync(new URL('../public/map/manifest.json',import.meta.url),'utf8'));
const report:any={version:'Preview 0.3.1',environment:'Node + actual v16 Rapier/Recast; player and six simultaneous NPC capsules; fixed one 1/60 world step per frame.',cases:[]};
async function fixture(run:(world:GameWorld)=>void){const old=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input);return new Response(url==='/map/manifest.json'?JSON.stringify({...manifest,chunks:[]}):readFileSync(new URL('../public'+url,import.meta.url)));};let world:GameWorld|undefined;try{world=await loadWorld(new Scene(),()=>{});run(world);}finally{world?.dispose();globalThis.fetch=old;}}
function along(points:Vector3[],distance:number){for(let i=1;i<points.length;i++){const len=points[i].distanceTo(points[i-1]);if(distance<=len)return points[i-1].clone().lerp(points[i],distance/len);distance-=len;}return points.at(-1)!.clone();}
function runMixed(world:GameWorld,item:any,opposing:boolean){
 world.resetActors();const line=item.points.map((p:number[])=>new Vector3(...p)),length=line.slice(1).reduce((sum:number,p:Vector3,i:number)=>sum+p.distanceTo(line[i]),0);
 let player=along(line,opposing?.3:5.5),vertical=0,grounded=false,playerPath:Vector3[]=[],playerComplete=false;
 const playerTarget=new Vector3(-51,line.at(-1)!.y,-77.4);const playerSupport=world.supportAt(playerTarget,1.75);assert.ok(playerSupport?.clear,'real upper landing has enough supported exit space');playerTarget.y=playerSupport!.height;
 world.restorePlayer(player,false);world.step(1/60);
 const npcs=Array.from({length:6},(_,id)=>({id,position:along(line,opposing?length-.3-id*.85:.3+id*.85),target:opposing?line[0].clone():line.at(-1)!.clone(),path:[] as Vector3[],complete:false}));
 let frames=0,maxYDelta=0,minPairDistance=Infinity,yieldFrames=0,playerStall=0,maxPlayerStall=0;
 for(;frames<3600&&(!playerComplete||npcs.some(n=>!n.complete));frames++){
  if(frames%30===0||!playerPath.length)playerPath=world.path(player,playerTarget);const desired=playerComplete?new Vector3():pathMotion(player,playerPath,3.4,1/60);vertical=grounded?-.25:Math.max(-20,vertical-14/60);desired.y=vertical/60;const before=player.clone(),moved=world.move(player,desired,1/60,false);player=moved.position;grounded=moved.grounded;maxYDelta=Math.max(maxYDelta,Math.abs(player.y-before.y));
  if(!playerComplete&&Math.hypot(desired.x,desired.z)>.001&&Math.hypot(player.x-before.x,player.z-before.z)<.005)playerStall++;else playerStall=0;maxPlayerStall=Math.max(maxPlayerStall,playerStall);if(player.distanceTo(playerTarget)<.4)playerComplete=true;
  for(const n of npcs){if(n.complete)continue;if(frames%30===0||!n.path.length)n.path=world.actorPath(n.id,n.position,n.target);const previous=n.position.clone();n.position=world.moveActor(n.id,n.position,pathMotion(n.position,n.path,2.9,1/60),1/60);maxYDelta=Math.max(maxYDelta,Math.abs(n.position.y-previous.y));if(world.actorNavigationStatus(n.id)?.yielding)yieldFrames++;if(Math.abs(n.position.y-player.y)<.5)minPairDistance=Math.min(minPairDistance,Math.hypot(n.position.x-player.x,n.position.z-player.z));if(n.position.distanceTo(n.target)<.55){n.complete=true;world.removeActor(n.id);}}
  world.step(1/60);assert.ok(maxYDelta<.5&&player.y>-5&&npcs.every(n=>n.position.y>-5),'no teleport or loss of static support');
 }
 return {core:item.core,opposing,frames,seconds:frames/60,complete:playerComplete&&npcs.every(n=>n.complete),playerComplete,player:player.toArray(),playerTarget:playerTarget.toArray(),maxYDelta,minPairDistance,yieldFrames,maxPlayerStallSeconds:maxPlayerStall/60,npcs:npcs.map(n=>({id:n.id,complete:n.complete,position:n.position.toArray(),distance:n.position.distanceTo(n.target)}))};
}
for(const item of manifest.stairRoutes.filter((r:any)=>r.from_floor===1))for(const opposing of [false,true])test('real player + six NPCs on stair '+item.core+' '+(opposing?'opposing':'same direction'),async()=>fixture(world=>{const result=runMixed(world,item,opposing);report.cases.push(result);console.log(JSON.stringify(result));assert.ok(result.complete,'player and all six NPC capsules must pass the platform turn within 60 simulated seconds');}));
after(()=>writeFileSync(new URL('../docs/v0.3.1/navigation-player-crowd.json',import.meta.url),JSON.stringify(report,null,2)));
