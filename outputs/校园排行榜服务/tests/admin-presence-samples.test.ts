import assert from 'node:assert/strict';
import test from 'node:test';
import {PRESENCE_SAMPLE_INTERVAL_MS as interval,samplePresenceMinutes} from '../admin/src/presence-samples.ts';

test('presence samples retain the last valid observation in each real-time bucket',()=>{
 const now=interval*1000+60_000;
 const samples=samplePresenceMinutes([
  {minute:now-30_000,sessions:4},
  {minute:now-60_000,sessions:2},
  {minute:now-20_000,sessions:NaN},
  {minute:now-interval,sessions:0},
 ],now);
 assert.deepEqual(samples,[{minute:now-interval,sessions:0},{minute:now-30_000,sessions:4}]);
});

test('presence samples cover at most 120 buckets without inserting missing observations',()=>{
 const now=interval*2000+60_000;
 const rows=Array.from({length:1441},(_,index)=>({minute:now-index*60_000,sessions:index}));
 const samples=samplePresenceMinutes(rows,now);
 assert.equal(samples.length,120);
 assert.ok(samples.every(row=>row.minute>now-86_400_000&&row.minute<=now));
 assert.deepEqual(samplePresenceMinutes([{minute:now-86_400_000+30_000,sessions:1}],now),[]);
 assert.deepEqual(samplePresenceMinutes([{minute:now,sessions:2},{minute:now-3*interval,sessions:5}],now),[{minute:now-3*interval,sessions:5},{minute:now,sessions:2}]);
});

test('presence samples ignore future, expired and invalid records',()=>{
 const now=interval*2000;
 assert.deepEqual(samplePresenceMinutes([{minute:now+1,sessions:2},{minute:now-86_400_000,sessions:2},{minute:now-1,sessions:-1},{minute:NaN,sessions:3}],now),[]);
 assert.deepEqual(samplePresenceMinutes([{minute:now,sessions:1}],NaN),[]);
});
