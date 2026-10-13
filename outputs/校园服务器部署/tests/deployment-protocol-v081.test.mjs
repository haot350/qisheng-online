import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {canonicalProtocolVersion,releaseProtocolVersion,requiresExplicitReleaseProtocol} from '../scripts/release-protocol.mjs';
import {verifiedDeploymentEvidence} from '../scripts/register-verified-deployment.mjs';
import {resolveDeploymentTarget} from '../scripts/deployment-target.mjs';

const id='20261013T120000Z-0.8.1',now=Date.parse('2026-10-13T12:05:00Z');
function evidence(version='0.8.1'){
 const releaseId=id.replace('0.8.1',version),target=resolveDeploymentTarget('hk'),protocolVersion='campus-mp-0.8.0';
 return{releaseId,checkedAt:'2026-10-13T12:00:00Z',passed:true,deploymentTarget:{id:target.id,hostname:target.hostname,address:target.address},checks:[
  ...['https://game.tianhw.top','https://zbqsgz.tianhw.top'].map(site=>({name:'release-manifest',passed:true,site,version,...(version==='0.8.1'?{protocolVersion}:{})})),
  ...(version==='0.8.1'?[{name:'release-protocol',passed:true,releaseId,version,protocolVersion,source:'release-manifest'}]:[]),
  {name:'api-health',passed:true,version},
  {name:'retained-operations-config',passed:true,modeCount:7,revision:5,publishedNotifications:2},
  {name:'independent-admin-assets',passed:true,privateEndpointsRejectUnauthenticated:true},
  {name:'map-and-vision-identity',passed:true,sourceVersion:'v16',manifestHash:'a'.repeat(64),collisionHash:'b'.repeat(64),navigationHash:'c'.repeat(64),visionHash:'d'.repeat(64)},
  ...[['escape','campus-2026-0.7.0'],['dafei','dafei-2026-0.7.0']].map(([mode,ruleVersion])=>({name:'ranking-mode-rule',passed:true,mode,ruleVersion})),
  {name:'coop-rule-board',passed:true,ruleVersion:'coop-2026-0.7.0'},
  ...['w1','w2','w3'].flatMap(worker=>[{name:'worker-health',passed:true,worker,version,protocolVersion,mapVerified:true},{name:'websocket-transport',passed:true,worker,upgrade:true,ping:true}]),
  {name:'account-page',passed:true,noEngine:true},
  {name:'legacy-registration-disabled',passed:true,rejected:true},
  {name:'private-account-endpoints',passed:true,rejected:true},
  {name:'server-audit',passed:true,state:'published',schema:6,maintenance:false,rollbackCompatible:true,rollbackSchemaCeiling:6,rollbackRealtimeVersion:version==='0.8.1'?'0.8.0':'0.7.1',rollbackSiteVersion:version==='0.8.1'?'0.8.0':'0.7.1',integrity:'ok',foreignKeyViolations:0,currentApi:'/srv/codex/sites/releases/'+releaseId+'/server-api',currentRealtime:'/srv/codex/sites/releases/'+releaseId+'/server-realtime',operations:{modeCount:7},legacyOriginStatus:null,legacyOriginSkipped:true,legacyOriginSkipReason:'legacy-api-host-not-migrated'},
 ]};
}

test('public 0.8.1 reads the canonical 0.8.0 wire protocol and its read-only audit programs parse',async()=>{
 const canonical=canonicalProtocolVersion(await readFile(new URL('../../校园共享模块/src/protocol.ts',import.meta.url),'utf8'));
 assert.equal(canonical,'campus-mp-0.8.0');assert.equal(requiresExplicitReleaseProtocol('0.8.1'),true);
 assert.equal(releaseProtocolVersion({version:'0.8.1',protocolVersion:canonical}),canonical);
 assert.equal(releaseProtocolVersion({version:'0.8.0'}),'campus-mp-0.8.0');assert.equal(releaseProtocolVersion({version:'0.7.1'}),'campus-mp-0.7.1');
 for(const manifest of [{version:'0.8.1'},{version:'0.8.1',protocolVersion:'not-a-protocol'},{version:'0.7.1',protocolVersion:canonical}])assert.throws(()=>releaseProtocolVersion(manifest));
 assert.throws(()=>canonicalProtocolVersion("export const PROTOCOL_VERSION='invalid' as const;"));
 const source=await readFile(new URL('../scripts/verify-published-v081.mjs',import.meta.url),'utf8'),template=source.match(/const remote=(`[^`]*`);/);assert(template);
 for(const target of ['hk','us']){const remote=new Function('releaseId','deploymentTarget','return '+template[1])(id,resolveDeploymentTarget(target)),parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:remote,encoding:'utf8',windowsHide:true});assert.equal(parsed.status,0,parsed.stderr);}
});

test('0.8.1 requires explicit retained protocol, target, schema6, scoring, privacy and rollback while 0.8.0 stays strict',()=>{
 const report=evidence();assert.equal(verifiedDeploymentEvidence(report,id,now).protocolVersion,'campus-mp-0.8.0');
 const row=(r,name)=>r.checks.find(c=>c.name===name);
 for(const mutate of [
  r=>r.checks=r.checks.filter(c=>c.name!=='release-protocol'),
  r=>row(r,'release-protocol').protocolVersion='campus-mp-0.8.1',
  r=>row(r,'release-protocol').source='assumed-public-version',
  r=>delete row(r,'release-manifest').protocolVersion,
  r=>row(r,'worker-health').protocolVersion='campus-mp-0.8.1',
  r=>row(r,'api-health').version='0.8.0',
  r=>r.deploymentTarget.hostname='another-host',
  r=>delete r.deploymentTarget,
  r=>row(r,'server-audit').schema=5,
  r=>row(r,'server-audit').rollbackSchemaCeiling=5,
  r=>row(r,'server-audit').rollbackCompatible=false,
  r=>row(r,'server-audit').rollbackSiteVersion='0.7.1',
  r=>row(r,'ranking-mode-rule').ruleVersion='campus-2026-0.8.1',
  r=>row(r,'private-account-endpoints').rejected=false,
  r=>row(r,'server-audit').maintenance=true,
 ]){const invalid=evidence();mutate(invalid);assert.throws(()=>verifiedDeploymentEvidence(invalid,id,now));}
 const old=evidence('0.8.0');assert.equal(verifiedDeploymentEvidence(old,old.releaseId,now).version,'Preview 0.8.0');row(old,'worker-health').protocolVersion='campus-mp-0.8.1';assert.throws(()=>verifiedDeploymentEvidence(old,old.releaseId,now));
});
