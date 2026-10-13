import {emptyInput,type InputCommand,type InputAction} from './protocol';

type Queued={command:InputCommand;target:number};
type PendingAction={id:number;type:InputAction;target:number;legacyKey?:string};
// An ordered transport may drain many obsolete inputs after the input quota has
// discarded them. A cancellation advances counters only; it executes no work.
const MAX_CANCEL_SEQUENCE_GAP=3600,MAX_CANCEL_ACTION_GAP=1024;
export interface ConsumedInput {command:InputCommand;appliedInputTick:number;actionAck:number;resync:boolean;queueDepth:number;}
/** Server-owned fixed-time input mailbox. Continuous controls are coalesced, actions are not. */
export class InputTimeline {
 private pending:Queued[]=[];
 private actions:PendingAction[]=[];
 private held=emptyInput();
 private acceptedSeq=0;
 private acknowledgement=0;
 private lastReceived=-Infinity;
 private completed=new Set<number>();
 private legacyDone=new Set<string>();
 private lastActionId=0;
 private needsResync=false;
 private actionAcknowledgement=0;
 constructor(readonly staleTicks=18,readonly maxFutureTicks=12){}
 reset(ack=0,actionAck=0,tick=0,yaw=0,pitch=0){this.pending=[];this.actions=[];this.held={...emptyInput(ack,tick),yaw,pitch};this.acceptedSeq=this.acknowledgement=ack;this.lastReceived=-Infinity;this.completed.clear();this.legacyDone.clear();this.lastActionId=this.actionAcknowledgement=actionAck;this.needsResync=false;}
 /** Atomically discard even future/unsent controls and acknowledge their cancelled actions. */
 cancel(seq:number,through:number,tick:number,yaw:number,pitch:number){
  if(!Number.isSafeInteger(seq)||seq<Math.max(this.acceptedSeq,this.acknowledgement)||seq>Math.max(this.acceptedSeq,this.acknowledgement)+MAX_CANCEL_SEQUENCE_GAP||
     !Number.isSafeInteger(through)||through<this.actionAcknowledgement||through>Math.max(this.lastActionId,this.actionAcknowledgement)+MAX_CANCEL_ACTION_GAP||
     !Number.isFinite(yaw)||Math.abs(yaw)>=1e6||!Number.isFinite(pitch)||Math.abs(pitch)>1.35)return false;
  this.reset(seq,through,tick);this.held.yaw=yaw;this.held.pitch=pitch;return true;
 }
 enqueue(command:InputCommand,currentTick:number){
  if(!Number.isSafeInteger(command.seq)||command.seq<=this.acknowledgement||this.pending.some(q=>q.command.seq===command.seq))return false;
  // Commands are received over one ordered transport; reject implausible sequence jumps.
  if(command.seq>Math.max(this.acceptedSeq,this.acknowledgement)+120){this.needsResync=true;return false;}
  if(command.resetInput){this.pending=[];for(const a of this.actions)if(!a.legacyKey)this.completed.add(a.id);this.actions=[];const through=command.cancelActionThrough;if(through!==undefined){if(Number.isSafeInteger(through)&&through>=this.actionAcknowledgement&&through<=Math.max(this.lastActionId,this.actionAcknowledgement)+64){this.actionAcknowledgement=through;this.lastActionId=Math.max(this.lastActionId,through);for(const id of this.completed)if(id<=through)this.completed.delete(id);}else this.needsResync=true;}while(this.completed.delete(this.actionAcknowledgement+1))this.actionAcknowledgement++;}
  let target=command.resetInput?currentTick+1:Number.isSafeInteger(command.targetTick)?command.targetTick!:currentTick+1;
  if(target>currentTick+this.maxFutureTicks){this.needsResync=true;return false;}
  if(target<currentTick-this.staleTicks){this.needsResync=true;target=currentTick;}
  const copy={...command,targetTick:target,actions:[...(command.actions??[])],actionIds:command.actionIds?.map(a=>({...a}))};
  this.acceptedSeq=Math.max(this.acceptedSeq,copy.seq);this.lastReceived=currentTick;
  this.pending.push({command:copy,target});this.pending.sort((a,b)=>a.target-b.target||a.command.seq-b.command.seq);
  const entries:Omit<PendingAction,'target'>[]=copy.actionIds?.length?copy.actionIds:(copy.actions??[]).map((type,index)=>({id:0,type,legacyKey:copy.seq+':'+index+':'+type}));
  for(const a of entries){
   if(a.legacyKey){if(!this.legacyDone.has(a.legacyKey)&&!this.actions.some(p=>p.legacyKey===a.legacyKey))this.actions.push({...a,target});continue;}
   if(!Number.isSafeInteger(a.id)||a.id<=this.actionAcknowledgement||a.id>this.lastActionId+64||this.actions.some(p=>p.id===a.id)||this.completed.has(a.id))continue;
   this.lastActionId=Math.max(this.lastActionId,a.id);this.actions.push({id:a.id,type:a.type,target});
  }
  // Only the newest controls at a given target tick matter. Every action has its own queue.
  const byTick=new Map<number,Queued>();for(const q of this.pending){const previous=byTick.get(q.target);if(!previous||q.command.seq>previous.command.seq)byTick.set(q.target,q);}this.pending=[...byTick.values()].sort((a,b)=>a.target-b.target);
  if(this.pending.length>this.maxFutureTicks+2){this.needsResync=true;this.pending=this.pending.slice(-this.maxFutureTicks-2);}
  return true;
 }
 consume(currentTick:number):ConsumedInput {
  const due=this.pending.filter(q=>q.target<=currentTick);this.pending=this.pending.filter(q=>q.target>currentTick);
  if(due.length){const latest=due.reduce((a,b)=>a.command.seq>b.command.seq?a:b);this.held={...latest.command,actions:[],actionIds:[]};this.acknowledgement=Math.max(this.acknowledgement,...due.map(q=>q.command.seq));this.pending=this.pending.filter(q=>q.command.seq>this.acknowledgement);}
  if(currentTick-this.lastReceived>this.staleTicks){this.held={...emptyInput(this.acknowledgement,currentTick),yaw:this.held.yaw,pitch:this.held.pitch};for(const a of this.actions)if(!a.legacyKey)this.completed.add(a.id);this.actions=[];while(this.completed.delete(this.actionAcknowledgement+1))this.actionAcknowledgement++;}
  const execute:PendingAction[]=[],types=new Set<InputAction>();this.actions.sort((a,b)=>a.target-b.target||a.id-b.id);
  for(const a of this.actions){if(a.target>currentTick||types.has(a.type))continue;types.add(a.type);execute.push(a);if(a.legacyKey)this.legacyDone.add(a.legacyKey);else this.completed.add(a.id);}
  const done=new Set(execute);this.actions=this.actions.filter(a=>!done.has(a));while(this.completed.delete(this.actionAcknowledgement+1))this.actionAcknowledgement++;
  if(this.legacyDone.size>256)this.legacyDone=new Set([...this.legacyDone].slice(-128));
  const resync=this.needsResync;this.needsResync=false;
  return{command:{...this.held,seq:this.acknowledgement,actions:execute.map(a=>a.type),actionIds:execute.filter(a=>!a.legacyKey).map(a=>({id:a.id,type:a.type}))},appliedInputTick:currentTick,actionAck:this.actionAcknowledgement,resync,queueDepth:this.pending.length};
 }
 get depth(){return this.pending.length;}
 get ack(){return this.acknowledgement;}
}
