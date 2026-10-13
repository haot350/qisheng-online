import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {WEAPON_IDS} from '../src/rules.ts';
import {NPC_IDS,NPC_IDENTITY,npcPoseFilename} from '../src/npc-roster.ts';
import {staticAssetUrl} from '../src/static-assets.ts';

// Keep actual gun/avatar/portrait loading, queue and lease ownership. Only replace
// browser image decode, GLB decode and the separately tested map repository.
const realResources=new URL('../src/resource-leases.ts',import.meta.url).href;
const decodeMock='data:text/javascript,'+encodeURIComponent('export * from '+JSON.stringify(realResources)+';export async function decodeResourceImage(){return {width:16,height:32};}');
const mapMock='data:text/javascript,'+encodeURIComponent('export async function loadGameMapBundle(signal){const f=globalThis.onlineResourceFixture;f.mapSignals.push(signal);if(f.fail==="map")throw Error("map fixture failure");if(signal.aborted)throw new DOMException("Cancelled","AbortError");return {}; }');
registerHooks({resolve(specifier,context,nextResolve){
 if(context.parentURL?.endsWith('/src/multiplayer/online-resources.ts')&&specifier==='../game-map')return {url:mapMock,shortCircuit:true};
 if(context.parentURL?.endsWith('/src/billboards.ts')&&specifier==='./resource-leases.ts')return {url:decodeMock,shortCircuit:true};
 if(context.parentURL?.includes('/src/')&&specifier.startsWith('.')&&!/\.(ts|tsx|json|js)$/.test(specifier))return nextResolve(specifier+'.ts',context);
 return nextResolve(specifier,context);
}});
const {prepareOnlineResources:prepareResources}=await import('../src/multiplayer/online-resources.ts');
const {weaponResourceDiagnostics}=await import('../src/weapons.ts');
const {avatarResourceState}=await import('../src/multiplayer/avatar.ts');
const {billboardResourceDiagnostics}=await import('../src/billboards.ts');
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
const guns=WEAPON_IDS.flatMap(id=>['near','far'].map(lod=>'/weapons/'+id+'-'+lod+'.glb'));
const avatars=['campus-a','campus-b','tactical-a','tactical-b'].map(id=>'/avatars/v0.5.0/'+id+'.glb');
const portraits=(mobile=false)=>NPC_IDS.flatMap(id=>NPC_IDENTITY[id].poses.map(pose=>npcPoseFilename(id,pose,mobile)));
const allPaths=[...guns,...avatars,...portraits(),...portraits(true)];
type Fixture={urls:string[];signals:AbortSignal[];mapSignals:AbortSignal[];fail:string|null;gate:string|null;complete:(()=>void)|null;releases:(()=>void)[];controller:AbortController;works:Promise<unknown>[]};
function prepareOnlineResources(mode:'coop'|'pvp',mobile:boolean,options:{signal?:AbortSignal}={}){const f=(globalThis as any).onlineResourceFixture as Fixture;const work=prepareResources(mode,mobile,{signal:options.signal?AbortSignal.any([f.controller.signal,options.signal]):f.controller.signal});f.works.push(work);void work.then(release=>f.releases.push(release),()=>{});return work;}
const empty=()=>{assert.equal(weaponResourceDiagnostics().references,0);assert.equal(weaponResourceDiagnostics().models,0);assert.equal(weaponResourceDiagnostics().pending,0);assert.deepEqual(avatarResourceState(),[]);assert.equal(billboardResourceDiagnostics().entries,0);};
async function until(ready:()=>boolean){for(let i=0;i<300&&!ready();i++)await turn();assert.ok(ready(),'fixture did not reach the expected resource gate');}
async function fixture(run:(f:Fixture)=>Promise<void>){
 const originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;
 const f:Fixture={urls:[],signals:[],mapSignals:[],fail:null,gate:null,complete:null,releases:[],controller:new AbortController(),works:[]};(globalThis as any).onlineResourceFixture=f;
 globalThis.fetch=async(input,options)=>{
  const actual=String(input),url=allPaths.find(path=>staticAssetUrl(path)===actual)??actual,signal=options?.signal as AbortSignal;f.urls.push(actual);f.signals.push(signal);
  if(f.fail&&actual===staticAssetUrl(f.fail))throw Error('fixture resource failure');
  if(f.gate&&actual===staticAssetUrl(f.gate))await new Promise<void>((resolve,reject)=>{const abort=()=>reject(new DOMException('Cancelled','AbortError'));signal.addEventListener('abort',abort,{once:true});f.complete=()=>{signal.removeEventListener('abort',abort);resolve();};});
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');return new Response(new TextEncoder().encode(url));
 };
 GLTFLoader.prototype.parseAsync=async()=>{const scene=new Group(),muzzle=new Group();muzzle.name='muzzle';scene.add(muzzle,new Mesh(new BoxGeometry(),new MeshStandardMaterial()));return {scene} as any;};
 try{empty();await run(f);}finally{f.controller.abort();f.complete?.();await Promise.allSettled(f.works);f.releases.forEach(drop=>drop());await turn();globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;delete (globalThis as any).onlineResourceFixture;empty();}
}

test('PvP preparation waits for all fourteen gun LODs and all four player models',async()=>fixture(async f=>{
 f.gate=avatars.at(-1)!;let ready=false;const work=prepareOnlineResources('pvp',false).then(release=>{ready=true;f.releases.push(release);return release;});
 await until(()=>f.urls.length===18&&!!f.complete);await turn();assert.equal(ready,false);assert.deepEqual([...f.urls].sort(),[...guns,...avatars].map(staticAssetUrl).sort());assert.equal(weaponResourceDiagnostics().models,14);assert.equal(avatarResourceState().filter(x=>x.ready).length,3);assert.equal(billboardResourceDiagnostics().entries,0);
 f.complete!();const release=await work;assert.equal(ready,true);assert.equal(avatarResourceState().filter(x=>x.ready).length,4);release();empty();assert.ok(f.signals.every(signal=>signal.aborted));
}));

test('cooperation waits for every required pose of all six identities, including future reinforcements',async()=>fixture(async f=>{
 const required=portraits(true);assert.equal(required.length,46);f.gate=required.at(-1)!;let ready=false;
 const work=prepareOnlineResources('coop',true).then(release=>{ready=true;f.releases.push(release);return release;});await until(()=>f.urls.length===64&&!!f.complete&&billboardResourceDiagnostics().ready===45&&avatarResourceState().filter(x=>x.ready).length===4);await turn();
 assert.equal(ready,false);assert.deepEqual([...f.urls].sort(),[...guns,...avatars,...required].map(staticAssetUrl).sort());assert.equal(billboardResourceDiagnostics().ready,45);assert.equal(avatarResourceState().filter(x=>x.ready).length,4);
 f.complete!();const release=await work;assert.equal(ready,true);assert.equal(billboardResourceDiagnostics().ready,46);release();empty();
}));

test('failure in any required resource group cannot publish ready and rolls back all acquired leases',async()=>{
 for(const failure of ['map',guns[0],portraits()[0],avatars[0]])await fixture(async f=>{
  f.fail=failure;let ready=false;const work=prepareOnlineResources('coop',false).then(release=>{ready=true;f.releases.push(release);return release;});await assert.rejects(work);await turn();assert.equal(ready,false);empty();assert.ok(f.signals.every(signal=>signal.aborted));assert.ok(f.mapSignals.every(signal=>signal.aborted));
 });
});

test('overlapping preparations keep shared downloads until the last cancelled consumer releases them',async()=>fixture(async f=>{
 f.gate=guns[0];const a=new AbortController(),b=new AbortController();const first=prepareOnlineResources('pvp',false,{signal:a.signal}),second=prepareOnlineResources('pvp',false,{signal:b.signal});const results=Promise.allSettled([first,second]);await until(()=>f.urls.length===18&&!!f.complete);
 assert.equal(f.urls.filter(url=>url===staticAssetUrl(guns[0])).length,1);assert.equal(weaponResourceDiagnostics().references,28);a.abort();await assert.rejects(first);assert.equal(f.signals[0].aborted,false);assert.equal(weaponResourceDiagnostics().references,14);assert.equal(avatarResourceState().length,4);
 b.abort();await assert.rejects(second);assert.deepEqual((await results).map(r=>r.status),['rejected','rejected']);await turn();assert.ok(f.signals.every(signal=>signal.aborted));empty();
}));
