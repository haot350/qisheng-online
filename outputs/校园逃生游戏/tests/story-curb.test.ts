import {test} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {storyCurbLift,storyDirectRoute} from '../src/story-curb.ts';

async function fixture(run:(world:RAPIER.World)=>void){
 await RAPIER.init();
 const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
 world.createCollider(RAPIER.ColliderDesc.cuboid(5,.1,5).setTranslation(0,-.1,0));
 world.createCollider(RAPIER.ColliderDesc.cuboid(.5,.075,1).setTranslation(.5,.075,0));
 world.createCollider(RAPIER.ColliderDesc.cuboid(.1,1,1.5).setTranslation(2,1,0));
 world.step();try{run(world);}finally{world.free();}
}

test('story curb assistance is bounded and does not continually lift actors on flat ground',async()=>fixture(world=>{
 const forward=new Vector3(1.45/60,0,0);
 assert.equal(storyCurbLift(world,new Vector3(-2,.015,0),forward),0);
 const lift=storyCurbLift(world,new Vector3(-.34,.015,0),forward);
 assert.ok(lift>0&&lift<=.04,`a real .15m low curb receives only a controller motion: ${lift}`);
 assert.equal(storyCurbLift(world,new Vector3(-.34,.015,0),new Vector3()),0);
 assert.equal(storyCurbLift(world,new Vector3(-.34,4,0),forward),0,'upper floors cannot use the ground-level shortcut');
}));

test('surveyed story shortcuts require continuous supported ground and reject high walls',async()=>fixture(world=>{
 assert.equal(storyDirectRoute(world,new Vector3(-1,.015,3),new Vector3(1.4,.015,3)),true,'a surveyed unobstructed short footpath is allowed');
 assert.equal(storyDirectRoute(world,new Vector3(-1,.015,0),new Vector3(1.4,.015,0)),true,'a low curb permits a surveyed footpath only after a full capsule sweep at the highest support');
 assert.equal(storyDirectRoute(world,new Vector3(-1,.015,0),new Vector3(3,.015,0)),false,'a two-metre wall cannot become a story shortcut');
 assert.equal(storyDirectRoute(world,new Vector3(4,.015,3),new Vector3(6,.015,3)),false,'missing ground cannot be bridged');
 assert.equal(storyCurbLift(world,new Vector3(4.7,.015,3),new Vector3(.024,0,0)),0,'no support beyond the edge means no lift');
 assert.equal(storyDirectRoute(world,new Vector3(-4,.015,3),new Vector3(4,.015,3)),false,'long routes still use navigation');
}));

test('the original fixed-step capsule controller crosses a low curb but cannot climb a wall',async()=>fixture(world=>{
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
 const capsule=world.createCollider(RAPIER.ColliderDesc.capsule((1.75-.6)/2,.3),body);
 const controller=world.createCharacterController(.015);controller.enableAutostep(.42,.20,false);controller.enableSnapToGround(.30);
 controller.setMaxSlopeClimbAngle(Math.PI*.27);controller.setMinSlopeSlideAngle(Math.PI*.30);
 let p=new Vector3(-1,.015,0),vertical=0,grounded=false,maxStep=0,highest=0;
 for(let frame=0;frame<240;frame++){
  const desired=new Vector3(1.45/60,0,0);body.setTranslation({x:p.x,y:p.y+.875,z:p.z},true);world.propagateModifiedBodyPositionsToColliders();
  vertical=grounded?-.25:Math.max(-20,vertical-14/60);
  const lift=storyCurbLift(world,p,desired);if(lift>0)vertical=0;
  controller.computeColliderMovement(capsule,{x:desired.x,y:vertical/60+lift,z:0},undefined,undefined,c=>c.handle!==capsule.handle);
  const m=controller.computedMovement(),next=p.clone().add(new Vector3(m.x,m.y,m.z));maxStep=Math.max(maxStep,p.distanceTo(next));p=next;highest=Math.max(highest,p.y);
  grounded=controller.computedGrounded();body.setNextKinematicTranslation({x:p.x,y:p.y+.875,z:p.z});world.step();
 }
 assert.ok(p.x>1.2&&p.x<1.6,`the actor crosses the curb then stops before the wall: ${p.x}`);
 assert.ok(highest>=.14&&highest<.25,'the .15m curb is physically traversed without climbing the wall');
 assert.ok(maxStep<.2,'each 1/60 second substep stays bounded, without teleporting');
 world.removeCharacterController(controller);world.removeRigidBody(body);
}));

test('story actors finish stepping over a narrow curb after the distant probe has crossed it',async()=>fixture(world=>{
 world.createCollider(RAPIER.ColliderDesc.cuboid(.08,.075,1).setTranslation(0,.075,3));world.step();
 const desired=new Vector3(1.45/60,0,0);
 assert.ok(storyCurbLift(world,new Vector3(-.16,.08,3),desired)>0,'the front footprint still needs lift even though the .48m probe has returned to flat ground');
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()),capsule=world.createCollider(RAPIER.ColliderDesc.capsule((1.75-.6)/2,.3),body),controller=world.createCharacterController(.015);
 controller.enableAutostep(.42,.20,false);controller.enableSnapToGround(.30);
 let p=new Vector3(-1,.015,3),vertical=0,grounded=false,maxStep=0,highest=0;
 for(let frame=0;frame<125;frame++){
  body.setTranslation({x:p.x,y:p.y+.875,z:p.z},true);world.propagateModifiedBodyPositionsToColliders();
  vertical=grounded?-.25:Math.max(-20,vertical-14/60);const lift=storyCurbLift(world,p,desired);if(lift>0)vertical=0;
  controller.computeColliderMovement(capsule,{x:desired.x,y:vertical/60+lift,z:0},undefined,undefined,c=>c.handle!==capsule.handle);
  const m=controller.computedMovement(),next=p.clone().add(new Vector3(m.x,m.y,m.z));maxStep=Math.max(maxStep,p.distanceTo(next));p=next;highest=Math.max(highest,p.y);grounded=controller.computedGrounded();
  body.setNextKinematicTranslation({x:p.x,y:p.y+.875,z:p.z});world.step();
 }
 assert.ok(p.x>1.3,`the original capsule completes the narrow curb crossing: ${p.x}`);
 assert.ok(highest>=.14&&highest<.26);assert.ok(maxStep<.06,'curb assistance is a bounded physical substep');
 world.removeCharacterController(controller);world.removeRigidBody(body);
}));
