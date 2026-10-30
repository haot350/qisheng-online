import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHmac,createHash} from 'node:crypto';
import {prepareSiteCatalogs,selectSiteCatalog} from '../scripts/site-catalogs.mjs';
import * as ranking from '../../校园共享模块/src/ranking.ts';

const base=new URL('../src/',import.meta.url),shared=new URL('../../校园共享模块/',import.meta.url);
const exports=JSON.parse(readFileSync(new URL('package.json',shared),'utf8')).exports;
const installed=JSON.parse(readFileSync(new URL('site-catalogs.json',base),'utf8'));
const legacy=installed.catalogs[ranking.LEGACY_MAP_CATALOG_ID],hf=installed.catalogs[ranking.HF_MAP_CATALOG_ID];
const current=legacy.map(site=>({...site,position:[site.position[0]+3,site.position[1],site.position[2]+3]}));
current.push({id:'fixture-fifth',label:'五层地点',region:'teaching',position:[3,16.4,3],floor:5,buildingId:'north-teaching',levelId:'north-f5'});
current.push({id:'fixture-garage',label:'车库地点',region:'dorm',position:[4,-2.8,4],floor:-1,buildingId:'garage',levelId:'garage-b1'});
const registry={schema:1,current:ranking.MAP_CATALOG_ID,catalogs:{[ranking.LEGACY_MAP_CATALOG_ID]:legacy,[ranking.HF_MAP_CATALOG_ID]:hf,[ranking.MAP_CATALOG_ID]:current}};
const hook=registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith('@qisheng/shared/')){
   const entry=exports['./'+specifier.slice('@qisheng/shared/'.length)];
   if(!entry?.types)throw Error('Unknown candidate shared import '+specifier);
   return{url:new URL(entry.types,shared).href,shortCircuit:true};
  }
  if(specifier.startsWith('.')&&(context.parentURL?.startsWith(base.href)||context.parentURL?.startsWith(shared.href))){
   const target=new URL(specifier,context.parentURL),scope=context.parentURL.startsWith(base.href)?new URL(context.parentURL).search:'';
   if(target.pathname.endsWith('.js'))target.pathname=target.pathname.slice(0,-3)+'.ts';
   if((target.href.startsWith(base.href)||target.href.startsWith(shared.href))&&existsSync(target)){target.search=scope;return{url:target.href,shortCircuit:true};}
  }
  return next(specifier,context);
 },
 load(url,context,next){
  const target=new URL(url);
  if(target.pathname===new URL('site-catalogs.json',base).pathname&&target.searchParams.has('catalog-test'))return{format:'json',source:JSON.stringify({...registry,current:target.searchParams.get('catalog-test')==='rollback'?ranking.LEGACY_MAP_CATALOG_ID:ranking.MAP_CATALOG_ID}),shortCircuit:true};
  return next(url,context);
 }
});
const activeURL=name=>new URL(name+'?catalog-test=active',base).href;
const rollbackURL=name=>new URL(name+'?catalog-test=rollback',base).href;
const active=await import(activeURL('validation.ts')),rollback=await import(rollbackURL('validation.ts'));
const roster=['meng','jiang','xu','luan','xutao','chengguotao','wangwenrui','wangdi','wangyuhan'];
const solo=(ruleVersion,sites,extra={})=>{
 const site=id=>structuredClone(sites.find(site=>site.id===id));
 return{mode:'escape',difficulty:'standard',ruleVersion,seed:1,weapon:'m4a1',controls:'keyboard',roster:[...roster],tasks:[{id:'take',kind:'take',label:'物资',duration:0,radius:2.4,sites:[site('sports-road')]},{id:'activate',kind:'activate',label:'设备',duration:0,radius:2.4,sites:[site('yard'),site('library-west')]},{id:'hold',kind:'hold',label:'守点',duration:15,radius:6,sites:[site('sports-north')]}],...extra};
};
const driving=(ruleVersion,vehicleId='bao5')=>({mode:'dafei',ruleVersion,seed:1,weapon:'vehicle',roster:roster.slice(0,4),tasks:[],controls:'keyboard',transmission:'auto',vehicleId});

test('three map scopes retain old capabilities and keep current records separate',()=>{
 for(const [catalog,escape,coop,drive] of [[ranking.LEGACY_MAP_CATALOG_ID,ranking.LEGACY_ESCAPE_RULE_VERSION,ranking.LEGACY_COOP_RULE_VERSION,ranking.LEGACY_DAFEI_RULE_VERSION],[ranking.HF_MAP_CATALOG_ID,ranking.HF_ESCAPE_RULE_VERSION,ranking.HF_COOP_RULE_VERSION,ranking.HF_DAFEI_RULE_VERSION],[ranking.MAP_CATALOG_ID,ranking.RANKING_RULE_VERSION,ranking.COOP_RULE_VERSION,ranking.DAFEI_RULE_VERSION]]){
  assert.equal(ranking.rankingRuleVersionForCatalog('escape',catalog),escape);
  assert.equal(ranking.coopRuleVersionForCatalog(catalog),coop);assert.equal(ranking.rankingRuleVersionForCatalog('dafei',catalog),drive);
  const capability=ranking.rankingRuleCapabilities('escape',escape);assert.equal(capability.mapCatalogId,catalog);assert.equal(capability.rosterSize,9);assert.equal(capability.gadgets,true);
 }
 assert.equal(ranking.rankingRuleVersionForCatalog('escape','unknown'),undefined);
 assert.equal(ranking.rankingRuleCapabilities('escape','campus-2026-0.7.0').rosterSize,6);
 assert.equal(ranking.rankingRuleCapabilities('escape','campus-2026-0.7.0').gadgets,false);
 assert.ok(ranking.drivingOldBestKeys('tank').every(key=>key!==ranking.drivingBestKey('tank')));
});

test('both archived catalogs keep coordinate validation and byte-identical retry configs',()=>{
 for(const [version,sites] of [[ranking.LEGACY_ESCAPE_RULE_VERSION,legacy],[ranking.HF_ESCAPE_RULE_VERSION,hf]]){
  const config=solo(version,sites),encoded=JSON.stringify(config);
  assert.equal(JSON.stringify(active.validateConfig(config,{allowLegacy:true})),encoded);assert.equal(Object.hasOwn(config,'mapCatalogId'),false);
  assert.throws(()=>active.validateConfig(config));
  const moved=structuredClone(config);moved.tasks[0].sites[0].position[0]+=.1;assert.throws(()=>active.validateConfig(moved,{allowLegacy:true}));
 }
});

test('new catalog accepts fifth-floor and basement identities and rejects mismatched rooms',()=>{
 const config=solo(ranking.RANKING_RULE_VERSION,current,{mapCatalogId:ranking.MAP_CATALOG_ID});
 assert.equal(active.validateConfig(config).roster.length,9);
 for(const id of ['fixture-fifth','fixture-garage']){
  const c=structuredClone(config);c.tasks[0].sites=[structuredClone(current.find(site=>site.id===id))];assert.equal(active.validateConfig(c).tasks[0].sites[0].id,id);
  c.tasks[0].sites[0].levelId='wrong';assert.throws(()=>active.validateConfig(c));
 }
 assert.throws(()=>active.validateConfig({...config,mapCatalogId:ranking.HF_MAP_CATALOG_ID}));
 assert.throws(()=>active.validateConfig({...config,roster:roster.slice(0,6)}));
});

test('new, HF and old nine-person credentials replay gadgets while earlier rules still reject them',()=>{
 const events=[{seq:1,t:0,order:0,type:'gadget',data:{kind:'cards',action:'pickup',id:'cards-fixture'}},{seq:2,t:1,order:0,type:'gadget',data:{kind:'cards',action:'use'}}];
 const result={won:false,elapsed:10,score:10,controls:'keyboard',damage:0,downs:0,headshots:0,uniqueDowns:0,completed:0};
 for(const [version,sites] of [[ranking.LEGACY_ESCAPE_RULE_VERSION,legacy],[ranking.HF_ESCAPE_RULE_VERSION,hf],[ranking.RANKING_RULE_VERSION,current]])assert.equal(active.replay(solo(version,sites),events,result).summary.score,10);
 assert.throws(()=>active.replay({...solo('campus-2026-0.7.0',legacy),roster:roster.slice(0,6)},events,result));
});

test('three vehicles retain old/HF/new replay rules and new-map record keys are distinct',()=>{
 const result={won:true,elapsed:300,score:0,hits:0,bestCombo:0,damage:0,controls:'keyboard',transmission:'auto'};
 for(const vehicleId of ranking.DRIVING_VEHICLE_IDS){
  for(const version of [vehicleId==='bao5'?ranking.LEGACY_DAFEI_RULE_VERSION:ranking.DAFEI_VEHICLE_RULE_VERSION,ranking.HF_DAFEI_RULE_VERSION,ranking.DAFEI_RULE_VERSION]){
   const config=driving(version,vehicleId);assert.equal(active.validateConfig(config,{allowLegacy:true}).vehicleId,vehicleId);assert.equal(active.replay(config,[],result).summary.score,0);
  }
 }
 assert.notEqual(ranking.drivingBestKey('tank'),ranking.drivingBestKey('scooter'));
});

test('rollback starts only old-map sessions but can still complete issued new/HF sessions',()=>{
 assert.equal(rollback.validateConfig(solo(ranking.LEGACY_ESCAPE_RULE_VERSION,legacy)).ruleVersion,ranking.LEGACY_ESCAPE_RULE_VERSION);
 for(const [version,sites] of [[ranking.HF_ESCAPE_RULE_VERSION,hf],[ranking.RANKING_RULE_VERSION,current]]){
  const config=solo(version,sites);assert.throws(()=>rollback.validateConfig(config));assert.equal(rollback.validateConfig(config,{allowLegacy:true}).ruleVersion,version);
 }
 for(const vehicleId of ranking.DRIVING_VEHICLE_IDS)assert.equal(rollback.validateConfig(driving(ranking.DAFEI_RULE_VERSION,vehicleId),{allowLegacy:true}).vehicleId,vehicleId);
});

test('temporary API issues current tickets, resumes old signed tickets, and separates vehicle boards',{timeout:10000},async()=>{
 const {createApp,hash}=await import(activeURL('app.ts'));
 const now=Date.UTC(2026,9,30,12),secret='fixture-only-credential-secret';
 const {app,db}=await createApp({dbPath:':memory:',clock:()=>now,credentialSecret:secret,serviceSecret:'fixture-service'});
 try{
  const response=await app.inject({method:'POST',url:'/v1/accounts/register',payload:{username:'地图测试玩家',password:'fixture-password'}});assert.equal(response.statusCode,200,response.body);
  const auth=response.json(),headers={authorization:'Bearer '+auth.token};
  const oldConfig=driving(ranking.HF_DAFEI_RULE_VERSION,'tank'),id='fixture-issued-hf',client='fixture-issued-client',credential=createHmac('sha256',secret).update(id).digest('base64url');
  db.prepare('INSERT INTO runs(id,player_id,client_id,credential_hash,created,expires,config,record_stats,publish_board,mode,difficulty,rule_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,auth.player.id,client,hash(credential),now-60000,now+60000,JSON.stringify(oldConfig),1,1,'dafei','',oldConfig.ruleVersion);
  const resumed=await app.inject({method:'POST',url:'/v1/runs',headers,payload:{clientRunId:client,config:oldConfig}});assert.equal(resumed.statusCode,200,resumed.body);assert.equal(resumed.json().credential,credential);
  const finalize=async(ticket,vehicleId)=>{const result=await app.inject({method:'POST',url:'/v1/runs/'+ticket.runId+'/finalize',headers,payload:{credential:ticket.credential,eventCount:0,summary:{won:true,elapsed:300,score:0,hits:0,bestCombo:0,damage:0,controls:'keyboard',transmission:'auto',vehicleId}}});assert.equal(result.statusCode,200,result.body);assert.equal(result.json().status,'ranked');};
  await finalize({runId:id,credential},'tank');
  for(const vehicleId of ranking.DRIVING_VEHICLE_IDS){const ticket=await app.inject({method:'POST',url:'/v1/runs',headers,payload:{clientRunId:'fixture-new-'+vehicleId,config:driving(ranking.DAFEI_RULE_VERSION,vehicleId)}});assert.equal(ticket.statusCode,200,ticket.body);await finalize(ticket.json(),vehicleId);}
  for(const vehicleId of ranking.DRIVING_VEHICLE_IDS){const board=(await app.inject({url:'/v1/boards?mode=dafei&period=all&vehicleId='+vehicleId})).json();assert.equal(board.ruleVersion,ranking.DAFEI_RULE_VERSION);assert.equal(board.total,1);assert.equal(board.entries[0].vehicleId,vehicleId);}
  const oldBoard=(await app.inject({url:'/v1/boards?mode=dafei&period=all&vehicleId=tank&ruleVersion='+ranking.HF_DAFEI_RULE_VERSION})).json();assert.equal(oldBoard.total,1);
  const health=(await app.inject({url:'/health'})).json();assert.equal(health.mapCatalogId,ranking.MAP_CATALOG_ID);assert.equal(health.version,JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version);
  assert.equal(db.pragma('user_version',{simple:true}),6);
 }finally{await app.close();}
});

test('cooperative results remain idempotent across three scopes and the default board follows the active map',{timeout:10000},async()=>{
 const {createApp}=await import(activeURL('app.ts')),now=Date.UTC(2026,9,30,12),serviceSecret='fixture-coop-service';
 const {app,db}=await createApp({dbPath:':memory:',clock:()=>now,serviceSecret});
 try{
  const players=['fixture-player-a','fixture-player-b'];
  players.forEach((id,index)=>db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run(id,'FIXTURE'+index,'合作测试'+index,'fixture-no-credential-'+index,now));
  const versions=[ranking.LEGACY_COOP_RULE_VERSION,ranking.HF_COOP_RULE_VERSION,ranking.COOP_RULE_VERSION];
  for(const [index,ruleVersion] of versions.entries()){
   const payload={resultId:'fixture-coop-'+index,roomId:'fixture-room-'+index,mode:'coop',ruleVersion,startedAt:now-60000,endedAt:now,startedCount:2,players:players.map(playerId=>({playerId,connectedSeconds:60,score:40,kills:1,deaths:0,won:true,qualified:true})),team:{difficulty:'standard',score:80,elapsed:60,won:true,eligible:true,ranked:true,tasks:[]}};
   const response=await app.inject({method:'POST',url:'/internal/multiplayer/results',headers:{'x-service-token':serviceSecret},payload});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().status,'valid');
   const duplicate=await app.inject({method:'POST',url:'/internal/multiplayer/results',headers:{'x-service-token':serviceSecret},payload});assert.equal(duplicate.statusCode,200,duplicate.body);assert.equal(duplicate.json().duplicate,true);
  }
  const currentBoard=(await app.inject({url:'/v1/multiplayer/boards?period=all&players=2'})).json();assert.equal(currentBoard.ruleVersion,ranking.COOP_RULE_VERSION);assert.equal(currentBoard.total,1);
  for(const ruleVersion of versions){assert.ok(currentBoard.versions.includes(ruleVersion));const board=(await app.inject({url:'/v1/multiplayer/boards?period=all&players=2&ruleVersion='+ruleVersion})).json();assert.equal(board.total,1);}
  assert.equal(db.prepare('SELECT count(*) n FROM multiplayer_results').get().n,3);
  assert.equal(db.pragma('user_version',{simple:true}),6);
 }finally{await app.close();}
});

test('catalog build preserves both archived coordinate lists and rollback only changes active selection',async()=>{
 const directory=await mkdtemp(path.join(fileURLToPath(new URL('./',import.meta.url)),'.catalog-fixture-'));
 try{
  const root=pathToFileURL(directory+path.sep);await mkdir(new URL('src/',root));
  await writeFile(new URL('src/sites.json',root),JSON.stringify(legacy));await writeFile(new URL('src/site-catalogs.json',root),JSON.stringify(installed));
  const source=new URL('new-map.mjs',root);await writeFile(source,`export const VALIDATED_ESCAPE_MAP_CATALOG_ID=${JSON.stringify(ranking.MAP_CATALOG_ID)};export const VALIDATED_ESCAPE_SITES=${JSON.stringify(current)};`);
  await prepareSiteCatalogs({root,source});const next=JSON.parse(await readFile(new URL('src/site-catalogs.json',root),'utf8'));
  assert.deepEqual(next.catalogs[ranking.LEGACY_MAP_CATALOG_ID],legacy);assert.deepEqual(next.catalogs[ranking.HF_MAP_CATALOG_ID],hf);assert.deepEqual(next.catalogs[ranking.MAP_CATALOG_ID],current);
  const drift=new URL('changed-map.mjs',root);await writeFile(drift,`export const VALIDATED_ESCAPE_MAP_CATALOG_ID=${JSON.stringify(ranking.MAP_CATALOG_ID)};export const VALIDATED_ESCAPE_SITES=${JSON.stringify(legacy)};`);
  await assert.rejects(prepareSiteCatalogs({root,source:drift}),/frozen/);
  await selectSiteCatalog({root,mapCatalogId:ranking.LEGACY_MAP_CATALOG_ID,directory:'src'});
  const restored=JSON.parse(await readFile(new URL('src/site-catalogs.json',root),'utf8'));assert.equal(restored.current,ranking.LEGACY_MAP_CATALOG_ID);assert.deepEqual(restored.catalogs,next.catalogs);
 }finally{
  const testRoot=fileURLToPath(new URL('./',import.meta.url)),relative=path.relative(testRoot,directory);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(directory).startsWith('.catalog-fixture-'))throw Error('Unsafe test cleanup path');
  await rm(directory,{recursive:true,force:true});
 }
});

process.on('exit',()=>hook.deregister());
