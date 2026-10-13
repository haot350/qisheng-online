import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createDrivingPhysics,type DriveMap,type PhysicsActor} from '../src/vehicle-physics.ts';
import type {DriveInput} from '../src/types.ts';
export const DRIVE_IDLE:DriveInput={steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false};
export async function drivetrainFixture(){
 await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(1500,.1,1500).setTranslation(0,-.1,0));world.step();
 const actors=new Map<number,PhysicsActor>(),controller=()=>world.createCharacterController(.015);
 const map:DriveMap={version:12,spawn:[0,0,12],spawnYaw:0,npcSpawns:[],repairs:[],barriers:[],bounds:{min:[-1500,-4,-1500],max:[1500,25,1500]}};
 const car=createDrivingPhysics(world,map,actors,controller,()=>{});let chassis!:RAPIER.RigidBody;world.bodies.forEach(b=>{if(b.isDynamic())chassis=b;});
 let steps=0,physicsMs=0;
 const tick=(input=DRIVE_IDLE,boosted=false)=>{car.beforeStep(input,boosted,1/60);world.timestep=1/60;car.prepareContacts(1/60);const began=performance.now();world.step(car.eventQueue,car.physicsHooks);physicsMs+=performance.now()-began;steps++;return car.afterStep(1/60);};
 const run=(seconds:number,input=DRIVE_IDLE,boosted=false)=>{for(let i=0;i<Math.round(seconds*60);i++)tick(input,boosted);};
 const actor=(id:number,x:number,z:number)=>{const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x,.89,z)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body),c=controller();actors.set(id,{body,capsule,controller:c,height:1.75,vertical:0,grounded:true});return body;};
 const dispose=()=>{car.dispose();for(const a of actors.values()){if(!a.thrown)world.removeCharacterController(a.controller);world.removeRigidBody(a.body);}actors.clear();world.free();};
 run(2);
 return{world,car,chassis,actors,tick,run,actor,dispose,metrics:()=>({steps,physicsMs,physicsMsPerStep:physicsMs/Math.max(1,steps)})};
}