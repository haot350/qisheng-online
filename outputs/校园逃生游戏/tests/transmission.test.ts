import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Transmission} from '../src/transmission.ts';
import {DRIVING_TUNING as T,engineTorque,steeringLimit} from '../src/driving-tuning.ts';
const tick=(g:Transmission,seconds:number,speed=0,throttle=0,reverse=false,brake=0)=>{for(let i=0;i<Math.ceil(seconds*60);i++)g.tick({speed,throttle,reverse,brake},1/60);};
test('six gear wheel ratios produce useful tachometer values at 90 and 120, and bounded torque',()=>{
 const g=new Transmission();assert.equal(g.read().gear,1);assert.equal(g.read().rpm,900);
 assert.ok(Math.abs(g.expectedRpm(25,6)-3996.4)<2);assert.ok(Math.abs(g.expectedRpm(120/3.6,6)-5328.6)<2);
 assert.equal(engineTorque(900),126);assert.equal(engineTorque(3000),336);assert.ok(steeringLimit(120/3.6,2.8)<.03);
 assert.ok(Math.tan(steeringLimit(25,2.8))*25*25/2.8<=10.000001);
});
test('automatic shifts have hysteresis, exactly one serial event and a brief torque cut',()=>{
 const g=new Transmission();tick(g,.1,7,1);assert.equal(g.read().gear,2);assert.equal(g.read().shiftSerial,1);assert.ok(g.read().shiftLeft>0);assert.equal(g.force(7,1,false),0);
 tick(g,.25,7,1);assert.ok(g.force(7,1,false)>0);assert.equal(g.read().gear,2);tick(g,.2,7,1);assert.equal(g.read().gear,2,'downshift threshold prevents alternating gears');
 const before=g.read();g.tick({speed:7,throttle:1,reverse:false,brake:0},0);assert.deepEqual(g.read(),before,'no simulation does not consume shift time');
});
test('manual gears accept one operation, reject dangerous downshift and report refusal without velocity edits',()=>{
 const g=new Transmission();g.setMode('manual',0);assert.ok(g.shift(1,0));assert.equal(g.read().gear,2);assert.equal(g.shift(1,0),false,'shift cannot queue while the torque cut is active');tick(g,.5);
 assert.ok(g.shift(1,0));tick(g,.5);assert.ok(g.shift(1,0));tick(g,.5);assert.equal(g.read().gear,4);
 const serial=g.read().shiftSerial;assert.equal(g.shift(-1,25),false);assert.equal(g.read().gear,4);assert.equal(g.read().shiftSerial,serial);assert.equal(g.read().rejectedShiftSerial,1);
 g.reset();assert.equal(g.read().gear,1);assert.equal(g.read().transmission,'manual');assert.equal(g.shift(-1,0),false);assert.equal(g.read().rejectedShiftSerial,1);
});
test('manual low gear has a rev limiter and high gear has genuinely weaker pull',()=>{
 const low=new Transmission(),high=new Transmission();low.setMode('manual',0);high.setMode('manual',0);for(let i=0;i<5;i++){assert.ok(high.shift(1,0));tick(high,.5);}
 assert.ok(low.force(2,1,false)>high.force(2,1,false)*3);assert.equal(low.force(12,1,false),0,'first gear over redline cuts torque');
 assert.equal(high.force(T.normalSpeed,1,false),0);assert.ok(high.force(25,1,true)>0);assert.equal(high.force(T.boostSpeed,1,true),0);
});
test('reverse waits for near-stop and manual forward return restores the preceding forward gear',()=>{
 const g=new Transmission();g.setMode('manual',0);for(let i=0;i<3;i++){g.shift(1,0);tick(g,.5);}tick(g,.2,6,1,true);assert.equal(g.read().gear,4);
 tick(g,.2,.2,1,true);assert.equal(g.read().gear,-1);tick(g,.5,-4,1,false);assert.equal(g.read().gear,-1,'forward request still waits while reversing');tick(g,.2,-.2,1,false);assert.equal(g.read().gear,4);
 g.setMode('auto',25);assert.equal(g.read().gear,6);tick(g,.6,0);assert.equal(g.read().gear,1);tick(g,.2,0,1,true);assert.equal(g.read().gear,-1);tick(g,.2,0,1,false);assert.equal(g.read().gear,1);
});
test('both modes select a legal gear near 3500 rpm; reset preserves mode and clears temporary gearbox state',()=>{
 const g=new Transmission();g.setMode('manual',0);g.setMode('auto',30);assert.equal(g.read().gear,6);assert.ok(g.read().rpm<=T.redline);g.setMode('manual',60/3.6);assert.equal(g.read().gear,5);const mode=g.read().transmission;g.reset();assert.deepEqual(g.read(),{gear:1,rpm:900,transmission:mode,shiftLeft:0,shiftSerial:0,rejectedShiftSerial:0});
});