import test from 'node:test';
import assert from 'node:assert/strict';
process.env.REALTIME_SERVICE_TOKEN??='isolated-loading-test-only';delete process.env.REDIS_URL;
const {PlayerMessageBudget}=await import('../dist/modules/校园联机服务/src/message-budget.js');
const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
const {createWorld,mapIdentity}=await import('../dist/modules/校园联机服务/src/assets.js');
const {RoomSimulation}=await import('../dist/modules/校园逃生游戏/src/multiplayer/shared/simulation.js');

test('valid30Hz input and changing scene readiness have independent bounded quotas',()=>{
 const budget=new PlayerMessageBudget(),client={};for(let i=0;i<600;i++){const at=i*1000/30;assert(budget.take(client,'input',at));assert(budget.take(client,'loading',at));if(i%30===0){assert(budget.take(client,'latency',at));assert(budget.take(client,'latency-ack',at));}}
});
test('message bursts remain bounded per client and backwards time cannot refill them',()=>{
 const budget=new PlayerMessageBudget(),a={},b={};for(let i=0;i<45;i++)assert(budget.take(a,'loading',1000));assert.equal(budget.take(a,'loading',1000),false);assert.equal(budget.take(a,'loading',0),false);assert(budget.take(a,'input',1000));assert(budget.take(b,'loading',1000));assert(budget.take(a,'loading',1100));for(let i=0;i<30;i++)assert(budget.take(a,'preset',1100));assert.equal(budget.take(a,'ready',1100),false);budget.release(a);assert(budget.take(a,'ready',1100));assert(budget.retry(a,1100));assert.equal(budget.retry(a,1200),false);assert(budget.retry(a,2100));
});
test('actual room overload freezes the same epoch, requests a retry and can safely resume from an exact ready check',async()=>{
 const room=new CampusRoom(),messages=[],client={auth:{player:{id:'p0'}},send:(type,data)=>messages.push({type,...data})};room.sim=new RoomSimulation('loading-budget',await createWorld(),mapIdentity,{mode:'pvp',variant:'ffa'});
 let seq=0;const command=(epoch=0,extra={})=>({map:mapIdentity,epoch,generation:room.sim.players.get('p0').state.generation,seq:++seq,cancelActionThrough:0,yaw:0,pitch:0,ready:true,scopeReady:true,...extra});
 try{room.sim.addPlayer({id:'p0',nickname:'A',shortId:'A'});room.receiveLoading(client,command());assert.equal(room.sim.players.get('p0').state.loading,false);
  for(let i=0;i<100;i++)room.receiveLoading(client,command());assert.equal(room.sim.players.get('p0').state.loading,true);assert.equal(room.sim.players.get('p0').scopeReady,false);assert.deepEqual(messages.filter(m=>m.type==='loading-retry').map(m=>({epoch:m.epoch,retryAfterMs:m.retryAfterMs})),[{epoch:0,retryAfterMs:100}]);
  room.messageBudgets.release(client);room.receiveLoading(client,command());assert.equal(room.sim.players.get('p0').state.loading,false);assert.equal(room.sim.players.get('p0').scopeReady,true);
  room.sim.loading('p0',1,false,false);room.receiveLoading(client,command());assert.equal(room.sim.players.get('p0').state.loading,true,'a delayed old-epoch retry must not unlock a relocated scene');room.receiveLoading(client,command(1,{map:{...mapIdentity,visionHash:'wrong'}}));assert.equal(room.sim.players.get('p0').state.loading,true);assert.equal(messages.at(-1).code,'MAP_MISMATCH');
 }finally{room.sim.dispose();room.clock.stop();}
});
