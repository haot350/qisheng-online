import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const game=new URL('../outputs/校园逃生游戏/',import.meta.url),realtimeRequire=createRequire(new URL('../outputs/校园联机服务/package.json',import.meta.url));
const realtimeOnly=process.argv.includes('--realtime-only');if(process.argv.slice(2).some(arg=>arg!=='--realtime-only'))throw Error('Usage: node scripts/check-demo.mjs [--realtime-only]');
const {WebSocket}=createRequire(realtimeRequire.resolve('@colyseus/ws-transport'))('ws');
const bytes=await readFile(new URL('demo/arena.json',game)),arena=JSON.parse(bytes.toString()),checks=[];
const health=await fetch('http://127.0.0.1:2577/health').then(r=>r.json());assert.equal(health.sourceVersion,'openqs-demo-v1');assert.equal(health.protocol,'openqs-demo-ws-v1');assert.equal(health.arenaHash,createHash('sha256').update(bytes).digest('hex'));checks.push('genuine-demo-map-identity');
const origin='http://127.0.0.1:5180',api='http://127.0.0.1:8792';
async function request(route,body,token){return fetch(api+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
if(!realtimeOnly){const password='Synthetic-OpenQS-'+randomBytes(8).toString('hex'),username='demo_'+randomBytes(5).toString('hex');
const registered=await request('/v1/accounts/register',{username,password});assert.equal(registered.status,200);assert.equal(registered.headers.get('x-openqs-profile'),'demo');const auth=await registered.json();assert(auth.token);const logged=await request('/v1/accounts/login',{username,password});assert.equal(logged.status,200);const profile=await request('/v1/accounts/profile',undefined,auth.token);assert.equal(profile.status,200);checks.push('actual-isolated-account-register-login-profile');
for(const route of ['/v1/boards','/v1/runs','/v1/multiplayer/join','/internal/multiplayer/status']){const response=await request(route);assert.equal(response.status,403,route);assert.equal((await response.json()).error.code,'DEMO_ONLY');}checks.push('competitive-and-production-admission-denied');
const remote=await fetch(api+'/health',{headers:{Origin:'https://example.invalid'}});assert.equal(remote.status,403);checks.push('foreign-origin-denied');
}
const clients=[];
async function connect(sourceVersion=arena.sourceVersion){const client={ws:new WebSocket('ws://127.0.0.1:2577/',{origin}),id:'',snapshot:null};clients.push(client);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Demo websocket welcome timed out')),3000);client.ws.on('open',()=>client.ws.send(JSON.stringify({type:'hello',sourceVersion})));client.ws.on('message',raw=>{const value=JSON.parse(raw.toString());if(value.type==='snapshot')client.snapshot=value;if(value.type==='welcome'){client.id=value.id;clearTimeout(timer);resolve();}});client.ws.on('error',reject);client.ws.on('close',()=>{if(!client.id){clearTimeout(timer);reject(Error('Identity rejected'));}});});return client;}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 await assert.rejects(connect('v16'));checks.push('formal-map-identity-refused');const a=await connect(),b=await connect();await pause(100);assert(a.snapshot.players.some(p=>p.id===b.id));const start=a.snapshot.players.find(p=>p.id===a.id);
 a.ws.send(JSON.stringify({type:'input',moveX:1,moveY:0,angle:0,fire:false}));await pause(200);a.ws.send(JSON.stringify({type:'input',moveX:0,moveY:0,angle:0,fire:true}));await pause(120);a.ws.send(JSON.stringify({type:'input',moveX:0,moveY:0,angle:0,fire:false}));await pause(80);const end=a.snapshot.players.find(p=>p.id===a.id);assert(end.x>start.x+.2);assert(end.shots>start.shots);assert(end.ammo<start.ammo);assert(b.snapshot.players.find(p=>p.id===a.id).shots>0);checks.push('two-clients-authoritative-movement-and-shared-magazine-fire');
 console.log(JSON.stringify({ok:true,profile:'demo',sourceVersion:health.sourceVersion,arenaHash:health.arenaHash,checks,scope:'Local sandbox only; no formal campus or production-sync claim.'},null,2));
}finally{for(const client of clients)client.ws.close();}
