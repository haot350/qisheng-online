import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';
import {configureDrivingStart,DRIVING_STARTS} from '../src/driving-guidance.ts';
import type {DriveMap} from '../src/vehicle-physics.ts';
import {DRIVE_IDLE} from './drivetrain-fixture.ts';
test('new driving start is clear, supported, and drives naturally onto the actual sports ground',async()=>{
 const map:DriveMap=JSON.parse(readFileSync(new URL('../public/map/drive-v122.json',import.meta.url),'utf8')),manifest=JSON.parse(readFileSync(new URL('../public/map/manifest.json',import.meta.url),'utf8'));
 const original=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input);return new Response(url==='/map/manifest.json'?JSON.stringify({...manifest,chunks:[]}):readFileSync(new URL('../public'+url,import.meta.url)));};
 let world:Awaited<ReturnType<typeof loadWorld>>|undefined;
 try{
  world=await loadWorld(new Scene(),()=>{});const candidates=DRIVING_STARTS.map(c=>({point:c.position,yaw:c.yaw,validated:world!.validateDrivingSpawn(map,c.position,c.yaw)}));
  assert.ok(candidates.every(c=>c.validated));assert.equal(world.validateDrivingSpawn(map,[1000,0,1000],0),null);
  const configured=configureDrivingStart(map,(point,yaw)=>world!.validateDrivingSpawn(map,point,yaw)),car=world.startDriving(configured);let minUp=1,minContacts=4,airtime=0,maxAirTime=0,maxY=-Infinity,maxStep=0;const supportChanges:unknown[]=[];
  for(let i=0;i<120;i++){car.beforeStep({...DRIVE_IDLE,brake:1},false,1/60);world.step(1/60);car.afterStep(1/60);}
  const start=car.read();assert.equal(start.wheelContacts,4);assert.ok(car.reset());
  let previous=car.read().position.clone();
  for(let i=0;i<300;i++){car.beforeStep({...DRIVE_IDLE,throttle:1},false,1/60);world.step(1/60);car.afterStep(1/60);const s=car.read();minUp=Math.min(minUp,new Vector3(0,1,0).applyQuaternion(s.rotation).y);minContacts=Math.min(minContacts,s.wheelContacts);airtime=s.wheelContacts===0?airtime+1/60:0;maxAirTime=Math.max(maxAirTime,airtime);maxY=Math.max(maxY,s.position.y);maxStep=Math.max(maxStep,s.position.distanceTo(previous));previous.copy(s.position);if(s.wheelContacts<3&&supportChanges.length<20)supportChanges.push({frame:i,contacts:s.wheelContacts,position:s.position.toArray()});assert.ok(!s.resetRequired);assert.ok(s.position.y>-.3);}
  const end=car.read();
  mkdirSync(new URL('../docs/v0.6.5/',import.meta.url),{recursive:true});writeFileSync(new URL('../docs/v0.6.5/driving-start.json',import.meta.url),JSON.stringify({source:'Unchanged v16 collision/navigation and drive-v122.json; no visual chunks loaded in this Node test',candidates,configuredSpawn:configured.spawn,yaw:configured.spawnYaw,start:start.position.toArray(),end:end.position.toArray(),minUp,minContacts,maxAirTime,maxY,maxStep,finalContacts:end.wheelContacts,supportChanges},null,2));
  assert.ok(end.position.x< -110,'the westward start leads onto the sports ground');assert.ok(minUp>.92,'curb crossing does not roll the car');assert.ok(maxAirTime<.3,`curb wheel unloading must remain brief (${maxAirTime}s)`);assert.ok(maxY<.8,'curb cannot launch the car');assert.ok(maxStep<.7,'no teleport or safety-reset jump');assert.equal(end.wheelContacts,4,'suspension regains full support after the curb');car.dispose();
 }finally{world?.dispose();globalThis.fetch=original;}
});
