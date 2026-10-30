import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MapByteCache,MapDownloadQueue,MAP_CACHE_NAME,mapDigest} from '../src/map-client/index.ts';

const origin='https://game.test';
const data=text=>new TextEncoder().encode(text).buffer;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate){for(let i=0;i<300&&!predicate();i++)await tick();assert.ok(predicate(),'expected operation did not start');}
async function resource(text){const bytes=data(text),sha256=await mapDigest(bytes);return{url:'/assets/map/'+sha256+'.bin',sha256,bytes:bytes.byteLength,mime:'application/octet-stream'};}
class MemoryCaches{
 entries=new Map();putGate;puts=0;deletes=0;
 async open(){return{
  keys:async()=>[...this.entries.keys()].map(url=>new Request(url)),
  match:async input=>this.entries.get(new URL(typeof input==='string'?input:input.url,origin).href)?.clone(),
  put:async(input,response)=>{this.puts++;if(this.putGate)await this.putGate;this.entries.set(new URL(typeof input==='string'?input:input.url,origin).href,response.clone());},
  delete:async input=>{this.deletes++;return this.entries.delete(new URL(typeof input==='string'?input:input.url,origin).href);}
 };}
 async delete(){this.entries.clear();return true;}
}

test('slow persistence cannot hold foreground delivery or the two transfer slots',{timeout:3000},async()=>{
 const storage=new MemoryCaches(),gate=deferred();storage.putGate=gate.promise;
 const a=await resource('a'),b=await resource('b'),c=await resource('c');let requests=0;
 const cache=new MapByteCache({origin,caches:storage,fetch:async input=>{requests++;return new Response(input===a.url?'a':input===b.url?'b':'c');}});
 assert.deepEqual(await cache.read(a),data('a'));await until(()=>storage.puts===1);
 assert.deepEqual(await cache.read(b),data('b'));assert.deepEqual(await cache.read(c),data('c'));
 assert.equal(requests,3);assert.equal(cache.queue.active,0);assert.equal(storage.entries.size,0);
 gate.resolve();await cache.refresh([a,b,c]);assert.equal(cache.stats().current.complete,true);
});

test('online cache deadline bounds open, match and body together; late cached data has no side effects',{timeout:3000},async()=>{
 const r=await resource('network'),match=deferred(),storage=new MemoryCaches();let requests=0;
 const normal=await storage.open();
 const caches={open:async()=>({...normal,match:()=>match.promise}),delete:()=>storage.delete()};
 const cache=new MapByteCache({origin,caches,online:()=>true,cacheReadTimeoutMs:15,fetch:async()=>{requests++;return new Response('network');}});
 assert.deepEqual(await cache.read(r),data('network'));assert.equal(requests,1);
 match.resolve(new Response('stale'));await tick();await tick();
 assert.equal(cache.stats().hits,0);assert.equal(storage.deletes,0);assert.equal(cache.queue.active,0);
});

test('offline lookup keeps its opportunity to return valid bytes beyond the online deadline',{timeout:3000},async()=>{
 const r=await resource('offline'),body=deferred();let requests=0;
 const response=new Response('offline');response.arrayBuffer=()=>body.promise;
 const cache=new MapByteCache({origin,caches:{open:async()=>({match:async()=>response})},online:()=>false,cacheReadTimeoutMs:5,fetch:async()=>{requests++;throw Error('offline');}});
 let settled=false;const reading=cache.read(r).then(value=>{settled=true;return value;});
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(settled,false);body.resolve(data('offline'));
 assert.deepEqual(await reading,data('offline'));assert.equal(requests,0);assert.equal(cache.stats().hits,1);
});

test('full download counts a file only after persistence, not after network delivery',{timeout:3000},async()=>{
 const r=await resource('map'),storage=new MemoryCaches(),gate=deferred();storage.putGate=gate.promise;
 const cache=new MapByteCache({origin,caches:storage,fetch:async()=>new Response('map')});
 const download=cache.prefetch([r]);await until(()=>storage.puts===1);
 assert.equal(cache.stats().prefetch.done,0);assert.equal(cache.stats().current.complete,false);assert.equal(cache.queue.active,0);
 gate.resolve();await download;assert.equal(cache.stats().prefetch.done,1);assert.equal(cache.stats().current.complete,true);
});

test('a failed durable write does not announce a complete download',{timeout:3000},async()=>{
 const r=await resource('map'),storage=new MemoryCaches(),normal=await storage.open();
 const cache=new MapByteCache({origin,caches:{open:async()=>({...normal,put:async()=>{throw Error('quota');}})},fetch:async()=>new Response('map')});
 await cache.prefetch([r]);assert.equal(cache.stats().prefetch.done,0);assert.equal(cache.stats().current.complete,false);assert.ok(cache.stats().prefetch.error);
});

test('cancelled uncooperative transfers release both slots immediately; late results cannot settle a retry',{timeout:3000},async()=>{
 const queue=new MapDownloadQueue(),a=new AbortController(),b=new AbortController(),oldA=deferred(),oldB=deferred(),retry=deferred();
 const first=queue.request('same',()=>oldA.promise,1,a.signal),second=queue.request('other',()=>oldB.promise,1,b.signal);
 const cancelledA=assert.rejects(first,{name:'AbortError'}),cancelledB=assert.rejects(second,{name:'AbortError'});
 a.abort();b.abort();await Promise.all([cancelledA,cancelledB]);assert.equal(queue.active,0);
 let received=false;const next=queue.request('same',()=>retry.promise).then(value=>{received=true;return value;});
 oldA.resolve('old');oldB.reject(Error('late'));await tick();assert.equal(received,false);assert.equal(queue.active,1);
 retry.resolve('new');assert.equal(await next,'new');assert.equal(queue.active,0);
});

test('priority preemption does not wait for an aborted background promise to settle',{timeout:3000},async()=>{
 const queue=new MapDownloadQueue(),cancel=new AbortController(),old=deferred();let starts=0;
 const background=queue.request('background',signal=>{starts++;return starts===1?old.promise:Promise.resolve('background');},10,cancel.signal);
 const held=deferred(),second=queue.request('held',()=>held.promise,10);
 assert.equal(await queue.request('play',async()=> 'ready',0),'ready');assert.ok(queue.active<=2);assert.equal(starts,2);
 old.resolve('stale');held.resolve('held');assert.equal(await second,'held');assert.equal(await background,'background');assert.ok(starts>=2);assert.equal(queue.active,0);
});

test('an immediate same-key request from a completion callback starts a fresh operation',{timeout:3000},async()=>{
 const queue=new MapDownloadQueue();let calls=0;
 const result=await queue.request('same',async()=>++calls).then(()=>queue.request('same',async()=>++calls));
 assert.equal(result,2);assert.equal(queue.active,0);
});

test('one large physical map file can persist above the small pending-write backlog',{timeout:3000},async()=>{
 const text='x'.repeat(9*1024*1024),r=await resource(text),storage=new MemoryCaches();
 const cache=new MapByteCache({origin,caches:storage,fetch:async()=>new Response(text)});
 assert.equal((await cache.read(r,{waitForPersistence:true})).byteLength,r.bytes);assert.equal(storage.entries.size,1);
});

test('a stalled cache is bypassed for following files instead of paying its deadline per chunk',{timeout:3000},async()=>{
 const a=await resource('a'),b=await resource('b'),open=deferred();let opens=0,requests=0;
 const cache=new MapByteCache({origin,caches:{open:()=>{opens++;return open.promise;}},online:()=>true,cacheReadTimeoutMs:10,fetch:async input=>{requests++;return new Response(input===a.url?'a':'b');}});
 await cache.read(a);const afterFirst=opens;await cache.read(b);
 assert.equal(opens,afterFirst);assert.equal(requests,2);assert.equal(cache.queue.active,0);
});
