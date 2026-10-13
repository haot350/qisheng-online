import {Magazine,WEAPONS} from './rules.ts';
import type {WeaponId,Vec3} from './types';
export const DROP_RULES={radius:2,max:8,lifetime:45} as const;
export type WeaponDrop={id:string;weapon:WeaponId;gun:Magazine;position:Vec3;left:number;pending:boolean;error:boolean};
/** Simulation-owned entries; async resource acquisition is committed by the engine. */
export class WeaponDrops {
 private serial=0;private rows:WeaponDrop[]=[];
 add(gun:Magazine,position:Vec3){gun.cancelReload();const def=WEAPONS[gun.id];gun.reserve=Math.min(gun.reserve,def.capacity*2);const drop:WeaponDrop={id:'drop-'+(++this.serial),weapon:gun.id,gun,position:[...position],left:DROP_RULES.lifetime,pending:false,error:false};this.rows.push(drop);return {drop,removed:this.rows.length>DROP_RULES.max?this.rows.shift():undefined};}
 update(dt:number){const removed:WeaponDrop[]=[];for(const row of this.rows)if(!row.pending)row.left-=Math.max(0,dt);this.rows=this.rows.filter(row=>{if(row.left>0)return true;removed.push(row);return false;});return removed;}
 nearest(position:Vec3,reachable:(drop:WeaponDrop)=>boolean){return this.rows.filter(row=>Math.hypot(row.position[0]-position[0],row.position[1]-position[1],row.position[2]-position[2])<=DROP_RULES.radius&&reachable(row)).sort((a,b)=>Math.hypot(...a.position.map((v,i)=>v-position[i]) as Vec3)-Math.hypot(...b.position.map((v,i)=>v-position[i]) as Vec3))[0];}
 get(id:string){return this.rows.find(row=>row.id===id);}
 remove(id:string){const row=this.get(id);if(row)this.rows=this.rows.filter(x=>x!==row);return row;}
 all(){return [...this.rows];}
 reset(){const rows=this.rows;this.rows=[];return rows;}
}
export {canCollectSameWeapon,collectSameWeapon} from '@qisheng/shared/ammo';
export type {AmmoTransferTarget,AmmoTransferSource} from '@qisheng/shared/ammo';
