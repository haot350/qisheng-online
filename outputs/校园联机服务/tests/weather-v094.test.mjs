import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {access} from 'node:fs/promises';
import {RoomSimulation} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/simulation.js';
import {RecipientReplicator,WireDecoder} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/wire.js';
process.env.MAP_DIRECTORY??=fileURLToPath(new URL('../../校园逃生游戏/public/map',import.meta.url));
const hasFormal=await access(process.env.MAP_DIRECTORY+'/manifest.json').then(()=>true,()=>false);
test('authoritative preset is frozen, survives baseline/delta and does not consume gameplay random state',{skip:hasFormal?false:'Requires separately licensed formal map; pure weather validation remains public'},async()=>{
 const {createWorld,mapIdentity}=await import('../dist/modules/校园联机服务/src/assets.js');
 const outcomes=[];
 for(const preset of ['clear','overcast','light-rain']){
  const world=await createWorld(),sim=new RoomSimulation('weather-test',world,mapIdentity,{mode:'pvp',variant:'ffa',seed:741,weather:preset},()=>{},192837);
  try{
   sim.addPlayer({id:'a',nickname:'A',shortId:'A'});sim.addPlayer({id:'b',nickname:'B',shortId:'B'});
   const before=sim.snapshot(),replicator=new RecipientReplicator('a'),decoder=new WireDecoder();
   const full=replicator.build(before,world),first=decoder.accept(full).snapshot;
   assert.deepEqual(first.weather,{preset,seed:192837,startedAtTick:0});
   assert.notEqual(first.weather.seed,sim.options.seed,'Public visual seed must not expose battle PRNG seed');
   assert.throws(()=>{sim.weather.preset='clear';});
   for(let i=0;i<12;i++)sim.step();
   const delta=replicator.build(sim.snapshot(),world),next=decoder.accept(delta).snapshot;
   assert.deepEqual(next.weather,first.weather);
   const snap=sim.snapshot();delete snap.weather;outcomes.push(snap);
  }finally{sim.dispose();}
 }
 assert.deepEqual(outcomes[0],outcomes[1]);assert.deepEqual(outcomes[0],outcomes[2]);
});
