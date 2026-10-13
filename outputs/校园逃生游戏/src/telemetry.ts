import {RANKING_API} from './ranking/client.ts';
import {RELEASE_LABEL} from './release.ts';
export type TelemetryPage='menu'|'playing'|'album'|'settings'|'rankings'|'help'|'feedback';
export type TelemetryMode='escape'|'dafei'|'story'|'roam'|'coop'|'pvp';
export function telemetryPlatform(agent:string):'desktop'|'ios'|'android'|'other'{return /iPad|iPhone|iPod/i.test(agent)?'ios':/Android/i.test(agent)?'android':/Windows|Macintosh|Linux/i.test(agent)?'desktop':'other';}
export class AnonymousTelemetry{
 private page='';private match='';private initialized=false;
 constructor(private base:string,private version:string,private platform:string,private transport:typeof fetch,private sessionId:()=>string){}
 private send(type:string,fields:Record<string,string>){void this.transport(this.base+'/v1/telemetry',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,page:this.page||'menu',platform:this.platform,version:this.version,...fields}),signal:AbortSignal.timeout(5000)}).catch(()=>{});}
 begin(){if(this.initialized)return;this.initialized=true;this.send('session-start',{sessionId:this.sessionId()});}
 visit(page:TelemetryPage){if(this.page===page)return;this.page=page;this.send('page-view',{});}
 start(mode:TelemetryMode,key:string){if(this.match===key)return;this.match=key;this.send('mode-start',{mode});}
 end(){this.match='';}
 fault(code:'CAMPUS_LOAD'|'NETWORK_ROOM'|'JAVASCRIPT_RUNTIME'|'ASYNC_RUNTIME'){this.send('error',{code});}
}
let runtime:AnonymousTelemetry|undefined;
export function gameTelemetry(){if(!runtime)runtime=new AnonymousTelemetry(RANKING_API,RELEASE_LABEL,telemetryPlatform(navigator.userAgent),fetch,()=>{try{let id=sessionStorage.getItem('qisheng-visit-session');if(!id){id=crypto.randomUUID();sessionStorage.setItem('qisheng-visit-session',id);}return id;}catch{return crypto.randomUUID();}});return runtime;}
