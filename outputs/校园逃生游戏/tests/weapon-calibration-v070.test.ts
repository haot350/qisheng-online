import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {prepareWeapons,createWorldWeapon} from '../src/weapons.ts';
import {createViewWeapon} from '../src/characters.ts';
import {Magazine,WEAPONS,WEAPON_IDS} from '../src/rules.ts';
import {staticAssetUrl} from '../src/static-assets.ts';

async function assets(run:()=>Promise<void>|void){
 const previous=globalThis.fetch,paths=WEAPON_IDS.flatMap(id=>['near','far'].map(lod=>`/weapons/${id}-${lod}.glb`));
 globalThis.fetch=async input=>{const path=paths.find(path=>staticAssetUrl(path)===String(input));assert.ok(path);return new Response(await readFile(new URL('../public'+path,import.meta.url)));};
 let release:(()=>void)|undefined;
 try{release=await prepareWeapons();await run();}finally{release?.();globalThis.fetch=previous;}
}

test('seven authored guns align both hands, trigger and ADS sight in the actual view graph',()=>assets(()=>{
 const view=createViewWeapon();
 try{for(const weapon of WEAPON_IDS){for(let i=0;i<180;i++)view.update(1/60,{weapon,moving:0,aim:true,reloading:0,recoil:0,running:false,crouch:false,shotSerial:0,action:new Magazine(weapon).action});
  view.root.updateMatrixWorld(true);const mount=view.root.getObjectsByProperty('name','firearm-mount').find(g=>g.visible)!;
  for(const [hand,anchor]of [['right-grip-hand','grip'],['left-support-hand','support'],['trigger-finger','trigger']] as const){const at=view.root.getObjectByName(hand)!.getWorldPosition(new Vector3()),target=mount.getObjectByName(anchor)!.getWorldPosition(new Vector3());assert.ok(at.distanceTo(target)<1e-6,`${weapon} ${hand} anchor error ${at.distanceTo(target)}`);}
  const sight=mount.getObjectByName('sight')!.getWorldPosition(new Vector3());assert.ok(Math.hypot(sight.x,sight.y)<.002,`${weapon} ADS sight offset ${sight.toArray()}`);
 }}finally{view.dispose();}
}));

test('R870 pump, AWM bolt and M249 cover read the same exact action phase as fire readiness',()=>assets(()=>{
 for(const id of ['r870','awm','m249'] as const){const mag=new Magazine(id),gun=createWorldWeapon(id,'near'),target=new Vector3(0,.04,-20);try{
  if(id==='m249'){mag.ammo=0;mag.reload();mag.update(mag.reloadDuration*.115);}else{assert.ok(mag.fire());mag.update(WEAPONS[id].interval*.5);}
  gun.update(1/60,{aimTarget:target,reloadProgress:mag.reloadProgress,shotSerial:1,lowered:false,action:mag.action});assert.equal(gun.getAimReady(),false);assert.equal(mag.fire(),false);
  const part=gun.root.getObjectByName(id==='r870'?'pump':id==='awm'?'bolt-handle':'cover')!;assert.ok(part);const animated=id==='m249'?Math.abs(part.rotation.x):Math.abs(part.position.z);assert.ok(animated>.01,`${id} actual part must move during action`);
  mag.update(10);for(let i=0;i<90;i++)gun.update(1/60,{aimTarget:target,reloadProgress:mag.reloadProgress,shotSerial:1,lowered:false,action:mag.action});assert.equal(mag.action.ready,true);assert.equal(gun.getAimReady(),true);assert.equal(mag.fire(),true);
 }finally{gun.dispose();}}
}));
