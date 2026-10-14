import type {NearbyInteraction,MovementCheckpoint,Vec3,WeaponId} from './types.ts';
import type {WeaponActionSnapshot} from './rules.ts';
export type {Vec3,WeaponId} from './types.ts';
export const PROTOCOL_VERSION='campus-mp-0.8.2' as const;
export const RULE_VERSION='campus-mp-0.7.0' as const;
export {COOP_RULE_VERSION} from './ranking.ts';
export const SIM_HZ=60, SNAPSHOT_HZ=20, INPUT_HZ=30;
export type OnlineMode='coop'|'pvp';
export type PvpVariant='tdm'|'ffa';
export type Difficulty='easy'|'standard'|'hard';
export type AvatarId='campus-a'|'campus-b'|'tactical-a'|'tactical-b';
export type TeamId='blue'|'red'|'none';
export type RoomPhase='lobby'|'preparing'|'playing'|'paused'|'ended'|'draining';
export type LifePhase='alive'|'downed'|'eliminated'|'respawning';
export type HitRegion='head'|'torso'|'arm'|'leg';
export interface MapIdentity {sourceVersion:string;collisionHash:string;navigationHash:string;manifestHash:string;visionHash?:string;}
export interface RoomOptions {mode:OnlineMode;variant?:PvpVariant;difficulty?:Difficulty;private?:boolean;title?:string;ranked?:boolean;seed?:number;maxPlayers?:number;}
export interface JoinOptions {ticket:string;protocolVersion:typeof PROTOCOL_VERSION;map:MapIdentity;roomId?:string;inviteCode?:string;options?:RoomOptions;}
export type InputAction='reload'|'jump'|'slide'|'interact'|'smoke'|'switch'|'drop-task';
export type InputResetReason='none'|'late-input'|'input-timeout'|'input-reset'|'future-input'|'sequence-gap'|'client-rebase'|'loading'|'reconnected';
/** Recipient-private receipt: a simulation tick alone never acknowledges a client command. */
export interface InputReceipt {epoch:number;appliedSeq:number;acceptedSeq:number;cancelledThrough:number;serverTick:number;appliedTargetTick:number;queueDepth:number;inputAgeTicks:number;reason:InputResetReason;}
export interface InputRebaseCommand {epoch:number;generation:number;loadingEpoch:number;seq:number;cancelActionThrough:number;yaw:number;pitch:number;}
export interface InputCommand {seq:number;tick:number;inputEpoch?:number;clientTick?:number;targetTick?:number;resetInput?:boolean;cancelActionThrough?:number;renderTick?:number;actionIds?:{id:number;type:InputAction}[];moveX:number;moveY:number;yaw:number;pitch:number;fire:boolean;aim:boolean;sprint:boolean;crouch:boolean;interact?:boolean;actions?:InputAction[];weapon?:WeaponId;}
export interface InputBatch {commands:InputCommand[];}
export interface QueueReply {queueId:string;queueToken:string;status:'waiting'|'ready'|'error';error?:{code:string;message:string};position:number;reservation?:unknown;}
export interface LoadingCommand {epoch:number;generation:number;ready:boolean;scopeReady?:boolean;map:MapIdentity;seq:number;cancelActionThrough:number;yaw:number;pitch:number;}
export interface PlayerState {interaction?:NearbyInteraction|null;id:string;nickname:string;shortId:string;avatar:AvatarId;team:TeamId;ready:boolean;rankConsent:boolean;connected:boolean;departed?:boolean;loading:boolean;loadingEpoch:number;position:Vec3;yaw:number;pitch:number;velocity:Vec3;grounded:boolean;crouched:boolean;life:LifePhase;health:number;stamina:number;movementState?:MovementCheckpoint&{vertical?:number;lastSafe?:Vec3;actualSpeed?:number};weapon:WeaponId;primaryWeapon?:WeaponId;ammo:number;reserve:number;weaponAction:{phase:string;stage:string;progress:number;stageProgress?:number;shellIndex?:number;shellCount?:number;ready:boolean};aim:boolean;sprinting:boolean;sliding:boolean;ack:number;inputReceipt?:InputReceipt;appliedInputTick?:number;actionAck?:number;inputResync?:boolean;generation:number;kills:number;deaths:number;assists:number;downs:number;headshots:number;damageTaken:number;reviveLeft:number;respawnLeft:number;protectionLeft:number;carryingTask:string|null;ping:number;smokes:number;revivingTarget?:string|null;reviveProgress?:number;}
export interface NpcState {id:string;identity:string;generation:number;position:Vec3;yaw:number;aimPitch?:number;pose:string;aim:boolean;firing:boolean;reloading:boolean;weapon:WeaponId;active:boolean;health:number;targetId:string|null;bob?:number;actualSpeed?:number;weaponAction?:WeaponActionSnapshot;}
export interface TaskState {id:string;kind:'take'|'activate'|'hold'|'deliver';label:string;positions:Vec3[];floors:number[];status:'pending'|'active'|'complete';progress:number;duration:number;radius:number;visited:string[];carrierId:string|null;drop:Vec3|null;blocked:'outside'|'contested'|null;}
export interface DropState {id:string;weapon:WeaponId;ammo:number;reserve:number;position:Vec3;left:number;}
export interface SupplyState {id:string;position:Vec3;usedBy:string[];}
export interface SmokeState {id:string;position:Vec3;radius:number;left:number;bornTick:number;}
export interface PauseVote {requestedBy:string;yes:string[];eligible:string[];left:number;uses:number;}
export type GameEventType='sound'|'shot'|'hit'|'down'|'death'|'respawn'|'revive'|'task'|'drop'|'pickup'|'smoke'|'ping'|'preset'|'pause'|'result'|'notice';
export interface GameEvent {serial:number;tick:number;type:GameEventType;actorId?:string;targetId?:string;position?:Vec3;data?:Record<string,unknown>;}
export interface MatchResult {resultId:string;mode:OnlineMode;variant?:PvpVariant;won:boolean;elapsed:number;teamScores:{blue:number;red:number};players:{id:string;nickname:string;kills:number;deaths:number;assists:number;downs:number;headshots:number;damage:number;rank:number;won:boolean}[];team?:{score:number;rating:string;tasks:number;eligible:boolean;reason?:string};}
export interface RoomSnapshot {protocolVersion:typeof PROTOCOL_VERSION;roomId:string;inviteCode:string;hostId:string;mode:OnlineMode;variant:PvpVariant;difficulty:Difficulty;phase:RoomPhase;tick:number;elapsed:number;remaining:number;map:MapIdentity;players:PlayerState[];npcs:NpcState[];tasks:TaskState[];drops:DropState[];supplies:SupplyState[];smokes:SmokeState[];events:GameEvent[];eventSerial:number;maxPlayers:number;occupancy?:number;startedPlayers:number;extraction:{available:boolean;position:Vec3;progress:number;duration:number;blocked:'outside'|'contested'|null};teamScores:{blue:number;red:number};pauseVote:PauseVote|null;pauseLeft:number;pauseUses:number;countdown:number;result:MatchResult|null;maintenance:boolean;}
export interface RoomListing {roomId:string;title:string;mode:OnlineMode;variant:PvpVariant;difficulty:Difficulty;players:number;maxPlayers:number;phase:RoomPhase;private:boolean;ping?:number;}
export interface ServiceStatus {maintenance:boolean;rooms:number;players:number;queued:number;capacity:number;worker:number;}
export interface LobbyView {status:'idle'|'connecting'|'lobby'|'playing'|'reconnecting'|'queued'|'error';rooms:RoomListing[];currentRoom:RoomSnapshot|null;error?:string;errorCode?:string;queuePosition?:number;reconnectLeft?:number;}
export type ClientMessageMap={input:InputCommand|InputBatch;'input-rebase':InputRebaseCommand;loading:LoadingCommand;ready:{ready:boolean};consent:{consent:boolean};loadout:{weapon:WeaponId;avatar:AvatarId;team?:TeamId};start:{};pause:{agree?:boolean};resume:{};ping:{position:Vec3};preset:{id:'help'|'go'|'thanks'|'wait'};latency:{id:number;sentAt:number};'latency-ack':{nonce:string};spectate:{targetId:string|null};resync:{afterSeq?:number};leave:{}};
export type ServerMessageMap={snapshot:RoomWireMessage;event:GameEvent;error:{code:string;message:string;retryable:boolean};latency:{id:number;sentAt:number;serverTick:number;nonce:string};queued:{position:number};result:MatchResult};
export function sameMap(a:MapIdentity,b:MapIdentity){return a.sourceVersion===b.sourceVersion&&a.collisionHash===b.collisionHash&&a.navigationHash===b.navigationHash&&a.manifestHash===b.manifestHash&&(a.visionHash??'')===(b.visionHash??'');}
export const emptyInput=(seq=0,tick=0):InputCommand=>({seq,tick,moveX:0,moveY:0,yaw:0,pitch:0,fire:false,aim:false,sprint:false,crouch:false,actions:[]});

export const ROOM_WIRE_VERSION=1 as const;
export interface PublicRosterEntry {
 id:string;nickname:string;shortId:string;avatar:PlayerState['avatar'];team:PlayerState['team'];ready:boolean;rankConsent:boolean;connected:boolean;departed?:boolean;loading:boolean;life:PlayerState['life'];
 weapon:PlayerState['weapon'];primaryWeapon?:PlayerState['primaryWeapon'];kills:number;deaths:number;assists:number;downs:number;headshots:number;ping:number;
 health?:number;reviveLeft?:number;respawnLeft?:number;
}
export type VisiblePlayer=Pick<PlayerState,'id'|'position'|'yaw'|'pitch'|'velocity'|'grounded'|'crouched'|'life'|'weapon'|'weaponAction'|'aim'|'sprinting'|'sliding'|'generation'|'loading'|'loadingEpoch'|'carryingTask'> & {health?:number;protectionLeft?:number};
export type VisibleNpc=Omit<NpcState,'health'|'targetId'>;
export type WireRoom=Omit<RoomSnapshot,'players'|'npcs'|'events'|'eventSerial'>;
export type Patch<T>={set:Partial<T>;unset?:string[]};
export type EntityDelta<T extends {id:string}>={upsert:T[];remove:string[]};
export interface ProjectedRoom {room:WireRoom;roster:PublicRosterEntry[];self:PlayerState;players:VisiblePlayer[];npcs:VisibleNpc[];spectatingId:string|null;events:GameEvent[];eventSerial:number;}
export interface FullRoomWire extends ProjectedRoom {wireVersion:typeof ROOM_WIRE_VERSION;kind:'full';seq:number;roomId:string;viewerId:string;}
export interface DeltaRoomWire {wireVersion:typeof ROOM_WIRE_VERSION;kind:'delta';seq:number;baseSeq:number;roomId:string;viewerId:string;room?:Patch<WireRoom>;roster?:PublicRosterEntry[];self?:Patch<PlayerState>;players:EntityDelta<VisiblePlayer>;npcs:EntityDelta<VisibleNpc>;spectatingId:string|null;events:GameEvent[];eventSerial:number;}
export type RoomWireMessage=FullRoomWire|DeltaRoomWire;
export type RecipientSnapshot=RoomSnapshot&{roster:PublicRosterEntry[];viewerId:string;spectatingId:string|null};
