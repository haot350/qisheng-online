import {test} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {companionBypass,StoryCompanionAvoidance} from '../src/story-companion-avoidance.ts';

const point=(x:number,z:number,y=0)=>new Vector3(x,y,z);
const flat=(clear:(p:Vector3)=>boolean=()=>true)=>({
 storyPath(from:Vector3,to:Vector3){assert.ok(Math.hypot(to.x-from.x,to.z-from.z)<=.50001,'bypass navigation must retain short lateral legs');return[to.clone()];},
 supportAt(p:Vector3,height?:number){assert.equal(height,1.75);return{height:p.y,normalY:1,clear:clear(p)};}
});
function stall(state:StoryCompanionAvoidance,from=point(0,0),player=point(.615,0)){
 for(let i=0;i<41;i++)state.observe(from,from,point(1.45/60,0),1/60,player);
}
function closest(a:Vector3,b:Vector3,p:Vector3){const d=b.clone().sub(a).setY(0),t=d.lengthSq()?Math.max(0,Math.min(1,p.clone().sub(a).setY(0).dot(d)/d.lengthSq())):0;return a.clone().addScaledVector(d,t).setY(0).distanceTo(p.clone().setY(0));}

test('a contacting player gets a short same-floor lateral bypass whose full segments preserve separation',()=>{
 const from=point(0,0),destination=point(3,0),player=point(.615,0),route=companionBypass(flat(),from,destination,player);
 assert.ok(route);assert.ok(route[0].z>0);let previous=from;
 for(const next of route){assert.ok(closest(previous,next,player)>=Math.min(previous.distanceTo(player),.68)-.0011);previous=next;}
 assert.ok(previous.distanceTo(player)>=.68);assert.deepEqual(from,point(0,0));assert.deepEqual(destination,point(3,0));
});

test('blocked static side or another companion selects the other side',()=>{
 const from=point(0,0),destination=point(3,0),player=point(.615,0);
 const wall=companionBypass(flat(p=>p.z<=.2),from,destination,player);assert.ok(wall);assert.ok(wall[0].z<0);
 const peer=point(.1,.8),route=companionBypass(flat(),from,destination,player,[peer]);assert.ok(route);assert.ok(route[0].z<0);
 let previous=from;for(const next of route){assert.ok(closest(previous,next,peer)>=.68);previous=next;}
});

test('unsafe navigation, headroom, unsupported floor and another floor cannot become bypasses',()=>{
 const from=point(0,0),destination=point(3,0),player=point(.615,0),safe=flat();
 assert.equal(companionBypass(flat(()=>false),from,destination,player),null);
 assert.equal(companionBypass({...safe,storyPath:()=>[]},from,destination,player),null);
 assert.equal(companionBypass({...safe,storyPath:(_from,to)=>[to.clone().setY(3.5)]},from,destination,player),null);
 assert.equal(companionBypass({...safe,storyPath:(_from,to)=>[player.clone(),to.clone()]},from,destination,player),null);
 assert.equal(companionBypass({...safe,supportAt:()=>null},from,destination,player),null);
 assert.equal(companionBypass({...safe,supportAt:()=>({height:.3,normalY:1,clear:true})},from,destination,player),null);
 assert.equal(companionBypass({...safe,supportAt:(p)=>({height:p.z===0?.14:-.14,normalY:1,clear:true})},from,destination,player),null);
 assert.equal(companionBypass({...safe,supportAt:()=>({height:0,normalY:.7,clear:true})},from,destination,player),null);
 assert.equal(companionBypass(safe,from,destination,point(.615,0,3.5)),null);
});

test('avoidance waits for real stalled motion, keeps its side, and clears after reset or arrival',()=>{
 const state=new StoryCompanionAvoidance(),from=point(0,0),destination=point(3,0),player=point(.615,0),next=point(1,0),world=flat();
 assert.equal(state.waypoint(world,from,destination,next,player),next);
 for(let i=0;i<60;i++)state.observe(from,point(.02,0),point(.024,0),1/60,player);
 assert.equal(state.waypoint(world,from,destination,next,player),next);
 stall(state);const chosen=state.waypoint(world,from,destination,next,player);assert.ok(chosen);assert.notEqual(chosen,next);
 assert.equal(state.waypoint(world,from,destination,next,point(.615,-.1)),chosen,'a chosen safe side stays committed');
 state.reset();assert.equal(state.waypoint(world,from,destination,next,player),next);assert.equal(state.needsSpace,false);
 stall(state);state.waypoint(world,from,destination,next,player);assert.equal(state.waypoint(world,destination,destination,next,player),next);
 assert.equal(state.waypoint(world,from,destination,next,player),next);
});

test('a newly occupied committed leg is rechecked and unavailable space stays physically blocked',()=>{
 const state=new StoryCompanionAvoidance(),from=point(0,0),destination=point(3,0),player=point(.615,0),next=point(1,0),world=flat();
 stall(state);const chosen=state.waypoint(world,from,destination,next,player);assert.ok(chosen);assert.ok(chosen.z>0);
 const replan=state.waypoint(world,from,destination,next,player,[point(0,.7)]);assert.ok(replan);assert.ok(replan.z<0);
 state.reset();stall(state);assert.equal(state.waypoint(flat(()=>false),from,destination,next,player),next);assert.equal(state.needsSpace,true);
 state.reset();stall(state);assert.equal(state.waypoint(world,from,destination,undefined,player),undefined);assert.equal(state.needsSpace,false);
});

test('a player behind or upstairs does not make a nearby wall trigger avoidance',()=>{
 const state=new StoryCompanionAvoidance(),from=point(0,0),destination=point(3,0),next=point(1,0),world=flat();
 for(const player of[point(-1,0),point(.615,0,3.5)]){state.reset();for(let i=0;i<90;i++)state.observe(from,from,point(.024,0),1/60,player);assert.equal(state.waypoint(world,from,destination,next,player),next);}
});

test('real Rapier capsules pass the parked east-stair player and peer using one bounded physical move per step',async()=>{
 await RAPIER.init();const physics=new RAPIER.World({x:0,y:-18,z:0}),height=1.75,dt=1/60,speed=1.45;
 const floor=.44,from=point(-37.79,-78.16,.455),player=point(-37.176,-78.145,.463),peer=point(-36.43,-77.99,.625),destination=point(-35.4,-77.6,.61);
 physics.createCollider(RAPIER.ColliderDesc.cuboid(8,.1,.95).setTranslation(-37,floor-.1,-77.8));
 const make=(p:Vector3)=>{const body=physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y+height/2,p.z));const capsule=physics.createCollider(RAPIER.ColliderDesc.capsule((height-.6)/2,.3),body);return{body,capsule};};
 const actor=make(from);make(player);make(peer);physics.step();
 const controller=physics.createCharacterController(.015);controller.enableAutostep(.42,.20,false);controller.enableSnapToGround(.30);controller.setMaxSlopeClimbAngle(Math.PI*.27);controller.setMinSlopeSlideAngle(Math.PI*.30);
 const nav={storyPath:(a:Vector3,b:Vector3)=>[b.clone()],supportAt(p:Vector3,h?:number){assert.equal(h,1.75);const hit=physics.castRayAndGetNormal(new RAPIER.Ray({x:p.x,y:p.y+.14,z:p.z},{x:0,y:-1,z:0}),.34,true,RAPIER.QueryFilterFlags.ONLY_FIXED);if(!hit)return null;const ground=p.y+.14-hit.timeOfImpact;const shape=new RAPIER.Capsule((h!-.6)/2,.285);return{height:ground,normalY:hit.normal.y,clear:physics.intersectionWithShape({x:p.x,y:ground+h!/2+.025,z:p.z},{x:0,y:0,z:0,w:1},shape,RAPIER.QueryFilterFlags.ONLY_FIXED)===null};}};
 const state=new StoryCompanionAvoidance();let position=from.clone(),usedBypass=false,moves=0;
 try{
  for(let frame=0;frame<720&&Math.hypot(destination.x-position.x,destination.z-position.z)>.12;frame++){
   const next=state.waypoint(nav,position,destination,destination,player,[peer]);assert.ok(next);if(Math.abs(next.z-destination.z)>.05)usedBypass=true;
   const desired=next.clone().sub(position).setY(0),distance=desired.length();if(distance)desired.multiplyScalar(Math.min(distance,speed*dt)/distance);
   actor.body.setTranslation({x:position.x,y:position.y+height/2,z:position.z},true);physics.propagateModifiedBodyPositionsToColliders();
   controller.computeColliderMovement(actor.capsule,{x:desired.x,y:-.01,z:desired.z},undefined,undefined,c=>c.handle!==actor.capsule.handle);moves++;
   const motion=controller.computedMovement(),moved=position.clone().add(new Vector3(motion.x,motion.y,motion.z));
   // Rapier can add sub-millimetre contact correction; requested speed stays fixed.
   assert.ok(desired.length()<=speed*dt+.0000001);
   assert.ok(Math.hypot(motion.x,motion.z)<=speed*dt+.001,'physical movement exceeded request at frame '+frame+': '+Math.hypot(motion.x,motion.z)+' / '+(speed*dt)+'; requested '+desired.toArray());
   assert.ok(Math.hypot(moved.x-player.x,moved.z-player.z)>.59,'player and companion cannot overlap');
   assert.ok(Math.hypot(moved.x-peer.x,moved.z-peer.z)>.59,'companions cannot overlap');
   state.observe(position,moved,desired,dt,player);position=moved;actor.body.setNextKinematicTranslation({x:position.x,y:position.y+height/2,z:position.z});physics.step();
  }
  assert.ok(usedBypass,'the blocked route must actually use avoidance');assert.ok(moves>60);assert.ok(Math.hypot(destination.x-position.x,destination.z-position.z)<=.12,`companion did not arrive: ${position.toArray()}`);
 }finally{physics.free();}
});





