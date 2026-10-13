import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {verifiedDeploymentEvidence, verifiedReportTarget, assertLegacyOriginAudit} from '../scripts/register-verified-deployment.mjs';
import {resolveDeploymentTarget} from '../scripts/deployment-target.mjs';

const id='20261011T140000Z-0.7.1', now=Date.parse('2026-10-11T14:05:00Z');
function evidence(target='hk'){
 const t=resolveDeploymentTarget(target);
 return {releaseId:id,checkedAt:'2026-10-11T14:00:00Z',passed:true,deploymentTarget:{id:t.id,hostname:t.hostname,address:t.address},checks:[
  ...['https://game.tianhw.top','https://zbqsgz.tianhw.top'].map(site=>({name:'release-manifest',passed:true,site,version:'0.7.1'})),
  {name:'api-health',passed:true,version:'0.7.1'},
  {name:'retained-operations-config',passed:true,modeCount:7,revision:24,publishedNotifications:2},
  {name:'independent-admin-assets',passed:true,privateEndpointsRejectUnauthenticated:true},
  {name:'map-and-vision-identity',passed:true,sourceVersion:'v16',manifestHash:'a'.repeat(64),collisionHash:'b'.repeat(64),navigationHash:'c'.repeat(64),visionHash:'d'.repeat(64)},
  ...[['escape','campus-2026-0.7.0'],['dafei','dafei-2026-0.7.0']].map(([mode,ruleVersion])=>({name:'ranking-mode-rule',passed:true,mode,ruleVersion})),
  {name:'coop-rule-board',passed:true,ruleVersion:'coop-2026-0.7.0'},
  ...['w1','w2','w3'].flatMap(worker=>[
   {name:'worker-health',passed:true,worker,version:'0.7.1',protocolVersion:'campus-mp-0.7.1',mapVerified:true},
   {name:'websocket-transport',passed:true,worker,upgrade:true,ping:true},
  ]),
  {name:'server-audit',passed:true,state:'published',schema:5,maintenance:false,rollbackCompatible:true,
   rollbackRealtimeVersion:'0.7.0',rollbackSiteVersion:'0.7.0',integrity:'ok',foreignKeyViolations:0,
   currentApi:'/srv/codex/sites/releases/'+id+'/server-api',currentRealtime:'/srv/codex/sites/releases/'+id+'/server-realtime',
   operations:{modeCount:7},legacyOriginStatus:target==='hk'?null:410,legacyOriginSkipped:target==='hk',legacyOriginSkipReason:target==='hk'?'legacy-api-host-not-migrated':null},
 ]};
}

test('0.7.1 proof accepts retained scoring and operations with the new protocol and all map identities',()=>{
 for(const target of ['hk','us']){
  const report=evidence(target);
  assert.deepEqual(verifiedDeploymentEvidence(report,id,now),{releaseId:id,version:'Preview 0.7.1',verifiedAt:report.checkedAt,sites:['game','campus','backend']});
  assert.doesNotThrow(()=>verifiedReportTarget(report,resolveDeploymentTarget(target)));
 }
});

test('0.7.1 registration rejects old protocol, changed score rules, incomplete map, missing workers and unverified rollback',()=>{
 const row=(r,name)=>r.checks.find(c=>c.name===name);
 for(const mutate of [
  r=>row(r,'api-health').version='0.7.0',
  r=>row(r,'worker-health').protocolVersion='campus-mp-0.7.0',
  r=>row(r,'worker-health').mapVerified=false,
  r=>row(r,'retained-operations-config').modeCount=6,
  r=>row(r,'retained-operations-config').revision=-1,
  r=>row(r,'server-audit').operations.modeCount=6,
  ...['manifestHash','collisionHash','navigationHash','visionHash'].map(key=>r=>delete row(r,'map-and-vision-identity')[key]),
  r=>row(r,'ranking-mode-rule').ruleVersion='campus-2026-0.7.1',
  r=>row(r,'coop-rule-board').ruleVersion='coop-2026-0.7.1',
  r=>r.checks=r.checks.filter(c=>!(c.name==='worker-health'&&c.worker==='w3')),
  r=>row(r,'websocket-transport').ping=false,
  r=>row(r,'server-audit').rollbackRealtimeVersion='0.6.9',
  r=>row(r,'server-audit').rollbackCompatible=false,
  r=>row(r,'server-audit').currentApi='/old-api',
  r=>r.passed=false,
  r=>r.checkedAt='2026-10-10T14:00:00Z',
 ]){const report=evidence();mutate(report);assert.throws(()=>verifiedDeploymentEvidence(report,id,now));}
});

test('HK explicitly records the unmigrated legacy TLS host while US must still demonstrate HTTP410',()=>{
 const row=r=>r.checks.find(c=>c.name==='server-audit');
 assert.doesNotThrow(()=>assertLegacyOriginAudit(row(evidence('hk')),'hk'));
 assert.doesNotThrow(()=>assertLegacyOriginAudit(row(evidence('us')),'us'));
 assert.throws(()=>assertLegacyOriginAudit(row(evidence('hk')),'us'));
 assert.throws(()=>assertLegacyOriginAudit(row(evidence('us')),'hk'));
 for(const value of [{legacyOriginStatus:null,legacyOriginSkipped:true},{legacyOriginStatus:410,legacyOriginSkipped:true,legacyOriginSkipReason:'legacy-api-host-not-migrated'}])assert.throws(()=>assertLegacyOriginAudit(value,'hk'));
 assert.throws(()=>verifiedReportTarget(evidence('hk'),resolveDeploymentTarget('us')));
});

test('generated HK and US audit programs parse without contacting or changing either server',async()=>{
 const source=await readFile(new URL('../scripts/verify-published-v071.mjs',import.meta.url),'utf8');
 const template=source.match(/const remote=(`[^`]*`);/);assert(template);
 for(const target of ['hk','us']){
  const remote=new Function('releaseId','deploymentTarget','return '+template[1])(id,resolveDeploymentTarget(target));
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:remote,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);
 }
});
