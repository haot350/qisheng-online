import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){
  const url=new URL(specifier,context.parentURL);
  if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);
 }
 return next(specifier,context);
}});
const {StaticTriangleBlockers}=await import('../src/triangle-blocker.ts');
const {SimWorld}=await import('../src/multiplayer/shared/sim-world.ts');
const {geometryVisible,RecipientVisibility}=await import('../src/multiplayer/shared/visibility.ts');
import type {Vec3} from '../src/multiplayer/shared/protocol.ts';
const large=()=>new StaticTriangleBlockers(new Float32Array([0,-3,-3,0,3,-3,0,0,3]),new Uint32Array([0,1,2]));
test('verified front and reverse face IDs prove only strict interior obstruction',()=>{
 for(const face of [0,1]){const hints=large();hints.remember(face,[-2,0,0],[2,0,0],2);
  assert.equal(hints.blocks([-2,0,0],[2,0,0]),true);
  assert.equal(hints.blocks([-2,0,0],[-1,0,0]),false,'same side cannot be declared visible or blocked by stale hint');
  assert.equal(hints.blocks([-2,0,3],[2,0,3]),false,'vertex and edge require actual fallback');
  assert.equal(hints.blocks([-2,0,0],[.004,0,0]),false,'near-endpoint falls back to exact 5mm rule');
  assert.equal(hints.blocks([0,0,0],[2,0,0]),false,'start on face is uncertain');
 }
});
test('unknown or mismapped features and tiny-triangle edges never become blocker proof',()=>{
 const hints=large();for(const id of [-1,2,2.5,undefined])hints.remember(id as any,[-2,0,0],[2,0,0],2);
 hints.remember(0,[-2,0,0],[2,0,0],1);assert.equal(hints.blocks([-2,0,0],[2,0,0]),false);
 const tiny=new StaticTriangleBlockers(new Float32Array([0,0,0,0,.01,0,0,0,.01]),new Uint32Array([0,1,2]));
 tiny.remember(0,[-2,.001,.001],[2,.001,.001],2);assert.equal(tiny.blocks([-2,.001,.001],[2,.001,.001]),false,'5mm physical edge margin');
});
test('f32-converted near edges, near-parallel rays and behind-face endpoints remain uncertain',()=>{
 const hints=large();hints.remember(0,[-2,0,0],[2,0,0],2);
 for(const epsilon of [-1e-7,0,1e-7])assert.equal(hints.blocks([-2,epsilon,3+epsilon],[2,epsilon,3+epsilon]),false,'f32 vertex neighbourhood');
 assert.equal(hints.blocks([-1e-8,-1,0],[1e-8,1,0]),false,'near-parallel ray');
 assert.equal(hints.blocks([2,0,0],[3,0,0]),false,'triangle lies behind the ray');
 const far=new StaticTriangleBlockers(new Float32Array([200,-3,-3,200,3,-3,200,0,3]),new Uint32Array([0,1,2]));
 far.remember(0,[198,0,0],[202,0,0],2);
 assert.equal(far.blocks([200-1e-7,0,0],[202,0,0]),false,'f32 origin rounds onto the plane and must fall back');
});
test('immutable obstruction hints do not bypass smoke or change sampled body checks',()=>{
 let calls=0;const world={visible:()=>true,visionGeometryVisible:()=>{calls++;return true;}};
 const self={id:'self',position:[0,0,0],velocity:[0,0,0],crouched:false,generation:1} as any;
 const enemy={...self,id:'enemy',position:[0,0,-12]};
 assert.equal(new RecipientVisibility().permits(world,self,enemy,[{id:'s',position:[0,1,-6],radius:3,left:5,bornTick:0}],60),false);assert.equal(calls,0);
 world.visionGeometryVisible=()=>{calls++;return false;};calls=0;
 assert.equal(new RecipientVisibility().permits(world,self,enemy,[],60),false);assert.equal(calls,5,'all original body samples remain');
});
test('real final map boolean hints match unchanged physical and foliage distance for ten thousand changing segments',async()=>{
 const root=new URL('../public/map/',import.meta.url),read=(p:string)=>readFileSync(new URL(p,root)),ab=(b:Buffer)=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
 const world=await SimWorld.create(JSON.parse(read('manifest.json').toString()),ab(read('collision.bin')),new Uint8Array(read('navigation.bin')),ab(read('vision.bin')));
 let seed=707;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 try{
  for(let n=0;n<10000;n++){
   const cluster=Math.floor(n/25),x=-80+(cluster%18)*9,z=-180+(Math.floor(cluster/18)%15)*10;
   const a:Vec3=[x+random()*.7,1.1+(cluster%4)*4.02,z+random()*.7];
   const b:Vec3=[x+12+random()*20,.2+(cluster%4)*4.02+random()*1.55,z+random()*22];
   const delta:Vec3=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],length=Math.hypot(...delta);
   const expected=length<.005||world.visionRayDistance(a,delta.map(v=>v/length) as Vec3,length)>=length-.005;
   assert.equal(geometryVisible(world,a,b),expected,'changing segment '+n);
  }
  const stats=world.visibilityQueryStats();assert.ok(stats.proofHits>0&&stats.physicalFallbacks>0&&stats.visionQueries>0);
  const old=stats.proofHits;stats.proofHits=0;assert.equal(world.visibilityQueryStats().proofHits,old,'health snapshot cannot mutate counters');
  for(const x of [-14,-12,-6,0,6,12,14])for(const y of [.26,.9,1.343])for(const offset of [-.006,-.001,0,.001,.006]){
   const a:Vec3=[x+offset,y,-83.8],b:Vec3=[x+offset,y,-87.6],d:Vec3=[0,0,-1],length=3.8;
   assert.equal(geometryVisible(world,a,b),world.visionRayDistance(a,d,length)>=length-.005,'actual railing near edges');
  }
 }finally{world.dispose();}
});
