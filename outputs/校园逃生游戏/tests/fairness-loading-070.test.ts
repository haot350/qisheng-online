import {test} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {registerHooks} from 'node:module';
import {ChunkStreamer,type PhotoView} from '../src/streaming.ts';
import {VisionGeometry} from '../src/vision-geometry.ts';
import {sameMap} from '../src/multiplayer/shared/protocol.ts';
import type {MapChunk} from '../src/types.ts';
const chunk=(url:string,x:number,extra:Partial<MapChunk>={}):MapChunk=>({url,center:[x,1,0],radius:1,bounds:{min:[x-1,0,-1],max:[x+1,2,1]},...extra});
const view:PhotoView={origin:[0,1,0],direction:[1,0,0],fov:70,aspect:1.6,far:420};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const hooks=registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);return next(specifier,context);}});
const {geometryVisible}=await import('../src/multiplayer/shared/visibility.ts');hooks.deregister();

test('normal view gates distant opaque structure and other-floor walls, not optional decoration',async()=>{
 const requests=new Map<string,(v:string)=>void>();
 const stream=new ChunkStreamer([chunk('near',0),chunk('third-floor',140,{kind:'interior',floor:3}),chunk('flowers',180,{combatOccluder:false}),chunk('behind',-180)],c=>new Promise<string>(r=>requests.set(c.url,r)),()=>{});
 stream.setCombatViews([view]);stream.update([0,0,0],[],false,[{id:1,elevation:0},{id:3,elevation:8}]);
 assert.equal(stream.status().blocked,true);assert.equal(stream.inCombatView('third-floor'),true);assert.equal(stream.inCombatView('flowers'),false);assert.equal(stream.inCombatView('behind'),false);
 requests.get('near')!('near');await flush();assert.equal(stream.status().blocked,true);requests.get('third-floor')!('wall');await flush();assert.equal(stream.status().combatReady,true);assert.equal(stream.status().blocked,false);stream.dispose();
});
test('the next corner and scope share the structure gate; previous-view completion cannot unlock a new view',async()=>{
 const requests=new Map<string,(v:string)=>void>();
 const stream=new ChunkStreamer([chunk('east',180),chunk('west',-180)],c=>new Promise<string>(r=>requests.set(c.url,r)),()=>{});
 stream.setCombatViews([view]);stream.update([0,0,0],[],true);const first=stream.status().viewRevision;
 stream.setCombatViews([{...view,direction:[-1,0,0],fov:13}]);stream.update([0,0,0],[],true);
 assert.notEqual(stream.status().viewRevision,first);requests.get('east')!('old-view');await flush();assert.equal(stream.status().blocked,true);assert.equal(stream.status().combatReady,false);
 requests.get('west')!('current-view');await flush();assert.equal(stream.status().blocked,false);stream.dispose();
});
test('cancelling a combat preload releases late decoded scenes and cannot resolve readiness',async()=>{
 let request!:{signal:AbortSignal;resolve:(v:string)=>void};const releases:string[]=[];
 const stream=new ChunkStreamer([chunk('wall',180)],(_c,signal)=>new Promise<string>(resolve=>request={signal,resolve}),s=>releases.push(s));
 const controller=new AbortController(),prepared=stream.prepareViews([view],controller.signal,undefined,true);
 controller.abort();await assert.rejects(prepared,/取消/);assert.equal(request.signal.aborted,true);request.resolve('late-wall');await flush();assert.deepEqual(releases,['late-wall']);assert.equal(stream.status().resident,0);stream.dispose();
});
function wallBytes(){const p=new Float32Array([1,0,-2,1,3,-2,1,3,2,1,0,2]),i=new Uint32Array([0,1,2,0,2,3]),bytes=new ArrayBuffer(8+(p.length+i.length)*4);new Uint32Array(bytes,0,2).set([p.length,i.length]);new Float32Array(bytes,8,p.length).set(p);new Uint32Array(bytes,8+p.length*4,i.length).set(i);return bytes;}
test('dense foliage blocks perception and replication while bullet and movement query worlds remain clear',async()=>{
 await RAPIER.init();const foliage=new VisionGeometry(wallBytes()),physics=new RAPIER.World({x:0,y:0,z:0}),origin={x:0,y:1,z:0},direction={x:1,y:0,z:0};physics.step();
 assert.equal(foliage.rayDistance(origin,direction,3),1);assert.equal(physics.castRay(new RAPIER.Ray(origin,direction),3,true),null);
 assert.equal(physics.intersectionWithShape({x:1,y:.9,z:0},{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.575,.3)),null);
 const world={visible:()=>true,rayDistance:()=>3,visionRayDistance:(a:[number,number,number],d:[number,number,number],max:number)=>foliage.rayDistance({x:a[0],y:a[1],z:a[2]},{x:d[0],y:d[1],z:d[2]},max)};
 assert.equal(geometryVisible(world,[0,1,0],[3,1,0]),false);foliage.dispose();physics.free();
});
test('vision asset mismatch fails map identity even with matching collision and navigation',()=>{
 const identity={sourceVersion:'v16',collisionHash:'collision',navigationHash:'nav',manifestHash:'manifest',visionHash:'one'};
 assert.equal(sameMap(identity,{...identity,visionHash:'two'}),false);assert.equal(sameMap(identity,{...identity}),true);
});
