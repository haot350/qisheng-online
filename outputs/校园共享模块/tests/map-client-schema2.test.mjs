import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {MapByteCache,MapAssetSession,mapDigest,decodeMapResource,decodedMapResourceBinding} from '../src/map-client/index.ts';
const origin='https://map.test',data=value=>new TextEncoder().encode(value).buffer;
async function encoded(text){const raw=data(text),packed=new Uint8Array(gzipSync(new Uint8Array(raw))),sha256=await mapDigest(packed.buffer),hash=await mapDigest(raw);return{raw,packed,resource:{url:'/assets/map/'+sha256+'.gz',sha256,bytes:packed.length,mime:'application/gzip',encoding:{format:'gzip',decodedBytes:raw.byteLength,decodedSha256:hash,decodedUrl:'/assets/map/'+hash+'.bin'}}};}
class Storage{rows=new Map();async open(){return{keys:async()=>[...this.rows.keys()].map(url=>new Request(url)),match:async input=>this.rows.get(new URL(typeof input==='string'?input:input.url,origin).href)?.clone(),put:async(input,response)=>this.rows.set(new URL(input,origin).href,response.clone()),delete:async input=>this.rows.delete(new URL(typeof input==='string'?input:input.url,origin).href)};}async delete(){this.rows.clear();return true;}}
test('schema2 verifies both hashes, shares inflation, and keeps only compressed persistence',async()=>{
 const fixture=await encoded('campus'.repeat(1000)),storage=new Storage();let requests=0;const cache=new MapByteCache({origin,caches:storage,fetch:async()=>{requests++;return new Response(fixture.packed);}});
 const stages=[];assert.deepEqual(await cache.read(fixture.resource,{waitForPersistence:true,onStage:value=>stages.push(value.stage)}),fixture.raw);
 assert.deepEqual(await cache.read(fixture.resource),fixture.raw);assert.equal(requests,1);assert.equal(cache.diagnostics().gzipDecodes,1);assert.equal(cache.diagnostics().decodedHits,1);assert.equal(storage.rows.size,1);assert.equal((await storage.rows.values().next().value.arrayBuffer()).byteLength,fixture.packed.length);assert.deepEqual([...new Set(stages)],['download','decode','ready']);
});
test('bad decoded content falls back to the original hashed file, never corrupts authority bytes',async()=>{
 const fixture=await encoded('expected'),other=await encoded('bad-data'),resource={...fixture.resource,url:other.resource.url,sha256:other.resource.sha256,bytes:other.resource.bytes},calls=[];
 const cache=new MapByteCache({origin,fetch:async url=>{calls.push(url);return new Response(url===resource.url?other.packed:fixture.raw);}});
 assert.deepEqual(await cache.read(resource),fixture.raw);assert.deepEqual(calls,[resource.url,fixture.resource.encoding.decodedUrl]);assert.equal(cache.diagnostics().fallbacks,1);
});
test('gzip output is bounded and abort remains abort instead of downloading a fallback',async()=>{
 const fixture=await encoded('x'.repeat(10000));await assert.rejects(decodeMapResource({...fixture.resource,encoding:{...fixture.resource.encoding,decodedBytes:1}},fixture.packed.buffer),/超出/);
 const abort=new AbortController();let calls=0;const cache=new MapByteCache({origin,fetch:async()=>{calls++;abort.abort();return new Response(fixture.packed);}});
 await assert.rejects(cache.read(fixture.resource,{signal:abort.signal}),{name:'AbortError'});assert.equal(calls,1);assert.equal(cache.diagnostics().fallbacks,0);
});
test('complete download saves and verifies exactly one gzip representation',async()=>{
 const fixture=await encoded('whole map'),storage=new Storage(),calls=[];const cache=new MapByteCache({origin,caches:storage,fetch:async url=>{calls.push(url);return new Response(fixture.packed);}});
 await cache.prefetch([fixture.resource]);assert.equal(cache.stats().current.complete,true);assert.equal(cache.stats().current.totalBytes,fixture.packed.length);assert.equal(storage.rows.size,1);assert.deepEqual(calls,[fixture.resource.url]);
});
test('legacy schema1 and schema2 sessions return decoded resource bytes',async()=>{
 const fixture=await encoded('geometry'),manifest=data('{"collisionUrl":"/map/collision.bin"}'),manifestHash=await mapDigest(manifest);
 for(const schema of [1,2]){const resource=schema===2?fixture.resource:decodedMapResourceBinding(fixture.resource),index={schema,manifest:{url:'/map/manifest.json',sha256:manifestHash},resources:{'/map/collision.bin':resource}},cache=new MapByteCache({origin,fetch:async url=>new Response(url==='/map/resource-index.json'?JSON.stringify(index):url==='/map/manifest.json'?manifest:schema===2?fixture.packed:fixture.raw)}),session=new MapAssetSession('/map/resource-index.json',cache);assert.deepEqual(await session.read('/map/collision.bin'),fixture.raw);}
});
test('LRU writes batch foreground hits instead of synchronous writes per file',async()=>{
 const fixture=await encoded('touch'),storage=new Storage();let writes=0;const cache=new MapByteCache({origin,caches:storage,metadata:{getItem:()=>null,setItem:()=>writes++},fetch:async()=>new Response(fixture.packed)});
 await cache.read(fixture.resource,{waitForPersistence:true});for(let i=0;i<8;i++)await cache.read(fixture.resource);assert.equal(writes,0);await new Promise(resolve=>setTimeout(resolve,270));assert.equal(writes,1);
});

test('invalid decoded hash cannot make complete download pass, including an inherited cache entry',async()=>{
 const fixture=await encoded('expected'),other=await encoded('bad-data'),resource={...fixture.resource,url:other.resource.url,sha256:other.resource.sha256,bytes:other.resource.bytes},storage=new Storage();await(await storage.open()).put(new URL(resource.url,origin).href,new Response(other.packed,{headers:{'X-Map-Bytes':String(other.packed.length)}}));
 const cache=new MapByteCache({origin,caches:storage,fetch:async()=>new Response(other.packed)});await cache.prefetch([resource]);assert.equal(cache.stats().current.complete,false);assert.equal(cache.stats().prefetch.done,0);assert.ok(cache.stats().prefetch.error);
});
test('an unsupported gzip runtime downloads only the original representation',async()=>{
 const fixture=await encoded('raw only'),storage=new Storage(),calls=[],original=globalThis.DecompressionStream;
 try{globalThis.DecompressionStream=undefined;const cache=new MapByteCache({origin,caches:storage,fetch:async url=>{calls.push(url);return new Response(fixture.raw);}});await cache.prefetch([fixture.resource]);assert.equal(cache.stats().current.complete,true);assert.deepEqual(calls,[fixture.resource.encoding.decodedUrl]);assert.equal(cache.stats().current.bytes,fixture.raw.byteLength);assert.equal(storage.rows.size,1);}finally{globalThis.DecompressionStream=original;}
});
