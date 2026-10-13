import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {preparePlayerAvatars,avatarResourceState} from '../src/multiplayer/avatar.ts';
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('avatar preparation shares one download and cancelling one caller does not interrupt the other',async()=>{
 const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;let count=0,downloadSignal:AbortSignal|undefined,complete!:(r:Response)=>void;
 globalThis.fetch=async(_url,options)=>{count++;downloadSignal=options?.signal as AbortSignal;return new Promise(resolve=>{complete=resolve;});};GLTFLoader.prototype.parseAsync=async()=>({scene:new Group()} as any);
 const a=new AbortController(),b=new AbortController();let lease:Awaited<ReturnType<typeof preparePlayerAvatars>>|undefined;
 try{const first=preparePlayerAvatars(['campus-a'],a.signal),second=preparePlayerAvatars(['campus-a'],b.signal);await turn();assert.equal(count,1);a.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(downloadSignal?.aborted,false);assert.equal(avatarResourceState()[0]?.refs,1);complete(new Response(new Uint8Array([1])));lease=await second;assert.equal(avatarResourceState()[0]?.ready,true);lease.release();assert.deepEqual(avatarResourceState(),[]);assert.equal(downloadSignal?.aborted,true);}finally{a.abort();b.abort();lease?.release();globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
});

test('avatar cancellation discards late decoding without overwriting a retry',async()=>{
 const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;let signal:AbortSignal|undefined,parseComplete!:(v:any)=>void;
 globalThis.fetch=async(_url,options)=>{signal=options?.signal as AbortSignal;return new Response(new Uint8Array([1]));};GLTFLoader.prototype.parseAsync=()=>new Promise(resolve=>{parseComplete=resolve;});
 const controller=new AbortController();let lease:Awaited<ReturnType<typeof preparePlayerAvatars>>|undefined;const old=new Group(),geometry=new BoxGeometry();let disposed=0;geometry.addEventListener('dispose',()=>disposed++);old.add(new Mesh(geometry,new MeshStandardMaterial()));
 try{const first=preparePlayerAvatars(['tactical-a'],controller.signal);while(!parseComplete)await turn();controller.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(signal?.aborted,true);assert.deepEqual(avatarResourceState(),[]);const late=parseComplete;GLTFLoader.prototype.parseAsync=async()=>({scene:new Group()} as any);lease=await preparePlayerAvatars(['tactical-a']);late({scene:old});await turn();assert.equal(disposed,1);assert.equal(avatarResourceState()[0]?.ready,true);assert.equal(avatarResourceState()[0]?.refs,1);lease.release();assert.deepEqual(avatarResourceState(),[]);}finally{controller.abort();lease?.release();globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
});

test('final avatar consumer cancellation reaches the actual pending fetch',async()=>{
 const originalFetch=globalThis.fetch,controller=new AbortController();let signal:AbortSignal|undefined;globalThis.fetch=async(_url,options)=>{signal=options?.signal as AbortSignal;return new Promise((_,reject)=>signal!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));};
 try{const work=preparePlayerAvatars(['campus-b'],controller.signal);while(!signal)await turn();controller.abort();await assert.rejects(work,{name:'AbortError'});assert.equal(signal.aborted,true);assert.deepEqual(avatarResourceState(),[]);}finally{controller.abort();globalThis.fetch=originalFetch;}
});
