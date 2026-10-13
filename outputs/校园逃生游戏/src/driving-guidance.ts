import type {Vec3} from './types.ts';
import type {DriveMap} from './vehicle-physics.ts';
import type {NPCRegion} from './driving-ai.ts';

/** Runtime driving starts; authored collision/navigation and their manifest remain unchanged. */
export const DRIVING_STARTS:ReadonlyArray<{position:Vec3;yaw:number}>=Object.freeze([
 {position:[-77,.075,-88],yaw:Math.PI/2},
 {position:[-77,.074,-67],yaw:Math.PI/2},
]);
export function configureDrivingStart(map:DriveMap,validate:(point:Vec3,yaw:number)=>Vec3|null):DriveMap {
 for(const candidate of [...DRIVING_STARTS,{position:map.spawn,yaw:map.spawnYaw}]){
  const point=validate(candidate.position,candidate.yaw);
  if(point)return {...map,spawn:point,spawnYaw:candidate.yaw};
 }
 throw new Error('没有可用的驾驶起点，请重新载入校园。');
}
export type DrivingAreaHint={id:string;name:string;angle:number};
/** These are broad, fixed campus areas, never the live position of a hidden NPC. */
export function drivingAreaHints(regions:readonly NPCRegion[],position:Vec3,yaw:number):DrivingAreaHint[] {
 return ([['sports','运动区'],['canteen','食堂'],['dorm','宿舍']] as const).flatMap(([id,name])=>{
  const area=regions.filter(r=>r.id.startsWith(id)).sort((a,b)=>Math.hypot(a.home[0]-position[0],a.home[2]-position[2])-Math.hypot(b.home[0]-position[0],b.home[2]-position[2]))[0];
  if(!area)return [];
  const angle=Math.atan2(area.home[0]-position[0],-(area.home[2]-position[2]))+yaw;
  return [{id,name,angle:Math.atan2(Math.sin(angle),Math.cos(angle))}];
 });
}
