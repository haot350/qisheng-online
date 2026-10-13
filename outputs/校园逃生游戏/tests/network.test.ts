import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withDeadline} from '../src/network.ts';
test('a stalled resource deadline rejects, requests cancellation and disposes a late result',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let resolve!:(s:string)=>void,cancelled=false;const released:string[]=[];
  const pending=new Promise<string>(r=>{resolve=r;});const request=withDeadline(pending,30000,{onTimeout:()=>{cancelled=true;},onLate:s=>released.push(s)}),error=assert.rejects(request,/超时/);
  t.mock.timers.tick(30000);await error;assert.equal(cancelled,true);resolve('late GPU scene');await Promise.resolve();assert.deepEqual(released,['late GPU scene']);
});
test('aborting a resource releases its wait immediately and still owns cleanup of late data',async()=>{
  const controller=new AbortController();let resolve!:(s:number)=>void;const released:number[]=[];
  const request=withDeadline(new Promise<number>(r=>{resolve=r;}),30000,{signal:controller.signal,onLate:s=>released.push(s)}),error=assert.rejects(request,/中止/);
  controller.abort();await error;resolve(1);await Promise.resolve();assert.deepEqual(released,[1]);
});
