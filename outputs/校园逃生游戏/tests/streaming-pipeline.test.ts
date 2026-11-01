import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChunkStreamer} from '../src/streaming.ts';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve};};
test('byte-ready opens two download slots while preparation stays bounded to eight MiB',async()=>{
 const chunks=Array.from({length:12},(_,i)=>({url:'chunk-'+i,center:[0,0,0] as [number,number,number],radius:1,bytes:1024*1024,residency:'structure' as const}));
 const network=new Map<string,ReturnType<typeof deferred>>(),gpu=deferred();let activeNetwork=0,peakNetwork=0,started=0,releaseAll=false;
 const stream=new ChunkStreamer(chunks,async(chunk,_signal,_priority,byteReady)=>{started++;activeNetwork++;peakNetwork=Math.max(peakNetwork,activeNetwork);if(!releaseAll){const gate=deferred();network.set(chunk.url,gate);await gate.promise;}activeNetwork--;byteReady?.(chunk.bytes);if(!releaseAll)await gpu.promise;return chunk.url;},()=>{});
 try{const prepared=stream.initialize([0,0,0],()=>{});assert.equal(started,2);
  for(let i=0;i<8;i++){const row=[...network].find(([key])=>key==='chunk-'+i);assert.ok(row);row[1].resolve();await tick();}
  assert.equal(started,8);assert.equal(peakNetwork,2);assert.equal(stream.diagnostics().pipeline.pendingBytes,8*1024*1024);assert.ok(stream.diagnostics().pipeline.peakPendingBytes<=8*1024*1024);
  releaseAll=true;gpu.resolve();await prepared;assert.equal(stream.diagnostics().resident,12);assert.equal(stream.diagnostics().pipeline.pendingBytes,0);
 }finally{releaseAll=true;gpu.resolve();for(const gate of network.values())gate.resolve();stream.dispose();}
});
