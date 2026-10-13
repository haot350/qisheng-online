import test from 'node:test';
import assert from 'node:assert/strict';
import {RecipientReplicator,WireDecoder,roomRoster} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/wire.js';
import {RecipientVisibility,authorizedSpectate} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/visibility.js';
import {getMessageBytes,Protocol} from '@colyseus/core';
import {decode} from '@colyseus/schema';
import {unpack} from 'msgpackr';
import {PROTOCOL_VERSION} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/protocol.js';

function player(id,team,position){return{id,nickname:id,shortId:id,avatar:'campus-a',team,ready:true,rankConsent:false,connected:true,loading:false,loadingEpoch:1,position,yaw:0,pitch:0,velocity:[0,0,0],grounded:true,crouched:false,life:'alive',health:73,stamina:82,movementState:{vertical:0,lastSafe:[12345,12346,12347],actualSpeed:0},weapon:'m4a1',primaryWeapon:'m4a1',ammo:19,reserve:57,weaponAction:{phase:'ready',stage:'ready',progress:1,ready:true},aim:false,sprinting:false,sliding:false,ack:12,generation:1,kills:0,deaths:0,assists:0,downs:0,headshots:0,damageTaken:27,reviveLeft:0,respawnLeft:0,protectionLeft:0,carryingTask:null,ping:40,smokes:2,appliedInputTick:20,actionAck:12,inputResync:false};}
function snapshot(){return{protocolVersion:PROTOCOL_VERSION,roomId:'wire-test',inviteCode:'QATEST',hostId:'self',mode:'pvp',variant:'tdm',difficulty:'standard',phase:'playing',tick:60,elapsed:1,remaining:599,map:{sourceVersion:'test',collisionHash:'c',navigationHash:'n',manifestHash:'m'},players:[player('self','blue',[0,0,0]),player('ally','blue',[10,0,0]),player('seen','red',[0,0,-8]),player('hidden','red',[10,0,-8])],npcs:[],tasks:[],drops:[],supplies:[{id:'box',position:[0,0,0],usedBy:['hidden']}],smokes:[],events:[],eventSerial:0,maxPlayers:8,occupancy:4,startedPlayers:4,extraction:{available:false,position:[0,0,0],progress:0,duration:20,blocked:null},teamScores:{blue:0,red:0},pauseVote:null,pauseLeft:0,pauseUses:0,countdown:0,result:null,maintenance:false};}
const open={visible:()=>true};
const wall={visible:(a,b)=>!((a[0]<5&&b[0]>5)||(a[0]>5&&b[0]<5))};
function event(serial,type,actorId,targetId,position,data){return{serial,tick:60,type,actorId,targetId,position,data};}

test('wire full separates roster, self private prediction and permitted presentation',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self'),wire=rep.build(s,wall,{forceFull:true});
 assert.equal(wire.kind,'full');assert.deepEqual(wire.roster.map(p=>p.id),['self','ally','seen','hidden']);assert.deepEqual(wire.players.map(p=>p.id),['ally','seen']);
 assert.equal(wire.self.ammo,19);assert.deepEqual(wire.self.movementState.lastSafe,[12345,12346,12347]);assert.equal(wire.self.appliedInputTick,20);assert.equal(wire.self.actionAck,12);
 for(const remote of wire.players)for(const key of ['ammo','reserve','stamina','ack','movementState','smokes','damageTaken'])assert.equal(key in remote,false,key);
 for(const row of wire.roster)for(const key of ['position','yaw','velocity','ammo','movementState','lastSafe'])assert.equal(key in row,false,key);
 assert.equal('health' in wire.roster.find(p=>p.id==='hidden'),false);assert.equal('health' in wire.players.find(p=>p.id==='seen'),false);assert.deepEqual(wire.room.supplies[0].usedBy,[]);
 const decoded=new WireDecoder().accept(wire).snapshot;assert.deepEqual(decoded.players.map(p=>p.id),['self','ally','seen']);assert.equal(roomRoster(decoded).length,4);assert.equal(decoded.players.some(p=>p.id==='hidden'),false);
});
test('delta hides immediately, restores a fresh generation, and contains no old hidden coordinates',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self'),decoder=new WireDecoder();decoder.accept(rep.build(s,wall));
 s.tick+=3;s.players.find(p=>p.id==='seen').position=[10,0,-7];s.players[0].ammo=18;s.players[0].ack=14;
 const delta=rep.build(s,wall);assert.equal(delta.kind,'delta');assert.ok(delta.players.remove.includes('seen'));assert.equal(delta.self.set.ammo,18);assert.equal(delta.players.upsert.some(p=>p.id==='seen'),false);
 let decoded=decoder.accept(delta).snapshot;assert.deepEqual(decoded.players.map(p=>p.id),['self','ally']);assert.equal(decoded.players[0].ammo,18);
 s.tick+=3;s.players.find(p=>p.id==='seen').position=[0,0,-7];s.players.find(p=>p.id==='seen').generation=2;
 decoded=decoder.accept(rep.build(s,wall)).snapshot;assert.equal(decoded.players.find(p=>p.id==='seen').generation,2);
});
test('delta gap requests full resync; stale envelopes never replace newer state',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self'),decoder=new WireDecoder(),first=rep.build(s,open);decoder.accept(first);
 s.tick+=3;rep.build(s,open);s.tick+=3;const third=rep.build(s,open);
 assert.deepEqual(decoder.accept(third),{snapshot:null,needsResync:true});assert.equal(decoder.sequence,first.seq);
 const full=rep.build(s,open,{forceFull:true});assert.equal(decoder.accept(full).needsResync,false);assert.equal(decoder.sequence,full.seq);assert.deepEqual(decoder.accept(first),{snapshot:null,needsResync:false});
});
test('hidden gunfire is only coarse listener-specific sound, and hidden activity has no precise event side channel',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self');rep.build(s,wall);
 s.events=[event(1,'shot','hidden',undefined,[10,1.4,-8],{weapon:'ak47',shotId:1,ends:[[9,1,-8]],direction:[-1,0,0],hits:[{targetId:'seen',damage:25}]}),event(2,'hit','hidden','self',[0,0,0],{damage:20,headshot:false,sourcePosition:[10,1.4,-8]}),event(3,'death','hidden','seen',[9,0,-8]),event(4,'ping','hidden',undefined,[9,0,-8]),event(5,'preset','hidden',undefined,undefined,{id:'go'})];s.eventSerial=5;
 const wire=rep.build(s,wall),sound=wire.events.find(e=>e.type==='sound'),hit=wire.events.find(e=>e.type==='hit'),death=wire.events.find(e=>e.type==='death');
 assert.ok(sound);assert.equal(sound.actorId,undefined);assert.equal(sound.position,undefined);assert.equal(sound.data.kind,'shot');assert.equal(typeof sound.data.bearing,'number');assert.equal(sound.data.distanceBand,'near');
 for(const key of ['ends','direction','hits','sourcePosition'])assert.equal(key in sound.data,false);
 assert.ok(hit);assert.equal(hit.position,undefined);assert.equal('sourcePosition' in hit.data,false);assert.equal(typeof hit.data.bearing,'number');assert.ok(death);assert.equal(death.position,undefined);
 assert.equal(wire.events.some(e=>e.type==='ping'||e.type==='preset'),false);
 s.tick+=3;assert.equal(rep.build(s,wall).events.length,0,'reliable snapshots do not replay previous events');
});
test('teammate positions do not make occluded teammate bullets reveal hidden opponents',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self');rep.build(s,wall);s.events=[event(1,'shot','ally',undefined,[10,1.4,0],{weapon:'m4a1',ends:[[10,1,-8]],direction:[0,0,-1],hits:[{targetId:'hidden',damage:25}]})];s.eventSerial=1;
 const wire=rep.build(s,wall,{forceFull:true});assert.ok(wire.players.some(p=>p.id==='ally'));assert.equal(wire.events[0].type,'sound');assert.equal(wire.events[0].position,undefined);assert.equal('hits' in wire.events[0].data,false);
});
test('visible third-party shots omit hit lists and occluded impact endpoints',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self');rep.build(s,wall);s.events=[event(1,'shot','seen',undefined,[0,1.4,-8],{weapon:'m4a1',ends:[[0,1,-9],[10,1,-8]],direction:[0,0,-1],hits:[{targetId:'hidden',damage:25}]})];s.eventSerial=1;
 const shot=rep.build(s,wall).events[0];assert.equal(shot.type,'shot');assert.deepEqual(shot.data.ends,[[0,1,-9]]);assert.equal('hits' in shot.data,false);
});
test('cooperative NPCs use the same server visibility and never reveal target memory or exact health',()=>{
 const s=snapshot();s.mode='coop';s.players=s.players.slice(0,2);s.npcs=[{id:'npc-0',identity:'xutao',generation:1,position:[0,0,-8],yaw:0,pose:'idle',aim:false,firing:false,reloading:false,weapon:'mp5',active:true,health:34,targetId:'self'},{id:'npc-1',identity:'chengguotao',generation:1,position:[10,0,-8],yaw:0,pose:'skill',aim:false,firing:false,reloading:false,weapon:'glock',active:true,health:100,targetId:'ally'}];
 const wire=new RecipientReplicator('self').build(s,wall);assert.deepEqual(wire.npcs.map(n=>n.id),['npc-0']);assert.equal('targetId' in wire.npcs[0],false);assert.equal('health' in wire.npcs[0],false);
});
test('stationary smoke and full floors block all body sample points',()=>{
 const s=snapshot();s.players=s.players.slice(0,1).concat(player('target','red',[0,0,-12]));s.smokes=[{id:'smoke',position:[0,1,-6],radius:3,left:6,bornTick:0}];
 assert.equal(new RecipientReplicator('self').build(s,open).players.length,0);
 s.smokes=[];s.players[1].position=[0,4,-3];const floor={visible:(a,b)=>!((a[1]<2&&b[1]>2)||(a[1]>2&&b[1]<2))};assert.equal(new RecipientReplicator('self').build(s,floor).players.length,0);
});
test('bounded corner previsibility permits a safe upcoming peek but cannot cross a complete wall',()=>{
 const s=snapshot(),viewer=s.players[0],target=player('target','red',[10,0,-.3]);target.velocity=[0,0,6];
 const corner={visible:(a,b)=>{if((a[0]<5&&b[0]>5)||(a[0]>5&&b[0]<5)){const t=(5-a[0])/(b[0]-a[0]);return a[2]+(b[2]-a[2])*t>=0;}return true;}};
 assert.equal(new RecipientVisibility().permits(corner,viewer,target,[],60),true);assert.equal(new RecipientVisibility().permits(wall,viewer,target,[],60),false);
 target.velocity=[1000,0,0];assert.equal(new RecipientVisibility().permits(wall,viewer,target,[],60),false);
});
test('unchanged visibility reuses bounded cache and movement invalidates it',()=>{
 let calls=0;const counted={visible:()=>{calls++;return false;}},v=new RecipientVisibility(),s=snapshot(),self=s.players[0],target=s.players[3];
 v.permits(counted,self,target,[],60);const first=calls;v.permits(counted,self,target,[],63);assert.equal(calls,first);target.position=[11,0,-8];v.permits(counted,self,target,[],64);assert.ok(calls>first);
});
test('spectator authority only follows live own-team members and uses their filtering origin',()=>{
 const s=snapshot();s.players[0].life='respawning';s.players[0].position=[-10,0,0];
 assert.equal(authorizedSpectate(s,'self','hidden'),'ally');assert.equal(authorizedSpectate(s,'self','seen'),'ally');
 const wire=new RecipientReplicator('self').build(s,wall,{spectatingId:'ally'});assert.equal(wire.spectatingId,'ally');assert.ok(wire.players.some(p=>p.id==='hidden'));assert.equal(wire.players.some(p=>p.id==='seen'),false);
 s.variant='ffa';assert.equal(authorizedSpectate(s,'self','ally'),null);assert.equal(new RecipientReplicator('self').build(s,wall,{spectatingId:'ally'}).spectatingId,null);
});
test('full resync removes unset private transient fields and cannot mutate previous delivered snapshots',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self'),decoder=new WireDecoder(),initial=decoder.accept(rep.build(s,open)).snapshot;
 s.players[0].inputResync=true;s.tick+=3;const next=decoder.accept(rep.build(s,open)).snapshot;assert.equal(next.players[0].inputResync,true);assert.equal(initial.players[0].inputResync,false);
 delete s.players[0].inputResync;s.tick+=3;const final=decoder.accept(rep.build(s,open)).snapshot;assert.equal('inputResync' in final.players[0],false);
});

test('actual Colyseus msgpack envelopes roundtrip full and delta with fewer encoded payload bytes',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self'),decoder=new WireDecoder();
 const receive=message=>{const bytes=getMessageBytes.raw(Protocol.ROOM_DATA,'snapshot',message),cursor={offset:1};assert.equal(bytes[0],Protocol.ROOM_DATA);assert.equal(decode.string(bytes,cursor),'snapshot');const delivered=unpack(bytes.subarray(cursor.offset));return{bytes,delivered,state:decoder.accept(delivered).snapshot};};
 const full=receive(rep.build(s,wall));assert.equal(full.state.players.some(p=>p.id==='hidden'),false);
 s.tick+=3;s.elapsed+=.05;s.remaining-=.05;s.players[0].ammo--;s.players[0].appliedInputTick+=3;const delta=receive(rep.build(s,wall));
 assert.equal(delta.state.players[0].ammo,18);assert.equal(delta.state.players[0].appliedInputTick,23);assert.ok(delta.bytes.byteLength<full.bytes.byteLength*.65);
 for(const row of delta.delivered.roster??[])assert.equal('position' in row,false);assert.equal(delta.delivered.players.upsert.some(p=>p.id==='hidden'),false);
});

test('replication uses strict fixed-geometry ray endpoints rather than movement LOS tolerance',()=>{
 const s=snapshot(),nearWall={visible:()=>true,rayDistance:(_a,_direction,length)=>Math.max(0,length-.02)};
 s.players=s.players.filter(p=>p.id!=='ally');const w=new RecipientReplicator('self').build(s,nearWall);assert.equal(w.players.length,0,'a shoulder 2cm behind solid geometry is not visible');
 const clear={visible:()=>false,rayDistance:(_a,_direction,length)=>length};assert.equal(new RecipientReplicator('self').build(s,clear).players.length,2);
});

test('real Rapier fixed geometry rejects 5mm-behind-wall, complete floors and smoke without movement tolerance fallback',async()=>{
 const {createWorld}=await import('../dist/modules/校园联机服务/src/assets.js');const {default:RAPIER}=await import('@dimforge/rapier3d-compat');const world=await createWorld();
 const s=snapshot();s.players=[player('self','blue',[500,0,500]),player('target','red',[500,0,490])];
 const fixed=(position,half)=>{const body=world.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...position));world.physics.createCollider(RAPIER.ColliderDesc.cuboid(...half),body);world.step();return body;};
 try{
  assert.equal(new RecipientReplicator('self').build(s,world).players.length,1,'control: empty space is visible');
  const thinWall=fixed([500,1.5,490.01],[3,3,.005]);
  assert.equal(world.visible([500,1.62,500],[500,1.62,490]),true,'existing movement LOS intentionally tolerates the last1.5cm');
  assert.equal(new RecipientReplicator('self').build(s,world).players.length,0,'target5mm behind the wall back face is not replicated');
  s.players[1].velocity=[0,0,6];assert.equal(new RecipientReplicator('self').build(s,world).players.length,0,'future point cannot cross the complete wall');
  world.physics.removeRigidBody(thinWall);world.step();
  s.players[1].position=[500,4,490];s.players[1].velocity=[0,0,0];const floor=fixed([500,2.4,495],[8,.1,8]);
  assert.equal(new RecipientReplicator('self').build(s,world).players.length,0,'complete floor blocks every height sample');world.physics.removeRigidBody(floor);world.step();
  s.players[1].position=[500,0,490];s.smokes=[{id:'real-smoke',position:[500,1,495],radius:2,left:6,bornTick:0}];assert.equal(new RecipientReplicator('self').build(s,world).players.length,0,'historical smoke blocks otherwise open real-world rays');
 }finally{world.dispose();}
});

test('recipient event counters conceal hidden activity and forced baselines retain newly delivered events',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self');rep.build(s,wall);s.tick+=30;
 s.events=[{...event(1,'shot','hidden',undefined,[500,1,500],{weapon:'mp5'}),tick:61},{...event(2,'hit','self','seen',[0,1,-8],{damage:25,headshot:false,sourcePosition:[0,1,0]}),tick:62}];s.eventSerial=2;
 const full=rep.build(s,wall,{forceFull:true});assert.equal(full.events.length,1);assert.equal(full.events[0].serial,1);assert.equal(full.eventSerial,1);assert.equal('eventSerial' in full.room,false);assert.equal('events' in full.room,false);assert.equal('players' in full.room,false);assert.equal('npcs' in full.room,false);
 assert.equal(rep.build(s,wall,{forceFull:true}).events.length,0);
});


test('generation identifies lawful shot effects but shot acknowledgement stays private to its owner',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self');rep.build(s,wall);
 s.events=[event(1,'shot','self',undefined,[0,1.4,0],{weapon:'m4a1',shotId:1,generation:4,clientShotSeq:123,ends:[[0,1,-8]],hits:[{targetId:'seen',damage:25}]}),event(2,'shot','seen',undefined,[0,1.4,-8],{weapon:'mp5',shotId:2,generation:7,clientShotSeq:999,ends:[[0,1,0]],hits:[{targetId:'self',damage:20}]})];s.eventSerial=2;
 const wire=rep.build(s,wall),own=wire.events.find(e=>e.actorId==='self'),other=wire.events.find(e=>e.actorId==='seen');
 assert.equal(own.data.generation,4);assert.equal(own.data.clientShotSeq,123);assert.equal(own.data.hits.length,1);
 assert.equal(other.data.generation,7);assert.equal('clientShotSeq' in other.data,false);assert.equal('hits' in other.data,false);
});

test('plain wire copies isolate nested arrays and property deletion across successive states',()=>{
 const s=snapshot(),rep=new RecipientReplicator('self'),decoder=new WireDecoder(),first=rep.build(s,open),initial=decoder.accept(first).snapshot;
 s.players[0].movementState.lastSafe[0]=-999;s.players[1].position[0]=11;s.players[0].weaponAction.progress=.5;
 assert.equal(first.self.movementState.lastSafe[0],12345);assert.equal(initial.players[0].weaponAction.progress,1);assert.equal(first.players.find(p=>p.id==='ally').position[0],10);
 s.tick+=3;delete s.players[0].movementState;const next=decoder.accept(rep.build(s,open)).snapshot;
 assert.equal('movementState' in next.players[0],false);assert.equal(next.players[0].weaponAction.progress,.5);assert.equal(initial.players[0].movementState.lastSafe[0],12345);
});


test('own shot needs no replica visibility rays and hidden shots only query lawful coarse occlusion',()=>{
 const s=snapshot();s.players=[s.players[0]];let rays=0;
 const counted={visible:()=>{rays++;return false;}},rep=new RecipientReplicator('self');rep.build(s,counted);
 s.events=[event(1,'shot','self',undefined,[0,1.4,0],{weapon:'m4a1',shotId:1,generation:1,clientShotSeq:7,ends:[[0,1,-8]],hits:[{targetId:'actual-hit',damage:25}]})];s.eventSerial=1;
 const own=rep.build(s,counted).events[0];assert.equal(own.type,'shot');assert.equal(own.data.clientShotSeq,7);assert.equal(rays,0,'private shooter feedback never needs remote-visibility permission');
 s.events=[event(2,'shot','unreplicated',undefined,[10,1,-8],{weapon:'ak47',ends:[[9,1,-8]],hits:[{targetId:'secret',damage:25}]})];s.eventSerial=2;
 const hidden=rep.build(s,counted).events[0];assert.equal(hidden.type,'sound');assert.equal(hidden.position,undefined);assert.equal(hidden.actorId,undefined);assert.equal('hits' in hidden.data,false);assert.equal(rays,1,'only the coarse sound occlusion path executes for an unpermitted source');
});
