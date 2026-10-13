import {roomRoster} from './shared/wire';
import {WEAPONS,Magazine,type WeaponActionSnapshot} from '../rules';
import type {LobbyView,PlayerState,RoomSnapshot,WeaponId} from './shared/protocol';

export const nextInputSequence=(current:number,ack:number)=>Math.max(current,ack)+1;
export function roomTransportReady(view:LobbyView,roomId:string,connected:boolean){return connected&&view.currentRoom?.roomId===roomId&&(view.status==='playing'||view.status==='lobby');}
export function onlineMembers(room:RoomSnapshot){return roomRoster(room).filter(p=>!p.departed);}
export function playerPrimaryWeapon(player:Pick<PlayerState,'weapon'|'primaryWeapon'>):WeaponId{return player.primaryWeapon??(player.weapon==='glock'?'m4a1':player.weapon);}
export function spectateCandidates(room:RoomSnapshot,playerId:string){const me=room.players.find(p=>p.id===playerId);if(!me||me.life==='alive'||me.life==='downed'||room.mode==='pvp'&&room.variant==='ffa')return [];return room.players.filter(p=>!p.departed).filter(p=>p.id!==playerId&&p.life==='alive'&&(room.mode==='coop'||p.team===me.team&&me.team!=='none'));}
export function spectateTarget(room:RoomSnapshot,playerId:string,selected:string|null){const candidates=spectateCandidates(room,playerId);return candidates.find(p=>p.id===selected)??candidates[0];}
export function nextSpectateTarget(room:RoomSnapshot,playerId:string,selected:string|null){const candidates=spectateCandidates(room,playerId),index=candidates.findIndex(p=>p.id===selected);return candidates.length?candidates[(index+1)%candidates.length].id:null;}

/** Authority owns ammunition and action commits; shot and reload feedback use the same input sequence. */
export class OnlineWeaponPresentation {
 private state:Pick<PlayerState,'weapon'|'ammo'|'reserve'|'weaponAction'|'ack'|'generation'>;
 private shots:{seq:number;left:number}[]=[];
 private cooldown=0;
 private reloadSeq:number|null=null;private predictedReload:Magazine|null=null;private lastReloadAction:WeaponActionSnapshot|null=null;private predictedSounds:string[]=[];
 constructor(state:PlayerState){this.state=state;}
 cancelPrediction(){this.shots=[];this.cooldown=0;this.reloadSeq=null;this.predictedReload=null;this.lastReloadAction=null;this.predictedSounds=[];}
 reconcile(state:PlayerState){const previous=this.state,events:string[]=[];if(state.weapon===previous.weapon&&state.generation===previous.generation){const a=previous.weaponAction,b=state.weaponAction;if(a.phase==='reload'&&(b.phase!=='reload'||a.stage!==b.stage||a.shellIndex!==b.shellIndex))events.push(a.stage==='chamber'?'bolt':a.stage);if(a.phase==='cycle'&&a.progress<.34&&(b.phase!=='cycle'||b.progress>=.34))events.push(state.weapon==='r870'?'pump':'bolt');}if(state.weapon!==this.state.weapon||state.generation!==this.state.generation){this.shots=[];this.cooldown=0;this.reloadSeq=null;this.predictedReload=null;this.lastReloadAction=null;this.predictedSounds=[];}this.state=state;this.shots=this.shots.filter(s=>s.seq>state.ack);if(this.reloadSeq!==null&&state.ack>=this.reloadSeq){this.reloadSeq=null;if(state.weaponAction.phase!=='reload'){this.predictedReload=null;this.lastReloadAction=null;}}if(this.predictedReload&&previous.weaponAction.phase==='reload'&&state.weaponAction.phase!=='reload'){this.predictedReload=null;this.lastReloadAction=null;}return events.filter(event=>{const index=this.predictedSounds.indexOf(event);if(index<0)return true;this.predictedSounds.splice(index,1);return false;});}
 update(dt:number){this.cooldown=Math.max(0,this.cooldown-dt);for(const shot of this.shots)shot.left=Math.max(0,shot.left-dt);if(!this.predictedReload)return[];this.lastReloadAction=this.predictedReload.action;this.predictedReload.update(dt);const events=this.predictedReload.consumeEvents().map(event=>event.kind);this.predictedSounds.push(...events);return events;}
 requestReload(seq:number){
  if(this.displayAmmo>=WEAPONS[this.state.weapon].capacity||this.state.reserve<=0||this.action.phase==='cycle')return;
  if(this.reloadSeq!==null||this.state.weaponAction.phase==='reload')return;
  const magazine=new Magazine(this.state.weapon);magazine.ammo=this.displayAmmo;magazine.reserve=this.state.reserve;
  if(!magazine.reload())return;
  this.reloadSeq=seq;this.predictedReload=magazine;this.lastReloadAction=magazine.action;
 }
 fire(seq:number){
  if(this.displayAmmo<=0){this.requestReload(seq);return false;}
  const s=this.state,def=WEAPONS[s.weapon],interruptible=s.weapon==='r870'&&s.weaponAction.phase==='reload'&&s.ammo>0&&s.weaponAction.stage==='shell';
  if(this.cooldown>0||this.reloadSeq!==null||!s.weaponAction.ready&&!interruptible)return false;
  this.shots.push({seq,left:def.interval});this.cooldown=def.interval;return true;
 }
 get displayAmmo(){return Math.max(0,this.state.ammo-this.shots.length);}
 get action():WeaponActionSnapshot {if(this.predictedReload&&(this.reloadSeq!==null||this.state.weaponAction.phase==='reload')){const action=this.predictedReload.action;return action.phase==='reload'?action:{...(this.lastReloadAction??action),phase:'reload',progress:.999,stageProgress:1,active:true,pending:true,ready:false};}const s=this.state,a=s.weaponAction,phase=a.phase==='reload'?'reload':a.phase==='cycle'?'cycle':'ready',stage=a.stage as WeaponActionSnapshot['stage'];const predicted=this.shots.at(-1);if(predicted&&predicted.left>0&&(s.weapon==='awm'||s.weapon==='r870')&&phase==='ready'){const duration=WEAPONS[s.weapon].interval,elapsed=duration-predicted.left;return {phase:'cycle',stage:s.weapon==='r870'?'pump':'bolt',progress:elapsed/duration,stageProgress:elapsed/duration,elapsed,duration,active:true,pending:false,ready:false,empty:s.ammo-this.shots.length<=0,shellIndex:0,shellCount:0};}const duration=phase==='cycle'?WEAPONS[s.weapon].interval:phase==='reload'?WEAPONS[s.weapon].reload:0;return {phase,stage,progress:a.progress,stageProgress:a.stageProgress??a.progress,elapsed:a.progress*duration,duration,active:phase!=='ready',pending:phase==='reload'||this.reloadSeq!==null,ready:a.ready&&this.reloadSeq===null,empty:s.ammo===0,shellIndex:a.shellIndex??0,shellCount:a.shellCount??0};}
}
