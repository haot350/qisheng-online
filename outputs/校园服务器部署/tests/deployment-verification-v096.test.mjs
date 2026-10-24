import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {verifiedDeploymentEvidence} from '../scripts/register-verified-deployment.mjs';
import {resolveDeploymentTarget} from '../scripts/deployment-target.mjs';
import {prepareCompatibleRollback,verifiedRollbackApi} from '../scripts/rollback-compat.mjs';

const id='20261024T150000Z-0.9.6',version='0.9.6',protocolVersion='campus-mp-0.9.4',now=Date.parse('2026-10-24T15:01:00Z');
function evidence(){const target=resolveDeploymentTarget('hk');return{releaseId:id,checkedAt:'2026-10-24T15:00:00Z',passed:true,deploymentTarget:{id:target.id,hostname:target.hostname,address:target.address},checks:[
 ...['https://game.tianhw.top','https://zbqsgz.tianhw.top'].map(site=>({name:'release-manifest',passed:true,site,version,protocolVersion})),
 {name:'release-protocol',passed:true,releaseId:id,version,protocolVersion,source:'release-manifest'},
 {name:'api-health',passed:true,version},{name:'retained-operations-config',passed:true,modeCount:7,revision:6},{name:'independent-admin-assets',passed:true,privateEndpointsRejectUnauthenticated:true},
 {name:'map-and-vision-identity',passed:true,sourceVersion:'v16',manifestHash:'a'.repeat(64),collisionHash:'b'.repeat(64),navigationHash:'c'.repeat(64),visionHash:'d'.repeat(64)},
 ...[['escape','campus-2026-0.9.0'],['dafei','dafei-2026-0.9.0']].map(([mode,ruleVersion])=>({name:'ranking-mode-rule',passed:true,mode,ruleVersion})),
 ...[['escape','campus-2026-0.7.0'],['dafei','dafei-2026-0.7.0']].map(([mode,ruleVersion])=>({name:'legacy-board',passed:true,mode,ruleVersion})),
 ...['coop-2026-0.9.0','coop-2026-0.7.0'].map(ruleVersion=>({name:'coop-rule-board',passed:true,ruleVersion})),{name:'cooperation-default-rule',passed:true,ruleVersion:'coop-2026-0.9.0'},
 ...['w1','w2','w3'].flatMap(worker=>[{name:'worker-health',passed:true,worker,version,protocolVersion,mapVerified:true},{name:'websocket-transport',passed:true,worker,upgrade:true,ping:true}]),
 {name:'account-page',passed:true,noEngine:true},{name:'legacy-registration-disabled',passed:true,rejected:true},{name:'private-account-endpoints',passed:true,rejected:true},
 {name:'assistant-runtime-safety',passed:true,providerNotPublic:true,adminRequiresAuth:true},{name:'npc-v090-assets',passed:true,images:44,hashesVerified:true},
 ...['bao5','tank','scooter'].map(vehicleId=>({name:'driving-vehicle-board',passed:true,vehicleId,vehicleIsolation:true,ruleVersion:vehicleId==='bao5'?'dafei-2026-0.9.0':'dafei-2026-vehicles-1'})),
 {name:'runtime-identity',passed:true,apiVersion:version,realtimeVersion:version,realtimeProfile:'production',exactRelease:true},
 {name:'server-audit',passed:true,state:'published',schema:6,maintenance:false,rollbackCompatible:true,rollbackSiteVersion:'0.9.5',rollbackRealtimeVersion:'0.9.5',rollbackSchemaCeiling:6,integrity:'ok',foreignKeyViolations:0,currentSites:'/srv/codex/sites/releases/'+id,currentApi:'/srv/codex/sites/releases/'+id+'/server-api',currentRealtime:'/srv/codex/sites/releases/'+id+'/server-realtime',operations:{modeCount:7},legacyOriginStatus:null,legacyOriginSkipped:true,legacyOriginSkipReason:'legacy-api-host-not-migrated',retainsDrivingApi:true,rollbackApiVersion:version,rollbackApiHashVerified:true,rollbackApiVehicleRule:'dafei-2026-vehicles-1'},
]};}
const row=(r,name)=>r.checks.find(c=>c.name===name);
test('0.9.6 proof keeps actual protocol, per-vehicle boards and independently verified semantic API fallback',()=>{
 assert.equal(verifiedDeploymentEvidence(evidence(),id,now).protocolVersion,protocolVersion);
 for(const mutate of [r=>row(r,'release-protocol').protocolVersion='campus-mp-0.9.6',r=>row(r,'driving-vehicle-board').vehicleIsolation=false,r=>r.checks.splice(r.checks.findIndex(c=>c.name==='driving-vehicle-board'),1),r=>row(r,'server-audit').retainsDrivingApi=false,r=>row(r,'server-audit').rollbackApiVersion='0.9.5',r=>row(r,'server-audit').rollbackApiHashVerified=false,r=>row(r,'server-audit').currentSites='/srv/codex/sites/releases/wrong',r=>row(r,'runtime-identity').realtimeProfile='demo']){
  const bad=evidence();mutate(bad);assert.throws(()=>verifiedDeploymentEvidence(bad,id,now));
 }
});
test('same-schema vehicle fallback retains hashed new API without weakening guards or selecting old API',async t=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'openqs-vehicle-fallback-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const previous=base+'/old',next=base+'/next',service=base+'/service',guard="if (version > 6) throw Error('Database schema newer than application');";
 for(const root of [previous,next]){await mkdir(root+'/dist',{recursive:true});await writeFile(root+'/dist/db.js',guard);}
 for(const dir of ['admin','scripts','vendor']){await mkdir(next+'/'+dir);await writeFile(next+'/'+dir+'/fixture.txt',dir);}
 for(const file of ['accounts.js','account-profile.js','achievements.js','admin-player-accounts.js'])await writeFile(next+'/dist/'+file,'export const fixture=true;');
 await writeFile(next+'/package.json',JSON.stringify({version,type:'module'}));await writeFile(next+'/package-lock.json','{}');await writeFile(next+'/.npmrc','ignore-scripts=true\n');
 const calls=[],fallback=await prepareCompatibleRollback({previousApi:previous,nextApi:next,releaseId:id,serviceBase:service,node:process.execPath,run:async(...args)=>calls.push(args),toolsBase:base+'/tools'});
 assert.equal(fallback.retainDrivingApi,true);assert.equal(fallback.from,6);assert.equal(fallback.to,6);assert.equal(fallback.sourceApi,next);assert.equal(calls.length,2);assert.equal(await readFile(previous+'/dist/db.js','utf8'),guard);assert(fallback.files.some(row=>row.path==='.npmrc'));assert.equal(await readFile(fallback.path+'/.npmrc','utf8'),'ignore-scripts=true\n');
 const state={releaseId:id,previous:{api:previous},apiRollback:fallback};assert.equal(await verifiedRollbackApi(state,service),fallback.path);
 await writeFile(fallback.path+'/vendor/fixture.txt','tampered');await assert.rejects(()=>verifiedRollbackApi(state,service));
});
