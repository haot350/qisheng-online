import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedDeploymentEvidence} from '../scripts/register-verified-deployment.mjs';

const id='20261010T140000Z-0.7.0',now=Date.parse('2026-10-10T14:05:00Z');
function evidence(){
  return {releaseId:id,checkedAt:'2026-10-10T14:00:00Z',passed:true,checks:[
    ...['https://game.tianhw.top','https://zbqsgz.tianhw.top'].map(site=>({name:'release-manifest',passed:true,site,version:'0.7.0'})),
    {name:'api-health',passed:true,version:'0.7.0'},
    {name:'retained-operations-config',passed:true,modeCount:7,revision:12,publishedNotifications:3},
    {name:'independent-admin-assets',passed:true,privateEndpointsRejectUnauthenticated:true},
    {name:'map-and-vision-identity',passed:true,visionHash:'a'.repeat(64)},
    ...['w1','w2','w3'].flatMap(worker=>[
      {name:'worker-health',passed:true,worker,version:'0.7.0',protocolVersion:'campus-mp-0.7.0',mapVerified:true},
      {name:'websocket-transport',passed:true,worker},
    ]),
    {name:'server-audit',passed:true,state:'published',schema:5,maintenance:false,rollbackCompatible:true,retainsOperationalRealtime:false,rollbackRealtimeVersion:'0.6.9',rollbackSiteVersion:'0.6.9',integrity:'ok',foreignKeyViolations:0,currentApi:'/srv/codex/sites/releases/'+id+'/server-api',currentRealtime:'/srv/codex/sites/releases/'+id+'/server-realtime'},
  ]};
}

test('verified new release can be registered without resetting existing notices or mode revision',()=>{
  assert.deepEqual(verifiedDeploymentEvidence(evidence(),id,now),{releaseId:id,version:'Preview 0.7.0',verifiedAt:'2026-10-10T14:00:00Z',sites:['game','campus','backend']});
});

test('registration rejects missing vision, stale protocol, unmatched worker map and stale API evidence',()=>{
  for(const mutate of [
    r=>r.checks=r.checks.filter(c=>c.name!=='map-and-vision-identity'),
    r=>r.checks.find(c=>c.name==='map-and-vision-identity').visionHash='',
    r=>r.checks.find(c=>c.name==='worker-health').protocolVersion='campus-mp-0.6.9',
    r=>r.checks.find(c=>c.name==='worker-health').mapVerified=false,
    r=>r.checks.find(c=>c.name==='api-health').version='0.6.9',
    r=>r.checks.find(c=>c.name==='server-audit').rollbackRealtimeVersion='0.7.0',
    r=>delete r.checks.find(c=>c.name==='server-audit').rollbackSiteVersion,
    r=>{const row=r.checks.find(c=>c.name==='server-audit');row.retainsOperationalRealtime=true;row.rollbackRealtimeVersion='0.7.0';},
    r=>{const row=r.checks.find(c=>c.name==='server-audit');row.rollbackRealtimeVersion='unknown';row.rollbackSiteVersion='unknown';},
  ]){const report=evidence();mutate(report);assert.throws(()=>verifiedDeploymentEvidence(report,id,now));}
});
