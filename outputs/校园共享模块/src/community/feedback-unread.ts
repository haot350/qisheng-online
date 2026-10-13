'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RankingClient} from './client';

export const feedbackReceiptKey='qisheng-feedback-receipts-v1';
const readKey='qisheng-feedback-read-v1',changeEvent='qisheng-feedback-change';
export type FeedbackReceipt={id:string;receiptCode:string;title?:string};
type CheckItem={id:string;latestReplyId:number;latestReplyAt:number|null;replyCount:number};
const sessionRead:Record<string,number>={};
export function readFeedbackReceipts():FeedbackReceipt[]{try{const value=JSON.parse(localStorage.getItem(feedbackReceiptKey)||'[]');return Array.isArray(value)?value.filter(v=>v&&typeof v.id==='string'&&typeof v.receiptCode==='string').slice(0,20):[];}catch{return [];}}
function readMarkers():Record<string,number>{try{const value=JSON.parse(localStorage.getItem(readKey)||'{}'),markers:Record<string,number>=value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{};for(const [id,read] of Object.entries(sessionRead))markers[id]=Math.max(Number(markers[id])||0,read);return markers;}catch{return {...sessionRead};}}
export function feedbackHasUnread(items:CheckItem[]){const markers=readMarkers();return items.some(item=>item.latestReplyId>Number(markers[item.id]??0));}
export function feedbackCredentialsChanged(){window.dispatchEvent(new CustomEvent(changeEvent,{detail:{credentials:true}}));}
export function markFeedbackRead(id:string,latestReplyId:number){if(!latestReplyId)return;const markers=readMarkers(),latest=Math.max(Number(markers[id])||0,latestReplyId);sessionRead[id]=latest;try{localStorage.setItem(readKey,JSON.stringify({...markers,[id]:latest}));}catch{}window.dispatchEvent(new CustomEvent(changeEvent));}

/** Activate only in the menu or feedback page. One batch on entry; no polling. */
export function useFeedbackUnread(active:boolean,rankingClient:RankingClient){
 const [unread,setUnread]=useState(false),enabled=useRef(active),serial=useRef(0),request=useRef<AbortController|null>(null),items=useRef<CheckItem[]>([]),identity=useRef(rankingClient.getPlayer()?.id??null);enabled.current=active;
 const refresh=useCallback(async()=>{if(!enabled.current)return;const token=++serial.current;request.current?.abort();const controller=new AbortController();request.current=controller;try{await rankingClient.me().catch(()=>null);if(controller.signal.aborted||token!==serial.current||!enabled.current)return;const result=await rankingClient.request<{items:CheckItem[]}>('/feedback/check',{method:'POST',body:{receipts:readFeedbackReceipts().map(({id,receiptCode})=>({id,receiptCode}))},signal:controller.signal});if(!controller.signal.aborted&&token===serial.current&&enabled.current){items.current=result.items;setUnread(feedbackHasUnread(result.items));}}catch{/* Keep the last known indicator during a temporary outage. */}finally{if(request.current===controller)request.current=null;}},[rankingClient]);
 useEffect(()=>{if(active)void refresh();else{++serial.current;request.current?.abort();}return()=>{++serial.current;request.current?.abort();};},[active,refresh]);
 useEffect(()=>{const update=(event:Event)=>{setUnread(feedbackHasUnread(items.current));if((event as CustomEvent).detail?.credentials&&enabled.current)void refresh();};const storage=(event:StorageEvent)=>{if(event.key===readKey)update(event);if(event.key===feedbackReceiptKey&&enabled.current)void refresh();};const unsubscribe=rankingClient.subscribe(()=>{const next=rankingClient.getPlayer()?.id??null;if(next===identity.current)return;identity.current=next;++serial.current;request.current?.abort();items.current=[];setUnread(false);if(enabled.current)void refresh();});window.addEventListener(changeEvent,update);window.addEventListener('storage',storage);return()=>{unsubscribe();window.removeEventListener(changeEvent,update);window.removeEventListener('storage',storage);};},[refresh]);
 return {unread,refresh};
}
