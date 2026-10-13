import type {Mode, WeaponId} from './types';
export type WeaponResource = {id:WeaponId;lod:'near'|'far'};
/** World weapons belong to the drawn roster; first-person weapons only to escape. */
export function roundWeaponResources(mode:Mode,primary:WeaponId,npcWeapons:WeaponId[]):WeaponResource[]{
 if(mode==='story'||mode==='roam')return [];
 const rows:WeaponResource[]=npcWeapons.map(id=>({id,lod:'far'}));
 if(mode==='escape')rows.push({id:'glock',lod:'near'},{id:primary,lod:'near'},{id:primary,lod:'far'});
 return [...new Map(rows.map(row=>[`${row.id}-${row.lod}`,row])).values()];
}
