import type {NearbyInteraction,NearbyInteractionKind,NearbyInteractionAction} from '@qisheng/shared/types';
export type {NearbyInteraction,NearbyInteractionKind,NearbyInteractionAction} from '@qisheng/shared/types';
/** Shared selection only: callers validate live reachability and resource gains. */
export interface NearbyInteractionCandidate extends NearbyInteraction {
 position:[number,number,number];range:number;distance:number;
}
const priority:Record<NearbyInteractionKind,number>={revive:0,task:1,weapon:2,supply:3};
export function resolveNearbyInteraction<T extends NearbyInteractionCandidate>(candidates:readonly T[]):T|null {
 const eligible=candidates.filter(c=>Number.isFinite(c.distance)&&c.distance>=0);
 const actionable=eligible.filter(c=>c.available);
 return [...(actionable.length?actionable:eligible)].sort((a,b)=>priority[a.kind]-priority[b.kind]||a.distance-b.distance||a.id.localeCompare(b.id))[0]??null;
}
export function nearbyInteractionSummary(candidate:NearbyInteractionCandidate|null):NearbyInteraction|null {
 if(!candidate)return null;
 const {kind,id,action,taskId,siteId,weapon,available,reason}=candidate;
 return {kind,id,action,...(taskId?{taskId}:{}),...(siteId?{siteId}:{}),...(weapon?{weapon}:{}),available,...(reason?{reason}:{})};
}
export interface NearbyTask {
 id:string;kind:'take'|'activate'|'hold'|'deliver';status:'pending'|'active'|'complete';
 positions:[number,number,number][];visited:readonly string[];siteIds?:readonly string[];
 carrierId:string|null;drop:[number,number,number]|null;
}
export function collectTaskInteractionCandidates(tasks:readonly NearbyTask[],playerId:string,position:[number,number,number],extraction?:{available:boolean;started:boolean;position:[number,number,number]}):NearbyInteractionCandidate[] {
 const candidates:NearbyInteractionCandidate[]=[];
 const add=(task:NearbyTask|null,index:number,point:[number,number,number],action:NearbyInteractionAction,range=2.4)=>{
  const siteId=task?.siteIds?.[index]??String(index),taskId=task?.id;
  candidates.push({kind:'task',id:task?task.id+':'+siteId:'extraction',taskId,siteId:task?siteId:undefined,action,position:[...point],range,distance:Math.hypot(...point.map((n,i)=>n-position[i])),available:true});
 };
 for(const task of tasks){
  if(task.status==='complete')continue;
  if(task.kind==='deliver'){
   if(!task.carrierId)add(task,0,task.drop??task.positions[0],'carry');
   else if(task.carrierId===playerId)add(task,1,task.positions[1],'deliver');
  }else if(task.kind==='hold'){
   if(task.status==='pending')add(task,0,task.positions[0],'hold');
  }else task.positions.forEach((point,index)=>{
   const siteId=task.siteIds?.[index]??String(index);
   if(!task.visited.includes(siteId))add(task,index,point,task.kind==='activate'?'activate':'take');
  });
 }
 if(extraction?.available&&!extraction.started)add(null,0,extraction.position,'extract',4.5);
 return candidates;
}
