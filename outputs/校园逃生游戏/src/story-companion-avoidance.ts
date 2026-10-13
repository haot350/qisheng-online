import * as THREE from 'three';

type Navigation={
 storyPath(from:THREE.Vector3,to:THREE.Vector3):THREE.Vector3[];
 supportAt(position:THREE.Vector3,clearanceHeight?:number):{height:number;normalY:number;clear:boolean}|null;
};
const clearance=.68,sampleSpacing=.12,maxFloorChange=.22;
const horizontalDistance=(a:THREE.Vector3,b:THREE.Vector3)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=(p:THREE.Vector3)=>[p.x,p.y,p.z].every(Number.isFinite);

function characterClear(from:THREE.Vector3,to:THREE.Vector3,obstacles:readonly THREE.Vector3[]){
 const dx=to.x-from.x,dz=to.z-from.z,lengthSq=dx*dx+dz*dz;
 for(const obstacle of obstacles){
  if(!finite(obstacle)||Math.abs(obstacle.y-from.y)>.4)continue;
  const x=from.x-obstacle.x,z=from.z-obstacle.z,start=Math.hypot(x,z),t=lengthSq?THREE.MathUtils.clamp(-(x*dx+z*dz)/lengthSq,0,1):0;
  const closest=Math.hypot(x+dx*t,z+dz*t);
  // A touching capsule may depart, but must never move closer. Once outside
  // the radius, the whole segment must preserve clearance, including diagonals.
  if(closest<(start<clearance?start-.001:clearance))return false;
 }
 return true;
}

/** A local route still goes through storyPath, floor clearance and moveActor.
 * Short navigation legs retain a sideways departure instead of rejoining the
 * corridor's centre before the companion has passed the blocking capsule. */
export function companionBypass(world:Navigation,from:THREE.Vector3,destination:THREE.Vector3,player:THREE.Vector3,others:readonly THREE.Vector3[]=[]):THREE.Vector3[]|null{
 if(![from,destination,player].every(finite)||Math.abs(player.y-from.y)>.4)return null;
 const forward=destination.clone().sub(from).setY(0),remaining=forward.length();
 if(remaining<.3)return null;forward.divideScalar(remaining);
 const lateral=new THREE.Vector3(-forward.z,0,forward.x),obstacles=[player,...others];
 const firstSide=lateral.dot(from.clone().sub(player))>=0?1:-1;
 for(const advance of[1.4,1.8,2.1])for(const width of[.85,.65,1.05])for(const side of[firstSide,-firstSide]){
  const along=Math.min(advance,remaining),sidePoint=from.clone().addScaledVector(lateral,width*side),pastPoint=sidePoint.clone().addScaledVector(forward,along);
  const anchors=[sidePoint,pastPoint];if(remaining<=along+.7)anchors.push(destination.clone());
  const route:THREE.Vector3[]=[from.clone()];let valid=true;
  for(const anchor of anchors){
   const start=route[route.length-1].clone(),length=horizontalDistance(start,anchor),legs=Math.max(1,Math.ceil(length/.5));
   for(let leg=1;leg<=legs;leg++){
    const end=start.clone().lerp(anchor,leg/legs);end.y=from.y;
    const nav=world.storyPath(route[route.length-1].clone(),end);
    if(!nav.length||!nav.every(p=>finite(p)&&Math.abs(p.y-from.y)<=maxFloorChange)||horizontalDistance(nav[nav.length-1],end)>.15){valid=false;break;}
    for(const point of nav){if(horizontalDistance(route[route.length-1],point)>.025)route.push(point.clone());}
   }
   if(!valid)break;
  }
  if(!valid||route.length<2)continue;
  let travel=0,lowest=Infinity,highest=-Infinity;
  for(let i=1;i<route.length&&valid;i++){
   const start=route[i-1],end=route[i],length=horizontalDistance(start,end);travel+=length;
   if(travel>4.9||horizontalDistance(from,end)>2.65||!characterClear(start,end,obstacles)){valid=false;break;}
   const samples=Math.max(1,Math.ceil(length/sampleSpacing));
   for(let j=0;j<=samples;j++){
    const point=start.clone().lerp(end,j/samples);point.y=from.y;
    const support=world.supportAt(point,1.75);
    if(!support?.clear||support.normalY<.85||Math.abs(support.height-from.y)>maxFloorChange){valid=false;break;}
    lowest=Math.min(lowest,support.height);highest=Math.max(highest,support.height);if(highest-lowest>maxFloorChange){valid=false;break;}
   }
  }
  if(valid&&obstacles.every(p=>Math.abs(p.y-from.y)>.4||horizontalDistance(route[route.length-1],p)>=clearance)){
   for(const point of route){const support=world.supportAt(new THREE.Vector3(point.x,from.y,point.z),1.75);if(support)point.y=support.height;}
   return route.slice(1);
  }
 }
 return null;
}

/** Progress is measured after the caller's single physical movement. A chosen
 * side remains committed until completion, interruption or a bounded timeout. */
export class StoryCompanionAvoidance{
 private route:THREE.Vector3[]=[];
 private stalledFor=0;
 private retryAfter=0;
 private routeAge=0;
 needsSpace=false;
 reset(){this.route=[];this.stalledFor=0;this.retryAfter=0;this.routeAge=0;this.needsSpace=false;}
 waypoint(world:Navigation,position:THREE.Vector3,destination:THREE.Vector3,next:THREE.Vector3|undefined,player?:THREE.Vector3,others:readonly THREE.Vector3[]=[]):THREE.Vector3|undefined{
  if(!next||horizontalDistance(position,destination)<.12){this.reset();return next;}
  while(this.route.length&&horizontalDistance(position,this.route[0])<.14)this.route.shift();
  if(this.route.length&&player&&!characterClear(position,this.route[0],[player,...others])){this.route=[];this.stalledFor=.65;this.retryAfter=0;}
  if(this.route.length&&this.stalledFor<.8&&this.routeAge<6)return this.route[0];
  if(this.routeAge>=6){this.route=[];this.routeAge=0;}
  if(player&&this.stalledFor>=.65&&this.retryAfter<=0){
   this.route=companionBypass(world,position,destination,player,others)??[];this.needsSpace=!this.route.length;
   this.stalledFor=0;this.retryAfter=1;this.routeAge=0;
  }
  return this.route[0]??next;
 }
 observe(from:THREE.Vector3,to:THREE.Vector3,desired:THREE.Vector3,dt:number,player?:THREE.Vector3){
  this.retryAfter=Math.max(0,this.retryAfter-dt);if(this.route.length)this.routeAge+=dt;
  const intended=Math.hypot(desired.x,desired.z),actual=horizontalDistance(from,to),nearPlayer=player&&finite(player)&&Math.abs(player.y-from.y)<=.4&&horizontalDistance(from,player)<1.35;
  const towardsPlayer=nearPlayer&&(horizontalDistance(from,player)<.73||desired.x*(player.x-from.x)+desired.z*(player.z-from.z)>=-.05*intended);
  if(intended>.002&&actual<Math.max(.0015,intended*.2)&&towardsPlayer)this.stalledFor+=dt;
  else{this.stalledFor=0;this.needsSpace=false;}
 }
}

