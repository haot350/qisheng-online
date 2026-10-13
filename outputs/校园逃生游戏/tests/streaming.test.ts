import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChunkStreamer,chunkDistance,chunkInPhotoView} from '../src/streaming.ts';
import type {MapChunk} from '../src/types.ts';
const chunk=(url:string,x:number,bytes=1):MapChunk=>({url,center:[x,0,0],radius:1,bytes,bounds:{min:[x-1,-1,-1],max:[x+1,1,1]}});
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('turning into a failed distant view never pauses walking and local retry does not retry near scenery',async()=>{
 let fail=true;const calls:string[]=[];
 const stream=new ChunkStreamer([chunk('near',0),chunk('far',220)],async c=>{calls.push(c.url);if(c.url==='far'&&fail)throw Error('offline');return c.url;},()=>{});
 stream.update([0,0,0],[],true);await flush();stream.setPhotoView({origin:[0,0,0],direction:[1,0,0],fov:13,aspect:1.5,far:360});stream.update([0,0,0],[],true);await flush();
 assert.equal(stream.status().blocked,false);assert.equal(stream.status().failed,false);assert.equal(stream.status().viewFailed,true);assert.equal(stream.status().viewReady,false);fail=false;stream.retryView();await flush();assert.equal(stream.status().viewReady,true);assert.deepEqual(calls,['near','far','far']);stream.dispose();
});
test('cinematic preparation uses a bounded queue, pins the union through rotation and releases references',async()=>{
 let now=0;const pending=new Map<string,(v:string)=>void>(),released:string[]=[],calls:string[]=[];
 const stream=new ChunkStreamer([chunk('a',140),chunk('b',180),chunk('c',220),chunk('d',-180)],c=>new Promise<string>(resolve=>{calls.push(c.url);pending.set(c.url,resolve);}),s=>released.push(s),()=>now);
 const view={origin:[0,0,0] as [number,number,number],direction:[1,0,0] as [number,number,number],fov:13,aspect:1.5,far:360},controller=new AbortController(),progress:number[]=[];
 const prepared=stream.prepareViews([view,{...view,direction:[-1,0,0]}],controller.signal,p=>progress.push(p));assert.equal(calls.length,2);
 pending.get('a')!('a');await flush();assert.equal(calls.length,3);pending.get('b')!('b');await flush();assert.equal(calls.length,4);pending.get('c')!('c');pending.get('d')!('d');const release=await prepared;assert.equal(progress.at(-1),1);
 now=60000;stream.update([0,0,0],[],true);assert.equal(stream.status().resident,4);assert.equal(stream.status().blocked,false);release();release();stream.update([0,0,0],[],true);assert.equal(stream.status().resident,0);assert.deepEqual(released.sort(),['a','b','c','d']);stream.dispose();
});
test('cancelling a prepared cinematic aborts unused requests and disposes their late resources',async()=>{
 const requests:{url:string;signal:AbortSignal;resolve:(v:string)=>void}[]=[],released:string[]=[];
 const stream=new ChunkStreamer([chunk('far',220)],(c,signal)=>new Promise<string>(resolve=>requests.push({url:c.url,signal,resolve})),s=>released.push(s));
 const controller=new AbortController(),prepared=stream.prepareViews([{origin:[0,0,0],direction:[1,0,0],fov:13,aspect:1.5,far:360}],controller.signal);controller.abort();await assert.rejects(prepared,/取消/);assert.equal(requests[0].signal.aborted,true);requests[0].resolve('late');await flush();assert.deepEqual(released,['late']);assert.equal(stream.status().resident,0);stream.dispose();
});
test('a failed cinematic preload releases its other pending view and can prepare the same views on retry',async()=>{
 let fail=true;const pending:{signal:AbortSignal;resolve:(v:string)=>void}[]=[],released:string[]=[];
 const stream=new ChunkStreamer([chunk('failed',180),chunk('other',220)],(c,signal)=>c.url==='failed'?fail?Promise.reject(Error('offline')):Promise.resolve('ready'):new Promise<string>(resolve=>pending.push({signal,resolve})),s=>released.push(s));
 const view={origin:[0,0,0] as [number,number,number],direction:[1,0,0] as [number,number,number],fov:13,aspect:1.5,far:360};await assert.rejects(stream.prepareViews([view],new AbortController().signal),/重试/);assert.equal(pending[0].signal.aborted,true);pending[0].resolve('late');await flush();assert.deepEqual(released,['late']);fail=false;const prepared=stream.prepareViews([view],new AbortController().signal);await flush();pending[1].resolve('other');const release=await prepared;assert.equal(stream.status().resident,2);release();stream.dispose();
});
test('telephoto scenery gates the shutter independently and stays resident for thirty seconds',async()=>{
 let now=0;
 const released:string[]=[],pending=new Map<string,(s:string)=>void>();
 const near=chunk('near',0),distant=chunk('photo-subject',220),behind=chunk('behind',-220),room={...chunk('room',220),kind:'interior' as const,floor:3};
 const view={origin:[0,0,0] as [number,number,number],direction:[1,0,0] as [number,number,number],fov:13,aspect:1.5,far:360};
 assert.equal(chunkInPhotoView(distant,view),true);assert.equal(chunkInPhotoView(behind,view),false);assert.equal(chunkInPhotoView(chunk('beyond',500),view),false);
 const stream=new ChunkStreamer([near,distant,behind,room],c=>new Promise<string>(r=>pending.set(c.url,r)),s=>released.push(s),()=>now);
 stream.setPhotoView(view);assert.equal(stream.update([0,0,0],[],true).needed,1);assert.equal(pending.has('behind'),false);assert.equal(pending.has('room'),false);
 pending.get('near')!('near');await flush();assert.equal(stream.status().blocked,false);assert.equal(stream.status().viewReady,false);assert.equal(stream.status().viewProgress,.5);pending.get('photo-subject')!('subject');await flush();assert.equal(stream.status().viewReady,true);
 stream.setPhotoView(null);stream.update([0,0,0],[],true);assert.deepEqual(released,[]);now=29999;stream.update([0,0,0],[],true);assert.deepEqual(released,[]);now=30000;stream.update([0,0,0],[],true);assert.deepEqual(released,['subject']);assert.equal(stream.status().resident,1);stream.dispose();
});
test('chunk distance uses actual bounds instead of a misleading huge radius',()=>{
  assert.equal(chunkDistance({...chunk('a',100),radius:200},[0,0,0]),99);
});
test('initial progress counts only the initial region and is weighted by source bytes',async()=>{
  const pending=new Map<string,(value:string)=>void>(),progress:number[]=[];
  const stream=new ChunkStreamer([chunk('a',0,1),chunk('b',10,3),chunk('far',150,99)],c=>new Promise<string>(resolve=>pending.set(c.url,resolve)),()=>{});
  const initial=stream.initialize([0,0,0],p=>progress.push(p));assert.equal(pending.size,2);
  pending.get('a')!('a');await flush();assert.deepEqual(progress,[.25]);pending.get('b')!('b');await initial;
  assert.deepEqual(progress,[.25,1]);stream.dispose();
});
test('missing near blocks freeze play and a failed near request can retry immediately',async()=>{
  let fail=true,calls=0;
  const stream=new ChunkStreamer([chunk('needed',0)],async()=>{calls++;if(fail)throw Error('network');return 'ready';},()=>{});
  assert.equal(stream.update([0,0,0],[],true).blocked,true);await flush();
  const failed=stream.update([0,0,0],[],true);assert.equal(failed.failed,true);assert.equal(calls,1);
  fail=false;stream.retry();await flush();assert.equal(stream.status().blocked,false);assert.equal(calls,2);stream.dispose();
});
test('far regions unload and may load again; late work after disposal frees its resource',async()=>{
  let now=0;
  const released:string[]=[],pending=new Map<string,(value:string)=>void>();
  const stream=new ChunkStreamer([chunk('a',0),chunk('b',200)],c=>new Promise<string>(resolve=>pending.set(c.url,resolve)),asset=>released.push(asset),()=>now);
  stream.update([0,0,0],[],true);pending.get('a')!('a');await flush();
  now=30000;stream.update([200,0,0],[],true);assert.deepEqual(released,['a']);stream.dispose();pending.get('b')!('b');await flush();assert.deepEqual(released,['a','b']);
});
test('hung requests expire, release concurrency slots, retry successfully and dispose obsolete late scenes',async()=>{
  let now=0;const calls:{url:string;signal:AbortSignal;resolve:(s:string)=>void}[]=[],released:string[]=[];
  const stream=new ChunkStreamer([chunk('a',0),chunk('b',2)],(c,signal)=>new Promise<string>(resolve=>calls.push({url:c.url,signal,resolve})),asset=>released.push(asset),()=>now);
  stream.update([0,0,0],[],true);assert.equal(calls.length,2);
  now=3600000;const timedOut=stream.update([0,0,0],[],true);assert.equal(timedOut.failed,true);assert.ok(calls.slice(0,2).every(c=>c.signal.aborted));
  stream.retry();assert.equal(calls.length,4,'both occupied slots are available for retries');calls[2].resolve('new a');calls[3].resolve('new b');await flush();
  assert.equal(stream.status().blocked,false);assert.equal(stream.status().resident,2);
  calls[0].resolve('obsolete a');calls[1].resolve('obsolete b');await flush();assert.deepEqual(released,['obsolete a','obsolete b']);
  stream.dispose();assert.deepEqual(released,['obsolete a','obsolete b','new a','new b']);
});
test('an unrelated upper-floor failure cannot freeze a ground-floor player but stairs require both adjacent landings',async()=>{
  const floors=[{id:1,elevation:.61},{id:2,elevation:4.32},{id:3,elevation:8.34}];
  const chunks=floors.map(f=>({...chunk(`floor${f.id}`,0),kind:'interior' as const,floor:f.id,center:[0,f.elevation,0] as [number,number,number],bounds:{min:[-2,f.elevation,-2] as [number,number,number],max:[2,f.elevation+3.5,2] as [number,number,number]}}));
  const stream=new ChunkStreamer(chunks,async c=>{if(c.floor===2)throw Error('upper download failed');return c.url;},()=>{});
  stream.update([0,.61,0],[[0,4.32,0]],true,floors);await flush();
  assert.equal(stream.update([0,.61,0],[],true,floors).blocked,false);assert.equal(stream.status().failed,false,'unseen upper level is optional while on the ground floor');
  const mid=stream.update([0,2.5,0],[],true,floors);assert.equal(mid.blocked,true);assert.equal(mid.failed,true);assert.equal(mid.needed,2,'near the mid-landing, both floors must be ready');stream.dispose();
});
test('distant NPC anchors cannot expand visual loading or freeze the player neighbourhood',async()=>{
 const requested:string[]=[],stream=new ChunkStreamer([chunk('player',0),chunk('remote-npc',140)],async c=>{requested.push(c.url);return c.url;},()=>{});
 stream.update([0,0,0],[[70,0,0],[140,0,0]],false);await flush();
 assert.deepEqual(requested,['player']);assert.equal(stream.status().blocked,false);assert.equal(stream.status().resident,1);stream.dispose();
});
test('driving prefetch reaches a distant forward region before it becomes mandatory, without loading rooms',async()=>{
 const requested:string[]=[],pending=new Map<string,(value:string)=>void>();
 const stream=new ChunkStreamer([chunk('near',0),chunk('ahead',145),{...chunk('room',0),kind:'interior',floor:1}],c=>new Promise<string>(resolve=>{requested.push(c.url);pending.set(c.url,resolve);}),()=>{});
 const driving={outdoorOnly:true,lookAhead:[120,0,0] as [number,number,number]};stream.update([0,0,0],[],true,[],driving);assert.deepEqual(requested,['near','ahead']);pending.get('near')!('near');await flush();assert.equal(stream.status().blocked,false);
 const close=stream.update([124,0,0],[],true,[],driving);assert.equal(close.blocked,true);pending.get('ahead')!('ahead');await flush();assert.equal(stream.status().blocked,false);assert.equal(requested.includes('room'),false);stream.dispose();
});
test('switching to driving releases resident interiors and walking can reload them',async()=>{
 const released:string[]=[],room={...chunk('room',0),kind:'interior' as const,floor:1};let calls=0;
 const stream=new ChunkStreamer([room],async()=>{calls++;return 'room';},x=>released.push(x));stream.update([0,0,0],[],true);await flush();assert.equal(stream.status().resident,1);
 stream.update([0,0,0],[],true,[],{outdoorOnly:true});assert.deepEqual(released,['room']);assert.equal(stream.status().resident,0);assert.equal(stream.status().blocked,false);
 stream.update([0,0,0],[],true);await flush();assert.equal(calls,2);assert.equal(stream.status().resident,1);stream.dispose();
});
test('a required neighbourhood preempts slow prefetch without recording a failed download',async()=>{
 const released:string[]=[],calls:{url:string;signal:AbortSignal;resolve:(s:string)=>void}[]=[];
 const stream=new ChunkStreamer([chunk('old-near',0),chunk('old-far-a',40),chunk('old-far-b',60),chunk('new-required',220)],(c,signal)=>new Promise<string>(resolve=>calls.push({url:c.url,signal,resolve})),asset=>released.push(asset));
 stream.update([0,0,0],[],false);calls.find(c=>c.url==='old-near')!.resolve('old-near');await flush();
 const status=stream.update([220,0,0],[],false),required=calls.find(c=>c.url==='new-required');
 assert.equal(status.blocked,true);assert.ok(required,'near ground begins loading before the optional request timeout');
 const cancelled=calls.filter(c=>c.signal.aborted);assert.equal(cancelled.length,1);assert.equal(stream.status().failed,false);
 required.resolve('new-required');await flush();assert.equal(stream.status().blocked,false);
 cancelled[0].resolve('obsolete');await flush();assert.deepEqual(released,['obsolete']);
 assert.equal(stream.status().failed,false);assert.ok(calls.filter(c=>!c.signal.aborted&&!['old-near','new-required'].includes(c.url)).length<=2);
 stream.dispose();
});
test('cinematic pins outrank photograph downloads, which outrank ordinary prefetch',async t=>{
 const calls:{url:string;signal:AbortSignal;resolve:(s:string)=>void}[]=[],released:string[]=[];
 const stream=new ChunkStreamer([chunk('prefetch-a',40),chunk('prefetch-b',60),chunk('pin-a',180),chunk('pin-b',184),chunk('photo',220)],(c,signal)=>new Promise<string>(resolve=>calls.push({url:c.url,signal,resolve})),s=>released.push(s));
 t.after(()=>stream.dispose());
 stream.update([0,0,0],[],false);assert.deepEqual(calls.map(c=>c.url),['prefetch-a','prefetch-b']);
 stream.setPhotoView({origin:[210,0,0],direction:[1,0,0],fov:3,aspect:1,far:12});stream.update([0,0,0],[],false);
 const firstPhoto=calls.find(c=>c.url==='photo')!;assert.ok(firstPhoto);assert.equal(calls.slice(0,2).filter(c=>c.signal.aborted).length,1);
 const prepared=stream.prepareViews([{origin:[182,0,0],direction:[1,0,0],fov:3,aspect:1,far:3}],new AbortController().signal);
 assert.equal(firstPhoto.signal.aborted,true);assert.ok(calls.find(c=>c.url==='pin-a'));assert.ok(calls.find(c=>c.url==='pin-b'));
 assert.equal(stream.status().viewFailed,false,'priority cancellation is not a broken image');
 calls.find(c=>c.url==='pin-a')!.resolve('pin-a');calls.find(c=>c.url==='pin-b')!.resolve('pin-b');const release=await prepared;await flush();
 const secondPhoto=calls.filter(c=>c.url==='photo').at(-1)!;assert.notEqual(secondPhoto,firstPhoto);secondPhoto.resolve('fresh-photo');await flush();
 firstPhoto.resolve('obsolete-photo');await flush();assert.ok(released.includes('obsolete-photo'));
 const retained:string[]=[];stream.forEach(asset=>retained.push(asset));assert.ok(retained.includes('fresh-photo'));assert.ok(!retained.includes('obsolete-photo'));
 release();stream.dispose();
});
test('same-priority required downloads retain their slots and at most two requests remain active',async()=>{
 const calls:{url:string;signal:AbortSignal;resolve:(s:string)=>void;completed:boolean}[]=[];let maximum=0;
 const stream=new ChunkStreamer([chunk('near-a',0),chunk('near-b',2),chunk('near-c',4)],(c,signal)=>new Promise<string>(resolve=>{const call={url:c.url,signal,completed:false,resolve:(s:string)=>{call.completed=true;resolve(s);}};calls.push(call);maximum=Math.max(maximum,calls.filter(c=>!c.signal.aborted&&!c.completed).length);}),()=>{});
 for(let i=0;i<50;i++)stream.update([0,0,0],[],true);
 assert.equal(calls.length,2);assert.equal(calls.some(c=>c.signal.aborted),false);
 calls[0].resolve('a');await flush();assert.equal(calls.length,3);assert.equal(maximum,2);
 calls[1].resolve('b');calls[2].resolve('c');await flush();assert.equal(stream.status().blocked,false);stream.dispose();
});
test('explicit mode flags use twenty metres for walking and twenty-five for driving',()=>{
 const make=()=>new ChunkStreamer([chunk('distance-23',24)],()=>new Promise<string>(()=>{}),()=>{});
 const walk=make(),drive=make(),preview=make();
 assert.equal(walk.update([0,0,0],[],false,[],{isDriving:false,outdoorOnly:false}).needed,0);
 assert.equal(drive.update([0,0,0],[],false,[],{isDriving:true,outdoorOnly:false}).needed,1);
 assert.equal(preview.update([0,0,0],[],false,[],{isDriving:true,outdoorOnly:true}).needed,1);
 [walk,drive,preview].forEach(s=>s.dispose());
});
test('cached bounds, view membership and distances preserve geometry results while the lens moves',()=>{
 const chunks=Array.from({length:80},(_,i)=>({...chunk(`c${i}`,i*5-180),bounds:{min:[i*5-182,-2,(i%7)*10-30] as [number,number,number],max:[i*5-178,6,(i%7)*10-25] as [number,number,number]}}));
 const stream=new ChunkStreamer(chunks,()=>new Promise<string>(()=>{}),()=>{});
 for(const angle of [0,.25,1.1,Math.PI]){
  const player:[number,number,number]=[12,3,-5],view={origin:player,direction:[Math.sin(angle),0,Math.cos(angle)] as [number,number,number],fov:30+angle,aspect:16/9,far:160};
  stream.setPhotoView(view);stream.update(player,[],false);
  for(const c of chunks){assert.equal(stream.inPhotoView(c.url),chunkInPhotoView(c,view));assert.equal(stream.distanceTo(c.url),chunkDistance(c,player));}
 }
 stream.dispose();
});
test('stationary streaming reuses geometry while residency deadlines continue to run',async()=>{
 let now=0,boundsReads=0;const released:string[]=[],far=chunk('far',220),near=chunk('near',0),bounds=near.bounds;
 Object.defineProperty(near,'bounds',{get(){boundsReads++;return bounds;}});
 const stream=new ChunkStreamer([near,far],async c=>c.url,s=>released.push(s),()=>now);
 stream.setPhotoView({origin:[0,0,0],direction:[1,0,0],fov:13,aspect:1.5,far:360});stream.update([0,0,0],[],true);await flush();
 stream.setPhotoView(null);stream.update([0,0,0],[],true);const reads=boundsReads;
 for(let i=1;i<30;i++){now=i*1000;const state=stream.update([0,0,0],[],true);assert.equal(state.blocked,false);assert.equal(state.viewReady,true);assert.equal(state.resident,2);}
 assert.equal(boundsReads,reads,'The unmoving view recomputed chunk geometry');now=30000;assert.equal(stream.update([0,0,0],[],true).resident,1);assert.deepEqual(released,['far']);assert.equal(boundsReads,reads);stream.dispose();
});
test('cached stationary views still expire requests and respond to changed mode and floor metadata',async()=>{
 let now=0;const calls:{url:string;signal:AbortSignal;resolve:(s:string)=>void}[]=[],floors=[{id:1,elevation:0}];
 const room={...chunk('room',0),kind:'interior' as const,floor:1},stream=new ChunkStreamer([room,chunk('distance-23',24)],(c,signal)=>new Promise<string>(resolve=>calls.push({url:c.url,signal,resolve})),()=>{},()=>now);
 stream.update([0,0,0],[],true,floors,{isDriving:false,outdoorOnly:false});now=30000;assert.equal(stream.update([0,0,0],[],true,floors,{isDriving:false,outdoorOnly:false}).failed,true);assert.equal(calls[0].signal.aborted,true);
 floors[0].elevation=4;assert.equal(stream.update([0,0,0],[],true,floors,{isDriving:false,outdoorOnly:false}).needed,0);
 assert.equal(stream.update([0,0,0],[],true,floors,{isDriving:true,outdoorOnly:true}).needed,1);stream.retry();calls.filter(c=>c.url==='distance-23').at(-1)!.resolve('road');await flush();assert.equal(stream.status().blocked,false);stream.dispose();
});
