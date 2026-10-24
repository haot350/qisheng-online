import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {TestContext} from 'node:test';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {OnlineClient}=await import('../src/multiplayer/client.ts');
function reconnectSdk(t:TestContext,client:any){const sdk=client.createReconnectClient();t.mock.method(client,'createReconnectClient',()=>sdk);return sdk;}
const {rankingClient}=await import('../src/ranking/client.ts');
const {gameMapSession}=await import('../src/game-map.ts');
const {RoomSimulation}=await import('../src/multiplayer/shared/simulation.ts');
const {RecipientReplicator}=await import('../src/multiplayer/shared/wire.ts');
const key='qisheng-online-room-v1';

function storage(t:TestContext,extra:Record<string,unknown>={}){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),data=new Map<string,string>();
 data.set(key,JSON.stringify({token:'reserved-room:secret-test-token',roomId:'reserved-room',playerId:'p0',at:Date.now()-120000,...extra}));
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)}});
 t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'sessionStorage',descriptor);else delete (globalThis as any).sessionStorage;});return data;
}
function mapReady(t:TestContext){
 const manifestBytes=new TextEncoder().encode(JSON.stringify({sourceVersion:'fixture',collisionUrl:'/collision.glb',navmeshUrl:'/nav.bin'})).buffer;
 t.mock.method(gameMapSession,'initialize',async()=>({manifestBytes,index:{manifest:{sha256:'m'},resources:{'/collision.glb':{sha256:'c'},'/nav.bin':{sha256:'n'}}}} as any));
}
function fakeRoom(autoSnapshot=false){
 const callbacks=new Map<string,Function>(),sent:{type:string;data:unknown}[]=[];let left=0;
 const connection={isOpen:true,close(){connection.isOpen=false;}};
 return{roomId:'reserved-room',reconnectionToken:'reserved-room:new-secret',reconnection:{enabled:true},connection,onMessage:(name:string,fn:Function)=>{callbacks.set(name,fn);if(autoSnapshot&&name==='snapshot')queueMicrotask(()=>fn({roomId:'reserved-room',phase:'lobby',tick:0,players:[{id:'p0'}],events:[]}));},onDrop:(fn:Function)=>callbacks.set('drop',fn),onReconnect:(fn:Function)=>callbacks.set('reconnect',fn),onError:(fn:Function)=>callbacks.set('error',fn),onLeave:(fn:Function)=>callbacks.set('leave',fn),send:(type:string,data:unknown)=>sent.push({type,data}),leave:async()=>{left++;connection.close();return 0;},callbacks,sent,get left(){return left;}};
}
function clientFor(t:TestContext){t.mock.method(rankingClient,'getPlayer',()=>({id:'p0'}) as any);const client=new OnlineClient();t.after(()=>client.dispose());return client;}

test('a transient identity lookup failure preserves a reserved seat and retries even with an old storage timestamp',async t=>{
 const data=storage(t);mapReady(t);const client=clientFor(t),room=fakeRoom();let lookups=0,reconnects=0;
 t.mock.method(rankingClient,'me',async()=>{if(++lookups===1)throw Error('temporary offline');return{id:'p0'} as any;});
 t.mock.method(reconnectSdk(t,client),'reconnect',async(token:string)=>{reconnects++;assert.equal(token,'reserved-room:secret-test-token');return room;});
 assert.equal(await client.reconnect(),false);assert.equal(client.view.errorCode,'RECONNECT_RETRY');assert.equal(client.hasResumeSession(),true);assert.equal(data.has(key),true);assert.equal(reconnects,0);
 assert.equal(await client.reconnect(),true);assert.equal(reconnects,1);assert.equal(client.room,room);assert.equal(client.view.error,undefined);assert.equal(JSON.parse(data.get(key)!).token,room.reconnectionToken);
});
test('temporary map or websocket failures never erase the reconnect token',async t=>{
 const data=storage(t);mapReady(t);const client=clientFor(t);t.mock.method(rankingClient,'me',async()=>({id:'p0'} as any));
 const mapMock=t.mock.method(gameMapSession,'initialize',async()=>{throw Error('map request interrupted');});
 assert.equal(await client.reconnect(),false);assert.equal(data.has(key),true);mapMock.mock.restore();
 t.mock.method(reconnectSdk(t,client),'reconnect',async()=>{throw Object.assign(Error('socket interrupted'),{code:1006});});
 assert.equal(await client.reconnect(),false);assert.equal(client.view.errorCode,'RECONNECT_RETRY');assert.equal(data.has(key),true);
});
test('server-confirmed expired token or disposed room clears the reserved-seat entry',async t=>{
 storage(t);mapReady(t);t.mock.method(rankingClient,'me',async()=>({id:'p0'} as any));
 for(const code of [522,524]){const client=clientFor(t);sessionStorage.setItem(key,JSON.stringify({token:'reserved-room:secret',playerId:'p0'}));t.mock.method(reconnectSdk(t,client),'reconnect',async()=>{throw Object.assign(Error('expired'),{code});});assert.equal(await client.reconnect(),false);assert.equal(client.hasResumeSession(),false);assert.equal(client.view.errorCode,'RECONNECT_EXPIRED');}
});
test('identity changes discard a seat without reconnecting as another player',async t=>{
 storage(t);mapReady(t);const client=clientFor(t);t.mock.method(rankingClient,'me',async()=>({id:'other'} as any));let requests=0;t.mock.method(reconnectSdk(t,client),'reconnect',async()=>{requests++;return fakeRoom();});
 assert.equal(await client.reconnect(),false);assert.equal(requests,0);assert.equal(client.hasResumeSession(),false);assert.equal(client.view.errorCode,'IDENTITY_CHANGED');
});
test('repeated manual recovery is single-flight and a late socket after leaving is closed',async t=>{
 const data=storage(t);mapReady(t);const client=clientFor(t),room=fakeRoom();t.mock.method(rankingClient,'me',async()=>({id:'p0'} as any));let resolveRoom!:(room:ReturnType<typeof fakeRoom>)=>void,requests=0;
 t.mock.method(reconnectSdk(t,client),'reconnect',()=>{requests++;return new Promise(resolve=>{resolveRoom=resolve;});});
 const first=client.reconnect(),second=client.reconnect();assert.equal(first,second);await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,1);
 await client.leave();resolveRoom(room);assert.equal(await first,false);await new Promise(resolve=>setImmediate(resolve));assert.equal(room.left,1);assert.equal(room.reconnection.enabled,false);assert.equal(client.room,null);assert.equal(data.has(key),false);assert.equal(client.view.status,'lobby');
});
test('joining the reserved full room resumes the original seat rather than consuming a new seat',async t=>{
 storage(t);mapReady(t);const client=clientFor(t),room=fakeRoom(true);t.mock.method(rankingClient,'me',async()=>({id:'p0'} as any));let requests=0;t.mock.method(reconnectSdk(t,client),'reconnect',async()=>{requests++;return room;});
 t.mock.method(globalThis,'fetch',async()=>{throw Error('new admission must not be requested');});
 await client.join(undefined,'reserved-room');assert.equal(requests,1);assert.equal(client.room,room);assert.equal(room.left,0);
});
test('a failed reserved-room retry cannot fall through to ordinary full-room matchmaking',async t=>{
 storage(t);mapReady(t);const client=clientFor(t);t.mock.method(rankingClient,'me',async()=>({id:'p0'} as any));let requests=0;t.mock.method(reconnectSdk(t,client),'reconnect',async()=>{requests++;throw Error('temporary network failure');});
 t.mock.method(globalThis,'fetch',async()=>{throw Error('new admission must not be requested');});
 await client.join(undefined,'reserved-room');assert.equal(requests,1);assert.equal(client.hasResumeSession(),true);assert.equal(client.view.errorCode,'RECONNECT_RETRY');
});
test('manual retry does not compete with an SDK automatic reconnection in progress',async t=>{
 storage(t);const client=clientFor(t),room=fakeRoom();(client as any).bind(room);room.callbacks.get('drop')!();let requests=0;t.mock.method(reconnectSdk(t,client),'reconnect',async()=>{requests++;return room;});
 assert.equal(await client.reconnect(),false);assert.equal(requests,0);assert.equal(client.view.status,'reconnecting');assert.equal(client.room,room);room.callbacks.get('reconnect')!();assert.equal(await client.reconnect(),true);
});
test('SDK retry exhaustion preserves a manual recovery entry, and a server-accepted late recovery is still valid',async t=>{
 t.mock.timers.enable({apis:['setInterval','Date'],now:1000});storage(t);const client=clientFor(t),room=fakeRoom();client.playerId='p0';(client as any).bind(room);room.callbacks.get('drop')!();t.mock.timers.tick(60000);assert.equal(client.hasResumeSession(),true);assert.equal(client.room,room);room.callbacks.get('reconnect')!();assert.equal(client.room,room);assert.equal(client.view.error,undefined);
 room.callbacks.get('drop')!();room.connection.close();room.callbacks.get('leave')!(4003);assert.equal(client.room,null);assert.equal(client.view.errorCode,'RECONNECT_RETRY');assert.equal(client.hasResumeSession(),true);
});
test('unavailable browser session storage cannot reset the active wire decoder while checking the resume entry',t=>{
 storage(t);const client=clientFor(t),room=fakeRoom();client.playerId='p0';(client as any).bind(room);const reset=t.mock.method((client as any).decoder,'reset');t.mock.method(sessionStorage,'getItem',()=>{throw new Error('browser storage is unavailable');});assert.equal(client.hasResumeSession(),false);assert.equal(reset.mock.callCount(),0);assert.equal(client.room,room);
});

// These fixtures exercise authoritative state transitions without running rendering or a network server.
function simulation(count=1,mode:'coop'|'pvp'='pvp'){
 const world={manifest:{spawn:[0,0,0],spawnYaw:0,supplies:[]},actors:new Map(),visible:()=>true,removeActor(id:string){this.actors.delete(id);},move:(_id:string,p:number[])=>({position:p})};
 const sim=new RoomSimulation('reserved-room',world as any,{sourceVersion:'fixture',manifestHash:'m',collisionHash:'c',navigationHash:'n'},{mode,variant:'ffa',maxPlayers:8});
 (sim as any).findSpawn=()=>[0,0,0];for(let i=0;i<count;i++){const state=sim.addPlayer({id:'p'+i,nickname:'Player '+i,shortId:'T'+i});state.loading=false;}return sim;
}
test('a full eight-player room keeps the original identity, ACK and generation on reconnect without admitting a ninth',()=>{
 const sim=simulation(8),p=sim.players.get('p1')!;p.state.ack=9000;p.state.actionAck=321;const generation=p.state.generation,epoch=p.state.loadingEpoch;sim.disconnect('p1');sim.step(59.5);
 assert.equal(sim.occupantCount,8);assert.equal(p.disconnectLeft,.5);assert.throws(()=>sim.addPlayer({id:'extra',nickname:'Extra',shortId:'X'}));
 sim.disconnect('p1');assert.equal(p.disconnectLeft,.5,'duplicate drop cannot extend the original reservation');sim.reconnect('p1');assert.equal(sim.players.get('p1'),p);assert.equal(sim.occupantCount,8);assert.equal(p.state.ack,9000);assert.equal(p.state.actionAck,321);assert.equal(p.state.generation,generation);assert.equal(p.state.loadingEpoch,epoch+1);assert.equal(p.state.loading,true);assert.equal(p.state.connected,true);
});
test('the authoritative sixty-second boundary releases only the expired original seat',()=>{
 const sim=simulation(8);sim.disconnect('p1');sim.step(60);assert.equal(sim.occupantCount,7);assert.equal(sim.players.has('p1'),false);assert.throws(()=>sim.reconnect('p1'));sim.addPlayer({id:'replacement',nickname:'New',shortId:'N'});assert.equal(sim.occupantCount,8);
});
for(const targetIndex of [0,3,7])test('exchanging drop '+targetIndex+' at the eight-item cap preserves the old primary and seven other drops',()=>{
 const sim=simulation(),p=sim.players.get('p0')!,gun=p.guns.get('m4a1')!;gun.ammo=11;gun.reserve=21;
 for(let i=0;i<8;i++)sim.drops.push({id:'fixture-'+i,weapon:'mp5',ammo:7,reserve:13,position:i===targetIndex?[.7,0,0]:[30+i,0,0],left:45});
 (sim as any).interact(p);assert.equal(p.primary,'mp5');assert.equal(p.state.weapon,'mp5');assert.equal(p.guns.get('mp5')!.ammo,7);assert.equal(p.guns.get('mp5')!.reserve,13);assert.equal(sim.drops.length,8);assert.equal(sim.drops.some(d=>d.id==='fixture-'+targetIndex),false);
 for(let i=0;i<8;i++)if(i!==targetIndex)assert.equal(sim.drops.some(d=>d.id==='fixture-'+i),true);
 const old=sim.drops.find(d=>d.weapon==='m4a1')!;assert.ok(old);assert.equal(old.ammo,11);assert.equal(old.reserve,21);assert.equal(old.left,45);assert.deepEqual(old.position,p.state.position);assert.equal(sim.events.filter(e=>e.type==='pickup').length,1);assert.equal(sim.events.at(-1)!.data!.action,'replace');
});
test('same-weapon pickup retains unclaimed ammunition and cannot exceed the existing reserve cap',()=>{
 const sim=simulation(),p=sim.players.get('p0')!,gun=p.guns.get('m4a1')!;gun.reserve=175;
 sim.drops.push({id:'ammo',weapon:'m4a1',ammo:30,reserve:60,position:[.7,0,0],left:45});(sim as any).interact(p);assert.equal(gun.reserve,180);assert.equal(gun.ammo,30);assert.equal(sim.drops.length,1);assert.equal(sim.drops[0].ammo+sim.drops[0].reserve,85);assert.equal(p.primary,'m4a1');assert.equal(sim.events.at(-1)!.data!.action,'ammo');
});
test('an occluded drop cannot be exchanged and task interaction still takes priority',()=>{
 const sim=simulation(),p=sim.players.get('p0')!;sim.drops.push({id:'near',weapon:'mp5',ammo:7,reserve:13,position:[.7,0,0],left:45});(sim.world as any).visible=()=>false;(sim as any).interact(p);assert.equal(sim.drops.length,1);assert.equal(p.primary,'m4a1');
 (sim.world as any).visible=()=>true;sim.tasks={candidates:()=>[{kind:'task',id:'task:0',taskId:'task',siteId:'0',action:'hold',position:[0,0,0],range:2.4,distance:0,available:true}],commit:()=>({type:'start',task:{id:'task',kind:'hold',positions:[[0,0,0]]},position:[0,0,0]})} as any;(sim as any).interact(p);assert.equal(sim.drops.length,1);assert.equal(p.primary,'m4a1');assert.equal(sim.events.at(-1)!.type,'task');
});
test('player death/down include the defeated generation, and public events cannot expose death coordinates',()=>{
 for(const mode of ['pvp','coop'] as const){const sim=simulation(2,mode),p=sim.players.get('p1')!;p.state.team='red';p.state.position=[10,0,-8];p.state.generation=7;(sim as any).damage('p1',100,'p0');const event=sim.events.find(e=>e.type===(mode==='pvp'?'death':'down'))!;assert.equal(event.data!.generation,7);event.data!.sourcePosition=[100,1,200];event.data!.position=[10,0,-8];
  const wire=new RecipientReplicator('p0').build(sim.snapshot(),{visible:()=>false} as any,{forceFull:true}),death=wire.events.find(e=>e.type===event.type)!;assert.ok(death);assert.equal(death.data!.generation,7);assert.equal(death.position,undefined);assert.equal(death.data!.position,undefined);assert.equal(death.data!.sourcePosition,undefined);
 }
});
test('NPC down preserves only its generation and headshot flag in the public event',()=>{
 const sim=simulation(),npc:any={state:{id:'npc-test',identity:'xutao',generation:9,position:[10,0,-8],health:20,active:true},gun:{id:'mp5',ammo:7,reserve:13},slot:0,attack:{reset(){}},memory:1,lastKnown:[0,0,0]};sim.npcs.push(npc);(sim as any).damage('npc-test',100,'p0',true);const event=sim.events.find(e=>e.type==='down')!;assert.equal(event.data!.generation,9);assert.equal(event.data!.headshot,true);assert.equal(sim.drops.length,1);
 const wire=new RecipientReplicator('p0').build(sim.snapshot(),{visible:()=>false} as any,{forceFull:true}),down=wire.events.find(e=>e.type==='down')!;assert.equal(down.data!.generation,9);assert.equal(down.position,undefined);assert.deepEqual(Object.keys(down.data!).sort(),['generation','headshot']);
});
test('pickup outcome is included only for the interacting player, not an observing player',()=>{
 const sim=simulation(2);sim.events.push({serial:1,tick:0,type:'pickup',actorId:'p0',position:[0,0,0],data:{weapon:'mp5',action:'replace',privateDiagnostic:'must not travel'}});sim.eventSerial=1;
 const own=new RecipientReplicator('p0').build(sim.snapshot(),{visible:()=>true} as any,{forceFull:true}),other=new RecipientReplicator('p1').build(sim.snapshot(),{visible:()=>true} as any,{forceFull:true});assert.equal(own.events[0].data!.action,'replace');assert.equal(other.events[0].data!.action,undefined);assert.equal(own.events[0].data!.privateDiagnostic,undefined);assert.equal(other.events[0].data!.privateDiagnostic,undefined);
});


test('rejoining by invite code preserves and resumes the reserved original seat before resolving a new admission',async t=>{
 storage(t);mapReady(t);const client=clientFor(t),room=fakeRoom(true);t.mock.method(rankingClient,'me',async()=>({id:'p0'} as any));let calls=0;t.mock.method(reconnectSdk(t,client),'reconnect',async()=>{calls++;return room;});t.mock.method(globalThis,'fetch',async()=>{throw Error('must not consume a fresh invite grant while the original seat is recoverable');});await client.join(undefined,undefined,'SAMECODE');assert.equal(calls,1);assert.equal(client.room,room);assert.equal(room.left,0);
});
