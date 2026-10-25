import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {createDrivingPhysics,type DriveMap} from '../src/vehicle-physics.ts';
import type {DriveInput} from '../src/types.ts';
import {vehicleDefinition} from '../src/vehicles.ts';

const idle:DriveInput={steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false};
await RAPIER.init();
function fixture(){
 const world=new RAPIER.World({x:0,y:-18,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(300,.1,300).setTranslation(0,-.1,0));world.step();
 const map:DriveMap={version:12,spawn:[0,0,0],spawnYaw:0,npcSpawns:[],repairs:[],barriers:[],bounds:{min:[-300,-4,-300],max:[300,30,300]}};
 const car=createDrivingPhysics(world,map,new Map(),()=>world.createCharacterController(.015),()=>{},'tank');let chassis!:RAPIER.RigidBody;
 world.bodies.forEach(body=>{if(body.isDynamic())chassis=body;});
 const tick=(input=idle)=>{const previous=car.read().position;car.beforeStep(input,false,1/60);car.prepareContacts(1/60);world.timestep=1/60;world.step(car.eventQueue,car.physicsHooks);car.afterStep(1/60);const state=car.read();assert.ok(state.position.distanceTo(previous)<.35,'steering remains physical motion');assert.ok(state.rotation.toArray().every(Number.isFinite));return state;};
 const run=(steps:number,input=idle)=>{let value=car.read();for(let i=0;i<steps;i++)value=tick(input);return value;};
 run(120);return {world,car,chassis,run,dispose(){car.dispose();world.free();}};
}

test('tank differential steering remains active at the speed governor in both directions',()=>{
 for(const steer of [-1,1]){
  const f=fixture();try{
   const limit=vehicleDefinition('tank').maximumSpeed/3.6;f.chassis.setLinvel({x:0,y:0,z:-limit},true);
   const state=f.run(120,{...idle,throttle:1,steer});
   assert.ok(-state.yaw*steer>.22,`full-speed turn yaw ${state.yaw}`);
   assert.ok(state.horizontalSpeed<=limit+.2);assert.equal(state.wheelContacts,6);
  }finally{f.dispose();}
 }
});

test('tank supports stationary pivots and releases the turn without a pose reset',()=>{
 for(const steer of [-1,1]){
  const f=fixture();try{
   const before=f.car.read(),turned=f.run(120,{...idle,steer});
   assert.ok(-turned.yaw*steer>.4);assert.ok(turned.position.distanceTo(before.position)<.25);
   assert.ok(Math.abs(f.chassis.angvel().y)>.2);
   f.run(90);assert.ok(Math.abs(f.chassis.angvel().y)<.02);assert.equal(f.car.read().wheelContacts,6);
  }finally{f.dispose();}
 }
});

test('tank low-speed and proportional touch steering use the same responsive track command',()=>{
 for(const steer of [-1,.65]){
  const f=fixture();try{
   f.chassis.setLinvel({x:0,y:0,z:-4},true);
   const state=f.run(120,{...idle,throttle:1,steer});
   assert.ok(-state.yaw*Math.sign(steer)>(Math.abs(steer)===1?.25:.09),`moving steer ${steer} yaw ${state.yaw}`);
   assert.ok(state.speed>2);assert.equal(state.resetRequired,false);
  }finally{f.dispose();}
 }
});
