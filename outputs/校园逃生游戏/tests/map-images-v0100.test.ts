import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeMapImage,releaseMapImage} from '../src/map-image-decode.ts';
import {MapImageSources} from '../src/map-image-sources.ts';
import type {MapAssetSession} from '../src/map-cache';
import type {MapChunk} from '../src/types';

function fallbackHost(){
 const created:string[]=[],revoked:string[]=[],images:FakeImage[]=[];
 class FakeImage{naturalWidth=8;naturalHeight=8;decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;value='';constructor(){images.push(this);}set src(url:string){this.value=url;if(url)queueMicrotask(()=>this.onload?.());}get src(){return this.value;}}
 const host={Image:FakeImage as unknown as new()=>HTMLImageElement,url:{createObjectURL:()=>{const url='blob:local-'+created.length;created.push(url);return url;},revokeObjectURL:(url:string)=>revoked.push(url)}};
 return{host,created,revoked,images};
}

test('an Image-only browser decodes verified bytes and releases its temporary blob URL',async()=>{
 const f=fallbackHost(),image=await decodeMapImage(new ArrayBuffer(4),new AbortController().signal,f.host);
 assert.equal(image,f.images[0]);assert.deepEqual(f.created,f.revoked);releaseMapImage(image);assert.equal(f.images[0].src,'');
});
test('a browser rejecting ImageBitmap options falls back to its regular image decoder',async()=>{
 const f=fallbackHost();let bitmapCalls=0;
 const image=await decodeMapImage(new ArrayBuffer(4),new AbortController().signal,{...f.host,bitmap:async()=>{bitmapCalls++;throw Error('unsupported options');}});
 assert.equal(bitmapCalls,1);assert.equal(image,f.images[0]);assert.equal(f.revoked.length,1);
});
test('bitmap cancellation returns immediately and closes the eventual late bitmap',async()=>{
 let resolve!:(value:ImageBitmap)=>void,closes=0;const owner=new AbortController(),pending=new Promise<ImageBitmap>(r=>resolve=r);
 const image=decodeMapImage(new ArrayBuffer(4),owner.signal,{...fallbackHost().host,bitmap:()=>pending});await new Promise<void>(r=>queueMicrotask(r));owner.abort();
 await assert.rejects(image,e=>(e as Error).name==='AbortError');resolve({close:()=>closes++} as unknown as ImageBitmap);await new Promise<void>(r=>setImmediate(r));assert.equal(closes,1);
});
test('cancelling an element decode revokes the URL and clears the in-flight image',async()=>{
 const f=fallbackHost(),owner=new AbortController(),promise=decodeMapImage(new ArrayBuffer(4),owner.signal,f.host);owner.abort();await assert.rejects(promise,e=>(e as Error).name==='AbortError');
 assert.equal(f.images[0].src,'');assert.deepEqual(f.created,f.revoked);
});
test('an already cancelled request does not start either decode path',async()=>{
 const f=fallbackHost(),owner=new AbortController();owner.abort();let calls=0;
 await assert.rejects(decodeMapImage(new ArrayBuffer(4),owner.signal,{...f.host,bitmap:async()=>{calls++;return{} as ImageBitmap;}}),e=>(e as Error).name==='AbortError');assert.equal(calls,0);assert.equal(f.created.length,0);
});
test('map sources deduplicate decode while textures retain independent sampling and UV transforms',async()=>{
 const descriptors={location:Object.getOwnPropertyDescriptor(globalThis,'location'),bitmap:Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap')};let requests=0,decodes=0,closed=0;
 Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'https://local.test/'}});
 Object.defineProperty(globalThis,'createImageBitmap',{configurable:true,value:async()=>{decodes++;return{width:8,height:8,close:()=>closed++};}});
 const source=new MapImageSources({read:async()=>{requests++;return new ArrayBuffer(4);}} as unknown as MapAssetSession),owner=new AbortController();
 try{
  const chunk={url:'/map/example.glb',dependencies:['/textures/a.webp']} as MapChunk;await Promise.all([source.prepare(chunk,owner.signal),source.prepare(chunk,owner.signal)]);
  const handler=source.handler(owner.signal),load=()=>new Promise<import('three').Texture>((resolve,reject)=>handler.load('/textures/a.webp',resolve,undefined,reject)),a=await load(),b=await load();
  a.offset.x=.25;b.offset.x=.75;a.repeat.x=2;b.repeat.x=4;assert.equal(a.source,b.source);assert.notEqual(a,b);assert.equal(a.offset.x,.25);assert.equal(b.offset.x,.75);assert.equal(a.repeat.x,2);assert.equal(b.repeat.x,4);assert.equal(requests,1);assert.equal(decodes,1);a.dispose();b.dispose();
  const cancel=new AbortController();cancel.abort();await assert.rejects(source.prepare({url:'unused',dependencies:['/textures/unused.webp']} as MapChunk,cancel.signal));assert.equal(requests,1);
 }finally{source.dispose();if(descriptors.location)Object.defineProperty(globalThis,'location',descriptors.location);else delete (globalThis as {location?:unknown}).location;if(descriptors.bitmap)Object.defineProperty(globalThis,'createImageBitmap',descriptors.bitmap);else delete (globalThis as {createImageBitmap?:unknown}).createImageBitmap;}
 assert.equal(closed,1);
});
