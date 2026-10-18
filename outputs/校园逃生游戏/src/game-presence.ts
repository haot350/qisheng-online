import {useEffect} from 'react';
import {rankingClient,RANKING_API} from './ranking/client';

const KEY='qisheng-active-session-v1';
type PresenceReply={sessionId:string;heartbeatSeconds:number;expiresInSeconds:number};
/** Foreground counts only. No page names, locations, device fingerprint or credentials in the payload. */
export class GamePresence {
 private sessionId='';private generation=0;private pending:AbortController|null=null;
 constructor(private request:typeof rankingClient.request,private storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>){try{this.sessionId=storage.getItem(KEY)||'';}catch{}}
 private save(){try{if(this.sessionId)this.storage.setItem(KEY,this.sessionId);else this.storage.removeItem(KEY);}catch{}}
 async active(){
  if(this.pending)return;
  const generation=this.generation,controller=new AbortController();this.pending=controller;
  try{const result=await this.request<PresenceReply>('/presence',{method:'POST',body:{...(this.sessionId?{sessionId:this.sessionId}:{}),client:'web',active:true},signal:controller.signal,timeout:8000});
   if(generation!==this.generation||controller.signal.aborted)return;
   if(typeof result.sessionId==='string'&&/^[A-Za-z0-9_-]{32,96}$/.test(result.sessionId)){this.sessionId=result.sessionId;this.save();}
  }catch(error){if(generation===this.generation&&['PRESENCE','HTTP_401','AUTH','UNAUTHORIZED'].includes((error as {code?:string}).code??'')){this.sessionId='';this.save();}}
  finally{if(this.pending===controller)this.pending=null;}
 }
 inactive(beacon?:(body:string)=>void){
  this.generation++;this.pending?.abort();this.pending=null;
  const sessionId=this.sessionId;this.sessionId='';this.save();if(!sessionId)return;
  const body={sessionId,client:'web',active:false};
  if(beacon){beacon(JSON.stringify(body));return;}
  void this.request('/presence',{method:'POST',body,auth:false,timeout:2500}).catch(()=>{});
 }
}
export function useGamePresence(){
 useEffect(()=>{
  // A newly opened/duplicated tab may inherit sessionStorage from its opener.
  // Only a reload can legitimately reuse this document's previous token.
  try{const navigation=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;if(navigation?.type!=='reload')sessionStorage.removeItem(KEY);}catch{}
  let storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>={getItem:()=>null,setItem(){},removeItem(){}};
  try{storage=sessionStorage;}catch{}
  const presence=new GamePresence(rankingClient.request.bind(rankingClient),storage);
  let identity=rankingClient.getPlayer()?.id??'guest',timer:ReturnType<typeof setInterval>|null=null;
  const stop=()=>{if(timer)clearInterval(timer);timer=null;};
  const sync=()=>{stop();if(document.visibilityState==='hidden'){presence.inactive();return;}void presence.active();timer=setInterval(()=>void presence.active(),30000);};
  const off=rankingClient.subscribe(()=>{const next=rankingClient.getPlayer()?.id??'guest';if(next===identity)return;identity=next;presence.inactive();sync();});
  const pagehide=()=>{stop();presence.inactive(body=>{try{navigator.sendBeacon(RANKING_API+'/v1/presence',new Blob([body],{type:'application/json'}));}catch{}});};
  document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',sync);sync();
  return()=>{stop();off();document.removeEventListener('visibilitychange',sync);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',sync);presence.inactive();};
 },[]);
}
