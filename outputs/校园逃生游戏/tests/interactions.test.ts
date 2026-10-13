import {test} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {pickupReachable} from '../src/interactions.ts';

await RAPIER.init();

const feet={x:0,y:0,z:0},standingEye={x:0,y:1.62,z:0},crouchingEye={x:0,y:1.04,z:0};
const pickup={x:0,y:0,z:2};

function fixture(run:(world:RAPIER.World,player:RAPIER.Collider,rayDistance:(origin:Vector3,direction:Vector3,max:number)=>number)=>void){
  const world=new RAPIER.World({x:0,y:0,z:0});
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.875,0));
  const player=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body);
  const rayDistance=(origin:Vector3,direction:Vector3,max:number)=>{
    const hit=world.castRay(new RAPIER.Ray(origin,direction),max,true,undefined,undefined,player);
    return hit?hit.timeOfImpact:max;
  };
  try{world.step();run(world,player,rayDistance);}finally{world.free();}
}

test('a nearby pickup is reachable while the player capsule is excluded from the ray',()=>fixture((world,_player,rayDistance)=>{
  const direction=new Vector3(pickup.x,pickup.y+.7,pickup.z).sub(new Vector3(standingEye.x,standingEye.y,standingEye.z)).normalize();
  const unfiltered=world.castRay(new RAPIER.Ray(standingEye,direction),3,true);
  assert.equal(unfiltered?.timeOfImpact,0,'the eye really is inside the player collider');
  assert.equal(pickupReachable(feet,standingEye,pickup,2.7,rayDistance),true);
}));

test('a real solid wall prevents pickup even inside the interaction radius',()=>fixture((world,_player,rayDistance)=>{
  world.createCollider(RAPIER.ColliderDesc.cuboid(.8,.9,.08).setTranslation(0,.9,1));world.step();
  assert.equal(pickupReachable(feet,standingEye,pickup,2.7,rayDistance),false);
}));

test('the feet-to-pickup range is strict and includes height differences',()=>fixture((_world,_player,rayDistance)=>{
  assert.equal(pickupReachable(feet,standingEye,pickup,2,rayDistance),false);
  assert.equal(pickupReachable(feet,standingEye,{x:0,y:0,z:2.01},2,rayDistance),false);
  assert.equal(pickupReachable(feet,standingEye,{x:0,y:2,z:1},2,rayDistance),false);
  assert.equal(pickupReachable(feet,standingEye,{x:0,y:0,z:1.99},2,rayDistance),true);
}));

test('a low wall blocks a crouching eye but leaves the standing sightline clear',()=>fixture((world,_player,rayDistance)=>{
  world.createCollider(RAPIER.ColliderDesc.cuboid(.8,.5,.04).setTranslation(0,.5,1));world.step();
  assert.equal(pickupReachable(feet,standingEye,pickup,2.7,rayDistance),true);
  assert.equal(pickupReachable(feet,crouchingEye,pickup,2.7,rayDistance),false);
}));

test('an obstacle beyond the item cannot block pickup',()=>fixture((world,_player,rayDistance)=>{
  world.createCollider(RAPIER.ColliderDesc.cuboid(.8,.9,.08).setTranslation(0,.9,2.3));world.step();
  assert.equal(pickupReachable(feet,standingEye,pickup,2.7,rayDistance),true);
}));

test('the small endpoint tolerance tolerates contact but not a wall clearly before the item',()=>fixture((world,_player,rayDistance)=>{
  const wall=world.createCollider(RAPIER.ColliderDesc.cuboid(.8,.9,.005).setTranslation(0,.9,1.99));world.step();
  assert.equal(pickupReachable(feet,standingEye,pickup,2.7,rayDistance),true);
  wall.setTranslation({x:0,y:.9,z:1.9});world.step();
  assert.equal(pickupReachable(feet,standingEye,pickup,2.7,rayDistance),false);
}));
