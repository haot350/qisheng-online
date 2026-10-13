import {Vector3} from 'three';
export type ActorNavigationStatus={blocked:boolean;avoidanceLeft:number;yielding:boolean};
type State={stall:number;left:number;yieldLeft:number;point:Vector3;direction:Vector3};
/** Timers advance once per world step; static failures never turn into a teleport. */
export class NavigationAvoidance{
 private states=new Map<number,State>();
 private state(id:number){let s=this.states.get(id);if(!s){s={stall:0,left:0,yieldLeft:0,point:new Vector3(),direction:new Vector3()};this.states.set(id,s);}return s;}
 observe(id:number,from:Vector3,desired:Vector3,actual:Vector3,staticBlocked:boolean,dt:number){
  const s=this.state(id),wanted=Math.hypot(desired.x,desired.z),moved=Math.hypot(actual.x,actual.z);
  if(wanted>.004&&staticBlocked&&moved<wanted*.16){s.stall+=dt;if(s.stall>=.75&&s.left<=0){s.left=8;s.point.copy(from);s.direction.copy(desired).setY(0).normalize();s.stall=0;}}
  else s.stall=0;
 }
 yield(id:number){this.state(id).yieldLeft=.18;}
 tick(dt:number){for(const s of this.states.values()){s.left=Math.max(0,s.left-dt);s.yieldLeft=Math.max(0,s.yieldLeft-dt);}}
 excludes(id:number,a:Vector3,b:Vector3){const s=this.states.get(id);if(!s||s.left<=0||Math.abs(a.y-s.point.y)>.65)return false;const d=b.clone().sub(a).setY(0),length=d.length();if(length<.05)return false;d.divideScalar(length);return a.distanceTo(s.point)<2&&d.dot(s.direction)>.55;}
 status(id:number):ActorNavigationStatus|null{const s=this.states.get(id);return s?{blocked:s.left>0,avoidanceLeft:s.left,yielding:s.yieldLeft>0}:null;}
 remove(id:number){this.states.delete(id);}
 reset(){this.states.clear();}
}
/** Recast can project the starting point under a low kerb while the capsule is
 * supported by its rounded footprint. Preserve feet only at that same start,
 * never at another floor, never by skipping a forward corner. */
export function normalizeCampusRoute(from:Vector3,to:Vector3,route:Vector3[]){
 if(!route.length||route.at(-1)!.distanceTo(to)>1.2||Math.abs(route.at(-1)!.y-to.y)>.5)return [];
 const result=route.map(p=>p.clone());
 if(Math.hypot(result[0].x-from.x,result[0].z-from.z)<.35&&Math.abs(result[0].y-from.y)<.5)result[0].copy(from);
 return result;
}
