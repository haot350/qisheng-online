import {WEAPONS} from './rules.ts';
import type {WeaponId} from './types.ts';
export interface AmmoTransferTarget {id:WeaponId;ammo:number;reserve:number;action:{ready:boolean};}
export interface AmmoTransferSource {ammo:number;reserve:number;}
export function canCollectSameWeapon(target:AmmoTransferTarget,source:AmmoTransferSource){const def=WEAPONS[target.id];return source.ammo+source.reserve>0&&(target.action.ready&&target.ammo<def.capacity||target.reserve<def.reserve*2);}
/** Same-gun pickup fills only a ready magazine, then reserve, retaining every unclaimed round. */
export function collectSameWeapon(target:AmmoTransferTarget,source:AmmoTransferSource){const def=WEAPONS[target.id],cap=def.reserve*2,total=source.ammo+source.reserve;let left=total;if(target.action.ready){const count=Math.min(Math.max(0,def.capacity-target.ammo),left);target.ammo+=count;left-=count;}const count=Math.min(Math.max(0,cap-target.reserve),left);target.reserve+=count;left-=count;const taken=total-left;source.ammo=Math.max(0,source.ammo-taken);source.reserve=Math.max(0,left-source.ammo);return taken;}
