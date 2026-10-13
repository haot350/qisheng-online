import { ESCAPE_DIFFICULTIES,escapeFallbackTasks } from '../../escape/config';
import { generateEscapePlan } from '../../escape/plan';
import type { EscapePlan } from '../../escape/types';
import { VALIDATED_ESCAPE_EDGES,VALIDATED_ESCAPE_EXTRACTION,VALIDATED_ESCAPE_SITES,VALIDATED_ESCAPE_SPAWN } from '../../escape/validated';
import { collectTaskInteractionCandidates,resolveNearbyInteraction,type NearbyInteractionCandidate } from '../../nearby-interaction';
import { distance,eyeAt } from './combat';
import type { Difficulty,TaskState,Vec3 } from './protocol';
import type { SimWorld } from './sim-world';
export class TeamTasks {readonly plan:EscapePlan;readonly tasks:TaskState[];extractionProgress=0;extractionStarted=false;extractionBlocked:'outside'|'contested'|null=null;constructor(readonly world:SimWorld,readonly difficulty:Difficulty,seed:number){const edges=new Map(VALIDATED_ESCAPE_EDGES.map(e=>[e[0]+'>'+e[1],e[2]]));this.plan=generateEscapePlan({seed,difficulty,sites:VALIDATED_ESCAPE_SITES,spawn:VALIDATED_ESCAPE_SPAWN,extraction:VALIDATED_ESCAPE_EXTRACTION,validateSite:s=>!!world.supportAt(s.position,1.75)?.clear,validateRoute:(from,to)=>{const a=VALIDATED_ESCAPE_SITES.find(s=>distance(s.position,from)<.01)?.id??'gate-extraction',b=VALIDATED_ESCAPE_SITES.find(s=>distance(s.position,to)<.01)?.id??'gate-extraction',known=edges.get(a+'>'+b);if(known!==undefined)return{complete:true,length:known};const points=world.path(from,to);return{complete:points.length>=2&&distance(points.at(-1)!,to)<1.5,length:points.slice(1).reduce((n,p,i)=>n+distance(points[i],p),0)};},fallbackTasks:escapeFallbackTasks(difficulty).map(t=>({...t,sites:t.sites.map(s=>VALIDATED_ESCAPE_SITES.find(v=>v.id===s.id)??s)}))});this.tasks=this.plan.tasks.map(t=>({id:t.id,kind:t.kind,label:t.label,positions:t.sites.map(s=>[...s.position]),floors:t.sites.map(s=>s.floor??0),status:'pending',progress:0,duration:t.duration,radius:t.radius,visited:[],carrierId:null,drop:null,blocked:null}));}
 get completed(){return this.tasks.filter(t=>t.status==='complete').length;}get extractionAvailable(){return this.completed===3;}get extractionPosition(){return this.plan.extraction.position;}get extractionDuration(){return ESCAPE_DIFFICULTIES[this.difficulty].extract;}
 reachable(position:Vec3,target:Vec3,radius=2.4){return Math.abs(position[1]-target[1])<1.2&&distance(position,target)<=radius&&this.world.visible(eyeAt(position),[target[0],target[1]+.7,target[2]]);}
 drop(playerId:string,position:Vec3){const t=this.tasks.find(t=>t.carrierId===playerId);if(!t)return null;const safe=this.world.supportAt(position,1.75);const p=safe?.clear?[position[0],safe.height,position[2]] as Vec3:this.world.nearest(position);t.carrierId=null;t.drop=p;return t;}
 candidates(playerId:string,position:Vec3,canReach=(point:Vec3,radius:number)=>this.reachable(position,point,radius)){
  return collectTaskInteractionCandidates(this.tasks,playerId,position,{available:this.extractionAvailable,started:this.extractionStarted,position:this.extractionPosition}).filter(c=>canReach(c.position,c.range));
 }
 commit(playerId:string,position:Vec3,selected:NearbyInteractionCandidate,canReach=(point:Vec3,radius:number)=>this.reachable(position,point,radius)){
  const candidate=this.candidates(playerId,position,canReach).find(c=>c.id===selected.id&&c.action===selected.action);
  if(!candidate)return null;
  if(candidate.action==='extract'){this.extractionStarted=true;return{type:'extract',task:null,position:candidate.position};}
  const task=this.tasks.find(t=>t.id===candidate.taskId);if(!task)return null;
  if(candidate.action==='carry'){task.status='active';task.carrierId=playerId;task.drop=null;task.progress=.5;return{type:'carry',task,position:candidate.position};}
  if(candidate.action==='deliver'||candidate.action==='take')return this.complete(task,candidate.position);
  if(candidate.action==='hold'){task.status='active';return{type:'start',task,position:candidate.position};}
  if(candidate.action==='activate'){task.status='active';task.visited.push(candidate.siteId!);task.progress=task.visited.length/task.positions.length;if(task.visited.length===task.positions.length)return this.complete(task,candidate.position);return{type:'start',task,position:candidate.position};}
  return null;
 }
 interact(playerId:string,position:Vec3){const candidate=resolveNearbyInteraction(this.candidates(playerId,position));return candidate?this.commit(playerId,position,candidate):null;}
 private complete(t:TaskState,position:Vec3=t.positions[0]){t.status='complete';t.progress=t.duration||1;t.carrierId=null;t.drop=null;t.blocked=null;return{type:'complete',task:t,position:[...position] as Vec3};}
 update(dt:number,alive:{id:string;position:Vec3}[],enemies:{position:Vec3}[]){const events:{type:string;task:TaskState|null}[]=[];const contested=(point:Vec3,radius:number)=>enemies.some(n=>Math.abs(n.position[1]-point[1])<1.2&&distance(n.position,point)<=radius&&this.world.visible(eyeAt(n.position),eyeAt(point)));for(const t of this.tasks){if(t.kind!=='hold'||t.status!=='active')continue;const inside=alive.some(p=>this.reachable(p.position,t.positions[0],t.radius));t.blocked=!inside?'outside':contested(t.positions[0],t.radius)?'contested':null;if(!t.blocked)t.progress=Math.min(t.duration,t.progress+dt);if(t.progress>=t.duration-1e-8)events.push(this.complete(t));}if(this.extractionStarted){const inside=alive.length>0&&alive.every(p=>this.reachable(p.position,this.extractionPosition,4.5));this.extractionBlocked=!inside?'outside':contested(this.extractionPosition,6)?'contested':null;if(this.extractionBlocked)this.extractionProgress=0;else this.extractionProgress+=dt;if(this.extractionProgress>=this.extractionDuration)events.push({type:'won',task:null});}return events;}
}
