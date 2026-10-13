import type {WeaponId} from '../types';
import {canCollectSameWeapon} from '../weapon-pickups';
import {resolveNearbyInteraction,type NearbyInteractionCandidate,type NearbyInteractionAction} from '../nearby-interaction';
import {taskInteractionSites} from './interaction';
import type {EscapeTaskSnapshot,EscapeVec3} from './types';
type Gun={id:WeaponId;ammo?:number;ready?:boolean;reserve:number;maxReserve:number};
export interface EscapeNearbyContext{position:EscapeVec3;tasks:readonly EscapeTaskSnapshot[];extraction?:{available:boolean;started:boolean;position:EscapeVec3};drops:readonly {id:string;weapon:WeaponId;position:EscapeVec3;ammo:number;reserve:number}[];supplies:readonly {id:string;position:EscapeVec3;used:boolean}[];guns:readonly Gun[];health:number;smokes:number;canReach:(point:EscapeVec3,range:number)=>boolean;taskRange:number;extractionRange:number;}
export function nearbyEscapeInteraction(context:EscapeNearbyContext){const values:NearbyInteractionCandidate[]=[],distance=(point:EscapeVec3)=>Math.hypot(...point.map((n,i)=>n-context.position[i]));const add=(candidate:Omit<NearbyInteractionCandidate,'distance'>)=>{if(context.canReach(candidate.position,candidate.range))values.push({...candidate,distance:distance(candidate.position)});};
 for(const task of context.tasks)for(const site of taskInteractionSites(task.task,task.state,task.visited,task.carrying)){const action:NearbyInteractionAction=task.kind==='deliver'?(task.carrying?'deliver':'carry'):task.kind;add({kind:'task',id:task.id+':'+site.id,taskId:task.id,siteId:site.id,action,position:[...site.position],range:context.taskRange,available:true});}
 if(context.extraction?.available&&!context.extraction.started)add({kind:'task',id:'extraction',action:'extract',position:[...context.extraction.position],range:context.extractionRange,available:true});
 for(const drop of context.drops){const same=context.guns.find(gun=>gun.id===drop.weapon),available=!same||canCollectSameWeapon({id:same.id,ammo:same.ammo??Infinity,reserve:same.reserve,action:{ready:same.ready??false}},drop);add({kind:'weapon',id:drop.id,weapon:drop.weapon,action:same?'ammo':'replace',position:[...drop.position],range:2,available,...(!available?{reason:'full' as const}:{})});}
 const needsSupply=context.health<100||context.smokes<2||context.guns.some(gun=>gun.reserve<gun.maxReserve);for(const supply of context.supplies)if(!supply.used)add({kind:'supply',id:supply.id,action:'supply',position:[...supply.position],range:2.7,available:needsSupply,...(!needsSupply?{reason:'full' as const}:{})});
 return resolveNearbyInteraction(values);
}
