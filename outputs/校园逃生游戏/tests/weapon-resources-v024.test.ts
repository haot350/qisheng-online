import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {prepareWeapons,createWorldWeapon,weaponResourceDiagnostics} from '../src/weapons.ts';
import {roundWeaponResources} from '../src/weapon-resources.ts';
import {createViewWeapon} from '../src/characters.ts';
import {staticAssetUrl} from '../src/static-assets.ts';
import {WEAPON_IDS} from '../src/rules.ts';

const logicalWeapons=WEAPON_IDS.flatMap(id=>['near','far'].map(lod=>`/weapons/${id}-${lod}.glb`));
const logicalFor=(url:string)=>logicalWeapons.find(path=>staticAssetUrl(path)===url)??url;
function mockWeaponFiles(urls:string[]=[]){const original=globalThis.fetch;globalThis.fetch=async input=>{const url=String(input),logical=logicalFor(url);urls.push(logical);return new Response(await readFile(new URL('../public'+logical,import.meta.url)));};return ()=>{globalThis.fetch=original;};}
const turn=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

test('photography modes require no gun; combat requirements deduplicate and separate LODs',()=>{
 assert.deepEqual(roundWeaponResources('story','m4a1',['mp5']),[]);
 assert.deepEqual(roundWeaponResources('roam','m4a1',['mp5']),[]);
 assert.deepEqual(roundWeaponResources('dafei','m4a1',['mp5','mp5','glock']),[{id:'mp5',lod:'far'},{id:'glock',lod:'far'}]);
 const rows=roundWeaponResources('escape','ak47',['mp5','glock']);
 assert.deepEqual(rows,[{id:'mp5',lod:'far'},{id:'glock',lod:'far'},{id:'glock',lod:'near'},{id:'ak47',lod:'near'},{id:'ak47',lod:'far'}]);
});
test('one round fetches only its guns and geometry is released after its final live instance',async()=>{
 const urls:string[]=[],restoreFetch=mockWeaponFiles(urls);
 let release:(()=>void)|undefined,view:ReturnType<typeof createViewWeapon>|undefined,npc:ReturnType<typeof createWorldWeapon>|undefined;
 try{
  const none=await prepareWeapons(undefined,[]);none();assert.deepEqual(urls,[]);
  release=await prepareWeapons(undefined,roundWeaponResources('escape','mp5',['mp5']));
  assert.deepEqual([...urls].sort(),['/weapons/glock-near.glb','/weapons/mp5-far.glb','/weapons/mp5-near.glb']);
  view=createViewWeapon(['glock','mp5']);npc=createWorldWeapon('mp5');release();release=undefined;
  assert.equal(weaponResourceDiagnostics().models,3);
  view.dispose();view=undefined;assert.deepEqual(weaponResourceDiagnostics().keys,['mp5-far']);
  npc.dispose();npc=undefined;assert.equal(weaponResourceDiagnostics().models,0);
 }finally{view?.dispose();npc?.dispose();release?.();restoreFetch();}
});
test('cancelled weapon preparation releases a late load without publishing a stale lease',async()=>{
 const original=GLTFLoader.prototype.parseAsync,originalFetch=globalThis.fetch;let resolve!: (g:any)=>void;
 const bytes=await readFile(new URL('../public/weapons/glock-far.glb',import.meta.url)),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 let disposed=0;gltf.scene.traverse((o:any)=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>disposed++);});
 GLTFLoader.prototype.parseAsync=()=>new Promise(r=>{resolve=r;});globalThis.fetch=async()=>new Response(new Uint8Array([1]));
 try{
  const controller=new AbortController(),work=prepareWeapons(undefined,[{id:'glock',lod:'far'}],controller.signal);
  while(!resolve)await turn();controller.abort();await assert.rejects(work);resolve(gltf);await turn();
  assert.equal(weaponResourceDiagnostics().models,0);assert.equal(weaponResourceDiagnostics().pending,0);assert.equal(weaponResourceDiagnostics().references,0);assert.ok(disposed>0);
 }finally{GLTFLoader.prototype.parseAsync=original;globalThis.fetch=originalFetch;}
});

test('malformed weapon never publishes a model or retains a partial round',async()=>{
 const original=GLTFLoader.prototype.parseAsync,originalFetch=globalThis.fetch;let disposed=0;
 globalThis.fetch=async input=>new Response(new TextEncoder().encode(logicalFor(String(input))));
 GLTFLoader.prototype.parseAsync=async function(bytes){const url=new TextDecoder().decode(bytes as ArrayBuffer);const scene=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();geometry.addEventListener('dispose',()=>disposed++);scene.add(new THREE.Mesh(geometry,material));if(String(url).includes('glock')){const muzzle=new THREE.Group();muzzle.name='muzzle';scene.add(muzzle);}return {scene} as any;};
 try{await assert.rejects(prepareWeapons(undefined,[{id:'glock',lod:'near'},{id:'mp5',lod:'near'}]));await new Promise(r=>setTimeout(r,0));assert.equal(weaponResourceDiagnostics().models,0);assert.equal(weaponResourceDiagnostics().references,0);assert.equal(disposed,2);}finally{GLTFLoader.prototype.parseAsync=original;globalThis.fetch=originalFetch;}
});
test('first-person preparation rolls back earlier guns if a requested gun was not leased',async()=>{
 const restoreFetch=mockWeaponFiles();let release:undefined|(()=>void);
 try{release=await prepareWeapons(undefined,[{id:'glock',lod:'near'}]);assert.throws(()=>createViewWeapon(['glock','mp5']));release();release=undefined;assert.equal(weaponResourceDiagnostics().models,0);assert.equal(weaponResourceDiagnostics().references,0);}finally{release?.();restoreFetch();}
});
