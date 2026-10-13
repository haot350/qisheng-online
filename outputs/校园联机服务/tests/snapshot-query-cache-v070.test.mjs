import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {snapshotQueries} from './support/rejected-snapshot-cache.mjs';
import {createWorld,mapIdentity} from '../dist/modules/校园联机服务/src/assets.js';
import {RoomSimulation} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/simulation.js';
import {RecipientReplicator} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/wire.js';
import {RecipientVisibility} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/visibility.js';

test('snapshot cache requires every exact ray scalar and separates physical from perception geometry',()=>{
 let physical=0,vision=0;const world={visible:()=>true,rayDistance(){physical++;return 2;},visionRayDistance(){vision++;return 1;}},a=[1,2,3],d=[.2,.4,.6],cache=snapshotQueries(world);
 assert.equal(cache.world.rayDistance(a,d,5),2);assert.equal(cache.world.visionRayDistance(a,d,5),1);assert.equal(cache.world.rayDistance([...a],[...d],5),2);assert.equal(cache.world.visionRayDistance([...a],[...d],5),1);assert.equal(physical,1);assert.equal(vision,1);assert.equal(cache.stats.hits,2);
 for(let i=0;i<7;i++){const values=[...a,...d,5];values[i]+=1e-10;cache.world.rayDistance(values.slice(0,3),values.slice(3,6),values[6]);}assert.equal(physical,8,'nearly equal parameters must not share results');cache.world.rayDistance([-0,0,0],d,5);cache.world.rayDistance([0,0,0],d,5);assert.equal(physical,10);assert(cache.stats.entries<=2048);
});
test('snapshot cache is bounded and a new projection batch cannot reuse an old map result',()=>{
 let calls=0,hit=2;const world={visible:()=>true,rayDistance:()=>{calls++;return hit;}},cache=snapshotQueries(world,1),a=[0,0,0],d=[0,0,1];cache.world.rayDistance(a,d,5);cache.world.rayDistance(a,d,6);cache.world.rayDistance(a,d,6);assert.equal(calls,3);assert.equal(cache.stats.entries,1);assert.equal(cache.stats.bypasses,2);hit=1;const next=snapshotQueries(world);assert.equal(next.world.rayDistance(a,d,5),1);assert.equal(next.stats.hits,0);assert.equal(next.stats.misses,1);
});
test('cached static geometry never reuses a visibility decision through changed smoke or point radius',()=>{
 let calls=0;const world={visible:()=>true,rayDistance:()=>{calls++;return 100;}},cache=snapshotQueries(world),v=new RecipientVisibility(),observer={position:[0,0,0],crouched:false},point=[0,1.58,10];assert.equal(v.point(cache.world,observer,point,[],0),true);assert.equal(v.point(cache.world,observer,point,[{id:'smoke',position:[0,1.58,5],radius:2}],0),false);assert.equal(v.point(cache.world,observer,point,[],.3),true);assert.equal(v.point(cache.world,observer,point,[],0),true);assert.equal(calls,1);assert.equal(cache.stats.hits,2);
});
test('real Rapier map rays and eight recipient messages are strictly equivalent while identical sweep rays are reused',async()=>{
 const world=await createWorld(),sim=new RoomSimulation('cache-equal',world,mapIdentity,{mode:'pvp',variant:'ffa',maxPlayers:8,seed:31415});let physical=0,vision=0;const ray=world.rayDistance.bind(world),perception=world.visionRayDistance.bind(world);world.rayDistance=(...args)=>{physical++;return ray(...args);};world.visionRayDistance=(...args)=>{vision++;return perception(...args);};
 try{
  let seed=48271;const random=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)/4294967296;};const cache=snapshotQueries(world);let samples=0;
  for(let i=0;i<1600;i++){const a=[random()*120-60,random()*15+.5,random()*180-160],d=[random()*2-1,random()*.3-.15,random()*2-1],len=Math.hypot(...d),n=d.map(x=>x/len),max=random()*100+.1;for(const name of ['rayDistance','visionRayDistance']){const before=world[name](a,n,max);assert.equal(cache.world[name](a,n,max),before);assert.equal(cache.world[name](a,n,max),before);samples++;}}
  for(let i=0;i<8;i++){const id='p'+i;sim.addPlayer({id,nickname:'Synthetic'+i,shortId:'Q'+i});sim.loading(id,0,true,true);sim.ready(id,true);}assert(sim.start('p0'));for(const p of sim.players.values())sim.loading(p.state.id,p.state.loadingEpoch,true,true);for(let i=0;i<181;i++)sim.step();
  // Identical target sweeps are legitimate even when the viewer is blocked by a wall.
  const distanceOnly={visible:(a,b)=>world.visible(a,b),rayDistance:(a,d,max)=>world.rayDistance(a,d,max),visionRayDistance:(a,d,max)=>world.visionRayDistance(a,d,max)};const snapshot=sim.snapshot();for(const [i,p]of snapshot.players.entries()){p.velocity=[(i%2?-1:1)*2,0,1];p.position=i<4?[-51+i*.06,.5350000262260437,-77.4+i*.04]:[-50+(i-4)*.06,4.244999847412109,-78+(i-4)*.04];}const ids=snapshot.players.map(p=>p.id),uncached=[];physical=vision=0;for(const id of ids)uncached.push(new RecipientReplicator(id).build(snapshot,distanceOnly));const baseline={physical,vision};physical=vision=0;const batch=snapshotQueries(distanceOnly);const actual=ids.map(id=>new RecipientReplicator(id).build(snapshot,batch.world));assert.deepEqual(actual,uncached);assert(batch.stats.hits>0);assert(physical<baseline.physical);
  const report={createdAt:new Date().toISOString(),map:mapIdentity,exactRealRaySamples:samples,recipients:ids.length,messagesStrictlyEqual:true,baselineQueries:baseline,cachedQueries:{physical,vision},cacheStats:batch.stats,scope:'rejected distance-only snapshot-cache experiment; no production integration; no smoke or entity permissions cached'};await mkdir('docs/v0.7.0',{recursive:true});await writeFile('docs/v0.7.0/snapshot-query-equivalence.json',JSON.stringify(report,null,2));
 }finally{sim.dispose();}
});


test('actual room shares the immutable snapshot and original query world without an unprofitable cache',async()=>{
 process.env.REALTIME_SERVICE_TOKEN??='isolated-cache-room-only';delete process.env.REDIS_URL;
 const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
 const room=new CampusRoom(),saved=globalThis.fetch,batches=[];let advance;
 globalThis.fetch=async()=>new Response(JSON.stringify({enabled:true,reason:'',revision:0,maintenance:false,commands:[]}));
 room.roomId='snapshot-scope-qa';room._listing={metadata:{phase:'lobby',occupancy:0}};room.setMetadata=async m=>{room._listing.metadata=m;};room.setFixedTimestep=(handler,hertz)=>{assert.equal(hertz,60);advance=handler;};
 room.sendSnapshot=(_client,_full,snapshot)=>{batches.push(snapshot);};
 try{await room.onCreate({options:{mode:'pvp',variant:'ffa',maxPlayers:8}});await room.control();for(let i=0;i<8;i++)room.clients.push({auth:{player:{id:'p'+i}},ref:{bufferedAmount:0}});for(let i=0;i<3;i++)advance();assert.equal(batches.length,8);assert(batches.every(value=>value===batches[0]));for(let i=0;i<3;i++)advance();assert.equal(batches.length,16);assert(batches.slice(8).every(value=>value===batches[8]));assert.notEqual(batches[0],batches[8]);assert.equal(room.health().staticSnapshotQueries,undefined);}finally{await room.onDispose();room.clock.stop();globalThis.fetch=saved;}
});
