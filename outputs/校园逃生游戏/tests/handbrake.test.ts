import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandbrakeControl,HANDBRAKE_RULES as R,type HandbrakeSample} from '../src/handbrake.ts';
const eligible:HandbrakeSample={pressed:true,speed:60/3.6,steer:.8,wheelContacts:4,rearContacts:true,upY:1,slipAngle:0};
const run=(h:HandbrakeControl,n:number,s=eligible)=>{for(let i=0;i<n;i++)h.tick(s,1/60);};
test('a drift press brakes and cuts rear drive, then carries on partial rear power and recovers progressively',()=>{
 const h=new HandbrakeControl();h.tick(eligible,1/60);assert.equal(h.stage,'pulse');assert.equal(h.rearDrive,0);assert.ok(h.brake>0);run(h,9);assert.equal(h.assist,1);
 run(h,20);assert.equal(h.stage,'carry');assert.ok(Math.abs(h.rearDrive-R.carryDrive)<1e-9);assert.equal(h.brake,R.carryBrake);
 h.tick({...eligible,pressed:false},1/60);assert.equal(h.stage,'recover');assert.ok(h.assist>0&&h.assist<1);assert.ok(h.rearDrive>R.carryDrive);
 run(h,31,{...eligible,pressed:false});assert.equal(h.assist,0);assert.equal(h.rearDrive,1);assert.equal(h.brake,0);assert.equal(h.stage,'idle');
 h.reset();assert.equal(h.pressed,false);assert.equal(h.assist,0);assert.equal(h.rearDrive,1);
});
test('75 km/h retains full assistance, 75–100 fades, and a high-speed held press cannot re-arm',()=>{
 const h=new HandbrakeControl();run(h,10);assert.equal(h.assist,1);
 const midway=new HandbrakeControl();run(midway,24,{...eligible,speed:87.5/3.6});assert.ok(Math.abs(midway.assist-.5)<1e-9);
 const fast=new HandbrakeControl();run(fast,20,{...eligible,speed:110/3.6});assert.equal(fast.assist,0);assert.equal(fast.stage,'brake');assert.ok(fast.brake>0);
 run(fast,20,eligible);assert.equal(fast.assist,0,'deceleration during the same high-speed press cannot surprise the driver with drift');
 run(h,100);assert.equal(h.assist,0);assert.equal(h.stage,'brake');h.tick({...eligible,pressed:false},1/60);run(h,10);assert.equal(h.assist,1,'release explicitly re-arms');
});
test('22-degree soft recovery replaces the old 15-degree cut; 32 degrees, unsupported wheels and non-finite inputs exit safely',()=>{
 const h=new HandbrakeControl();run(h,12);for(let i=0;i<12;i++)h.tick({...eligible,slipAngle:18*Math.PI/180},1/60);assert.equal(h.assist,1,'18 degrees is not a hard exit');
 // Change the angle slowly so this checks the angular threshold rather than the predictive safety margin.
 for(let i=1;i<=12;i++)h.tick({...eligible,slipAngle:(18+i*.5)*Math.PI/180},1/60);
 assert.ok(h.assist>0&&h.assist<1);assert.equal(h.stage,'carry');
 const before=h.assist;h.tick({...eligible,slipAngle:R.maximumSlip},1/60);assert.ok(h.assist>0&&h.assist>=before-1/60/R.slipRecovery-1e-9,'maximum slip starts rate-limited recovery');run(h,31,{...eligible,slipAngle:R.maximumSlip});assert.equal(h.assist,0);
 for(const fault of [{upY:.93},{wheelContacts:2},{rearContacts:false},{speed:Number.NaN},{slipAngle:Number.NaN}]){const control=new HandbrakeControl();run(control,10);control.tick({...eligible,...fault},1/60);if(Object.values(fault).some(v=>typeof v==='number'&&!Number.isFinite(v)))assert.equal(control.assist,0);else assert.ok(control.assist>0&&control.assist<1,'support loss recovers quickly without a one-frame grip snap');run(control,10,{...eligible,...fault});assert.equal(control.assist,0);run(control,10);assert.equal(control.assist,0,'faulted held input must be released to re-arm');}
});
test('counter-steer starts recovery and zero simulation time changes no held state or timers',()=>{
 const h=new HandbrakeControl();run(h,30);const before=[h.assist,h.rearDrive,h.brake,h.stage,h.pressed];h.tick({...eligible,pressed:false},0);assert.deepEqual([h.assist,h.rearDrive,h.brake,h.stage,h.pressed],before);
 h.tick({...eligible,steer:-.8},1/60);assert.equal(h.stage,'recover');assert.ok(h.assist<1);run(h,32,{...eligible,steer:-.8});assert.equal(h.assist,0);assert.equal(h.stage,'brake');
});