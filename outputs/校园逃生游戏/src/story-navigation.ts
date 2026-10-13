import * as THREE from 'three';
import type {StorySnapshot} from './story/types';

/** A cached route starts at an older foot position. Never select that start
 * again after the player has advanced along the route; use the nearest 3D
 * segment so overlapping stair flights are kept separate as well. */
export function nextStoryLeg(from:THREE.Vector3,path:THREE.Vector3[]):THREE.Vector3|undefined{
 if(path.length<2)return path.find(p=>p.clone().sub(from).setY(0).length()>.55);
 let segment=0,closest=Infinity,projection=path[0].clone();
 for(let i=0;i<path.length-1;i++){
  const start=path[i],edge=path[i+1].clone().sub(start),length=edge.lengthSq(),t=length?THREE.MathUtils.clamp(from.clone().sub(start).dot(edge)/length,0,1):0,p=start.clone().addScaledVector(edge,t),distance=p.distanceToSquared(from);
  if(distance<closest){closest=distance;segment=i;projection=p;}
 }
 if(projection.clone().sub(from).setY(0).length()>.55)return projection;
 return path.slice(segment+1).find(p=>p.clone().sub(from).setY(0).length()>.55);
}

/** The arrow follows the next walkable leg rather than pointing through walls. */
export function storyNavigation(s:StorySnapshot,from:THREE.Vector3,yaw:number,path:THREE.Vector3[]):StorySnapshot['navigation']{
 if(!s.guidance.routeHelpRequested||!s.target||s.dialogue||s.finished)return;
 if(s.distance!==null&&s.distance<=s.target.radius)return;
 const next=nextStoryLeg(from,path);
 if(!next)return {label:'路线正在确认',bearing:0,distance:0,visible:false};
 const delta=next.clone().sub(from),angle=Math.atan2(delta.x,-delta.z)+yaw;
 const level=Math.max(1,Math.min(4,Math.round((s.target.position[1]-.61)/3.82)+1));
 const floorHint=Math.abs(s.target.position[1]-from.y)>1.7?`前往${level}层 · 沿楼梯走`:s.target.position[1]>2?`${level}层`:undefined;
 return {label:s.target.label,bearing:Math.atan2(Math.sin(angle),Math.cos(angle)),distance:delta.length(),floorHint,visible:true};
}
