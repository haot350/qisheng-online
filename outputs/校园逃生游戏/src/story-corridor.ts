import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const height=1.75,radius=.3,rotation={x:0,y:0,z:0,w:1},centreZ=-77.4;
const capsule=new RAPIER.Capsule((height-2*radius)/2,radius);
/** The first-floor corridor's blue floor edging can trap a capsule whose feet
 * straddle both low edges. Route within the surveyed open aisle, never relocate
 * a character or relax its collision. Upper floors and approach roads keep
 * their existing stair/navigation routes. */
export function storyCorridorPath(physics:RAPIER.World,from:THREE.Vector3,to:THREE.Vector3):THREE.Vector3[]|null{
 const inside=(p:THREE.Vector3)=>[p.x,p.y,p.z].every(Number.isFinite)&&p.x>=-66&&p.x<=-35.1&&p.z>=-78.75&&p.z<=-76.85&&p.y>=.3&&p.y<=.8;
 if(!inside(from)||!inside(to)||Math.abs(to.x-from.x)<.8)return null;
 const support=(p:THREE.Vector3)=>{
  const hit=physics.castRayAndGetNormal(new RAPIER.Ray({x:p.x,y:p.y+.65,z:p.z},{x:0,y:-1,z:0}),1.5,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
  if(!hit||hit.normal.y<Math.cos(Math.PI*.27))return null;
  const y=p.y+.65-hit.timeOfImpact;return y>=.3&&y<=.8&&Math.abs(y-p.y)<=.24?y:null;
 };
 const route=[from.clone(),new THREE.Vector3(from.x,from.y,centreZ),new THREE.Vector3(to.x,to.y,centreZ),to.clone()];
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],delta=b.clone().sub(a);delta.y=0;const length=delta.length();if(length<1e-5)continue;
  let highest=-Infinity,lowest=Infinity;const count=Math.max(1,Math.ceil(length/.15));
  for(let j=0;j<=count;j++){const y=support(a.clone().lerp(b,j/count));if(y===null)return null;highest=Math.max(highest,y);lowest=Math.min(lowest,y);}
  if(highest-lowest>.22)return null;
  // Raise only the clearance query above this segment's low floor edges. The
  // actual player continues through world.move's unchanged capsule/autostep.
  const hit=physics.castShape({x:a.x,y:highest+height/2+.025,z:a.z},rotation,delta.divideScalar(length),capsule,0,length,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
  if(hit&&hit.time_of_impact<length-.02)return null;
 }
 for(const p of route){const y=support(p);if(y===null)return null;p.y=y;}
 return route;
}
