// v16 production collision and the unchanged Bao 5: short handbrake turns near real roads/curbs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';
import type {DriveMap} from '../src/vehicle-physics.ts';
import type {DriveInput} from '../src/types.ts';
const IDLE:DriveInput={steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false},dt=1/60;
test('handbrake turns stay supported and physically continuous on gate, teaching, sports, canteen and dorm roads',async()=>{
 const map:DriveMap=JSON.parse(readFileSync(new URL('../public/map/drive-v122.json',import.meta.url),'utf8')),manifest=JSON.parse(readFileSync(new URL('../public/map/manifest.json',import.meta.url),'utf8'));
 const original=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input);return new Response(url==='/map/manifest.json'?JSON.stringify({...manifest,chunks:[]}):readFileSync(new URL('../public'+url,import.meta.url)));};
 let world:Awaited<ReturnType<typeof loadWorld>>|undefined;const records:unknown[]=[];
 try{
  world=await loadWorld(new Scene(),()=>{});
  for(const [name,x,z]of [['gate',25,-48],['teaching',25,-98],['sports',-126,-99],['canteen',-25,-143],['dormitory',82,-133]] as const){
   const y=1-world.rayDistance(new Vector3(x,1,z),new Vector3(0,-1,0),2),car=world.startDriving({...map,spawn:[x,y+.02,z],spawnYaw:0});let maxAssist=0,maxSlip=0,minUp=1,minY=Infinity,minContacts=4,maximumStep=0;
   for(let f=0;f<120;f++){car.beforeStep(IDLE,false,dt);world.step(dt);car.afterStep(dt);}
   for(let f=0;f<180;f++){car.beforeStep({...IDLE,throttle:.75},false,dt);world.step(dt);car.afterStep(dt);if(car.read().speed>=8)break;}
   let previous=car.read().position.clone();
   for(let f=0;f<100;f++){
    car.beforeStep({...IDLE,throttle:f>=30?.4:0,steer:f<30?.7:0,handbrake:f<30},false,dt);world.step(dt);car.afterStep(dt);const s=car.read();maxAssist=Math.max(maxAssist,s.handbrakeAssist);maxSlip=Math.max(maxSlip,Math.abs(s.slipAngle));minUp=Math.min(minUp,new Vector3(0,1,0).applyQuaternion(s.rotation).y);minY=Math.min(minY,s.position.y);minContacts=Math.min(minContacts,s.wheelContacts);maximumStep=Math.max(maximumStep,s.position.distanceTo(previous));previous.copy(s.position);
    assert.ok(!s.resetRequired,`${name}: no flip or void recovery`);assert.ok(s.position.y>-.3,`${name}: ground support`);assert.ok(maximumStep<.5,`${name}: continuous physics`);
    const origin=s.position.clone().add(new Vector3(0,1.12,0)),direction=new Vector3(0,.35,1).applyQuaternion(s.rotation).normalize(),distance=car.cameraDistance(origin,direction,8.5);assert.ok(distance>.1&&distance<=8.5,`${name}: finite camera sweep`);
   }
   assert.ok(maxAssist>.5,`${name}: actual grip assistance engages`);assert.equal(car.read().handbrakeAssist,0,`${name}: released grip recovers`);assert.ok(minUp>.94,`${name}: stays upright`);
   records.push({name,maxAssist,maxSlipDegrees:maxSlip*180/Math.PI,minUp,minY,minContacts,maximumStep,position:car.read().position.toArray()});car.dispose();
  }
  writeFileSync(new URL('../docs/handbrake-physics-v1.3.json',import.meta.url),JSON.stringify({version:'1.3',step:dt,cases:records},null,2));
 }finally{world?.dispose();globalThis.fetch=original;}
});
