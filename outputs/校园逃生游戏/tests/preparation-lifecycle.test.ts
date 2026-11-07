import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PreparationFailure,preparationFailure,retryablePreparationFailure,retryableInitialization,withForegroundDeadline,recordPreparationDiagnostic,preparationDiagnostics,preparationErrorView} from '../src/preparation-lifecycle.ts';
import {fetchResource} from '../src/resource-leases.ts';
const sleep=(milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds));

test('a rejected initializer can retry while simultaneous consumers still share one attempt',async()=>{
 let calls=0;const initialize=retryableInitialization(async()=>{if(++calls===1)throw Error('WASM transport failed');return 'ready';});
 const first=initialize();assert.equal(initialize(),first);await assert.rejects(first);assert.equal(await initialize(),'ready');assert.equal(await initialize(),'ready');assert.equal(calls,2);
});
test('retry classification preserves wrapped transport errors and rejects permission or invalid content retries',()=>{
 assert.equal(retryablePreparationFailure(Error('Opening failed',{cause:Error('Resource HTTP 503')})),true);
 assert.equal(retryablePreparationFailure(Error('Resource HTTP 403')),false);
 assert.equal(retryablePreparationFailure(Error('Map hash mismatch')),false);
 assert.equal(preparationFailure(new DOMException('Cancelled','AbortError'),'download').kind,'cancelled');
});
test('hidden-page time does not exhaust foreground GPU budget and abort disposes a late result',async()=>{
 let hidden=true,changed=()=>{},resolve!:(value:string)=>void;const released:string[]=[],visibility={hidden:()=>hidden,subscribe:(listener:()=>void)=>{changed=listener;return()=>{};}};
 const abort=new AbortController(),waiting=withForegroundDeadline(new Promise<string>(r=>resolve=r),20,{signal:abort.signal,visibility,stage:'gpu',onLate:value=>released.push(value)});
 await sleep(35);hidden=false;changed();abort.abort();await assert.rejects(waiting,{name:'AbortError'});resolve('late');await sleep(0);assert.deepEqual(released,['late']);
});
test('a truly stalled active stage still terminates',async()=>{
 await assert.rejects(withForegroundDeadline(new Promise(()=>{}),5,{stage:'decode'}),error=>error instanceof PreparationFailure&&error.kind==='timeout'&&error.stage==='decode');
});
test('resource transfer may exceed its stall window if bytes continue to arrive',async t=>{
 const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);
 globalThis.fetch=async()=>new Response(new ReadableStream<Uint8Array>({async start(controller){for(let i=0;i<4;i++){await sleep(8);controller.enqueue(new Uint8Array([i]));}controller.close();}}));
 assert.deepEqual([...new Uint8Array(await fetchResource('/asset',new AbortController().signal,{stallMs:20}))],[0,1,2,3]);
});
test('a resource transfer with no progress aborts and reports the download phase',async t=>{
 const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);
 globalThis.fetch=async(_url,options)=>new Promise((_,reject)=>{options?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
 await assert.rejects(fetchResource('/asset',new AbortController().signal,{stallMs:5}),error=>error instanceof PreparationFailure&&error.stage==='download'&&error.kind==='timeout');
});

test('wrapped stage failures keep their true phase and a stalled module offers a page refresh',()=>{
 const source=new PreparationFailure('gpu','graphics'),wrapped=new Error('Chunk preparation failed',{cause:source});assert.equal(preparationFailure(wrapped,'entry'),source);
 assert.equal(retryablePreparationFailure(new PreparationFailure('decode','timeout')),false);assert.equal(preparationErrorView(new PreparationFailure('initialize','timeout'),'entry').recovery,'refresh');
});
test('preparation diagnostics remain bounded and contain no URL or identity payload',()=>{
 for(let generation=0;generation<40;generation++)recordPreparationDiagnostic(new PreparationFailure('download','network'),'entry',{generation,mode:generation===39?'https://private.invalid/user': 'escape',quality:'auto',resourceHash:generation===39?'private-token':'a'.repeat(64)});
 const trace=preparationDiagnostics();assert.equal(trace.events.length,32);assert.equal(trace.events[0].generation,8);assert.equal(trace.events.at(-1)?.mode,undefined);assert.equal(trace.events.at(-1)?.resourceHash,undefined);assert.equal(JSON.stringify(trace).includes('private'),false);
 trace.events[0].code='changed';assert.equal(preparationDiagnostics().events[0].code,'PREP_DOWNLOAD_NETWORK');
});
