import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChunkStreamer} from '../src/streaming.ts';
const chunk=(url:string)=>({url,center:[0,0,0] as [number,number,number],radius:1,bytes:1,residency:'structure' as const});
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
test('one transient required chunk retries without discarding completed neighbours',async()=>{
 const calls=new Map<string,number>(),released:string[]=[];
 const stream=new ChunkStreamer([chunk('good'),chunk('retry')],async c=>{calls.set(c.url,(calls.get(c.url)??0)+1);if(c.url==='retry'&&calls.get(c.url)===1)throw Error('Resource HTTP 503');return c.url;},value=>released.push(value),()=>performance.now(),()=>{},1);
 try{await stream.initialize([0,0,0],()=>{});assert.equal(calls.get('good'),1);assert.equal(calls.get('retry'),2);assert.equal(stream.status().resident,2);assert.deepEqual(released,[]);}finally{stream.dispose();}
});
test('a second transient failure ends this preparation and manual retry gets a fresh bounded attempt',async()=>{
 let calls=0,broken=true;const stream=new ChunkStreamer([chunk('retry')],async()=>{calls++;if(broken)throw Error('network unavailable');return 'ready';},()=>{},()=>performance.now(),()=>{},1);
 try{await assert.rejects(stream.prepareChunks([chunk('retry')],new AbortController().signal),/重试/);assert.equal(calls,2);broken=false;const release=await stream.prepareChunks([chunk('retry')],new AbortController().signal);assert.equal(calls,3);release();}finally{stream.dispose();}
});
test('integrity failures are not retried as transient downloads',async()=>{
 let calls=0;const stream=new ChunkStreamer([chunk('bad')],async()=>{calls++;throw Error('Map hash mismatch');},()=>{},()=>performance.now(),()=>{},1);
 try{await assert.rejects(stream.initialize([0,0,0],()=>{}));await wait(5);assert.equal(calls,1);}finally{stream.dispose();}
});
test('time spent in a live loader queue is not a second whole-chunk thirty-second deadline',async()=>{
 let now=0,resolve!:(asset:string)=>void;const controller=new AbortController();let request:AbortSignal|undefined;
 const stream=new ChunkStreamer([chunk('queued')],async(_chunk,signal)=>{request=signal;return new Promise<string>(r=>resolve=r);},()=>{},()=>now);
 try{const prepared=stream.initialize([0,0,0],()=>{},controller.signal);now=60000;stream.update([0,0,0],[],true);assert.equal(request?.aborted,false);resolve('ready');await prepared;assert.equal(stream.status().blocked,false);}finally{stream.dispose();}
});
test('cancelling during retry backoff does not start a late second request',async()=>{
 let calls=0;const stream=new ChunkStreamer([chunk('retry')],async()=>{calls++;throw Error('offline');},()=>{},()=>performance.now(),()=>{},10),controller=new AbortController();
 const pending=stream.initialize([0,0,0],()=>{},controller.signal);await wait(0);controller.abort();await assert.rejects(pending);await wait(15);assert.equal(calls,1);stream.dispose();
});
