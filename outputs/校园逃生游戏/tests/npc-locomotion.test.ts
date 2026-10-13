import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NpcLocomotion,NPC_GAIT,chooseNpcPose} from '../src/npc-locomotion.ts';

const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} versus ${expected}`);

test('stride progresses by actual horizontal travel and stationary intent cannot animate',()=>{
 const gait=new NpcLocomotion();
 assert.equal(gait.update(.1,2,{x:10,z:10}).pose,'idle');
 const step=gait.update(.1,2,{x:10.2,z:10});
 close(step.speed,2);close(step.phase,.2/NPC_GAIT.walkCycle);assert.equal(step.pose,'walk-a');
 const stop=gait.update(.1,2,{x:10.2,z:10});assert.equal(stop.pose,'idle');assert.equal(stop.bob,0);assert.equal(stop.phase,0);
});

test('same distance produces the same stride despite different render rates',()=>{
 const run=(steps:number)=>{const gait=new NpcLocomotion();gait.update(1/60,1.75,{x:0,z:0});let state;for(let i=1;i<=steps;i++)state=gait.update(.4/steps,1.75,{x:.7*i/steps,z:0});return state!;};
 const fast=run(24),slow=run(8);close(fast.phase,slow.phase);assert.equal(fast.pose,slow.pose);close(fast.bob,slow.bob);
});

test('alternating walk and run frames have speed-dependent stride and bounded bob',()=>{
 const gait=new NpcLocomotion();gait.update(.2,1.75,{x:0,z:0});
 assert.equal(gait.update(.2,1.75,{x:.35,z:0}).pose,'walk-a');assert.equal(gait.update(.2,1.75,{x:.7,z:0}).pose,'walk-b');
 gait.reset({x:0,z:0});
 const a=gait.update(.2,3,{x:.6,z:0}),b=gait.update(.2,3,{x:1.2,z:0});
 assert.equal(a.pose,'run-a');assert.equal(b.pose,'run-b');assert.ok(a.bob>=0&&a.bob<=.014);assert.ok(b.bob>=0&&b.bob<=.014);
});

test('zero-dt combat refresh does not double-step or erase a moving frame',()=>{
 const gait=new NpcLocomotion();gait.update(.1,2,{x:0,z:0});const moving=gait.update(.1,2,{x:.2,z:0});
 assert.deepEqual(gait.update(0,0,{x:.2,z:0}),moving);assert.deepEqual(gait.update(0,2,{x:.2,z:0}),moving);
});

test('teleports, nonfinite positions and disabled movement do not create a stride burst',()=>{
 const gait=new NpcLocomotion();gait.update(.1,3,{x:0,z:0});
 assert.equal(gait.update(.1,3,{x:20,z:0}).pose,'idle');
 assert.equal(gait.update(.1,0,{x:20.2,z:0}).pose,'idle');
 assert.equal(gait.update(.1,3,{x:NaN,z:0}).pose,'idle');
 assert.equal(gait.update(.1,3,{x:20.4,z:0}).pose,'idle');
 assert.equal(gait.update(.1,3,{x:20.7,z:0}).pose,'run-a');
});

test('suppression and visible actions win over gait while sprint still steps',()=>{
 const movement={pose:'run-b' as const,speed:5.4,phase:.6,bob:.01};
 assert.equal(chooseNpcPose(movement,{suppressed:10,skill:'sprint',attackPhase:'fire'},true),'idle');
 assert.equal(chooseNpcPose(movement,{suppressed:0,skill:'callout',attackPhase:'fire'},true),'skill');
 assert.equal(chooseNpcPose(movement,{suppressed:0,skill:'sprint',attackPhase:'fire'},true),'run-b');
 assert.equal(chooseNpcPose({...movement,speed:0,pose:'idle'},{suppressed:0,skill:'sprint'},true),'skill');
 for(const phase of ['aim','fire','cooldown'])assert.equal(chooseNpcPose(movement,{suppressed:0,attackPhase:phase},false),'combat-run-b');
 assert.equal(chooseNpcPose(movement,{suppressed:0,attackPhase:'reload'},false),'reload');
 assert.equal(chooseNpcPose(movement,{suppressed:0,attackPhase:'search'},false),'combat-run-b');
 assert.equal(chooseNpcPose(movement,{suppressed:0,reloading:true},false),'reload');
 assert.equal(chooseNpcPose({...movement,speed:0,pose:'idle'},{suppressed:0,attackPhase:'cooldown'},false),'attack');
});