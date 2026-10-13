import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fetchResourceBytes,decodeResource,ResourceFailure,startupFailure} from '../app/resource-loading.ts';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('download deadline aborts a response that never sends headers',async()=>{
 let aborted=false;const fetcher=(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'))},{once:true}));
 await assert.rejects(fetchResourceBytes('/model',{signal:new AbortController().signal,timeoutMs:15,fetcher}),error=>error.kind==='timeout');assert.equal(aborted,true);
});
test('idle stream deadline cancels a stalled body',async()=>{
 let canceled=false;const fetcher=async(_url,{signal})=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')))},cancel(){canceled=true}}));
 await assert.rejects(fetchResourceBytes('/model',{signal:new AbortController().signal,timeoutMs:20,fetcher}),error=>error.kind==='timeout');
});
test('receiving bytes resets idle deadline and reports actual progress',async()=>{
 const progress=[];const fetcher=async()=>new Response(new ReadableStream({async start(controller){for(let i=0;i<4;i++){await wait(20);controller.enqueue(new Uint8Array([i]))}controller.close()}}),{headers:{'content-length':'4'}});
 const buffer=await fetchResourceBytes('/model',{signal:new AbortController().signal,timeoutMs:55,fetcher,progress:n=>progress.push(n)});assert.deepEqual([...new Uint8Array(buffer)],[0,1,2,3]);assert.deepEqual(progress,[25,50,75,100]);
});
test('explicit cancellation remains cancellation, not a retry failure',async()=>{
 const owner=new AbortController();const fetcher=(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 const request=fetchResourceBytes('/model',{signal:owner.signal,fetcher});owner.abort();await assert.rejects(request,error=>error.name==='AbortError');
});
test('failed HTTP and unavailable network are classified without WebGL advice',async()=>{
 await assert.rejects(fetchResourceBytes('/model',{signal:new AbortController().signal,fetcher:async()=>new Response('',{status:503})}),e=>e.kind==='network');
 const failure=startupFailure(new Error('Failed to fetch dynamically imported module'),'import');assert.equal(failure.refresh,true);assert.doesNotMatch(failure.message,/硬件加速/);assert.match(startupFailure(new ResourceFailure('webgl','failed'),'engine').message,/硬件加速/);
});
test('late decode after timeout is disposed exactly once',async()=>{
 let disposed=0;const item={name:'late'};let complete;const pending=new Promise(resolve=>complete=resolve);
 await assert.rejects(decodeResource(()=>pending,value=>{assert.equal(value,item);disposed++},new AbortController().signal,15),e=>e.kind==='decode');complete(item);await wait(0);assert.equal(disposed,1);
});
test('late decode after cancellation cannot enter the scene',async()=>{
 let disposed=0,complete;const owner=new AbortController(),pending=new Promise(resolve=>complete=resolve);
 const result=decodeResource(()=>pending,()=>disposed++,owner.signal);await wait(0);owner.abort();await assert.rejects(result,e=>e.name==='AbortError');complete({});await wait(0);assert.equal(disposed,1);
});
test('successful decode transfers ownership and cancels its deadline',async()=>{
 let disposed=0;const item={};assert.equal(await decodeResource(async()=>item,()=>disposed++,new AbortController().signal,15),item);await wait(20);assert.equal(disposed,0);
});
test('decode rejection reports a decode failure without owning a result',async()=>{let disposed=0;await assert.rejects(decodeResource(async()=>{throw Error('invalid GLB')},()=>disposed++,new AbortController().signal),e=>e.kind==='decode');assert.equal(disposed,0)});
