import type {MapManifest,Vec3} from './types';
export type StairGuide={core:string;label:string;direction:'up'|'down';floor:number;levelId?:string;position:Vec3;distance:number};
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function projection(point:Vec3,a:Vec3,b:Vec3){const delta=b.map((v,i)=>v-a[i]),length=delta.reduce((n,v)=>n+v*v,0),t=length?Math.max(0,Math.min(1,point.reduce((n,v,i)=>n+(v-a[i])*delta[i],0)/length)):0;return {t,distance:Math.hypot(...point.map((v,i)=>v-a[i]-delta[i]*t))};}
/** A stair is named only when the validated movement route traverses its measured height. */
export function stairGuideForRoute(position:Vec3,route:readonly Vec3[],stairs:MapManifest['stairRoutes'],currentFloor:number,targetFloor:number):StairGuide|null{
 if(route.length<2||!stairs?.length)return null;
 if(currentFloor===targetFloor&&!stairs.some(s=>s.buildingId))return null;
 const nodes=[position,...route],offsets=[0];for(let i=1;i<nodes.length;i++)offsets.push(offsets[i-1]+distance(nodes[i-1],nodes[i]));
 const cores=[...new Set(stairs.map(s=>s.core))].sort((a,b)=>{const mean=(core:string)=>{const points=stairs.filter(s=>s.core===core).flatMap(s=>s.points);return points.reduce((n,p)=>n+p[0],0)/points.length;};return mean(a)-mean(b);});
 let result:StairGuide|null=null;
 for(const stair of stairs){if(stair.points.length<2)continue;
  const matches:{along:number;y:number;point:Vec3}[]=[];
  for(const point of stair.points){let best={along:Infinity,distance:Infinity};for(let i=1;i<nodes.length;i++){const hit=projection(point,nodes[i-1],nodes[i]);if(hit.distance<best.distance)best={distance:hit.distance,along:offsets[i-1]+hit.t*distance(nodes[i-1],nodes[i])};}if(best.distance<.6)matches.push({along:best.along,y:point[1],point});}
  if(matches.length<2||Math.max(...matches.map(m=>m.y))-Math.min(...matches.map(m=>m.y))<.6)continue;
  matches.sort((a,b)=>a.along-b.along);const first=matches[0],last=matches[matches.length-1],rise=last.y-first.y;if(Math.abs(rise)<.5)continue;
  const direction=rise>0?'up':'down',buildingCores=stair.buildingId?cores.filter(core=>stairs.some(s=>s.core===core&&s.buildingId===stair.buildingId)):cores;
  const side=buildingCores.length===2?(stair.core===buildingCores[0]?'西侧楼梯':'东侧楼梯'):'楼梯',building=stair.buildingId?.startsWith('south')?'南楼':stair.buildingId?.startsWith('middle')?'中楼':stair.buildingId?.startsWith('north')?'北楼':stair.buildingId==='garage'?'车库':'';
  const floor=(targetFloor-currentFloor)*rise>0?targetFloor:direction==='up'?Math.max(stair.from_floor,stair.to_floor):Math.min(stair.from_floor,stair.to_floor);
  if(!result||first.along<result.distance)result={core:stair.core,label:building+side,direction,floor,levelId:direction==='up'?stair.toLevelId:stair.fromLevelId,position:[...first.point],distance:first.along};
 }
 return result;
}
