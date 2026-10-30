import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {releaseVerificationPolicy,assertReleaseMapManifest,assertRetainedMapCatalogAudit} from '../scripts/release-verification-policy.mjs';
import {mapCatalogRollbackSources,isRetainedMapApiVersion,prepareCompatibleRollback,verifiedRollbackApi} from '../scripts/rollback-compat.mjs';
import {assertReleasePredecessor} from '../scripts/release-predecessor.mjs';
import {verifiedDeploymentEvidence} from '../scripts/register-verified-deployment.mjs';
import {resolveDeploymentTarget} from '../scripts/deployment-target.mjs';

const version='0.10.0',id='20261030T150000Z-0.10.0',policy=releaseVerificationPolicy(version);
const legacy='campus-v17-web-1',hf='hf-r02-web-1',current='web-r01-campus-1';
const registry={schema:1,current,catalogs:Object.fromEntries([legacy,hf,current].map((name,index)=>[name,[{id:'fixture-'+name,label:'Fixture',region:'teaching',position:[index,0,0],floor:0}]]))};
const oldRules={escape:'campus-2026-0.9.0',dafei:'dafei-2026-0.9.0',coop:'coop-2026-0.9.0',tank:'dafei-2026-vehicles-1',scooter:'dafei-2026-vehicles-1'};
const rollbackAudit=()=>({retainsMapCatalogs:true,retainsDrivingApi:false,rollbackMapCatalogId:legacy,retainedMapCatalogId:current,retainedMapCatalogIds:[hf,current],rollbackApiVersion:version,rollbackApiHashVerified:true,rollbackCatalogCounts:{legacy:12,retained:12,catalogs:{[legacy]:12,[hf]:10,[current]:12}},rollbackCurrentRules:{...oldRules}});

test('0.10 policy pins the real protocol, lightweight source, physical revision and three catalog rollback',()=>{
 assert.equal(policy.protocolVersion,'campus-mp-0.9.4');assert.equal(policy.schema,6);assert.equal(policy.mapIndexSchema,1);
 const manifest={sourceVersion:policy.mapSourceVersion,mapCatalogId:current,physicsRevision:policy.physicsRevision,sourceSha256:policy.sourceSha256};
 assert.equal(assertReleaseMapManifest(manifest,policy),true);
 for(const field of Object.keys(manifest))assert.throws(()=>assertReleaseMapManifest({...manifest,[field]:'wrong'},policy));
 assert.equal(assertRetainedMapCatalogAudit(rollbackAudit(),policy),true);
 for(const mutate of [audit=>delete audit.rollbackCatalogCounts.catalogs[hf],audit=>audit.retainedMapCatalogIds=[current],audit=>audit.rollbackCurrentRules.tank=policy.drivingRuleVersion,audit=>audit.rollbackApiVersion='0.9.7']){const bad=rollbackAudit();mutate(bad);assert.throws(()=>assertRetainedMapCatalogAudit(bad,policy));}
 assert.throws(()=>policy.retainedMapCatalogIds.push('unexpected'));assert.deepEqual(releaseVerificationPolicy(version).retainedMapCatalogIds,[hf,current]);
});

test('rollback catalog selection retains all frozen lists and rejects missing HF history',()=>{
 const changes=mapCatalogRollbackSources(JSON.stringify(registry),{version}),next=JSON.parse(changes['dist/site-catalogs.json']);
 assert.equal(next.current,legacy);assert.deepEqual(next.catalogs,registry.catalogs);assert.deepEqual(JSON.parse(changes['dist/sites.json']),registry.catalogs[legacy]);
 for(const missing of [legacy,hf,current]){const bad=structuredClone(registry);delete bad.catalogs[missing];assert.throws(()=>mapCatalogRollbackSources(JSON.stringify(bad),{version}));}
 assert.equal(isRetainedMapApiVersion(version),true);assert.equal(isRetainedMapApiVersion('0.10.1'),false);
 const previous={schema:1,current:hf,catalogs:{[legacy]:registry.catalogs[legacy],[hf]:registry.catalogs[hf]}};
 assert.equal(JSON.parse(mapCatalogRollbackSources(JSON.stringify(previous))['dist/site-catalogs.json']).current,legacy);
});

test('activation checks the reviewed static predecessor and compatible API before changing services',()=>{
 const paths={sites:'/srv/codex/sites'},snapshot={sitePath:paths.sites+'/releases/'+policy.expectedPreviousStaticReleaseId,staticReleaseId:policy.expectedPreviousStaticReleaseId,staticVersion:'0.9.6',apiVersion:'0.9.7',realtimeVersion:'0.9.6',mapCatalogId:legacy,catalogCounts:{[legacy]:12,[hf]:10}};
 assert.equal(assertReleasePredecessor(snapshot,policy,paths),true);
 for(const mutate of [s=>s.staticReleaseId='other',s=>s.sitePath='/srv/codex/sites/releases/wrong',s=>s.apiVersion='0.9.6',s=>s.realtimeVersion='0.9.7',s=>s.mapCatalogId=current,s=>delete s.catalogCounts[hf]]){const bad=structuredClone(snapshot);mutate(bad);assert.throws(()=>assertReleasePredecessor(bad,policy,paths));}
 const retry={...snapshot,apiVersion:version,catalogCounts:{...snapshot.catalogCounts,[current]:12}};assert.equal(assertReleasePredecessor(retry,policy,paths),true);
 delete retry.catalogCounts[current];assert.throws(()=>assertReleasePredecessor(retry,policy,paths));
});

test('same-schema compatibility copy keeps new account API and hashes every retained catalog',{timeout:5000},async()=>{
 const testRoot=fileURLToPath(new URL('./',import.meta.url)),directory=await mkdtemp(path.join(testRoot,'.release-fixture-'));
 try{
  const previous=directory+'/old',next=directory+'/next',service=directory+'/service',guard="if (version > 6) throw Error('Database schema newer than application');";
  for(const root of [previous,next]){await mkdir(root+'/dist',{recursive:true});await writeFile(root+'/dist/db.js',guard);}
  for(const name of ['admin','scripts','vendor']){await mkdir(next+'/'+name);await writeFile(next+'/'+name+'/fixture.txt',name);}
  for(const name of ['accounts.js','account-profile.js','achievements.js','admin-player-accounts.js','map-rules.js'])await writeFile(next+'/dist/'+name,'export const fixture=true;');
  await writeFile(next+'/dist/site-catalogs.json',JSON.stringify(registry));await writeFile(next+'/dist/sites.json',JSON.stringify(registry.catalogs[current]));
  await writeFile(next+'/package.json',JSON.stringify({version,type:'module'}));await writeFile(next+'/package-lock.json','{}');await writeFile(next+'/.npmrc','ignore-scripts=true\n');
  const calls=[],fallback=await prepareCompatibleRollback({previousApi:previous,nextApi:next,releaseId:id,serviceBase:service,node:process.execPath,run:async(...args)=>calls.push(args),toolsBase:directory+'/tools'});
  assert.equal(fallback.retainMapCatalogs,true);assert.equal(fallback.retainDrivingApi,false);assert.equal(fallback.sourceApi,next);assert.deepEqual(fallback.retainedMapCatalogIds,[hf,current]);assert.equal(calls.length,2);
  assert.deepEqual(JSON.parse(await readFile(fallback.path+'/dist/site-catalogs.json','utf8')).catalogs,registry.catalogs);assert.equal(await readFile(previous+'/dist/db.js','utf8'),guard);
  const state={releaseId:id,previous:{api:previous},apiRollback:fallback};assert.equal(await verifiedRollbackApi(state,service),fallback.path);
  await writeFile(fallback.path+'/vendor/fixture.txt','tampered');await assert.rejects(()=>verifiedRollbackApi(state,service));
 }finally{
  const relative=path.relative(testRoot,directory);if(relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(directory).startsWith('.release-fixture-'))throw Error('Unsafe fixture cleanup');await rm(directory,{recursive:true,force:true});
 }
});

function proof(){
 const target=resolveDeploymentTarget('hk'),physical={sourceVersion:current,mapCatalogId:current,physicsRevision:policy.physicsRevision,sourceSha256:policy.sourceSha256,manifestHash:'a'.repeat(64),collisionHash:'b'.repeat(64),navigationHash:'c'.repeat(64),visionHash:'d'.repeat(64),indexSchema:1,physicsResourcesVerified:3,compressedPhysicsResources:0,decodedResourcesVerified:true};
 return{releaseId:id,checkedAt:'2026-10-30T15:01:00Z',passed:true,deploymentTarget:{id:target.id,hostname:target.hostname,address:target.address},checks:[
  ...['https://game.tianhw.top','https://zbqsgz.tianhw.top'].map(site=>({name:'release-manifest',passed:true,site,version,protocolVersion:policy.protocolVersion})),
  {name:'release-protocol',passed:true,releaseId:id,version,protocolVersion:policy.protocolVersion,source:'release-manifest'},
  {name:'api-health',passed:true,version,mapCatalogId:current,ruleVersions:{escape:policy.escapeRuleVersion,dafei:policy.drivingRuleVersion}},
  {name:'retained-operations-config',passed:true,modeCount:7,revision:6},{name:'independent-admin-assets',passed:true,privateEndpointsRejectUnauthenticated:true},
  {name:'map-and-vision-identity',passed:true,...physical},{name:'campus-map-identity',passed:true,...physical,physicsMatchesGame:true},
  ...[['escape',policy.escapeRuleVersion],['dafei',policy.drivingRuleVersion]].map(([mode,ruleVersion])=>({name:'ranking-mode-rule',passed:true,mode,ruleVersion})),
  ...[['escape','campus-2026-0.7.0'],['dafei','dafei-2026-0.7.0'],['escape','campus-2026-0.9.0'],['dafei','dafei-2026-0.9.0'],['escape','campus-hfr02-1'],['dafei','dafei-hfr02-1']].map(([mode,ruleVersion])=>({name:'legacy-board',passed:true,mode,ruleVersion})),
  ...['coop-2026-0.7.0','coop-2026-0.9.0','coop-hfr02-1',policy.coopRuleVersion].map(ruleVersion=>({name:'coop-rule-board',passed:true,ruleVersion})),{name:'cooperation-default-rule',passed:true,ruleVersion:policy.coopRuleVersion},
  ...['w1','w2','w3'].flatMap(worker=>[{name:'worker-health',passed:true,worker,version,protocolVersion:policy.protocolVersion,mapVerified:true},{name:'websocket-transport',passed:true,worker,upgrade:true,ping:true}]),
  {name:'account-page',passed:true,noEngine:true},{name:'legacy-registration-disabled',passed:true,rejected:true},{name:'private-account-endpoints',passed:true,rejected:true},
  {name:'assistant-runtime-safety',passed:true,providerNotPublic:true,adminRequiresAuth:true},{name:'npc-v090-assets',passed:true,images:44,hashesVerified:true},
  ...['bao5','tank','scooter'].map(vehicleId=>({name:'driving-vehicle-board',passed:true,vehicleId,ruleVersion:policy.drivingRuleVersion,vehicleIsolation:true})),
  {name:'runtime-identity',passed:true,apiVersion:version,realtimeVersion:version,realtimeProfile:'production',exactRelease:true},
  {name:'server-audit',passed:true,...rollbackAudit(),state:'published',schema:6,maintenance:false,rollbackCompatible:true,rollbackSiteVersion:'0.9.6',rollbackRealtimeVersion:'0.9.6',rollbackSchemaCeiling:6,integrity:'ok',foreignKeyViolations:0,currentSites:'/srv/codex/sites/releases/'+id,currentApi:'/srv/codex/sites/releases/'+id+'/server-api',currentRealtime:'/srv/codex/sites/releases/'+id+'/server-realtime',operations:{modeCount:7},legacyOriginStatus:null,legacyOriginSkipped:true,legacyOriginSkipReason:'legacy-api-host-not-migrated',rollbackApiVehicleRule:null}
 ]};
}

test('deployment registration accepts only complete schema1 and three-catalog evidence; fixtures never register a release',()=>{
 const now=Date.parse('2026-10-30T15:02:00Z');assert.equal(verifiedDeploymentEvidence(proof(),id,now).protocolVersion,policy.protocolVersion);
 for(const mutate of [r=>delete r.checks.find(row=>row.name==='server-audit').rollbackCatalogCounts.catalogs[hf],r=>r.checks.find(row=>row.name==='campus-map-identity').physicsRevision='wrong',r=>r.checks.find(row=>row.name==='map-and-vision-identity').physicsResourcesVerified=2,r=>r.checks=r.checks.filter(row=>row.name!=='legacy-board'||row.ruleVersion!=='campus-hfr02-1')]){const bad=proof();mutate(bad);assert.throws(()=>verifiedDeploymentEvidence(bad,id,now));}
});
