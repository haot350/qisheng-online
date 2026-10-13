import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {defaultGameConfig,MODE_ENTRIES,type Announcement} from '@qisheng/shared/operations';
import {GameConfigStore,GAME_CONFIG_KEY,entryFor,ModeUnavailableError,parseGameConfig} from '../src/game-config-store.ts';
import {retentionStatus,requestRetention} from '../src/storage-retention.ts';

const at=Date.parse('2026-10-10T02:00:00Z');
function memory(){const rows=new Map<string,string>();return {getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>{rows.set(k,v);}};}
function notice(id:string,extra:Partial<Announcement>={}):Announcement{return {id,revision:1,title:id,body:'玩家通知',priority:'normal',audiences:[],startsAt:new Date(at-1000).toISOString(),endsAt:null,publishedAt:new Date(at-1000).toISOString(),...extra};}
test('seven entries resolve separately and a fresh failure allows local play',async()=>{
  assert.deepEqual([entryFor('story'),entryFor('roam'),entryFor('dafei'),entryFor('escape'),entryFor('escape','coop'),entryFor('escape','pvp'),entryFor('escape','pvp','ffa')],MODE_ENTRIES);
  const store=new GameConfigStore('/config',async()=>{throw Error('offline');},memory(),()=>at);
  await store.check('story');assert.equal(store.snapshot().ready,true);assert.ok(MODE_ENTRIES.every(e=>store.available(e)));
});

test('configuration fetch keeps the native global receiver and applies an actual HTTP response',async()=>{
  const config=defaultGameConfig(at);config.revision=2;config.modes.story={enabled:false,reason:'正在维护故事'};config.announcements=[notice('active')];
  const server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(config));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();assert.ok(address&&typeof address==='object');
    let calls=0;
    const nativeReceiver=async function(this:unknown,input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1]){
      assert.equal(this,globalThis,'browser native fetch rejects an unrelated store receiver');calls++;
      return globalThis.fetch.call(globalThis,input,init);
    };
    const store=new GameConfigStore(`http://127.0.0.1:${address.port}/config`,nativeReceiver,memory(),()=>at);
    await store.refresh();assert.equal(calls,1);assert.equal(store.available('story'),false);assert.equal(store.snapshot().config.revision,2);assert.equal(store.active()[0].id,'active');
    assert.deepEqual(store.diagnostics(),{attempts:1,failures:0,lastAttemptAt:at,lastSuccessAt:at,revision:2,lastFailure:null});
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('failed configuration requests retain policy and expose only bounded diagnostic metadata',async()=>{
  const config=defaultGameConfig(at);config.revision=3;config.modes.story.enabled=false;const storage=memory();storage.setItem(GAME_CONFIG_KEY,JSON.stringify({config,savedAt:at}));
  const store=new GameConfigStore('/config',async()=>{throw new TypeError('private response contents must not appear');},storage,()=>at);
  await store.refresh();assert.equal(store.available('story'),false);
  assert.deepEqual(store.diagnostics().lastFailure,{stage:'request',status:null,name:'TypeError'});assert.equal(store.diagnostics().failures,1);
  const copy=store.diagnostics();copy.lastFailure!.name='modified';assert.equal(store.diagnostics().lastFailure!.name,'TypeError');
});
test('offline cache retains a closed mode, without closing independent modes',async()=>{
  const storage=memory(),config=defaultGameConfig(at);config.revision=4;config.modes['escape-tdm']={enabled:false,reason:'正在修复连接'};
  const online=new GameConfigStore('/config',async()=>Response.json(config),storage,()=>at);
  await assert.rejects(online.check('escape-tdm'),e=>e instanceof ModeUnavailableError&&e.message==='正在修复连接');
  const offline=new GameConfigStore('/config',async()=>{throw Error('offline');},storage,()=>at+1000);
  await assert.rejects(offline.check('escape-tdm'),ModeUnavailableError);await offline.check('escape-ffa');
});
test('overlapping refreshes share one request and older or invalid configuration cannot reopen a mode',async()=>{
  const config=defaultGameConfig(at);config.revision=7;config.modes.dafei.enabled=false;
  let requests=0;let respond!:(r:Response)=>void;
  const store=new GameConfigStore('/config',async()=>{requests++;return new Promise(r=>respond=r);},memory(),()=>at);
  const a=store.refresh(),b=store.refresh();assert.equal(a,b);respond(Response.json(config));await a;assert.equal(requests,1);
  const old=defaultGameConfig(at);old.revision=6;const c=store.refresh();respond(Response.json(old));await c;assert.equal(store.available('dafei'),false);
  const d=store.refresh();respond(Response.json({revision:8}));await d;assert.equal(store.available('dafei'),false);
});
test('announcement availability follows server clock, audience and expiry, with important first',async()=>{
  let clock=at-3600000;const config=defaultGameConfig(at);config.announcements=[notice('normal'),notice('important',{priority:'important'}),notice('story',{audiences:['story']}),notice('future',{startsAt:new Date(at+10000).toISOString()}),notice('expired',{endsAt:new Date(at).toISOString()})];
  const store=new GameConfigStore('/config',async()=>Response.json(config),memory(),()=>clock);await store.refresh();
  assert.deepEqual(store.active('roam').map(a=>a.id),['important','normal']);assert.ok(store.active('story').some(a=>a.id==='story'));
  clock+=11000;assert.ok(store.active('roam').some(a=>a.id==='future'));
});
test('malformed persisted policy is ignored and external announcement links are removed',async()=>{
  const storage=memory();storage.setItem(GAME_CONFIG_KEY,'not json');const store=new GameConfigStore('/config',async()=>{throw Error();},storage,()=>at);await store.check('roam');
  const config=defaultGameConfig(at);config.announcements=[notice('external',{link:'//outside.test'}),notice('local',{link:'/?panel=feedback'})];
  const parsed=parseGameConfig(config);assert.equal(parsed.announcements[0].link,null);assert.equal(parsed.announcements[1].link,'/?panel=feedback');
});
test('retention status never requests permission; explicit request reports actual browser result',async()=>{
  let called=0;const storage={persisted:async()=>false,persist:async()=>{called++;return false;}};
  assert.equal(await retentionStatus(storage),'available');assert.equal(called,0);assert.equal(await requestRetention(storage),'denied');assert.equal(called,1);
  assert.equal(await requestRetention({persist:async()=>true}),'granted');assert.equal(await retentionStatus({persisted:async()=>true,persist:async()=>true}),'granted');
  assert.equal(await requestRetention({}),'unsupported');assert.equal(await requestRetention({persist:async()=>{throw Error();}}),'error');
});
