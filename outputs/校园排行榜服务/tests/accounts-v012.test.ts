import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {mkdtemp,rm,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crc32} from 'node:zlib';
import sharp from 'sharp';
import {createApp,hash,DAY} from '../dist/app.js';
import {openDatabase} from '../dist/db.js';
import {acquireImageJob} from '../dist/image-budget.js';
import {processFeedbackScreenshots} from '../dist/feedback-resolution.js';

async function fixture(admin=false) {
  let time=Date.UTC(2026,10,1),index=0;
  const password='local-admin-fixture',salt='local-avatar';
  const f=await createApp({dbPath:':memory:',clock:()=>time,credentialSecret:'avatar-fixture-private',...(admin?{adminPasswordHash:salt+':'+scryptSync(password,salt,32).toString('hex')}:{})});
  const req=(method:string,url:string,payload?:unknown,token?:string,headers={})=>f.app.inject({method:method as any,url,payload,headers:{...(token?{authorization:'Bearer '+token}:{}),...headers}});
  const seed=()=>{const id='avatar-player-'+(++index),accountId='account-'+index,token='token-'+index;f.db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run(id,'SHORT'+index,'玩家'+index,'recovery-'+index,time);f.db.prepare('INSERT INTO accounts(id,player_id,username,password_hash,recovery_hash,avatar,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(accountId,id,'玩家'+index,'private-password-hash','private-account-recovery-'+index,'initials',time,time);f.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),id,time+30*DAY);return {id,accountId,token,updatedAt:time};};
  return {...f,req,seed,now:()=>time,advance:(ms:number)=>time+=ms,password};
}
const png=async()=> 'data:image/png;base64,'+(await sharp({create:{width:800,height:600,channels:4,background:{r:130,g:80,b:30,alpha:0.6}}}).png().toBuffer()).toString('base64');
const pngChunk=(type:string,data:Buffer)=>{const kind=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);kind.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([kind,data])),out.length-4);return out;};
async function animatedPng(){
  const frame=async(background:string)=>{const data=await sharp({create:{width:8,height:8,channels:4,background}}).png().toBuffer();const pieces:Buffer[]=[];for(let at=8;at<data.length;){const n=data.readUInt32BE(at);if(data.toString('ascii',at+4,at+8)==='IDAT')pieces.push(data.subarray(at+8,at+8+n));at+=12+n;}return {header:data.subarray(16,29),image:Buffer.concat(pieces)};};
  const a=await frame('red'),b=await frame('blue'),control=Buffer.alloc(8);control.writeUInt32BE(2);
  const fc=(sequence:number)=>{const data=Buffer.alloc(26);data.writeUInt32BE(sequence);data.writeUInt32BE(8,4);data.writeUInt32BE(8,8);data.writeUInt16BE(1,20);data.writeUInt16BE(10,22);return pngChunk('fcTL',data);};
  const fd=Buffer.alloc(4);fd.writeUInt32BE(2);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',a.header),pngChunk('acTL',control),fc(0),pngChunk('IDAT',a.image),fc(1),pngChunk('fdAT',Buffer.concat([fd,b.image])),pngChunk('IEND',Buffer.alloc(0))]);
}

test('single-frame formats, pixel and payload boundaries reject animated and oversized uploads',async()=>{
  const f=await fixture();try{
    const a=f.seed();let revision=a.updatedAt;
    for(const format of ['jpeg','webp'] as const){const bytes=await sharp({create:{width:16,height:16,channels:3,background:'orange'}}).toFormat(format).toBuffer();const r=await f.req('POST','/v1/accounts/avatar',{dataUrl:'data:image/'+format+';base64,'+bytes.toString('base64'),expectedUpdatedAt:revision},a.token);assert.equal(r.statusCode,200,r.body);revision=r.json().account.updatedAt;}
    const webp=await sharp(Buffer.concat([Buffer.alloc(256,200),Buffer.alloc(256,80)]),{raw:{width:8,height:16,channels:4,pageHeight:8}}).webp({loop:0,delay:[100,100]}).toBuffer();assert.equal((await sharp(webp).metadata()).pages,2);
    for(const [format,bytes] of [['png',await animatedPng()],['webp',webp]] as const){const r=await f.req('POST','/v1/accounts/avatar',{dataUrl:'data:image/'+format+';base64,'+bytes.toString('base64'),expectedUpdatedAt:revision},a.token);assert.equal(r.statusCode,400,r.body);assert.match(r.json().error.message,/静态/);}
    const oversized='data:image/png;base64,'+Buffer.alloc(5*1024*1024+1).toString('base64');assert.equal((await f.req('POST','/v1/accounts/avatar',{dataUrl:oversized,expectedUpdatedAt:revision},a.token)).statusCode,400);
    assert.equal((await f.req('POST','/v1/accounts/avatar',{dataUrl:'x'.repeat(7*1024*1024),expectedUpdatedAt:revision},a.token)).statusCode,413);
    const hugeHeader=Buffer.alloc(13);hugeHeader.writeUInt32BE(5000);hugeHeader.writeUInt32BE(4001,4);hugeHeader[8]=8;hugeHeader[9]=6;
    const huge=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',hugeHeader),pngChunk('IEND',Buffer.alloc(0))]);
    assert.equal((await f.req('POST','/v1/accounts/avatar',{dataUrl:'data:image/png;base64,'+huge.toString('base64'),expectedUpdatedAt:revision},a.token)).statusCode,400);
    assert.equal((f.db.prepare('SELECT count(*) n FROM account_avatars').get() as any).n,1);
  }finally{await f.app.close();}
});

test('normalized avatars follow profile privacy, revisions and fallback selection',async()=>{
  const f=await fixture();try{
    const a=f.seed(),b=f.seed(),upload=await f.req('POST','/v1/accounts/avatar',{dataUrl:await png(),expectedUpdatedAt:a.updatedAt},a.token);
    assert.equal(upload.statusCode,200,upload.body);const identity=upload.json(),image=identity.account.avatarImage;
    assert.ok(image.authenticated);assert.match(image.thumbnailUrl,/^\/api\/v1\/accounts\/avatar/);
    const stored=f.db.prepare('SELECT * FROM account_avatars').get() as any;assert.ok(stored.bytes<=192*1024);
    const full=await sharp(stored.image).metadata(),thumb=await sharp(stored.thumbnail).metadata();assert.equal(full.width,512);assert.equal(full.height,512);assert.equal(thumb.width,96);assert.equal(full.exif,undefined);assert.equal(full.icc,undefined);assert.equal(full.hasAlpha,true);const rgba=await sharp(stored.image).raw().toBuffer();assert.ok(rgba[3]>0&&rgba[3]<255);
    const own=await f.req('GET',image.url.replace('/api',''),undefined,a.token);assert.equal(own.statusCode,200);assert.equal(own.headers['cache-control'],'no-store');
    assert.equal((await f.req('GET',image.url.replace('/api',''),undefined,b.token)).statusCode,404);
    const publicPath='/v1/players/'+a.id+'/avatar?size=96&revision='+image.revision;
    assert.equal((await f.req('GET',publicPath)).statusCode,404);
    const appearances=(await f.req('POST','/v1/players/appearances',{playerIds:[a.id,'unknown']})).json();assert.deepEqual(appearances.items.map((r:any)=>r.avatar),['initials','initials']);assert.ok(appearances.items.every((r:any)=>!r.avatarImage));
    const published=await f.req('PATCH','/v1/accounts/profile',{publicProfile:true,avatar:'preset-2',expectedUpdatedAt:identity.account.updatedAt},a.token);assert.equal(published.statusCode,200,published.body);assert.equal(published.json().account.avatarImage.revision,image.revision);
    assert.equal((await f.req('GET',publicPath)).statusCode,200);assert.ok((await f.req('GET','/v1/profiles/SHORT1')).json().avatarImage);
    assert.equal((await f.req('DELETE','/v1/accounts/avatar',{expectedUpdatedAt:identity.account.updatedAt},a.token)).statusCode,409);
    const removed=await f.req('DELETE','/v1/accounts/avatar',{avatar:'preset-3',expectedUpdatedAt:published.json().account.updatedAt},a.token);assert.equal(removed.statusCode,200,removed.body);assert.equal(removed.json().account.avatar,'preset-3');assert.equal(removed.json().account.avatarImage,undefined);assert.equal((await f.req('GET',publicPath)).statusCode,404);
  }finally{await f.app.close();}
});

test('upload rejects invalid images and a session revoked during processing cannot replace an avatar',async()=>{
  const f=await fixture();try{
    const a=f.seed(),b=f.seed(),dataUrl=await png();let mutation='';
    f.app.addHook('preHandler',async req=>{if(req.routeOptions.url==='/v1/accounts/avatar'&&mutation)setImmediate(()=>mutation==='revoke'?f.db.prepare('DELETE FROM sessions WHERE player_id=?').run(a.id):f.db.prepare('UPDATE accounts SET updated=updated+1 WHERE player_id=?').run(b.id));});
    assert.equal((await f.req('POST','/v1/accounts/avatar',{dataUrl:'data:image/png;base64,AAAA',expectedUpdatedAt:a.updatedAt},a.token)).statusCode,400);
    mutation='revoke';const response=await f.req('POST','/v1/accounts/avatar',{dataUrl,expectedUpdatedAt:a.updatedAt},a.token);assert.equal(response.statusCode,401,response.body);mutation='revision';const conflict=await f.req('POST','/v1/accounts/avatar',{dataUrl,expectedUpdatedAt:b.updatedAt},b.token);assert.equal(conflict.statusCode,409,conflict.body);assert.equal((f.db.prepare('SELECT count(*) n FROM account_avatars').get() as any).n,0);
  }finally{await f.app.close();}
});

test('feedback and avatars share a bounded image budget and upload attempts are capped',async()=>{
  const f=await fixture();try{
    const a=f.seed(),release1=acquireImageJob(),release2=acquireImageJob();
    try{assert.equal((await f.req('POST','/v1/accounts/avatar',{dataUrl:await png(),expectedUpdatedAt:a.updatedAt},a.token)).statusCode,503);await assert.rejects(processFeedbackScreenshots({db:f.db} as any,[{dataUrl:await png()}]),(e:any)=>e.code==='IMAGE_BUSY');}finally{release1();release2();}
    for(let i=0;i<19;i++)assert.equal((await f.req('POST','/v1/accounts/avatar',{dataUrl:'invalid',expectedUpdatedAt:a.updatedAt},a.token)).statusCode,400);
    assert.equal((await f.req('POST','/v1/accounts/avatar',{dataUrl:await png(),expectedUpdatedAt:a.updatedAt},a.token)).statusCode,429);
  }finally{await f.app.close();}
});

test('match pagination remains stable across sources and missing historical metrics stay unknown',async()=>{
  const f=await fixture();try{
    const a=f.seed(),other=f.seed();
    for(let i=0;i<24;i++)f.db.prepare('INSERT INTO runs(id,player_id,client_id,credential_hash,created,expires,config,status,summary,submitted,mode,difficulty,rule_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('run-'+String(i).padStart(2,'0'),a.id,'client-'+i,'credential',f.now(),f.now()+DAY,JSON.stringify({mode:'escape'}),i===0?'review':'ranked',JSON.stringify({score:i}),f.now(), 'escape','standard','rule-one');
    f.db.prepare('INSERT INTO runs(id,player_id,client_id,credential_hash,created,expires,config,status,submitted,mode) VALUES(?,?,?,?,?,?,?,?,?,?)').run('private-other',other.id,'private-client','private',f.now(),f.now()+DAY,'{}','ranked',f.now(),'escape');
    for(const [id,status] of [['multi-private','private'],['multi-public','valid']]){f.db.prepare('INSERT INTO multiplayer_results(id,room_id,mode,rule_version,difficulty,team_count,score,elapsed,won,week,submitted,result,content_hash,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'room','coop','coop-rule','standard',2,50,60,1,'2026-W44',f.now(),'{}',id,status);f.db.prepare('INSERT INTO multiplayer_participants VALUES(?,?,?,?)').run(id,a.id,JSON.stringify({kills:3}),1);}
    f.db.prepare("INSERT INTO achievement_sources VALUES(?,?,?,?,?)").run(a.id,'history','escape',f.now(),JSON.stringify({mode:'escape',elapsed:30}));
    const first=(await f.req('GET','/v1/accounts/matches?limit=20',undefined,a.token)).json();assert.equal(first.items.length,20);assert.ok(first.nextCursor);assert.ok(first.items.every((r:any)=>r.source==='solo'&&r.ruleVersion==='rule-one'));
    f.db.prepare('INSERT INTO runs(id,player_id,client_id,credential_hash,created,expires,config,status,submitted,mode) VALUES(?,?,?,?,?,?,?,?,?,?)').run('newer',a.id,'newer','private',f.now(),f.now()+DAY,'{}','ranked',f.now()+1,'escape');
    const second=(await f.req('GET','/v1/accounts/matches?cursor='+first.nextCursor,undefined,a.token)).json();assert.equal(second.items.length,6);assert.equal(new Set([...first.items,...second.items].map((r:any)=>r.id)).size,26);assert.equal(second.items.find((r:any)=>r.id==='multi-private').published,false);assert.equal(second.items.find((r:any)=>r.id==='multi-public').published,true);assert.equal(second.items.find((r:any)=>r.id==='run-00').canPublish,false);
    const stats=(await f.req('GET','/v1/accounts/profile',undefined,a.token)).json().stats.escape;assert.equal(stats.totalElapsed,30);assert.equal(stats.totalKills,null);assert.equal(stats.wins,null);assert.equal(stats.winsKnownMatches,0);
  }finally{await f.app.close();}
});

test('session activity is throttled and administrator avatar removal requires CSRF and revision',async()=>{
  const f=await fixture(true);try{
    const a=f.seed();await f.req('GET','/v1/accounts/me',undefined,a.token);const initial=f.db.prepare('SELECT * FROM session_details').get() as any;assert.equal(initial.created,null);
    f.advance(240000);await f.req('GET','/v1/accounts/me',undefined,a.token);assert.equal((f.db.prepare('SELECT last_seen FROM session_details').get() as any).last_seen,initial.last_seen);
    f.advance(60001);await f.req('GET','/v1/accounts/me',undefined,a.token);assert.equal((f.db.prepare('SELECT last_seen FROM session_details').get() as any).last_seen,f.now());
    const avatar=(await f.req('POST','/v1/accounts/avatar',{dataUrl:await png(),expectedUpdatedAt:a.updatedAt},a.token)).json().account.avatarImage;
    const login=await f.req('POST','/admin/login',{username:'owner',password:f.password}),cookie=String(login.headers['set-cookie']).split(';')[0],headers={cookie,'x-csrf-token':login.json().csrf};
    const detail=(await f.req('GET','/admin/player-accounts/'+a.id,undefined,undefined,headers)).json(),payload={reason:'移除不合适的头像',expectedRevision:detail.revision};
    assert.equal((await f.req('GET','/admin/player-accounts/'+a.id+'/avatar?size=96&revision='+avatar.revision,undefined,undefined,headers)).statusCode,200);
    assert.equal((await f.req('DELETE','/admin/player-accounts/'+a.id+'/avatar',payload,undefined,{cookie})).statusCode,403);
    assert.equal((await f.req('DELETE','/admin/player-accounts/'+a.id+'/avatar',{...payload,expectedRevision:'stale'},undefined,headers)).statusCode,409);
    assert.equal((await f.req('DELETE','/admin/player-accounts/'+a.id+'/avatar',payload,undefined,headers)).statusCode,200);
    assert.equal((f.db.prepare("SELECT count(*) n FROM audit WHERE action='player-avatar-remove'").get() as any).n,1);
  }finally{await f.app.close();}
});

test('schema 6 migration preserves legacy sessions and schema 7 cascades image deletion',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'qisheng-avatar-migration-'));try{
    const path=join(directory,'test.sqlite');let db=openDatabase(path);db.exec('DROP TABLE account_avatars;DROP TABLE session_details;PRAGMA user_version=6;');db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run('legacy','LEGACY','旧账号','legacy-recovery',1);db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('legacy-session','legacy',9999999999999);db.close();
    db=openDatabase(path);assert.equal(db.pragma('user_version',{simple:true}),7);assert.equal((db.prepare('SELECT count(*) n FROM sessions').get() as any).n,1);db.prepare('INSERT INTO accounts(id,player_id,username,password_hash,recovery_hash,created,updated) VALUES(?,?,?,?,?,?,?)').run('a','legacy','旧账号','p','r',1,1);db.prepare('INSERT INTO account_avatars VALUES(?,?,?,?,?,?)').run('a','rev',Buffer.from('x'),Buffer.from('y'),2,1);db.prepare('DELETE FROM players WHERE id=?').run('legacy');assert.equal((db.prepare('SELECT count(*) n FROM account_avatars').get() as any).n,0);assert.deepEqual(db.pragma('foreign_key_check'),[]);db.close();
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('online backup restores schema 7 avatars, sessions and retained operations without overwriting the source',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'qisheng-avatar-backup-')),path=join(directory,'restore.sqlite'),f=await fixture();let restored:ReturnType<typeof openDatabase>|undefined;
  try{
    const player=f.seed(),uploaded=await f.req('POST','/v1/accounts/avatar',{dataUrl:await png(),expectedUpdatedAt:player.updatedAt},player.token);
    assert.equal(uploaded.statusCode,200,uploaded.body);
    await f.req('GET','/v1/accounts/me',undefined,player.token);
    f.db.prepare('INSERT INTO operations(key,value) VALUES(?,?)').run('fixture-maintenance','original');
    const expected=f.db.prepare('SELECT revision,image,thumbnail,bytes FROM account_avatars WHERE account_id=?').get(player.accountId);
    await f.db.backup(path);
    f.db.prepare('DELETE FROM account_avatars WHERE account_id=?').run(player.accountId);
    f.db.prepare('UPDATE operations SET value=? WHERE key=?').run('later-write','fixture-maintenance');
    restored=openDatabase(path);
    assert.equal(restored.pragma('user_version',{simple:true}),7);
    assert.deepEqual(restored.prepare('SELECT revision,image,thumbnail,bytes FROM account_avatars WHERE account_id=?').get(player.accountId),expected);
    assert.equal((restored.prepare('SELECT value FROM operations WHERE key=?').get('fixture-maintenance') as any).value,'original');
    assert.equal((f.db.prepare('SELECT value FROM operations WHERE key=?').get('fixture-maintenance') as any).value,'later-write');
    assert.equal((restored.prepare('SELECT count(*) n FROM sessions').get() as any).n,1);
    assert.equal((restored.prepare('SELECT count(*) n FROM session_details').get() as any).n,1);
    assert.deepEqual(restored.pragma('foreign_key_check'),[]);
    assert.equal(restored.pragma('integrity_check',{simple:true}),'ok');
  }finally{
    restored?.close();await f.app.close();
    for(const suffix of ['', '-wal', '-shm'])await unlink(path+suffix).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(directory);
  }
});
