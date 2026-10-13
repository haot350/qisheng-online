import {Vector3} from 'three';

type Position={x:number;y:number;z:number};
type RayDistance=(origin:Vector3,direction:Vector3,max:number)=>number;

/** The supplied world ray keeps its player-collider exclusion; smoke is not a pickup obstacle. */
export function pickupReachable(feet:Position,eye:Position,pickup:Position,range:number,rayDistance:RayDistance):boolean{
  if(Math.hypot(pickup.x-feet.x,pickup.y-feet.y,pickup.z-feet.z)>=range)return false;
  const origin=new Vector3(eye.x,eye.y,eye.z);
  const direction=new Vector3(pickup.x,pickup.y+.7,pickup.z).sub(origin);
  const distance=direction.length();
  if(distance<.000001)return true;
  direction.divideScalar(distance);
  return rayDistance(origin,direction,distance)>=distance-.05;
}
