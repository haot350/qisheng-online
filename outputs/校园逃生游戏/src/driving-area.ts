import type {Vec3} from './types.ts';

export type DriveExclusion = {kind?:'circle';center:[number,number];radius:number} | {
 kind:'sector';center:[number,number];radius:number;tipRadius:number;startAngle:number;endAngle:number;
};
export type DriveAreaMap = {
 bounds:{min:Vec3;max:Vec3};
 excluded?:DriveExclusion[];
 barriers:{center:Vec3;half:Vec3;yaw?:number;reason:string}[];
};
type Position={x:number;y:number;z:number};
const segmentDistance=(x:number,z:number,ax:number,az:number,bx:number,bz:number)=>{
 const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-ax-t*dx,z-az-t*dz);
};
/** Radians counter-clockwise in XZ; sectors use a non-wrapping start <= end. */
export function drivePointExcluded(p:Position,e:DriveExclusion,padding=.5):boolean {
 const x=p.x-e.center[0],z=p.z-e.center[1],r=Math.hypot(x,z);
 if(e.kind!=='sector')return r<e.radius+padding;
 const angle=Math.atan2(z,x),insideAngle=angle>=e.startAngle&&angle<=e.endAngle;
 if(r<e.tipRadius+padding||insideAngle&&r<e.radius+padding)return true;
 // Buffer only the true two radial walls, never fill the western planting wedge.
 return [e.startAngle,e.endAngle].some(a=>segmentDistance(x,z,e.tipRadius*Math.cos(a),e.tipRadius*Math.sin(a),e.radius*Math.cos(a),e.radius*Math.sin(a))<padding);
}
/** Shared by map generation, navigation and safe vehicle/NPC recovery. */
export function driveAreaAllowed(map:DriveAreaMap,p:Position):boolean {
 return [p.x,p.y,p.z].every(Number.isFinite)&&p.y>-.35&&p.y<.8&&
  p.x>map.bounds.min[0]+1&&p.x<map.bounds.max[0]-1&&p.z>map.bounds.min[2]+1&&p.z<map.bounds.max[2]-1&&
  !(map.excluded??[]).some(e=>drivePointExcluded(p,e))&&
  !map.barriers.some(b=>{const dx=p.x-b.center[0],dz=p.z-b.center[2],yaw=b.yaw??0,x=dx*Math.cos(yaw)-dz*Math.sin(yaw),z=dx*Math.sin(yaw)+dz*Math.cos(yaw);return Math.abs(x)<b.half[0]+.4&&Math.abs(z)<b.half[2]+.4;});
}
