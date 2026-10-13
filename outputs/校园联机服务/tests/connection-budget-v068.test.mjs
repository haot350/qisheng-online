import test from 'node:test';
import assert from 'node:assert/strict';
import {QueueLongPoll} from '../dist/modules/校园联机服务/src/queue-poll.js';
import {SnapshotSendBudget} from '../dist/modules/校园联机服务/src/snapshot-budget.js';
import {QueueRecords} from '../dist/modules/校园联机服务/src/queue.js';
import {PROTOCOL_VERSION} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/protocol.js';
import {WireDecoder} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/wire.js';
import {getMessageBytes,Protocol} from '@colyseus/core';

const waiting=id=>({queueId:id,tokenHash:'test-'+id,player:{id,nickname:id,shortId:id},options:{mode:'pvp'},createdAt:1000,status:'waiting',create:true,reservation:null});
function pollingFixture(limit=256){
 let now=1000;const values=new Map(),batches=[];
 const store={get:async key=>values.get(key)??null,put:async(key,value)=>{values.set(key,value);},remove:async key=>{values.delete(key);},compareSwap:async(key,before,next)=>{if(values.get(key)!==before)return false;if(next===null)values.delete(key);else values.set(key,next);return true;},queueRemove:async()=>{}};
 const readMany=async keys=>{batches.push([...keys]);return keys.map(k=>values.get(k)??null);};
 const poller=new QueueLongPoll(readMany,60000,limit,()=>now),records=new QueueRecords(store,()=>now);
 const add=id=>{const row=waiting(id),raw=JSON.stringify(row);values.set('campus:queue:'+id,raw);values.set('campus:player-queue:'+id,id);return{row,raw};};
 return{values,batches,poller,readMany,records,add,advance:ms=>{now+=ms;}};
}
test('256 long polls share one ordered store batch and only ready/cancelled/expired entries finish',async()=>{
 const f=pollingFixture(),done=[];
 try{
  for(let i=0;i<256;i++){const{raw}=f.add(String(i));f.poller.wait(String(i),raw,8000).done.then(()=>done.push(i));}
  await f.poller.poll();assert.equal(f.batches.length,1);assert.equal(f.batches[0].length,256);assert.equal(done.length,0);
  f.values.set('campus:queue:7',JSON.stringify({...waiting('7'),status:'ready',reservation:{sessionId:'test-seat'}}));
  f.values.set('campus:queue:8',JSON.stringify({...waiting('8'),status:'cancelled'}));f.values.delete('campus:queue:9');
  await f.poller.poll();assert.deepEqual(done,[7,8,9]);assert.equal(f.poller.size,253);assert.equal(f.poller.diagnostics.batchRequests,2);
 }finally{f.poller.close();}
});
test('waiter limit, eight-second cap and superseded HTTP cleanup preserve the current waiter',async()=>{
 const f=pollingFixture(2),a=f.add('a'),b=f.add('b'),c=f.add('c');let oldDone=false,newDone=false;
 try{
  const old=f.poller.wait('a',a.raw,50000);old.done.then(()=>oldDone=true);f.poller.wait('b',b.raw,8000);const excess=f.poller.wait('c',c.raw,8000);assert.equal(excess.accepted,false,'HTTP route exposes a bounded retryAfterMs instead of asking this client to spin');await excess.done;
  assert.equal(f.poller.size,2);const current=f.poller.wait('a',a.raw,50000);current.done.then(()=>newDone=true);await old.done;assert.equal(oldDone,true);
  old.cancel();assert.equal(f.poller.size,2,'late response.close from the prior HTTP poll cannot clear the new one');
  f.advance(7999);await f.poller.poll();assert.equal(newDone,false);f.advance(1);await f.poller.poll();await current.done;assert.equal(newDone,true);assert.equal(f.poller.size,0);
 }finally{f.poller.close();}
});
test('another worker reservation and cancellation are observed from the shared store without a local wake',async()=>{
 const f=pollingFixture(),a=f.add('a'),b=f.add('b'),other=new QueueLongPoll(f.readMany,60000,256,()=>1000);
 try{
  const first=other.wait('a',a.raw,8000),second=other.wait('b',b.raw,8000);let resolved=0;first.done.then(()=>resolved++);second.done.then(()=>resolved++);
  await other.poll();assert.equal(resolved,0);
  await f.records.reserve('a',async()=>({grant:'qa-grant',reservation:{sessionId:'qa-seat'},discard:async()=>{}}));await f.records.cancel('b',b.row.tokenHash);
  await other.poll();await Promise.all([first.done,second.done]);assert.equal(resolved,2);assert.equal(other.size,0);assert.equal((await f.records.read('a')).status,'ready');assert.equal((await f.records.read('b')).status,'cancelled');
 }finally{f.poller.close();other.close();}
});
test('local wake completes shared waiters early while close during in-flight MGET never revives them',async()=>{
 const f=pollingFixture(),a=f.add('a'),handle=f.poller.wait('a',a.raw,8000);
 try{f.values.set('campus:queue:a',JSON.stringify({...a.row,status:'cancelled'}));f.poller.wake();await handle.done;assert.equal(f.poller.size,0);assert.equal(f.batches.length,1);}finally{f.poller.close();}
 let finish;const blocker=new QueueLongPoll(()=>new Promise(resolve=>{finish=resolve;}),60000);const h=blocker.wait('a',a.raw,8000),poll=blocker.poll();h.cancel();await h.done;finish([a.raw]);await poll;assert.equal(blocker.size,0);blocker.close();
});
test('store errors and token replacement release a bounded batch without leaking another reservation',async()=>{
 const raw=JSON.stringify(waiting('a')),bad=new QueueLongPoll(async()=>{throw Error('store unavailable');},60000);const h=bad.wait('a',raw,8000);await bad.poll();await h.done;assert.equal(bad.size,0);bad.close();
 const f=pollingFixture(),a=f.add('a');try{const handle=f.poller.wait('a',a.raw,8000);f.values.set('campus:queue:a',JSON.stringify({...a.row,tokenHash:'different'}));await f.poller.poll();await handle.done;assert.equal(f.poller.size,0);}finally{f.poller.close();}
});
test('a stalled store read cannot hold HTTP waiters or prevent a later polling batch indefinitely',async()=>{
 const raw=JSON.stringify(waiting('a'));let calls=0;const poller=new QueueLongPoll(()=>{calls++;return calls===1?new Promise(()=>{}):Promise.resolve([JSON.stringify({...waiting('b'),status:'ready'})]);},60000,256,Date.now,20);
 try{const first=poller.wait('a',raw,8000);await poller.poll();await first.done;assert.equal(poller.size,0);const second=poller.wait('b',JSON.stringify(waiting('b')),8000);await poller.poll();await second.done;assert.equal(calls,2);assert.equal(poller.size,0);}finally{poller.close();}
});
test('eight-second waiter deadline is independent of an in-flight store read',async()=>{
 const raw=JSON.stringify(waiting('a'));let finish;const poller=new QueueLongPoll(()=>new Promise(resolve=>{finish=resolve;}),60000,256,Date.now,500);
 try{const handle=poller.wait('a',raw,20),pending=poller.poll();await handle.done;assert.equal(poller.size,0);finish([raw]);await pending;assert.equal(poller.size,0);}finally{poller.close();}
});
test('full requests obey high water and resume only after low water with a single pending baseline',()=>{
 const budget=new SnapshotSendBudget();assert.deepEqual(budget.admit(0),{forceFull:false});
 assert.equal(budget.admit(131073,true),null);for(let i=0;i<20;i++)assert.equal(budget.admit(70000,true),null);
 assert.equal(budget.pendingBaseline,true);assert.deepEqual(budget.admit(32768),{forceFull:true});budget.committed();assert.equal(budget.pendingBaseline,false);assert.deepEqual(budget.admit(0),{forceFull:false});
 assert.equal(budget.admit(Infinity),null,'invalid water readings fail closed');assert.equal(budget.admit(40000),null);assert.deepEqual(budget.admit(0),{forceFull:true});
});
function player(id,team,position){return{id,nickname:id,shortId:id,avatar:'campus-a',team,ready:true,rankConsent:false,connected:true,loading:false,loadingEpoch:1,position,yaw:0,pitch:0,velocity:[0,0,0],grounded:true,crouched:false,life:'alive',health:100,stamina:100,weapon:'m4a1',primaryWeapon:'m4a1',ammo:30,reserve:90,aim:false,sprinting:false,sliding:false,ack:1,generation:1,kills:0,deaths:0,assists:0,downs:0,headshots:0,damageTaken:0,reviveLeft:0,respawnLeft:0,protectionLeft:0,carryingTask:null,ping:0,smokes:2,appliedInputTick:1,actionAck:1,inputResync:false};}
function state(){return{protocolVersion:PROTOCOL_VERSION,roomId:'budget-unit',inviteCode:'QA',hostId:'self',mode:'pvp',variant:'tdm',difficulty:'standard',phase:'playing',tick:60,elapsed:1,remaining:599,map:{sourceVersion:'qa',collisionHash:'c',navigationHash:'n',manifestHash:'m'},players:[player('self','blue',[0,0,0]),player('other','red',[0,0,-8])],npcs:[],tasks:[],drops:[],supplies:[],smokes:[],events:[],eventSerial:0,maxPlayers:8,occupancy:2,startedPlayers:2,extraction:{available:false,position:[0,0,0],progress:0,duration:20,blocked:null},teamScores:{blue:0,red:0},pauseVote:null,pauseLeft:0,pauseUses:0,countdown:0,result:null,maintenance:false};}
test('actual room sender does not advance wire state/events while blocked and sends the latest baseline once drained',async()=>{
 process.env.REALTIME_SERVICE_TOKEN??='isolated-connection-test-only';delete process.env.REDIS_URL;
 const{CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
 let snapshot=state(),events=[];const messages=[];
 const room={rewindWindows:new Map(),rewindFor:CampusRoom.prototype.rewindFor,sim:{snapshot:()=>structuredClone(snapshot),events,world:{visible:()=>true}},sendBudgets:new Map(),replication:new Map(),spectators:new Map(),instrumented:new WeakSet(),wireBytes:0,skippedSnapshots:0,projectionMetrics:[]};
 const client={auth:{player:{id:'self'}},ref:{bufferedAmount:0},raw(){},send(type,message){messages.push(message);this.raw(getMessageBytes.raw(Protocol.ROOM_DATA,type,message));}};
 const send=(full=false)=>CampusRoom.prototype.sendSnapshot.call(room,client,full),decoder=new WireDecoder();
 send(true);decoder.accept(messages[0]);const initialSequence=messages[0].seq,initialBytes=room.wireBytes;
 snapshot.tick=63;snapshot.players[0].ammo=29;client.ref.bufferedAmount=160000;send(false);
 snapshot.tick=66;snapshot.eventSerial=1;snapshot.players[0].ammo=26;events=[{serial:1,tick:65,type:'hit',actorId:'self',targetId:'other',position:[0,1,-8],data:{damage:25}}];room.sim.events=events;
 for(let i=0;i<8;i++)send(true);assert.equal(messages.length,1);assert.equal(room.wireBytes,initialBytes);assert.equal(room.replication.get('self').diagnostics.full,1);
 client.ref.bufferedAmount=70000;send();assert.equal(messages.length,1,'hysteresis avoids sending into a half-drained socket');
 client.ref.bufferedAmount=0;send();assert.equal(messages.length,2);assert.equal(messages[1].kind,'full');assert.equal(messages[1].seq,initialSequence+1);
 const recovered=decoder.accept(messages[1]).snapshot;assert.equal(recovered.tick,66);assert.equal(recovered.players[0].ammo,26);assert.equal(recovered.events.length,1,'undelivered event is filtered only at actual baseline emission');
 snapshot.tick=69;send();assert.equal(messages.length,3);assert.equal(messages[2].kind,'delta');assert.equal(messages[2].events.length,0,'the baseline is committed once, without replaying its events');assert.equal(room.skippedSnapshots,10);
});
