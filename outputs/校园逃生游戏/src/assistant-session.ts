import {rankingClient} from './ranking/client';
import {SessionOperations} from './session-flow';
import type {AssistantFeedbackDraft,AssistantStatus as PublicAssistantStatus,AssistantChatReply} from '@qisheng/shared/assistant';

export type AssistantDraft=AssistantFeedbackDraft;
export type AssistantTurn={id:string;question:string;answer:string;feedbackDraft?:AssistantDraft;createdAt:number};
export type AssistantStatus=PublicAssistantStatus;
export type AssistantResult=AssistantChatReply;
const HISTORY_KEY='qisheng-assistant-history-v1',VISITOR_KEY='qisheng-assistant-visitor-v1';
const owner=()=>rankingClient.getPlayer()?.id??'guest';
let historyOwner=owner();
let activeCancel:(()=>void)|null=null;

// Subscribe outside the page lifecycle: an account switch must clear a closed page too.
rankingClient.subscribe(()=>{const next=owner();if(next===historyOwner)return;historyOwner=next;activeCancel?.();clearAssistantHistory();});
export function clearAssistantHistory(){try{localStorage.removeItem(HISTORY_KEY);}catch{}}
export function readAssistantHistory():AssistantTurn[]{
 try{const value=JSON.parse(localStorage.getItem(HISTORY_KEY)||'null');if(value?.owner!==owner()||!Array.isArray(value.turns)){clearAssistantHistory();return [];}
  return value.turns.filter((v:AssistantTurn)=>v&&typeof v.question==='string'&&typeof v.answer==='string'&&v.question.length<=1500&&v.answer.length<=12000).slice(-30);
 }catch{return [];}
}
export function saveAssistantHistory(turns:AssistantTurn[]){try{localStorage.setItem(HISTORY_KEY,JSON.stringify({owner:owner(),turns:turns.slice(-30)}));}catch{}}
export class AssistantSession{
 private operations=new SessionOperations<string>();
 private pending:{id:string;controller:AbortController;visitorToken?:string}|null=null;
 private async visitor(signal:AbortSignal){
  if(rankingClient.getPlayer()?.accountStatus==='active')return undefined;
  try{const old=JSON.parse(localStorage.getItem(VISITOR_KEY)||'null');if(typeof old?.visitorToken==='string'&&old.expiresAt>Date.now()+60000)return old.visitorToken as string;}catch{}
  const value=await rankingClient.request<{visitorToken:string;expiresAt:number}>('/assistant/visitor',{method:'POST',body:{},auth:false,signal});
  try{localStorage.setItem(VISITOR_KEY,JSON.stringify(value));}catch{}
  return value.visitorToken;
 }
 async ask(question:string,turns:AssistantTurn[],onReady?:(id:string)=>void){
  this.cancel();const operation=this.operations.begin('assistant')!,controller=new AbortController(),id=crypto.randomUUID();
  this.pending={id,controller};activeCancel=()=>this.cancel();onReady?.(id);
  try{const visitorToken=await this.visitor(controller.signal);if(!this.operations.current(operation,'assistant')||controller.signal.aborted)throw new DOMException('Cancelled','AbortError');this.pending!.visitorToken=visitorToken;
   const value=await rankingClient.request<AssistantResult>('/assistant/chat',{method:'POST',signal:controller.signal,timeout:65000,body:{requestId:id,question,history:turns.slice(-6).map(({question,answer})=>({question,answer})),...(visitorToken?{visitorToken}:{})}});
   if(!this.operations.current(operation,'assistant')||controller.signal.aborted||value.requestId!==id)throw new DOMException('Cancelled','AbortError');
   if(typeof value.answer!=='string'||!value.answer.trim())throw new Error('ASSISTANT_UNAVAILABLE');
   return value;
  }finally{if(this.operations.current(operation,'assistant')){this.operations.finish(operation,'assistant');this.pending=null;activeCancel=null;}}
 }
 cancel(){const pending=this.pending;this.pending=null;this.operations.cancel();if(!pending)return;pending.controller.abort();if(pending.visitorToken||rankingClient.getPlayer()?.accountStatus==='active')void rankingClient.request('/assistant/cancel',{method:'POST',body:{requestId:pending.id,...(pending.visitorToken?{visitorToken:pending.visitorToken}:{})},timeout:4000}).catch(()=>{});activeCancel=null;}
}
