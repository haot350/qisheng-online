/** Map bytes only. HTML, manifests, APIs, photos and saves never enter this cache. */
export const MAP_CACHE_NAME='qisheng-map-bytes-v1';
export const MAP_CACHE_LIMIT=192*1024*1024;
export type MapResource={url:string;sha256:string;bytes:number;mime:string};
export type MapResourceIndex={schema:1;manifest:{url:string;sha256:string};resources:Record<string,MapResource>};
export type MapCacheCoverage={bytes:number;files:number;totalBytes:number;totalFiles:number;remainingBytes:number;oldBytes:number;oldFiles:number;complete:boolean};
export type MapCacheStats={ready:boolean;bytes:number;files:number;budget:number;available:boolean;reason:string;hits:number;misses:number;active:number;current?:MapCacheCoverage;prefetch:{running:boolean;done:number;total:number;bytes:number;totalBytes:number;error:string;receiving?:number;stage?:'reading'|'downloading'|'verifying';pausedBy:'user'|'battle'|null;requested:boolean}};
export const abortMapRequest=()=>new DOMException('地图加载已取消。','AbortError');
export async function mapDigest(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
type TransferProgress=(percent:number|undefined,bytes?:number)=>void;
type Consumer<T>={resolve:(v:T)=>void;reject:(e:unknown)=>void;priority:number;cleanup:()=>void;progress?:TransferProgress};
type Job<T>={key:string;run:(signal:AbortSignal,progress:TransferProgress)=>Promise<T>;consumers:Set<Consumer<T>>;controller?:AbortController;preempted:boolean;serial:number;lastProgress?:[number|undefined,number|undefined]};

/** One shared queue: deduplicates requests, preserves each caller's cancellation,
 * and aborts low-priority background transfers before admitting gameplay work. */
export class MapDownloadQueue {
 private jobs=new Map<string,Job<unknown>>();private running=new Set<Job<unknown>>();private serial=0;
 constructor(private changed=()=>{}){}
 get active(){return this.running.size;}
 private priority(job:Job<unknown>){return Math.min(...[...job.consumers].map(c=>c.priority));}
 request<T>(key:string,run:(signal:AbortSignal,progress:TransferProgress)=>Promise<T>,priority=1,signal?:AbortSignal,progress?:TransferProgress):Promise<T>{
  if(signal?.aborted)return Promise.reject(abortMapRequest());
  let job=this.jobs.get(key) as Job<T>|undefined;
  if(!job){job={key,run,consumers:new Set(),preempted:false,serial:this.serial++};this.jobs.set(key,job as Job<unknown>);}
  const selected=job;
  return new Promise<T>((resolve,reject)=>{
   const consumer:Consumer<T>={resolve,reject,priority,cleanup:()=>signal?.removeEventListener('abort',cancel),progress};
   const cancel=()=>{if(!selected.consumers.delete(consumer))return;consumer.cleanup();reject(abortMapRequest());if(!selected.consumers.size){selected.controller?.abort();if(this.jobs.get(key)===selected)this.jobs.delete(key);}this.pump();};
   selected.consumers.add(consumer);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();else if(selected.lastProgress)progress?.(...selected.lastProgress);this.pump();
  });
 }
 private pump(){
  const queued=[...this.jobs.values()].filter(j=>!j.controller&&j.consumers.size).sort((a,b)=>this.priority(a)-this.priority(b)||a.serial-b.serial);
  while(this.running.size<2&&queued.length){
   const job=queued.shift()!;job.preempted=false;const controller=new AbortController();job.controller=controller;this.running.add(job);this.changed();
   const report:TransferProgress=(percent,bytes)=>{if(controller.signal.aborted||job.controller!==controller)return;job.lastProgress=[percent,bytes];for(const c of job.consumers)c.progress?.(percent,bytes);};
   report(0,0);
   void job.run(controller.signal,report).then(value=>{
    if(controller.signal.aborted)throw abortMapRequest();
    for(const c of job.consumers){c.cleanup();c.resolve(value);}job.consumers.clear();
   }).catch(error=>{if(!job.preempted)for(const c of job.consumers){c.cleanup();c.reject(error);}if(!job.preempted)job.consumers.clear();}).finally(()=>{
    this.running.delete(job);job.controller=undefined;if(!job.consumers.size&&this.jobs.get(job.key)===job)this.jobs.delete(job.key);this.changed();this.pump();
   });
  }
  if(queued.length&&this.running.size===2){const next=queued[0],candidate=[...this.running].filter(j=>!j.preempted&&this.priority(j)>this.priority(next)).sort((a,b)=>this.priority(b)-this.priority(a))[0];if(candidate){candidate.preempted=true;candidate.controller?.abort();}}
 }
}

const emptyPrefetch=():MapCacheStats['prefetch']=>({running:false,done:0,total:0,bytes:0,totalBytes:0,error:'',pausedBy:null,requested:false});
type PrefetchSource=MapResource[]|((signal:AbortSignal)=>Promise<MapResource[]>);
export class MapByteCache {
 readonly queue:MapDownloadQueue;
 private listeners=new Set<()=>void>();private epoch=0;private lock:Promise<unknown>=Promise.resolve();private touched=new Map<string,number>();private prefetchAbort?:AbortController;private readable=true;
 private inventory?:Map<string,{key:Request;bytes:number;time:number}>;private currentResources?:Map<string,MapResource>;private verified=new Set<string>();private prefetchSource?:PrefetchSource;private onlineBattle=false;
 private state:MapCacheStats={ready:false,bytes:0,files:0,budget:MAP_CACHE_LIMIT,available:true,reason:'',hits:0,misses:0,active:0,prefetch:emptyPrefetch()};
 constructor(private environment:{fetch:typeof fetch;caches?:CacheStorage;storage?:{estimate:()=>Promise<StorageEstimate>};metadata?:Pick<Storage,'getItem'|'setItem'>;origin:string}){
  this.queue=new MapDownloadQueue(()=>{this.state={...this.state,active:this.queue.active};this.emit();});
  try{const saved=JSON.parse(environment.metadata?.getItem('qisheng-map-lru-v1')||'{}');for(const [url,time] of Object.entries(saved))if(typeof time==='number')this.touched.set(url,time);}catch{}
  if(!environment.caches){this.readable=false;this.degrade('浏览器未开放地图存储，将直接联网加载。');}
 }
 stats=():MapCacheStats=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private emit(){for(const listener of this.listeners)listener();}
 private coverage(){
  if(!this.currentResources)return;
  let bytes=0,files=0,totalBytes=0;for(const [url,r] of this.currentResources){totalBytes+=r.bytes;const row=this.inventory?.get(url);if(row?.bytes===r.bytes&&this.verified.has(url)){bytes+=r.bytes;files++;}}
  const current={bytes,files,totalBytes,totalFiles:this.currentResources.size,remainingBytes:Math.max(0,totalBytes-bytes),oldBytes:Math.max(0,this.state.bytes-bytes),oldFiles:Math.max(0,this.state.files-files),complete:files===this.currentResources.size};
  this.state={...this.state,current};
 }
 private degrade(reason:string){this.state={...this.state,ready:true,available:false,reason};this.emit();}
 private exclusive<T>(work:()=>Promise<T>):Promise<T>{const next=this.lock.then(work,work);this.lock=next.catch(()=>{});return next;}
 private touch(url:string){this.touched.set(url,Math.max(Date.now(),...this.touched.values(),0)+1);try{this.environment.metadata?.setItem('qisheng-map-lru-v1',JSON.stringify(Object.fromEntries(this.touched)));}catch{}}
 private async entries(cache:Cache,refresh=false){if(!this.inventory||refresh){const rows=new Map<string,{key:Request;bytes:number;time:number}>();for(const key of await cache.keys()){const r=await cache.match(key);if(r)rows.set(key.url,{key,bytes:Number(r.headers.get('X-Map-Bytes'))||0,time:Number(r.headers.get('X-Map-Access'))||0});}this.inventory=rows;}return [...this.inventory.values()].map(row=>({...row,time:this.touched.get(row.key.url)||row.time}));}
 private async budget(bytes:number){let budget=MAP_CACHE_LIMIT;try{const estimate=await this.environment.storage?.estimate();if(estimate?.quota!==undefined&&estimate.usage!==undefined)budget=Math.min(budget,Math.max(0,Math.floor((estimate.quota-estimate.usage+bytes)*.5)));}catch{}return budget;}
 async refresh(resources?:MapResource[],signal?:AbortSignal){
  if(resources){this.currentResources=new Map(resources.map(r=>[new URL(r.url,this.environment.origin).href,r]));for(const url of this.currentResources.keys())this.verified.delete(url);this.coverage();}
  if(!this.environment.caches)return this.state;
  try{await this.exclusive(async()=>{
   const cache=await this.environment.caches!.open(MAP_CACHE_NAME);await this.entries(cache,true);
   if(signal?.aborted)throw abortMapRequest();
   // Verify entries inherited from another page or browser session before calling the map complete.
   for(const [url,r] of this.currentResources??[]){if(signal?.aborted)throw abortMapRequest();const row=this.inventory?.get(url);if(!row)continue;if(this.verified.has(url)&&row.bytes===r.bytes)continue;const stored=await cache.match(url);if(!stored){this.inventory?.delete(url);this.verified.delete(url);continue;}const data=await stored.arrayBuffer();if(data.byteLength!==r.bytes||await mapDigest(data)!==r.sha256){await cache.delete(url);this.inventory?.delete(url);this.verified.delete(url);this.touched.delete(url);continue;}this.verified.add(url);row.bytes=data.byteLength;}
   const rows=await this.entries(cache),bytes=rows.reduce((n,r)=>n+r.bytes,0);this.readable=true;this.state={...this.state,ready:true,available:true,reason:'',bytes,files:rows.length,budget:await this.budget(bytes)};this.coverage();this.emit();
  });}catch(error){if(signal?.aborted)throw error;this.degrade('本机地图存储暂时不可用，将直接联网加载。');}return this.state;
 }
 async fetchBytes(url:string,signal:AbortSignal,cache:RequestCache='default',progress?:TransferProgress){
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();let timer:ReturnType<typeof setTimeout>;let timedOut=false;
  const renew=()=>{clearTimeout(timer);timer=setTimeout(()=>{timedOut=true;controller.abort();},30000);};renew();
  try{const r=await this.environment.fetch(url,{signal:controller.signal,cache});if(!r.ok)throw Error('地图资源未能加载（'+r.status+'）。');
   let bytes:ArrayBuffer;const reader=r.body?.getReader();if(reader){const parts:Uint8Array[]=[];let count=0,total=Number(r.headers.get('Content-Length'));try{while(true){const {done,value}=await reader.read();if(done)break;if(value.length){renew();parts.push(value);count+=value.length;progress?.(total>0?Math.min(99,Math.round(count/total*100)):undefined,count);}}}finally{reader.releaseLock();}const joined=new Uint8Array(count);let offset=0;for(const part of parts){joined.set(part,offset);offset+=part.length;}bytes=joined.buffer;}else bytes=await r.arrayBuffer();
   if(controller.signal.aborted)throw abortMapRequest();return bytes;
  }catch(error){if(timedOut&&!signal.aborted)throw Error('地图下载超过 30 秒没有进展，请重试。');throw error;}finally{clearTimeout(timer!);signal.removeEventListener('abort',abort);}
 }
 read(resource:MapResource,options:{signal?:AbortSignal;priority?:number;progress?:TransferProgress}={}):Promise<ArrayBuffer>{
  const epoch=this.epoch,url=new URL(resource.url,this.environment.origin).href;
  return this.queue.request(url,async (signal,progress)=>{
   let cached:Response|undefined;
   if(this.readable)try{cached=await this.exclusive(async()=>{const cache=await this.environment.caches!.open(MAP_CACHE_NAME);return await cache.match(url);});}catch{this.readable=false;this.degrade('本机地图存储暂时不可用，将直接联网加载。');}
   if(signal.aborted)throw abortMapRequest();
   if(cached){const bytes=await cached.arrayBuffer();if(bytes.byteLength===resource.bytes&&await mapDigest(bytes)===resource.sha256){if(epoch===this.epoch){this.verified.add(url);this.touch(url);this.state={...this.state,hits:this.state.hits+1};this.coverage();this.emit();}progress(100,bytes.byteLength);return bytes;}
    try{await this.exclusive(async()=>{if(epoch!==this.epoch)return;const cache=await this.environment.caches!.open(MAP_CACHE_NAME);await cache.delete(url);this.inventory?.delete(url);this.verified.delete(url);this.touched.delete(url);const rows=await this.entries(cache);this.state={...this.state,bytes:rows.reduce((n,r)=>n+r.bytes,0),files:rows.length};this.coverage();this.emit();});}catch{}
   }
   this.state={...this.state,misses:this.state.misses+1};this.emit();
   let bytes=await this.fetchBytes(resource.url,signal,'default',progress);
   if(bytes.byteLength!==resource.bytes||await mapDigest(bytes)!==resource.sha256){progress(0,0);bytes=await this.fetchBytes(resource.url,signal,'reload',progress);if(bytes.byteLength!==resource.bytes||await mapDigest(bytes)!==resource.sha256)throw Error('地图资源校验失败，请重试。');}
   if(signal.aborted)throw abortMapRequest();
   if(this.state.available&&epoch===this.epoch)try{await this.exclusive(async()=>{
    if(epoch!==this.epoch||signal.aborted)return;const cache=await this.environment.caches!.open(MAP_CACHE_NAME),rows=await this.entries(cache);let used=rows.reduce((n,r)=>n+r.bytes,0);const budget=await this.budget(used);
    this.state={...this.state,budget};if(resource.bytes>budget){this.state={...this.state,reason:'可用空间较少，较大的地图资源将直接联网加载。'};this.emit();return;}
    rows.sort((a,b)=>a.time-b.time);for(const row of rows){if(row.key.url===url){used-=row.bytes;continue;}if(used+bytes.byteLength<=budget)break;await cache.delete(row.key);this.inventory?.delete(row.key.url);this.verified.delete(row.key.url);this.touched.delete(row.key.url);used-=row.bytes;}
    await cache.put(url,new Response(bytes,{headers:{'Content-Type':resource.mime,'X-Map-Bytes':String(bytes.byteLength),'X-Map-Access':String(Date.now())}}));this.touch(url);
    this.inventory?.set(url,{key:new Request(url),bytes:bytes.byteLength,time:Date.now()});this.verified.add(url);
    const all=await this.entries(cache);this.state={...this.state,ready:true,bytes:all.reduce((n,r)=>n+r.bytes,0),files:all.length};this.coverage();this.emit();
   });}catch{this.degrade('本机空间不足或存储受限，地图仍可直接联网加载。');}
   progress(100,bytes.byteLength);return bytes;
  },options.priority??1,options.signal,options.progress);
 }
 private pausePrefetch(by:'user'|'battle'){
  this.prefetchAbort?.abort();this.prefetchAbort=undefined;this.state={...this.state,prefetch:{...this.state.prefetch,running:false,receiving:0,pausedBy:by,requested:by==='battle'&&this.state.prefetch.requested}};this.emit();
 }
 cancelPrefetch(){this.pausePrefetch('user');}
 setDownloadContext({onlineBattle,menu}:{onlineBattle:boolean;menu:boolean}){
  this.onlineBattle=onlineBattle;
  if(onlineBattle&&this.state.prefetch.running)this.pausePrefetch('battle');
  else if(!onlineBattle&&menu&&this.state.prefetch.requested&&this.state.prefetch.pausedBy==='battle'&&this.prefetchSource)void this.prefetch(this.prefetchSource);
 }
 async prefetch(resources:PrefetchSource){
  this.prefetchAbort?.abort();this.prefetchAbort=undefined;this.prefetchSource=resources;
  if(this.onlineBattle){this.state={...this.state,prefetch:{...this.state.prefetch,requested:true,pausedBy:'battle',running:false,error:''}};this.emit();return;}
  const abort=new AbortController();this.prefetchAbort=abort;
  this.state={...this.state,prefetch:{...emptyPrefetch(),running:true,requested:true,stage:'reading'}};this.emit();
  try{
   const list=typeof resources==='function'?await resources(abort.signal):resources,unique=[...new Map(list.map(r=>[r.url,r])).values()];if(abort.signal.aborted)return;
   this.state={...this.state,prefetch:{...this.state.prefetch,total:unique.length,totalBytes:unique.reduce((n,r)=>n+r.bytes,0)}};this.emit();
   await this.refresh(unique,abort.signal);if(abort.signal.aborted)return;if(!this.state.available||this.state.prefetch.totalBytes>this.state.budget)throw Error('本机空间不足以保存完整地图，仍可按需联网游玩。');
   const cached=unique.filter(r=>this.verified.has(new URL(r.url,this.environment.origin).href)&&this.inventory?.get(new URL(r.url,this.environment.origin).href)?.bytes===r.bytes);
   this.state={...this.state,prefetch:{...this.state.prefetch,done:cached.length,bytes:cached.reduce((n,r)=>n+r.bytes,0)}};this.emit();
   const receiving=new Map<string,number>();const remaining=unique.filter(r=>!cached.includes(r));let next=0;const worker=async()=>{while(next<remaining.length&&!abort.signal.aborted){const r=remaining[next++];await this.read(r,{signal:abort.signal,priority:10,progress:(percent,bytes)=>{if(abort.signal.aborted||this.prefetchAbort!==abort)return;receiving.set(r.url,Math.min(r.bytes,Math.max(0,bytes??0)));this.state={...this.state,prefetch:{...this.state.prefetch,receiving:[...receiving.values()].reduce((n,v)=>n+v,0),stage:percent===99||bytes===r.bytes?'verifying':'downloading'}};this.emit();}});receiving.delete(r.url);if(abort.signal.aborted)return;if(!this.state.available)throw Error('本机存储暂时不可用，请稍后重试。');this.state={...this.state,prefetch:{...this.state.prefetch,done:this.state.prefetch.done+1,bytes:this.state.prefetch.bytes+r.bytes,receiving:[...receiving.values()].reduce((n,v)=>n+v,0)}};this.emit();}};
   await Promise.all([worker(),worker()]);
  }catch(error){if(!abort.signal.aborted&&this.prefetchAbort===abort){this.state={...this.state,prefetch:{...this.state.prefetch,error:error instanceof Error?error.message:'完整地图暂时未能下载，请重试。'}};abort.abort();}}
  finally{if(this.prefetchAbort===abort){this.prefetchAbort=undefined;this.state={...this.state,prefetch:{...this.state.prefetch,running:false,receiving:0,requested:false}};this.emit();await this.refresh();}}
 }
 async clear(){this.cancelPrefetch();this.prefetchSource=undefined;this.epoch++;await this.exclusive(async()=>{try{await this.environment.caches?.delete(MAP_CACHE_NAME);}catch{this.degrade('地图缓存暂时无法清除，请重试。');throw Error('地图缓存暂时无法清除。');}this.inventory=undefined;this.verified.clear();this.touched.clear();try{this.environment.metadata?.setItem('qisheng-map-lru-v1','{}');}catch{}this.state={...this.state,ready:true,bytes:0,files:0,prefetch:emptyPrefetch()};this.coverage();this.emit();});}
}

let shared:MapByteCache|undefined;
export function mapByteCache(){
 if(!shared){let metadata:Storage|undefined;try{metadata=globalThis.localStorage;}catch{}shared=new MapByteCache({fetch:(...args)=>fetch(...args),caches:typeof caches==='undefined'?undefined:caches,storage:typeof navigator==='undefined'?undefined:navigator.storage,metadata,origin:typeof location==='undefined'?'http://localhost':location.origin});}
 return shared;
}
export class MapAssetSession {
 private fixed?:{index:MapResourceIndex;manifestBytes:ArrayBuffer};
 private fixedIndex?:MapResourceIndex;
 constructor(readonly indexUrl:string,private cache=mapByteCache()){}
 resourceIndex(signal?:AbortSignal):Promise<MapResourceIndex>{
  if(signal?.aborted)return Promise.reject(abortMapRequest());
  if(this.fixedIndex)return Promise.resolve(this.fixedIndex);
  return this.cache.queue.request('index:'+this.indexUrl,async requestSignal=>{
   const raw=await this.cache.fetchBytes(this.indexUrl,requestSignal,'no-store'),index=JSON.parse(new TextDecoder().decode(raw)) as MapResourceIndex;
   if(index.schema!==1||!index.manifest?.url?.startsWith('/')||!/^([a-f0-9]{64})$/.test(index.manifest.sha256)||!index.resources||typeof index.resources!=='object')throw Error('地图资源索引无效，请刷新页面。');
   for(const [logical,r] of Object.entries(index.resources))if(!logical.startsWith('/')||!/^\/assets\/map\/[a-f0-9]{64}\.[a-z0-9]+$/.test(r.url)||!/^[a-f0-9]{64}$/.test(r.sha256)||!r.url.includes(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<0)throw Error('地图资源索引无效。');
   return index;
  },0,signal).then(index=>{this.fixedIndex??=index;return this.fixedIndex;});
 }
 async initialize(signal?:AbortSignal){
  if(signal?.aborted)throw abortMapRequest();if(this.fixed)return this.fixed;
  const index=await this.resourceIndex(signal);
  return this.cache.queue.request('manifest:'+index.manifest.sha256,async requestSignal=>{
   const manifestBytes=await this.cache.fetchBytes(index.manifest.url,requestSignal,'no-store');if(await mapDigest(manifestBytes)!==index.manifest.sha256)throw Error('校园刚刚更新，请刷新页面后重试。');
   return{index,manifestBytes};
  },0,signal).then(result=>{this.fixed??=result;return this.fixed;});
 }
 async read(logicalUrl:string,options:{signal?:AbortSignal;priority?:number;progress?:(percent:number|undefined)=>void}={}){const {index}=await this.initialize(options.signal),resource=index.resources[logicalUrl];if(!resource)throw Error('地图资源未列入本次校园版本。');return this.cache.read(resource,options);}
 async prefetch(){return this.cache.prefetch(async signal=>{const {index}=await this.initialize(signal);return Object.values(index.resources);});}
}
export function awaitWithSignal<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return promise;if(signal.aborted)return Promise.reject(abortMapRequest());return new Promise<T>((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(abortMapRequest());};signal.addEventListener('abort',abort,{once:true});promise.then(v=>{signal.removeEventListener('abort',abort);if(!signal.aborted)resolve(v);},e=>{signal.removeEventListener('abort',abort);reject(e);});});
}
