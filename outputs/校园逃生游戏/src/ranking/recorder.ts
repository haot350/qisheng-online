import {rankingClient,RankingError} from './client.ts';
import {rankingRuleVersion,drivingRuleVersion,RANKING_LIMITS,type RankingEvent,type RankingRunConfig,type RankingSummary,type RankingTicket,type RankingStatus,type RankingSubmission} from './shared.ts';
export type RankingViewSnapshot={status:RankingStatus;runId?:string;message:string;eligible:boolean;canSubmit:boolean;canPublish?:boolean;published?:boolean;recorded?:boolean;newAchievements?:string[]};
export type StoredRankingRun={id:string;ownerId:string;ticket:RankingTicket;config:RankingRunConfig;events:RankingEvent[];acked:number;summary?:RankingSummary;status:RankingStatus;autoSubmit:boolean;recordStats?:boolean;publishBoard?:boolean;createdAt:number;finishedAt?:number;};
const memory=new Map<string,StoredRankingRun>();const removed=new Set<string>();let database:Promise<IDBDatabase>|null=null;
function openStore(){if(database)return database;database=new Promise<IDBDatabase>((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new Error('Unavailable'));return;}const request=indexedDB.open('qisheng-ranking-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('runs',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return database;}
async function store(run:StoredRankingRun){if(removed.has(run.id))return;memory.set(run.id,structuredClone(run));try{const db=await openStore();await new Promise<void>((resolve,reject)=>{if(removed.has(run.id)){resolve();return;}const tx=db.transaction('runs','readwrite');tx.objectStore('runs').put(run);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}catch{/* Local-only storage fallback never interrupts a match. */}}
async function storedRuns(){try{const db=await openStore();return await new Promise<StoredRankingRun[]>((resolve,reject)=>{const r=db.transaction('runs').objectStore('runs').getAll();r.onsuccess=()=>resolve([...new Map<string,StoredRankingRun>([...r.result.map((row:StoredRankingRun)=>[row.id,row] as const),...memory.entries()]).values()].filter(row=>!removed.has(row.id)));r.onerror=()=>reject(r.error);});}catch{return [...memory.values()];}}
async function removeRun(id:string){removed.add(id);memory.delete(id);try{const db=await openStore();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('runs','readwrite');tx.objectStore('runs').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}catch{}}
export async function pendingRankingRuns(){const id=rankingClient.getPlayer()?.id;if(!id)return [];const rows=await storedRuns();if(rankingClient.getPlayer()?.id!==id)return [];for(const row of rows)if(row.ticket.expiresAt<Date.now())void removeRun(row.id);return rows.filter(r=>r.ownerId===id&&!!r.summary&&r.ticket.expiresAt>=Date.now()&&!['ranked','review','rejected','unranked'].includes(r.status)).sort((a,b)=>(b.finishedAt??0)-(a.finishedAt??0));}
const activeUploads=new Map<string,Promise<RankingSubmission>>();
async function uploadRun(run:StoredRankingRun){if(rankingClient.getPlayer()?.id!==run.ownerId)throw new RankingError('请先恢复这局使用的玩家身份。','WRONG_IDENTITY',true);if(run.ticket.expiresAt<Date.now())throw new RankingError('本局提交期限已过，本机成绩仍然保留。','EXPIRED',false);
 while(run.acked<run.events.length){if(rankingClient.getPlayer()?.id!==run.ownerId)throw new RankingError('请先恢复这局使用的玩家身份。','WRONG_IDENTITY',true);const batch=run.events.slice(run.acked,run.acked+RANKING_LIMITS.eventBatch),response=await rankingClient.upload(run.id,run.ticket.credential,batch);if(!Number.isInteger(response.ackedSeq)||response.ackedSeq<run.acked+batch.length||response.ackedSeq>run.events.length)throw new RankingError('成绩上传尚未完成，请重试。');run.acked=response.ackedSeq;await store(run);}
 if(rankingClient.getPlayer()?.id!==run.ownerId)throw new RankingError('请先恢复这局使用的玩家身份。','WRONG_IDENTITY',true);if(!run.summary)throw new RankingError('本局尚未结束。','NOT_FINISHED',false);const result=await rankingClient.finalize(run.id,run.ticket.credential,run.summary,run.events.length);if(rankingClient.getPlayer()?.id!==run.ownerId)throw new RankingError('请先恢复这局使用的账号。','WRONG_IDENTITY',true);run.status=result.status;await removeRun(run.id);return result;
}
export async function retryPendingRanking(id:string){const ownerId=rankingClient.getPlayer()?.id,result=await retryStoredRanking(id);if(rankingClient.getPlayer()?.id!==ownerId)throw new RankingError('登录状态已改变。','CANCELLED',false);return result.status==='ranked'&&result.published===false?rankingClient.publishRun(result.runId):result;}
async function retryStoredRanking(id:string){const current=activeUploads.get(id);if(current)return current;const work=(async()=>{const run=(await storedRuns()).find(r=>r.id===id);if(!run)throw new RankingError('没有找到待提交成绩。','MISSING',false);try{return await uploadRun(run);}catch(error){run.status='retry';if(error instanceof RankingError&&error.code==='EXPIRED')await removeRun(run.id);else await store(run);throw error;}})().finally(()=>activeUploads.delete(id));activeUploads.set(id,work);return work;}
export class RankingRecorder{
 private run:StoredRankingRun|null=null;private cancelled=false;private sealed=false;private lastPersist=0;private saving:Promise<void>=Promise.resolve();private submitting:Promise<void>|null=null;
 private state:RankingViewSnapshot={status:'local',message:'本局仅保存本机成绩',eligible:false,canSubmit:false,canPublish:false,newAchievements:[]};
 constructor(private notify:()=>void=()=>{}){}
 snapshot(){return {...this.state,newAchievements:[...(this.state.newAchievements??[])]};}
 private update(state:Partial<RankingViewSnapshot>){this.state={...this.state,...state};this.notify();}
 cancel(){this.cancelled=true;this.notify=()=>{};if(this.run&&!this.sealed)void removeRun(this.run.id);}
 async begin(config:RankingRunConfig,signal?:AbortSignal){
  config={...config,ruleVersion:config.mode==='dafei'?drivingRuleVersion(config.vehicleId??'bao5'):rankingRuleVersion(config.mode)};
  const clientRunId=crypto.randomUUID();try{
   let timeout:ReturnType<typeof setTimeout>|undefined;
   const player=rankingClient.getPlayer()??await Promise.race([rankingClient.me(),new Promise<null>(resolve=>{timeout=setTimeout(()=>resolve(null),2500);})]).finally(()=>clearTimeout(timeout));
   if(this.cancelled||signal?.aborted)return;
   if(!player||player.restricted||player.needsUpgrade||player.accountStatus==='legacy'||player.accountStatus==='disabled'){
    this.update({message:!player?'登录账号后，下一局可同步战绩':player.needsUpgrade||player.accountStatus==='legacy'?'本局保存在本机，升级账号后下一局可同步战绩':'本局仅保存本机成绩'});return;
   }
   const recordStats=player.syncStats??rankingClient.getAccount?.()?.syncStats??false,publishBoard=player.autoSubmit;
   const ticket=await rankingClient.beginRun(config,clientRunId,signal,{recordStats,publishBoard});
   if(this.cancelled||signal?.aborted||rankingClient.getPlayer()?.id!==player.id)return;
   this.run={id:ticket.runId,ownerId:player.id,ticket,config,events:[],acked:0,status:'pending',autoSubmit:publishBoard,recordStats:ticket.recordStats??recordStats,publishBoard:ticket.publishBoard??publishBoard,createdAt:Date.now()};
   await store(this.run);if(this.cancelled)return;
   this.update({status:'pending',runId:ticket.runId,eligible:true,message:this.run.publishBoard?'本局参与公开排行':this.run.recordStats?'本局同步私人战绩':'本局可手动提交排行',canSubmit:false,canPublish:false});
  }catch{if(!this.cancelled&&!signal?.aborted)this.update({status:'local',message:'战绩服务暂时未连接，本局成绩保存在本机',eligible:false,canSubmit:false,canPublish:false});}
 }
 append(t:number,type:RankingEvent['type'],data:Record<string,unknown>){
  const run=this.run;if(!run||this.cancelled||this.sealed)return;
  if(run.events.length>=RANKING_LIMITS.eventTotal){this.run=null;void removeRun(run.id);this.update({status:'local',eligible:false,message:'本局记录未能完整保存，仅保留本机成绩',canSubmit:false,canPublish:false});return;}
  const requested=Math.round(Math.max(0,t)*1e6)/1e6,last=run.events.at(-1),time=Math.max(requested,last?.t??0);
  run.events.push({seq:run.events.length+1,t:time,order:last&&Math.abs(last.t-time)<1e-6?last.order+1:0,type,data:structuredClone(data)});if(t-this.lastPersist>=2){this.lastPersist=t;this.persist();}
 }
 observeControls(t:number,controls:RankingRunConfig['controls']){const run=this.run;if(!run||run.config.controls===controls||run.config.controls==='mixed')return;run.config.controls='mixed';this.append(t,'controls',{value:'mixed'});}
 observeTransmission(t:number,value:'auto'|'manual'){const run=this.run;if(!run||run.config.mode!=='dafei'||(run.config.vehicleId??'bao5')!=='bao5'||run.config.transmission===value||run.config.transmission==='mixed')return;run.config.transmission='mixed';this.append(t,'transmission',{value:'mixed'});}
 private persist(){if(!this.run)return;const copy=structuredClone(this.run);this.saving=this.saving.catch(()=>{}).then(()=>store(copy));}
 seal(summary:RankingSummary){
  if(this.sealed||this.cancelled)return;this.sealed=true;const run=this.run;if(!run)return;
  run.summary={...summary,controls:run.config.controls,transmission:run.config.transmission};run.finishedAt=Date.now();this.persist();
  const automatic=run.recordStats===true||run.autoSubmit;
  this.update({status:'pending',message:automatic?(run.publishBoard?'准备提交成绩':'准备同步私人战绩'):'本局成绩可手动提交排行',canSubmit:true});
  if(automatic&&rankingClient.getPlayer()?.id===run.ownerId)void this.submit(false);
 }
 private applyResult(result:RankingSubmission,keepAchievements=false){
  const newAchievements=result.newAchievements??(keepAchievements?this.state.newAchievements:[])??[],recorded=result.recordStats??result.recorded;
  this.update({status:result.status,published:result.published,recorded,newAchievements:[...newAchievements],canSubmit:false,canPublish:result.status==='ranked'&&result.published===false,
   message:result.status==='review'?'本局成绩正在复核':result.status==='ranked'?(result.published===false?(recorded===false?'成绩已校验，可手动发布到排行':'私人战绩已保存'):'成绩已进入排行'):result.status==='unranked'?'本局已记入个人记录，成功撤离后可上榜':'本局未进入排行'});
 }
 /** Explicit submission publishes a valid score; automatic sync keeps the ticket's privacy choice. */
 async submit(manualPublish=true){
  if(this.submitting)return this.submitting;const run=this.run;if(!run?.summary)return;
  if(this.state.canPublish&&manualPublish)return this.publish();
  if(['ranked','review','rejected','unranked'].includes(this.state.status))return;
  this.submitting=(async()=>{
   this.update({status:'uploading',message:run.publishBoard||manualPublish?'正在提交成绩':'正在同步私人战绩',canSubmit:false,canPublish:false});await this.saving;
   try{
    let result=await retryStoredRanking(run.id);
    if(rankingClient.getPlayer()?.id!==run.ownerId)throw new RankingError('请先恢复这局使用的账号。','WRONG_IDENTITY',true);
    this.applyResult(result);
    if(manualPublish&&result.status==='ranked'&&result.published===false){
     try{result=await rankingClient.publishRun(run.id);if(rankingClient.getPlayer()?.id!==run.ownerId)throw new RankingError('登录状态已改变。','CANCELLED',false);this.applyResult(result,true);}
     catch(error){if(rankingClient.getPlayer()?.id===run.ownerId)this.update({canPublish:true,message:'私人战绩已保存，公开提交暂未完成，可重试。'});}
    }
   }catch(error){const retryable=!(error instanceof RankingError)||error.retryable;this.update({status:retryable?'retry':'rejected',message:error instanceof RankingError?error.message:'未能提交成绩，本机成绩已保存',canSubmit:retryable,canPublish:false,newAchievements:[]});}
  })().finally(()=>{this.submitting=null;});return this.submitting;
 }
 async publish(){
  if(this.submitting)return this.submitting;const run=this.run;if(!run||!this.state.canPublish)return;
  this.submitting=(async()=>{try{
   if(rankingClient.getPlayer()?.id!==run.ownerId)throw new RankingError('请先恢复这局使用的账号。','WRONG_IDENTITY',true);
   this.update({canPublish:false,message:'正在发布到排行榜'});const result=await rankingClient.publishRun(run.id);
   if(rankingClient.getPlayer()?.id!==run.ownerId)throw new RankingError('登录状态已改变。','CANCELLED',false);this.applyResult(result,true);
  }catch(error){this.update({canPublish:true,message:error instanceof RankingError?error.message:'公开提交暂未完成，请重试。'});}})().finally(()=>{this.submitting=null;});return this.submitting;
 }
}export async function retryAutomaticRanking(){for(const run of await pendingRankingRuns()){if(!run.autoSubmit&&run.recordStats!==true&&run.ticket.recordStats!==true)continue;try{await retryStoredRanking(run.id);}catch{/* Keep failures available for explicit retry. */}}}

rankingClient.onIdentityDeleted(id=>{void storedRuns().then(rows=>Promise.all(rows.filter(r=>r.ownerId===id).map(r=>removeRun(r.id))));});
