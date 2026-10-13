'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {sendSiteTelemetry,sitePage,sitePlatform,telemetryPayload,type SiteFault} from './telemetry-core';
let previousPage:string|null=null,sessionStarted=false;
const reported=new Set<string>();
const platform=()=>sitePlatform(navigator.userAgent,navigator.maxTouchPoints);
export function reportSiteFault(code:SiteFault){
 const page=sitePage(window.location.pathname);if(!page)return;
 const key=page+':'+code;if(reported.has(key))return;reported.add(key);
 void sendSiteTelemetry(telemetryPayload('error',page,platform(),code));
}
export default function SiteTelemetry(){
 const pathname=usePathname();
 useEffect(()=>{
  const page=sitePage(pathname);if(!page)return;
  if(!sessionStarted){sessionStarted=true;let first=true;
   try{first=sessionStorage.getItem('qisheng-site-visit-v1')!=='started';if(first)sessionStorage.setItem('qisheng-site-visit-v1','started')}catch{}
   if(first){const bytes=crypto.getRandomValues(new Uint8Array(16));const id=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');void sendSiteTelemetry(telemetryPayload('session-start',page,platform(),undefined,id))}
  }
  if(previousPage!==pathname){previousPage=pathname;void sendSiteTelemetry(telemetryPayload('page-view',page,platform()))}
 },[pathname]);
 useEffect(()=>{
  const onError=(event:Event)=>{if(event.target!==window){const node=event.target as HTMLElement;const kind=node?.tagName;if(kind==='SCRIPT')reportSiteFault('script-load');else if(kind==='LINK')reportSiteFault('style-load');else if(kind==='IMG')reportSiteFault('image-load');return}reportSiteFault('runtime')};
  const onRejection=()=>reportSiteFault('unhandled');
  window.addEventListener('error',onError,true);window.addEventListener('unhandledrejection',onRejection);
  return()=>{window.removeEventListener('error',onError,true);window.removeEventListener('unhandledrejection',onRejection)};
 },[]);
 return null;
}
