import {test} from 'node:test';
import assert from 'node:assert/strict';
import {releaseOwnedPointer} from '../src/pointer-owner.ts';

test('a cancelled observation finger leaves the held accelerator and steering untouched',()=>{
 const steering={current:10 as number|null},throttle={current:11 as number|null},look={current:12 as number|null};
 const state={steer:.8,throttle:1,look:true},cancel={pointerId:12};
 assert.equal(releaseOwnedPointer(steering,cancel,()=>{state.steer=0;}),false);
 assert.equal(releaseOwnedPointer(throttle,cancel,()=>{state.throttle=0;}),false);
 assert.equal(releaseOwnedPointer(look,cancel,()=>{state.look=false;}),true);
 assert.deepEqual(state,{steer:.8,throttle:1,look:false});assert.equal(steering.current,10);assert.equal(throttle.current,11);
});
test('pointer cancel, up and lost capture release one owned input exactly once',()=>{
 for(const pointerId of [1,2,3]){
  const owner={current:pointerId as number|null};let releases=0;
  assert.equal(releaseOwnedPointer(owner,{pointerId:pointerId+10},()=>releases++),false);
  assert.equal(releaseOwnedPointer(owner,{pointerId},()=>releases++),true);
  assert.equal(releaseOwnedPointer(owner,{pointerId},()=>releases++),false);
  assert.equal(releases,1);assert.equal(owner.current,null);
 }
});
