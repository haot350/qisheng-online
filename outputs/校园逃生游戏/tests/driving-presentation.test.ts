import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drivingPrefetch,drivingCameraGain,engineSoundParameters,canSelectTransmission} from '../src/driving-presentation.ts';
test('driving prefetch follows real velocity, including reverse and lateral slip, with 35–115m limits',()=>{
 assert.deepEqual(drivingPrefetch([0,2,0],[0,0,-33.333],[0,0,-1]),[0,2,-115]);
 assert.deepEqual(drivingPrefetch([3,1,4],[0,0,4],[0,0,-1]),[3,1,39]);
 assert.deepEqual(drivingPrefetch([0,0,0],[10,0,0],[0,0,-1]),[35,0,0]);
 assert.deepEqual(drivingPrefetch([0,0,0],[0,0,0],[0,0,-1]),[0,0,-35]);
 assert.equal(Math.hypot(...drivingPrefetch([0,0,0],[0,0,-25],[0,0,-1])),87.5);
});
test('speed camera gain is smooth between 60 and 120 km/h and respects reduced motion',()=>{
 for(const s of [0,4,12,60/3.6])assert.ok(Math.abs(drivingCameraGain(s,false))<1e-12);
 assert.equal(drivingCameraGain(90/3.6,false),.5);
 assert.equal(drivingCameraGain(120/3.6,false),1);
 assert.equal(drivingCameraGain(120/3.6,true),0);
});
test('engine firing frequency comes from drivetrain RPM rather than artificial speed or pedal RPM',()=>{
 const a=engineSoundParameters(20,1,4800,0),b=engineSoundParameters(20,1,2400,0),coast=engineSoundParameters(20,0,4800,0),cut=engineSoundParameters(20,1,4800,.18);
 assert.equal(a.frequency,160);assert.equal(b.frequency,80);assert.equal(coast.frequency,a.frequency);
 assert.ok(cut.gain<a.gain);assert.equal(cut.frequency,a.frequency);
});
test('transmission selection is limited to menu and pause without changing live driving',()=>{
 assert.equal(canSelectTransmission('menu'),true);assert.equal(canSelectTransmission('paused'),true);
 for(const phase of ['playing','loading','intro','won','lost','error'] as const)assert.equal(canSelectTransmission(phase),false);
});