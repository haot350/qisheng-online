export type ResourceFailureKind='network'|'timeout'|'decode'|'webgl'|'startup';
export class ResourceFailure extends Error {
 readonly kind:ResourceFailureKind;
 constructor(kind:ResourceFailureKind,message:string){super(message);this.name='ResourceFailure';this.kind=kind}
}
const abortError=()=>new DOMException('Aborted','AbortError');
export const RESOURCE_TIMEOUT_MS=30_000;
/** The deadline is reset only when bytes arrive, not when a request merely stays open. */
export async function fetchResourceBytes(url:string,{signal,progress,timeoutMs=RESOURCE_TIMEOUT_MS,fetcher=fetch}:{signal:AbortSignal;progress?:(value:number|undefined)=>void;timeoutMs?:number;fetcher?:typeof fetch}):Promise<ArrayBuffer>{
 if(signal.aborted)throw abortError();
 const owner=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,timedOut=false;
 const cancel=()=>owner.abort();signal.addEventListener('abort',cancel,{once:true});
 const renew=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>{timedOut=true;owner.abort()},timeoutMs)};
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  renew();const response=await fetcher(url,{signal:owner.signal});
  if(!response.ok)throw new ResourceFailure('network',`请求失败（${response.status}）`);
  const total=Number(response.headers.get('content-length'));reader=response.body?.getReader();
  let result:ArrayBuffer;
  if(reader){const chunks:Uint8Array[]=[];let count=0;
   while(true){const {done,value}=await reader.read();if(done)break;if(value.byteLength){renew();chunks.push(value);count+=value.byteLength;progress?.(total>0?Math.min(100,Math.round(count/total*100)):undefined)}}
   const joined=new Uint8Array(count);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength}result=joined.buffer;
  }else result=await response.arrayBuffer();
  if(signal.aborted)throw abortError();if(timedOut)throw new ResourceFailure('timeout','下载超过 30 秒没有进展。');return result;
 }catch(error){
  if(signal.aborted)throw abortError();if(timedOut)throw new ResourceFailure('timeout','下载超过 30 秒没有进展。');
  if(error instanceof ResourceFailure)throw error;throw new ResourceFailure('network','网络连接中断，请重试。');
 }finally{if(timer)clearTimeout(timer);signal.removeEventListener('abort',cancel);if(owner.signal.aborted&&reader)void reader.cancel().catch(()=>{});reader?.releaseLock()}
}
/** Decoding cannot always be aborted; a late result is disposed by its original owner. */
export function decodeResource<T>(decode:()=>Promise<T>,dispose:(value:T)=>void,signal:AbortSignal,timeoutMs=RESOURCE_TIMEOUT_MS):Promise<T>{
 if(signal.aborted)return Promise.reject(abortError());
 return new Promise((resolve,reject)=>{
  let closed=false;let timer:ReturnType<typeof setTimeout>;
  const finish=(error?:unknown,value?:T)=>{if(closed)return;closed=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve(value!)};
  const cancel=()=>finish(abortError());signal.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>finish(new ResourceFailure('decode','模型准备超过 30 秒，请重试。')),timeoutMs);
  Promise.resolve().then(decode).then(value=>{if(closed||signal.aborted){dispose(value);if(!closed)finish(abortError());return}finish(undefined,value)},error=>finish(error instanceof ResourceFailure?error:new ResourceFailure('decode','模型文件无法打开，请重试。')));
 });
}
export function resourceFailureKind(error:unknown):ResourceFailureKind{return error instanceof ResourceFailure?error.kind:'network'}
export function startupFailure(error:unknown,stage:'import'|'engine'):{message:string;kind:ResourceFailureKind;refresh:boolean}{
 if(error instanceof ResourceFailure&&error.kind==='webgl')return {message:'三维画面无法启动。请开启浏览器硬件加速，或先查看静态预览。',kind:'webgl',refresh:false};
 if(stage==='import')return {message:'页面资源未能载入。请检查网络；若网站刚刚更新，可刷新页面。',kind:'startup',refresh:true};
 return {message:'校园浏览器未能启动，请重新加载。',kind:'startup',refresh:false};
}
