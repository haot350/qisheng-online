import type {PlayerRelease} from './releases.ts';

export const RELEASE_READ_KEY='qisheng-release-read-v1';
const CHANGE_EVENT='qisheng-release-read';
type ReleaseIdentity=Pick<PlayerRelease,'id'|'sequence'>;
type ReadState={id:string;sequence:number};
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;
let sessionRead:ReadState={id:'',sequence:0};
function browserStorage():StorageAccess|undefined{try{return typeof localStorage==='undefined'?undefined:localStorage;}catch{return undefined;}}
export function parseReleaseRead(value:string|null|undefined):ReadState{
 try{const state=JSON.parse(value??'null');if(state&&typeof state.id==='string'&&Number.isSafeInteger(state.sequence)&&state.sequence>0)return {id:state.id,sequence:state.sequence};}catch{}
 return {id:'',sequence:0};
}
export function isReleaseUnread(release:ReleaseIdentity,storage:StorageAccess|undefined=browserStorage()):boolean{
 let saved:ReadState={id:'',sequence:0};try{saved=parseReleaseRead(storage?.getItem(RELEASE_READ_KEY));}catch{}
 return release.sequence>Math.max(saved.sequence,sessionRead.sequence);
}
export function markReleaseRead(release:ReleaseIdentity,storage:StorageAccess|undefined=browserStorage()):void{
 let saved:ReadState={id:'',sequence:0};try{saved=parseReleaseRead(storage?.getItem(RELEASE_READ_KEY));}catch{}
 if(release.sequence>sessionRead.sequence)sessionRead={id:release.id,sequence:release.sequence};
 const state=saved.sequence>sessionRead.sequence?saved:sessionRead;
 try{storage?.setItem(RELEASE_READ_KEY,JSON.stringify(state));}catch{}
 if(typeof window!=='undefined')window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeReleaseRead(listener:()=>void):()=>void{
 if(typeof window==='undefined')return()=>{};
 const changed=(event:Event)=>{if(event.type==='storage'&&(event as StorageEvent).key!==RELEASE_READ_KEY)return;listener();};
 window.addEventListener(CHANGE_EVENT,changed);window.addEventListener('storage',changed);
 return()=>{window.removeEventListener(CHANGE_EVENT,changed);window.removeEventListener('storage',changed);};
}
