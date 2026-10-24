import test from 'node:test';
import assert from 'node:assert/strict';
import {lobbyUIState} from '../src/multiplayer/lobby-ui-state.ts';
const base={status:'lobby',currentRoom:null};
const room={players:[{id:'me'}]};

test('pending join, queue and reconnect states never expose new admission or equipment',()=>{
 for(const status of ['connecting','queued','reconnecting'])for(const currentRoom of [null,room]){
  const state=lobbyUIState({...base,status,currentRoom},'me');
  assert.equal(state.pending,true);assert.equal(state.showBrowser,false);assert.equal(state.showRoom,false);assert.equal(state.canCancel,true);
 }
});
test('admission checking and leaving have separate cancellation rules',()=>{
 const checking=lobbyUIState({...base,status:'reconnecting',errorCode:'ADMISSION_CHECKING'},'me');
 assert.equal(checking.phase,'checking');assert.equal(checking.canCancel,true);assert.equal(checking.showBrowser,false);
 const leaving=lobbyUIState({...base,status:'connecting',errorCode:'LEAVING',currentRoom:room},'me');
 assert.equal(leaving.phase,'leaving');assert.equal(leaving.canCancel,false);assert.equal(leaving.showRoom,false);
 assert.equal(lobbyUIState({...base,status:'reconnecting',errorCode:'ADMISSION_UNCERTAIN'},'me').phase,'checking');
});
test('failed retained admissions offer recovery rather than new room admission',()=>{
 for(const [errorCode,phase] of [['ADMISSION_UNCERTAIN','admission-error'],['RECONNECT_RETRY','reconnect-error']] as const){
  const state=lobbyUIState({...base,status:'error',errorCode},'me');
  assert.equal(state.phase,phase);assert.equal(state.pending,false);assert.equal(state.showBrowser,false);assert.equal(state.showRoom,false);
 }
 assert.equal(lobbyUIState({...base,status:'error',errorCode:'RECONNECT_EXPIRED'},'me').showBrowser,true);
});
test('room preparation requires a current nondeparted seat for this identity',()=>{
 assert.equal(lobbyUIState({...base,currentRoom:room},'me').showRoom,true);
 for(const playerId of ['other',null])assert.equal(lobbyUIState({...base,currentRoom:room},playerId).phase,'awaiting-seat');
 assert.equal(lobbyUIState({...base,currentRoom:{players:[{id:'me',departed:true}]}},'me').showRoom,false);
 assert.equal(lobbyUIState({...base,currentRoom:room,status:'error'},'me').showRoom,false);
});
test('map and identity errors have dedicated recovery rather than a connection retry',()=>{
 assert.equal(lobbyUIState({...base,status:'error',errorCode:'MAP_MISMATCH'},'me').phase,'map-error');
 assert.equal(lobbyUIState({...base,status:'error',errorCode:'IDENTITY_CHANGED'},'me').phase,'identity-error');
 assert.equal(lobbyUIState({...base,status:'error',errorCode:'AUTH_REQUIRED'},'me').phase,'identity-error');
 assert.equal(lobbyUIState({...base,status:'error',errorCode:'NETWORK'},'me').showBrowser,true);
});
