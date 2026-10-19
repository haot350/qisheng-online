import {randomBytes} from 'node:crypto';
import {RematchCapabilities} from './rematch-gate';
import type {VisibilityWorld} from '../../校园逃生游戏/src/multiplayer/shared/visibility';
import {PlayerMessageBudget} from './message-budget';
import {ServerRewindWindow} from '../../校园逃生游戏/src/multiplayer/shared/rewind';
import {QueueRoomOwnership} from './queue-room';
import {requireModeAdmission,publicAdmissionError} from './mode-admission';
import {SnapshotSendBudget} from './snapshot-budget';
import {Room,ServerError,type Client} from '@colyseus/core';import {RecipientReplicator} from '../../校园逃生游戏/src/multiplayer/shared/wire';import {authorizedSpectate} from '../../校园逃生游戏/src/multiplayer/shared/visibility';import {performance} from 'node:perf_hooks';import {RoomSimulation} from '../../校园逃生游戏/src/multiplayer/shared/simulation';import {PROTOCOL_VERSION,RULE_VERSION,COOP_RULE_VERSION,sameMap,type InputBatch,type InputCommand,type InputRebaseCommand,type RoomOptions} from '../../校园逃生游戏/src/multiplayer/shared/protocol';import {createWorld,mapIdentity} from './assets';import {authority,enqueueResult} from './authority';import {worker,put,take,get,compareSwap,randomToken} from './store';
const modeGate=(entry:string)=>authority('/internal/operations/gate?entry='+encodeURIComponent(entry));
export const activeRooms=new Map<string,CampusRoom>();
export class CampusRoom extends Room {sim!:RoomSimulation;private createdAt=new Date().toISOString();private startedAt='';private metrics:number[]=[];private lastSnapshot=0;private lastCommand=0;private latencyChallenges=new Map<string,{playerId:string;at:number}>();private replication=new Map<string,RecipientReplicator>();private spectators=new Map<string,string|null>();private resyncAt=new Map<string,number>();private instrumented=new WeakSet<Client>();private wireBytes=0;private skippedSnapshots=0;private projectionMetrics:number[]=[];private cycleHistogram=new Uint32Array(2001);private cycleCount=0;private cycleMax=0;private phaseMetrics={simulation:[] as number[],snapshot:[] as number[]};
 private rematchCapabilities=new RematchCapabilities();
 private settlementWork?:Promise<boolean>;
 private settlementAttemptAt=-Infinity;
 private resultPayload?:{resultId:string;[key:string]:any};
 private persistedResultId='';
 private rematchWork?:Promise<void>;
 private reconnectSeats=new Map<string,ReturnType<Room['allowReconnection']>>();
 private adminGeneration=randomToken().slice(0,32);
 private adminRevision=0;
 private adminSignature='';
 private queueOwnership?:QueueRoomOwnership;
 private messageBudgets=new PlayerMessageBudget();
 private controlPending?:Promise<boolean>;
 private startRequests=new Map<string,Promise<void>>();
 private sendBudgets=new Map<string,SnapshotSendBudget>();
 private rewindWindows=new Map<string,ServerRewindWindow>();
 private rewindLogAt=new Map<string,number>();
 private rewindsAccepted=0; private rewindsRejected=0;
 registerQueueReservation(id:string){if(typeof id!=='string'||id.length>100)throw Error('QUEUE_REQUIRED');this.queueOwnership?.register(id);}
 releaseQueueReservation(id:string){return this.queueOwnership?.release(id)??false;}
 async onCreate(options:{options?:RoomOptions;creatorQueueId?:string}){this.queueOwnership=new QueueRoomOwnership(options.creatorQueueId??null,()=>this.clients.length===0,()=>this.disconnect());const config:RoomOptions={...(options.options??{mode:'coop'}),variant:options.options?.variant==='ffa'?'ffa':'tdm'};await requireModeAdmission(modeGate,{mode:config.mode,variant:config.variant??'tdm'});this.maxClients=Math.max(2,Math.min(config.mode==='coop'?4:8,Math.floor(config.maxPlayers??(config.mode==='coop'?4:8))));this.maxMessagesPerSecond=180;this.sim=new RoomSimulation(this.roomId,await createWorld(),mapIdentity,config,result=>{const detail=this.sim.resultDetails();this.resultPayload={resultId:result.resultId,roomId:this.roomId,mode:result.mode,variant:result.variant,startedCount:detail.startedCount,elapsed:result.elapsed,ruleVersion:result.mode==='coop'?COOP_RULE_VERSION:RULE_VERSION,startedAt:this.startedAt||this.createdAt,endedAt:new Date().toISOString(),players:result.players.map(p=>({playerId:p.id,connectedSeconds:detail.connected.find(x=>x.id===p.id)?.connectedSeconds??0,score:result.team?.score??p.kills,kills:p.kills,deaths:p.deaths,assists:p.assists,headshots:p.headshots,revives:detail.revives.find(x=>x.id===p.id)?.count??0,rank:p.rank,downs:p.downs,damage:p.damage,won:p.won,qualified:detail.cohort.includes(p.id)&&(detail.connected.find(x=>x.id===p.id)?.connectedSeconds??0)>=result.elapsed*.8&&result.team?.eligible!==false})),team:result.team?{...result.team,won:result.won,elapsed:result.elapsed,difficulty:this.sim.difficulty,tasks:detail.tasks,ranked:!!config.ranked}:undefined};void this.persistSettlement();},randomBytes(4).readUInt32LE());
 this.sim.inviteCode=randomToken().slice(0,6).toUpperCase();await put('campus:invite:'+this.sim.inviteCode,this.roomId,86400);if(config.private)this.setPrivate(true);await this.setMetadata({title:config.title||'校园房间',mode:config.mode,variant:config.variant??'tdm',difficulty:config.difficulty??'standard',weather:this.sim.weather.preset,phase:'lobby',private:!!config.private});activeRooms.set(this.roomId,this);this.setFixedTimestep(()=>{const start=performance.now();this.sim.step(1/60);const simulatedAt=performance.now();this.phaseMetrics.simulation.push(simulatedAt-start);if(this.phaseMetrics.simulation.length>600)this.phaseMetrics.simulation.shift();if(this.metrics.length>600)this.metrics.shift();if(this.sim.tick-this.lastSnapshot>=3){this.lastSnapshot=this.sim.tick;const snapshot=this.captureSnapshot();for(const client of this.clients)this.sendSnapshot(client,false,snapshot);this.phaseMetrics.snapshot.push(performance.now()-simulatedAt);if(this.phaseMetrics.snapshot.length>200)this.phaseMetrics.snapshot.shift();}const elapsedMs=performance.now()-start;this.metrics.push(elapsedMs);this.cycleHistogram[Math.min(this.cycleHistogram.length-1,Math.ceil(elapsedMs*10))]++;this.cycleCount++;this.cycleMax=Math.max(this.cycleMax,elapsedMs);if(this.metrics.length>600)this.metrics.shift();if(this.sim.tick-this.lastCommand>=60){this.lastCommand=this.sim.tick;void this.control();}},60);
 const id=(c:Client)=>(c.auth as any).player.id;const listen=(type:string,handler:(client:Client,body:any)=>unknown)=>this.onMessage(type,(client,body)=>{if(type!=='loading'&&!this.messageBudgets.take(client,type))return;return handler(client,body);});listen('input',(c,body:InputCommand|InputBatch)=>this.receiveInput(c,body));listen('loading',(c,m)=>this.receiveLoading(c,m));listen('input-rebase',(c,m:InputRebaseCommand)=>{const playerId=id(c),now=performance.now(),key=playerId+':input-rebase';if(now-(this.resyncAt.get(key)??-Infinity)<250)return;this.resyncAt.set(key,now);if(m&&this.sim.rebaseInput(playerId,m))this.sendSnapshot(c,true);});listen('ready',(c,m)=>this.sim.ready(id(c),!!m?.ready));listen('consent',(c,m)=>this.sim.consent(id(c),!!m?.consent));listen('loadout',(c,m)=>this.sim.loadout(id(c),m?.weapon,m?.avatar,m?.team));listen('start',c=>this.requestStart(c));listen('client-capabilities',(c,m)=>{if(this.rematchCapabilities.declare(c,m))for(const member of this.clients)this.sendSnapshot(member,true);});listen('rematch',(c,m)=>this.requestRematch(c,m));listen('pause',(c,m)=>this.sim.pause(id(c),m?.agree!==false));listen('resume',c=>this.sim.resume(id(c)));listen('ping',(c,m)=>this.sim.command(id(c),'ping',m));listen('preset',(c,m)=>this.sim.command(id(c),'preset',m));listen('latency',(c,m)=>{if(!m||!Number.isFinite(m.id)||!Number.isFinite(m.sentAt))return;const nonce=randomToken();this.latencyChallenges.set(nonce,{playerId:id(c),at:performance.now()});for(const [key,v] of this.latencyChallenges)if(performance.now()-v.at>5000)this.latencyChallenges.delete(key);c.send('latency',{id:m.id,sentAt:m.sentAt,serverTick:this.sim.tick,nonce});});listen('latency-ack',(c,m)=>{const challenge=m&&this.latencyChallenges.get(m.nonce);if(!challenge||challenge.playerId!==id(c))return;this.latencyChallenges.delete(m.nonce);const rtt=performance.now()-challenge.at,p=this.sim.players.get(id(c));this.rewindWindows.get(id(c))?.recordRTT(rtt);if(p&&rtt<=5000)p.state.ping=p.state.ping?p.state.ping*.7+Math.min(500,rtt)*.3:Math.min(500,rtt);});listen('spectate',(c,m)=>{const playerId=id(c),now=performance.now();if(now-(this.resyncAt.get(playerId+':spectate')??-Infinity)<150)return;this.resyncAt.set(playerId+':spectate',now);const snapshot=this.captureSnapshot(),requested=typeof m?.targetId==='string'?m.targetId:null;this.spectators.set(playerId,authorizedSpectate(snapshot,playerId,requested));this.sendSnapshot(c,true,snapshot);});listen('resync',(c)=>{const playerId=id(c),now=performance.now();if(now-(this.resyncAt.get(playerId)??-Infinity)<500)return;this.resyncAt.set(playerId,now);this.sendSnapshot(c,true);});void this.control();}
 async onAuth(_client:Client,options:any){if(options.protocolVersion!==PROTOCOL_VERSION||!sameMap(options.map,mapIdentity))throw Error('MAP_OR_PROTOCOL_MISMATCH');const raw=await take('campus:grant:'+options.grant);if(!raw)throw Error('AUTH_GRANT_EXPIRED');const auth=JSON.parse(raw);if(auth.roomId!==this.roomId||auth.mode!==this.sim.options.mode)throw Error('AUTH_ROOM_MISMATCH');try{await requireModeAdmission(modeGate,{mode:auth.mode,variant:auth.variant??'tdm'},this.sim.options);}catch(error){const result=publicAdmissionError(error);throw new ServerError(result.status,result.message);}if(auth.queueId){const queueRaw=await get('campus:queue:'+auth.queueId),queue=queueRaw?JSON.parse(queueRaw):null;if(!queue||queue.status!=='ready'||queue.admitted||queue.grant!==options.grant)throw Error('QUEUE_CANCELLED');if(!await compareSwap('campus:queue:'+auth.queueId,queueRaw!,JSON.stringify({...queue,admitted:true}),30))throw Error('QUEUE_CANCELLED');await compareSwap('campus:player-queue:'+auth.player.id,auth.queueId,null);}else if(process.env.NODE_ENV==='production')throw Error('QUEUE_REQUIRED');if(this.sim.players.has(auth.player.id))throw Error('DUPLICATE_IDENTITY');return auth;}
 onJoin(client:Client,_options:any,auth:any){if(auth.queueId)this.queueOwnership?.consume(auth.queueId);this.sim.addPlayer(auth.player);this.sendSnapshot(client,true);void this.control();}
 onDrop(client:Client){this.rematchCapabilities.forget(client);const id=(client.auth as any).player.id;for(const [key,v] of this.latencyChallenges)if(v.playerId===id)this.latencyChallenges.delete(key);this.sim.disconnect(id);const seat=this.allowReconnection(client,60);this.reconnectSeats.set(id,seat);void seat.then(()=>{if(this.reconnectSeats.get(id)===seat)this.reconnectSeats.delete(id);},()=>{if(this.reconnectSeats.get(id)===seat)this.reconnectSeats.delete(id);});}
 onReconnect(client:Client){this.rematchCapabilities.forget(client);const id=(client.auth as any).player.id;this.sim.reconnect(id);this.rewindWindows.delete(id);this.sendSnapshot(client,true);}
 onLeave(client:Client){this.rematchCapabilities.forget(client);this.messageBudgets.release(client);const id=(client.auth as any).player.id;this.sim.removePlayer(id);this.replication.delete(id);this.sendBudgets.delete(id);this.rewindWindows.delete(id);this.rewindLogAt.delete(id);this.spectators.delete(id);this.resyncAt.delete(id);this.resyncAt.delete(id+':spectate');this.resyncAt.delete(id+':input-rebase');void this.control();}
 async onDispose(){if(this.resultPayload&&this.persistedResultId!==this.resultPayload.resultId)await this.persistSettlement();this.reconnectSeats.clear();this.startRequests.clear();this.queueOwnership?.dispose();activeRooms.delete(this.roomId);this.replication.clear();this.sendBudgets.clear();this.rewindWindows.clear();this.rewindLogAt.clear();this.spectators.clear();this.resyncAt.clear();this.latencyChallenges.clear();if(!this.sim)return;try{await authority('/internal/multiplayer/rooms/upsert','POST',{roomId:this.roomId,worker,mode:this.sim.options.mode,variant:this.sim.options.variant,state:'closed',players:[],maxPlayers:this.maxClients,createdAt:this.createdAt,generation:this.adminGeneration});}catch{}this.sim.dispose();}

 private captureSnapshot(){const snapshot=this.sim.snapshot();snapshot.rematchStatus=this.sim.phase!=='ended'?'unavailable':!this.allSupportRematch()?'unsupported':this.persistedResultId!==this.sim.result?.resultId?'saving':this.sim.maintenance?'unavailable':'ready';snapshot.rematchAvailable=snapshot.rematchStatus==='ready';snapshot.events=[...this.sim.events];return snapshot;}
 private sendSnapshot(client:Client,forceFull=false,snapshot=this.captureSnapshot(),visibilityWorld:VisibilityWorld=this.sim.world){
  const id=(client.auth as any)?.player?.id;if(!id)return;
  if(!this.instrumented.has(client)){const send=client.raw.bind(client);client.raw=(data,options,cb)=>{this.wireBytes+=data.byteLength;send(data,options,cb);};this.instrumented.add(client);}
  let budget=this.sendBudgets.get(id);if(!budget){budget=new SnapshotSendBudget();this.sendBudgets.set(id,budget);}
  const admission=budget.admit(Number((client.ref as any).bufferedAmount)||0,forceFull);
  if(!admission){this.skippedSnapshots++;return;}
  let replication=this.replication.get(id);if(!replication){replication=new RecipientReplicator(id);this.replication.set(id,replication);}
  const requested=this.spectators.get(id)??null,spectatingId=authorizedSpectate(snapshot,id,requested);this.spectators.set(id,spectatingId);
  const message=replication.build(snapshot,visibilityWorld,{spectatingId,forceFull:admission.forceFull});
  this.projectionMetrics.push(replication.diagnostics.visibilityMs);if(this.projectionMetrics.length>600)this.projectionMetrics.shift();
  if(message){client.send('snapshot',message);this.rewindFor(id).recordSnapshot(snapshot.tick,performance.now());budget.committed();}
 }
 private rewindFor(id:string){let window=this.rewindWindows.get(id);if(!window){window=new ServerRewindWindow();this.rewindWindows.set(id,window);}return window;}
 private receiveLoading(client:Client,body:any){
  if(!body?.map||!sameMap(body.map,mapIdentity)){client.send('error',{code:'MAP_MISMATCH',message:'校园地图已更新，请刷新游戏',retryable:false});return;}
  const id=(client.auth as any).player.id;
  if(!this.messageBudgets.take(client,'loading')){
   if(!this.sim.applyLoading(id,body,false))return;
   if(this.messageBudgets.retry(client))client.send('loading-retry',{epoch:this.sim.players.get(id)?.state.loadingEpoch??body.epoch,retryAfterMs:100});
   return;
  }
  this.sim.applyLoading(id,body);
 }
 private receiveInput(client:Client,body:InputCommand|InputBatch){
  const id=(client.auth as any)?.player?.id;if(!id)return;
  const now=performance.now(),window=this.rewindFor(id),commands=Array.isArray((body as InputBatch)?.commands)?(body as InputBatch).commands:[body as InputCommand];
  const guarded=commands.slice(0,4).map(command=>{
   if(!command||typeof command!=='object')return command;
   const decision=window.authorize(command.renderTick,this.sim.tick,now);
   if(decision.accepted)this.rewindsAccepted++;else if(command.fire){this.rewindsRejected++;if(now-(this.rewindLogAt.get(id)??-Infinity)>=60000){this.rewindLogAt.set(id,now);console.warn(JSON.stringify({code:'REWIND_TIME_REJECTED',roomId:this.roomId,playerId:id,reason:decision.reason}));}}
   return {...command,renderTick:decision.tick};
  });
  this.sim.input(id,guarded.filter(command=>Number.isSafeInteger(command.inputEpoch)));
 }
 private allSupportRematch(){return this.rematchCapabilities.allows([...this.sim.players.values()].map(p=>({id:p.state.id,connected:p.state.connected})),this.clients.map(connection=>({connection,playerId:(connection.auth as any)?.player?.id})));}
 private persistSettlement():Promise<boolean>{
  const payload=this.resultPayload;if(!payload)return Promise.resolve(false);
  if(this.persistedResultId===payload.resultId)return Promise.resolve(true);
  if(this.settlementWork)return this.settlementWork;
  this.settlementAttemptAt=performance.now();
  const work=enqueueResult(payload).then(()=>{this.persistedResultId=payload.resultId;return true;},()=>{console.error(JSON.stringify({code:'RESULT_OUTBOX_WRITE',roomId:this.roomId}));return false;});
  this.settlementWork=work;void work.finally(()=>{if(this.settlementWork===work)this.settlementWork=undefined;});return work;
 }
 private requestRematch(client:Client,body:unknown):Promise<void>{
  if(this.rematchWork)return this.rematchWork;
  const resultId=(body as {resultId?:unknown})?.resultId;
  if(typeof resultId!=='string'||resultId.length>300||this.sim.phase!=='ended'||this.sim.result?.resultId!==resultId)return Promise.resolve();
  const task=(async()=>{
   if(!this.clients.includes(client)||!this.allSupportRematch()){client.send('error',{code:'REMATCH_UNSUPPORTED',message:'当前房间暂不支持续局，请返回大厅重新组队。',retryable:false});return;}
   if(!await this.control()){client.send('error',{code:'CONTROL_UNAVAILABLE',message:'暂时无法返回房间准备，请稍后再试。',retryable:true});return;}
   try{await requireModeAdmission(modeGate,this.sim.options);}catch(error){const result=publicAdmissionError(error);client.send('error',{code:result.code,message:result.message,retryable:result.code!=='MODE_DISABLED'});return;}
   if(!await this.persistSettlement()){client.send('error',{code:'RESULT_SAVE_PENDING',message:'本局结果尚未保存，请稍后再试。',retryable:true});return;}
   if(!this.clients.includes(client)||!this.allSupportRematch()||this.sim.phase!=='ended'||this.sim.result?.resultId!==resultId)return;
   if(!this.sim.returnToLobby((client.auth as any).player.id,resultId)){client.send('error',{code:'REMATCH_UNAVAILABLE',message:'暂时无法开始新一局，请返回大厅重试。',retryable:true});return;}
   this.startedAt='';this.resultPayload=undefined;this.persistedResultId='';this.rewindWindows.clear();this.spectators.clear();
   this.adminGeneration=randomToken().slice(0,32);this.adminRevision=0;this.adminSignature='';
   if(this.locked)await this.unlock();await this.setMetadata({...this.metadata,phase:'lobby',occupancy:this.sim.occupantCount});
   for(const member of this.clients)this.sendSnapshot(member,true);void this.control();
  })().catch(()=>{if(this.clients.includes(client))client.send('error',{code:'REMATCH_UNAVAILABLE',message:'暂时无法返回房间准备，请稍后重试。',retryable:true});});
  this.rematchWork=task;void task.finally(()=>{if(this.rematchWork===task)this.rematchWork=undefined;});return task;
 }
 private requestStart(client:Client){
  const id=(client.auth as any).player.id,pending=this.startRequests.get(id);
  if(pending)return pending;
  if(this.sim.phase!=='lobby')return Promise.resolve();
  const task=(async()=>{try{
   if(!await this.control()){client.send('error',{code:'CONTROL_UNAVAILABLE',message:'暂时无法开始本局，请稍后再试。',retryable:true});return;}
   if(this.sim.phase!=='lobby'||!this.clients.includes(client))return;
   try{await requireModeAdmission(modeGate,this.sim.options);}catch(error){const result=publicAdmissionError(error);client.send('error',{code:result.code,message:result.message,retryable:result.code!=='MODE_DISABLED'});return;}
   if(this.sim.phase!=='lobby'||!this.clients.includes(client))return;
   if(this.sim.start(id)){this.startedAt=new Date().toISOString();if(this.sim.options.mode==='coop')this.lock();void this.setMetadata({...this.metadata,phase:this.sim.phase});}
   else client.send('error',{code:'NOT_READY',message:this.sim.maintenance?'服务正在更新，请稍后开始。':'请等待队员准备完成',retryable:true});
  }finally{this.startRequests.delete(id);}})();
  this.startRequests.set(id,task);return task;
 }
 private control(){if(this.controlPending)return this.controlPending;const pending=this.refreshControl();this.controlPending=pending;void pending.finally(()=>{if(this.controlPending===pending)this.controlPending=undefined;});return pending;}
 private controlMembers(){return [...this.sim.players.values()].map(p=>({playerId:p.state.id,nickname:p.state.nickname,connected:p.state.connected,ready:p.state.ready,loading:p.state.loading,team:p.state.team}));}
 private controlSignature(){return JSON.stringify([this.sim.phase,this.controlMembers()]);}
 private async refreshControl(){
  try{
   if(this.sim.phase==='ended'&&this.resultPayload&&this.persistedResultId!==this.resultPayload.resultId&&!this.settlementWork&&performance.now()-this.settlementAttemptAt>=5000)void this.persistSettlement();
   const h=this.health(),members=this.controlMembers(),signature=this.controlSignature();
   const state=await authority('/internal/multiplayer/rooms/upsert','POST',{
    roomId:this.roomId,worker,mode:this.sim.options.mode,variant:this.sim.options.variant,state:this.sim.phase,
    generation:this.adminGeneration,controlVersion:1,players:members,maxPlayers:this.maxClients,createdAt:this.createdAt,
    name:this.sim.options.title,private:!!this.sim.options.private,difficulty:this.sim.difficulty,elapsed:this.sim.elapsed,
    protocolVersion:PROTOCOL_VERSION,map:mapIdentity,
    health:{tickP95:h.tickP95,tickP99:h.tickP99,cycleP95:h.completeCycle.p95,cycleP99:h.completeCycle.p99,memoryBytes:h.memoryBytes,inputAgeTicks:h.input.maxAgeTicks,bufferedBytes:h.wire.bufferedBytes}
   });
   this.adminRevision=state.revision;this.adminSignature=signature;
   const result=await authority('/internal/multiplayer/rooms/'+encodeURIComponent(this.roomId)+'/commands?controlVersion=1&generation='+encodeURIComponent(this.adminGeneration));
   this.sim.maintenance=!!result.maintenance;await put('campus:maintenance',String(!!result.maintenance),30);
   for(const command of result.commands??[]){
    if(command.generation!==this.adminGeneration||command.revision!==this.adminRevision)continue;
    const path='/internal/multiplayer/rooms/'+encodeURIComponent(this.roomId)+'/commands/'+encodeURIComponent(command.id);
    const claim=await authority(path+'/claim','POST',{generation:this.adminGeneration,revision:this.adminRevision});
    if(!claim.execute)continue;
    let outcome='noop',closing=false;
    if(Date.now()<claim.expires&&this.adminSignature===this.controlSignature()){
     if(command.action==='kick'||command.action==='temp-ban'){
      const player=this.sim.players.get(command.playerId);
      if(player){this.reconnectSeats.get(command.playerId)?.reject(new Error('ROOM_MEMBERSHIP_ENDED'));this.reconnectSeats.delete(command.playerId);this.sim.removePlayer(command.playerId);const client=this.clients.find(c=>(c.auth as any).player.id===command.playerId);client?.leave(4000,'已离开房间');outcome='executed';}
     }else if(command.action==='close'){
      this.sim.phase='draining';this.broadcast('error',{code:'ROOM_CLOSED',message:'房间已关闭',retryable:false});outcome='executed';closing=true;
     }
    }
    // A receipt reports the actual mutation, never just receipt of a command.
    try{await authority(path+'/ack','POST',{generation:this.adminGeneration,state:outcome});}
    finally{if(closing)void this.disconnect();}
   }
   if(this.metadata.phase!==this.sim.phase||this.metadata.occupancy!==this.sim.occupantCount)await this.setMetadata({...this.metadata,phase:this.sim.phase,occupancy:this.sim.occupantCount});
   return true;
  }catch{console.error(JSON.stringify({code:'CONTROL_API_UNAVAILABLE',roomId:this.roomId}));return false;}
 }
 health(){const sorted=[...this.metrics].sort((a,b)=>a-b),cyclePercentile=(ratio:number)=>{const target=Math.ceil(this.cycleCount*ratio);if(!target)return 0;let total=0;for(let i=0;i<this.cycleHistogram.length;i++){total+=this.cycleHistogram[i];if(total>=target)return i/10;}return this.cycleMax;};const p95=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length*.95)]??0;};return{phases:{simulationP95:p95(this.phaseMetrics.simulation),snapshotP95:p95(this.phaseMetrics.snapshot)},input:{maxAgeTicks:Math.max(0,...[...this.sim.players.values()].map(p=>p.timeline.receipt(this.sim.tick).inputAgeTicks)),maxQueueDepth:Math.max(0,...[...this.sim.players.values()].map(p=>p.timeline.depth))},completeCycle:{count:this.cycleCount,p95:cyclePercentile(.95),p99:cyclePercentile(.99),max:this.cycleMax,resolutionMs:.1,overflowBinMs:200},rooms:activeRooms.size,players:[...activeRooms.values()].reduce((n,r)=>n+r.sim.occupantCount,0),tickP95:sorted[Math.floor(sorted.length*.95)]??0,tickP99:sorted[Math.floor(sorted.length*.99)]??0,memoryBytes:process.memoryUsage().rss,rewind:{accepted:this.rewindsAccepted,rejected:this.rewindsRejected},visibilityQueries:this.sim.world.visibilityQueryStats?.(),wire:{encodedPayloadBytes:this.wireBytes,skippedSnapshots:this.skippedSnapshots,bufferedBytes:this.clients.reduce((sum,c)=>sum+(Number((c.ref as any).bufferedAmount)||0),0),projectionP95:[...this.projectionMetrics].sort((a,b)=>a-b)[Math.floor(this.projectionMetrics.length*.95)]??0}};}
}
