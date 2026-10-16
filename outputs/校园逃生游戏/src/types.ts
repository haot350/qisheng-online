import type {Vec3,WeaponId,PrimaryWeaponId} from '@qisheng/shared/types';
import type {GraphicsQuality} from '@qisheng/shared/render-profile';
export type {Vec3,WeaponId,PrimaryWeaponId,Point,MapChunk,MapManifest} from '@qisheng/shared/types';
import type {NearbyInteraction} from './nearby-interaction';
import type {OnlineContact} from './multiplayer/contacts';
import type {RoomSnapshot} from './multiplayer/shared/protocol';
import type {RankingViewSnapshot} from './ranking/recorder.ts';
import type {StoryCheckpoint,StorySnapshot,StoryGuidanceAction} from './story/types';
import type {PhotoSnapshot,PhotoRecord} from './photography/types';
import type {PhotoSystem} from './photography/PhotoSystem';
import type {RealityMatch} from './reality/types';
import type {EscapeSnapshot,EscapeDifficulty} from './escape';
import {sanitizeEscapeTouchLayout,type EscapeTouchLayout,type EscapeAimMode} from './escape-touch-layout.ts';
export type {EscapeDifficulty} from './escape';
export type EscapeMusic='battle'|'run'|'off';
export type EscapeMapView={mapOpen?:boolean;playerPosition?:Vec3;playerYaw?:number;playerFloor?:number;mapFloor?:number;mapFloors?:number[];enemyContacts?:{id:number|string;position:Vec3;floor:number;kind:'seen'|'heard';remaining:number}[];supplies?:{id:string;name:string;position:Vec3;floor?:number;used:boolean}[];best?:number|null};
export type Mode='escape'|'roam'|'dafei'|'story';
export type TransmissionMode='auto'|'manual';
export type AttackPhase='search'|'aim'|'fire'|'cooldown'|'reload'|'suppressed';
export type HitType='body'|'head'|'suppressed';
export type IncomingDamage={id:number;angle:number;vertical:-1|0|1;strength:number;remaining:number};
export type Loadout={primary:PrimaryWeaponId;difficulty?:EscapeDifficulty};
export type Phase='loading'|'menu'|'intro'|'playing'|'paused'|'won'|'lost'|'error';
export type Action='fire'|'aim'|'reload'|'jump'|'crouch'|'run'|'switch'|'smoke'|'pause'|'interact'|'shiftUp'|'shiftDown'|'slide'|'nextTask'|'taskMap';
export type Settings={onlinePing?:boolean;sensitivity:number;fov:number;headBob:boolean;recoilShake:boolean;music:number;sfx:number;quality:GraphicsQuality;aimAssist:boolean;controls:'auto'|'touch'|'desktop';realityHints?:boolean;transmission?:TransmissionMode;escapeDifficulty?:EscapeDifficulty;escapeMusic?:EscapeMusic;escapeAimMode?:EscapeAimMode;escapeAimPreferenceVersion?:number;escapeTouchLayout?:EscapeTouchLayout};
export const ESCAPE_AIM_PREFERENCE_VERSION=1;
export const DEFAULT_SETTINGS:Settings={sensitivity:1,fov:60,headBob:true,recoilShake:true,music:.38,sfx:.75,quality:'auto',aimAssist:true,controls:'auto',realityHints:false,transmission:'auto',escapeDifficulty:'standard',escapeMusic:'battle',escapeAimMode:'toggle',escapeAimPreferenceVersion:ESCAPE_AIM_PREFERENCE_VERSION};

/** Read older local preferences without admitting invalid driving modes. */
export function parseStoredSettings(raw:string|null):Settings {
 let saved:Record<string,unknown>={};
 try {const value=JSON.parse(raw||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
 const number=(key:string,min:number,max:number,fallback:number)=>typeof saved[key]==='number'&&Number.isFinite(saved[key])?Math.max(min,Math.min(max,saved[key] as number)):fallback;
 const boolean=(key:string,fallback:boolean)=>typeof saved[key]==='boolean'?saved[key] as boolean:fallback;
 // Stamp the migrated preference when App next saves settings. Later manual
 // hold selections carry the stamp and survive subsequent launches.
 const currentAimPreference=typeof saved.escapeAimPreferenceVersion==='number'&&saved.escapeAimPreferenceVersion>=ESCAPE_AIM_PREFERENCE_VERSION;
 return {...DEFAULT_SETTINGS,onlinePing:saved.onlinePing===true,sensitivity:number('sensitivity',.35,2,1),fov:number('fov',50,80,60),music:number('music',0,1,.38),sfx:number('sfx',0,1,.75),headBob:boolean('headBob',true),recoilShake:boolean('recoilShake',true),aimAssist:boolean('aimAssist',true),quality:saved.quality==='smooth'||saved.quality==='high'||saved.quality==='ultra'?saved.quality:'auto',controls:saved.controls==='touch'||saved.controls==='desktop'?saved.controls:'auto',realityHints:saved.realityHints===true,transmission:saved.transmission==='manual'?'manual':'auto',escapeDifficulty:saved.escapeDifficulty==='easy'||saved.escapeDifficulty==='hard'?saved.escapeDifficulty:'standard',escapeMusic:saved.escapeMusic==='run'||saved.escapeMusic==='off'?saved.escapeMusic:'battle',escapeAimMode:currentAimPreference&&saved.escapeAimMode==='hold'?'hold':'toggle',escapeAimPreferenceVersion:ESCAPE_AIM_PREFERENCE_VERSION,escapeTouchLayout:sanitizeEscapeTouchLayout(saved.escapeTouchLayout)};
}
export type PhotoGuideSnapshot={task?:{id:string;position:Vec3;radius:number;validSegments:number};references:boolean;referenceState:'off'|'loading'|'ready'|'error';referenceCount:number;visible:boolean;entries:{id:string;optional:boolean;visible:boolean;position:Vec3;radius:number;segments:number}[]};
export type DrivingSnapshot={score:number;hits:number;combo:number;bestCombo:number;bestScore:number|null;legacyBestScore:number|null;durability:number;speed:number;gear:number;rpm:number;transmission:TransmissionMode;shiftLeft:number;shiftSerial:number;rejectedShiftSerial:number;boostLeft:number;boostCooldown:number;countdown:number;resetProgress:number;repairProgress:number;repairName:string;guide:string;areas?:{id:string;name:string;angle:number}[];targets:{id:number;name:string;angle:number;remaining:number}[]};
export type DriveInput={steer:number;throttle:number;brake:number;handbrake:boolean;reverse:boolean;boost:boolean;reset:boolean};
export type OnlineDiagnostics={rttMs:number;jitterMs:number;snapshotIntervalMs:number;receivedBytes:number;bufferMs:number;snapshotAgeMs:number;bufferedBytes:number;correctionP95M?:number;hardCorrections?:number;replaySteps?:number;inputAckAgeMs?:number;backlogAgeMs?:number;longFrames?:number;resyncs?:number;inputAgeTicks?:number;inputReason?:string;lastInputReason?:string;lastInputReasonTick?:number};
export type Snapshot={interaction?:NearbyInteraction|null;interactionScreen?:{x:number;y:number}|null;onlineTrackingTaskId?:string;onlineDiagnostics?:OnlineDiagnostics;online?:RoomSnapshot;onlineSpectatingId?:string;onlineContacts?:OnlineContact[];onlineMap?:boolean;onlineCommunication?:boolean;ranking?:RankingViewSnapshot;mouseLocked?:boolean;phase:Phase;mode:Mode;progress:number;message:string;health:number;stamina:number;ammo:number;reserve:number;weapon:WeaponId;hasPrimary:boolean;pickup?:{id:string;label:string;weapon:WeaponId;loading:boolean;error:boolean};weaponAction?:{phase:string;stage?:string;progress:number;ready:boolean};smokes:number;remaining:number;elapsed:number;grace:number;clues:number;goalName:string;goalDistance:number;goalAngle:number;extraction:number;running:boolean;sprintIntent?:boolean;weaponSpread?:number;fastWalking?:boolean;reality?:RealityMatch;crouching:boolean;aiming:boolean;reloading:boolean;hit:number;hitType:HitType|null;hurt:number;incoming:IncomingDamage[];fps:number;quality:string;musicError:boolean;best:number|null;resultReason:string;notice:string;buffering:boolean;bufferingVisible?:boolean;mapError:boolean;mapProgress:number;driving?:DrivingSnapshot;escape?:EscapeSnapshot & EscapeMapView;story?:StorySnapshot;photo?:PhotoSnapshot;latestPhoto?:PhotoRecord; temporaryPhotos?:PhotoRecord[];storyMusicError?:boolean;realityHints?:boolean;photoGuides?:PhotoGuideSnapshot};
export type InputFrame={moveX:number;moveY:number;lookX:number;lookY:number;fire:boolean;aim:boolean;crouch:boolean;actions:Set<Action>;drive?:DriveInput;lookHeld?:boolean;fastWalk?:boolean;sprintHeld?:boolean};
export interface InputSource { sample():InputFrame; reset():void; dispose():void; }
export type PreparationOptions={signal?:AbortSignal;onProgress?:(progress:number,message:string)=>void};
export type GameAPI={prepareMode?:(mode:Mode,loadout?:Loadout,options?:PreparationOptions)=>Promise<void>;cancelModePreparation?:()=>void;modePrepared?:(mode:Mode,loadout?:Loadout)=>boolean;onlineSpectateNext?:()=>void;onlineDropTask?:()=>void;onlinePing?:()=>void;onlineCommunication?:()=>void;rankingSubmit?:()=>Promise<void>;retryRound?:()=>Promise<void>;taskMap?:(open:boolean)=>Promise<void>|void;selectEscapeTask?:(id:string)=>void;observe?:()=>void;releaseCursor?:()=>void;unlockAudio:(mode?:Mode)=>void;photoRemoved:(id:string)=>void;photoSystem:()=>PhotoSystem|null;togglePhoto:()=>Promise<void>;storyAction:(action:'interact'|'advance'|'hint'|'skip'|'present'|'choose'|'credits',value?:number|boolean)=>void;storyOverlay:(source:'history'|'archive'|'reality'|'photo-panel'|'photo-album'|'restore'|'ui-module'|'operations',open:boolean)=>void;storyGuidance:(action:StoryGuidanceAction)=>void;closeReality:()=>void;storyCheckpoint:()=>StoryCheckpoint|null;restoreStory:(checkpoint:StoryCheckpoint)=>Promise<void>;prepareDafeiIntro:()=>Promise<void>;start:(mode:Mode,loadout?:Loadout)=>Promise<void>;resume:()=>Promise<void>;pause:()=>void;menu:()=>void;action:(action:Action,pressed?:boolean)=>void;cancelAction?:(action:Action)=>void;move:(x:number,y:number)=>void;look:(x:number,y:number)=>void;drive:(input:Partial<DriveInput>)=>void;guide:()=>void;holdLook:(held:boolean)=>void;clearInput?:()=>void;setSettings:(s:Settings)=>void;setTransmission:(mode:TransmissionMode)=>void;retryRealityHints?:()=>void;setRealityHints?:(enabled:boolean)=>void;retryMusic:()=>void;retryMap:()=>void;dispose:()=>void};
