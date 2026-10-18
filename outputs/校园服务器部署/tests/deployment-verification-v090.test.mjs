import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedDeploymentEvidence} from '../scripts/register-verified-deployment.mjs';
import {resolveDeploymentTarget} from '../scripts/deployment-target.mjs';
const id='20261017T130000Z-0.9.0',protocolVersion='campus-mp-0.9.0',now=Date.parse('2026-10-17T13:01:00Z');
function evidence(){const target=resolveDeploymentTarget('hk');return{releaseId:id,checkedAt:'2026-10-17T13:00:00Z',passed:true,deploymentTarget:{id:target.id,hostname:target.hostname,address:target.address},checks:[
 ...['https://game.tianhw.top','https://zbqsgz.tianhw.top'].map(site=>({name:'release-manifest',passed:true,site,releaseId:id,version:'0.9.0',protocolVersion})),
 {name:'release-protocol',passed:true,releaseId:id,version:'0.9.0',protocolVersion,source:'release-manifest'},
 {name:'api-health',passed:true,version:'0.9.0'},{name:'retained-operations-config',passed:true,modeCount:7,revision:6},{name:'independent-admin-assets',passed:true,privateEndpointsRejectUnauthenticated:true},
 {name:'map-and-vision-identity',passed:true,sourceVersion:'v16',manifestHash:'a'.repeat(64),collisionHash:'b'.repeat(64),navigationHash:'c'.repeat(64),visionHash:'d'.repeat(64)},
 ...[['escape','campus-2026-0.9.0'],['dafei','dafei-2026-0.9.0']].map(([mode,ruleVersion])=>({name:'ranking-mode-rule',passed:true,mode,ruleVersion})),
 ...[['escape','campus-2026-0.7.0'],['dafei','dafei-2026-0.7.0']].map(([mode,ruleVersion])=>({name:'legacy-board',passed:true,mode,ruleVersion})),
 ...['coop-2026-0.9.0','coop-2026-0.7.0'].map(ruleVersion=>({name:'coop-rule-board',passed:true,ruleVersion})),{name:'cooperation-default-rule',passed:true,ruleVersion:'coop-2026-0.9.0'},
 ...['w1','w2','w3'].flatMap(worker=>[{name:'worker-health',passed:true,worker,version:'0.9.0',protocolVersion,mapVerified:true},{name:'websocket-transport',passed:true,worker,upgrade:true,ping:true}]),
 {name:'account-page',passed:true,noEngine:true},{name:'legacy-registration-disabled',passed:true,rejected:true},{name:'private-account-endpoints',passed:true,rejected:true},
 {name:'assistant-runtime-safety',passed:true,providerNotPublic:true,adminRequiresAuth:true},{name:'npc-v090-assets',passed:true,images:44,hashesVerified:true},
 {name:'server-audit',passed:true,state:'published',schema:6,maintenance:false,rollbackCompatible:true,rollbackSiteVersion:'0.8.4',rollbackRealtimeVersion:'0.8.4',rollbackSchemaCeiling:6,integrity:'ok',foreignKeyViolations:0,currentApi:'/srv/codex/sites/releases/'+id+'/server-api',currentRealtime:'/srv/codex/sites/releases/'+id+'/server-realtime',operations:{modeCount:7},legacyOriginStatus:null,legacyOriginSkipped:true,legacyOriginSkipReason:'legacy-api-host-not-migrated'},
 ]};}
const row=(report,name)=>report.checks.find(r=>r.name===name);
test('0.9.0 registration accepts exact new protocol/rules with old data, NPC hashes and compatible 0.8.4 rollback',()=>{
 const proof=verifiedDeploymentEvidence(evidence(),id,now);assert.equal(proof.version,'Preview 0.9.0');assert.equal(proof.protocolVersion,protocolVersion);assert.deepEqual(proof.sites,['game','campus','backend']);
});
test('0.9.0 rejects stale protocol/rules, missing assets, unsafe assistant and wrong rollback without weakening older contracts',()=>{
 for(const mutate of [
  r=>row(r,'release-protocol').protocolVersion='campus-mp-0.8.2',
  r=>row(r,'ranking-mode-rule').ruleVersion='campus-2026-0.7.0',
  r=>row(r,'cooperation-default-rule').ruleVersion='coop-2026-0.7.0',
  r=>row(r,'legacy-board').ruleVersion='unrelated',
  r=>row(r,'npc-v090-assets').images=42,
  r=>row(r,'npc-v090-assets').hashesVerified=false,
  r=>row(r,'assistant-runtime-safety').providerNotPublic=false,
  r=>row(r,'server-audit').rollbackRealtimeVersion='0.8.3',
  r=>row(r,'server-audit').schema=5,
  r=>row(r,'server-audit').rollbackSchemaCeiling=5,
  r=>row(r,'worker-health').protocolVersion='campus-mp-0.8.2',
 ]){const report=evidence();mutate(report);assert.throws(()=>verifiedDeploymentEvidence(report,id,now));}
});

for(const [version,protocol,rollback] of [['0.9.3','campus-mp-0.9.0','0.9.2'],['0.9.4','campus-mp-0.9.4','0.9.3']]){
 test(version+' registration retains privacy/data checks and enforces its exact protocol and rollback',()=>{
  const releaseId=id.replace('0.9.0',version);
  const report=JSON.parse(JSON.stringify(evidence()).replaceAll(id,releaseId));
  report.releaseId=releaseId;
  for(const check of report.checks){if(check.version==='0.9.0')check.version=version;if(check.protocolVersion)check.protocolVersion=protocol;}
  Object.assign(row(report,'server-audit'),{rollbackSiteVersion:rollback,rollbackRealtimeVersion:rollback});
  assert.equal(verifiedDeploymentEvidence(report,releaseId,now).protocolVersion,protocol);
  for(const mutate of [r=>row(r,'release-protocol').protocolVersion='campus-mp-wrong',r=>row(r,'server-audit').rollbackRealtimeVersion='0.8.4',r=>row(r,'private-account-endpoints').rejected=false]){
   const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifiedDeploymentEvidence(bad,releaseId,now));
  }
 });
}
