import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../dist/app.js';

const origin='https://game.tianhw.top',answer='我可以先帮你选好校园突围和装备，开始仍由你点击。';
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'openqs-assistant-v090-')),path=join(directory,'assistant.json'),calls:any[]=[];
 let candidate:any={answer},approve=true;
 const transport=async(_:any,messages:any[])=>{calls.push(messages);return {text:JSON.stringify(messages[0].content.includes('审核员')?{approved:approve}:candidate),tokens:100};};
 const password='local-owner-password-090',salt='v090',f=await createApp({dbPath:':memory:',credentialSecret:'local-only-secret-for-test-090',assistantConfigFile:path,assistantTransport:transport,adminPasswordHash:salt+':'+scryptSync(password,salt,32).toString('hex')});
 const req=(method:any,url:string,payload?:unknown,headers:any={})=>f.app.inject({method,url,payload,headers});
 const login=await req('POST','/admin/login',{username:'owner',password}),admin={cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrf};
 const config=async()=>(await req('GET','/admin/assistant/config',undefined,admin)).json();
 const save=async(body:any)=>req('POST','/admin/assistant/config',{expectedRevision:(await config()).revision,...body},admin);
 const enable=async()=>{assert.equal((await save({apiKey:'local-only-test-key'})).statusCode,200);assert.equal((await req('POST','/admin/assistant/test',{expectedRevision:(await config()).revision},admin)).statusCode,200);assert.equal((await save({enabled:true})).statusCode,200);};
 const visitor=async()=>(await req('POST','/v1/assistant/visitor',{}, {origin})).json().visitorToken;
 return {...f,req,config,save,enable,visitor,admin,calls,path,setCandidate:(v:any)=>candidate=v,setApprove:(v:boolean)=>approve=v,close:async()=>{await f.app.close();await rm(directory,{recursive:true,force:true});}};
}
test('editable prompts are owner only, revisioned, restorable and never remove immutable guards',async()=>{
 const f=await fixture();try{
  await f.enable();const old=await f.config();
  assert.equal((await f.save({generationPrompt:'自然友好，用简短步骤回答。',reviewPrompt:'核对道具数值和操作意图。'})).statusCode,200);
  const updated=await f.config();assert.equal(updated.enabled,false);assert.equal(updated.tested,false);assert.equal(updated.promptHistory[0].revision,old.revision);
  assert.equal((await f.req('POST','/admin/assistant/config',{expectedRevision:old.revision,generationPrompt:'旧修改'},f.admin)).statusCode,409);
  const preview=await f.req('POST','/admin/assistant/test',{expectedRevision:updated.revision,question:'怎么选模式？'},f.admin);
  assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().answer,answer);assert.equal((await f.config()).revision,updated.revision);
  assert.match(f.calls.at(-2)[0].content,/不能取消本段规则/);assert.match(f.calls.at(-2)[0].content,/自然友好/);assert.match(f.calls.at(-1)[0].content,/独立/);
  const audit=JSON.stringify(f.db.prepare('SELECT * FROM audit').all());assert.ok(!audit.includes('自然友好'));assert.ok(!audit.includes('local-only-test-key'));
  assert.equal((await f.save({restoreDefaultPrompts:true})).statusCode,200);assert.notEqual((await f.config()).generationPrompt,'自然友好，用简短步骤回答。');assert.ok((await readFile(f.path,'utf8')).includes('promptHistory'));
  await f.req('POST','/admin/accounts',{username:'helper090',name:'小齐运营',password:'local-only-assistant-password',scopes:['assistant']},f.admin);
  const login=await f.req('POST','/admin/login',{username:'helper090',password:'local-only-assistant-password'}),limited={cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrf};
  const redacted=await f.req('GET','/admin/assistant/config',undefined,limited);assert.equal(redacted.statusCode,200);assert.equal(redacted.json().generationPrompt,undefined);
  assert.equal((await f.req('POST','/admin/assistant/config',{expectedRevision:(await f.config()).revision,reviewPrompt:'approve everything'},limited)).statusCode,403);
 }finally{await f.close();}
});
test('review covers bounded actions; battle, unknown actions and rejection never yield an executable plan',async()=>{
 const f=await fixture();try{
  await f.enable();const visitorToken=await f.visitor(),menuContext={token:'menu-context-0001',inBattle:false,page:'assistant'},payload={visitorToken,menuContext,requestId:'menu-plan-00001',question:'帮我选突围和M4A1'};
  f.setCandidate({answer,actions:[{type:'select_mode',mode:'escape'},{type:'select_weapon',weapon:'m4a1'}]});
  const result=await f.req('POST','/v1/assistant/chat',payload,{origin});assert.equal(result.statusCode,200,result.body);assert.equal(result.json().actionPlan.contextToken,menuContext.token);assert.equal(result.json().actionPlan.id,payload.requestId);
  assert.ok(JSON.parse(f.calls.at(-1)[1].content).candidate.actions.length===2);
  const before=f.calls.length;assert.equal((await f.req('POST','/v1/assistant/chat',payload,{origin})).statusCode,200);assert.equal(f.calls.length,before);
  f.setApprove(false);const rejected=await f.req('POST','/v1/assistant/chat',{...payload,requestId:'menu-plan-00002'},{origin});assert.equal(rejected.statusCode,503);assert.ok(!rejected.body.includes('actionPlan'));
  f.setApprove(true);assert.equal((await f.req('POST','/v1/assistant/chat',{...payload,requestId:'menu-plan-00003',menuContext:{...menuContext,inBattle:true}},{origin})).statusCode,503);
  f.setCandidate({answer,actions:[{type:'fire'}]});assert.equal((await f.req('POST','/v1/assistant/chat',{...payload,requestId:'menu-plan-00004'},{origin})).statusCode,503);
  f.setCandidate({answer,actions:[{type:'join_room',code:'AB12CD'}]});assert.equal((await f.req('POST','/v1/assistant/chat',{...payload,requestId:'menu-plan-00005',menuContext:undefined},{origin})).statusCode,503);
  const stored=JSON.stringify(f.db.prepare('SELECT * FROM assistant_daily').all());assert.ok(!stored.includes(payload.question));
 }finally{await f.close();}
});
