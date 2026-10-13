import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Scene,Vector3} from 'three';
import {loadWorld} from '../src/world.ts';
import {pathMotion} from '../src/path-following.ts';
import {pickupReachable} from '../src/interactions.ts';
import {EscapeRound,generateEscapePlan,escapeFallbackTasks,calibratedEscapeRoute,selectEscapeRoster,VALIDATED_ESCAPE_SITES,VALIDATED_ESCAPE_EXTRACTION,VALIDATED_ESCAPE_SPAWN} from '../src/escape/index.ts';
import type {EscapeEvent,EscapePlan,EscapeVec3,EscapeSite} from '../src/escape/index.ts';
const report:{createdAt:string;scope:string;flows:any[];checks:Record<string,unknown>;errors:string[];ok?:boolean}={createdAt:new Date().toISOString(),scope:'Rules + real Rapier player movement on production map; no browser/UI/NPC attack rendering',flows:[],checks:{},errors:[]};
const calibration=JSON.parse(readFileSync(new URL('../docs/v0.3.0/escape-map-calibration.json',import.meta.url),'utf8'));
function options(seed:number){return {seed,difficulty:'standard' as const,sites:VALIDATED_ESCAPE_SITES,spawn:VALIDATED_ESCAPE_SPAWN,extraction:VALIDATED_ESCAPE_EXTRACTION,validateSite:(site:EscapeSite)=>site.id===VALIDATED_ESCAPE_EXTRACTION.id||VALIDATED_ESCAPE_SITES.some(p=>p.id===site.id),validateRoute:calibratedEscapeRoute,fallbackTasks:escapeFallbackTasks('standard').map(task=>({...task,sites:task.sites.map(site=>VALIDATED_ESCAPE_SITES.find(p=>p.id===site.id)!)}))};}
const hash=(url:string)=>createHash('sha256').update(readFileSync(new URL('../public'+url,import.meta.url))).digest('hex');
after(()=>{report.ok=report.errors.length===0&&report.flows.length===4&&report.flows.every(f=>f.phase==='won')&&report.checks.failureNoGrade===true&&report.checks.retrySeedStable===true;mkdirSync(new URL('../docs/v0.7.0/',import.meta.url),{recursive:true});writeFileSync(new URL('../docs/v0.7.0/escape-rule-verification.json',import.meta.url),JSON.stringify(report,null,2));});
test('four seeded standard task combinations complete through real update and real player movement',async()=>{
 const originalFetch=globalThis.fetch;let world:Awaited<ReturnType<typeof loadWorld>>|undefined;
 const file=(url:string)=>readFileSync(new URL('../public'+url,import.meta.url));const manifest=JSON.parse(file('/map/manifest.json').toString());
 globalThis.fetch=async input=>{const url=String(input);return url==='/map/manifest.json'?new Response(JSON.stringify({...manifest,chunks:[]})):new Response(file(url));};
 try{
  world=await loadWorld(new Scene(),()=>{});const selected=new Map<string,EscapePlan>();
  for(let seed=0;seed<1000&&selected.size<4;seed++){const plan=generateEscapePlan(options(seed)),key=plan.tasks.map(t=>t.kind).sort().join('+');if(!selected.has(key))selected.set(key,plan);}assert.equal(selected.size,4,'every three-of-four task combination has a complete flow');
  let flowIndex=0;
  for(const [combination,plan] of selected){
   world.resetActors();let position=new Vector3(...plan.spawn),vertical=0,grounded=false,steps=0;
   world.restorePlayer(position,false);world.step(1/60);const round=new EscapeRound({difficulty:'standard',plan}),events:EscapeEvent[]=[];
   const tick=(dt:number,interaction=false,extra:Record<string,unknown>={})=>{events.push(...round.update(dt,{position:position.toArray() as EscapeVec3,interactPressed:interaction,canInteract:site=>pickupReachable(position,position.clone().add(new Vector3(0,1.62,0)),new Vector3(...site.position),site.id===plan.extraction.id?4.5:2.4,world!.rayDistance),...extra}));};
   const walk=(target:EscapeVec3)=>{const destination=new Vector3(...target);let path:Vector3[]=[],local=0,last=position.clone(),stalled=0;for(;local<18000&&position.distanceTo(destination)>.3;local++){
    if(local%54===0)path=world!.storyPath(position,destination);assert.ok(path.length,'actual navigation cannot disappear');const desired=pathMotion(position,path,3.4,1/60);vertical=grounded?-.25:Math.max(-20,vertical-14/60);desired.y=vertical/60;const before=position.clone(),moved=world!.move(position,desired,1/60,false);position=moved.position;grounded=moved.grounded;world!.step(1/60);assert.ok(Math.abs(position.y-before.y)<.5,'walking cannot teleport floors');tick(1/60);steps++;
    if(local%120===119){stalled=position.distanceTo(last)<.08?stalled+1:0;last.copy(position);assert.ok(stalled<3,`player route stalled near ${position.toArray()}`);}assert.notEqual(round.phase,'failed','all natural task orders must retain time');
   }assert.ok(position.distanceTo(destination)<=.3,'real player reaches the interaction point');};
   const wait=(seconds:number,extra:Record<string,unknown>={})=>{for(let i=0;i<Math.round(seconds*60);i++){const desired=new Vector3(0,(grounded?-.25:vertical=Math.max(-20,vertical-14/60))/60,0),moved=world!.move(position,desired,1/60,false);position=moved.position;grounded=moved.grounded;world!.step(1/60);tick(1/60,false,extra);steps++;}};
   const order=flowIndex%2?[...plan.tasks].reverse():plan.tasks;let holdProof:any=null;
   for(const task of order){
    if(task.kind==='activate'){const nodes=flowIndex%2?[...task.sites].reverse():task.sites;for(const node of nodes){walk(node.position);tick(0,true);tick(0,true);}}
    else if(task.kind==='deliver'){walk(task.sites[0].position);tick(0,true);assert.equal(round.snapshot().tasks.find(t=>t.id===task.id)?.carrying,true);walk(task.sites[1].position);tick(0,true);tick(0,true);}
    else if(task.kind==='hold'){
     walk(task.sites[0].position);tick(0,true);wait(4);const first=round.snapshot().tasks.find(t=>t.id===task.id)!.progress;round.recordDamage(10);wait(3,{contested:true});const contested=round.snapshot().tasks.find(t=>t.id===task.id)!.progress;assert.equal(contested,first,'contested hold retains its earned progress');
     const leavePath=world.storyPath(position,new Vector3(...plan.spawn)),outside=leavePath.find(p=>p.distanceTo(new Vector3(...task.sites[0].position))>8);assert.ok(outside,'hold has an actual route outside the circle');walk(outside!.toArray() as EscapeVec3);const outsideProgress=round.snapshot().tasks.find(t=>t.id===task.id)!.progress;wait(2);assert.equal(round.snapshot().tasks.find(t=>t.id===task.id)!.progress,outsideProgress,'leaving the ring pauses progress');walk(task.sites[0].position);wait(16);holdProof={first,contested,outsideProgress,completed:true};
    }else {walk(task.sites[0].position);tick(0,true);tick(0,true);}
    assert.equal(round.snapshot().tasks.find(t=>t.id===task.id)!.state,'complete','tasks only complete from public updates and interactions');
   }
   assert.equal(round.completed,3);assert.equal(round.snapshot().activeNPCs,6);assert.equal(events.filter(e=>e.type==='reinforcements').length,1);assert.equal(events.filter(e=>e.type==='ammo-reward').length,3);assert.equal(events.filter(e=>e.type==='task-completed').length,3);
   for(const task of plan.tasks)assert.equal(events.filter(e=>e.type==='ammo-reward'&&e.taskId===task.id).length,1,'each task rewards once despite repeated interaction');
   const activate=plan.tasks.find(t=>t.kind==='activate');assert.equal(events.filter(e=>e.type==='investigation').length,activate?1:0);
   for(let id=0;id<6;id++)round.recordDown(id,true);
   walk(plan.extraction.position);tick(0,true);assert.equal(round.phase,'extraction');wait(19.9);assert.equal(round.phase,'extraction','standard withdrawal cannot finish before twenty seconds');wait(.1);assert.equal(round.phase,'won');assert.equal(round.snapshot().extractionProgress>=20-1e-6,true);assert.equal(events.filter(e=>e.type==='won').length,1);
   assert.ok(round.result?.grade);assert.equal(round.result?.stats.downs,6);assert.equal(round.result?.stats.uniqueDowns,6);
   report.flows.push({seed:plan.seed,combination,order:order.map(t=>t.kind),phase:round.phase,elapsed:round.elapsed,remaining:round.remaining,steps,activeNPCs:round.snapshot().activeNPCs,rewardCount:3,reinforcementCount:1,holdProof,extractDuration:20,result:round.result});flowIndex++;
  }
  const patch=JSON.parse(readFileSync(new URL('../docs/v0.7.0/collision-patch.json',import.meta.url),'utf8'));
  for(const [url,expected] of Object.entries(calibration.assets)){
   const name=url.split('/').at(-1)!;
   const source=['manifest.json','collision.bin','navigation.bin'].includes(name)?new URL('../assets-source/map/v0.7.0-base/'+name,import.meta.url):new URL('../public'+url,import.meta.url);
   assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),expected,'accepted pre-patch calibration source stays intact: '+name);
  }
  assert.equal(hash('/map/collision.bin'),patch.collisionHash);
  assert.equal(hash('/map/navigation.bin'),patch.navigationHash);
  assert.equal(hash('/map/vision.bin'),patch.visionHash);
  const index=JSON.parse(readFileSync(new URL('../public/map/resource-index.json',import.meta.url),'utf8'));
  assert.equal(hash('/map/manifest.json'),index.manifest.sha256,'the actual production manifest is bound to the current resource index');
  report.checks.sourceCalibrationPreserved=true;report.checks.currentPatchVerified=true;report.checks.taskKinds=['take','activate','hold','deliver'];report.checks.existingMovementHealthTests='23 rule tests include sprint drain/recovery, slide safety/direction/aim, six-second partial health recovery and dead-health refusal';
 }catch(error){report.errors.push(String(error));throw error;}finally{world?.dispose();globalThis.fetch=originalFetch;}
});
test('timeout and health failure remain ungraded and deterministic retry keeps seed, tasks and six identities',()=>{
 try{const seed=17,plan=generateEscapePlan(options(seed)),timeout=new EscapeRound({difficulty:'standard',plan});timeout.update(480,{position:plan.spawn});assert.equal(timeout.phase,'failed');assert.equal(timeout.result?.grade,null);assert.equal(timeout.result?.rating,null);
 const fatal=new EscapeRound({difficulty:'standard',plan});fatal.recordDamage(100);fatal.fail('health');assert.equal(fatal.result?.grade,null);assert.equal(fatal.result?.stats.damage,100);
 const retryPlan=generateEscapePlan(options(seed)),retry=new EscapeRound({difficulty:'standard',plan:retryPlan});assert.deepEqual(retryPlan,plan);assert.deepEqual(selectEscapeRoster(seed,[0,1,2,3,4,5]),selectEscapeRoster(seed,[0,1,2,3,4,5]));assert.equal(retry.phase,'active');assert.equal(retry.elapsed,0);assert.equal(retry.completed,0);assert.equal(retry.snapshot().activeNPCs,4);assert.equal(retry.result,null);report.checks.failureNoGrade=true;report.checks.retrySeedStable=true;report.checks.failureCases=['time','health'];
 }catch(error){report.errors.push(String(error));throw error;}
});
