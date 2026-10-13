import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseDrivingRespawn,RESPAWN_RULES} from '../src/driving-respawn.ts';
import {DrivingPatrol} from '../src/driving-ai.ts';
import type {Vec3} from '../src/types.ts';
const points:Vec3[]=[[0,0,0],[0,0,12],[0,0,20],[0,0,32],[0,0,48]];
test('regional respawn never relaxes distance, offscreen, clearance or last-location requirements',()=>{
 assert.equal(RESPAWN_RULES.distance,20);
 assert.deepEqual(chooseDrivingRespawn(points,points[4],[0,0,0],p=>p[2]!==20,p=>p[2]!==32,()=>0),null);
 assert.deepEqual(chooseDrivingRespawn(points,points[4],[0,0,0],()=>true,()=>true,()=>0),points[2]);
 assert.equal(chooseDrivingRespawn(points,points[0],[0,0,24],()=>false,()=>true,()=>0),null);
 assert.equal(chooseDrivingRespawn(points,points[0],[0,0,24],()=>true,()=>false,()=>0),null);
 assert.deepEqual(chooseDrivingRespawn(points,points[0],[0,0,24],()=>true,()=>true,()=>.99),points[4]);
});
test('reentry starts a fresh local patrol without knowledge of the car',()=>{
 const brain=new DrivingPatrol({npcId:0,id:'test',label:'test',home:[0,0,24],spawnPoints:points,respawnPoints:points,patrolPoints:points},()=>.5);
 brain.update(.1,[0,0,24],[0,0,24],{sees:true,hears:true});assert.equal(brain.state,'chase');
 brain.reenter(points[4]);assert.equal(brain.state,'patrol');assert.equal(brain.sees,false);assert.equal(brain.target,null);assert.equal(brain.memory,0);assert.equal(brain.canSense([0,0,24]),false);
 brain.update(1.3,points[4],[0,0,24]);assert.equal(brain.canSense([0,0,24]),true);
});
