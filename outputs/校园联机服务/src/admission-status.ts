export interface AdmissionWorker {healthy:boolean;rooms:number;players:number;}
export interface AdmissionState {
 maintenance:boolean;draining:boolean;memAvailable:number;cpuPercent:number;
 workers:readonly AdmissionWorker[];maxRooms:number;maxPlayers:number;queued?:number;
}
export interface AdmissionSummary {canCreate:boolean;reason:'ready'|'maintenance'|'capacity'|'busy'|'warming';queued:number;}

/** The status page and queue use the same existing admission thresholds. */
export function admissionSummary(state:AdmissionState):AdmissionSummary{
 const queued=state.queued??0,all=state.workers;
 if(state.maintenance||state.draining)return {canCreate:false,reason:'maintenance',queued};
 if(all.reduce((count,worker)=>count+worker.players,0)>=state.maxPlayers||all.length>0&&all.every(worker=>worker.rooms>=state.maxRooms))return {canCreate:false,reason:'capacity',queued};
 if(!all.length)return {canCreate:false,reason:'warming',queued};
 const available=state.memAvailable>=1073741824&&state.cpuPercent<=70&&all.some(worker=>worker.healthy&&worker.rooms<state.maxRooms);
 return {canCreate:available,reason:available?'ready':'busy',queued};
}
