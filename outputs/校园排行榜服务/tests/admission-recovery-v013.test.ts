import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp,hash,DAY} from '../dist/app.js';

test('maintenance and restrictions allow owner recovery but recovery credentials cannot open a room',async()=>{
 const f=await createApp({dbPath:':memory:',credentialSecret:'recovery-fixture',serviceSecret:'local-service'}),time=Date.now();
 try{
  f.db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created,restricted) VALUES(?,?,?,?,?,1)').run('p','SHORT','本机玩家','r',time);
  f.db.prepare('INSERT INTO accounts(id,player_id,username,password_hash,recovery_hash,created,updated) VALUES(?,?,?,?,?,?,?)').run('a','p','本机玩家','hash','rh',time,time);
  f.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('local-token'),'p',time+DAY);
  f.db.prepare("INSERT INTO operations VALUES('maintenance','true')").run();
  f.db.prepare("UPDATE mode_availability SET enabled=0 WHERE entry='escape-coop'").run();
  const headers={authorization:'Bearer local-token'},internal={'x-service-token':'local-service'},id='a4f25367-c213-453d-a748-78124a3c89bc';
  const newJoin=()=>f.app.inject({method:'POST',url:'/v1/multiplayer/tickets',headers,payload:{mode:'coop'}});
  assert.equal((await newJoin()).statusCode,403);
  const response=await f.app.inject({method:'POST',url:'/v1/multiplayer/admissions/credential',headers,payload:{admissionId:id,mode:'coop'}});
  assert.equal(response.statusCode,200,response.body);const ticket=response.json().ticket;
  const normal=await f.app.inject({method:'POST',url:'/internal/multiplayer/tickets/consume',headers:internal,payload:{ticket,mode:'coop'}});
  assert.equal(normal.statusCode,403,normal.body);
  const wrong=await f.app.inject({method:'POST',url:'/internal/multiplayer/admissions/consume',headers:internal,payload:{ticket,mode:'coop',admissionId:'00000000-0000-0000-0000-000000000000'}});
  assert.equal(wrong.statusCode,403);
  const payload={ticket,mode:'coop',admissionId:id};
  const consumed=await f.app.inject({method:'POST',url:'/internal/multiplayer/admissions/consume',headers:internal,payload});
  assert.equal(consumed.statusCode,200,consumed.body);assert.equal(consumed.json().player.id,'p');assert.equal(consumed.json().purpose,'reconcile');
  assert.equal((await f.app.inject({method:'POST',url:'/internal/multiplayer/admissions/consume',headers:internal,payload})).statusCode,403);
  assert.equal((await newJoin()).statusCode,403);
  assert.equal((await f.app.inject({method:'POST',url:'/v1/multiplayer/admissions/credential',payload:{admissionId:id,mode:'coop'}})).statusCode,401);
 }finally{await f.app.close();}
});
