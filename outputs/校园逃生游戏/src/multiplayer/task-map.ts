import type {EscapeSnapshot,EscapeTaskSnapshot} from '../escape/types';
const escapeTaskSites=(task:EscapeTaskSnapshot)=>{const pending=task.task.sites.filter(site=>!task.visited.includes(site.id));return task.kind==='deliver'&&task.carrying?task.task.sites.slice(-1):pending.length?pending:task.task.sites;};
import {escapeFloorAt} from '../escape-floor';
import type {MapManifest,Snapshot} from '../types';
import type {RoomSnapshot,TaskState} from './shared/protocol';

export function onlineMapTask(task:TaskState,_room:RoomSnapshot,selected?:string,floors:MapManifest['floors']=[]):EscapeTaskSnapshot {
 const positions=task.positions.map(p=>[...p] as [number,number,number]),levels=[...task.floors];
 if(task.kind==='deliver'&&task.drop){positions[0]=[...task.drop];levels[0]=escapeFloorAt(task.drop,floors);}
 const sites=positions.map((position,i)=>({id:task.id+':'+i,label:task.kind==='deliver'?(i===0?(task.drop?'掉落物资':'领取点'):'送达点'):task.label,region:'campus',position,floor:(levels[i]??0) as 0|1|2}));
 return {id:task.id,type:task.kind,kind:task.kind,name:task.label,state:task.status,status:task.status,positions,floors:levels,progress:task.progress,visited:task.visited.map(i=>task.id+':'+i),carrying:!!task.carrierId,blocked:task.blocked,blockReason:task.blocked,currentAction:task.label,selected:task.id===selected,task:{id:task.id,kind:task.kind,label:task.label,duration:task.duration,radius:task.radius,sites}};
}
export function onlineTaskMapSites(room:RoomSnapshot,floors:MapManifest['floors']=[]){return room.tasks.filter(t=>t.status!=='complete').flatMap(t=>escapeTaskSites(onlineMapTask(t,room,undefined,floors)).map(site=>({...site,taskId:t.id})));}
export function onlineMapSnapshot(room:RoomSnapshot,playerId:string|null,selected?:string,floors:MapManifest['floors']=[]):Snapshot {
 const p=room.players.find(p=>p.id===playerId),completed=room.tasks.filter(t=>t.status==='complete').length;
 const round:EscapeSnapshot={phase:room.extraction.available?'extraction':'active',difficulty:room.difficulty,elapsed:room.elapsed,remaining:room.remaining,graceLeft:0,completed,activeNPCs:room.npcs.length>4?6:4,time:room.remaining,missionComplete:completed,reinforcement:room.npcs.length>4,extractionPosition:room.mode==='coop'?room.extraction.position:null,extractionAvailable:room.extraction.available,extractionProgress:room.extraction.progress,extractionDuration:room.extraction.duration,extractionBlockReason:room.extraction.blocked,result:null,tasks:room.tasks.map(t=>onlineMapTask(t,room,selected,floors))};
 return {escape:{...round,playerPosition:p?.position,playerYaw:p?.yaw,playerFloor:p?escapeFloorAt(p.position,floors):0,supplies:room.supplies.map(s=>({id:s.id,name:'补给',position:s.position,floor:escapeFloorAt(s.position,floors),used:!!playerId&&s.usedBy.includes(playerId)}))}} as Snapshot;
}
