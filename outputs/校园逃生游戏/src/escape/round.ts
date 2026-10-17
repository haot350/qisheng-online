import type {RankingEvent} from '../ranking/shared.ts';
import {escapeScore} from '../ranking/shared.ts';
import {taskInteractionSites} from './interaction.ts';
import {ESCAPE_DIFFICULTIES,ESCAPE_RULES} from './config.ts';
import type {EscapeDifficulty,EscapeEvent,EscapePlan,EscapeResult,EscapeRoundFrame,EscapeSnapshot,EscapeTask,EscapeTaskState,EscapeVec3} from './types.ts';
const distance=(a:EscapeVec3,b:EscapeVec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const copyState=(state:EscapeTaskState)=>({...state,visited:[...state.visited]});
export class EscapeRound {
 plan:EscapePlan|null=null;difficulty:EscapeDifficulty;phase:'active'|'extraction'|'won'|'failed'='active';elapsed=0;extractionProgress=0;activeNPCs:6|9=6;selectedTaskId:string|null=null;result:EscapeResult|null=null;
 private tasks:EscapeTaskState[]=[];private damage=0;private headshots=0;private totalDowns=0;private downs=new Set<string|number>();private pending:EscapeEvent[]=[];private extractionBlocked:'outside'|'contested'|null=null;private progressMarks=new Map<string,string>();private record:(type:RankingEvent['type'],data:Record<string,unknown>,time:number)=>void=()=>{};
 constructor(options:{difficulty:EscapeDifficulty;seed?:number;plan?:EscapePlan;onRecord?:(type:RankingEvent['type'],data:Record<string,unknown>,time:number)=>void}){this.record=options.onRecord??(()=>{});this.difficulty=options.difficulty;if(options.plan)this.setPlan(options.plan);}
 setPlan(plan:EscapePlan){this.plan=plan;this.difficulty=plan.difficulty;this.phase='active';this.elapsed=0;this.extractionProgress=0;this.activeNPCs=6;this.result=null;this.damage=0;this.headshots=0;this.totalDowns=0;this.downs.clear();this.pending=[];this.progressMarks.clear();this.extractionBlocked=null;this.tasks=plan.tasks.map(task=>({task,status:'pending',progress:0,visited:[],carrying:false,blocked:null}));this.selectedTaskId=this.tasks[0]?.task.id??null;}
 selectTask(id:string){if(this.tasks.some(t=>t.task.id===id))this.selectedTaskId=id;}
 recordDamage(amount:number){if(Number.isFinite(amount)&&amount>0&&this.phase!=='won'&&this.phase!=='failed')this.damage+=amount;}
 recordDown(identity:string|number,headshot=false){if(this.phase==='won'||this.phase==='failed')return;this.downs.add(identity);this.totalDowns++;if(headshot)this.headshots++;}
 get remaining(){return Math.max(0,ESCAPE_DIFFICULTIES[this.difficulty].round-this.elapsed);}
 get completed(){return this.tasks.filter(t=>t.status==='complete').length;}
 get extractionAvailable(){return this.tasks.length===3&&this.completed===3;}
 private complete(state:EscapeTaskState){if(state.status==='complete')return;this.record('task-complete',{taskId:state.task.id,kind:state.task.kind},this.elapsed);state.status='complete';state.progress=state.task.duration||1;state.blocked=null;state.carrying=false;this.pending.push({type:'task-completed',taskId:state.task.id,kind:state.task.kind},{type:'ammo-reward',taskId:state.task.id,magazines:1,shotgunShells:3});if(this.completed===2&&this.activeNPCs===6){this.activeNPCs=9;this.pending.push({type:'reinforcements',count:3});}if(this.extractionAvailable)this.pending.push({type:'extraction-available'});if(this.selectedTaskId===state.task.id)this.selectedTaskId=this.tasks.find(t=>t.status!=='complete')?.task.id??state.task.id;}
 private buildResult(won:boolean):EscapeResult {
  const cfg=ESCAPE_DIFFICULTIES[this.difficulty],{score,grade,breakdown}=escapeScore({won,difficulty:this.difficulty,elapsed:this.elapsed,completed:this.completed,damage:this.damage,uniqueDowns:this.downs.size,headshots:this.headshots});
  let advice='先选最近的任务，完成后再前往下一处。';if(won){if(this.damage>=100)advice='下次交火后先利用掩体恢复，再继续推进。';else if(this.remaining<cfg.round*.2)advice='下次把相邻任务连着完成，可以留出更多撤离时间。';else if(this.downs.size<4)advice='试着处理挡路的追逐者，再完成任务。';else advice='路线和交火都很顺，试试更高难度。';}else if(this.damage>=150)advice='交火时换个掩体，脱战后再推进。';else if(this.completed===3)advice='任务完成后尽早回到校门，为撤离留出时间。';
  return {won,score,rating:grade,grade,remaining:this.remaining,stats:{damage:this.damage,headshots:this.headshots,downs:this.totalDowns,uniqueDowns:this.downs.size,completed:this.completed,elapsed:this.elapsed},advice,breakdown};
 }
 fail(reason:'time'|'health'){if(this.phase==='won'||this.phase==='failed')return;this.phase='failed';this.result=this.buildResult(false);this.pending.push({type:'failed',reason,result:this.result});}
 update(dt:number,frame:EscapeRoundFrame):EscapeEvent[]{
  if(!this.plan)return [];if(!Number.isFinite(dt)||dt<0)throw new RangeError('突围时间步长必须是有限非负数。');
  if(frame.paused||frame.blocked)return [];if(this.phase==='won'||this.phase==='failed')return this.drainEvents();
  this.elapsed=Math.min(ESCAPE_DIFFICULTIES[this.difficulty].round,this.elapsed+dt);
  if(this.remaining<=0){this.fail('time');return this.drainEvents();}
  const contested=(task:EscapeTask)=>typeof frame.contested==='function'?frame.contested(task):!!frame.contested;
  for(const state of this.tasks){if(state.status!=='active'||state.task.kind!=='hold')continue;const inside=distance(frame.position,state.task.sites[0].position)<=state.task.radius;state.blocked=!inside?'outside':contested(state.task)?'contested':null;if(!state.blocked)state.progress=Math.min(state.task.duration,state.progress+dt);const mark=Math.floor(state.progress)+'/'+(state.blocked??'');if(this.progressMarks.get(state.task.id)!==mark||state.progress>=state.task.duration-1e-8){this.progressMarks.set(state.task.id,mark);this.record('task-progress',{taskId:state.task.id,progress:state.progress,blocked:state.blocked},this.elapsed);}if(state.progress>=state.task.duration-1e-8)this.complete(state);}
  if(frame.interactPressed){
   const candidates=this.tasks.filter(t=>t.status!=='complete').flatMap(state=>taskInteractionSites(state.task,state.status,state.visited,state.carrying).map(site=>({state,site,distance:distance(frame.position,site.position)}))).filter(item=>item.distance<=ESCAPE_RULES.interactionRadius&&(frame.canInteract?.(item.site)??true)).sort((a,b)=>a.distance-b.distance||a.state.task.id.localeCompare(b.state.task.id));
   const nearest=candidates[0];if(nearest){const {state,site}=nearest,kind=state.task.kind;
    if(kind!=='activate'||!state.visited.includes(site.id))this.record('task-interact',{taskId:state.task.id,siteId:site.id},this.elapsed);
    if(kind==='take')this.complete(state);
    else if(kind==='activate'){if(!state.visited.includes(site.id)){const first=state.visited.length===0;state.status='active';state.visited.push(site.id);state.progress=state.visited.length/2;if(first)this.record('task-start',{taskId:state.task.id},this.elapsed);if(first)this.pending.push({type:'task-started',taskId:state.task.id,kind},{type:'investigation',position:[...site.position],taskId:state.task.id});if(state.visited.length===2)this.complete(state);}}
    else if(kind==='hold'){if(state.status==='pending'){state.status='active';state.blocked=contested(state.task)?'contested':null;this.record('task-start',{taskId:state.task.id},this.elapsed);this.pending.push({type:'task-started',taskId:state.task.id,kind});}}
    else if(kind==='deliver'){if(!state.carrying&&site.id===state.task.sites[0].id){state.status='active';state.carrying=true;state.progress=.5;this.record('task-start',{taskId:state.task.id},this.elapsed);this.pending.push({type:'task-started',taskId:state.task.id,kind});}else if(state.carrying&&site.id===state.task.sites[1].id)this.complete(state);}
   }else if(this.extractionAvailable&&distance(frame.position,this.plan.extraction.position)<=ESCAPE_RULES.extractRadius&&(frame.canInteract?.(this.plan.extraction)??true)&&this.phase==='active'){this.phase='extraction';this.extractionProgress=0;this.record('extract-start',{},this.elapsed);this.pending.push({type:'extraction-started'});}
  }
  if(this.phase==='extraction'){
   const reason=distance(frame.position,this.plan.extraction.position)>ESCAPE_RULES.extractRadius?'outside':frame.extractionClear===false?'contested':null;
   if(reason){if(this.extractionProgress>0||this.extractionBlocked!==reason)this.pending.push({type:'extraction-interrupted',reason});this.extractionProgress=0;}else this.extractionProgress+=dt;this.extractionBlocked=reason;const mark=Math.floor(this.extractionProgress)+'/'+(reason??'');if(this.progressMarks.get('extraction')!==mark||this.extractionProgress>=ESCAPE_DIFFICULTIES[this.difficulty].extract-1e-8){this.progressMarks.set('extraction',mark);this.record('extract-progress',{progress:this.extractionProgress,blocked:reason},this.elapsed);}
   if(this.extractionProgress>=ESCAPE_DIFFICULTIES[this.difficulty].extract-1e-8){this.phase='won';this.result=this.buildResult(true);this.pending.push({type:'won',result:this.result});}
  }
  return this.drainEvents();
 }
 drainEvents(){const events=this.pending;this.pending=[];return events;}
 snapshot():EscapeSnapshot {const tasks=this.tasks.map(copyState).map(state=>{const task=state.task,kind=task.kind,currentAction=state.status==='complete'?'任务完成':kind==='take'?'靠近物资，取走物资':kind==='activate'?`启动设备（${state.visited.length}/2）`:kind==='hold'?(state.status==='pending'?'靠近信标，开始守点':state.blocked==='outside'?'回到信标范围':state.blocked==='contested'?'清除圈内追逐者':'守住信标'):state.carrying?'前往终点，送达物资':'靠近起点，领取物资';return {...state,id:task.id,type:kind,kind,name:task.label,state:state.status,positions:task.sites.map(s=>[...s.position] as EscapeVec3),floors:task.sites.map(s=>s.floor??0),selected:task.id===this.selectedTaskId,blockReason:state.blocked,currentAction};});return {phase:this.phase,difficulty:this.difficulty,elapsed:this.elapsed,remaining:this.remaining,time:this.remaining,graceLeft:Math.max(0,ESCAPE_RULES.grace-this.elapsed),completed:this.completed,missionComplete:this.completed,activeNPCs:this.activeNPCs,reinforcement:this.activeNPCs===9,tasks,extractionAvailable:this.extractionAvailable,extractionProgress:this.extractionProgress,extractionBlockReason:this.extractionBlocked,extractionDuration:ESCAPE_DIFFICULTIES[this.difficulty].extract,extractionPosition:this.plan?[...this.plan.extraction.position]:null,result:this.result};}
}