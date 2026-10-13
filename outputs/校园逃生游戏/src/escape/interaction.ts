import type {EscapeTask,EscapeTaskStatus} from './types.ts';
/** Only endpoints whose next action can commit are allowed to consume interaction. */
export function taskInteractionSites(task:EscapeTask,status:EscapeTaskStatus,visited:readonly string[],carrying:boolean){
 if(status==='complete')return [];
 if(task.kind==='activate')return task.sites.filter(site=>!visited.includes(site.id));
 if(task.kind==='deliver')return task.sites.slice(carrying?1:0,carrying?2:1);
 if(task.kind==='hold'&&status!=='pending')return [];
 return task.sites;
}
