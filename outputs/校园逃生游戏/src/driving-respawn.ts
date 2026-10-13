import type {Vec3} from './types.ts';

export const RESPAWN_RULES=Object.freeze({distance:20,retry:.5});
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
/** Reject before randomizing: camera/distance/ground requirements are never relaxed. */
export function chooseDrivingRespawn(points:Vec3[],previous:Vec3,car:Vec3,offscreen:(point:Vec3)=>boolean,safe:(point:Vec3)=>boolean,random:()=>number):Vec3|null {
 const eligible=points.filter(p=>distance(p,previous)>.5&&distance(p,car)>=RESPAWN_RULES.distance&&offscreen(p)&&safe(p));
 return eligible.length?eligible[Math.min(eligible.length-1,Math.floor(random()*eligible.length))]:null;
}
