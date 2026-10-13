import {test} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {storyCorridorPath} from '../src/story-corridor.ts';

const from=()=>new Vector3(-48.65,.55,-78.32),to=()=>new Vector3(-57.38,.55,-78.02);
async function fixture(run:(world:RAPIER.World)=>void,floor=true){
 await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});
 if(floor)world.createCollider(RAPIER.ColliderDesc.cuboid(17,.1,1.7).setTranslation(-50,.435,-77.5));
 world.step();try{run(world);}finally{world.free();}
}

test('first-floor corridor route uses the supported aisle in either direction without mutating endpoints',async()=>fixture(world=>{
 const a=from(),b=to(),aBefore=a.clone(),bBefore=b.clone(),path=storyCorridorPath(world,a,b);
 assert.ok(path);assert.equal(path.length,4);assert.equal(path[1].z,-77.4);assert.equal(path[2].z,-77.4);
 assert.ok(path.every(p=>Math.abs(p.y-.535)<.0001));assert.deepEqual(a,aBefore);assert.deepEqual(b,bBefore);
 const reverse=storyCorridorPath(world,b,a);assert.ok(reverse);assert.equal(reverse[1].x,b.x);assert.equal(reverse[2].x,a.x);
}));

test('corridor route never replaces outdoor, upper-floor, short or invalid navigation',async()=>fixture(world=>{
 for(const a of[new Vector3(-70,.55,-78),new Vector3(-48.65,4.3,-78.32),new Vector3(-48.65,.55,-80),new Vector3(NaN,.55,-78.32),new Vector3(-48.65,.81,-78.32)])assert.equal(storyCorridorPath(world,a,to()),null);
 assert.equal(storyCorridorPath(world,from(),new Vector3(-48.1,.55,-78)),null);
}));

test('standing capsule clearance rejects a real wall across the aisle',async()=>fixture(world=>{
 world.createCollider(RAPIER.ColliderDesc.cuboid(.08,1.3,1.6).setTranslation(-52,1.835,-77.5));world.step();
 assert.equal(storyCorridorPath(world,from(),to()),null);
}));

test('unsupported or discontinuous corridor floors cannot become a shortcut',async()=>{
 await fixture(world=>assert.equal(storyCorridorPath(world,from(),to()),null),false);
 await fixture(world=>{
  world.createCollider(RAPIER.ColliderDesc.cuboid(2,.1,1.7).setTranslation(-48,.435,-77.5));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2,.1,1.7).setTranslation(-58,.435,-77.5));world.step();
  assert.equal(storyCorridorPath(world,from(),to()),null);
 },false);
});
