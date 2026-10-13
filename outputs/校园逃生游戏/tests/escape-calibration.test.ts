import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {VALIDATED_ESCAPE_SITES,VALIDATED_ESCAPE_RESPAWN_SITES,VALIDATED_ESCAPE_SPAWN,VALIDATED_ESCAPE_EXTRACTION,calibratedEscapeRoute,escapeFallbackTasks,generateEscapePlan,ESCAPE_DIFFICULTIES} from '../src/escape/index.ts';
const report=JSON.parse(readFileSync(new URL('../docs/v0.3.0/escape-map-calibration.json',import.meta.url),'utf8'));
test('production calibration preserves the source-bound baseline and measures real capsules rather than nearest-only assertions',()=>{
 assert.equal(report.ok,true);assert.equal(report.assetsUnchanged,true);assert.equal(report.sourceVersion,'v16');
 const patch=JSON.parse(readFileSync(new URL('../docs/v0.7.0/collision-patch.json',import.meta.url),'utf8'));
 const hashOf=(url:URL)=>createHash('sha256').update(readFileSync(url)).digest('hex');
 for(const [url,hash] of Object.entries(report.assets)){
  const name=(url as string).split('/').at(-1)!;
  const preserved=['manifest.json','collision.bin','navigation.bin'].includes(name)?new URL('../assets-source/map/v0.7.0-base/'+name,import.meta.url):new URL('../public'+url,import.meta.url);
  assert.equal(hashOf(preserved),hash,'accepted pre-patch source remains intact: '+name);
 }
 assert.equal(patch.sourceCollisionHash,hashOf(new URL('../assets-source/map/v0.7.0-base/collision.bin',import.meta.url)));
 assert.equal(patch.sourceNavigationHash,hashOf(new URL('../assets-source/map/v0.7.0-base/navigation.bin',import.meta.url)));
 assert.equal(patch.collisionHash,hashOf(new URL('../public/map/collision.bin',import.meta.url)));
 assert.equal(patch.navigationHash,hashOf(new URL('../public/map/navigation.bin',import.meta.url)));
 assert.equal(patch.visionHash,hashOf(new URL('../public/map/vision.bin',import.meta.url)));
 assert.equal(report.physical.filter((p:any)=>p.direction!=='task-edge').length,48);assert.ok(report.physical.filter((p:any)=>p.direction!=='task-edge').every((p:any)=>p.complete&&p.steps>0));
});
test('validated task pool includes two actual safe sites on each of the first two floors',()=>{assert.equal(VALIDATED_ESCAPE_SITES.length,12);for(const floor of [1,2]){const sites=VALIDATED_ESCAPE_SITES.filter(s=>s.floor===floor);assert.equal(sites.length,2);for(const site of sites){const walks=report.physical.filter((p:any)=>p.id===site.id);assert.equal(walks.length,4);assert.ok(walks.every((p:any)=>p.complete));}}assert.ok(VALIDATED_ESCAPE_SITES.every(s=>(s.floor??0)<=2));});
test('calibrated route gate excludes all nine physically blocked task edges',()=>{const failures=report.physical.filter((p:any)=>p.direction==='task-edge'&&!p.complete);assert.equal(failures.length,9);for(const item of failures){const [a,b]=item.id.split('>'),from=VALIDATED_ESCAPE_SITES.find(s=>s.id===a)!,to=VALIDATED_ESCAPE_SITES.find(s=>s.id===b)!;assert.equal(calibratedEscapeRoute(from.position,to.position).complete,false);}assert.equal(calibratedEscapeRoute([0,100,0],VALIDATED_ESCAPE_SPAWN).complete,false);});
test('all difficulties retain a fixed physically verified fallback within sixty percent deadline',()=>{for(const difficulty of ['easy','standard','hard'] as const){const plan=generateEscapePlan({seed:4,difficulty,attempts:0,sites:VALIDATED_ESCAPE_SITES,spawn:VALIDATED_ESCAPE_SPAWN,extraction:VALIDATED_ESCAPE_EXTRACTION,validateSite:site=>site.id===VALIDATED_ESCAPE_EXTRACTION.id||VALIDATED_ESCAPE_SITES.some(s=>s.id===site.id),validateRoute:calibratedEscapeRoute,fallbackTasks:escapeFallbackTasks(difficulty).map(task=>({...task,sites:task.sites.map(s=>VALIDATED_ESCAPE_SITES.find(p=>p.id===s.id)!)}))});assert.equal(plan.fallback,true);assert.ok(plan.budgetSeconds<=ESCAPE_DIFFICULTIES[difficulty].round*.6);}});
test('all 144 real-map seeded plans meet budget and fifteen respawn sites have support and physical return proof',()=>{assert.equal(report.plans.length,144);for(const plan of report.plans)assert.ok(plan.budgetSeconds<=ESCAPE_DIFFICULTIES[plan.difficulty as 'easy'|'standard'|'hard'].round*.6);assert.equal(VALIDATED_ESCAPE_RESPAWN_SITES.length,15);assert.equal(new Set(VALIDATED_ESCAPE_RESPAWN_SITES.map(s=>s.region)).size,4);for(const site of VALIDATED_ESCAPE_RESPAWN_SITES){const proof=report.respawnSites.find((s:any)=>s.id===site.id);assert.ok(proof.valid&&proof.physical.complete);}});
