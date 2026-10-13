import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MapByteCache,MapAssetSession,MapDownloadQueue,MAP_CACHE_NAME,MAP_CACHE_LIMIT,mapDigest,type MapResource} from '../src/map-cache.ts';
import {mapDownloadState} from '../src/map-download-state.ts';

const origin='https://game.test';
const bytes=(text:string)=>new TextEncoder().encode(text).buffer;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function resource(text:string):Promise<MapResource>{const data=bytes(text),sha256=await mapDigest(data);return{url:'/assets/map/'+sha256+'.bin',sha256,bytes:data.byteLength,mime:'application/octet-stream'};}
class MemoryCaches {
 stores=new Map<string,Map<string,Response>>();
 async open(name:string){let store=this.stores.get(name);if(!store){store=new Map();this.stores.set(name,store);}const selected=store;
  const key=(input:RequestInfo|URL)=>new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,origin).href;
  return{keys:async()=>[...selected.keys()].map(url=>new Request(url)),match:async(input:RequestInfo|URL)=>selected.get(key(input))?.clone(),put:async(input:RequestInfo|URL,response:Response)=>{selected.set(key(input),response.clone());},delete:async(input:RequestInfo|URL)=>selected.delete(key(input))} as Cache;
 }
 async delete(name:string){return this.stores.delete(name);}
 asStorage(){return this as unknown as CacheStorage;}
}

test('validated bytes are reused across cache owners and corrupt entries are replaced',async()=>{
 const storage=new MemoryCaches(),r=await resource('collision-data');let requests=0;
 const env={origin,caches:storage.asStorage(),fetch:async()=>{requests++;return new Response(bytes('collision-data'));}};
 const first=new MapByteCache(env);await first.read(r);assert.equal(requests,1);
 const second=new MapByteCache(env);assert.deepEqual(await second.read(r),bytes('collision-data'));assert.equal(requests,1);assert.equal(second.stats().hits,1);
 const cache=await storage.open(MAP_CACHE_NAME);await cache.put(new URL(r.url,origin),new Response('corrupt',{headers:{'X-Map-Bytes':'7'}}));
 await second.read(r);assert.equal(requests,2);assert.equal((await cache.match(new URL(r.url,origin)))?.headers.get('X-Map-Bytes'),String(r.bytes));
});

test('quota is bounded at 192 MiB, adapts to free storage, and evicts least recently used map entries',async()=>{
 const storage=new MemoryCaches(),a=await resource('aaaa'),b=await resource('bbbb'),c=await resource('cccc'),data=new Map([[a.url,'aaaa'],[b.url,'bbbb'],[c.url,'cccc']]);
 const cache=new MapByteCache({origin,caches:storage.asStorage(),storage:{estimate:async()=>({quota:20,usage:4+[...(storage.stores.get(MAP_CACHE_NAME)?.values()??[])].reduce((n,r)=>n+Number(r.headers.get('X-Map-Bytes')),0)})},fetch:async input=>new Response(data.get(String(input)))});
 await cache.read(a);await cache.read(b);await cache.read(a);await cache.read(c);
 const stored=await storage.open(MAP_CACHE_NAME);assert(await stored.match(new URL(a.url,origin)));assert(await stored.match(new URL(c.url,origin)));assert.equal(await stored.match(new URL(b.url,origin)),undefined);assert(cache.stats().bytes<=cache.stats().budget);assert(cache.stats().budget<=MAP_CACHE_LIMIT);
});

test('CacheStorage rejection degrades to verified network bytes, without blocking play',async()=>{
 const r=await resource('map'),cache=new MapByteCache({origin,caches:{open:async()=>{throw Error('denied');}} as unknown as CacheStorage,fetch:async()=>new Response('map')});
 assert.deepEqual(await cache.read(r),bytes('map'));assert.equal(cache.stats().available,false);
});

test('bad network bytes retry once with reload and fail closed when still corrupt',async()=>{
 const r=await resource('valid'),modes:unknown[]=[],cache=new MapByteCache({origin,fetch:async(_url,init)=>{modes.push(init?.cache);return new Response('bad');}});
 await assert.rejects(cache.read(r),/校验失败/);assert.deepEqual(modes,['default','reload']);
});

test('clear removes only map cache and suppresses writes from a download started before clearing',async()=>{
 const storage=new MemoryCaches();await storage.open('photos-and-other-data');const r=await resource('world');let complete:((r:Response)=>void)|undefined;
 const cache=new MapByteCache({origin,caches:storage.asStorage(),fetch:()=>new Promise(resolve=>{complete=resolve;})});
 const pending=cache.read(r);while(!complete)await tick();await cache.clear();complete(new Response('world'));await pending;
 assert(storage.stores.has('photos-and-other-data'));assert.equal((await(await storage.open(MAP_CACHE_NAME)).keys()).length,0);
});

test('coalesced consumers cancel independently, last consumer really aborts transport, and can retry immediately',async()=>{
 const queue=new MapDownloadQueue();let calls=0,transport:AbortSignal|undefined,finish:((s:string)=>void)|undefined;
 const run=(signal:AbortSignal)=>new Promise<string>((resolve,reject)=>{calls++;transport=signal;finish=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
 const a=new AbortController(),b=new AbortController(),one=queue.request('map',run,0,a.signal),two=queue.request('map',run,0,b.signal);a.abort();await assert.rejects(one);assert.equal(transport?.aborted,false);finish!('ready');assert.equal(await two,'ready');assert.equal(calls,1);await tick();
 const c=new AbortController(),three=queue.request('map',run,0,c.signal);c.abort();await assert.rejects(three);assert.equal(transport?.aborted,true);
 const four=queue.request('map',async()=>{calls++;return 'new';});assert.equal(await four,'new');assert.equal(calls,3);
});

test('only two transfers run, foreground preempts and resumes background work',async()=>{
 const queue=new MapDownloadQueue();let active=0,maximum=0;const starts:string[]=[],finishes=new Map<string,()=>void>();
 const run=(id:string)=>(signal:AbortSignal)=>new Promise<string>((resolve,reject)=>{active++;maximum=Math.max(active,maximum);starts.push(id);let done=false;const end=(cancel=false)=>{if(done)return;done=true;active--;finishes.delete(id);cancel?reject(new DOMException('Aborted','AbortError')):resolve(id);};finishes.set(id,()=>end());signal.addEventListener('abort',()=>end(true),{once:true});});
 const a=queue.request('a',run('a'),10),b=queue.request('b',run('b'),10),high=queue.request('needed',run('needed'),0);await tick();assert(starts.includes('needed'));assert.equal(maximum,2);finishes.get('needed')!();assert.equal(await high,'needed');await tick();
 for(const end of [...finishes.values()])end();await Promise.all([a,b]);assert.equal(maximum,2);assert(starts.length>=4);
});

test('session pins index and exact manifest, changed files get a new content address',async()=>{
 const oldResource=await resource('old'),newResource=await resource('new'),manifest=bytes('{"source":"v16"}'),manifestHash=await mapDigest(manifest);let generation=0,indexCalls=0;
 const cache=new MapByteCache({origin,caches:new MemoryCaches().asStorage(),fetch:async input=>{
  const url=String(input);if(url==='/map/resource-index.json'){indexCalls++;return Response.json({schema:1,manifest:{url:'/map/manifest.json',sha256:manifestHash},resources:{'/map/collision.bin':generation?newResource:oldResource}});}
  if(url==='/map/manifest.json')return new Response(manifest);return new Response(url===oldResource.url?'old':'new');
 }});
 const session=new MapAssetSession('/map/resource-index.json',cache);assert.deepEqual(await session.read('/map/collision.bin'),bytes('old'));generation=1;assert.deepEqual(await session.read('/map/collision.bin'),bytes('old'));assert.equal(indexCalls,1);
 const nextSession=new MapAssetSession('/map/resource-index.json',cache);assert.deepEqual(await nextSession.read('/map/collision.bin'),bytes('new'));assert.equal(indexCalls,2);
});

test('mismatched sidecar manifest cannot load map bytes',async()=>{
 const cache=new MapByteCache({origin,fetch:async input=>String(input).endsWith('resource-index.json')?Response.json({schema:1,manifest:{url:'/map/manifest.json',sha256:'a'.repeat(64)},resources:{}}):new Response('{}')});
 await assert.rejects(new MapAssetSession('/map/resource-index.json',cache).initialize(),/刚刚更新/);
});

test('size metadata reads only the sidecar and pins it for later manifest initialization',async()=>{
 const requested:string[]=[],manifest=bytes('{}'),hash=await mapDigest(manifest);
 const cache=new MapByteCache({origin,fetch:async input=>{const url=String(input);requested.push(url);return url==='/map/resource-index.json'?Response.json({schema:1,manifest:{url:'/map/manifest.json',sha256:hash},resources:{}}):new Response(manifest);}});
 const session=new MapAssetSession('/map/resource-index.json',cache);await session.resourceIndex();assert.deepEqual(requested,['/map/resource-index.json']);await session.initialize();assert.deepEqual(requested,['/map/resource-index.json','/map/manifest.json']);
});

test('prefetch refuses an insufficient cache budget before transferring map bytes',async()=>{
 const storage=new MemoryCaches(),r=await resource('large-map');let requests=0;
 const cache=new MapByteCache({origin,caches:storage.asStorage(),storage:{estimate:async()=>({quota:2,usage:0})},fetch:async()=>{requests++;return new Response('large-map');}});
 await cache.prefetch([r]);assert.equal(requests,0);assert.match(cache.stats().prefetch.error,/空间不足/);assert.equal(cache.stats().prefetch.running,false);
});

test('prefetch cancellation retains completed files and continuation skips network for them',async()=>{
 const storage=new MemoryCaches(),a=await resource('first'),b=await resource('second');let bStarted=false,callsA=0;
 const cache=new MapByteCache({origin,caches:storage.asStorage(),fetch:async(input,init)=>{if(String(input)===a.url){callsA++;return new Response('first');}bStarted=true;return new Promise<Response>((resolve,reject)=>{const signal=init?.signal;signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});setTimeout(()=>resolve(new Response('second')),40);});}});
 const work=cache.prefetch([a,b]);while(!bStarted||cache.stats().prefetch.done<1)await tick();cache.cancelPrefetch();await work;assert.equal(cache.stats().prefetch.running,false);await cache.prefetch([a,b]);assert.equal(callsA,1);assert.equal(cache.stats().prefetch.done,2);
});

test('current map coverage intersects stored content addresses and survives a new cache owner',async()=>{
 const storage=new MemoryCaches(),a=await resource('current-a'),b=await resource('current-b'),old=await resource('old-map'),content=new Map([[a.url,'current-a'],[b.url,'current-b'],[old.url,'old-map']]);let requests=0;
 const env={origin,caches:storage.asStorage(),fetch:async(input:RequestInfo|URL)=>{requests++;return new Response(content.get(String(input)));}};
 const first=new MapByteCache(env);await first.read(a);await first.read(old);const refreshed=new MapByteCache(env);assert.equal(refreshed.stats().ready,false);
 await refreshed.refresh([a,b,a]);assert.deepEqual(refreshed.stats().current,{bytes:a.bytes,files:1,totalBytes:a.bytes+b.bytes,totalFiles:2,remainingBytes:b.bytes,oldBytes:old.bytes,oldFiles:1,complete:false});assert.equal(requests,2);assert.equal(refreshed.stats().ready,true);
 await refreshed.read(b);assert.equal(refreshed.stats().current?.complete,true);assert.equal(refreshed.stats().current?.remainingBytes,0);assert.equal(refreshed.stats().current?.oldBytes,old.bytes);
 const reload=new MapByteCache(env);await reload.refresh([a,b]);assert.equal(reload.stats().current?.complete,true);assert.equal(requests,3);
});

test('checking completeness removes a corrupt stored body instead of claiming the map is ready',async()=>{
 const storage=new MemoryCaches(),r=await resource('correct-map'),stored=await storage.open(MAP_CACHE_NAME);await stored.put(new URL(r.url,origin),new Response('broken-map!',{headers:{'X-Map-Bytes':String(r.bytes)}}));
 const cache=new MapByteCache({origin,caches:storage.asStorage(),fetch:async()=>new Response('correct-map')});await cache.refresh([r]);assert.equal(cache.stats().current?.bytes,0);assert.equal(cache.stats().current?.complete,false);assert.equal(await stored.match(new URL(r.url,origin)),undefined);
 await cache.read(r);assert.equal(cache.stats().current?.complete,true);await stored.put(new URL(r.url,origin),new Response('broken-map!',{headers:{'X-Map-Bytes':String(r.bytes)}}));await cache.refresh([r]);assert.equal(cache.stats().current?.complete,false);
});

test('map download distinguishes initial checking, index retry, cache denial and a complete map',async()=>{
 const r=await resource('map'),cache=new MapByteCache({origin,fetch:async()=>new Response('map')});await cache.refresh([r]);
 assert.equal(mapDownloadState(cache.stats(),{loading:true,error:''}).title,'正在读取本机地图');assert.equal(mapDownloadState(cache.stats(),{loading:false,error:'index failed'}).action,'重新检查');assert.equal(mapDownloadState(cache.stats(),{loading:false,error:''}).title,'本机暂时无法缓存地图');assert.equal(cache.stats().current?.totalBytes,r.bytes);
 const storage=new MemoryCaches(),ready=new MapByteCache({origin,caches:storage.asStorage(),fetch:async()=>new Response('map')});await ready.prefetch([r]);assert.equal(mapDownloadState(ready.stats(),{loading:false,error:''}).action,'已全部缓存');
});

test('online battle pauses an intentional full download and only the menu resumes it',async()=>{
 const storage=new MemoryCaches(),a=await resource('first'),b=await resource('second');let held=true,started=false,aborted=0,callsA=0;
 const cache=new MapByteCache({origin,caches:storage.asStorage(),fetch:async(input,init)=>{if(String(input)===a.url){callsA++;return new Response('first');}started=true;if(!held)return new Response('second');return new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>{aborted++;reject(new DOMException('Aborted','AbortError'));},{once:true});});}});
 const download=cache.prefetch([a,b]);while(!started||cache.stats().prefetch.done<1)await tick();cache.setDownloadContext({onlineBattle:true,menu:false});await download;assert.equal(aborted,1);assert.equal(cache.stats().prefetch.pausedBy,'battle');assert.equal(cache.stats().prefetch.requested,true);assert.equal(cache.stats().current?.files,1);
 held=false;cache.setDownloadContext({onlineBattle:false,menu:false});await tick();assert.equal(cache.stats().prefetch.running,false);cache.setDownloadContext({onlineBattle:false,menu:true});while(cache.stats().prefetch.running)await tick();assert.equal(cache.stats().current?.complete,true);assert.equal(callsA,1);assert.equal(cache.stats().prefetch.requested,false);
});

test('a user pause or clear removes automatic resume intent, including late source preparation',async()=>{
 const storage=new MemoryCaches(),r=await resource('map');let supply:((resources:MapResource[])=>void)|undefined,requests=0;
 const cache=new MapByteCache({origin,caches:storage.asStorage(),fetch:async()=>{requests++;return new Response('map');}});
 const pending=cache.prefetch(()=>new Promise(resolve=>{supply=resolve;}));while(!supply)await tick();cache.cancelPrefetch();cache.setDownloadContext({onlineBattle:true,menu:false});cache.setDownloadContext({onlineBattle:false,menu:true});supply([r]);await pending;assert.equal(requests,0);assert.equal(cache.stats().prefetch.requested,false);assert.equal(cache.stats().prefetch.pausedBy,'user');
 const late=cache.prefetch(()=>new Promise(resolve=>{supply=resolve;}));await cache.clear();supply!([r]);await late;cache.setDownloadContext({onlineBattle:false,menu:true});await tick();assert.equal(requests,0);assert.equal(cache.stats().bytes,0);assert.equal(cache.stats().prefetch.total,0);
});

test('retrying a temporary storage failure restores map download availability',async()=>{
 const storage=new MemoryCaches(),r=await resource('map');let denied=true;
 const cache=new MapByteCache({origin,caches:{open:async(name:string)=>{if(denied)throw Error('temporarily unavailable');return storage.open(name);},delete:(name:string)=>storage.delete(name)} as unknown as CacheStorage,fetch:async()=>new Response('map')});
 await cache.refresh([r]);assert.equal(cache.stats().available,false);assert.equal(mapDownloadState(cache.stats(),{loading:false,error:''}).action,'重新检查');denied=false;await cache.refresh([r]);assert.equal(cache.stats().available,true);await cache.prefetch([r]);assert.equal(cache.stats().current?.complete,true);
});

test('a cache hit finishing after clear cannot restore old LRU metadata or cached status',async()=>{
 const r=await resource('map');let finish:((value:ArrayBuffer)=>void)|undefined,writes=0;
 const response=new Response('map');response.arrayBuffer=()=>new Promise(resolve=>{finish=resolve;});
 const cache=new MapByteCache({origin,caches:{open:async()=>({match:async()=>response}) as unknown as Cache,delete:async()=>true} as unknown as CacheStorage,metadata:{getItem:()=>null,setItem:()=>{writes++;}},fetch:async()=>{throw Error('unexpected network');}});
 const reading=cache.read(r);while(!finish)await tick();await cache.clear();finish(bytes('map'));assert.deepEqual(await reading,bytes('map'));assert.equal(writes,1);assert.equal(cache.stats().hits,0);assert.equal(cache.stats().bytes,0);
});


test('shared streaming progress reaches late subscribers and stops after their cancellation',async()=>{
 const queue=new MapDownloadQueue(),a=new AbortController(),b=new AbortController(),seenA:number[]=[],seenB:number[]=[];let report:((p:number|undefined,bytes?:number)=>void)|undefined,finish:((v:string)=>void)|undefined,calls=0;
 const first=queue.request('shared',async(_s,progress)=>{calls++;report=progress;return new Promise<string>(r=>finish=r);},1,a.signal,(_p,n)=>seenA.push(n??0));
 report!(40,4);const second=queue.request('shared',async()=>{throw Error('must share');},1,b.signal,(_p,n)=>seenB.push(n??0));const cancelled=assert.rejects(second,{name:'AbortError'});assert.deepEqual(seenB,[4]);b.abort();await cancelled;report!(80,8);finish!('ok');assert.equal(await first,'ok');assert.equal(calls,1);assert.deepEqual(seenA,[0,4,8]);assert.deepEqual(seenB,[4]);
});
test('prefetch reports partial received bytes before a file is validated and clear discards late progress',async()=>{
 const storage=new MemoryCaches(),r=await resource('abcdef');let source:ReadableStreamDefaultController<Uint8Array>|undefined;
 const cache=new MapByteCache({origin,caches:storage.asStorage(),fetch:async()=>new Response(new ReadableStream<Uint8Array>({start(c){source=c;}}),{headers:{'Content-Length':'6'}})});
 const pending=cache.prefetch([r]);while(!source)await tick();source.enqueue(new TextEncoder().encode('abc'));while(!(cache.stats().prefetch.receiving))await tick();assert.equal(cache.stats().prefetch.receiving,3);assert.equal(cache.stats().current?.complete,false);await cache.clear();source.enqueue(new TextEncoder().encode('def'));source.close();await pending;assert.equal(cache.stats().bytes,0);assert.equal(cache.stats().prefetch.receiving??0,0);assert.equal(cache.stats().current?.complete,false);
});
