import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
import {verifiedDeploymentEvidence} from '../scripts/register-verified-deployment.mjs';
import {hasRestrictedAdminCsp} from '../scripts/admin-csp-policy.mjs';
const id='20261010T120000Z-0.6.9',now=Date.parse('2026-10-10T12:05:00Z');
const fixture=()=>({releaseId:id,checkedAt:'2026-10-10T12:00:00Z',passed:true,checks:[
 ...['https://game.tianhw.top','https://zbqsgz.tianhw.top'].map(site=>({name:'release-manifest',passed:true,site,version:'0.6.9'})),
 {name:'api-health',passed:true,version:'0.6.9'},{name:'clean-operations-config',passed:true,sevenModesOpen:true,publishedNotifications:0},{name:'independent-admin-assets',passed:true,privateEndpointsRejectUnauthenticated:true},
 ...['worker-health','websocket-transport'].flatMap(name=>['w1','w2','w3'].map(worker=>({name,worker,passed:true}))),
 {name:'server-audit',passed:true,state:'published',schema:5,maintenance:false,rollbackCompatible:true,retainsOperationalRealtime:true,integrity:'ok',foreignKeyViolations:0,currentApi:'/srv/codex/sites/releases/'+id+'/server-api',currentRealtime:'/srv/codex/sites/releases/'+id+'/server-realtime'}]});
test('separate strict administrator CSP still blocks inline script/style when the outer site adds a broader policy',()=>{
 const strict="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",site="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'";
 assert(hasRestrictedAdminCsp(strict));assert(hasRestrictedAdminCsp(site+', '+strict));assert(!hasRestrictedAdminCsp(site));assert(!hasRestrictedAdminCsp(strict.replace("style-src 'self'","style-src 'self' 'unsafe-inline'")));assert(!hasRestrictedAdminCsp(null));
});
test('only current completed two-site/API/admin/three-worker verification can create deployment registration proof',()=>{assert.deepEqual(verifiedDeploymentEvidence(fixture(),id,now),{releaseId:id,version:'Preview 0.6.9',verifiedAt:'2026-10-10T12:00:00Z',sites:['game','campus','backend']});});
test('failed checks, stale reports, missing worker, inactive services and unsafe rollback block registration before SSH',()=>{
 const mutations=[r=>{r.passed=false;},r=>{r.releaseId='20261009T120000Z-0.6.8';},r=>{r.checkedAt='2026-10-09T12:00:00Z';},r=>{r.checks[0].passed=false;},r=>{r.checks=r.checks.filter(row=>!(row.name==='worker-health'&&row.worker==='w3'));},r=>{r.checks.find(row=>row.name==='server-audit').schema=4;},r=>{r.checks.find(row=>row.name==='server-audit').currentApi='/old-api';},r=>{r.checks.find(row=>row.name==='server-audit').retainsOperationalRealtime=false;},r=>{r.checks.find(row=>row.name==='clean-operations-config').publishedNotifications=1;}];
 for(const mutate of mutations){const report=fixture();mutate(report);assert.throws(()=>verifiedDeploymentEvidence(report,id,now));}
});
test('generated read-only server audit and deployment registration source are syntactically valid without SSH execution',async()=>{
 for(const script of ['verify-published-v069.mjs','register-verified-deployment.mjs']){
  const source=await readFile(new URL('../scripts/'+script,import.meta.url),'utf8'),match=source.match(/const remote=(`[^`]*`);/);assert(match,'Server script must be explicit');
  const remote=new Function('releaseId','proof','evidenceSha256','return '+match[1])(id,verifiedDeploymentEvidence(fixture(),id,now),'0'.repeat(64));
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:remote,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
 }
});
test('external release verifier uses Node HTTP and WSS and never claims browser rendering',async()=>{
 const source=await readFile(new URL('../scripts/verify-published-v069.mjs',import.meta.url),'utf8');assert(!/playwright|chromium|page\.evaluate|browser\.launch|\.screenshot\(/i.test(source));assert(source.includes('browserVerified:false'));assert(source.includes('https.request('));assert(source.includes('new WebSocket('));
});
