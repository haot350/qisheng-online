import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../dist/app.js';
import {validateConfig,replay} from '../dist/validation.js';
import {rankingRuleVersion,RANKING_RULE_VERSION,DAFEI_RULE_VERSION,RankingDriveScore,DRIVE_RANKING_RULES} from '../dist/shared.js';
const config={mode:'dafei',ruleVersion:DAFEI_RULE_VERSION,seed:1,weapon:'vehicle',roster:['jiang','meng','xu','luan'],tasks:[],controls:'keyboard',transmission:'auto'};
const LEGACY_DRIVE_RULE='campus-2026-0.4.0';
const summary={won:true,elapsed:300,score:0,hits:0,bestCombo:0,damage:0,controls:'keyboard',transmission:'auto'};
async function fixture(){
 let now=Date.UTC(2026,9,8);const {app,db}=await createApp({dbPath:':memory:',clock:()=>now,credentialSecret:'isolated-rule-test-secret'});
 const identity=(await app.inject({method:'POST',url:'/v1/identity/register',payload:{nickname:'规则试玩'}})).json();
 const request=(method,url,payload?)=>app.inject({method,url,payload,headers:{authorization:'Bearer '+identity.token}});
 return {app,db,identity,request,advance:(n:number)=>now+=n};
}
test('current boards use current rules while archived driving definitions remain immutable',()=>{
 assert.equal(rankingRuleVersion('escape'),RANKING_RULE_VERSION);assert.equal(rankingRuleVersion('dafei'),DAFEI_RULE_VERSION);
 assert.equal(validateConfig(config).ruleVersion,DAFEI_RULE_VERSION);
 assert.throws(()=>validateConfig({...config,ruleVersion:RANKING_RULE_VERSION}));
 assert.equal(validateConfig({...config,ruleVersion:LEGACY_DRIVE_RULE},{allowLegacy:true}).ruleVersion,LEGACY_DRIVE_RULE);
 for(const version of [LEGACY_DRIVE_RULE,'dafei-2026-0.6.5',DAFEI_RULE_VERSION]){const score=new RankingDriveScore(DRIVE_RANKING_RULES[version]);assert.equal(score.hit('a',0),100);assert.equal(score.hit('b',20),200);assert.equal(score.hit('c',40.01),100);score.resetCar();assert.equal(score.score,350);assert.equal(DRIVE_RANKING_RULES[version].durability,400);assert.ok(Object.isFrozen(DRIVE_RANKING_RULES[version]));}
 assert.throws(()=>validateConfig({...config,mode:'escape',ruleVersion:DAFEI_RULE_VERSION},{allowLegacy:true}));
 for(const ruleVersion of ['unknown','toString','__proto__'])assert.throws(()=>replay({...config,ruleVersion},[],summary));
});
test('new driving issuance rejects old rules while an already issued credential retries and finalizes under its stored rule',async()=>{
 const f=await fixture();try{
  const old={...config,ruleVersion:LEGACY_DRIVE_RULE};
  assert.equal((await f.request('POST','/v1/runs',{clientRunId:'new-legacy-denied',config:old})).statusCode,400);
  const issued=(await f.request('POST','/v1/runs',{clientRunId:'existing-legacy-run',config})).json();assert.ok(issued.runId);
  // Represents a credential signed before deployment: identity, credential hash and original creation/expiry stay intact.
  f.db.prepare('UPDATE runs SET config=?,rule_version=? WHERE id=?').run(JSON.stringify(old),LEGACY_DRIVE_RULE,issued.runId);
  const retry=await f.request('POST','/v1/runs',{clientRunId:'existing-legacy-run',config:old});assert.equal(retry.statusCode,200,retry.body);assert.deepEqual(retry.json(),issued);
  assert.equal((await f.request('POST','/v1/runs',{clientRunId:'existing-legacy-run',config:{...old,seed:2}})).statusCode,409);
  assert.equal((await f.request('POST','/v1/runs/'+issued.runId+'/events',{credential:issued.credential,events:[]})).statusCode,200);
  const done=await f.request('POST','/v1/runs/'+issued.runId+'/finalize',{credential:issued.credential,eventCount:0,summary});assert.equal(done.statusCode,200,done.body);assert.equal(done.json().status,'ranked');
  const current=(await f.request('GET','/v1/boards?mode=dafei&period=all')).json();assert.equal(current.ruleVersion,DAFEI_RULE_VERSION);assert.equal(current.total,0);assert.deepEqual(new Set(current.versions),new Set([DAFEI_RULE_VERSION,LEGACY_DRIVE_RULE]));
  const archived=(await f.request('GET','/v1/boards?mode=dafei&period=all&ruleVersion='+LEGACY_DRIVE_RULE)).json();assert.equal(archived.total,1);assert.equal(archived.entries[0].ruleVersion,LEGACY_DRIVE_RULE);
  const escape=(await f.request('GET','/v1/boards?mode=escape&period=all')).json();assert.equal(escape.ruleVersion,RANKING_RULE_VERSION);assert.deepEqual(escape.versions,[RANKING_RULE_VERSION]);
 }finally{await f.app.close();}
});
test('old signed credentials expire at the same authoritative twenty-four-hour boundary',async()=>{
 const f=await fixture();try{
  const issued=(await f.request('POST','/v1/runs',{clientRunId:'expired-legacy-run',config})).json(),old={...config,ruleVersion:LEGACY_DRIVE_RULE};f.db.prepare('UPDATE runs SET config=?,rule_version=? WHERE id=?').run(JSON.stringify(old),LEGACY_DRIVE_RULE,issued.runId);
  f.advance(86400001);
  assert.equal((await f.request('POST','/v1/runs',{clientRunId:'expired-legacy-run',config:old})).statusCode,410);
  assert.equal((await f.request('POST','/v1/runs/'+issued.runId+'/events',{credential:issued.credential,events:[]})).statusCode,410);
  assert.equal((await f.request('POST','/v1/runs/'+issued.runId+'/finalize',{credential:issued.credential,eventCount:0,summary})).statusCode,410);
 }finally{await f.app.close();}
});
