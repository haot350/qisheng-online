/** Shared resource work belongs to its consumers, rather than the first request. */
export type ResourceLease<T>={value:Promise<T>;release:()=>void};
type Entry<T>={refs:number;controller:AbortController;value?:T;work:Promise<T>;disposed:boolean};
export class ResourceLeases<T>{
 private entries=new Map<string,Entry<T>>();
 constructor(private load:(key:string,signal:AbortSignal)=>Promise<T>,private dispose:(value:T)=>void){}
 acquire(key:string):ResourceLease<T>{
  let entry=this.entries.get(key);
  if(!entry||entry.controller.signal.aborted){
   const next:Entry<T>={refs:0,controller:new AbortController(),work:undefined as unknown as Promise<T>,disposed:false};entry=next;this.entries.set(key,next);
   next.work=Promise.resolve().then(()=>this.load(key,next.controller.signal)).then(value=>{if(next.controller.signal.aborted||next.refs===0){this.dispose(value);next.disposed=true;throw new DOMException('Cancelled','AbortError');}next.value=value;return value;}).catch(error=>{next.controller.abort();if(this.entries.get(key)===next)this.entries.delete(key);throw error;});
  }
  entry.refs++;const held=entry;let released=false;
  return{value:held.work,release:()=>{if(released)return;released=true;if(--held.refs>0)return;if(this.entries.get(key)===held)this.entries.delete(key);held.controller.abort();if(held.value!==undefined&&!held.disposed){held.disposed=true;this.dispose(held.value);held.value=undefined;}}};
 }
 peek(key:string){return this.entries.get(key)?.value;}
 retainReady(key:string):{value:T;release:()=>void}{const value=this.peek(key);if(value===undefined)throw Error('Resource not ready: '+key);const lease=this.acquire(key);return{value,release:lease.release};}
 diagnostics(){return{models:[...this.entries.values()].filter(e=>e.value!==undefined).length,pending:[...this.entries.values()].filter(e=>e.value===undefined).length,references:[...this.entries.values()].reduce((n,e)=>n+e.refs,0),keys:[...this.entries.keys()]};}
}

/** Decode/download work is capped across weapons, portraits and avatars. */
class ResourceWorkQueue{
 private active=0;private waiting:{signal:AbortSignal;run:()=>void;reject:(reason:unknown)=>void;abort:()=>void}[]=[];
 run<T>(signal:AbortSignal,work:()=>Promise<T>):Promise<T>{return new Promise<T>((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
  const row={signal,run:()=>{signal.removeEventListener('abort',row.abort);this.active++;void work().then(resolve,reject).finally(()=>{this.active--;this.drain();});},reject,abort:()=>{const index=this.waiting.indexOf(row);if(index>=0)this.waiting.splice(index,1);reject(new DOMException('Cancelled','AbortError'));}};
  signal.addEventListener('abort',row.abort,{once:true});this.waiting.push(row);this.drain();
 });}
 private drain(){while(this.active<4&&this.waiting.length){const row=this.waiting.shift()!;if(row.signal.aborted){row.signal.removeEventListener('abort',row.abort);row.reject(new DOMException('Cancelled','AbortError'));}else row.run();}}
}
export const resourceWorkQueue=new ResourceWorkQueue();
export function abortResource(signal:AbortSignal){if(signal.aborted)throw new DOMException('Cancelled','AbortError');}
export async function fetchResource(url:string,signal:AbortSignal){abortResource(signal);const response=await fetch(url,{signal});if(!response.ok)throw Error('Resource HTTP '+response.status);const bytes=await response.arrayBuffer();abortResource(signal);return bytes;}

/** HTML image decoding preserves TextureLoader's UV/alpha orientation. */
export function decodeResourceImage(bytes:ArrayBuffer,signal:AbortSignal):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{
 abortResource(signal);const url=URL.createObjectURL(new Blob([bytes])),image=new Image();let settled=false;
 const cleanup=()=>{signal.removeEventListener('abort',abort);image.onload=image.onerror=null;URL.revokeObjectURL(url);};
 const abort=()=>{if(settled)return;settled=true;image.src='';cleanup();reject(new DOMException('Cancelled','AbortError'));};
 image.onload=()=>{if(settled)return;settled=true;cleanup();resolve(image);};image.onerror=()=>{if(settled)return;settled=true;cleanup();reject(Error('Image decoding failed'));};signal.addEventListener('abort',abort,{once:true});image.src=url;
});}

/** A caller may stop waiting without cancelling another consumer's shared work. */
export function waitForResource<T>(work:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return work;if(signal.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
 return new Promise((resolve,reject)=>{const abort=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'));},cleanup=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});void work.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});});
}
