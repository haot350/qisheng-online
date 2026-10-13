import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const height=1.75,radius=.3,rotation={x:0,y:0,z:0,w:1};
const clearance=new RAPIER.Capsule((height-.6)/2,.285);
function support(physics:RAPIER.World,p:THREE.Vector3){
 const hit=physics.castRayAndGetNormal(new RAPIER.Ray({x:p.x,y:p.y+.65,z:p.z},{x:0,y:-1,z:0}),1.5,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
 if(!hit||hit.normal.y<Math.cos(Math.PI*.27))return null;
 const ground=p.y+.65-hit.timeOfImpact;
 return ground;
}

/** A short surveyed footpath may cross a low trimesh curb. Never crosses a
 * wall, missing ground, upper-floor edge or more than .22m of elevation. */
export function storyDirectRoute(physics:RAPIER.World,from:THREE.Vector3,to:THREE.Vector3){
 const distance=Math.hypot(to.x-from.x,to.z-from.z);
 if(distance<.05||distance>6||from.y>.8||to.y>.8||Math.abs(to.y-from.y)>.22)return false;
 let highest=-Infinity,lowest=Infinity;
 const count=Math.ceil(distance/.2);
 for(let i=0;i<=count;i++){
  const p=from.clone().lerp(to,i/count),ground=support(physics,p);
  if(ground===null||Math.abs(ground-p.y)>.24)return false;
  highest=Math.max(highest,ground);lowest=Math.min(lowest,ground);
 }
 if(highest-lowest>.22)return false;
 const direction=to.clone().sub(from);direction.y=0;direction.normalize();
 const hit=physics.castShape({x:from.x,y:highest+height/2+.025,z:from.z},rotation,direction,new RAPIER.Capsule((height-.6)/2,radius),0,distance,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
 return !hit||hit.time_of_impact>=distance-.02;
}

/** Returns a bounded desired motion; the original character controller still
 * resolves it against architecture. It never sets an actor's position. */
export function storyCurbLift(physics:RAPIER.World,p:THREE.Vector3,desired:THREE.Vector3){
 if(p.y>.8||desired.lengthSq()<1e-10)return 0;
 const direction=desired.clone();direction.y=0;if(direction.lengthSq()<1e-10)return 0;
 direction.normalize();const current=support(physics,p),supports=[.16,.32,.48].map(distance=>support(physics,p.clone().addScaledVector(direction,distance)));
 // A single distant probe can already be beyond a narrow curb while the front
 // of the capsule still meets it. Sample its whole footprint, not just its end.
 if(current===null||supports.some(height=>height===null))return 0;
 const ahead=Math.max(...supports as number[]);
 if(ahead-current<.025||ahead-current>.22||Math.abs(current-p.y)>.24)return 0;
 const delta=ahead-p.y;
 if(delta<=-.01||delta>.22)return 0;
 const origin={x:p.x,y:Math.max(current,ahead)+height/2+.025,z:p.z};
 if(physics.intersectionWithShape(origin,rotation,clearance,RAPIER.QueryFilterFlags.ONLY_FIXED)!==null)return 0;
 const obstacle=physics.castShape(origin,rotation,direction,clearance,0,.48,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
 if(obstacle&&obstacle.time_of_impact<.46)return 0;
 return Math.min(.04,Math.max(.008,delta+.03));
}
