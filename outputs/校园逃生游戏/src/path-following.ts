import {Vector3} from 'three';

/** Keep corners until the capsule has reached them; never skip a waypoint on another level. */
export function pathMotion(position:Vector3,path:Vector3[],speed:number,dt:number){
 while(path.length){
  const delta=path[0].clone().sub(position),horizontal=Math.hypot(delta.x,delta.z);
  if(horizontal<.12&&Math.abs(delta.y)<.35){path.shift();continue;}
  delta.y=0;
  return horizontal>1e-6?delta.multiplyScalar(Math.min(horizontal,speed*dt)/horizontal):new Vector3();
 }
 return new Vector3();
}
