import test from 'node:test';
import assert from 'node:assert/strict';
import {withValidatedMapTextures,MapDownloadQueue} from '../dist/map-client/index.js';
const bytes=text=>new TextEncoder().encode(text).buffer;
const image='/assets/map/'+'a'.repeat(64)+'.webp',other='/assets/map/'+'b'.repeat(64)+'.webp';
function glb(images=[],buffers=[{byteLength:0}]){
 const json=new TextEncoder().encode(JSON.stringify({asset:{version:'2.0'},images:images.map(uri=>({uri})),buffers})),length=Math.ceil(json.length/4)*4,out=new Uint8Array(20+length),view=new DataView(out.buffer);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,out.length,true);view.setUint32(12,length,true);view.setUint32(16,0x4e4f534a,true);out.fill(32,20);out.set(json,20);return out.buffer;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('external images remain available during parse and every object URL is released afterwards',async()=>{
 let local,readCount=0;const session={read:async()=>{readCount++;return bytes('verified-image');}};
 assert.equal(await withValidatedMapTextures(glb([image,image]),session,undefined,async resolve=>{local=resolve('https://game.test'+image);assert.match(local,/^blob:/);assert.equal(await(await fetch(local)).text(),'verified-image');return 'parsed';}), 'parsed');
 assert.equal(readCount,1);await assert.rejects(fetch(local));
});
test('unlisted image and external geometry fail before parsing; internal/data fallback buffers remain valid',async()=>{
 let calls=0;const session={read:async()=>{calls++;return bytes('');}},parse=async()=>{calls++;return true;};
 await assert.rejects(withValidatedMapTextures(glb(['/api/private']),session,undefined,parse),/贴图/);
 await assert.rejects(withValidatedMapTextures(glb([],[{byteLength:12,uri:'https://other.test/geometry.bin'}]),session,undefined,parse),/几何缓冲/);assert.equal(calls,0);
 assert.equal(await withValidatedMapTextures(glb([],[{byteLength:0},{byteLength:0,extensions:{EXT_meshopt_compression:{fallback:true}}}]),session,undefined,parse),true);
 assert.equal(await withValidatedMapTextures(glb([],[{byteLength:0,uri:'data:application/octet-stream;base64,'}]),session,undefined,parse),true);
});
test('a failed dependency cancels this parse consumer while a shared consumer retains its transport',async()=>{
 const queue=new MapDownloadQueue(),waiting=new Map(),run=uri=>(signal)=>new Promise((resolve,reject)=>{waiting.set(uri,{signal,resolve,reject});signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
 const shared=queue.request(image,run(image),1),signals=[],session={read:(uri,{signal,priority})=>{signals.push(signal);return queue.request(uri,run(uri),priority,signal);}};
 let parsed=false;const request=withValidatedMapTextures(glb([image,other]),session,undefined,async()=>{parsed=true;});waiting.get(other).reject(Error('corrupt image'));await assert.rejects(request,/corrupt/);
 assert.ok(signals.every(s=>s.aborted));assert.equal(waiting.get(image).signal.aborted,false);waiting.get(image).resolve(bytes('shared-image'));assert.deepEqual(await shared,bytes('shared-image'));assert.equal(parsed,false);
});
test('explicit cancel aborts the last transport and a late response cannot start parsing',async()=>{
 let finish,transport,parsed=false;const controller=new AbortController(),session={read:(_uri,{signal})=>{transport=signal;return new Promise(resolve=>{finish=resolve;});}};
 const request=withValidatedMapTextures(glb([image]),session,controller.signal,async()=>{parsed=true;});controller.abort();assert.equal(transport.aborted,true);finish(bytes('late'));await assert.rejects(request,e=>e.name==='AbortError');assert.equal(parsed,false);
});
test('parse rejection releases already-created image URLs and aborts dependency ownership',async()=>{
 let local,owner;const session={read:async(_uri,{signal})=>{owner=signal;return bytes('image');}};
 await assert.rejects(withValidatedMapTextures(glb([image]),session,undefined,async resolve=>{local=resolve(image);throw Error('decode failed');}),/decode failed/);assert.equal(owner.aborted,true);await tick();await assert.rejects(fetch(local));
});
