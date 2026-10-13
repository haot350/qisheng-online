import {test} from 'node:test';
import assert from 'node:assert/strict';
import {driveAreaAllowed,drivePointExcluded,type DriveAreaMap,type DriveExclusion} from '../src/driving-area.ts';
const basin:DriveExclusion={kind:'sector',center:[44,-124],radius:18.5,tipRadius:3.2,startAngle:-.75*Math.PI,endAngle:.75*Math.PI};
const map:DriveAreaMap={bounds:{min:[-200,-4,-200],max:[100,25,20]},excluded:[basin],barriers:[]};
test('the true 270 degree basin excludes steps and tip while leaving the western road and planting wedge open',()=>{
 for(const [x,z] of [[25,-120],[26,-124],[29,-135],[34,-124],[37,-124]])assert.ok(driveAreaAllowed(map,{x,y:.1,z}),`${x},${z} is outside the genuine basin`);
 for(const [x,z] of [[44,-124],[42,-124],[55,-124],[44,-110],[44,-138],[31,-111],[31,-137]])assert.ok(drivePointExcluded({x,y:.1,z},basin),`${x},${z} is on the genuine basin or a radial wall`);
 assert.ok(!driveAreaAllowed(map,{x:25,y:-2.3,z:-120}),'the lower courtyard never becomes a vehicle recovery surface');
});
test('the safety margin follows radial edges and old circular exclusions retain their behavior',()=>{
 assert.ok(drivePointExcluded({x:30.8,y:0,z:-110.9},basin));
 assert.ok(!drivePointExcluded({x:30.3,y:0,z:-111.9},basin));
 assert.ok(drivePointExcluded({x:25.1,y:0,z:-124},{center:[44,-124],radius:18.75}),'preserved old circle inputs remain compatible');
 assert.ok(!driveAreaAllowed(map,{x:NaN,y:0,z:0}));
});
test('rotated narrow proxies reject their local box without filling the surrounding road',()=>{
 const guarded:DriveAreaMap={...map,excluded:[],barriers:[{center:[0,1,0],half:[2,1,.12],yaw:Math.PI/2,reason:'visible rim'}]};
 assert.ok(!driveAreaAllowed(guarded,{x:.2,y:0,z:1.8}));
 assert.ok(driveAreaAllowed(guarded,{x:1.8,y:0,z:.2}));
});
