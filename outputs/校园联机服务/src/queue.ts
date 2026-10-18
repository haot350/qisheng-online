import type {RoomOptions} from '../../校园逃生游戏/src/multiplayer/shared/protocol';

export interface QueueRecord {queueId:string;tokenHash:string;player:{id:string;nickname:string;shortId:string};options:RoomOptions;roomId?:string;inviteCode?:string;map:unknown;createdAt:number;status:'waiting'|'reserving'|'ready'|'cancelled'|'error';create:boolean;reservation:any;grant?:string;admitted?:boolean;error?:{code:string;message:string};}
export interface QueueStore {get:(key:string)=>Promise<string|null>;put:(key:string,value:string,ttl?:number)=>Promise<unknown>;remove:(key:string)=>Promise<unknown>;compareSwap:(key:string,expected:string,next:string|null,ttl?:number)=>Promise<boolean>;queueRemove:(id:string)=>Promise<unknown>;}
export interface ReservedQueueSeat {grant:string;reservation:any;roomId?:string;discard:()=>Promise<void>;}
const key=(id:string)=>'campus:queue:'+id;
const waiting=(row:QueueRecord)=>row.status==='waiting'||row.status==='reserving';
export function queueView(row:QueueRecord,position:number){return{queueId:row.queueId,status:row.status==='reserving'?'waiting':row.status,position,reservation:row.status==='ready'?row.reservation:undefined,error:row.error};}

export class QueueRecords {
 constructor(private store:QueueStore,private now=Date.now){}
 async read(id:string){const raw=await this.store.get(key(id));return raw?JSON.parse(raw) as QueueRecord:null;}
 private releasePlayer(row:QueueRecord){return this.store.compareSwap('campus:player-queue:'+row.player.id,row.queueId,null);}
 /** A fresh identity-authenticated ticket can replace only an unreserved wait.
  * The exact waiting CAS must lose to admission; do not cancel a new handshake.
  */
 async cancelWaitingForPlayer(id:string,playerId:string){
  const raw=await this.store.get(key(id));
  // A short-lived ready row can expire after its old lock cleanup failed.
  // Only the authenticated player's exact stale queue id may be released.
  if(!raw)return this.store.compareSwap('campus:player-queue:'+playerId,id,null);
  const row=JSON.parse(raw) as QueueRecord;
  if(row.player.id!==playerId||!['waiting','cancelled'].includes(row.status))return false;
  if(row.status==='waiting'){
   const cancelled={...row,status:'cancelled',reservation:null,error:undefined} as QueueRecord;
   if(!await this.store.compareSwap(key(id),raw,JSON.stringify(cancelled),900))return false;
  }
  // A prior cancellation may have sealed the tombstone before a transient store
  // failure interrupted cleanup. Retrying removes only this row's old lock.
  await this.store.queueRemove(id);await this.releasePlayer(row);return true;
 }
 async cancel(id:string,tokenHash:string,unadmittedOwner?:string){
  for(let attempt=0;attempt<12;attempt++){
   const raw=await this.store.get(key(id));if(!raw)return null;const row=JSON.parse(raw) as QueueRecord;if(row.tokenHash!==tokenHash||unadmittedOwner&&(row.player.id!==unadmittedOwner||row.admitted))return null;
   if(row.status!=='cancelled'){
    const cancelled={...row,status:'cancelled',reservation:null,error:undefined} as QueueRecord;
    if(!await this.store.compareSwap(key(id),raw,JSON.stringify(cancelled),900))continue;
   }
   await this.store.queueRemove(id);if(row.grant)await this.store.remove('campus:grant:'+row.grant);await this.releasePlayer(row);
   return this.read(id);
  }
  throw Error('QUEUE_CANCEL_CONFLICT');
 }
 async reserve(id:string,acquire:(row:QueueRecord)=>Promise<ReservedQueueSeat|null>){
  const raw=await this.store.get(key(id));if(!raw){await this.store.queueRemove(id);return;}
  const row=JSON.parse(raw) as QueueRecord;if(row.status!=='waiting'){if(!waiting(row))await this.store.queueRemove(id);return;}
  if(this.now()-row.createdAt>900000){await this.cancel(id,row.tokenHash);return;}
  const claimed=JSON.stringify({...row,status:'reserving'});
  if(!await this.store.compareSwap(key(id),raw,claimed,900))return;
  let seat:ReservedQueueSeat|null=null;
  try{
   seat=await acquire(row);
   if(!seat){await this.store.compareSwap(key(id),claimed,raw,900);return;}
   const ready={...row,status:'ready',roomId:seat.roomId??row.roomId,grant:seat.grant,reservation:seat.reservation} as QueueRecord;
   if(!await this.store.compareSwap(key(id),claimed,JSON.stringify(ready),30)){await seat.discard();return;}
   await this.store.queueRemove(id);await this.releasePlayer(row);
  }catch(error:any){
   if(seat)await seat.discard();
   const failed={...row,status:'error',reservation:null,error:{code:error?.code??'JOIN_UNAVAILABLE',message:error?.publicMessage??'暂时无法加入，请重试。'}};
   if(await this.store.compareSwap(key(id),claimed,JSON.stringify(failed),60)){await this.store.queueRemove(id);await this.releasePlayer(row);}
  }
 }
}

/** A blocked new-room request must not prevent later joins to an existing room. */
export async function processQueueEntries(ids:string[],visit:(id:string)=>Promise<void>,failed:()=>void){for(const id of ids){try{await visit(id);}catch{failed();}}}
