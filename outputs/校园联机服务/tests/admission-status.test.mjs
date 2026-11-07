import test from 'node:test';
import assert from 'node:assert/strict';
import {admissionSummary} from '../dist/modules/校园联机服务/src/admission-status.js';
const state=()=>({maintenance:false,draining:false,memAvailable:1073741824,cpuPercent:70,workers:[{healthy:true,rooms:0,players:0}],maxRooms:1,maxPlayers:24,queued:3});
test('status acceptance matches the existing boundary and does not confuse process health with admission',()=>{
 assert.deepEqual(admissionSummary(state()),{canCreate:true,reason:'ready',queued:3});
 for(const change of [{memAvailable:1073741823},{cpuPercent:70.01},{workers:[{healthy:false,rooms:0,players:0}]}])assert.equal(admissionSummary({...state(),...change}).reason,'busy');
 assert.equal(admissionSummary({...state(),workers:[]}).reason,'warming');
 assert.equal(admissionSummary({...state(),maintenance:true}).reason,'maintenance');
 assert.equal(admissionSummary({...state(),draining:true}).canCreate,false);
 assert.equal(admissionSummary({...state(),workers:[{healthy:true,rooms:1,players:12}]}).reason,'capacity');
 assert.equal(admissionSummary({...state(),workers:[{healthy:true,rooms:0,players:24}]}).reason,'capacity');
});
