import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';
import {VALIDATED_ESCAPE_SITES,VALIDATED_ESCAPE_SPAWN} from '../src/escape/index.ts';

test('current runtime corner threshold and thirty-frame replanning walk gate to teaching-road without wall stall',async()=>{
 const engine=readFileSync(new URL('../src/engine.ts',import.meta.url),'utf8');
 const match=engine.match(/while\s*\(\s*escapeRoute\.length\s*&&\s*escapeRoute\[0\]\.distanceTo\(position\)\s*<\s*([.\d]+)\s*\)/);
 assert.ok(match,'read the real runtime guide threshold, rather than a separately configured test value');
 const threshold=Number(match[1]);assert.ok(threshold>0&&threshold<=.3,'intermediate guide nodes must not remove a corner from more than .3m away');
 const original=globalThis.fetch,file=(url:string)=>readFileSync(new URL('../public'+url,import.meta.url)),manifest=JSON.parse(file('/map/manifest.json').toString());
 const report:any={createdAt:new Date().toISOString(),threshold,replanFrames:30,source:'world.path and real Rapier player capsule',start:VALIDATED_ESCAPE_SPAWN,target:VALIDATED_ESCAPE_SITES.find(s=>s.id==='teaching-supply')!.position,ok:false};
 globalThis.fetch=async input=>String(input)==='/map/manifest.json'?new Response(JSON.stringify({...manifest,chunks:[]})):new Response(file(String(input)));
 let world:Awaited<ReturnType<typeof loadWorld>>|undefined;
 try{
  world=await loadWorld(new Scene(),()=>{});world.resetActors();let position=new Vector3(...report.start),route:Vector3[]=[],vertical=0,grounded=false,steps=0,stallChecks=0,last=position.clone(),maxStall=0;
  const target=new Vector3(...report.target);world.restorePlayer(position,false);world.step(1/60);
  for(;steps<6000&&position.distanceTo(target)>.3;steps++){
   if(steps%30===0)route=world.path(position,target);
   // Match the runtime updateGoal removal rule, including vertical distance.
   while(route.length&&route[0].distanceTo(position)<threshold)route.shift();
   const desired=(route[0]??target).clone().sub(position);desired.y=0;if(desired.length()>1e-6)desired.normalize().multiplyScalar(3.4/60);
   vertical=grounded?-.25:Math.max(-20,vertical-14/60);desired.y=vertical/60;const before=position.clone(),moved=world.move(position,desired,1/60,false);position=moved.position;grounded=moved.grounded;world.step(1/60);
   assert.ok(Math.abs(position.y-before.y)<.5,'one update cannot teleport to another floor');
   if(steps%120===119){stallChecks=position.distanceTo(last)<.08?stallChecks+1:0;maxStall=Math.max(maxStall,stallChecks);last.copy(position);assert.ok(stallChecks<3,`guide cannot lead the player into the old wall stall at ${position.toArray()}`);}
  }
  report.steps=steps;report.seconds=steps/60;report.position=position.toArray();report.distance=position.distanceTo(target);report.maxStallChecks=maxStall;
  assert.ok(position.distanceTo(target)<=.3,'continuous guided walking reaches the teaching-road task');report.ok=true;
 }catch(error){report.error=String(error);throw error;}finally{world?.dispose();globalThis.fetch=original;writeFileSync(new URL('../docs/v0.3.0/escape-navigation-regression.json',import.meta.url),JSON.stringify(report,null,2));}
});
