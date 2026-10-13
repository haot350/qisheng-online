import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PHOTO_SETTINGS,type PhotoMetadata,type PhotoRecord} from '../src/photography/types.ts';
import {listPhotoMetadata,photoMetadata,photoSummary,readPhoto} from '../src/photography/album.ts';
import {AlbumThumbnailCache,thumbnailBlob,thumbnailSize} from '../src/photography/thumbnail.ts';

function photo(id:string):PhotoRecord{return{id,createdAt:`2026-10-05T00:00:${id.padStart(2,'0')}.000Z`,kind:'virtual-photo',blob:new Blob([`original-${id}`],{type:'image/jpeg'}),width:2400,height:1600,settings:{...DEFAULT_PHOTO_SETTINGS},exposure:{aperture:8,shutter:1/125,iso:100,gain:1,meterEV:0,limited:false},position:[1,2,3],quaternion:[0,0,0,1],software:'齐盛数字校园',camera:'虚拟 EOS 5D Mark II',lens:'虚拟 EF24–105mm f/4L IS USM'};}

test('metadata cursors omit every mother blob and selection reads only its original without changing database version',async()=>{
 const records=Array.from({length:50},(_,index)=>photo(String(index))),opened:unknown[]=[],reads:string[]=[];let allReads=0;
 const previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
 const factory={open:(name:string,version:number)=>{opened.push([name,version]);const request:any={};queueMicrotask(()=>{request.result={close(){},transaction(){return{objectStore(){return{getAll(){allReads++;throw Error('The grid must not request all blobs');},get(id:string){reads.push(id);const read:any={};queueMicrotask(()=>{read.result=records.find(record=>record.id===id);read.onsuccess?.();});return read;},openCursor(){const cursorRequest:any={};let index=0;const next=()=>queueMicrotask(()=>{cursorRequest.result=index<records.length?{value:records[index],continue(){index++;next();}}:null;cursorRequest.onsuccess?.();});next();return cursorRequest;}};}};}};request.onsuccess?.();});return request;}};
 Object.defineProperty(globalThis,'indexedDB',{value:factory,configurable:true});
 try{const rows=await listPhotoMetadata();assert.equal(rows.length,50);assert.equal(rows[0].id,'49');assert.ok(rows.every(row=>!('blob'in row)));assert.equal(reads.length,0);assert.equal(allReads,0);const selected=await readPhoto('24');assert.equal(selected?.blob,records[24].blob);assert.equal(await selected?.blob.text(),'original-24');assert.deepEqual(reads,['24']);assert.ok(opened.every(value=>JSON.stringify(value)==='["qisheng-photography-v2",1]'));assert.ok(!('blob'in photoMetadata(selected!)));assert.ok(!('thumbnail'in photoMetadata(selected!)));assert.equal(await readPhoto('missing'),null);}finally{if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else Reflect.deleteProperty(globalThis,'indexedDB');}
});

test('320px thumbnail generation uses a disposable resized bitmap and leaves the original bytes intact',async()=>{
 assert.deepEqual(thumbnailSize(2400,1600),[320,213]);assert.deepEqual(thumbnailSize(1600,2400),[213,320]);assert.deepEqual(thumbnailSize(100,60),[100,60]);
 const original=new Blob(['mother-photo'],{type:'image/png'}),oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldBitmap=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap');let closed=0,options:unknown,drawSize:unknown;
 const canvas={width:0,height:0,getContext:()=>({drawImage:(_image:unknown,_x:number,_y:number,w:number,h:number)=>{drawSize=[w,h];}}),toBlob:(callback:(blob:Blob)=>void,type:string)=>callback(new Blob(['small-preview'],{type}))};
 Object.defineProperty(globalThis,'document',{value:{createElement:()=>canvas},configurable:true});Object.defineProperty(globalThis,'createImageBitmap',{value:async(blob:Blob,resize:unknown)=>{assert.equal(blob,original);options=resize;return{close:()=>closed++};},configurable:true});
 try{const small=await thumbnailBlob(original,2400,1600);assert.deepEqual(options,{resizeWidth:320,resizeHeight:213,resizeQuality:'medium'});assert.deepEqual(drawSize,[320,213]);assert.equal(small.type,'image/jpeg');assert.equal(closed,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(await original.text(),'mother-photo');}finally{for(const[key,descriptor]of[['document',oldDocument],['createImageBitmap',oldBitmap]]as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});

test('one open album keeps at most 24 thumbnail URLs, uses LRU, and serializes decode work',async()=>{
 const live=new Set<string>(),records=Array.from({length:50},(_,index)=>photo(String(index)));let serial=0,maxLive=0,decodes=0,maxDecodes=0,builds=0;
 const cache=new AlbumThumbnailCache(async metadata=>records.find(row=>row.id===metadata.id)!.blob,{limit:50,build:async(blob)=>{builds++;maxDecodes=Math.max(maxDecodes,++decodes);await Promise.resolve();decodes--;return new Blob([await blob.text()]);},createURL:()=>{const url=`thumb-${++serial}`;live.add(url);maxLive=Math.max(maxLive,live.size);return url;},revokeURL:url=>{assert.ok(live.delete(url));}});
 try{const pending=cache.get(photoSummary(records[0]));assert.equal(cache.get(photoSummary(records[0])),pending);const first=await pending;assert.equal(builds,1);assert.equal(await cache.get(photoSummary(records[0])),first);await Promise.all(records.slice(1).map(record=>cache.get(photoSummary(record))));assert.equal(cache.size,24);assert.equal(live.size,24);assert.equal(maxLive,24);assert.equal(maxDecodes,1);assert.equal(builds,50);cache.remove('49');assert.equal(cache.size,23);assert.equal(live.size,23);const original=await records[0].blob.text();assert.equal(original,'original-0');}finally{cache.dispose();}assert.equal(live.size,0);await assert.rejects(cache.get(photoSummary(records[0])),/关闭/);
});

test('deleting a queued thumbnail and closing during encoding cannot resurrect an image URL',async()=>{
 const metadata=photoSummary(photo('1'));let release:(()=>void)|undefined,urls=0,revoked=0;
 const cache=new AlbumThumbnailCache(async()=>new Blob(['raw']),{build:()=>new Promise(resolve=>{release=()=>resolve(new Blob(['small']));}),createURL:()=>`url-${++urls}`,revokeURL:()=>revoked++});
 const removed=cache.get(metadata);await Promise.resolve();await Promise.resolve();cache.remove(metadata.id);release!();await assert.rejects(removed,/取消/);assert.equal(urls,0);
 const closed=cache.get(metadata);await Promise.resolve();await Promise.resolve();cache.dispose();cache.activate();release!();await assert.rejects(closed,/取消/);assert.equal(urls,0,'development cleanup replay cannot revive its old request');
 const fresh=cache.get(metadata);await Promise.resolve();await Promise.resolve();release!();assert.equal(await fresh,'url-1');cache.dispose();assert.equal(revoked,1);assert.equal(cache.size,0);
});

test('touching a cached thumbnail protects it from LRU eviction and external deletion releases its URL',async()=>{
 const live=new Set<string>();let serial=0;const cache=new AlbumThumbnailCache(async()=>new Blob(['raw']),{limit:2,build:async()=>new Blob(['small']),createURL:()=>{const url=`url-${++serial}`;live.add(url);return url;},revokeURL:url=>{assert.ok(live.delete(url));}});
 try{const a=photoSummary(photo('1')),b=photoSummary(photo('2')),c=photoSummary(photo('3')),first=await cache.get(a);await cache.get(b);assert.equal(await cache.get(a),first);await cache.get(c);assert.ok(live.has(first));assert.equal(await cache.get(a),first);assert.equal(serial,3,'the recently viewed image does not decode again');cache.reconcileAvailable([c.id]);assert.equal(cache.size,1);assert.equal(live.size,1);}finally{cache.dispose();}assert.equal(live.size,0);
});
