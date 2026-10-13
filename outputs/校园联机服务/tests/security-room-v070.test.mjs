import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
process.env.REALTIME_SERVICE_TOKEN??='isolated-rewind-test-only';delete process.env.REDIS_URL;
const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');

test('the actual room receive boundary bounds client history independently per connection',()=>{
 const forwarded=[],warnings=[],oldWarn=console.warn;
 const room={roomId:'qa-rewind',sim:{tick:120,input:(id,commands)=>forwarded.push({id,commands})},rewindWindows:new Map(),rewindLogAt:new Map(),rewindsAccepted:0,rewindsRejected:0,rewindFor:CampusRoom.prototype.rewindFor};
 const self={auth:{player:{id:'self'}}},other={auth:{player:{id:'other'}}};
 const now=performance.now();room.rewindFor('self').recordSnapshot(100,now-400);room.rewindFor('self').recordSnapshot(120,now);room.rewindFor('self').recordRTT(100);
 console.warn=value=>warnings.push(value);
 try{
  CampusRoom.prototype.receiveInput.call(room,self,{commands:[{seq:1,renderTick:111,fire:true},{seq:2,renderTick:-999,fire:true},{seq:3,renderTick:9000,fire:true},{seq:4,renderTick:111,fire:false},{seq:5,renderTick:111,fire:true}]});
  assert.equal(forwarded[0].commands.length,4);assert.equal(forwarded[0].commands[0].renderTick,111);assert.equal(forwarded[0].commands[1].renderTick,111);assert.equal(forwarded[0].commands[2].renderTick,111);
  assert.equal(room.rewindsRejected,2);assert.equal(warnings.length,1,'invalid timing is recorded once, never an automatic ban');assert.equal(JSON.parse(warnings[0]).reason,'unsent');
  CampusRoom.prototype.receiveInput.call(room,other,{seq:1,renderTick:111,fire:true});assert.equal(forwarded[1].commands[0].renderTick,120,'another identity has no delivered history yet');
  room.rewindWindows.delete('self');CampusRoom.prototype.receiveInput.call(room,self,{seq:6,renderTick:111,fire:false});assert.equal(forwarded[2].commands[0].renderTick,120,'a reconnected socket must receive a new baseline before using old history');
  room.rewindFor('self').recordSnapshot(120,performance.now());CampusRoom.prototype.receiveInput.call(room,self,{seq:7,renderTick:111,fire:false});assert.equal(forwarded[3].commands[0].renderTick,120,'the new baseline never grants the old socket history');
 }finally{console.warn=oldWarn;}
});
