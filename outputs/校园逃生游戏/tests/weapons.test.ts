import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Mesh,Vector3,PerspectiveCamera,Quaternion,Group} from 'three';
import {prepareWeapons,createWorldWeapon} from '../src/weapons.ts';
import {createViewWeapon} from '../src/characters.ts';
import {WEAPON_IDS} from '../src/rules.ts';
import {staticAssetUrl} from '../src/static-assets.ts';

async function fixture(run:()=>Promise<void>|void){
 const original=globalThis.fetch,paths=WEAPON_IDS.flatMap(id=>['near','far'].map(lod=>`/weapons/${id}-${lod}.glb`));
 globalThis.fetch=async input=>{const url=String(input),path=paths.find(path=>staticAssetUrl(path)===url);assert.ok(path,url);return new Response(await readFile(new URL('../public'+path,import.meta.url)));};
 let release:(()=>void)|undefined;
 try{release=await prepareWeapons();await run();}finally{release?.();globalThis.fetch=original;}
}
function meshes(root:any){const found:Mesh[]=[];root.traverse((o:any)=>{if(o instanceof Mesh&&o.name!=='muzzle-flash')found.push(o);});return found;}

test('all fourteen authored Meshopt assets retain muzzle anchors, local metre scale and two-material NPC budgets',async()=>fixture(()=>{
 for(const id of WEAPON_IDS)for(const lod of ['near','far'] as const){const gun=createWorldWeapon(id,lod);try{
  const muzzle=gun.getMuzzleWorld();assert.ok(muzzle.z<-.1&&muzzle.z>-.95);assert.ok(Math.abs(muzzle.x)<1e-6);assert.ok(muzzle.y>0&&muzzle.y<.08);
  for(const name of ['grip','support','trigger','sight','ejection'])assert.ok(gun.root.getObjectByName(name),id+' missing '+name);
  const parts=meshes(gun.root),triangles=parts.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
  assert.ok(lod==='near'?triangles>=6000&&triangles<=30000:triangles>=1000&&triangles<=3000,`${id} ${lod}: ${triangles}`);
  const materials=new Set(parts.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]));assert.ok(materials.size<=2);if(lod==='far')assert.ok(parts.length<=3);
 }finally{gun.dispose();}}
}));

test('NPC gun aim and shot events are separate from image facing and shared resources survive recreation',async()=>fixture(()=>{
 const a=createWorldWeapon('m4a1'),b=createWorldWeapon('m4a1');const shared=meshes(a.root)[0].geometry;assert.equal(meshes(b.root)[0].geometry,shared);
 let disposed=0;shared.addEventListener('dispose',()=>disposed++);
 a.root.position.set(2,1,3);const target=new Vector3(7,2,-5);a.update(1,{aimTarget:target,reloadProgress:0,shotSerial:0,lowered:false});a.root.updateMatrixWorld(true);
 const barrel=a.getMuzzleDirectionWorld();assert.ok(barrel.dot(target.clone().sub(a.getMuzzleWorld()).normalize())>.99999,'actual muzzle axis points at target rather than the mount origin');
 assert.equal(a.root.getObjectByName('muzzle-flash')!.visible,false);a.update(.016,{aimTarget:target,reloadProgress:0,shotSerial:1,lowered:false});assert.equal(a.root.getObjectByName('muzzle-flash')!.visible,true);
 a.update(.06,{aimTarget:target,reloadProgress:0,shotSerial:1,lowered:false});assert.equal(a.root.getObjectByName('muzzle-flash')!.visible,false);
 a.update(.016,{aimTarget:target,reloadProgress:0,shotSerial:2,lowered:false});a.update(0,{aimTarget:target,reloadProgress:0,shotSerial:0,lowered:false});assert.equal(a.root.getObjectByName('muzzle-flash')!.visible,false,'a new round clears old muzzle feedback immediately');
 a.dispose();assert.equal(disposed,0);const c=createWorldWeapon('m4a1');assert.equal(meshes(c.root)[0].geometry,shared);b.dispose();c.dispose();assert.equal(disposed,0);
}));

test('first-person muzzle transforms into the player camera world and reload transforms stay per instance',async()=>fixture(()=>{
 const view=createViewWeapon(),second=createWorldWeapon('glock','near');try{
  const camera=new PerspectiveCamera();camera.position.set(12,1.62,9);camera.rotation.y=Math.PI/2;
  view.update(2,{weapon:'glock',moving:0,aim:true,reloading:0,recoil:0,running:false,crouch:false,shotSerial:0});
  const muzzle=view.getMuzzle(camera);assert.ok(muzzle.x<camera.position.x-.3);assert.ok(Math.abs(muzzle.z-camera.position.z)<.01);assert.ok(view.getAimDirection(camera).x<-.99);
  const magazine=second.root.getObjectByName('magazine')!,before=magazine.position.clone();
  view.update(.016,{weapon:'glock',moving:0,aim:false,reloading:.4,recoil:0,running:false,crouch:false,shotSerial:0});assert.ok(magazine.position.equals(before));
  view.update(.016,{weapon:'m4a1',moving:0,aim:false,reloading:0,recoil:0,running:false,crouch:false,shotSerial:3});view.update(.016,{weapon:'glock',moving:0,aim:false,reloading:0,recoil:0,running:false,crouch:false,shotSerial:3});
  const active=view.root.getObjectsByProperty('name','firearm-mount').find(g=>g.visible)!;assert.equal(active.getObjectByName('muzzle-flash')!.visible,false,'switching back must not replay another weapon’s previous shots');
 }finally{view.dispose();second.dispose();}
}));

// Exercise the same grip-aligned placement used by billboard rigs with actual far GLB anchors.
test('held muzzle remains aligned at 1.2, 5 and 15 metres, including pitched targets and rotated parents',async()=>fixture(()=>{
 for(const id of WEAPON_IDS)for(const distance of [1.2,5,15])for(const elevation of [-.7,0,.7]){
  const parent=new Group();parent.position.set(12,2.45,-80);parent.rotation.y=.71;const gun=createWorldWeapon(id,'far');parent.add(gun.root);const grip=new Vector3(.11,1.30,-.18),localGrip=new Vector3();parent.updateMatrixWorld(true);const held=parent.localToWorld(grip.clone()),target=held.clone().add(new Vector3(.21,elevation,-distance));
  try{
   for(let i=0;i<90;i++){gun.root.position.copy(grip);parent.updateMatrixWorld(true);gun.update(1/60,{aimTarget:target,gripWorld:held,reloadProgress:0,shotSerial:0,lowered:false});gun.root.position.copy(grip).sub(gun.getAnchorLocal('grip',localGrip).applyQuaternion(gun.root.quaternion));parent.updateMatrixWorld(true);}
   const dot=gun.getMuzzleDirectionWorld().dot(target.clone().sub(gun.getMuzzleWorld()).normalize());assert.ok(dot>.999999,`${id}: ${distance}m, pitch ${elevation}, dot ${dot}`);assert.equal(gun.isAimReady(target,.001),true);assert.equal(gun.getAimReady(.001),true);
   assert.ok(gun.getAnchorWorld('grip').distanceTo(held)<1e-7,'right hand stays anchored while the barrel turns');
   gun.update(1/60,{aimTarget:target,gripWorld:held,reloadProgress:0,shotSerial:0,lowered:true});assert.equal(gun.getAimReady(),false,'lowered gun never qualifies to fire');
  }finally{gun.dispose();}
 }
}));
