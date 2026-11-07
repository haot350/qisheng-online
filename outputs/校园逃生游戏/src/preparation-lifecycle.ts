export type PreparationStage='initialize'|'download'|'decode'|'characters'|'gpu'|'entry';
export type PreparationFailureKind='cancelled'|'network'|'timeout'|'integrity'|'permission'|'version'|'graphics'|'missing'|'unknown';

export class PreparationFailure extends Error{
 readonly code:string;
 constructor(readonly stage:PreparationStage,readonly kind:PreparationFailureKind,options:{cause?:unknown}={}){
  super('PREP_'+stage.toUpperCase()+'_'+kind.toUpperCase(),options);this.name='PreparationFailure';this.code=this.message;
 }
}
/** Only transport failures are automatically retried; invalid content needs its own recovery. */
export function preparationFailure(error:unknown,stage:PreparationStage):PreparationFailure{
 if(error instanceof PreparationFailure)return error;
 let cursor=error;const messages:string[]=[];let status=0,cancelled=false;
 for(let depth=0;cursor&&depth<5;depth++){
  if(cursor instanceof PreparationFailure)return cursor;
  const value=cursor as {name?:string;message?:string;status?:number;statusCode?:number;cause?:unknown};
  messages.push(value.message??String(cursor));cancelled ||= value.name==='AbortError';
  status ||= Number(value.status??value.statusCode)||0;cursor=value.cause;
 }
 const message=messages.join(' '),http=message.match(/(?:HTTP|加载失败|status)\s*[:：]?\s*(\d{3})/i);status ||= http?Number(http[1]):0;
 const kind:PreparationFailureKind=cancelled||/cancelled|已中止|已取消/i.test(message)?'cancelled'
  :status===401||status===403?'permission'
  :/MAP_MISMATCH|版本|已更新|not belong|不属于/i.test(message)?'version'
  :/hash|SHA|校验|checksum|integrity/i.test(message)?'integrity'
  :/context.*lost|图形|着色器|shader|LINK_STATUS/i.test(message)?'graphics'
  :status===404?'missing'
  :/timeout|timed out|超时|停滞/i.test(message)?'timeout'
  :status===408||status===429||status>=500&&status<=599||/network|fetch|offline|网络|连接中断|download failed/i.test(message)?'network':'unknown';
 return new PreparationFailure(stage,kind,{cause:error});
}
export const retryablePreparationFailure=(error:unknown)=>{const failure=preparationFailure(error,'download');return failure.stage==='download'&&['network','timeout'].includes(failure.kind);};
export function preparationErrorView(error:unknown,stage:PreparationStage){
 const failure=preparationFailure(error,stage),refresh=['version','missing'].includes(failure.kind)||(failure.stage==='initialize'&&failure.kind==='timeout');
 const message=refresh?'校园页面已更新，请刷新游戏。'
  :failure.kind==='permission'?'当前访问状态已变化，请重新进入。'
  :failure.kind==='graphics'?'画面准备未完成，请重试。'
  :failure.kind==='integrity'?'校园资源校验未通过，请重试。'
  :failure.kind==='network'||failure.kind==='timeout'?'资源准备中断，请重试。'
  :stage==='initialize'?'校园暂时未能载入，请重试。':'这一局暂时未能进入，请重试。';
 return{code:failure.code,message,recovery:refresh?'refresh' as const:'retry' as const};
}

export type ForegroundVisibility={hidden:()=>boolean;subscribe:(changed:()=>void)=>()=>void};
const browserVisibility:ForegroundVisibility={hidden:()=>typeof document!=='undefined'&&document.hidden,subscribe:changed=>{if(typeof document==='undefined')return()=>{};document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);}};
/** Queues do not call this until their job begins. Hidden-page time is not GPU/init work. */
export function withForegroundDeadline<T>(work:Promise<T>,milliseconds:number,options:{signal?:AbortSignal;stage?:PreparationStage;onTimeout?:()=>void;onLate?:(value:T)=>void;visibility?:ForegroundVisibility;clock?:()=>number}={}):Promise<T>{
 const visibility=options.visibility??browserVisibility,clock=options.clock??(()=>performance.now());
 return new Promise((resolve,reject)=>{
  let settled=false,remaining=milliseconds,last=clock(),running=!visibility.hidden(),timer:ReturnType<typeof setTimeout>|undefined;
  const consume=()=>{const at=clock();if(running)remaining-=Math.max(0,at-last);last=at;};
  const cleanup=()=>{if(timer!==undefined)clearTimeout(timer);unsubscribe();options.signal?.removeEventListener('abort',abort);};
  const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();reject(error);};
  const abort=()=>fail(new DOMException('Cancelled','AbortError'));
  const arm=()=>{if(timer!==undefined)clearTimeout(timer);if(!running||settled)return;timer=setTimeout(()=>{consume();if(remaining>0){arm();return;}fail(new PreparationFailure(options.stage??'initialize','timeout'));options.onTimeout?.();},Math.max(0,remaining));};
  const changed=()=>{consume();running=!visibility.hidden();arm();};
  let unsubscribe=()=>{};unsubscribe=visibility.subscribe(changed);options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)abort();else arm();
  work.then(value=>{if(settled){options.onLate?.(value);return;}settled=true;cleanup();resolve(value);},error=>fail(preparationFailure(error,options.stage??'initialize')));
 });
}

/** A rejected module initializer must not poison every subsequent attempt in this page. */
export function retryableInitialization<T>(initialize:()=>Promise<T>){
 let cached:Promise<T>|undefined;
 return()=>{if(!cached){const work=Promise.resolve().then(initialize);cached=work;void work.catch(()=>{if(cached===work)cached=undefined;});}return cached;};
}

export type PreparationDiagnosticEvent={code:string;stage:string;mode?:string;quality?:string;generation:number;resourceHash?:string;atMs:number};
const diagnosticEvents:PreparationDiagnosticEvent[]=[];
export function recordPreparationDiagnostic(error:unknown,stage:PreparationStage,context:{mode?:string;quality?:string;generation?:number;resourceHash?:string}={}){
 const failure=preparationFailure(error,stage);if(failure.kind==='cancelled')return failure;
 const safe=(value:string|undefined)=>value&&/^[a-zA-Z0-9_-]{1,32}$/.test(value)?value:undefined;
 diagnosticEvents.push({code:failure.code,stage:failure.stage,mode:safe(context.mode),quality:safe(context.quality),generation:Math.max(0,Math.floor(context.generation??0)),resourceHash:context.resourceHash&&/^[0-9a-f]{64}$/i.test(context.resourceHash)?context.resourceHash:undefined,atMs:Math.round(performance.now())});
 if(diagnosticEvents.length>32)diagnosticEvents.splice(0,diagnosticEvents.length-32);return failure;
}
export function preparationDiagnostics():{events:PreparationDiagnosticEvent[]}{return{events:diagnosticEvents.map(event=>({...event}))};}
