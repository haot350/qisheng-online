import { distance,eyeAt } from './combat';
import type { GameEvent,PlayerState,RoomSnapshot,Vec3 } from './protocol';
import { RecipientVisibility,authorizedSpectate,geometryVisible,sameSide,type VisibilityWorld } from './visibility';

import type { EntityDelta,Patch,ProjectedRoom,PublicRosterEntry,RecipientSnapshot,RoomWireMessage,VisibleNpc,VisiblePlayer,WireRoom } from '@qisheng/shared/protocol';
import { ROOM_WIRE_VERSION } from '@qisheng/shared/protocol';
export { ROOM_WIRE_VERSION } from '@qisheng/shared/protocol';
export type { DeltaRoomWire,FullRoomWire,PublicRosterEntry,RecipientSnapshot,RoomWireMessage,VisibleNpc,VisiblePlayer } from '@qisheng/shared/protocol';
// Wire values contain only plain records, arrays and primitives. Keep copies
// private to their recipient without allocating serialized comparison strings.
const clone=<T>(value:T):T=>{
 if(Array.isArray(value))return value.map(v=>clone(v)) as T;
 if(value!==null&&typeof value==='object'){const out:Record<string,unknown>={};for(const key of Object.keys(value)){const item=clone((value as Record<string,unknown>)[key]);if(key==='__proto__')Object.defineProperty(out,key,{value:item,enumerable:true,writable:true,configurable:true});else out[key]=item;}return out as T;}
 return value;
};
const equal=(a:unknown,b:unknown):boolean=>{
 if(Object.is(a,b))return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>equal(value,b[index]));
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left),other=Object.keys(right);
 return keys.length===other.length&&keys.every(key=>Object.hasOwn(right,key)&&equal(left[key],right[key]));
};
function diff<T extends object>(old:T,next:T):Patch<T>|undefined {
 const set:Partial<T>={},unset:string[]=[];
 for(const key of Object.keys(next) as (keyof T)[])if(!equal(old[key],next[key])){if(next[key]===undefined)unset.push(String(key));else set[key]=clone(next[key]);}
 for(const key of Object.keys(old))if(!(key in next))unset.push(key);
 return Object.keys(set).length||unset.length?{set,...(unset.length?{unset}:{})}:undefined;
}
function apply<T extends object>(old:T,patch:Patch<T>|undefined):T {if(!patch)return old;const next={...old,...clone(patch.set)};for(const key of patch.unset??[])delete (next as Record<string,unknown>)[key];return next;}
const sameVector=(a:Vec3,b:Vec3)=>a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2];
const playerFields=['id','yaw','pitch','grounded','crouched','life','weapon','aim','sprinting','sliding','generation','loading','loadingEpoch','carryingTask','health','protectionLeft'] as const satisfies readonly (keyof VisiblePlayer)[];
const npcFields=['id','identity','generation','yaw','aimPitch','pose','aim','firing','reloading','weapon','active','bob','actualSpeed'] as const satisfies readonly (keyof VisibleNpc)[];
const samePlayer=(a:VisiblePlayer,b:VisiblePlayer)=>sameVector(a.position,b.position)&&sameVector(a.velocity,b.velocity)&&playerFields.every(key=>Object.is(a[key],b[key]))&&equal(a.weaponAction,b.weaponAction);
const sameNpc=(a:VisibleNpc,b:VisibleNpc)=>sameVector(a.position,b.position)&&npcFields.every(key=>Object.is(a[key],b[key]))&&equal(a.weaponAction,b.weaponAction);
function entities<T extends {id:string}>(old:T[],next:T[],same:(a:T,b:T)=>boolean):EntityDelta<T>{const previous=new Map(old.map(p=>[p.id,p])),present=new Set(next.map(p=>p.id));return{upsert:next.filter(p=>{const before=previous.get(p.id);return !before||!same(before,p);}).map(clone),remove:old.filter(p=>!present.has(p.id)).map(p=>p.id)};}
function mergeEntities<T extends {id:string}>(old:T[],delta:EntityDelta<T>){const values=new Map(old.map(p=>[p.id,p]));for(const id of delta.remove)values.delete(id);for(const value of delta.upsert)values.set(value.id,clone(value));return [...values.values()];}

export function roomRoster(room:RoomSnapshot):PublicRosterEntry[]{return (room as Partial<RecipientSnapshot>).roster??room.players.map(p=>rosterEntry(p,true));}
function rosterEntry(p:PlayerState,ally:boolean):PublicRosterEntry{return{id:p.id,nickname:p.nickname,shortId:p.shortId,avatar:p.avatar,team:p.team,ready:p.ready,rankConsent:p.rankConsent,connected:p.connected,departed:p.departed,loading:p.loading,life:p.life,weapon:p.weapon,primaryWeapon:p.primaryWeapon,kills:p.kills,deaths:p.deaths,assists:p.assists,downs:p.downs,headshots:p.headshots,ping:Math.round(p.ping),...(ally?{health:p.health,reviveLeft:p.reviveLeft,respawnLeft:p.respawnLeft}:{})};}
function playerEntity(p:PlayerState,ally:boolean):VisiblePlayer{return{id:p.id,position:[...p.position],yaw:p.yaw,pitch:p.pitch,velocity:[...p.velocity],grounded:p.grounded,crouched:p.crouched,life:p.life,weapon:p.weapon,weaponAction:clone(p.weaponAction),aim:p.aim,sprinting:p.sprinting,sliding:p.sliding,generation:p.generation,loading:p.loading,loadingEpoch:p.loadingEpoch,carryingTask:p.carryingTask,...(ally?{health:p.health,protectionLeft:p.protectionLeft}:{})};}
function bearing(observer:PlayerState,source:Vec3){const angle=Math.atan2(-(source[0]-observer.position[0]),-(source[2]-observer.position[2]));return Math.round(angle/(Math.PI/8))*(Math.PI/8);}
const validPoint=(p:unknown):p is Vec3=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);

/** One instance per connection: only recipient-authorized data reaches its encoder. */
export class RecipientReplicator {
 private visibility=new RecipientVisibility();private previous:ProjectedRoom|null=null;private serial=0;private lastFullTick=-Infinity;private deliveredEvent=0;private sourceEvent=-1;
 readonly diagnostics={messages:0,full:0,deltas:0,visibilityMs:0};
 constructor(readonly viewerId:string){}
 reset(){this.previous=null;this.visibility.reset();this.lastFullTick=-Infinity;this.deliveredEvent=0;this.sourceEvent=-1;}
 project(snapshot:RoomSnapshot,world:VisibilityWorld,requestedSpectate:string|null=null):ProjectedRoom|null {
  const self=snapshot.players.find(p=>p.id===this.viewerId);if(!self)return null;
  const spectatingId=authorizedSpectate(snapshot,this.viewerId,requestedSpectate),observer=snapshot.players.find(p=>p.id===spectatingId)??self,allowed=new Set([self.id]);
  const players=snapshot.players.filter(p=>p.id!==self.id&&!p.departed&&(sameSide(snapshot,self,p)||!p.loading&&p.life!=='respawning'&&p.life!=='eliminated'&&this.visibility.permits(world,observer,p,snapshot.smokes,snapshot.tick))).map(p=>{allowed.add(p.id);return playerEntity(p,sameSide(snapshot,self,p));});
  const npcs:VisibleNpc[]=snapshot.npcs.filter(n=>n.active&&n.health>0&&this.visibility.permits(world,observer,this.visibility.npcSubject(n,snapshot.tick),snapshot.smokes,snapshot.tick)).map(n=>{allowed.add(n.id);const {health,targetId,...visible}=n;return clone(visible);});
  const {players:_players,npcs:_npcs,events:_events,eventSerial:_eventSerial,...globals}=snapshot;
  const room:WireRoom={...globals,drops:snapshot.drops.filter(d=>this.visibility.point(world,observer,[d.position[0],d.position[1]+.2,d.position[2]],snapshot.smokes,.3)).map(clone),gadgets:(snapshot.gadgets??[]).map(g=>({...g,position:[...g.position],usedBy:g.usedBy.includes(self.id)?[self.id]:[]})),projectiles:(snapshot.projectiles??[]).filter(g=>this.visibility.point(world,observer,g.position,snapshot.smokes,.15)).map(g=>({...clone(g),ownerId:allowed.has(g.ownerId)?g.ownerId:''})),supplies:snapshot.supplies.map(s=>({...s,position:[...s.position],usedBy:s.usedBy.includes(self.id)?[self.id]:[]})),smokes:snapshot.smokes.filter(s=>distance(observer.position,s.position)<s.radius+1||this.visibility.point(world,observer,s.position,[],s.radius)).map(clone)};
  const events:GameEvent[]=[];
  for(const event of snapshot.events){if(event.serial<=this.sourceEvent||this.sourceEvent<0&&event.tick<snapshot.tick-3)continue;const filtered=this.event(event,snapshot,world,self,observer,allowed);if(!filtered)continue;events.push({...filtered,serial:++this.deliveredEvent});}
  this.sourceEvent=snapshot.eventSerial;
  return{room:clone(room),roster:snapshot.players.map(p=>rosterEntry(p,p.id===self.id||sameSide(snapshot,self,p))),self:clone(self),players,npcs,spectatingId,events,eventSerial:this.deliveredEvent};
 }
 private event(event:GameEvent,snapshot:RoomSnapshot,world:VisibilityWorld,self:PlayerState,observer:PlayerState,allowed:Set<string>):GameEvent|null {
  const data=event.data??{},actor=snapshot.players.find(p=>p.id===event.actorId),ally=!!actor&&sameSide(snapshot,self,actor),own=event.actorId===self.id,visible=!!event.actorId&&allowed.has(event.actorId),base={serial:event.serial,tick:event.tick,type:event.type,actorId:event.actorId,targetId:event.targetId};
  if(event.type==='shot'){
   const muzzleVisible=!own&&visible&&!!event.position&&this.visibility.point(world,observer,event.position,snapshot.smokes,.05);
   if(own||visible&&muzzleVisible){const ends=Array.isArray(data.ends)?data.ends.filter((end:unknown)=>validPoint(end)&&(own||this.visibility.point(world,observer,end,snapshot.smokes,.05))):[];return{...base,position:event.position?[...event.position]:undefined,data:{weapon:data.weapon,shotId:data.shotId,generation:data.generation,ends:clone(ends),direction:clone(data.direction),...(own?{hits:clone(data.hits),clientShotSeq:data.clientShotSeq}:{})}};}
   if(!event.position||distance(observer.position,event.position)>65)return null;
   return{serial:event.serial,tick:event.tick,type:'sound',data:{kind:'shot',weapon:data.weapon,bearing:bearing(observer,event.position),distanceBand:distance(observer.position,event.position)<15?'near':distance(observer.position,event.position)<35?'mid':'far',occluded:!geometryVisible(world,eyeAt(observer.position,observer.crouched),event.position)}};
  }
  if(event.type==='hit'){
   if(!own&&event.targetId!==self.id)return null;
   const source=validPoint(data.sourcePosition)?data.sourcePosition:null;
   return{...base,data:{damage:data.damage,headshot:data.headshot,...(event.targetId===self.id&&source?{bearing:bearing(observer,source)}:{})}};
  }
  if(event.type==='death'||event.type==='down')return{...base,data:{headshot:data.headshot,generation:data.generation}};
  if(event.type==='ping'||event.type==='preset'){if(!own&&!ally)return null;return{...base,position:event.position?[...event.position]:undefined,data:event.type==='preset'?{id:data.id}:undefined};}
  if(event.type==='gadget'){if(!own)return null;return{...base,data:{gadget:data.gadget,action:data.action,left:data.left,damage:data.damage}};}
  if(event.type==='explosion'){if(!event.position)return null;if(!this.visibility.point(world,observer,event.position,snapshot.smokes,.4)){if(distance(observer.position,event.position)>65)return null;return{serial:event.serial,tick:event.tick,type:'sound',data:{kind:'explosion',bearing:bearing(observer,event.position),distanceBand:distance(observer.position,event.position)<15?'near':distance(observer.position,event.position)<35?'mid':'far'}};}return{...base,actorId:visible||own?event.actorId:undefined,position:[...event.position],data:{radius:data.radius}};}
  if(event.type==='notice'){if(event.actorId&&!own&&!ally&&!visible)return null;return{...base,data:{text:data.text,message:data.message}};}
  if(event.type==='result')return{...base,data:{result:clone(snapshot.result)}};
  if(event.type==='pause')return base;
  if(event.type==='task'&&snapshot.mode==='coop')return{...base,data:{action:data.action,taskId:data.taskId}};
  if(event.type==='drop'&&snapshot.mode==='coop'&&data.taskId)return{...base,position:event.position?[...event.position]:undefined,data:{taskId:data.taskId}};
  if(event.type==='revive'||event.type==='respawn'){if(!own&&!ally&&!visible)return null;return{...base,...(event.position&&(!event.actorId||allowed.has(event.actorId))?{position:[...event.position] as Vec3}:{})};}
  if(event.type==='pickup'||event.type==='drop'||event.type==='smoke'){
   if(!own&&(!event.position||!this.visibility.point(world,observer,event.position,snapshot.smokes,event.type==='smoke'?5:.3)))return null;
   return{...base,actorId:visible||own?event.actorId:undefined,position:event.position?[...event.position]:undefined,data:{weapon:data.weapon,...(own?{supply:data.supply,action:data.action,gadget:data.gadget}:{})}};
  }
  return null;
 }
 build(snapshot:RoomSnapshot,world:VisibilityWorld,options:{spectatingId?:string|null;forceFull?:boolean}={}):RoomWireMessage|null {
  const start=performance.now(),next=this.project(snapshot,world,options.spectatingId??null);this.diagnostics.visibilityMs=performance.now()-start;if(!next)return null;
  const seq=++this.serial,force=options.forceFull||!this.previous||snapshot.tick-this.lastFullTick>=120||this.previous.spectatingId!==next.spectatingId;
  let message:RoomWireMessage;
  if(force){message={wireVersion:ROOM_WIRE_VERSION,kind:'full',seq,roomId:snapshot.roomId,viewerId:this.viewerId,...clone(next)};this.lastFullTick=snapshot.tick;this.diagnostics.full++;}
  else {const old=this.previous!;message={wireVersion:ROOM_WIRE_VERSION,kind:'delta',seq,baseSeq:seq-1,roomId:snapshot.roomId,viewerId:this.viewerId,room:diff(old.room,next.room),roster:equal(old.roster,next.roster)?undefined:clone(next.roster),self:diff(old.self,next.self),players:entities(old.players,next.players,samePlayer),npcs:entities(old.npcs,next.npcs,sameNpc),spectatingId:next.spectatingId,events:clone(next.events),eventSerial:next.eventSerial};this.diagnostics.deltas++;}
  this.previous=next;this.diagnostics.messages++;return message;
 }
}

function compatibleRemote(entity:VisiblePlayer,roster:PublicRosterEntry|undefined):PlayerState {
 return {...clone(entity),nickname:roster?.nickname??'',shortId:roster?.shortId??'',avatar:roster?.avatar??'campus-a',team:roster?.team??'none',ready:roster?.ready??false,rankConsent:roster?.rankConsent??false,connected:roster?.connected??false,departed:roster?.departed,health:entity.health??100,stamina:0,ammo:0,reserve:0,ack:0,kills:roster?.kills??0,deaths:roster?.deaths??0,assists:roster?.assists??0,downs:roster?.downs??0,headshots:roster?.headshots??0,damageTaken:0,reviveLeft:roster?.reviveLeft??0,respawnLeft:roster?.respawnLeft??0,protectionLeft:entity.protectionLeft??0,ping:roster?.ping??0,smokes:0};
}
/** Reconstructs only authorized entities. A roster row never creates a position. */
export class WireDecoder {
 private state:ProjectedRoom|null=null;sequence=0;private roomId='';private viewerId='';
 reset(){this.state=null;this.sequence=0;this.roomId='';this.viewerId='';}
 accept(message:RoomWireMessage):{snapshot:RecipientSnapshot|null;needsResync:boolean}{
  if(!message||message.wireVersion!==ROOM_WIRE_VERSION||!Number.isSafeInteger(message.seq)||message.seq<1)return{snapshot:null,needsResync:true};
  if(message.seq<=this.sequence)return{snapshot:null,needsResync:false};
  if(message.kind==='full'){
   if(!message.self||message.self.id!==message.viewerId||message.room.roomId!==message.roomId)return{snapshot:null,needsResync:true};
   this.state=clone({room:message.room,roster:message.roster,self:message.self,players:message.players,npcs:message.npcs,spectatingId:message.spectatingId,events:message.events,eventSerial:message.eventSerial});this.roomId=message.roomId;this.viewerId=message.viewerId;
  }else if(message.kind==='delta'){
   if(!this.state||message.baseSeq!==this.sequence||message.roomId!==this.roomId||message.viewerId!==this.viewerId)return{snapshot:null,needsResync:true};
   const state=this.state;this.state={room:apply(state.room,message.room),roster:message.roster?clone(message.roster):state.roster,self:apply(state.self,message.self),players:mergeEntities(state.players,message.players),npcs:mergeEntities(state.npcs,message.npcs),spectatingId:message.spectatingId,events:clone(message.events),eventSerial:message.eventSerial};
  }else return{snapshot:null,needsResync:true};
  this.sequence=message.seq;const state=this.state!,byId=new Map(state.roster.map(p=>[p.id,p]));
  return{snapshot:{...clone(state.room),players:[clone(state.self),...state.players.map(p=>compatibleRemote(p,byId.get(p.id)))],npcs:state.npcs.map(n=>({...clone(n),health:100,targetId:null})),roster:clone(state.roster),viewerId:this.viewerId,spectatingId:state.spectatingId,events:clone(state.events),eventSerial:state.eventSerial},needsResync:false};
 }
}
