import test from 'node:test';
import assert from 'node:assert/strict';
import {checkModeWeaponResources} from '../scripts/browser-mode-smoke-v032.mjs';
test('non-hostile modes cannot retain or request firearms',()=>{
 for(const mode of ['story','roam']){
  checkModeWeaponResources(mode,{weaponResources:{references:0,keys:[]},npcs:[]},[]);
  assert.throws(()=>checkModeWeaponResources(mode,{weaponResources:{references:1,keys:['glock-near']},npcs:[]},[]));
  assert.throws(()=>checkModeWeaponResources(mode,{weaponResources:{references:0,keys:[]},npcs:[]},['/weapons/mp5-far.glb']));
 }
});
test('driving uses deduplicated far guns for precisely the four sampled identities',()=>{
 const state={npcs:[{weapon:'mp5'},{weapon:'mp5'},{weapon:'ak47'},{weapon:'glock'}],weaponResources:{references:7,keys:['glock-far','mp5-far','ak47-far']}};
 checkModeWeaponResources('dafei',state,['/weapons/mp5-far.glb','/weapons/ak47-far.glb','/weapons/glock-far.glb']);
 assert.throws(()=>checkModeWeaponResources('dafei',{...state,weaponResources:{keys:['glock-far','mp5-near','ak47-far']}},[]));
 assert.throws(()=>checkModeWeaponResources('dafei',state,['/weapons/mp5-near.glb']));
 assert.throws(()=>checkModeWeaponResources('dafei',{...state,npcs:state.npcs.slice(0,3)},[]));
});
