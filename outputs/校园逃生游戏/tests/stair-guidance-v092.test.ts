import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stairGuideForRoute} from '../src/escape-stair-guidance.ts';
import type {MapManifest,Vec3} from '../src/types.ts';
const stairs:MapManifest['stairRoutes']=[{core:'west',from_floor:1,to_floor:2,points:[[0,0,0],[0,1,1],[0,2,2],[0,3,3]]},{core:'east',from_floor:1,to_floor:2,points:[[20,0,0],[20,1,1],[20,2,2],[20,3,3]]}];
test('stair choice follows the validated route rather than the nearest stair',()=>{const route:Vec3[]=[[10,0,-1],[20,0,0],[20,1,1],[20,2,2],[20,3,3],[24,3,3]],guide=stairGuideForRoute([0,0,-1],route,stairs,1,2);assert.equal(guide?.core,'east');assert.equal(guide?.label,'东侧楼梯');assert.equal(guide?.direction,'up');assert.ok((guide?.distance??0)>20);});
test('missing or same-level routes do not invent stairs, crossing below a flight is insufficient',()=>{assert.equal(stairGuideForRoute([0,0,-1],[],stairs,0,2),null);assert.equal(stairGuideForRoute([0,0,-1],[[0,0,0],[0,0,3]],stairs,1,2),null);assert.equal(stairGuideForRoute([0,0,-1],[[0,0,0],[0,3,3]],stairs,1,1),null);});
test('descending route reports the matching direction',()=>{const guide=stairGuideForRoute([0,3,4],[[0,3,3],[0,2,2],[0,1,1],[0,0,0]],stairs,2,1);assert.equal(guide?.direction,'down');assert.equal(guide?.core,'west');});
