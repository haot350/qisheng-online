import type {MapManifest,Vec3} from './types';
export type StairGuide={core:string;label:string;direction:'up'|'down';floor:number;position:Vec3;distance:number};
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function projection(point:Vec3,a:Vec3,b:Vec3){const delta=b.map((v,i)=>v-a[i]),length=delta.reduce((n,v)=>n+v*v,0),t=length?Math.max(0,Math.min(1,point.reduce((n,v,i)=>n+(v-a[i])*delta[i],0)/length)):0;return {t,distance:Math.hypot(...point.map((v,i)=>v-a[i]-delta[i]*t))};}
/** A stair is named only when the validated movement route traverses its measured height. */
export function stairGuideForRoute(position:Vec3,route:readonly Vec3[],stairs:MapManifest['stairRoutes'],currentFloor:number,targetFloor:number):StairGuide|null{
 if(currentFloor===targetFloor||route.length<2||!stairs?.length)return null;
 const direction=targetFloor>currentFloor?'up':'down',nodes=[position,...route],offsets=[0];for(let i=1;i<nodes.length;i++)offsets.push(offsets[i-1]+distance(nodes[i-1],nodes[i]));
 const cores=[...new Set(stairs.map(s=>s.core))].sort((a,b)=>{const mean=(core:string)=>{const points=stairs.filter(s=>s.core===core).flatMap(s=>s.points);return points.reduce((n,p)=>n+p[0],0)/points.length;};return mean(a)-mean(b);});
 let result:StairGuide|null=null;
 for(const stair of stairs){if(stair.points.length<2)continue;if(direction==='up'&&(stair.to_floor<=currentFloor||stair.from_floor>=targetFloor)||direction==='down'&&(stair.from_floor>=currentFloor||stair.to_floor<=targetFloor))continue;
  const matches:{along:number;y:number;point:Vec3}[]=[];
  for(const point of stair.points){let best={along:Infinity,distance:Infinity};for(let i=1;i<nodes.length;i++){const hit=projection(point,nodes[i-1],nodes[i]);if(hit.distance<best.distance)best={distance:hit.distance,along:offsets[i-1]+hit.t*distance(nodes[i-1],nodes[i])};}if(best.distance<.6)matches.push({along:best.along,y:point[1],point});}
  if(matches.length<2||Math.max(...matches.map(m=>m.y))-Math.min(...matches.map(m=>m.y))<.6)continue;
  matches.sort((a,b)=>a.along-b.along);const first=matches[0],last=matches[matches.length-1];if(direction==='up'?last.y-first.y<.5:first.y-last.y<.5)continue;
  if(!result||first.along<result.distance)result={core:stair.core,label:cores.length===2?(stair.core===cores[0]?'西侧楼梯':'东侧楼梯'):'楼梯',direction,floor:targetFloor,position:[...first.point],distance:first.along};
 }
 return result;
}
