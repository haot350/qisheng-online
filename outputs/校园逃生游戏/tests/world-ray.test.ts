import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';

// Run loadWorld's actual Rapier queries against a small floor and wall mesh.
// Existing navigation data initializes its unchanged navigation dependency.
function collision(){
  const positions=new Float32Array([
    -10,0,-10, 10,0,-10, 10,0,10, -10,0,10,
    -2,0,2, 2,0,2, 2,3,2, -2,3,2,
    -10,4,-10, 10,4,-10, 10,4,10, -10,4,10,
    -8,1.4,-4, -5,1.4,-4, -5,1.4,-1, -8,1.4,-1,
  ]);
  const indices=new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,8,10,9,8,11,10,12,14,13,12,15,14]);
  const bytes=new Uint8Array(8+positions.byteLength+indices.byteLength);
  new Uint32Array(bytes.buffer,0,2).set([positions.length,indices.length]);
  bytes.set(new Uint8Array(positions.buffer),8);bytes.set(new Uint8Array(indices.buffer),8+positions.byteLength);
  return bytes;
}
async function fixture(run:(world:Awaited<ReturnType<typeof loadWorld>>)=>void){
  const previous=globalThis.fetch;
  const navigation=readFileSync(new URL('../public/map/navigation.bin',import.meta.url));
  const manifest={chunks:[],spawn:[0,0,0],collisionUrl:'/collision',navmeshUrl:'/navigation'};
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url==='/map/manifest.json')return new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}});
    if(url==='/collision')return new Response(collision());
    if(url==='/navigation')return new Response(navigation);
    throw new Error(`unexpected request: ${url}`);
  };
  let world:Awaited<ReturnType<typeof loadWorld>>|undefined;
  try{world=await loadWorld(new Scene(),()=>{});run(world);}
  finally{world?.dispose();globalThis.fetch=previous;}
}

test('production world ray ignores the player capsule and stops at a solid wall',async()=>fixture(world=>{
  world.move(new Vector3(0,0,0),new Vector3(0,-.01,0),1/60,false);
  world.step(1/60);
  assert.ok(Math.abs(world.rayDistance(new Vector3(0,1.62,0),new Vector3(0,0,1),5)-2)<1e-5);
  assert.equal(world.rayDistance(new Vector3(0,1.62,0),new Vector3(1,0,0),5),5);
  assert.equal(world.rayDistance(new Vector3(0,1.62,0),new Vector3(0,0,1),1),1,'rays never extend past their requested range');
}));

test('replacing the crouching capsule keeps player exclusion and real obstacles',async()=>fixture(world=>{
  assert.equal(world.setCrouch(new Vector3(0,0,0),true),true);
  world.move(new Vector3(0,0,0),new Vector3(0,-.01,0),1/60,true);
  world.step(1/60);
  assert.ok(Math.abs(world.rayDistance(new Vector3(0,1.04,0),new Vector3(0,0,1),5)-2)<1e-5);
  assert.equal(world.rayDistance(new Vector3(0,1.04,0),new Vector3(1,0,0),5),5);
  assert.equal(world.setCrouch(new Vector3(0,0,0),false),false);
  world.move(new Vector3(0,0,0),new Vector3(0,-.01,0),1/60,false);
  world.step(1/60);
  assert.ok(Math.abs(world.rayDistance(new Vector3(0,1.62,0),new Vector3(0,0,1),5)-2)<1e-5);
}));

test('NPC capsules stop at real walls instead of following an impossible navigation waypoint',async()=>fixture(world=>{
  let npc=new Vector3(1,0,-2);
  for(let i=0;i<240;i++){npc=world.moveActor(0,npc,new Vector3(0,0,3/60),1/60);world.step(1/60);}
  assert.ok(npc.z>1.4&&npc.z<1.72,`capsule must stop before the wall: ${npc.z}`);
  assert.ok(npc.y>=-.02&&npc.y<.05,`NPC remains grounded: ${npc.y}`);
  assert.equal(world.rayDistance(new Vector3(1,1.5,-1),new Vector3(0,0,1),10),3,'combat rays ignore the NPC capsule and see the actual wall');
}));

test('an NPC on an upper floor remains on that floor through suppression and a clean restart',async()=>fixture(world=>{
  let npc=new Vector3(4,4,0);
  for(let i=0;i<120;i++){npc=world.moveActor(1,npc,new Vector3(),1/60);world.step(1/60);}
  assert.ok(npc.y>3.98&&npc.y<4.05);
  for(let i=0;i<60;i++){npc=world.moveActor(1,npc,new Vector3(),1/60,true);world.step(1/60);}
  assert.ok(npc.y>3.98&&npc.y<4.05,'kneeling cannot collapse the NPC through the upper slab');
  world.resetActors();npc.set(4,0,0);
  for(let i=0;i<60;i++){npc=world.moveActor(1,npc,new Vector3(),1/60);world.step(1/60);}
  assert.ok(npc.y>=-.02&&npc.y<.05,'reset releases the old-floor capsule and vertical velocity');
}));

test('safe supports require nearby static ground and ignore an NPC standing beneath the player',async()=>fixture(world=>{
  world.restorePlayer(new Vector3(4,.012,0),false);
  assert.ok(world.supportAt(new Vector3(4,.012,0))?.clear);
  assert.ok(world.supportAt(new Vector3(4,4.012,0))?.clear,'the actual upper slab is a valid separate support');
  assert.equal(world.supportAt(new Vector3(4,2,0)),null,'a lower floor cannot validate a point in the air');
  assert.equal(world.supportAt(new Vector3(4,NaN,0)),null);
  let npc=new Vector3(4,0,0);for(let frame=0;frame<60;frame++){npc=world.moveActor(9,npc,new Vector3(),1/60);world.step(1/60);}
  assert.equal(world.supportAt(new Vector3(4,1.75,0)),null,'another character is not a safe landing');
}));

test('recovery replaces old contact state and supports both crouched and standing capsules',async()=>fixture(world=>{
  world.restorePlayer(new Vector3(4,4.012,0),true);
  let position=new Vector3(4,4.012,0);
  for(let frame=0;frame<30;frame++){position=world.move(position,new Vector3(0,-.01,0),1/60,true).position;world.step(1/60);}
  assert.ok(position.y>3.98&&position.y<4.05);
  world.restorePlayer(new Vector3(-4,.012,0),false);position.set(-4,.012,0);
  for(let frame=0;frame<30;frame++){position=world.move(position,new Vector3(0,-.01,0),1/60,false).position;world.step(1/60);}
  assert.ok(position.y>-.02&&position.y<.05,'the previous floor does not retain a contact after recovery');
  assert.ok(world.supportAt(position)?.clear);
}));

test('sprint path safety uses the NPC height, wall clearance and same-floor support',async()=>fixture(world=>{
 world.step(1/60);
 assert.equal(world.npcRouteSafe([new Vector3(4,.012,-6),new Vector3(4,.012,1)]),true,'flat supported route permits sprint');
 assert.equal(world.npcRouteSafe([new Vector3(0,.012,-4),new Vector3(0,.012,5)]),false,'swept capsule cannot cross a solid wall');
 assert.equal(world.npcRouteSafe([new Vector3(4,.012,5),new Vector3(4,.012,12)]),false,'a floor edge is unsafe even with a navigation waypoint');
 assert.equal(world.npcRouteSafe([new Vector3(4,.012,-4),new Vector3(4,4.012,3)]),false,'a staircase or cross-floor route cannot start a sprint');
 const low=new Vector3(-6.5,.012,-2);world.restorePlayer(low,true);
 assert.equal(world.supportAt(low)?.clear,true,'crouched player fits below the low roof');
 assert.equal(world.supportAt(low,1.75)?.clear,false,'standing NPC clearance does not inherit player crouch');
 assert.equal(world.npcRouteSafe([low,new Vector3(-6.5,.012,-3)],1),false,'low doorways cannot permit a sprint');
}));
