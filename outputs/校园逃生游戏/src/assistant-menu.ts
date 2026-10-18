import {validateAssistantActions,assistantActionNeedsConfirmation,type AssistantActionPlan,type AssistantMenuAction,type AssistantMenuContext} from '@qisheng/shared/assistant';

export interface AssistantMenuProgress {index:number;total:number;phase:'running'|'done'|'failed';message?:string;}
export interface AssistantMenuRuntime { context:()=>AssistantMenuContext|undefined; identity:()=>string; execute:(action:AssistantMenuAction,signal:AbortSignal)=>Promise<string>;onProgress?:(progress:AssistantMenuProgress)=>void; }
/** One approved plan, one execution. Confirmation is provided by the player UI, never by the model. */
export class AssistantMenuExecution {
 private controller:AbortController|null=null;
 private done=new Set<string>();
 private running=new Set<string>();
 private retries=new Map<string,{next:number;results:string[];identity:string;token:string}>();
 cancel(){this.controller?.abort();this.controller=null;}
 async run(plan:AssistantActionPlan,runtime:AssistantMenuRuntime,confirmed=false):Promise<string[]> {
  if(this.running.has(plan.id))throw Error('这项操作正在进行。');
  if(this.done.has(plan.id))throw Error('这项操作已经处理，请重新提出需求。');
  const actions=validateAssistantActions(plan.actions);
  if(!actions.length||actions.length>4)throw Error('暂时无法完成这项操作。');
  if(actions.some(assistantActionNeedsConfirmation)&&!confirmed)throw Error('请先确认房间操作。');
  const initial=runtime.context(),identity=runtime.identity();
  const check=()=>{const current=runtime.context();if(controller.signal.aborted||runtime.identity()!==identity||!current||current.inBattle||current.token!==plan.contextToken)throw Error('页面或账号已变化，请重新提出需求。');};
  if(!initial||initial.inBattle||initial.token!==plan.contextToken)throw Error('页面已变化，请重新提出需求。');
  this.cancel();const controller=new AbortController();this.controller=controller;this.running.add(plan.id);
  const previous=this.retries.get(plan.id);
  const resume=previous&&previous.identity===identity&&previous.token===plan.contextToken?previous:undefined;
  const results:string[]=resume?[...resume.results]:[];let current=-1;
  try{check();for(let index=0;index<results.length;index++)runtime.onProgress?.({index,total:actions.length,phase:'done',message:results[index]});for(let index=resume?.next??0;index<actions.length;index++){current=index;check();runtime.onProgress?.({index,total:actions.length,phase:'running'});const result=await runtime.execute(actions[index],controller.signal);if(controller.signal.aborted||runtime.identity()!==identity)throw Error('操作已取消。');results.push(result);runtime.onProgress?.({index,total:actions.length,phase:'done',message:result});}this.retries.delete(plan.id);this.done.add(plan.id);return results;}
  catch(error){const message=error instanceof Error?error.message:'暂时未能完成，请手动重试。';if(current>=0)runtime.onProgress?.({index:current,total:actions.length,phase:'failed',message});if(!controller.signal.aborted&&runtime.identity()===identity&&runtime.context()?.token===plan.contextToken&&current>=0){this.retries.set(plan.id,{next:current,results:[...results],identity,token:plan.contextToken});while(this.retries.size>30)this.retries.delete(this.retries.keys().next().value!);}else{this.retries.delete(plan.id);this.done.add(plan.id);}throw Error(results.length?'已完成：'+results.join('；')+'。后续未执行：'+message:message);}
  finally{this.running.delete(plan.id);while(this.done.size>100)this.done.delete(this.done.values().next().value!);if(this.controller===controller)this.controller=null;}
 }
}
