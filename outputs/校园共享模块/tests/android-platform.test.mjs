import test from 'node:test';import assert from 'node:assert/strict';import {gzipSync} from 'node:zlib';
import {RankingClient} from '../src/community/client.ts';
import {MapByteCache,mapDigest,MAP_CACHE_LIMIT} from '../src/map-client/index.ts';
const origin='https://game.tianhw.top';
const response=value=>({ok:true,status:200,json:async()=>value});
const auth=id=>({token:'token-'+id,player:{id,nickname:id},account:{username:id}});

test('protected session store owns token reads/writes without plaintext web storage',async()=>{
 const saved=[];let secret='previous-token';globalThis.localStorage={getItem(){throw Error('plaintext read');},setItem(){throw Error('plaintext write');},removeItem(){throw Error('plaintext remove');}};
 const client=new RankingClient('/api',async(url,options)=>url.endsWith('/accounts/me')?(assert.equal(options.headers.Authorization,'Bearer previous-token'),response({player:{id:'previous'},account:{username:'previous'}})):response(auth('next')),{read:()=>secret,write:value=>{secret=value;saved.push(value);}});
 assert.equal((await client.me()).id,'previous');await client.login('next','123456');await client.logout();assert.deepEqual(saved,['token-next','']);
});
test('late native sign-in cannot restore an account after logout',async()=>{
 let resolve;const pending=new Promise(done=>resolve=done),stored=[],revoked=[];
 const client=new RankingClient('/api',async(url,options)=>{if(url.endsWith('/accounts/login'))return pending;revoked.push(options.headers.Authorization);return response({ok:true});},{read:()=>'',write:value=>stored.push(value)});
 const login=client.login('next','123456'),rejected=assert.rejects(login,{code:'CANCELLED'});await client.logout();resolve(response(auth('next')));await rejected;assert.deepEqual(stored,['']);assert.deepEqual(revoked,['Bearer token-next']);
});
test('bundled bytes retain hash verification without CacheStorage or LRU writes',async()=>{
 const bytes=new TextEncoder().encode('signed local resource').buffer,sha256=await mapDigest(bytes),resource={url:'/assets/map/'+sha256+'.bin',sha256,bytes:bytes.byteLength,mime:'application/octet-stream'};let reads=0;
 const cache=new MapByteCache({origin,bundledResources:new Map([[new URL(resource.url,origin).href,resource]]),caches:{open(){throw Error('duplicate cache');}},metadata:{getItem:()=>null,setItem(){throw Error('LRU write');}},fetch:async()=>{reads++;return new Response(bytes);}});
 await cache.refresh([resource]);assert.equal(cache.stats().current.complete,true);assert.equal(cache.stats().bytes,0);assert.deepEqual(await cache.read(resource,{waitForPersistence:true}),bytes);assert.equal(reads,1);assert.equal(cache.diagnostics().networkBytes,0);assert.equal(cache.diagnostics().bundledBytes,bytes.byteLength);
});
test('corrupt bundled gzip fails once without fetching raw or remote fallback',async()=>{
 const raw=new TextEncoder().encode('expected'),packed=gzipSync(raw),sha256=await mapDigest(packed),decoded=await mapDigest(raw),resource={url:'/assets/map/'+sha256+'.gz',sha256,bytes:packed.length,mime:'application/gzip',encoding:{format:'gzip',decodedBytes:raw.length,decodedSha256:decoded,decodedUrl:'/assets/map/'+decoded+'.bin'}};let reads=0;
 const cache=new MapByteCache({origin,bundledResources:new Map([[new URL(resource.url,origin).href,resource]]),fetch:async()=>{reads++;return new Response('corrupt');}});
 await assert.rejects(cache.read(resource),/重新安装/);assert.equal(reads,1);assert.equal(cache.diagnostics().fallbacks,0);
});
test('complete bundled map does not consume the browser disk budget or download twice',async()=>{
 const resource={url:'/assets/map/'+'a'.repeat(64)+'.bin',sha256:'a'.repeat(64),bytes:MAP_CACHE_LIMIT+1,mime:'application/octet-stream'};
 const cache=new MapByteCache({origin,bundledResources:new Map([[new URL(resource.url,origin).href,resource]]),fetch:async()=>{throw Error('already installed');}});
 await cache.prefetch([resource]);assert.equal(cache.stats().current.complete,true);assert.equal(cache.stats().prefetch.done,1);assert.equal(cache.stats().bytes,0);assert.equal(cache.stats().budget,MAP_CACHE_LIMIT);assert.equal(cache.stats().bundled.bytes,resource.bytes);
});
