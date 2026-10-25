import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import {prepareSiteCatalogs,selectSiteCatalog} from '../scripts/site-catalogs.mjs';
import {makePublicMapExamples} from '../../../scripts/public-map-examples.mjs';

const shared=new URL('../../校园共享模块/dist/',import.meta.url);
const ranking=await import(new URL('ranking.js',shared).href);
const registry=JSON.parse(readFileSync(new URL('../src/site-catalogs.json',import.meta.url),'utf8'));
const legacy=registry.catalogs[ranking.LEGACY_MAP_CATALOG_ID];
const current=legacy.map((site:any)=>({...site,position:[site.position[0]+2,...site.position.slice(1)]}));
current.push({id:'test-fifth',label:'五层地点',region:'teaching',position:[1,16.38,3],floor:5,levelId:'north-f5',buildingId:'north-teaching'});
current.push({id:'test-garage',label:'车库地点',region:'dorm',position:[2,-2.8,4],floor:-1,levelId:'garage-b1',buildingId:'garage'});
const testRegistry={schema:1,current:ranking.MAP_CATALOG_ID,catalogs:{[ranking.LEGACY_MAP_CATALOG_ID]:legacy,[ranking.MAP_CATALOG_ID]:current}};

// Exercise the actual validator with controlled catalog data and current canonical rules.
const hook=registerHooks({
 resolve(specifier,context,next){
  if(specifier==='@qisheng/shared/ranking'||specifier==='@qisheng/shared/gadgets')return {url:new URL(specifier.endsWith('/ranking')?'ranking.js':'gadgets.js',shared).href,shortCircuit:true};
  if(specifier==='./shared.js'&&(context.parentURL?.endsWith('/src/validation.ts')||context.parentURL?.endsWith('/src/map-rules.ts')))return {url:new URL('../src/shared.ts',import.meta.url).href,shortCircuit:true};
  if(specifier==='./map-rules.js'&&context.parentURL?.endsWith('/src/validation.ts'))return {url:new URL('../src/map-rules.ts',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
 },
 load(url,context,next){
  if(url===new URL('../src/site-catalogs.json',import.meta.url).href)return {format:'json',source:JSON.stringify(testRegistry),shortCircuit:true};
  if(url===new URL('../src/validation.ts',import.meta.url).href)return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText,shortCircuit:true};
  return next(url,context);
 },
});
const {validateConfig,replay}=await import('../src/validation.ts');
hook.deregister();
const roster=['meng','jiang','xu','luan','xutao','chengguotao','wangwenrui','wangdi','wangyuhan'];
const config=(version:string,sites:any[],extra={})=>{
 const site=(id:string)=>structuredClone(sites.find(s=>s.id===id));
 return {mode:'escape',ruleVersion:version,seed:1,weapon:'m4a1',controls:'keyboard',difficulty:'standard',roster:[...roster],tasks:[{id:'take',kind:'take',label:'物资',duration:0,radius:2.4,sites:[site('sports-road')]},{id:'activate',kind:'activate',label:'设备',duration:0,radius:2.4,sites:[site('yard'),site('library-west')]},{id:'hold',kind:'hold',label:'守点',duration:15,radius:6,sites:[site('sports-north')]}],...extra};
};

test('old run retry remains byte-identical and uses frozen coordinates',()=>{
 const original=config(ranking.LEGACY_ESCAPE_RULE_VERSION,legacy),bytes=JSON.stringify(original);
 assert.equal(JSON.stringify(validateConfig(original,{allowLegacy:true})),bytes);
 assert.equal(Object.hasOwn(original,'mapCatalogId'),false);
 assert.throws(()=>validateConfig(config(ranking.LEGACY_ESCAPE_RULE_VERSION,current),{allowLegacy:true}));
 assert.throws(()=>validateConfig(config(ranking.LEGACY_ESCAPE_RULE_VERSION,legacy)));
});

test('new map accepts nine NPCs, signed floors and matched level identities',()=>{
 const initial=config(ranking.RANKING_RULE_VERSION,current,{mapCatalogId:ranking.MAP_CATALOG_ID});
 assert.equal(validateConfig(initial).roster.length,9);
 for(const id of ['test-fifth','test-garage']){
  const value=structuredClone(initial);value.tasks[0].sites=[structuredClone(current.find((s:any)=>s.id===id))];
  assert.equal(validateConfig(value).tasks[0].sites[0].id,id);
  value.tasks[0].sites[0].levelId='wrong-level';assert.throws(()=>validateConfig(value));
 }
 assert.throws(()=>validateConfig({...initial,mapCatalogId:ranking.LEGACY_MAP_CATALOG_ID}));
 assert.throws(()=>validateConfig({...initial,roster:roster.slice(0,6)}));
 assert.throws(()=>validateConfig({...initial,roster:[...roster].reverse()}));
 const indoor=structuredClone(initial);indoor.tasks[2].sites=[current.at(-1)];assert.throws(()=>validateConfig(indoor));
});

test('new and old nine-person rules replay gadgets while pre-gadget rules reject them',()=>{
 const events=[{seq:1,t:0,order:0,type:'gadget',data:{kind:'cards',action:'pickup',id:'test-cards'}},{seq:2,t:1,order:0,type:'gadget',data:{kind:'cards',action:'use'}}];
 const summary={won:false,elapsed:10,score:10,damage:0,headshots:0,downs:0,uniqueDowns:0,completed:0,controls:'keyboard'};
 for(const version of [ranking.RANKING_RULE_VERSION,ranking.LEGACY_ESCAPE_RULE_VERSION])assert.equal(replay(config(version,version===ranking.RANKING_RULE_VERSION?current:legacy),events,summary).summary.score,10);
 assert.throws(()=>replay({...config('campus-2026-0.7.0',legacy),roster:roster.slice(0,6)},events,summary));
});

test('rollback API starts old-map runs and still accepts issued new-map credentials',async()=>{
 const base=new URL('../src/',import.meta.url),scope='?rollback-catalog-test';
 const rollbackHook=registerHooks({
  resolve(specifier,context,next){
   if(specifier==='@qisheng/shared/ranking'||specifier==='@qisheng/shared/gadgets')return {url:new URL(specifier.endsWith('/ranking')?'ranking.js':'gadgets.js',shared).href,shortCircuit:true};
   if(context.parentURL?.includes(scope)){
    if(specifier==='./shared.js')return {url:new URL('shared.ts',base).href,shortCircuit:true};
    if(specifier==='./map-rules.js')return {url:new URL('map-rules.ts'+scope,base).href,shortCircuit:true};
    if(specifier==='./site-catalogs.json')return {url:new URL('site-catalogs.json'+scope,base).href,shortCircuit:true};
   }
   return next(specifier,context);
  },
  load(url,context,next){
   if(url===new URL('site-catalogs.json'+scope,base).href)return {format:'json',source:JSON.stringify({...testRegistry,current:ranking.LEGACY_MAP_CATALOG_ID}),shortCircuit:true};
   if(url===new URL('validation.ts'+scope,base).href)return {format:'module',source:ts.transpileModule(readFileSync(new URL('validation.ts',base),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023}}).outputText,shortCircuit:true};
   return next(url,context);
  },
 });
 let rollback;
 try{rollback=await import(new URL('validation.ts'+scope,base).href);}finally{rollbackHook.deregister();}
 const old=config(ranking.LEGACY_ESCAPE_RULE_VERSION,legacy),bytes=JSON.stringify(old);
 assert.equal(JSON.stringify(rollback.validateConfig(old)),bytes);
 const active=config(ranking.RANKING_RULE_VERSION,current,{mapCatalogId:ranking.MAP_CATALOG_ID});
 assert.equal(rollback.validateConfig(active,{allowLegacy:true}).mapCatalogId,ranking.MAP_CATALOG_ID);
 assert.throws(()=>rollback.validateConfig(active));
});

test('old vehicle tickets retain valid replay and new vehicles stay separated',()=>{
 const value={mode:'dafei',ruleVersion:ranking.DAFEI_VEHICLE_RULE_VERSION,vehicleId:'tank',seed:1,weapon:'vehicle',controls:'keyboard',transmission:'auto',roster:roster.slice(0,4),tasks:[]};
 const result={won:true,elapsed:300,score:0,hits:0,bestCombo:0,damage:0,controls:'keyboard',transmission:'auto'};
 assert.equal(validateConfig(value,{allowLegacy:true}).vehicleId,'tank');
 assert.equal(replay(value,[],result).summary.score,0);
 for(const vehicleId of ['bao5','tank','scooter'])assert.equal(validateConfig({...value,ruleVersion:ranking.DAFEI_RULE_VERSION,vehicleId}).vehicleId,vehicleId);
});

test('build preserves previous site catalogs and rejects reuse with changed geometry',async()=>{
 const base=new URL('../../../work/tests/',import.meta.url);await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(fileURLToPath(base),'catalog-'));
 try{
  const root=pathToFileURL(directory+path.sep);await mkdir(new URL('src/',root));
  await writeFile(new URL('src/sites.json',root),JSON.stringify(legacy));
  const source=new URL('candidate.mjs',root);
  await writeFile(source,`export const VALIDATED_ESCAPE_MAP_CATALOG_ID=${JSON.stringify(ranking.MAP_CATALOG_ID)};export const VALIDATED_ESCAPE_SITES=${JSON.stringify(current)};`);
  await prepareSiteCatalogs({root,source});
  const saved=JSON.parse(await readFile(new URL('src/site-catalogs.json',root),'utf8'));
  assert.deepEqual(saved.catalogs[ranking.LEGACY_MAP_CATALOG_ID],legacy);
  assert.deepEqual(saved.catalogs[ranking.MAP_CATALOG_ID],current);
  await prepareSiteCatalogs({root,source});
  const drift=new URL('drift.mjs',root);await writeFile(drift,`export const VALIDATED_ESCAPE_MAP_CATALOG_ID=${JSON.stringify(ranking.MAP_CATALOG_ID)};export const VALIDATED_ESCAPE_SITES=${JSON.stringify(legacy)};`);
  await assert.rejects(prepareSiteCatalogs({root,source:drift}),/frozen/);
  assert.deepEqual(JSON.parse(await readFile(new URL('src/site-catalogs.json',root),'utf8')),saved);
  await selectSiteCatalog({root,mapCatalogId:ranking.LEGACY_MAP_CATALOG_ID,directory:'src'});
  const rollback=JSON.parse(await readFile(new URL('src/site-catalogs.json',root),'utf8'));
  assert.equal(rollback.current,ranking.LEGACY_MAP_CATALOG_ID);assert.deepEqual(rollback.catalogs[ranking.MAP_CATALOG_ID],current);
  assert.deepEqual(JSON.parse(await readFile(new URL('src/sites.json',root),'utf8')),legacy);
  await assert.rejects(selectSiteCatalog({root,mapCatalogId:'uninstalled',directory:'src'}),/not installed/);
 }finally{const relative=path.relative(fileURLToPath(base),directory);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Temporary catalog path escaped test workspace');await rm(directory,{recursive:true,force:true});}
});

test('public examples preserve interfaces without exporting calibrated coordinates',()=>{
 const examples=makePublicMapExamples(testRegistry,{VALIDATED_ESCAPE_MAP_CATALOG_ID:ranking.MAP_CATALOG_ID,VALIDATED_ESCAPE_RESPAWN_SITES:legacy});
 const sites=JSON.parse(examples.get('outputs/校园排行榜服务/src/sites.json')!);
 const catalogs=JSON.parse(examples.get('outputs/校园排行榜服务/src/site-catalogs.json')!);
 assert.deepEqual(sites,catalogs.catalogs[ranking.MAP_CATALOG_ID]);
 assert.equal(sites.length,current.length);assert.deepEqual(sites.map((s:any)=>s.id),current.map((s:any)=>s.id));
 assert.notDeepEqual(sites.map((s:any)=>s.position),current.map((s:any)=>s.position));
 const source=examples.get('outputs/校园逃生游戏/src/escape/validated.ts')!;
 assert.match(source,/Anonymous example geometry/);assert.match(source,/VALIDATED_ESCAPE_EDGES/);
});
