import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {drivetrainFixture,DRIVE_IDLE as IDLE} from './drivetrain-fixture.ts';
const results:Record<string,unknown>={};
const gas={...IDLE,throttle:1};
after(async()=>{await mkdir(new URL('../docs/v0.3.0/',import.meta.url),{recursive:true});await writeFile(new URL('../docs/v0.3.0/drivetrain-physics.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),environment:'Node.js + production Rapier 0.19.3, flat/curb/wall fixtures, fixed 1/60s; not campus or Safari validation',...results},null,2));});
test('real automatic acceleration, ordinary/boost caps and a smooth boost exit',async()=>{
 const f=await drivetrainFixture();try{
  let zeroTo60:number|undefined,maximum=0;for(let frame=0;frame<1200;frame++){f.tick(gas);const s=f.car.read();if(zeroTo60===undefined&&s.speed>=60/3.6)zeroTo60=(frame+1)/60;maximum=Math.max(maximum,s.speed);assert.ok(!s.resetRequired);}
  const normal=f.car.read();results.acceleration={zeroTo60,normalKmh:normal.speed*3.6,normalMaximumKmh:maximum*3.6,normalGear:normal.gear,rpm:normal.rpm};
  assert.ok(zeroTo60!==undefined&&zeroTo60>=4&&zeroTo60<=5.1,`0-60 took ${zeroTo60}s`);assert.ok(normal.speed>=89/3.6&&normal.speed<=90.5/3.6);assert.equal(normal.gear,6);
  f.run(20,gas,true);const boost=f.car.read();assert.ok(boost.speed>=119/3.6&&boost.speed<=120.5/3.6);f.tick(gas,false);const first=f.car.read();assert.ok(first.speed>boost.speed-.4,'boost expiry never crops linear velocity');f.run(8,gas);const settled=f.car.read();assert.ok(settled.speed<=90.5/3.6);
  results.acceleration={...(results.acceleration as object),boostKmh:boost.speed*3.6,boostGear:boost.gear,boostRpm:boost.rpm,exitFirstKmh:first.speed*3.6,afterEightSecondsKmh:settled.speed*3.6,...f.metrics()};
 }finally{f.dispose();}
});
test('90 km/h foot braking remains supported, and reverse/forward preserve manual gear choice',async()=>{
 const f=await drivetrainFixture();try{
  f.run(20,gas);const start=f.car.read().position.clone();let brakingTime=0;for(let frame=0;frame<240;frame++){f.tick({...IDLE,brake:1});brakingTime=(frame+1)/60;assert.ok(!f.car.read().resetRequired);if(Math.abs(f.car.read().speed)<.2)break;}const stop=f.car.read();assert.ok(Math.abs(stop.speed)<.2);const distance=stop.position.distanceTo(start);assert.ok(distance>=35&&distance<=45);assert.ok(brakingTime>=2.7&&brakingTime<=3.3);results.braking={brakingTime,distance,upY:new THREE.Vector3(0,1,0).applyQuaternion(stop.rotation).y,...f.metrics()};
  f.car.setTransmission('manual');f.car.shift(1);f.run(.5);f.car.shift(1);f.run(.5);const chosen=f.car.read().gear;assert.ok(chosen>1);f.run(3,{...gas,reverse:true});assert.equal(f.car.read().gear,-1);assert.ok(f.car.read().speed< -3.5&&f.car.read().speed> -4.2);f.run(2,gas);assert.equal(f.car.read().gear,chosen);assert.ok(f.car.read().speed>0);assert.ok(f.car.reset());assert.equal(f.car.read().gear,1);assert.equal(f.car.read().transmission,'manual');
 }finally{f.dispose();}
});
test('manual wrong gears alter real acceleration and an over-rev downshift leaves the car continuous',async()=>{
 const f=await drivetrainFixture();try{
  f.car.setTransmission('manual');f.run(8,gas);const low=f.car.read();assert.ok(low.speed<35/3.6);assert.ok(low.rpm>6200);
  assert.ok(f.car.reset());for(let n=0;n<5;n++){assert.ok(f.car.shift(1));f.run(.5);}f.run(4,gas);const high=f.car.read();assert.equal(high.gear,6);assert.ok(high.speed<low.speed*.6,'sixth at idle is genuinely weak');
  f.car.setTransmission('auto');f.run(20,gas);f.car.setTransmission('manual');assert.ok(f.car.shift(-1));f.run(.5,gas);assert.ok(f.car.shift(-1));f.run(.5,gas);const before=f.car.read();assert.equal(before.gear,4);assert.equal(f.car.shift(-1),false);const after=f.car.read();assert.equal(after.gear,4);assert.equal(after.rejectedShiftSerial,before.rejectedShiftSerial+1);assert.equal(after.position.distanceTo(before.position),0);assert.equal(after.velocity.distanceTo(before.velocity),0);
  results.manual={firstGearKmh:low.speed*3.6,firstGearRpm:low.rpm,sixthAfterFourSecondsKmh:high.speed*3.6,rejectedAtKmh:after.speed*3.6,...f.metrics()};
 }finally{f.dispose();}
});
test('120 km/h chassis CCD hits a thin real wall without tunnelling',async()=>{
 const f=await drivetrainFixture();try{
  f.world.createCollider(RAPIER.ColliderDesc.cuboid(8,2,.025).setTranslation(0,2,-500));let minZ=Infinity,maximum=0;for(let frame=0;frame<1800;frame++){f.tick(gas,true);const s=f.car.read();minZ=Math.min(minZ,s.position.z);maximum=Math.max(maximum,s.speed);assert.ok(s.position.toArray().every(Number.isFinite));assert.ok(s.position.z> -498,'chassis stays in front of the wall');}
  assert.ok(maximum>119/3.6);assert.ok(f.car.read().position.z< -496);assert.ok(Math.abs(f.car.read().speed)<1);results.wall={maximumKmh:maximum*3.6,minZ,finalSpeed:f.car.read().speed,...f.metrics()};
 }finally{f.dispose();}
});
test('high-speed ray wheels cross a low curb and limited steering keeps an upright supported car',async()=>{
 const f=await drivetrainFixture();try{
  f.world.createCollider(RAPIER.ColliderDesc.cuboid(6,.06,.5).setTranslation(0,.06,-400));let minUp=1,maxY=-Infinity,minY=Infinity,previous=f.car.read().position.clone();for(let frame=0;frame<1200;frame++){f.tick(gas,true);const s=f.car.read();minUp=Math.min(minUp,new THREE.Vector3(0,1,0).applyQuaternion(s.rotation).y);maxY=Math.max(maxY,s.position.y);minY=Math.min(minY,s.position.y);assert.ok(s.position.distanceTo(previous)<.75,'travel is continuous');assert.ok(!s.resetRequired);previous.copy(s.position);}
  assert.ok(f.car.read().position.z< -450);assert.ok(minUp>.9&&minY>-.3&&maxY<.7);f.run(3,{...gas,steer:1},true);const turn=f.car.read();assert.ok(!turn.resetRequired);assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(turn.rotation).y>.9);assert.ok(turn.wheelContacts>=3);results.curb={minUp,maxY,minY,turnYaw:turn.yaw,turnSpeedKmh:turn.speed*3.6,wheelContacts:turn.wheelContacts,...f.metrics()};
 }finally{f.dispose();}
});
test('actual 120 km/h NPC contact remains one capped flight against wall and ground',async()=>{
 const f=await drivetrainFixture();try{
  const body=f.actor(0,0,-500);f.world.createCollider(RAPIER.ColliderDesc.cuboid(8,2,.1).setTranslation(0,2,-511));let hits=0,contactKmh=0,maxY=0,wallContacts=0,stunned=false;for(let frame=0;frame<1800;frame++){const event=f.tick(hits?{...IDLE,brake:1}:gas,!hits);if(event.impacts.length){hits+=event.impacts.length;contactKmh=event.impacts[0].speed*3.6;}const npc=f.car.npc(0);if(npc){maxY=Math.max(maxY,npc.position.y);assert.ok(body.translation().z> -511.5,'thrown capsule also retains CCD');if(npc.phase==='stunned'){stunned=true;break;}}}
  assert.equal(hits,1);assert.ok(contactKmh>118);assert.ok(stunned&&maxY>.8&&maxY<3.5);results.npc={contactKmh,hits,maxY,landing:f.car.npc(0)?.position.toArray(),...f.metrics()};
 }finally{f.dispose();}
});