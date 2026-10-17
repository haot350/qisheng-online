import {validateAssistantActions,assistantActionNeedsConfirmation,type AssistantActionPlan,type AssistantMenuAction,type AssistantMenuContext} from '@qisheng/shared/assistant';

export interface AssistantMenuRuntime { context:()=>AssistantMenuContext|undefined; identity:()=>string; execute:(action:AssistantMenuAction,signal:AbortSignal)=>Promise<string>; }
/** One approved plan, one execution. Confirmation is provided by the player UI, never by the model. */
export class AssistantMenuExecution {
 private controller:AbortController|null=null;
 private done=new Set<string>();
 private running=new Set<string>();
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
  const results:string[]=[];
  try{check();for(const action of actions){check();const result=await runtime.execute(action,controller.signal);if(controller.signal.aborted||runtime.identity()!==identity)throw Error('操作已取消。');results.push(result);}return results;}
  catch(error){const message=error instanceof Error?error.message:'暂时未能完成，请手动重试。';throw Error(results.length?'已完成：'+results.join('；')+'。后续未执行：'+message:message);}
  finally{this.running.delete(plan.id);this.done.add(plan.id);while(this.done.size>100)this.done.delete(this.done.values().next().value!);if(this.controller===controller)this.controller=null;}
 }
}
