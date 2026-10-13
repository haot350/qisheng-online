import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {createApp} from '../dist/app.js';
import {openDatabase} from '../dist/db.js';
import {issueView,issueViews,feedbackView,feedbackViews} from '../dist/feedback.js';
const draft={category:'bug',title:'反馈重复提交测试',message:'网络失败后重试应继续保留同一份反馈及查询凭证。'};
const token=()=>randomBytes(32).toString('base64url');
test('new feedback retries are idempotent, secret-keyed and never store receipt plaintext',async()=>{
 const f=await createApp({dbPath:':memory:',credentialSecret:'test-credential-secret'});
 try{const submissionToken=token(),payload={...draft,submissionToken};
  const [left,right]=await Promise.all([f.app.inject({method:'POST',url:'/v1/feedback',payload}),f.app.inject({method:'POST',url:'/v1/feedback',payload})]);
  assert.equal(left.statusCode,200,left.body);assert.deepEqual(left.json(),right.json());
  assert.equal((f.db.prepare('SELECT count(*) n FROM feedback').get() as any).n,1);
  const stored=JSON.stringify(f.db.prepare('SELECT * FROM feedback_operations').all());
  assert.ok(!stored.includes(submissionToken));assert.ok(!stored.includes(left.json().receiptCode));
  const changed=await f.app.inject({method:'POST',url:'/v1/feedback',payload:{...payload,message:draft.message+'内容变更'}});assert.equal(changed.statusCode,409);
  const wrong=await f.app.inject({method:'POST',url:'/v1/feedback/query',payload:{id:left.json().id,receiptCode:token()}});assert.equal(wrong.statusCode,404);
  const query=await f.app.inject({method:'POST',url:'/v1/feedback/query',payload:left.json()});assert.equal(query.statusCode,200);
  const other=await f.app.inject({method:'POST',url:'/v1/feedback',payload:{...draft,submissionToken:token()}});assert.notEqual(other.json().id,left.json().id);
  const legacy=await f.app.inject({method:'POST',url:'/v1/feedback',payload:draft});assert.equal(legacy.statusCode,200);
  const invalid=await f.app.inject({method:'POST',url:'/v1/feedback',payload:{...draft,submissionToken:'public-short-id'}});assert.equal(invalid.statusCode,400);
 }finally{await f.app.close();}
});
test('same submission token in different identities cannot recover another private receipt',async()=>{
 const f=await createApp({dbPath:':memory:'});try{
  const users=await Promise.all(['测试玩家甲','测试玩家乙'].map(nickname=>f.app.inject({method:'POST',url:'/v1/identity/register',payload:{nickname}})));
  const submissionToken=token(),answers=await Promise.all(users.map(user=>f.app.inject({method:'POST',url:'/v1/feedback',headers:{authorization:'Bearer '+user.json().token},payload:{...draft,submissionToken}})));
  assert.notEqual(answers[0].json().id,answers[1].json().id);assert.notEqual(answers[0].json().receiptCode,answers[1].json().receiptCode);
 }finally{await f.app.close();}
});
test('list metadata batches preserve all public fields without a per-card SQL walk',async()=>{
 const f=await createApp({dbPath:':memory:'});try{
  f.db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run('viewer','VIEWER','测试玩家','recovery',1);
  for(let i=0;i<120;i++){const id='issue-'+i,state=['evaluating','planned','developing','verification','released','wontfix'][i%6];
   f.db.prepare('INSERT INTO issues VALUES(?,?,?,?,?,?,?,?)').run(id,'公开问题标题'+i,'公开的问题描述与摘要'+i,state,null,1,i,1);
   f.db.prepare('INSERT INTO issue_replies VALUES(?,?,?,?,?,?,?)').run('reply-'+i,id,'公开管理员答复'+i,'published',1,2,2);
   f.db.prepare('INSERT INTO issue_votes VALUES(?,?)').run(id,'viewer');
  }
  const rows=f.db.prepare('SELECT * FROM issues ORDER BY updated DESC,id ASC').all() as any[],expected=rows.map(r=>issueView({db:f.db} as any,r,'viewer'));
  const original=f.db.prepare.bind(f.db),queries:string[]=[];(f.db as any).prepare=(sql:string)=>{queries.push(sql);return original(sql);};
  const actual=issueViews({db:f.db} as any,rows,'viewer');assert.deepEqual(actual,expected);assert.ok(queries.length<=6,queries.length+' queries');
  queries.length=0;const response=await f.app.inject({method:'GET',url:'/v1/issues/board'});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().columns.length,6);assert.ok(response.json().columns.every((c:any)=>c.total===20&&c.items.length===20));assert.ok(queries.length<=8,queries.length+' board queries');
 }finally{await f.app.close();}
});
test('identity is read once per request and renewal is thresholded; revoked and expired sessions still fail',async()=>{
 let now=Date.UTC(2026,9,10),lookups=0;const db=openDatabase(':memory:'),prepare=db.prepare.bind(db);
 (db as any).prepare=(sql:string)=>{const statement=prepare(sql);if(sql.includes('sessions JOIN players')){const get=statement.get.bind(statement);statement.get=(...args:unknown[])=>{lookups++;return get(...args);};}return statement;};
 const f=await createApp({db,clock:()=>now});try{
  const registration=(await f.app.inject({method:'POST',url:'/v1/identity/register',payload:{nickname:'阈值续期玩家'}})).json(),headers={authorization:'Bearer '+registration.token};
  const original=f.db.prepare.bind(f.db),queries:string[]=[];(f.db as any).prepare=(sql:string)=>{queries.push(sql);return original(sql);};
  const before=(original('SELECT total_changes() n').get() as any).n,lookupBefore=lookups;
  assert.equal((await f.app.inject({method:'GET',url:'/v1/identity/me',headers})).statusCode,200);
  assert.equal((original('SELECT total_changes() n').get() as any).n,before);assert.equal(lookups-lookupBefore,1); // rate-limit key and route auth share the same request-local result
  now+=2*86400000;await f.app.inject({method:'GET',url:'/v1/identity/me',headers});assert.equal((original('SELECT total_changes() n').get() as any).n,before+1);
  await f.app.inject({method:'GET',url:'/v1/identity/me',headers});assert.equal((original('SELECT total_changes() n').get() as any).n,before+1);
  await f.app.inject({method:'POST',url:'/v1/identity/logout',headers});assert.equal((await f.app.inject({method:'GET',url:'/v1/identity/me',headers})).statusCode,401);
  const second=(await f.app.inject({method:'POST',url:'/v1/identity/register',payload:{nickname:'过期续期玩家'}})).json();now+=31*86400000;
  assert.equal((await f.app.inject({method:'GET',url:'/v1/identity/me',headers:{authorization:'Bearer '+second.token}})).statusCode,401);
 }finally{await f.app.close();db.close();}
});


test('authorized feedback batches retain private boundaries and public releases avoid per-release queries',async()=>{
 const f=await createApp({dbPath:':memory:'});try{
  const ctx={db:f.db} as any;
  for(let i=0;i<20;i++){
   f.db.prepare('INSERT INTO feedback(id,receipt_hash,category,title,message,diagnostics,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run('f-'+i,'hash-'+i,'bug','私人反馈标题'+i,'仅提交者与管理员可见的原文'+i,JSON.stringify({version:'private-diagnostic'}),'closed',i,i+1);
   f.db.prepare('INSERT INTO feedback_replies(feedback_id,message,created) VALUES(?,?,?)').run('f-'+i,'私人答复'+i,i);
   f.db.prepare('INSERT INTO feedback_followups VALUES(?,?,?,?,?)').run('follow-'+i,'f-'+i,'client-'+i,'仅私人可见的补充'+i,i);
   f.db.prepare('INSERT INTO feedback_resolutions VALUES(?,?,?,?,?,?)').run('f-'+i,'answer','已经回复了这个问题',i,null,i);
   f.db.prepare('INSERT INTO feedback_images VALUES(?,?,?,?,?,?)').run('image-'+i,'f-'+i,Buffer.from('private-image'),13,2,2);
  }
  const rows=f.db.prepare('SELECT * FROM feedback ORDER BY created').all() as any[],expectedPublic=rows.map(row=>feedbackView(ctx,row)),expectedPrivate=rows.map(row=>feedbackView(ctx,row,true));
  const original=f.db.prepare.bind(f.db),queries:string[]=[];(f.db as any).prepare=(sql:string)=>{queries.push(sql);return original(sql);};
  assert.deepEqual(feedbackViews(ctx,rows),expectedPublic);assert.ok(queries.length<=3);queries.length=0;
  assert.deepEqual(feedbackViews(ctx,rows,true),expectedPrivate);assert.ok(queries.length<=4);
  assert.ok(feedbackViews(ctx,rows).every(row=>!('message' in row)&&!('images' in row)&&!('diagnostics' in row)));
  for(let i=0;i<100;i++){
   original('INSERT INTO releases VALUES(?,?,?,?,?,?,?)').run('r-'+i,'test-'+i,'2026-10-10','实际公开更新','[]',1,i);
   original('INSERT INTO issues VALUES(?,?,?,?,?,?,?,?)').run('release-issue-'+i,'公开议题标题','公开摘要','released','r-'+i,1,i,1);
   original('INSERT INTO issues VALUES(?,?,?,?,?,?,?,?)').run('private-issue-'+i,'私人议题标题','内部摘要','released','r-'+i,1,i,0);
  }
  queries.length=0;const response=await f.app.inject('/v1/releases');assert.equal(response.statusCode,200,response.body);assert.equal(response.json().items.length,100);assert.ok(queries.length<=2);assert.ok(response.json().items.every((row:any)=>row.issueIds.length===1&&!row.issueIds[0].startsWith('private-')));
 }finally{await f.app.close();}
});


test('anonymous retry after process recreation returns the same private receipt without duplicate screenshots',async()=>{
 const db=openDatabase(':memory:'),options={db,credentialSecret:'persistent-server-secret'},submissionToken=token();
 const png='data:image/png;base64,'+(await sharp({create:{width:8,height:8,channels:4,background:'#fff'}}).png().toBuffer()).toString('base64');
 const payload={...draft,submissionToken,screenshots:[{dataUrl:png}]};let f=await createApp(options);
 try{
  const initial=await f.app.inject({method:'POST',url:'/v1/feedback',payload});assert.equal(initial.statusCode,200,initial.body);await f.app.close();
  f=await createApp(options);const retry=await f.app.inject({method:'POST',url:'/v1/feedback',payload});assert.deepEqual(retry.json(),initial.json());assert.equal((db.prepare('SELECT count(*) n FROM feedback_images').get() as any).n,1);
  assert.equal((await f.app.inject({method:'POST',url:'/v1/feedback/query',payload:retry.json()})).statusCode,200);
 }finally{await f.app.close();db.close();}
});
