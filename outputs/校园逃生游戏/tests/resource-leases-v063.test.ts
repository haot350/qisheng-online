import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ResourceLeases,resourceWorkQueue,fetchResource,waitForResource} from '../src/resource-leases.ts';
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('shared consumers cancel independently; final consumer really aborts the request',async()=>{
 let loads=0,signal:AbortSignal|undefined;
 const resources=new ResourceLeases<string>(async(_key,current)=>{loads++;signal=current;return new Promise((_,reject)=>current.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));},()=>{});
 const a=resources.acquire('gun'),b=resources.acquire('gun');const settled=Promise.allSettled([a.value,b.value]);await turn();assert.equal(loads,1);
 a.release();assert.equal(signal?.aborted,false);assert.equal(resources.diagnostics().references,1);
 b.release();assert.equal(signal?.aborted,true);assert.equal(resources.diagnostics().references,0);assert.deepEqual((await settled).map(r=>r.status),['rejected','rejected']);
});

test('cancelled parse cannot replace a new resource generation and is disposed exactly once',async()=>{
 const completes:((value:string)=>void)[]=[],disposed:string[]=[];
 const resources=new ResourceLeases<string>(()=>new Promise(resolve=>completes.push(resolve)),value=>disposed.push(value));
 const old=resources.acquire('portrait');const oldResult=Promise.allSettled([old.value]);await turn();old.release();
 const fresh=resources.acquire('portrait');await turn();completes[1]('fresh');assert.equal(await fresh.value,'fresh');
 completes[0]('late');await oldResult;assert.equal(resources.peek('portrait'),'fresh');assert.deepEqual(disposed,['late']);
 const instance=resources.retainReady('portrait');fresh.release();assert.equal(resources.peek('portrait'),'fresh');instance.release();instance.release();assert.deepEqual(disposed,['late','fresh']);
});

test('failed preparation is retryable and aborts a stalled lower-level fetch',async()=>{
 let calls=0,failedSignal:AbortSignal|undefined;
 const resources=new ResourceLeases<string>(async(_key,signal)=>{calls++;if(calls===1){failedSignal=signal;throw Error('decode');}return 'ready';},()=>{});
 const first=resources.acquire('avatar');await assert.rejects(first.value,/decode/);assert.equal(failedSignal?.aborted,true);first.release();
 const next=resources.acquire('avatar');assert.equal(await next.value,'ready');assert.equal(calls,2);next.release();
});

test('resource work queue caps decode concurrency and drops only the cancelled queued job',async()=>{
 const controllers=Array.from({length:6},()=>new AbortController()),finish:(()=>void)[]=[],started:number[]=[];let active=0,maximum=0;
 const work=controllers.map((c,index)=>resourceWorkQueue.run(c.signal,async()=>{started.push(index);active++;maximum=Math.max(maximum,active);await new Promise<void>(resolve=>finish.push(resolve));active--;return index;}));
 const all=Promise.allSettled(work);await turn();assert.deepEqual(started,[0,1,2,3]);controllers[4].abort();finish.shift()!();await turn();assert.deepEqual(started,[0,1,2,3,5]);
 while(finish.length)finish.shift()!();const results=await all;assert.equal(maximum,4);assert.equal(results[4].status,'rejected');assert.ok(results.filter((_,i)=>i!==4).every(r=>r.status==='fulfilled'));
});

test('fetchResource forwards cancellation to fetch instead of only abandoning the result',async()=>{
 const prior=globalThis.fetch,controller=new AbortController();let received:AbortSignal|undefined;
 globalThis.fetch=async(_url,options)=>{received=options?.signal as AbortSignal;return new Promise((_,reject)=>received!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));};
 try{const download=fetchResource('/asset.glb',controller.signal);controller.abort();await assert.rejects(download,{name:'AbortError'});assert.equal(received,controller.signal);}finally{globalThis.fetch=prior;}
});

test('one cancelled waiter returns immediately while another consumer keeps its download',async()=>{
 let complete!:(v:string)=>void;const resources=new ResourceLeases<string>(()=>new Promise(resolve=>{complete=resolve;}),()=>{}),a=resources.acquire('shared'),b=resources.acquire('shared'),controller=new AbortController();
 const cancelled=waitForResource(a.value,controller.signal);await turn();controller.abort();a.release();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(resources.diagnostics().references,1);complete('ready');assert.equal(await b.value,'ready');b.release();
});
