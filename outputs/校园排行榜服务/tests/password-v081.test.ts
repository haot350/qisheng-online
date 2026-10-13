import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApp} from '../dist/app.js';

test('six-character passwords work across register, upgrade, change and recovery without breaking old login',async()=>{
 const {app,db}=await createApp({dbPath:':memory:',credentialSecret:'synthetic-password-v081-secret',serviceSecret:'synthetic-password-v081-service'});
 const request=(url:string,payload:unknown,token?:string)=>app.inject({method:'POST',url,payload,headers:token?{authorization:'Bearer '+token}:{}});
 try{
  const short=await request('/v1/accounts/register',{username:'短密码测试',password:'abc12'});assert.equal(short.statusCode,400);
  const tooLong=await request('/v1/accounts/register',{username:'超长密码测试',password:'a'.repeat(129)});assert.equal(tooLong.statusCode,400);
  const registered=await request('/v1/accounts/register',{username:'六位账号',password:'abc123'});assert.equal(registered.statusCode,200,registered.body);const account=registered.json();
  const changed=await request('/v1/accounts/password',{currentPassword:'abc123',newPassword:'next12'},account.token);assert.equal(changed.statusCode,200,changed.body);
  assert.equal((await request('/v1/accounts/login',{username:'六位账号',password:'abc123'})).statusCode,401);
  assert.equal((await request('/v1/accounts/login',{username:'六位账号',password:'next12'})).statusCode,200);
  const recovered=await request('/v1/accounts/recover',{recoveryCode:account.recoveryCode,newPassword:'back12'});assert.equal(recovered.statusCode,200,recovered.body);
  assert.equal((await request('/v1/accounts/login',{username:'六位账号',password:'back12'})).statusCode,200);
  const now=Date.now(),hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run('synthetic-legacy-v081','LEGACY81','原身份测试',hash('synthetic-recovery'),now);
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('synthetic-session'),'synthetic-legacy-v081',now+86400000);
  const upgraded=await request('/v1/accounts/upgrade',{username:'升级六位',password:'new123'},'synthetic-session');assert.equal(upgraded.statusCode,200,upgraded.body);assert.equal(upgraded.json().player.id,'synthetic-legacy-v081');
  const oldPassword='previous long local password';const old=await request('/v1/accounts/register',{username:'原长密码账号',password:oldPassword});assert.equal(old.statusCode,200,old.body);assert.equal((await request('/v1/accounts/login',{username:'原长密码账号',password:oldPassword})).statusCode,200);
 }finally{await app.close();}
});
