import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defaultGameConfig} from '@qisheng/shared/operations';

// The game already contains parameter properties; transform its actual source
// in this fixture so this test also runs through Node's default strip entry.
registerHooks({
  resolve(specifier,context,next){
    if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){
      const url=new URL(specifier,context.parentURL);
      if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);
    }
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.includes('/src/')&&url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(readFileSync(fileURLToPath(url),'utf8'),{mode:'transform',sourceMap:false}),shortCircuit:true};
    return next(url,context);
  },
});
const {OnlineClient}=await import('../src/multiplayer/client.ts');
const {rankingClient}=await import('../src/ranking/client.ts');
const {gameMapSession}=await import('../src/game-map.ts');
const resumeKey='qisheng-online-room-v1';
const pendingKey='qisheng-pending-admission-v1';
const map={sourceVersion:'fixture',manifestHash:'m',collisionHash:'c',navigationHash:'n'};
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function until(check:()=>boolean){for(let i=0;i<40&&!check();i++)await new Promise(resolve=>setImmediate(resolve));assert(check(),'expected operation stage');}
async function flush(){await new Promise(resolve=>setImmediate(resolve));}
function setup(t:TestContext,reply?:(url:string,init:RequestInit)=>Promise<Response>|Response){
  const storage=new Map<string,string>(),old=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)}});
  t.after(()=>{if(old)Object.defineProperty(globalThis,'sessionStorage',old);else delete (globalThis as any).sessionStorage;});
  let current:any={id:'p0',accountStatus:'active'};
  t.mock.method(rankingClient,'getPlayer',()=>current);
  t.mock.method(rankingClient,'me',async()=>current);
  t.mock.method(rankingClient,'request',async()=>({ticket:'fixture-ticket'}) as any);
  const manifestBytes=new TextEncoder().encode(JSON.stringify({sourceVersion:'fixture',collisionUrl:'/collision',navmeshUrl:'/nav'})).buffer;
  t.mock.method(gameMapSession,'initialize',async()=>({manifestBytes,index:{manifest:{sha256:'m'},resources:{'/collision':{sha256:'c'},'/nav':{sha256:'n'}}}} as any));
  const requests:{url:string;init:RequestInit}[]=[];
  t.mock.method(globalThis,'fetch',async(raw:RequestInfo|URL,init:RequestInit={})=>{
    const url=String(raw);if(url.endsWith('/v1/game-config'))return Response.json(defaultGameConfig());
    requests.push({url,init});if(url.endsWith('/map-identity'))return Response.json(map);
    if(init.method==='DELETE')return new Response(null,{status:204});
    return reply?reply(url,init):Response.json({queueId:'queue-1',queueToken:'queue-secret',status:'ready',position:1,reservation:{room:{roomId:'room'},sessionId:'seat'}});
  });
  const client=new OnlineClient();
  t.after(()=>{(client as any).savePendingAdmission(null);client.dispose();});
  return{client,storage,requests,identity:(id:string|null)=>{current=id?{id,accountStatus:'active'}:null;}};
}
function resume(storage:Map<string,string>){storage.set(resumeKey,JSON.stringify({token:'room:fixture-resume',roomId:'room',playerId:'p0'}));}
function capturedRoom(t:TestContext,sdk:any){
  const room=sdk.createRoom('campus');
  room.roomId='room';let closes=0;
  room.connection={isOpen:true,close(){closes++;this.isOpen=false;}};
  t.mock.method(room,'send',()=>{});
  t.mock.method(room,'leave',async()=>{room.connection.close();return 4000;});
  return{room,closes:()=>closes};
}

test('account switch cancels a pending join and its captured socket immediately',async t=>{
  const f=setup(t),seat=deferred<any>(),sdk=(f.client as any).sdk;let captured:ReturnType<typeof capturedRoom>;
  t.mock.method(sdk,'consumeSeatReservation',()=>{captured=capturedRoom(t,sdk);return seat.promise;});
  const joining=f.client.join({mode:'pvp'});await until(()=>!!captured!);
  f.identity('p1');assert.equal(f.client.handleIdentityChange('p1'),true);
  assert.equal(captured!.room.connection.isOpen,false);
  await f.client.leave();seat.resolve(captured!.room);await joining;await flush();
  assert.equal(f.client.room,null);assert.equal(rankingClient.getPlayer()?.id,'p1');assert.equal(captured!.closes(),1);
});

test('account switch cancels a pending manual reconnect before its handshake resolves',async t=>{
  const f=setup(t),seat=deferred<any>();resume(f.storage);
  const sdk=(f.client as any).createReconnectClient();let captured:ReturnType<typeof capturedRoom>;
  t.mock.method(f.client as any,'createReconnectClient',()=>sdk);
  t.mock.method(sdk,'reconnect',()=>{captured=capturedRoom(t,sdk);return seat.promise;});
  const reconnecting=f.client.reconnect();await until(()=>!!captured!);
  f.identity('p1');assert.equal(f.client.handleIdentityChange('p1'),true);
  assert.equal(captured!.room.connection.isOpen,false);
  await f.client.leave();seat.resolve(captured!.room);assert.equal(await reconnecting,false);await flush();
  assert.equal(f.client.room,null);assert.equal(f.storage.has(resumeKey),false);assert.equal(rankingClient.getPlayer()?.id,'p1');
});

test('binding rechecks current identity even if its subscription was delayed',async t=>{
  const f=setup(t),seat=deferred<any>();resume(f.storage);
  const sdk=(f.client as any).createReconnectClient();let captured:ReturnType<typeof capturedRoom>;
  t.mock.method(f.client as any,'createReconnectClient',()=>sdk);
  t.mock.method(sdk,'reconnect',()=>{captured=capturedRoom(t,sdk);return seat.promise;});
  const reconnecting=f.client.reconnect();await until(()=>!!captured!);f.identity('p1');seat.resolve(captured!.room);
  assert.equal(await reconnecting,false);assert.equal(captured!.room.connection.isOpen,false);
  assert.equal(f.client.room,null);assert.equal(f.client.view.errorCode,'IDENTITY_CHANGED');
});

test('manual reconnect timeout retires the captured real SDK Room while preserving its retry token',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=setup(t),seat=deferred<any>();resume(f.storage);
  const sdk=(f.client as any).createReconnectClient();let captured:ReturnType<typeof capturedRoom>;
  t.mock.method(f.client as any,'createReconnectClient',()=>sdk);
  t.mock.method(sdk,'reconnect',()=>{captured=capturedRoom(t,sdk);return seat.promise;});
  const reconnecting=f.client.reconnect();await until(()=>!!captured!);t.mock.timers.tick(12000);
  assert.equal(await reconnecting,false);assert.equal(captured!.room.connection.isOpen,false);assert.equal(f.storage.has(resumeKey),true);
  seat.resolve(captured!.room);await flush();assert.equal(captured!.closes(),1);
});

test('late Room creation from a timed-out reconnect cannot steal the next reconnect capture',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const f=setup(t);resume(f.storage);const gate=[deferred<void>(),deferred<void>()],instances:any[]=[];let lateBlocked=0,active:ReturnType<typeof capturedRoom>;
  const create=(f.client as any).createReconnectClient.bind(f.client);
  t.mock.method(f.client as any,'createReconnectClient',()=>{
    const sdk=create(),index=instances.length;instances.push(sdk);
    t.mock.method(sdk,'reconnect',async()=>{await gate[index].promise;try{const captured=capturedRoom(t,sdk);active=captured;return captured.room;}catch(error){lateBlocked++;throw error;}});return sdk;
  });
  const first=f.client.reconnect();await until(()=>instances.length===1);t.mock.timers.tick(12000);assert.equal(await first,false);
  const second=f.client.reconnect();await until(()=>instances.length===2);assert.notEqual(instances[0],instances[1]);
  gate[0].resolve();await flush();assert.equal(lateBlocked,1);assert.equal(f.client.room,null);
  gate[1].resolve();assert.equal(await second,true);assert.equal(f.client.room,active!.room);
});

test('manual cancel blocks a Room created after the old matchmake response arrives',async t=>{
  const f=setup(t),gate=deferred<void>();resume(f.storage);const sdk=(f.client as any).createReconnectClient();let created=false,blocked=false;
  t.mock.method(f.client as any,'createReconnectClient',()=>sdk);
  t.mock.method(sdk,'reconnect',async()=>{created=true;await gate.promise;try{return capturedRoom(t,sdk).room;}catch(error){blocked=true;throw error;}});
  const reconnecting=f.client.reconnect();await until(()=>created);await f.client.leave();assert.equal(await reconnecting,false);
  gate.resolve();await flush();assert.equal(blocked,true);assert.equal(f.client.room,null);
});

test('HTTP admission errors retain both top-level and nested public code and message',async t=>{
  const f=setup(t);let nested=false;
  t.mock.method(globalThis,'fetch',async()=>Response.json(nested?{error:{code:'NESTED_CODE',message:'嵌套错误'}}:{code:'TOP_CODE',message:'顶层错误'},{status:409}));
  await assert.rejects((f.client as any).request('/fixture'),{code:'TOP_CODE',message:'顶层错误'});
  nested=true;await assert.rejects((f.client as any).request('/fixture'),{code:'NESTED_CODE',message:'嵌套错误'});
});

test('only verified pre-queue rejections clear this admission and retain the actionable error',async t=>{
  let code='ADMISSION_ID',nested=false;const f=setup(t,()=>Response.json(nested?{error:{code,message:'加入请求被拒绝'}}:{code,message:'加入请求被拒绝'},{status:400}));
  for(const value of ['ADMISSION_ID','MAP_MISMATCH','TICKET_REQUIRED','INVALID_WEATHER','INVALID_MODE']){
    code=value;nested=!nested;await f.client.join({mode:'pvp'});
    assert.equal(f.client.hasUncertainAdmission(),false,value);assert.equal(f.storage.has(pendingKey),false,value);assert.equal(f.client.view.errorCode,value);
  }
  code='MODE_DISABLED';await f.client.join({mode:'pvp'});assert.equal(f.client.hasUncertainAdmission(),true);assert.equal(f.client.view.errorCode,'ADMISSION_UNCERTAIN');
});

test('admission checking is owned by its cancellable operation and ignores a late result after identity changes',async t=>{
  const result=deferred<Response>(),f=setup(t,url=>url.endsWith('/v1/admission/reconcile')?result.promise:Response.json({}));
  (f.client as any).savePendingAdmission({id:'12345678-1234-1234-1234-123456789012',playerId:'p0',mode:'pvp',variant:'tdm'});
  const checking=f.client.recoverAdmission();assert.equal(f.client.view.errorCode,'ADMISSION_CHECKING');await until(()=>f.requests.some(r=>r.url.endsWith('/v1/admission/reconcile')));
  f.identity('p1');f.client.handleIdentityChange('p1');await f.client.leave();
  const after=f.client.view;result.resolve(Response.json({cleared:true}));assert.equal(await checking,false);
  assert.equal(f.client.view,after);assert.equal(rankingClient.getPlayer()?.id,'p1');assert.equal(f.client.hasUncertainAdmission(),false);
});

test('a failed admission check returns to explicit uncertain state',async t=>{
  const f=setup(t,()=>Response.json({code:'UNAVAILABLE',message:'暂不可用'},{status:503}));
  (f.client as any).savePendingAdmission({id:'12345678-1234-1234-1234-123456789012',playerId:'p0',mode:'pvp',variant:'tdm'});
  assert.equal(await f.client.recoverAdmission(),false);assert.equal(f.client.view.status,'error');assert.equal(f.client.view.errorCode,'ADMISSION_UNCERTAIN');assert.equal(f.client.hasUncertainAdmission(),true);
});

test('leaving remains exclusive while the old SDK acknowledgement is pending',async t=>{
  const f=setup(t),sdk=(f.client as any).createReconnectClient(),captured=capturedRoom(t,sdk),ack=deferred<number>();
  (f.client as any).playerId='p0';(f.client as any).bind(captured.room);
  t.mock.method(captured.room,'leave',()=>ack.promise);
  const leaving=f.client.leave();assert.equal(f.client.view.errorCode,'LEAVING');assert.equal(f.client.view.status,'connecting');
  await f.client.join({mode:'pvp'});assert.equal(await f.client.reconnect(),false);assert.equal(f.requests.length,0);
  t.mock.method(globalThis,'fetch',async()=>Response.json({rooms:[]}));await f.client.refresh();assert.equal(f.client.view.errorCode,'LEAVING');
  ack.resolve(4000);await leaving;assert.equal(f.client.view.status,'lobby');assert.equal(f.client.view.errorCode,undefined);
});

test('an unannounced identity change during admission checking leaves checking state safely',async t=>{
  const f=setup(t);(f.client as any).savePendingAdmission({id:'12345678-1234-1234-1234-123456789012',playerId:'p0',mode:'pvp',variant:'tdm'});
  f.identity('p1');assert.equal(await f.client.recoverAdmission(),false);await f.client.leave();
  assert.equal(f.client.view.status,'lobby');assert.equal(f.client.hasUncertainAdmission(),false);assert.equal(f.requests.length,0);assert.equal(rankingClient.getPlayer()?.id,'p1');
});
