import {Vector3} from 'three';
export type CrowdNeighbour={id:number;position:Vector3;direction:Vector3};
/** Local right-hand passing/queueing. It only changes desired motion; the same
 * capsule controller still decides whether a sidestep has real support. */
export function crowdMotion(id:number,position:Vector3,desired:Vector3,neighbours:CrowdNeighbour[],dt:number){
 const motion=desired.clone(),speed=Math.hypot(desired.x,desired.z)/dt;let yielding=false;
 if(speed<.1)return {motion,yielding};
 const forward=new Vector3(desired.x,0,desired.z).normalize(),right=new Vector3(-forward.z,0,forward.x);
 for(const other of neighbours){
  if(other.id===id||Math.abs(other.position.y-position.y)>.65)continue;
  const delta=other.position.clone().sub(position).setY(0),distance=delta.length(),ahead=delta.dot(forward),side=delta.dot(right);
  if(distance<.02||distance>1.25||ahead<.05||Math.abs(side)>.57)continue;
  const direction=other.direction.clone().setY(0),moving=direction.lengthSq()>1e-8;if(moving)direction.normalize();
  const alignment=moving?direction.dot(forward):0;
  if(alignment>.45&&distance<.8){motion.x*=.12;motion.z*=.12;yielding=true;}
  else if(alignment<=.45&&distance<1.1){
   motion.addScaledVector(right,Math.min(.85,speed*.6)*dt);
   if(distance<.72&&id>other.id){motion.x*=.5;motion.z*=.5;yielding=true;}
  }
 }
 return {motion,yielding};
}
