import test from 'node:test';
import assert from 'node:assert/strict';
process.env.REALTIME_SERVICE_TOKEN??='isolated-rematch-only';delete process.env.REDIS_URL;
const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
const {createWorld,mapIdentity}=await import('../dist/modules/校园联机服务/src/assets.js');
const {RoomSimulation}=await import('../dist/modules/校园逃生游戏/src/multiplayer/shared/simulation.js');

async function fixture(){
 const room=new CampusRoom(),messages=[],snapshots=[],clients=['host','mate'].map(id=>({auth:{player:{id}},send:(type,data)=>messages.push({id,type,...data})}));
 room.roomId='rematch-control';room._listing={metadata:{phase:'ended'}};room.clients.push(...clients);room.setMetadata=async data=>{room._listing.metadata=data;};room.unlock=async()=>{};
 room.control=async()=>true;room.sendSnapshot=(_client,_full)=>{snapshots.push(room.captureSnapshot());};
 room.sim=new RoomSimulation(room.roomId,await createWorld(),mapIdentity,{mode:'pvp',variant:'tdm',seed:756},()=>{});
 for(const client of clients){const id=client.auth.player.id;room.sim.addPlayer({id,nickname:id,shortId:id});room.sim.loading(id,0,true,true);room.sim.ready(id,true);}
 room.sim.start('host');for(const p of room.sim.players.values())room.sim.loading(p.state.id,p.state.loadingEpoch,true,true);for(let i=0;i<181;i++)room.sim.step();room.sim.finish(true);
 return{room,clients,messages,snapshots,resultId:room.sim.result.resultId,declare(){for(const client of clients)room.rematchCapabilities.declare(client,{rematch:true});},dispose(){room.sim.dispose();room.clock.stop();}};
}
function allowGate(){return new Response(JSON.stringify({enabled:true,reason:'',revision:0}));}

test('same-room rematch cannot reset before settlement finishes and duplicate requests commit only once',async()=>{
 const f=await fixture(),saved=globalThis.fetch;globalThis.fetch=async()=>allowGate();let release;
 f.declare();f.room.persistSettlement=()=>new Promise(resolve=>{release=resolve;});
 try{const first=f.room.requestRematch(f.clients[0],{resultId:f.resultId}),duplicate=f.room.requestRematch(f.clients[1],{resultId:f.resultId});assert.equal(first,duplicate);await new Promise(setImmediate);
  assert.equal(f.room.sim.phase,'ended');assert.equal(f.room.sim.round,0);release(true);await first;
  assert.equal(f.room.sim.phase,'lobby');assert.equal(f.room.sim.round,1);assert.equal(f.room.sim.players.get('host').state.ready,false);assert.equal(f.room.sim.players.get('mate').state.ready,false);assert.equal(f.snapshots.length,2);
  await f.room.requestRematch(f.clients[0],{resultId:f.resultId});assert.equal(f.room.sim.round,1);assert.equal(f.messages.length,0);
 }finally{globalThis.fetch=saved;f.dispose();}
});

test('old Godot/unknown capability remains in the completed match and receives no broken phase transition',async()=>{
 const f=await fixture();try{f.room.persistedResultId=f.resultId;f.room.rematchCapabilities.declare(f.clients[0],{rematch:true});
  assert.equal(f.room.captureSnapshot().rematchAvailable,false);assert.equal(f.room.captureSnapshot().rematchStatus,'unsupported');
  await f.room.requestRematch(f.clients[0],{resultId:f.resultId});assert.equal(f.room.sim.phase,'ended');assert.equal(f.room.sim.round,0);assert.equal(f.messages.at(-1).code,'REMATCH_UNSUPPORTED');
 }finally{f.dispose();}
});

test('leave, drop or capability reset while awaiting settlement cannot mutate a stale room',async()=>{
 for(const change of ['leave','drop','reset']){const f=await fixture(),saved=globalThis.fetch;globalThis.fetch=async()=>allowGate();f.declare();let release;f.room.persistSettlement=()=>new Promise(resolve=>{release=resolve;});
  try{const work=f.room.requestRematch(f.clients[0],{resultId:f.resultId});await new Promise(setImmediate);
   if(change==='leave'){f.room.clients.splice(1,1);f.room.sim.removePlayer('mate');}else if(change==='drop'){f.room.sim.disconnect('mate');f.room.rematchCapabilities.forget(f.clients[1]);}else f.room.rematchCapabilities.forget(f.clients[1]);
   release(true);await work;
   // A true departure permits a smaller future party, but a stale connection list cannot opt in.
   if(change==='leave')assert.equal(f.room.sim.phase,'lobby');else assert.equal(f.room.sim.phase,'ended');
   if(change==='drop')assert.ok(f.room.sim.players.get('mate').disconnectLeft>0);
  }finally{globalThis.fetch=saved;f.dispose();}
 }
});

test('settlement failure leaves original results and room intact; retry can succeed without duplicate closure',async()=>{
 const f=await fixture(),saved=globalThis.fetch;globalThis.fetch=async()=>allowGate();f.declare();let savedResult=false;f.room.persistSettlement=async()=>savedResult;
 try{await f.room.requestRematch(f.clients[0],{resultId:f.resultId});assert.equal(f.room.sim.phase,'ended');assert.equal(f.room.sim.result.resultId,f.resultId);assert.equal(f.messages.at(-1).code,'RESULT_SAVE_PENDING');
  savedResult=true;await f.room.requestRematch(f.clients[0],{resultId:f.resultId});assert.equal(f.room.sim.phase,'lobby');assert.equal(f.room.sim.round,1);
 }finally{globalThis.fetch=saved;f.dispose();}
});
