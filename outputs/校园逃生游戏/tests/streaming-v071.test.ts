import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ChunkStreamer,chunkInPhotoView,combatStructure,type PhotoView} from '../src/streaming.ts';
import {FrameDiagnostics} from '../src/frame-diagnostics.ts';
import type {MapChunk,MapManifest,Vec3} from '../src/types.ts';
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const chunk=(url:string,x:number,extra:Partial<MapChunk>={}):MapChunk=>({url,center:[x,1,0],radius:1,bounds:{min:[x-1,0,-1],max:[x+1,2,1]},...extra});

test('initial nearby readiness never waits for optional decoration',async()=>{
 const loads:string[]=[];
 const stream=new ChunkStreamer([chunk('wall',0,{residency:'structure'}),chunk('paper',0,{residency:'detail'})],async c=>{loads.push(c.url);return c.url;},()=>{});
 await stream.initialize([0,0,0],()=>{});assert.deepEqual(loads,['wall']);
 stream.dispose();
});

test('real campus manifest: three full rotations never re-decode or evict a leased combat structure',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/map/manifest.json',import.meta.url),'utf8')) as MapManifest;
 let now=0;const loads=new Map<string,number>(),freed:string[]=[];
 const stream=new ChunkStreamer(manifest.chunks,async c=>{loads.set(c.url,(loads.get(c.url)??0)+1);return c.url;},s=>freed.push(s),()=>now);
 const release=await stream.prepareCombat(new AbortController().signal);
 for(let turn=0;turn<3;turn++)for(let degrees=0;degrees<360;degrees+=10){
  const yaw=degrees*Math.PI/180,view:PhotoView={origin:[manifest.spawn[0],manifest.spawn[1]+1.62,manifest.spawn[2]],direction:[-Math.sin(yaw),0,-Math.cos(yaw)],fov:78,aspect:16/9,far:420};
  stream.setCombatViews([view]);const status=stream.update(manifest.spawn,[],false,manifest.floors??[]);
  assert.equal(status.blocked,false,`turn ${turn}, heading ${degrees}`);assert.equal(status.combatReady,true);
  for(let sub=0;sub<6;sub++)assert.equal(stream.checkSafety(manifest.spawn,false,manifest.floors??[]).blocked,false);
  await flush();now+=250;
 }
 const core=manifest.chunks.filter(combatStructure);
 assert.ok(core.length>50,'uses actual campus, not a toy two-wall scene');
 assert.ok(core.every(c=>loads.get(c.url)===1));assert.ok(core.every(c=>!freed.includes(c.url)));
 const before=stream.diagnostics();assert.equal(before.combatLeases,1);assert.equal(before.structureResident,core.length);
 release();stream.setCombatViews(null);now=120000;stream.update([2000,0,2000],[],false,manifest.floors??[]);
 assert.ok(core.every(c=>freed.includes(c.url)),'session end makes structures evictable');stream.dispose();
});

test('whole-campus lease has a GPU-ready barrier; optional detail never freezes combat',async()=>{
 const waiting=new Map<string,(value:string)=>void>();
 const s=new ChunkStreamer([chunk('wall',0,{residency:'structure'}),chunk('distant-wall',500,{residency:'structure'}),chunk('paper',0,{residency:'detail',combatOccluder:false})],c=>new Promise<string>(resolve=>waiting.set(c.url,resolve)),()=>{});
 const prepared=s.prepareCombat(new AbortController().signal);s.update([0,0,0],[],false);
 assert.equal(s.status().blocked,true);waiting.get('wall')!('gpu-ready-wall');await flush();assert.equal(s.status().combatReady,false);
 waiting.get('distant-wall')!('gpu-ready-distant');const release=await prepared;s.update([0,0,0],[],false);
 assert.equal(s.status().blocked,false);assert.equal(s.status().combatReady,true);assert.ok(waiting.has('paper'));
 s.setPhotoView({origin:[0,1,0],direction:[1,0,0],fov:15,aspect:1.5,far:600});s.update([0,0,0],[],false);assert.equal(s.status().viewReady,true,'scope does not wait for paper');
 release();s.dispose();waiting.get('paper')!('late-paper');await flush();
});

test('leases are reference counted, cancelled preparation frees late scenes and retry can finish',async()=>{
 let resolve!:(s:string)=>void,signal!:AbortSignal;const released:string[]=[];
 const s=new ChunkStreamer([chunk('wall',300,{residency:'structure'})],(_c,sig)=>{signal=sig;return new Promise<string>(r=>resolve=r);},s=>released.push(s));
 const a=new AbortController(),b=new AbortController(),one=s.prepareCombat(a.signal),two=s.prepareCombat(b.signal);
 a.abort();await assert.rejects(one,/取消/);assert.equal(signal.aborted,false,'second owner keeps download');resolve('wall');const release=await two;
 s.setCombatViews(null);s.update([5000,0,5000],[],true);assert.equal(s.status().blocked,false);assert.equal(s.status().resident,1);
 release();s.dispose();assert.deepEqual(released,['wall']);
 const lateReleased:string[]=[];const late=new ChunkStreamer([chunk('late',300)],(_c,sig)=>{signal=sig;return new Promise<string>(r=>resolve=r);},s=>lateReleased.push(s));
 const ctl=new AbortController(),pending=late.prepareCombat(ctl.signal);ctl.abort();await assert.rejects(pending,/取消/);assert.equal(signal.aborted,true);resolve('decoded-after-cancel');await flush();assert.deepEqual(lateReleased,['decoded-after-cancel']);late.dispose();
});

test('rectangular frustum rejects vertical cone corners but conservatively retains intersecting AABBs',()=>{
 const view:PhotoView={origin:[0,0,0],direction:[0,0,-1],fov:60,aspect:2,far:100};
 const bounds=(center:Vec3,half:Vec3):MapChunk=>({url:'view',center,radius:50,bounds:{min:center.map((n,i)=>n-half[i]) as Vec3,max:center.map((n,i)=>n+half[i]) as Vec3}});
 assert.equal(chunkInPhotoView(bounds([12,20,-30],[.1,.1,.1]),view),false);
 assert.equal(chunkInPhotoView(bounds([32,0,-30],[1,1,1]),view),true);
 assert.equal(chunkInPhotoView(bounds([0,18,-30],[1,2,1]),view),true);
 assert.equal(chunkInPhotoView(bounds([0,0,10],[1,1,1]),view),false);
 assert.equal(chunkInPhotoView(bounds([0,0,-103],[1,1,1]),view),false);
});

test('whole-frame diagnostics include work outside renderer and exclude background gaps',()=>{
 let now=10;const frames=new FrameDiagnostics(3,()=>now);
 frames.begin(100);now=17;frames.phase('streaming',5);frames.end();
 now=20;frames.begin(116);now=31;frames.end();frames.begin(180);now=34;frames.end();frames.begin(3000);now=36;frames.end();
 const report=frames.snapshot();assert.equal(report.frameIntervalMs.samples,2);assert.equal(report.frameIntervalMs.max,64);assert.equal(report.longFrames,1);assert.equal(report.frameCpuMs.max,11);assert.equal(report.phases.streaming.max,5);
});
