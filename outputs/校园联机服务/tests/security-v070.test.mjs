import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const result=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node',target:'node24'});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));};
const {ServerRewindWindow,sanitizeRewindTick}=await load('../校园逃生游戏/src/multiplayer/shared/rewind.ts');
const {TtlRateLimit}=await load('src/ttl-rate-limit.ts');
test('rewind never accepts an unsent frame or arbitrary history at low RTT',()=>{
 const window=new ServerRewindWindow();assert.equal(window.authorize(98,100,0).accepted,false);
 window.recordSnapshot(80,900);window.recordSnapshot(99,1000);window.recordRTT(30);
 assert.equal(window.authorize(93,100,1010).accepted,true);
 for(const requested of [0,85,100,101,Infinity,NaN,'93']){const value=window.authorize(requested,100,1010);assert.equal(value.accepted,false,String(requested));assert.ok(value.tick>=85&&value.tick<=99);}
 assert.equal(window.authorize(93,100,1600).reason,'stale');
 window.reset();assert.equal(window.authorize(93,100,1600).reason,'unsent');
});
test('real high RTT, jitter and adaptive rendering retain bounded legal frames',()=>{
 const window=new ServerRewindWindow();window.recordSnapshot(180,800);window.recordSnapshot(198,1000);window.recordRTT(200);
 assert.equal(window.authorize(185,200,1010).accepted,true);assert.equal(window.authorize(190,200,1010).accepted,true);
 assert.equal(window.authorize(184,200,1010).accepted,false);assert.equal(window.authorize(198,200,1010).accepted,false);
 window.recordSnapshot(201,1030);assert.ok(window.authorize(189,203,1040).accepted);
 assert.equal(sanitizeRewindTick(-100,5),0);assert.equal(sanitizeRewindTick(500,100),100);assert.equal(sanitizeRewindTick(undefined,100),100);
});

test('first and reconnect baselines cannot authorize history the socket never received',()=>{
 const window=new ServerRewindWindow();window.recordSnapshot(120,1000);window.recordRTT(100);
 assert.deepEqual(window.authorize(111,120,1010),{accepted:false,tick:120,reason:'unsent'});
 window.recordSnapshot(123,1050);
 assert.equal(window.authorize(111,123,1060).accepted,false);
 assert.equal(window.authorize(120,127,1060).accepted,true);
 window.reset();window.recordSnapshot(200,2000);
 assert.deepEqual(window.authorize(193,200,2010),{accepted:false,tick:200,reason:'unsent'});
});
test('per-address rate counters remain bounded without evicting live protection',()=>{
 const limits=new TtlRateLimit(2,100,3);assert.ok(limits.allow('a',0));assert.ok(limits.allow('a',1));assert.equal(limits.allow('a',2),false);
 assert.ok(limits.allow('b',2));assert.ok(limits.allow('c',3));assert.equal(limits.allow('d',4),false);assert.equal(limits.size,3);
 assert.equal(limits.allow('a',5),false);assert.ok(limits.allow('d',104));assert.equal(limits.size,1);assert.ok(limits.allow('a',105));
});
