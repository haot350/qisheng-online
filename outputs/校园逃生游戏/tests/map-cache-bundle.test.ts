import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildMapCacheIndex} from '../scripts/build-map-cache-index.mjs';
import {mapDigest} from '../src/map-cache.ts';
import {loadGameMapBundle} from '../src/game-map.ts';

test('sidecar generation preserves accepted manifest/physics bytes and binds all content addresses',async()=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'qisheng-map-index-'));assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep));
 try{
  await mkdir(path.join(temporary,'map'));const manifest=Buffer.from('{\n "sourceVersion":"v16", "chunks":[{"url":"/map/piece.glb"}], "collisionUrl":"/map/collision.bin","navmeshUrl":"/map/navigation.bin"\n}');
  const originals=new Map([['/map/manifest.json',manifest],['/map/piece.glb',Buffer.from('exact-model')],['/map/collision.bin',Buffer.from('exact-collision')],['/map/navigation.bin',Buffer.from('exact-nav')]]);
  for(const [url,data] of originals)await writeFile(path.join(temporary,url),data);
  await buildMapCacheIndex(temporary,'/map/manifest.json','/map/resource-index.json');const index=JSON.parse(await readFile(path.join(temporary,'map/resource-index.json'),'utf8'));
  assert.equal(index.manifest.sha256,createHash('sha256').update(manifest).digest('hex'));assert.equal(Object.keys(index.resources).length,3);
  for(const [url,data] of originals){assert.deepEqual(await readFile(path.join(temporary,url)),data);if(url===index.manifest.url)continue;const item=index.resources[url];assert.equal(item.sha256,createHash('sha256').update(data).digest('hex'));assert.deepEqual(await readFile(path.join(temporary,item.url)),data);assert.equal(item.bytes,data.length);}
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('admission and simulation share one validated map bundle and preserve original identity hashes',async()=>{
 const original=globalThis.fetch,data=(s:string)=>new TextEncoder().encode(s).buffer;
 const manifest=data('{"sourceVersion":"v16","source":"original","collisionUrl":"/map/collision.bin","navmeshUrl":"/map/navigation.bin","chunks":[]}'),collision=data('collision'),navigation=data('navigation');
 const hash=await mapDigest(manifest),ch=await mapDigest(collision),nh=await mapDigest(navigation),collisionUrl='/assets/map/'+ch+'.bin',navUrl='/assets/map/'+nh+'.bin',calls=new Map<string,number>();
 globalThis.fetch=async input=>{const url=String(input);calls.set(url,(calls.get(url)||0)+1);if(url==='/map/resource-index.json')return Response.json({schema:1,manifest:{url:'/map/manifest.json',sha256:hash},resources:{'/map/collision.bin':{url:collisionUrl,sha256:ch,bytes:collision.byteLength,mime:'application/octet-stream'},'/map/navigation.bin':{url:navUrl,sha256:nh,bytes:navigation.byteLength,mime:'application/octet-stream'}}});if(url==='/map/manifest.json')return new Response(manifest);if(url===collisionUrl)return new Response(collision);if(url===navUrl)return new Response(navigation);throw Error('Unexpected resource '+url);};
 try{const [admission,sim]=await Promise.all([loadGameMapBundle(),loadGameMapBundle()]);assert.equal(admission,sim);assert.equal(await loadGameMapBundle(),admission);assert.deepEqual(admission.identity,{sourceVersion:'v16',manifestHash:hash,collisionHash:ch,navigationHash:nh});assert.deepEqual(admission.manifestBytes,manifest);assert.equal(calls.get(collisionUrl),1);assert.equal(calls.get(navUrl),1);assert.equal(calls.get('/map/manifest.json'),1);}finally{globalThis.fetch=original;}
});
