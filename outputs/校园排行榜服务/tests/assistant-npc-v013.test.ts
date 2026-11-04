import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {createApp,hash,DAY} from '../dist/app.js';

const origin='https://game.tianhw.top';
test('assistant freezes server-qualified NPC names for both calls without rewriting player text or reviewed output',async()=>{
 const fixtureRoot=resolve('tests'),directory=await mkdtemp(join(fixtureRoot,'.assistant-npc-v013-')),calls:any[]=[];
 let generationHook:(()=>void)|undefined;
 const answer='王迪，你可以先拉开距离。';
 const transport=async(_:any,messages:any[])=>{
  const review=messages[0].content.includes('审核员');calls.push({review,data:JSON.parse(messages[1].content)});
  if(!review&&generationHook){const hook=generationHook;generationHook=undefined;hook();}
  return{text:JSON.stringify(review?{approved:true}:{answer}),tokens:100};
 };
 const time=Date.UTC(2026,10,4),password='local-npc-assistant-owner',salt='npc-assistant';
 const f=await createApp({dbPath:':memory:',clock:()=>time,credentialSecret:'local-assistant-npc-secret',assistantConfigFile:join(directory,'assistant.json'),assistantTransport:transport,adminPasswordHash:salt+':'+scryptSync(password,salt,32).toString('hex')});
 const req=(method:any,url:string,payload?:unknown,headers:any={})=>f.app.inject({method,url,payload,headers});
 const policy=(mode:string,revision:number)=>f.db.prepare("INSERT INTO operations(key,value) VALUES('npc-appearance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({mode,revision,updatedAt:time}));
 try{
  const login=await req('POST','/admin/login',{username:'owner',password}),admin={cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrf};
  const config=async()=>(await req('GET','/admin/assistant/config',undefined,admin)).json();
  const save=async(value:any)=>req('POST','/admin/assistant/config',{expectedRevision:(await config()).revision,...value},admin);
  assert.equal((await save({apiKey:'local-only-npc-test-key'})).statusCode,200);
  assert.equal((await req('POST','/admin/assistant/test',{expectedRevision:(await config()).revision},admin)).statusCode,200);
  assert.equal((await save({enabled:true})).statusCode,200);calls.length=0;
  const visitorToken=(await req('POST','/v1/assistant/visitor',{}, {origin})).json().visitorToken;
  const question='我叫王迪，孟庆升为什么会没收扑克牌？',history=[{question:'我叫王迪。',answer:'王迪，你好。'}];
  const payload={visitorToken,requestId:'npc-fiction-0001',question,history};
  policy('fictional',2);
  // A policy change while generation is running must not change this turn's review knowledge.
  generationHook=()=>policy('real',3);
  const fictional=await req('POST','/v1/assistant/chat',payload,{origin});
  assert.equal(fictional.statusCode,200,fictional.body);assert.equal(fictional.json().answer,answer);
  assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.review),[false,true]);
  assert.equal(calls[0].data.publicKnowledge,calls[1].data.publicKnowledge);
  assert.match(calls[0].data.publicKnowledge,/陈砚舟/);assert.doesNotMatch(calls[0].data.publicKnowledge,/孟庆升/);
  for(const call of calls){assert.equal(call.data.question,question);assert.deepEqual(call.data.history,history);}
  assert.equal(calls[1].data.candidate.answer,answer);
  // Variant belongs to the idempotency fingerprint, so this cannot replay a cached different appearance turn.
  assert.equal((await req('POST','/v1/assistant/chat',payload,{origin})).statusCode,409);
  const real=await req('POST','/v1/assistant/chat',{...payload,requestId:'npc-real-0002'},{origin});
  assert.equal(real.statusCode,200,real.body);assert.match(calls.at(-2).data.publicKnowledge,/孟庆升/);assert.doesNotMatch(calls.at(-2).data.publicKnowledge,/陈砚舟/);
  assert.equal((await req('POST','/v1/assistant/chat',{...payload,requestId:'npc-forged-0003',npcVariant:'fictional'},{origin})).statusCode,400);
  policy('test-code',4);
  const unqualified=await req('POST','/v1/assistant/chat',{...payload,requestId:'npc-visitor-0004'},{origin});
  assert.equal(unqualified.statusCode,200,unqualified.body);assert.match(calls.at(-2).data.publicKnowledge,/陈砚舟/);
  const player='npc-assistant-player',account='npc-assistant-account',token='npc-assistant-token';
  f.db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run(player,'ANPC01','王迪','npc-recovery',time);
  f.db.prepare('INSERT INTO accounts(id,player_id,username,password_hash,recovery_hash,created,updated) VALUES(?,?,?,?,?,?,?)').run(account,player,'王迪','private-hash','private-account-recovery',time,time);
  f.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),player,time+30*DAY);
  f.db.prepare('INSERT INTO npc_test_grants(account_id,code_id,expires,updated,revoked) VALUES(?,NULL,?,?,0)').run(account,time+7*DAY,time);
  const qualified=await req('POST','/v1/assistant/chat',{requestId:'npc-account-0005',question,history},{origin,authorization:'Bearer '+token});
  assert.equal(qualified.statusCode,200,qualified.body);assert.match(calls.at(-2).data.publicKnowledge,/孟庆升/);assert.equal(calls.at(-2).data.question,question);assert.equal(qualified.json().answer,answer);
 }finally{
  await f.app.close();assert(resolve(directory).startsWith(fixtureRoot+sep));await rm(directory,{recursive:true,force:true});
 }
});
