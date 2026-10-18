import type {QueueRecords} from './queue';
interface AdmissionOwner {playerId:string;mode:'coop'|'pvp';variant:'tdm'|'ffa';}
interface RequestRecord extends AdmissionOwner {queueId:string;createdAt:number;state:'pending'|'cancelled'|'admitted';clearAfter?:number;}
interface RequestStore {get:(key:string)=>Promise<string|null>;claim:(key:string,value:string,ttl:number)=>Promise<boolean>;compareSwap:(key:string,expected:string,next:string|null,ttl:number)=>Promise<boolean>;}
const TTL=900;
export const validAdmissionId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const key=(owner:AdmissionOwner,id:string)=>'campus:admission-request:'+owner.playerId+':'+id;
const sameOwner=(row:AdmissionOwner,owner:AdmissionOwner)=>row.playerId===owner.playerId&&row.mode===owner.mode&&row.variant===owner.variant;
/** Only an authenticated owner can seal their exact request. Tokens never leave the queue. */
export class AdmissionRequests {
 constructor(private store:RequestStore,private queues:QueueRecords,private release:(roomId:string,queueId:string)=>Promise<unknown>,private now=Date.now){}
 async begin(owner:AdmissionOwner,id:string,queueId:string){return this.store.claim(key(owner,id),JSON.stringify({...owner,queueId,createdAt:this.now(),state:'pending'}),TTL);}
 async current(owner:AdmissionOwner,id:string,queueId:string){const raw=await this.store.get(key(owner,id));if(!raw)return false;const row=JSON.parse(raw) as RequestRecord;return sameOwner(row,owner)&&row.queueId===queueId&&row.state==='pending';}
 async reconcile(owner:AdmissionOwner,id:string):Promise<{cleared:boolean;retryAfterMs?:number;active?:boolean}>{
  for(let attempt=0;attempt<8;attempt++){
   const index=key(owner,id),raw=await this.store.get(index);
   if(!raw){if(await this.store.claim(index,JSON.stringify({...owner,queueId:'',createdAt:this.now(),state:'cancelled'}),TTL))return{cleared:true};continue;}
   const row=JSON.parse(raw) as RequestRecord;if(!sameOwner(row,owner))return{cleared:false,active:true};
   if(row.state==='admitted')return{cleared:false,active:true};
   const queue=row.queueId?await this.queues.read(row.queueId):null;
   if(queue&&(queue.player.id!==owner.playerId||queue.admitted))return{cleared:false,active:true};
   const clearAfter=row.clearAfter??(!queue&&row.state==='pending'?row.createdAt+60000:0);
   const sealed=JSON.stringify({...row,state:'cancelled',clearAfter});
   if(!await this.store.compareSwap(index,raw,sealed,TTL))continue;
   if(queue){
    const cancelled=await this.queues.cancel(queue.queueId,queue.tokenHash,owner.playerId);
    if(!cancelled){const current=await this.queues.read(queue.queueId);if(current?.admitted){await this.store.compareSwap(index,sealed,JSON.stringify({...row,state:'admitted'}),TTL);return{cleared:false,active:true};}}
    else if(cancelled.roomId)await this.release(cancelled.roomId,cancelled.queueId);
   }
   if(clearAfter>this.now())return{cleared:false,retryAfterMs:clearAfter-this.now()};
   return{cleared:true};
  }
  return{cleared:false,retryAfterMs:1000};
 }
}
