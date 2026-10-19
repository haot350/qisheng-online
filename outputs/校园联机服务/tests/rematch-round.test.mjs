import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,mapIdentity} from '../dist/modules/校园联机服务/src/assets.js';
import {RoomSimulation} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/simulation.js';
import {RecipientReplicator,WireDecoder} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/wire.js';
import {RematchCapabilities} from '../dist/modules/校园联机服务/src/rematch-gate.js';

async function fixture(mode='pvp'){
 const sim=new RoomSimulation('rematch-test',await createWorld(),mapIdentity,{mode,variant:'tdm',maxPlayers:4,seed:6242,difficulty:'standard'},()=>{});
 for(let i=0;i<2;i++){sim.addPlayer({id:'p'+i,nickname:'Player '+i,shortId:'P'+i});sim.loading('p'+i,0,true,true);sim.ready('p'+i,true);sim.consent('p'+i,true);}
 assert.equal(sim.start('p0'),true);for(const p of sim.players.values())sim.loading(p.state.id,p.state.loadingEpoch,true,true);
 for(let i=0;i<181;i++)sim.step();assert.equal(sim.phase,'playing');return sim;
}
function confirm(sim){for(const p of sim.players.values()){sim.loading(p.state.id,p.state.loadingEpoch,true,true);sim.ready(p.state.id,true);}}

test('new match retains equipment/team, advances input generation and never auto-readies or rewinds transport time',async()=>{
 const sim=await fixture();try{
  const p=sim.players.get('p0');p.state.life='respawning';sim.loadout('p0','awm','tactical-a','blue');p.state.kills=7;p.state.assists=2;p.gadgets.grenades=2;p.gadgets.cardsUntil=99;
  p.timeline.enqueue({seq:1,tick:sim.tick,targetTick:sim.tick+2,inputEpoch:0,moveX:0,moveY:1,yaw:0,pitch:0,fire:true,aim:false,sprint:false,crouch:false,actionIds:[{id:1,type:'jump'}]},sim.tick);
  sim.finish(true);const old=sim.result,oldTick=sim.tick,oldSerial=sim.eventSerial,generation=p.state.generation,epoch=p.timeline.epoch;
  assert.equal(sim.returnToLobby('p0',old.resultId),true);assert.equal(sim.phase,'lobby');assert.equal(sim.round,1);assert.equal(sim.tick,oldTick);assert.ok(sim.eventSerial>oldSerial);
  assert.equal(p.primary,'awm');assert.equal(p.state.avatar,'tactical-a');assert.equal(p.state.team,'blue');assert.equal(p.state.kills,0);assert.equal(p.state.assists,0);assert.equal(p.gadgets.grenades,0);assert.equal(p.gadgets.cardsUntil,0);
  assert.equal(p.state.generation,generation+1);assert.equal(p.timeline.epoch,epoch+1);assert.equal(p.timeline.depth,0);assert.equal(p.state.ready,false);assert.equal(p.state.rankConsent,false);assert.equal(p.state.loading,true);assert.equal(sim.world.actors.has('p0'),false);
  assert.equal(sim.start('p0'),false);assert.equal(sim.returnToLobby('p1',old.resultId),false);confirm(sim);assert.equal(sim.start('p0'),true);
  assert.equal(p.timeline.enqueue({seq:p.state.ack+1,tick:sim.tick,targetTick:sim.tick+1,inputEpoch:epoch,moveX:0,moveY:1,yaw:0,pitch:0,fire:true,aim:false,sprint:false,crouch:false},sim.tick),false);
  assert.equal(old.players.find(v=>v.id==='p0').kills,7,'immutable previous result retains its own statistics');
 }finally{sim.dispose();}
});

test('consecutive results have unique IDs and callback is once per round, including stale rematch retries',async()=>{
 const sim=await fixture(),results=[];sim.finishedCallback=r=>results.push(r);
 try{for(let round=0;round<3;round++){
  if(round){confirm(sim);assert.equal(sim.start('p0'),true);for(const p of sim.players.values())sim.loading(p.state.id,p.state.loadingEpoch,true,true);for(let i=0;i<181;i++)sim.step();}
  sim.finish(true);sim.finish(false);const id=sim.result.resultId;assert.equal(results.length,round+1);assert.equal(sim.returnToLobby('p0',id),true);assert.equal(sim.returnToLobby('p0',id),false);
 }assert.equal(new Set(results.map(r=>r.resultId)).size,3);assert.equal(results[0].resultId,'rematch-test:6242');assert.equal(results[1].resultId,'rematch-test:6242:round-1');}
 finally{sim.dispose();}
});

test('disconnected reservation never gains a fresh timeout and old departed ledger cannot enter the next match',async()=>{
 const sim=await fixture();try{
  sim.addPlayer({id:'departed',nickname:'Left',shortId:'L'});sim.players.get('departed').state.kills=5;sim.removePlayer('departed');sim.disconnect('p1');for(let i=0;i<60;i++)sim.step();
  sim.finish(true);const id=sim.result.resultId,left=sim.players.get('p1').disconnectLeft;
  assert.equal(sim.returnToLobby('p0',id),true);assert.equal(sim.players.get('p1').disconnectLeft,left);assert.equal(sim.players.get('p1').state.connected,false);assert.equal(sim.departedParticipants.size,0);
  sim.loading('p0',sim.players.get('p0').state.loadingEpoch,true,true);sim.ready('p0',true);assert.equal(sim.start('p0'),false);
  sim.reconnect('p1');confirm(sim);assert.equal(sim.start('p0'),true);for(const p of sim.players.values())sim.loading(p.state.id,p.state.loadingEpoch,true,true);for(let i=0;i<181;i++)sim.step();sim.finish(true);
  assert.equal(sim.result.players.some(p=>p.id==='departed'),false);assert.equal(sim.result.players.every(p=>p.kills===0),true);
 }finally{sim.dispose();}
});

test('spawn preflight, maintenance and wrong result are fail-closed without mutating the completed round',async()=>{
 const sim=await fixture();try{
  sim.finish(true);const result=sim.result,position=[...sim.players.get('p0').state.position],original=sim.safePoint;
  assert.equal(sim.returnToLobby('p0','wrong'),false);assert.equal(sim.returnToLobby('missing',result.resultId),false);
  sim.maintenance=true;assert.equal(sim.returnToLobby('p0',result.resultId),false);sim.maintenance=false;sim.safePoint=()=>{throw Error('fixture blocked');};
  assert.equal(sim.returnToLobby('p0',result.resultId),false);assert.equal(sim.result,result);assert.equal(sim.phase,'ended');assert.equal(sim.round,0);assert.deepEqual(sim.players.get('p0').state.position,position);sim.safePoint=original;
 }finally{sim.dispose();}
});

test('cooperative next round clears nine-NPC/skills/tasks/items and rebuilds exactly one starting cohort',async()=>{
 const sim=await fixture('coop');try{
  assert.equal(sim.npcs.length,9);sim.npcs[0].state.generation=5;
  sim.tasks.tasks[0].status='complete';sim.taskCompleted(sim.tasks.tasks[0].id);sim.tasks.tasks[1].status='complete';sim.taskCompleted(sim.tasks.tasks[1].id);
  assert.equal(sim.npcs.filter(n=>n.state.active).length,9);sim.finish(true);const id=sim.result.resultId;
  assert.equal(sim.returnToLobby('p0',id),true);assert.equal(sim.npcs.length,0);assert.equal(sim.tasks,null);assert.equal(sim.fire.active,0);confirm(sim);assert.equal(sim.start('p0'),true);
  assert.equal(sim.npcs.length,9);assert.equal(sim.npcs.filter(n=>n.state.active).length,6);assert.ok(sim.npcs.every(n=>n.state.generation>5));assert.equal(sim.startedPlayers,2);assert.equal(sim.result,null);
 }finally{sim.dispose();}
});

test('recipient baseline/delta sequence and private input epoch survive ended to lobby without event rewind',async()=>{
 const sim=await fixture();try{
  const replicator=new RecipientReplicator('p0'),decoder=new WireDecoder();sim.finish(true);const id=sim.result.resultId;
  const first=replicator.build(sim.snapshot(),sim.world,{forceFull:true});const ended=decoder.accept(first).snapshot;assert.equal(ended.phase,'ended');
  sim.returnToLobby('p0',id);const next=replicator.build(sim.snapshot(),sim.world,{forceFull:true});const lobby=decoder.accept(next).snapshot;
  assert.ok(next.seq>first.seq);assert.equal(lobby.phase,'lobby');assert.equal(lobby.result,null);assert.equal(lobby.round,1);assert.ok(lobby.eventSerial>=ended.eventSerial);assert.ok(lobby.players[0].generation>ended.players[0].generation);
 }finally{sim.dispose();}
});

test('old or reconnecting clients never opt into rematch accidentally; capability belongs to the live connection',()=>{
 const gate=new RematchCapabilities(),a={},b={},replacement={},members=[{id:'a',connected:true},{id:'b',connected:true}],connections=[{connection:a,playerId:'a'},{connection:b,playerId:'b'}];
 assert.equal(gate.allows(members,connections),false);assert.equal(gate.declare(a,{rematch:true}),true);assert.equal(gate.declare(b,{rematch:true,tools:true}),false);assert.equal(gate.allows(members,connections),false);
 gate.declare(b,{rematch:true});assert.equal(gate.allows(members,connections),true);assert.equal(gate.declare(a,{rematch:true}),false);
 gate.forget(b);assert.equal(gate.allows(members,connections),false);gate.declare(b,{rematch:true});assert.equal(gate.allows(members,[connections[0],{connection:replacement,playerId:'b'}]),false);
 assert.equal(gate.allows([{id:'a',connected:true},{id:'b',connected:false}],connections),false);
});
