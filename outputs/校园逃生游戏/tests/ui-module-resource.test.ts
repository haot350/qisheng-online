import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleResource} from '../src/ui-modules.ts';

test('module loading shares pending requests, retains success and clears failures for retry',async()=>{
  let calls=0;const value={ready:true},load=moduleResource(async()=>{if(++calls===1)throw Error('network unavailable');return value;});
  const first=load();assert.equal(load(),first);await assert.rejects(first,/network unavailable/);
  const retry=load();assert.notEqual(retry,first);assert.equal(await retry,value);assert.equal(load(),retry);assert.equal(calls,2);
});
test('a timed-out import cannot replace the successful retry with its late result',async()=>{
  let finish!:(value:string)=>void,calls=0;const load=moduleResource(()=>++calls===1?new Promise<string>(resolve=>{finish=resolve;}):Promise.resolve('new'),10);
  await assert.rejects(load(),/超时/);const current=load();assert.equal(await current,'new');finish('old');await Promise.resolve();assert.equal(load(),current);assert.equal(await load(),'new');
});
