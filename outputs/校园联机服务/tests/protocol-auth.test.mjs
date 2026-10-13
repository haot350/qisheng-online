import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PROTOCOL_VERSION} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/protocol.js';

test('direct room admission rejects the old snapshot protocol before reading or consuming its one-time grant',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'qisheng-auth-unit-'));
 const saved={REALTIME_SERVICE_TOKEN:process.env.REALTIME_SERVICE_TOKEN,DATA_DIRECTORY:process.env.DATA_DIRECTORY,REDIS_URL:process.env.REDIS_URL};
 process.env.REALTIME_SERVICE_TOKEN='isolated-unit-test-fixture-only';
 process.env.DATA_DIRECTORY=directory;
 delete process.env.REDIS_URL;
 try{
  const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
  assert.equal(PROTOCOL_VERSION,'campus-mp-0.7.1');
  let grantReads=0,mapReads=0;
  const options={protocolVersion:'campus-mp-0.7.0',get map(){mapReads++;throw Error('must not inspect old-protocol map');},get grant(){grantReads++;throw Error('must not consume old-protocol grant');}};
  await assert.rejects(CampusRoom.prototype.onAuth.call({roomId:'isolated-auth-test'},null,options),{message:'MAP_OR_PROTOCOL_MISMATCH'});
  assert.equal(mapReads,0);
  assert.equal(grantReads,0,'an incompatible client cannot spend a valid one-time admission grant');
 }finally{
  for(const [name,value]of Object.entries(saved)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  await rm(directory,{recursive:true,force:true});
 }
});

test('direct admission cannot use a cancelled queue grant and atomically claims a live one',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'qisheng-cancel-auth-unit-'));
 process.env.REALTIME_SERVICE_TOKEN??='isolated-unit-test-fixture-only';process.env.DATA_DIRECTORY=directory;delete process.env.REDIS_URL;
 const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
 const {mapIdentity}=await import('../dist/modules/校园联机服务/src/assets.js');
 const {put,get,remove}=await import('../dist/modules/校园联机服务/src/store.js');
 const queueId='auth-cancel-unit',player={id:'auth-player-unit',nickname:'测试',shortId:'AUTH'},fake={roomId:'isolated-auth-test',sim:{options:{mode:'pvp',variant:'tdm'},players:new Map()}};
 const queueKey='campus:queue:'+queueId,grantKey='campus:grant:auth-unit-grant',lock='campus:player-queue:'+player.id;
 const auth={player,mode:'pvp',variant:'tdm',roomId:fake.roomId,queueId},options={protocolVersion:PROTOCOL_VERSION,map:mapIdentity,grant:'auth-unit-grant'};
 const savedFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({enabled:true,reason:'',revision:0}),{status:200});
 try{
  await put(queueKey,JSON.stringify({status:'cancelled',grant:options.grant}),30);await put(grantKey,JSON.stringify(auth),30);
  await assert.rejects(CampusRoom.prototype.onAuth.call(fake,null,options),{message:'QUEUE_CANCELLED'});
  await put(queueKey,JSON.stringify({status:'ready',grant:options.grant}),30);await put(grantKey,JSON.stringify(auth),30);await put(lock,'newer-queue',30);
  assert.deepEqual(await CampusRoom.prototype.onAuth.call(fake,null,options),auth);
  assert.equal(JSON.parse(await get(queueKey)).admitted,true);assert.equal(await get(lock),'newer-queue','admitting an old queue must preserve a newer request');
  await put(grantKey,JSON.stringify(auth),30);
  await assert.rejects(CampusRoom.prototype.onAuth.call(fake,null,options),{message:'QUEUE_CANCELLED'},'an already claimed queue cannot admit a second client');
 }finally{globalThis.fetch=savedFetch;await Promise.all([remove(queueKey),remove(grantKey),remove(lock)]);await rm(directory,{recursive:true,force:true});}
});

test('original seat reconnect bypasses new admission checks while a new entrant uses real room variant',async()=>{
 const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
 const {mapIdentity}=await import('../dist/modules/校园联机服务/src/assets.js');
 const {put,remove}=await import('../dist/modules/校园联机服务/src/store.js');
 const savedFetch=globalThis.fetch;let requests=0,restored=null,snapshots=0;
 const fake={rewindWindows:new Map(),roomId:'gate-room',sim:{options:{mode:'pvp',variant:'ffa'},players:new Map(),reconnect:id=>{restored=id;}},sendSnapshot:()=>snapshots++};
 globalThis.fetch=async url=>{requests++;assert.ok(String(url).endsWith('entry=escape-ffa'));return new Response(JSON.stringify({enabled:false,reason:'暂停开放。',revision:5}),{status:200});};
 try{
  CampusRoom.prototype.onReconnect.call(fake,{auth:{player:{id:'existing-seat'}}});
  assert.equal(restored,'existing-seat');assert.equal(snapshots,1);assert.equal(requests,0);
  await put('campus:grant:gate-grant',JSON.stringify({player:{id:'new-player'},mode:'pvp',variant:'tdm',roomId:'gate-room',queueId:'new-queue'}),30);
  await assert.rejects(CampusRoom.prototype.onAuth.call(fake,null,{protocolVersion:PROTOCOL_VERSION,map:mapIdentity,grant:'gate-grant'}),{message:'暂停开放。'});
  assert.equal(requests,1);assert.equal(fake.sim.players.size,0);
 }finally{globalThis.fetch=savedFetch;await remove('campus:grant:gate-grant');}
});

test('a closed mode refuses room creation before world allocation and failed creation can dispose safely',async()=>{
 const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
 const savedFetch=globalThis.fetch,empty=()=>new Map();let closed=false;
 const fake={roomId:'closed-create',clients:[],disconnect:async()=>{closed=true;},replication:empty(),startRequests:empty(),rewindWindows:empty(),rewindLogAt:empty(),sendBudgets:empty(),spectators:empty(),resyncAt:empty(),latencyChallenges:empty()};
 globalThis.fetch=async()=>new Response(JSON.stringify({enabled:false,reason:'暂不开放。',revision:6}),{status:200});
 try{await assert.rejects(CampusRoom.prototype.onCreate.call(fake,{options:{mode:'pvp',variant:'ffa'}}),e=>e.code==='MODE_DISABLED');assert.equal(fake.sim,undefined);await CampusRoom.prototype.onDispose.call(fake);assert.equal(closed,false);}
 finally{globalThis.fetch=savedFetch;}
});
