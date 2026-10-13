import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {createApp} from '../dist/app.js';

async function fixture(){
  const password='admin-080-fixture-password',salt='admin-080-fixture';
  const f=await createApp({dbPath:':memory:',credentialSecret:'private-fixture-credential',adminPasswordHash:salt+':'+scryptSync(password,salt,32).toString('hex')});
  const req=(method,url,payload?,headers={})=>f.app.inject({method,url,payload,headers});
  const login=await req('POST','/admin/login',{username:'owner',password});
  const owner={cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrf};
  const registered=await req('POST','/v1/accounts/register',{username:'admin080player',password:'player-password-080-local'});
  assert.equal(registered.statusCode,200,registered.body);
  return {...f,req,owner,player:registered.json().player};
}
test('player-account permission remains separate and edits reject stale revisions without exposing credentials',async()=>{
  const f=await fixture();try{
    await f.req('POST','/admin/accounts',{username:'player-moderator',name:'玩家管理员',password:'moderator-local-password',scopes:['players']},f.owner);
    const login=await f.req('POST','/admin/login',{username:'player-moderator',password:'moderator-local-password'}),moderator={cookie:String(login.headers['set-cookie']).split(';')[0]};
    assert.equal((await f.req('GET','/admin/player-accounts',undefined,moderator)).statusCode,403);
    assert.equal((await f.req('GET','/admin/account-appeals',undefined,moderator)).statusCode,403);
    const detail=await f.req('GET','/admin/player-accounts/'+f.player.id,undefined,f.owner);
    assert.equal(detail.statusCode,200,detail.body);assert.ok(!/password_hash|recovery_hash|player-password-080-local/.test(detail.body));
    const revision=detail.json().revision;
    assert.equal((await f.req('POST','/admin/player-accounts/'+f.player.id,{action:'settings',restricted:true,status:'active',publicProfile:false,reason:'人工核验后限制参榜',expectedRevision:revision},f.owner)).statusCode,200);
    assert.equal((await f.req('POST','/admin/player-accounts/'+f.player.id,{action:'settings',restricted:false,reason:'旧窗口的修改',expectedRevision:revision},f.owner)).statusCode,409);
    assert.equal(f.db.prepare('SELECT restricted FROM players WHERE id=?').get(f.player.id).restricted,1);
  }finally{await f.app.close();}
});
test('appeal approval requires owner evidence and raw reset credentials never enter administrator responses',async()=>{
  const f=await fixture();try{
    const time=Date.now();f.db.prepare('INSERT INTO account_appeals(id,username,short_id,message,receipt_hash,status,response,created,updated,reset_used) VALUES(?,?,?,?,?,?,?,?,?,?)').run('private-appeal','admin080player',f.player.shortId,'丢失密码，需要核验独立历史证据。','receipt-hash','received','',time,time,0);
    const absent=await f.req('POST','/admin/account-appeals/private-appeal',{status:'approved',playerId:f.player.id,response:'已经核验，允许重置。',expectedUpdatedAt:time},f.owner);
    assert.equal(absent.statusCode,400,absent.body);
    const approved=await f.req('POST','/admin/account-appeals/private-appeal',{status:'approved',playerId:f.player.id,response:'已经核验独立证据，允许重置。',evidenceConfirmed:true,expectedUpdatedAt:time},f.owner);
    assert.equal(approved.statusCode,200,approved.body);assert.ok(!/resetCode|reset_hash|receipt_hash/.test(approved.body));
    const stored=f.db.prepare('SELECT * FROM account_appeals WHERE id=?').get('private-appeal');assert.match(stored.reset_hash,/^[a-f0-9]{64}$/);assert.ok(stored.reset_expires>Date.now()+23*3600000);
    const list=await f.req('GET','/admin/account-appeals',undefined,f.owner);assert.ok(!list.body.includes(stored.reset_hash));
    assert.equal((await f.req('POST','/admin/account-appeals/private-appeal',{status:'rejected',response:'旧窗口拒绝。',expectedUpdatedAt:time},f.owner)).statusCode,409);
  }finally{await f.app.close();}
});
test('aggregated filters isolate versions and room receipts distinguish queued acknowledgement and timeout',async()=>{
  const f=await fixture();try{
    const day=new Date().toISOString().slice(0,10);for(const version of ['0.8.0','0.7.1'])f.db.prepare('INSERT INTO telemetry_daily VALUES(?,?,?,?,?,?,?,?)').run(day,'page-view','game','escape','desktop',version,'',version==='0.8.0'?3:7);
    const stats=await f.req('GET','/admin/stats?version=0.8.0&mode=escape&platform=desktop',undefined,f.owner);assert.equal(stats.statusCode,200,stats.body);assert.equal(stats.json().daily[0].count,3);
    const now=Date.now();for(const [id,created,acked] of [['waiting',now,0],['done',now,1],['late',now-61000,0]])f.db.prepare('INSERT INTO room_commands(id,room_id,action,reason,created,acked) VALUES(?,?,?,?,?,?)').run(id,'test-room','kick','fixture',created,acked);
    const commands=await f.req('GET','/admin/room-commands',undefined,f.owner);assert.equal(commands.statusCode,200,commands.body);
    assert.deepEqual(Object.fromEntries(commands.json().items.map(r=>[r.id,r.state])),{waiting:'queued',done:'acknowledged',late:'timeout'});
  }finally{await f.app.close();}
});
