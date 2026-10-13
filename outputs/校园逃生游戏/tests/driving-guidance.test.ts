import {test} from 'node:test';
import assert from 'node:assert/strict';
import map from '../public/map/drive-v122.json' with {type:'json'};
import {configureDrivingStart,DRIVING_STARTS,drivingAreaHints} from '../src/driving-guidance.ts';
import type {DriveMap} from '../src/vehicle-physics.ts';
const driveMap=map as DriveMap;
test('a validated nearby driving start is a runtime copy and unsafe candidates are rejected',()=>{
 const original=JSON.stringify(driveMap),seen:number[][]=[];
 const configured=configureDrivingStart(driveMap,(point)=>{seen.push([...point]);return seen.length===2?[point[0],.1,point[2]]:null;});
 assert.notEqual(configured,driveMap);assert.equal(JSON.stringify(driveMap),original);
 assert.deepEqual(configured.spawn,[DRIVING_STARTS[1].position[0],.1,DRIVING_STARTS[1].position[2]]);assert.equal(configured.spawnYaw,Math.PI/2);
 assert.throws(()=>configureDrivingStart(driveMap,()=>null),/驾驶起点/);
});
test('area directions contain broad static areas and never carry a live NPC identity or position',()=>{
 const hints=drivingAreaHints(driveMap.npcRegions!,[-77,.075,-88],Math.PI/2);
 assert.deepEqual(hints.map(h=>h.name),['运动区','食堂','宿舍']);assert.ok(hints[0].angle<.3&&hints[0].angle>0);
 for(const hint of hints){assert.deepEqual(Object.keys(hint).sort(),['angle','id','name']);assert.ok(Number.isFinite(hint.angle));assert.ok(Math.abs(hint.angle)<=Math.PI);}
 assert.deepEqual(drivingAreaHints([],[-77,0,-88],0),[]);
});
