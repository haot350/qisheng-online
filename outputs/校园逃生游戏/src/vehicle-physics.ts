import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {DriveInput,Point,Vec3,TransmissionMode} from './types';
import {DRIVE_RULES} from './driving-rules.ts';
import type {NPCRegion} from './driving-ai.ts';
import {vehicleDefinition,type DrivingVehicleId} from './vehicles.ts';
import {alternativeWheelMotion,vehicleBalanceImpulse} from './vehicle-motion.ts';
import {driveAreaAllowed,type DriveExclusion} from './driving-area.ts';
import {HandbrakeControl,HANDBRAKE_RULES,type HandbrakeStage} from './handbrake.ts';
import {DRIVING_TUNING,steeringLimit} from './driving-tuning.ts';
import {Transmission} from './transmission.ts';

export type DriveBarrier={center:Vec3;half:Vec3;yaw?:number;reason:string};
export type DriveMap={version:number;releaseVersion?:string;sourceSha256?:string;spawn:Vec3;spawnYaw:number;npcSpawns:Vec3[];npcRegions?:NPCRegion[];repairs:Point[];barriers:DriveBarrier[];bounds:{min:Vec3;max:Vec3};excluded?:DriveExclusion[];outdoorWaypoints?:Vec3[];outdoorEdges?:{from:number;to:number;points:Vec3[]}[]};
export type VehicleState={position:THREE.Vector3;rotation:THREE.Quaternion;yaw:number;speed:number;horizontalSpeed:number;velocity:THREE.Vector3;lateralSpeed:number;slipAngle:number;handbrake:boolean;handbrakeAssist:number;handbrakeStage?:HandbrakeStage;rearDriveScale?:number;footBrake?:number;wheelContacts:number;wheels:{position:THREE.Vector3;rotation:THREE.Quaternion}[];resetRequired:boolean;gear:number;rpm:number;transmission:TransmissionMode;shiftLeft:number;shiftSerial:number;rejectedShiftSerial:number};
export type ThrownState={position:THREE.Vector3;rotation:THREE.Quaternion;phase:'flying'|'stunned'|'respawning';remaining:number};
export interface DrivingPhysics {
 beforeStep(input:DriveInput,boosted:boolean,dt:number):void;
 /** Freeze plain contact eligibility after NPC movement, before the single world step. */
 prepareContacts(dt:number):void;
 readonly physicsHooks:RAPIER.PhysicsHooks;
 readonly eventQueue:RAPIER.EventQueue;
 afterStep(dt:number):{impacts:{id:number;speed:number}[];recovered:number[]};
 read():VehicleState;npc(id:number):ThrownState|null;reenter(id:number,point:THREE.Vector3):boolean;reset():boolean;
 hitDistance(origin:THREE.Vector3,direction:THREE.Vector3,max:number):number|null;
 cameraDistance(origin:THREE.Vector3,direction:THREE.Vector3,max:number):number;
 blast(origin:THREE.Vector3,radius:number):number[];
 shift(direction:1|-1):boolean;setTransmission(mode:TransmissionMode):void;stop():void;dispose():void;
}
export type PhysicsActor={body:RAPIER.RigidBody;capsule:RAPIER.Collider;controller:RAPIER.KinematicCharacterController;height:number;vertical:number;grounded:boolean;thrown?:boolean};
type Thrown={actor:PhysicsActor;phase:'flying'|'stunned'|'respawning';remaining:number;settled:number;age:number;lastSafe:THREE.Vector3;position:THREE.Vector3;rotation:THREE.Quaternion};
const UP=new THREE.Vector3(0,1,0),IDENTITY={x:0,y:0,z:0,w:1};
const V=(p:number[])=>({x:p[0],y:p[1],z:p[2]}),H=(p:number[])=>p as [number,number,number];
const vector=(p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x,p.y,p.z);
const quat=(q:{x:number;y:number;z:number;w:number})=>new THREE.Quaternion(q.x,q.y,q.z,q.w);
const finite=(p:{x:number;y:number;z:number})=>[p.x,p.y,p.z].every(Number.isFinite);
export function drivePointAllowed(map:DriveMap,p:THREE.Vector3){return driveAreaAllowed(map,p);}
export function validateDrivingSpawn(physics:RAPIER.World,map:DriveMap,point:Vec3,yaw:number,vehicleId:DrivingVehicleId='bao5'):Vec3|null {
 const VEHICLE=vehicleDefinition(vehicleId),WHEELS=VEHICLE.physics.wheels.map(p=>new THREE.Vector3(...H(p)));
 if(!point.every(Number.isFinite)||!Number.isFinite(yaw))return null;
 const ground=physics.castRayAndGetNormal(new RAPIER.Ray({x:point[0],y:point[1]+1,z:point[2]},{x:0,y:-1,z:0}),2,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
 if(!ground||ground.normal.y<.82)return null;
 const p=new THREE.Vector3(point[0],point[1]+1-ground.timeOfImpact+.02,point[2]),q=new THREE.Quaternion().setFromAxisAngle(UP,yaw);
 if(!drivePointAllowed(map,p))return null;
 const center=new THREE.Vector3(...H(VEHICLE.clearance.center)).applyQuaternion(q).add(p);
 if(physics.intersectionWithShape(center,q,new RAPIER.Cuboid(...H(VEHICLE.clearance.half)),RAPIER.QueryFilterFlags.ONLY_FIXED)!==null)return null;
 let low=Infinity,high=-Infinity;
 for(const wheel of WHEELS){const w=wheel.clone().setY(0).applyQuaternion(q).add(p),hit=physics.castRayAndGetNormal(new RAPIER.Ray({x:w.x,y:p.y+.35,z:w.z},{x:0,y:-1,z:0}),.85,true,RAPIER.QueryFilterFlags.ONLY_FIXED);if(!hit||hit.normal.y<.82)return null;const height=p.y+.35-hit.timeOfImpact;if(Math.abs(height-p.y)>.2)return null;low=Math.min(low,height);high=Math.max(high,height);}
 return high-low<.18?p.toArray() as Vec3:null;
}

/** Dynamic physics is advanced only by GameWorld.step, never by this controller. */
export function createDrivingPhysics(physics:RAPIER.World,map:DriveMap,actors:Map<number,PhysicsActor>,createController:()=>RAPIER.KinematicCharacterController,onDispose:()=>void,vehicleId:DrivingVehicleId='bao5'):DrivingPhysics {
 const VEHICLE=vehicleDefinition(vehicleId),P=VEHICLE.physics,ANCHOR=P.anchor,WHEELS=P.wheels.map(p=>new THREE.Vector3(...H(p)));
 const barriers=map.barriers.map(b=>physics.createCollider(RAPIER.ColliderDesc.cuboid(...b.half).setTranslation(...b.center).setRotation(new THREE.Quaternion().setFromAxisAngle(UP,b.yaw??0)).setFriction(.5)));
 const previousCcdSubsteps=physics.integrationParameters.maxCcdSubsteps;physics.integrationParameters.maxCcdSubsteps=Math.max(previousCcdSubsteps,DRIVING_TUNING.ccdSubsteps);
 const chassis=physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(map.spawn[0],map.spawn[1]+ANCHOR,map.spawn[2]).setRotation(new THREE.Quaternion().setFromAxisAngle(UP,map.spawnYaw)).setAdditionalMassProperties(P.mass,V(P.centerOfMass),V(P.inertia),IDENTITY).setLinearDamping(DRIVING_TUNING.linearDamping).setAngularDamping(2.2).setCcdEnabled(true));
 const part=(shape:{half:number[];center:number[]})=>physics.createCollider(RAPIER.ColliderDesc.cuboid(...H(shape.half)).setTranslation(...H(shape.center)).setDensity(0).setFriction(.45).setRestitution(.03).setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),chassis);
 const shell=part(P.chassis),roof=part(P.roof),spare=part(P.spare),parts=[shell,roof,spare];
 chassis.recomputeMassPropertiesFromColliders();
 const car=physics.createVehicleController(chassis);car.indexUpAxis=1;car.setIndexForwardAxis=2;
 for(const p of WHEELS){car.addWheel(p,{x:0,y:-1,z:0},{x:-1,y:0,z:0},P.suspension.restLength,P.wheelRadius);const i=car.numWheels()-1;car.setWheelSuspensionStiffness(i,P.suspension.stiffness);car.setWheelSuspensionCompression(i,P.suspension.compression);car.setWheelSuspensionRelaxation(i,P.suspension.relaxation);car.setWheelMaxSuspensionTravel(i,P.suspension.maxTravel);car.setWheelMaxSuspensionForce(i,P.suspension.maxForce);car.setWheelFrictionSlip(i,3.8);car.setWheelSideFrictionStiffness(i,1.0);}

 let disposed=false,steering=0,airtime=0,resetNeeded=false,previousVelocity=new THREE.Vector3(),previousSpeed=0,brakeAmount=0,coastAmount=0;
 const handbrake=new HandbrakeControl(),transmission=new Transmission();
 const thrown=new Map<number,Thrown>(),cooldowns=new Map<number,number>();
 const eligibleContacts=new Map<number,{id:number;speed:number}>(),partHandles=new Set(parts.map(c=>c.handle));
 // This Rapier version dispatches hooks only through the event-queue step path.
 const eventQueue=new RAPIER.EventQueue(true);
 const physicsHooks:RAPIER.PhysicsHooks={
  filterContactPair(a,b){return partHandles.has(a)&&eligibleContacts.has(b)||partHandles.has(b)&&eligibleContacts.has(a)?RAPIER.SolverFlags.EMPTY:RAPIER.SolverFlags.COMPUTE_IMPULSE;},
  filterIntersectionPair(){return true;}
 };
 const prepareContacts=(dt:number)=>{eligibleContacts.clear();if(disposed)return;previousVelocity.copy(vector(chassis.linvel()));previousSpeed=Math.hypot(previousVelocity.x,previousVelocity.z);if(previousSpeed<DRIVE_RULES.minimumImpactSpeed)return;const center=vector(chassis.translation());for(const[id,a]of actors){if(a.thrown||cooldowns.has(id)||!a.body.isKinematic())continue;const now=vector(a.body.translation()),next=vector(a.body.nextTranslation()),velocity=next.clone().sub(now).multiplyScalar(1/Math.max(dt,1/120)),toward=next.clone().sub(center).setY(0);if(toward.lengthSq()<1e-8)continue;const closing=previousVelocity.clone().sub(velocity).dot(toward.normalize());if(closing>=DRIVE_RULES.minimumImpactSpeed)eligibleContacts.set(a.capsule.handle,{id,speed:closing});}};
 let safe={position:new THREE.Vector3(...map.spawn),yaw:map.spawnYaw};
 const fixed=(c:RAPIER.Collider)=>!c.parent()||c.parent()!.isFixed();
 const support=(p:THREE.Vector3)=>{const hit=physics.castRayAndGetNormal(new RAPIER.Ray({x:p.x,y:p.y+.35,z:p.z},{x:0,y:-1,z:0}),.85,true,RAPIER.QueryFilterFlags.ONLY_FIXED);return hit&&hit.normal.y>.82?{height:p.y+.35-hit.timeOfImpact,normal:hit.normal.y}:null;};
 const clearAt=(p:THREE.Vector3,yaw:number,includeActors=false)=>{const q=new THREE.Quaternion().setFromAxisAngle(UP,yaw),center=p.clone().add(new THREE.Vector3(...H(VEHICLE.clearance.center)).applyQuaternion(q)),flags=includeActors?RAPIER.QueryFilterFlags.EXCLUDE_SENSORS:RAPIER.QueryFilterFlags.ONLY_FIXED;return physics.intersectionWithShape(center,q,new RAPIER.Cuboid(...H(VEHICLE.clearance.half)),flags,undefined,undefined,chassis)===null;};
 const standingClear=(p:THREE.Vector3,exclude?:RAPIER.Collider)=>physics.intersectionWithShape({x:p.x,y:p.y+.90,z:p.z},IDENTITY,new RAPIER.Capsule(.575,.29),undefined,undefined,exclude,undefined,c=>!c.isSensor())===null;
 const safeCar=(p:THREE.Vector3,yaw:number)=>{if(!drivePointAllowed(map,p)||!clearAt(p,yaw))return false;let lo=Infinity,hi=-Infinity;for(const w of WHEELS){const wp=w.clone().setY(0).applyAxisAngle(UP,yaw).add(p),s=support(wp);if(!s||Math.abs(s.height-p.y)>.20)return false;lo=Math.min(lo,s.height);hi=Math.max(hi,s.height);}return hi-lo<.18;};
 const reenter=(id:number,p:THREE.Vector3)=>{const t=thrown.get(id);if(!t||t.phase!=='respawning'||!drivePointAllowed(map,p))return false;const ground=support(p);if(!ground)return false;const point=new THREE.Vector3(p.x,ground.height+.025,p.z);if(!standingClear(point))return false;const a=t.actor;a.body=physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(point.x,point.y+.875,point.z));a.height=1.75;a.capsule=physics.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),a.body);a.controller=createController();a.vertical=0;a.grounded=true;a.thrown=false;actors.set(id,a);thrown.delete(id);cooldowns.set(id,1);physics.propagateModifiedBodyPositionsToColliders();return true;};

 const launch=(id:number,a:PhysicsActor,speed:number,blastOrigin?:THREE.Vector3)=>{const before=vector(a.body.translation()).add(new THREE.Vector3(0,-a.height/2,0)),mass=DRIVING_TUNING.npcMass;physics.removeCharacterController(a.controller);a.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);a.body.setEnabledRotations(true,true,true,true);a.body.enableCcd(true);a.capsule.setMass(mass);a.body.recomputeMassPropertiesFromColliders();a.body.setLinearDamping(.35);a.body.setAngularDamping(2);a.body.setLinvel({x:0,y:0,z:0},true);const away=before.clone().sub(blastOrigin??vector(chassis.translation())).setY(0),dir=blastOrigin?away.clone():previousVelocity.clone().setY(0);if(dir.lengthSq()<.1)dir.copy(away);if(dir.lengthSq()<1e-8)dir.set(0,0,-1);dir.normalize().multiplyScalar(.8).add(away.normalize().multiplyScalar(.2)).normalize();const horizontal=Math.min(14,Math.max(4,speed*.9)),vertical=Math.min(8.6,4.2+speed*.22),horizontalImpulse=Math.min(DRIVING_TUNING.npcMaximumHorizontalImpulse,horizontal*mass);a.body.applyImpulse({x:dir.x*horizontalImpulse,y:vertical*mass,z:dir.z*horizontalImpulse},true);if(!blastOrigin)chassis.applyImpulse({x:-dir.x*horizontalImpulse,y:0,z:-dir.z*horizontalImpulse},true);a.body.applyTorqueImpulse({x:dir.z*24,y:12,z:-dir.x*24},true);a.thrown=true;thrown.set(id,{actor:a,phase:'flying',remaining:DRIVE_RULES.stun,settled:0,age:0,lastSafe:before,position:before.clone(),rotation:new THREE.Quaternion()});cooldowns.set(id,1.5);};
 const read=():VehicleState=>{
  const rotation=quat(chassis.rotation()),center=vector(chassis.translation()),forward=new THREE.Vector3(0,0,-1).applyQuaternion(rotation),right=new THREE.Vector3(1,0,0).applyQuaternion(rotation),velocity=vector(chassis.linvel()),position=center.clone().add(new THREE.Vector3(0,-ANCHOR,0).applyQuaternion(rotation));
  const speed=velocity.dot(forward),lateralSpeed=velocity.dot(right),slipAngle=Math.hypot(speed,lateralSpeed)>1?Math.atan2(lateralSpeed,Math.max(.001,Math.abs(speed))):0;
  const wheels=WHEELS.map((p,i)=>{const length=car.wheelSuspensionLength(i)??P.suspension.restLength,pos=p.clone().add(new THREE.Vector3(0,-length,0)).applyQuaternion(rotation).add(center);const wheelRotation=rotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP,car.wheelSteering(i)??0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-(car.wheelRotation(i)??0)));return{position:pos,rotation:wheelRotation};});
  const gearbox=VEHICLE.manual?transmission.read(speed):{gear:speed<-.2?-1:1,rpm:900+Math.min(1,Math.abs(speed)/(VEHICLE.maximumSpeed/3.6))*3300,transmission:'auto' as const,shiftLeft:0,shiftSerial:0,rejectedShiftSerial:0};
  return{position,rotation,yaw:Math.atan2(-forward.x,-forward.z),speed,horizontalSpeed:Math.hypot(velocity.x,velocity.z),velocity,lateralSpeed,slipAngle,handbrake:handbrake.pressed,handbrakeAssist:handbrake.assist,handbrakeStage:handbrake.stage,rearDriveScale:handbrake.rearDrive,footBrake:brakeAmount,wheelContacts:WHEELS.filter((_,i)=>car.wheelIsInContact(i)).length,wheels,resetRequired:resetNeeded,...gearbox};
 };
 return {
 beforeStep(input,boosted,dt){if(disposed)return;for(const [id,t]of cooldowns){if(t<=dt)cooldowns.delete(id);else cooldowns.set(id,t-dt);}const state=read();previousSpeed=Math.abs(state.speed);previousVelocity.copy(state.velocity);
  if(VEHICLE.id!=='bao5'){
   const throttle=THREE.MathUtils.clamp(input.throttle,0,1),requestedBrake=Math.max(THREE.MathUtils.clamp(input.brake,0,1),input.handbrake?1:0,throttle>0&&state.speed*(input.reverse?-1:1)<-DRIVING_TUNING.directionChangeSpeed?throttle:0);
   brakeAmount+=THREE.MathUtils.clamp(requestedBrake-brakeAmount,-dt/DRIVING_TUNING.brakeRelease,dt/DRIVING_TUNING.brakeEnter);
   steering=THREE.MathUtils.damp(steering,THREE.MathUtils.clamp(input.steer,-1,1)*(VEHICLE.id==='tank'?1:steeringLimit(state.horizontalSpeed,VEHICLE.dimensions.wheelbase)),DRIVING_TUNING.steeringResponse,dt);
   coastAmount=throttle<.02&&brakeAmount<.02&&!input.handbrake?Math.min(1,coastAmount+dt/DRIVING_TUNING.coastEnter):0;
   const commands=alternativeWheelMotion(VEHICLE,input,{speed:state.speed,horizontalSpeed:state.horizontalSpeed,steering,brake:brakeAmount,coast:coastAmount},boosted,dt);
   for(let i=0;i<WHEELS.length;i++){const wheel=commands[i];car.setWheelSteering(i,wheel.steering);car.setWheelEngineForce(i,wheel.force);car.setWheelBrake(i,wheel.brake);car.setWheelFrictionSlip(i,HANDBRAKE_RULES.frictionSlip);car.setWheelSideFrictionStiffness(i,wheel.sideFriction);}
   car.updateVehicle(dt,RAPIER.QueryFilterFlags.ONLY_FIXED);
   chassis.applyTorqueImpulse(vehicleBalanceImpulse(VEHICLE,UP.clone().applyQuaternion(state.rotation),vector(chassis.angvel()),state.wheelContacts,dt),true);
   return;
  }
  steering=THREE.MathUtils.damp(steering,THREE.MathUtils.clamp(input.steer,-1,1)*steeringLimit(Math.hypot(state.velocity.x,state.velocity.z),VEHICLE.dimensions.wheelbase),DRIVING_TUNING.steeringResponse,dt);const throttle=THREE.MathUtils.clamp(input.throttle,0,1),brake=THREE.MathUtils.clamp(input.brake,0,1),gearbox=transmission.tick({speed:state.speed,throttle,reverse:Boolean(input.reverse),brake},dt);const wantsReverse=Boolean(input.reverse),fighting=throttle>0&&(wantsReverse?gearbox.gear>0||state.speed>DRIVING_TUNING.directionChangeSpeed:gearbox.gear<0||state.speed< -DRIVING_TUNING.directionChangeSpeed),requestedBrake=Math.max(brake,fighting?throttle:0);brakeAmount+=THREE.MathUtils.clamp(requestedBrake-brakeAmount,-dt/DRIVING_TUNING.brakeRelease,dt/DRIVING_TUNING.brakeEnter);const force=fighting||brakeAmount>.01?0:(gearbox.gear<0?1:-1)*transmission.force(state.speed,throttle,boosted);
  coastAmount=throttle<.02&&brakeAmount<.02&&!input.handbrake?Math.min(1,coastAmount+dt/DRIVING_TUNING.coastEnter):0;
  const upY=UP.clone().applyQuaternion(state.rotation).y,assist=handbrake.tick({pressed:Boolean(input.handbrake),speed:state.speed,steer:input.steer,wheelContacts:state.wheelContacts,rearContacts:car.wheelIsInContact(2)&&car.wheelIsInContact(3),upY,slipAngle:state.slipAngle},dt),h=HANDBRAKE_RULES;
  for(let i=0;i<4;i++){
   const rear=i>=2;
   car.setWheelFrictionSlip(i,rear?THREE.MathUtils.lerp(h.frictionSlip,h.rearFrictionSlip,assist):h.frictionSlip);
   car.setWheelSideFrictionStiffness(i,rear?THREE.MathUtils.lerp(h.sideFriction,h.rearSideFriction,assist):h.sideFriction);
   car.setWheelEngineForce(i,force/4*(rear?handbrake.rearDrive:1));
   // Rapier wheelBrake is an impulse, not a force. Derive it from mass and dt.
   const footImpulse=P.mass*DRIVING_TUNING.footBrakeDeceleration*brakeAmount*dt*(rear?1-DRIVING_TUNING.brakeFrontBias:DRIVING_TUNING.brakeFrontBias)/2;
   const parkingImpulse=(rear?handbrake.brake:0)*dt*60,rollingImpulse=P.mass*DRIVING_TUNING.coastDeceleration*coastAmount*dt/4;
   car.setWheelBrake(i,footImpulse+parkingImpulse+rollingImpulse);
   car.setWheelSteering(i,i<2?-steering:0);
  }
  car.updateVehicle(dt,RAPIER.QueryFilterFlags.ONLY_FIXED);
   // Mild anti-roll assistance preserves suspension and jumps; it never changes position.
   const up=UP.clone().applyQuaternion(quat(chassis.rotation())),angular=vector(chassis.angvel());if(up.y>.2)chassis.applyTorqueImpulse({x:(up.z*850-angular.x*220)*dt,y:0,z:(-up.x*850-angular.z*220)*dt},true);
 },
 prepareContacts,physicsHooks,eventQueue,
 afterStep(dt){const impacts:{id:number;speed:number}[]=[],recovered:number[]=[];if(disposed)return{impacts,recovered};for(const[id,a]of actors){const eligible=eligibleContacts.get(a.capsule.handle);if(a.thrown||cooldowns.has(id)||eligible?.id!==id)continue;let contact=false;for(const c of parts)physics.contactPair(c,a.capsule,m=>{for(let i=0;i<m.numContacts();i++)if(m.contactDist(i)<=DRIVING_TUNING.npcContactTolerance)contact=true;});if(!contact)continue;launch(id,a,Math.min(20,eligible.speed));impacts.push({id,speed:eligible.speed});}
   for(const[id,t]of [...thrown]){if(impacts.some(h=>h.id===id)||t.phase==='respawning')continue;t.age+=dt;const b=t.actor.body,pos=vector(b.translation()),velocity=vector(b.linvel());if(!finite(pos)||pos.y< -3.6){const landing=t.lastSafe.clone();const ground=support(landing);if(ground){b.setTranslation({x:landing.x,y:ground.height+.9,z:landing.z},true);b.setLinvel({x:0,y:0,z:0},true);b.setAngvel({x:0,y:0,z:0},true);t.phase='stunned';t.remaining=DRIVE_RULES.stun;}}
    if(t.phase==='flying'){let grounded=false;physics.contactPairsWith(t.actor.capsule,c=>{if(!fixed(c))return;physics.contactPair(t.actor.capsule,c,m=>{if(Math.abs(m.normal().y)<.35)return;for(let i=0;i<m.numContacts();i++)if(m.contactDist(i)<.03)grounded=true;});});t.settled=grounded&&velocity.length()<1.1?t.settled+dt:0;if(t.settled>.3){t.phase='stunned';t.remaining=DRIVE_RULES.stun;b.setLinvel({x:0,y:0,z:0},true);b.setAngvel({x:0,y:0,z:0},true);b.sleep();}}
    else{t.remaining=Math.max(0,t.remaining-dt);if(t.remaining===0){const rotation=quat(b.rotation());t.rotation.copy(rotation);t.position.copy(vector(b.translation()).add(new THREE.Vector3(0,-t.actor.height/2,0).applyQuaternion(rotation)));physics.removeRigidBody(b);actors.delete(id);t.phase='respawning';physics.propagateModifiedBodyPositionsToColliders();}}
   }
   const state=read(),up=UP.clone().applyQuaternion(state.rotation),contacts=WHEELS.filter((_,i)=>car.wheelIsInContact(i)).length;airtime=contacts===0?airtime+dt:0;resetNeeded=!finite(state.position)||!Number.isFinite(state.horizontalSpeed)||state.position.y< -3.55||up.y<.25||airtime>3||state.position.x<map.bounds.min[0]||state.position.x>map.bounds.max[0]||state.position.z<map.bounds.min[2]||state.position.z>map.bounds.max[2];if(up.y>.94&&contacts===WHEELS.length&&state.horizontalSpeed<10&&safeCar(state.position,state.yaw))safe={position:state.position.clone(),yaw:state.yaw};return{impacts,recovered};
 },read,reenter,
 npc(id){const t=thrown.get(id);if(!t)return null;if(t.phase==='respawning')return{position:t.position.clone(),rotation:t.rotation.clone(),phase:t.phase,remaining:0};const b=t.actor.body,q=quat(b.rotation());return{position:vector(b.translation()).add(new THREE.Vector3(0,-t.actor.height/2,0).applyQuaternion(q)),rotation:q,phase:t.phase,remaining:t.remaining};},
 reset(){if(disposed)return false;const candidates=[safe,{position:new THREE.Vector3(...map.spawn),yaw:map.spawnYaw}];const target=candidates.find(p=>safeCar(p.position,p.yaw)&&clearAt(p.position,p.yaw,true));if(!target)return false;chassis.setTranslation(target.position.clone().add(new THREE.Vector3(0,ANCHOR,0)),true);chassis.setRotation(new THREE.Quaternion().setFromAxisAngle(UP,target.yaw),true);chassis.setLinvel({x:0,y:0,z:0},true);chassis.setAngvel({x:0,y:0,z:0},true);chassis.resetForces(true);chassis.resetTorques(true);steering=0;airtime=0;brakeAmount=0;coastAmount=0;eligibleContacts.clear();resetNeeded=false;handbrake.reset();transmission.reset();physics.propagateModifiedBodyPositionsToColliders();return true;},
 hitDistance(origin,direction,max){if(disposed)return null;let best=max,found=false;for(const c of parts){const h=c.castRay(new RAPIER.Ray(origin,direction),max,true);if(h>=0&&h<best){best=h;found=true;}}return found?best:null;},
 cameraDistance(origin,direction,max){const hit=physics.castShape(origin,IDENTITY,direction,new RAPIER.Ball(.18),.015,max,true,RAPIER.QueryFilterFlags.ONLY_FIXED);return hit?Math.max(.2,hit.time_of_impact-.10):max;},
 blast(origin,radius){const hits:number[]=[];if(disposed||!finite(origin)||!Number.isFinite(radius)||radius<=0)return hits;physics.propagateModifiedBodyPositionsToColliders();for(const[id,a]of actors){if(a.thrown||cooldowns.has(id)||!a.body.isKinematic())continue;const target=vector(a.body.translation()),delta=target.clone().sub(origin),distance=delta.length();if(distance>radius)continue;if(distance>.01){const wall=physics.castRay(new RAPIER.Ray(origin,delta.clone().divideScalar(distance)),distance,true,RAPIER.QueryFilterFlags.ONLY_FIXED);if(wall&&wall.timeOfImpact<distance-.05)continue;}launch(id,a,6+8*(1-distance/radius),origin);hits.push(id);}return hits;},
 shift(direction){return !disposed&&VEHICLE.manual&&transmission.shift(direction,read().speed);},
 setTransmission(mode){if(!disposed&&VEHICLE.manual)transmission.setMode(mode,read().speed);},
 stop(){if(disposed)return;handbrake.reset();brakeAmount=0;coastAmount=0;eligibleContacts.clear();for(let i=0;i<WHEELS.length;i++){car.setWheelEngineForce(i,0);car.setWheelBrake(i,VEHICLE.id==='bao5'?140:P.mass*7.5/60/WHEELS.length);car.setWheelFrictionSlip(i,HANDBRAKE_RULES.frictionSlip);car.setWheelSideFrictionStiffness(i,HANDBRAKE_RULES.sideFriction);}chassis.setLinvel({x:0,y:0,z:0},true);chassis.setAngvel({x:0,y:0,z:0},true);},
 dispose(){if(disposed)return;disposed=true;for(const[id,t]of thrown){if(t.phase!=='respawning')physics.removeRigidBody(t.actor.body);actors.delete(id);}thrown.clear();cooldowns.clear();eligibleContacts.clear();eventQueue.free();physics.removeVehicleController(car);physics.removeRigidBody(chassis);physics.integrationParameters.maxCcdSubsteps=previousCcdSubsteps;for(const c of barriers)physics.removeCollider(c,true);onDispose();physics.propagateModifiedBodyPositionsToColliders();}
 };
}
