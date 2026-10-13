import test from 'node:test';
import assert from 'node:assert/strict';
import {DRIVING_ROUTE_V024,DRIVING_LOOP_START_V024,drivingControlsV024,portraitHeadV024,observationAnglesV024} from '../scripts/qa-physical-controls-v024.mjs';

test('physical driving planner follows the proven corridor and a bounded field rectangle',()=>{
 assert.deepEqual(DRIVING_ROUTE_V024.slice(6,10),[[-72,-66],[-76,-70],[-77,-88],[-99,-90]]);
 const loop=DRIVING_ROUTE_V024.slice(DRIVING_LOOP_START_V024);
 assert.ok(loop.every(([x,z])=>x>=-145&&x<=-105&&z>=-154&&z<=-100));
 assert.ok(!DRIVING_ROUTE_V024.some(([x,z])=>x===-77&&z===-155),'The failed diagonal must not return.');
});
test('steering uses production -Z forward axes and reduces speed around corners',()=>{
 const car={position:[0,0,0],yaw:0,speed:8};
 assert.equal(drivingControlsV024(car,[0,-20]).steer,0);
 assert.ok(drivingControlsV024(car,[20,0]).steer>0,'D steers from north toward east.');
 assert.ok(drivingControlsV024(car,[-20,0]).steer<0,'A steers from north toward west.');
 assert.equal(drivingControlsV024(car,[20,0]).gas,false);
 assert.equal(drivingControlsV024(car,[20,0]).brake,true);
 assert.equal(drivingControlsV024({...car,speed:2},[0,-20]).gas,true);
});
test('head target derives vertical and lateral position from calibrated portrait pixels',()=>{
 const shape={box:[200,40,800,1500],head:[400,40,620,280]};
 const feet=[5,.2,10],player=[5,0,15],head=portraitHeadV024(shape,feet,player);
 assert.ok(head[1]>1.75&&head[1]<1.85);
 assert.ok(head[0]>feet[0]);
 assert.equal(head[2],feet[2]);
 const facingEast=portraitHeadV024(shape,feet,[10,0,10]);
 assert.ok(Math.abs(facingEast[0]-feet[0])<1e-9);
 assert.ok(facingEast[2]<feet[2]);
});
test('observation helper uses YXZ camera yaw and the actual player eye',()=>{
 const forward=observationAnglesV024([0,0,0],[0,undefined,-5]);
 assert.ok(Math.abs(forward.yaw)<1e-9);assert.equal(forward.pitch,0);
 const head=observationAnglesV024([0,.3,0],[5,1.92,0]);
 assert.ok(Math.abs(head.yaw+Math.PI/2)<1e-9);
 assert.ok(Math.abs(head.pitch)<1e-9);
});
