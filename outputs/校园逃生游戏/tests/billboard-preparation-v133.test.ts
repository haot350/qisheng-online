import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Texture} from 'three';
import {npcFallbackPoseFilename} from '../src/npc-roster.ts';
import {staticAssetUrl} from '../src/static-assets.ts';

const threeUrl=import.meta.resolve('three');
const asModule=(text:string)=>'data:text/javascript,'+encodeURIComponent(text);
const appearance=asModule(`
 const f=()=>globalThis.portraitPreparation;
 export const currentNpcVariant=()=>f().variant;
 export const npcAppearanceGeneration=()=>f().epoch;
 export const npcAppearanceSnapshot=()=>({catalogRevision:'fixture-1'});
 export const npcAppearanceSubscribe=fn=>{globalThis.portraitChanged=fn;return()=>{};};
 export const ensureNpcAppearance=()=>new Promise(()=>{});
 export const realNpcAsset=(name,signal)=>new Promise(resolve=>f().privateRequests.push({name,signal,resolve}));
 export const npcPublicName=(_id,name)=>name;
`);
const weapon=asModule(`import {Group,Vector3} from ${JSON.stringify(threeUrl)};export function createWorldWeapon(){return{root:new Group(),update(){},dispose(){},setWeapon(){},getAnchorLocal:(_name,out)=>out.set(0,0,0),getMuzzleWorld:()=>new Vector3(),getMuzzleDirectionWorld:()=>new Vector3(0,0,-1),getEjectionWorld:()=>new Vector3(),getAimReady:()=>true,isAimReady:()=>true};}`);
const resources=asModule(`
 export const resourceWorkQueue={run:async(signal,work)=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');return work();}};
 export const abortResource=signal=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};
 export const fetchResource=async name=>new TextEncoder().encode(name).buffer;
 export const decodeResourceImage=async bytes=>({width:128,height:256,source:new TextDecoder().decode(bytes),close(){globalThis.portraitPreparation.closed++;}});
 export const waitForResource=(work)=>work;
`);
const masks=asModule(`export const retainBillboardMask=()=>({release(){},mask:Promise.resolve({width:128,height:256,bits:new Uint8Array(4096)})});`);
registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/src/billboards.ts')){
  if(specifier==='./npc-appearance')return{url:appearance,shortCircuit:true};
  if(specifier==='./weapons')return{url:weapon,shortCircuit:true};
  if(specifier==='./resource-leases.ts')return{url:resources,shortCircuit:true};
  if(specifier==='./billboard-masks.ts')return{url:masks,shortCircuit:true};
 }
 if(context.parentURL?.includes('/src/')&&specifier.startsWith('./')&&!/\.(ts|json)$/.test(specifier))return next(specifier+'.ts',context);
 return next(specifier,context);
}});
const {prepareBillboards,createBillboardCharacter,registerBillboardRenderer,billboardResourceDiagnostics}=await import('../src/billboards.ts');
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const idle={speed:0,aim:false,firing:false,reloading:false,suppressed:0,hit:0,attackPhase:'search' as const,shotSerial:0};
type Pending={name:string;signal:AbortSignal;resolve:(v:ArrayBuffer|null)=>void};
async function fixture(run:(f:{variant:string;epoch:number;privateRequests:Pending[];frames:FrameRequestCallback[];closed:number})=>Promise<void>){
 const f={variant:'real',epoch:1,privateRequests:[] as Pending[],frames:[] as FrameRequestCallback[],closed:0};
 const prior=globalThis.requestAnimationFrame;(globalThis as any).portraitPreparation=f;globalThis.requestAnimationFrame=fn=>{f.frames.push(fn);return f.frames.length;};
 try{await run(f);}finally{for(const pending of f.privateRequests.splice(0))pending.resolve(null);await tick();globalThis.requestAnimationFrame=prior;delete (globalThis as any).portraitPreparation;}
}

test('usable fictional poses do not wait for appearance status or private artwork and real replacement waits for GPU',async()=>fixture(async f=>{
 const initialized:Texture[]=[],off=registerBillboardRenderer({initTexture:texture=>{initialized.push(texture);}});
 const release=await prepareBillboards(['jiang']);const rig=createBillboardCharacter('jiang');const plane=rig.root.children[0] as any,initial=plane.material.map;
 assert.ok(initial.image.source===staticAssetUrl(npcFallbackPoseFilename('jiang','idle')));assert.ok(f.privateRequests.length>0);assert.equal(initialized.length,0);
 for(const pending of f.privateRequests.splice(0))pending.resolve(new TextEncoder().encode('authorized-private:'+pending.name).buffer);
 await tick();rig.update(0,idle,0);assert.equal(plane.material.map,initial,'queued GPU uploads cannot become visible early');
 for(let i=0;i<100;i++){for(const frame of f.frames.splice(0))frame(i);await tick();}
 rig.update(0,idle,0);assert.notEqual(plane.material.map,initial);assert.ok(initialized.includes(plane.material.map));
 f.variant='fictional';f.epoch++;(globalThis as any).portraitChanged();rig.update(0,idle,0);assert.equal(plane.material.map,initial,'revocation restores the already-ready public fallback immediately');
 rig.dispose();release();off();for(const frame of f.frames.splice(0))frame(0);await tick();assert.equal(billboardResourceDiagnostics().entries,0);
}));

test('revoked private bytes and queued GPU work cannot publish into the next appearance generation',async()=>fixture(async f=>{
 let uploads=0;const off=registerBillboardRenderer({initTexture:()=>{uploads++;}}),release=await prepareBillboards(['meng']),rig=createBillboardCharacter('meng'),plane=rig.root.children[0] as any,initial=plane.material.map;
 const pending=f.privateRequests.splice(0);f.variant='fictional';f.epoch++;(globalThis as any).portraitChanged();
 for(const request of pending){assert.equal(request.signal.aborted,true);request.resolve(new TextEncoder().encode('late-private').buffer);}
 await tick();rig.update(0,idle,0);assert.equal(plane.material.map,initial);assert.equal(uploads,0);
 rig.dispose();release();off();for(const frame of f.frames.splice(0))frame(0);await tick();assert.equal(billboardResourceDiagnostics().entries,0);
}));
