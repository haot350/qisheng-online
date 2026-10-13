import type {WeaponId} from './types.ts';
export type LegacyWeaponId='pistol'|'auto'|'scatter';
export const WEAPON_IDS=['glock','mp5','m4a1','ak47','r870','awm','m249'] as const;
export const PRIMARY_WEAPONS=['mp5','m4a1','ak47','r870','awm','m249'] as const;
export function resolveWeaponId(id:WeaponId|LegacyWeaponId):WeaponId {return ({pistol:'glock',auto:'m4a1',scatter:'r870'} as const)[id as LegacyWeaponId]??id as WeaponId;}
export const RULES={height:1.75,eye:1.62,crouchEye:1.04,radius:.3,walkSpeed:2.8,runSpeed:4.8,crouchSpeed:1.6,runDuration:12,staminaDelay:1.5,staminaRecovery:8,grace:10,round:480,extraction:5,suppression:10,musicDuration:60,smokeRadius:5,smokeDuration:6} as const;
export interface WeaponDefinition {label:string;capacity:number;damage:number;pellets:number;reload:number;reloadEmpty:number;interval:number;spread:number;range:number;reserve:number;automatic:boolean;recoil:number;recoilSide:number;recover:number;sightHeight:number;adsTime:number;scope?:number;shellReload?:{prepare:number;insert:number};}
/** Gameplay tuning, not a statement of real firearm performance. */
export const WEAPONS:Record<WeaponId,WeaponDefinition>={
 glock:{label:'Glock 17',capacity:17,damage:24,pellets:1,reload:1.5,reloadEmpty:1.75,interval:.26,spread:.006,range:55,reserve:51,automatic:false,recoil:.026,recoilSide:.008,recover:11,sightHeight:.085,adsTime:.18},
 mp5:{label:'MP5',capacity:30,damage:18,pellets:1,reload:1.9,reloadEmpty:2.2,interval:.085,spread:.013,range:55,reserve:90,automatic:true,recoil:.011,recoilSide:.004,recover:12,sightHeight:.115,adsTime:.19},
 m4a1:{label:'M4A1',capacity:30,damage:28,pellets:1,reload:2,reloadEmpty:2.35,interval:.10,spread:.011,range:85,reserve:90,automatic:true,recoil:.017,recoilSide:.006,recover:10,sightHeight:.13,adsTime:.23},
 ak47:{label:'AK-47',capacity:30,damage:34,pellets:1,reload:2.2,reloadEmpty:2.55,interval:.12,spread:.015,range:80,reserve:60,automatic:true,recoil:.024,recoilSide:.009,recover:8,sightHeight:.108,adsTime:.25},
 r870:{label:'Remington 870',capacity:6,damage:10,pellets:8,reload:3.1,reloadEmpty:3.4,interval:.90,spread:.052,range:30,reserve:18,automatic:false,recoil:.053,recoilSide:.012,recover:7,sightHeight:.095,adsTime:.24,shellReload:{prepare:.4,insert:.45}},
 awm:{label:'AWM',capacity:5,damage:100,pellets:1,reload:2.5,reloadEmpty:2.9,interval:1.25,spread:.003,range:160,reserve:15,automatic:false,recoil:.062,recoilSide:.009,recover:8,sightHeight:.172,adsTime:.32,scope:6},
 m249:{label:'M249',capacity:75,damage:23,pellets:1,reload:4.2,reloadEmpty:4.8,interval:.10,spread:.017,range:90,reserve:150,automatic:true,recoil:.018,recoilSide:.007,recover:8,sightHeight:.14,adsTime:.34},
};
export type WeaponActionStage='ready'|'mag-out'|'mag-in'|'chamber'|'open-cover'|'belt-in'|'close-cover'|'shell'|'bolt'|'pump';
export type WeaponActionPhase='ready'|'reload'|'cycle';
export interface WeaponActionSnapshot {phase:WeaponActionPhase;stage:WeaponActionStage;progress:number;stageProgress:number;elapsed:number;duration:number;active:boolean;pending:boolean;ready:boolean;empty:boolean;shellIndex:number;shellCount:number;}
export interface WeaponActionEvent {serial:number;kind:'shot'|'mag-out'|'mag-in'|'bolt'|'shell'|'pump'|'open-cover'|'belt-in'|'close-cover';weapon:WeaponId;ammo:number;reserve:number;eject?:boolean;}
type ReloadStage={stage:WeaponActionStage;end:number;commit?:boolean;};
/** Camera zoom uses tangent FOV scaling, so a six-power optic is actually 6×. */
export function adsFieldOfView(id:WeaponId,baseDegrees:number,amount=1){const zoom=WEAPONS[id].scope??(1/.82);const target=2*Math.atan(Math.tan(baseDegrees*Math.PI/360)/zoom)*180/Math.PI;return baseDegrees+(target-baseDegrees)*Math.max(0,Math.min(1,amount));}
/** Completed reload stages survive holstering. Ammo changes only at insert commits. */
export class Magazine {
 ammo:number;reserve:number;cooldown=0;reloadLeft=0;id:WeaponId;reloadDuration=0;insertSerial=0;
 private elapsed=0;private checkpoint=0;private stages:ReloadStage[]=[];private stageIndex=0;private active=false;private wasEmpty=false;private chamberNeeded=false;private shellCount=0;private inserted=0;private cycleElapsed=0;private cycleDuration=0;private cycleEvent=false;private serial=0;private events:WeaponActionEvent[]=[];
 constructor(id:WeaponId|LegacyWeaponId,reserve?:number){this.id=resolveWeaponId(id);this.ammo=WEAPONS[this.id].capacity;this.reserve=Math.max(0,reserve??WEAPONS[this.id].reserve);}
 get hasPendingReload(){return this.stages.length>0;}
 get reloadProgress(){return this.active&&this.reloadDuration>0?Math.min(1,this.elapsed/this.reloadDuration):0;}
 get action():WeaponActionSnapshot {if(this.hasPendingReload){const previous=this.stageIndex?this.stages[this.stageIndex-1].end:0,stage=this.stages[this.stageIndex];return {phase:'reload',stage:stage?.stage??'ready',progress:this.elapsed/Math.max(.001,this.reloadDuration),stageProgress:Math.max(0,Math.min(1,(this.elapsed-previous)/Math.max(.001,(stage?.end??this.reloadDuration)-previous))),elapsed:this.elapsed,duration:this.reloadDuration,active:this.active,pending:true,ready:false,empty:this.wasEmpty,shellIndex:this.inserted,shellCount:this.shellCount};}if(this.cycleDuration>0)return {phase:'cycle',stage:this.id==='r870'?'pump':'bolt',progress:this.cycleElapsed/this.cycleDuration,stageProgress:this.cycleElapsed/this.cycleDuration,elapsed:this.cycleElapsed,duration:this.cycleDuration,active:true,pending:false,ready:false,empty:this.ammo===0,shellIndex:0,shellCount:0};return {phase:'ready',stage:'ready',progress:0,stageProgress:0,elapsed:0,duration:0,active:false,pending:false,ready:true,empty:this.ammo===0,shellIndex:0,shellCount:0};}
 private emit(kind:WeaponActionEvent['kind'],eject=false){this.events.push({serial:++this.serial,kind,weapon:this.id,ammo:this.ammo,reserve:this.reserve,eject});if(this.events.length>128)this.events.shift();}
 consumeEvents(){const events=this.events;this.events=[];return events;}
 update(dt:number){const step=Number.isFinite(dt)?Math.max(0,dt):0;this.cooldown=Math.max(0,this.cooldown-step);
  if(this.cycleDuration>0){this.cycleElapsed=Math.min(this.cycleDuration,this.cycleElapsed+step);if(!this.cycleEvent&&this.cycleElapsed>=this.cycleDuration*.34){this.cycleEvent=true;this.emit(this.id==='r870'?'pump':'bolt',true);}if(this.cycleElapsed+1e-8>=this.cycleDuration){this.cycleDuration=0;this.cycleElapsed=0;}}
  if(!this.active||!this.hasPendingReload)return;this.elapsed=Math.min(this.reloadDuration,this.elapsed+step);this.reloadLeft=Math.max(0,this.reloadDuration-this.elapsed);
  while(this.stageIndex<this.stages.length&&this.elapsed+1e-8>=this.stages[this.stageIndex].end){const stage=this.stages[this.stageIndex++];this.checkpoint=stage.end;if(stage.commit){const count=WEAPONS[this.id].shellReload?Math.min(1,WEAPONS[this.id].capacity-this.ammo,this.reserve):Math.min(WEAPONS[this.id].capacity-this.ammo,this.reserve);this.ammo+=count;this.reserve-=count;this.inserted+=count;if(count>0)this.insertSerial++;}if(stage.stage==='pump')this.chamberNeeded=false;this.emit(stage.stage==='chamber'?'bolt':stage.stage as WeaponActionEvent['kind']);}
  if(this.stageIndex>=this.stages.length){this.active=false;this.stages=[];this.reloadLeft=0;this.elapsed=0;this.checkpoint=0;}
 }
 reload(){if(this.active)return false;if(this.hasPendingReload)return this.resumeReload();const def=WEAPONS[this.id];if(this.ammo===def.capacity||this.reserve<=0||this.cycleDuration>0)return false;this.wasEmpty=this.ammo===0;this.chamberNeeded=!!def.shellReload&&this.wasEmpty;this.shellCount=def.shellReload?Math.min(def.capacity-this.ammo,this.reserve):0;this.inserted=0;this.stageIndex=0;this.elapsed=this.checkpoint=0;
  if(def.shellReload){this.reloadDuration=def.shellReload.prepare+this.shellCount*def.shellReload.insert+(this.wasEmpty?.3:0);this.stages=[];for(let i=0;i<this.shellCount;i++){const end=def.shellReload.prepare+(i+1)*def.shellReload.insert+(this.wasEmpty&&i>0?.3:0);this.stages.push({stage:'shell',end,commit:true});if(this.wasEmpty&&i===0)this.stages.push({stage:'pump',end:end+.3});}}
  else {this.reloadDuration=this.wasEmpty?def.reloadEmpty:def.reload;if(this.id==='m249')this.stages=[{stage:'open-cover',end:this.reloadDuration*.23},{stage:'belt-in',end:this.reloadDuration*.68,commit:true},{stage:'close-cover',end:this.reloadDuration*(this.wasEmpty?.84:1)},...(this.wasEmpty?[{stage:'chamber' as const,end:this.reloadDuration}]:[])];else this.stages=[{stage:'mag-out',end:this.reloadDuration*.27},{stage:'mag-in',end:this.reloadDuration*(this.wasEmpty?.71:.78),commit:true},{stage:'chamber',end:this.reloadDuration}];}
  this.active=true;this.reloadLeft=this.reloadDuration;return true;
 }
 resumeReload(){if(!this.hasPendingReload||this.active)return false;this.active=true;this.reloadLeft=Math.max(0,this.reloadDuration-this.elapsed);return true;}
 fire(){if(this.cooldown>0||this.ammo<=0||this.cycleDuration>0)return false;if(this.hasPendingReload){if(!WEAPONS[this.id].shellReload||this.chamberNeeded)return false;this.clearReload();}this.ammo--;this.cooldown=WEAPONS[this.id].interval;if(this.id==='awm'||this.id==='r870'){this.cycleDuration=WEAPONS[this.id].interval;this.cycleElapsed=0;this.cycleEvent=false;}this.emit('shot');return true;}
 cancelReload(){if(!this.hasPendingReload)return;this.active=false;this.elapsed=this.checkpoint;this.reloadLeft=0;}
 clearReload(){this.chamberNeeded=false;this.stages=[];this.active=false;this.elapsed=this.checkpoint=this.stageIndex=0;this.reloadLeft=0;}
}
export class Stamina {
 value=100;running=false;recoveryDelay=0;
 toggle(){if(this.running)this.stop();else if(this.value>=12)this.running=true;}
 stop(){if(this.running)this.recoveryDelay=RULES.staminaDelay;this.running=false;}
 update(dt:number,moving:boolean){if(this.running&&moving){this.value=Math.max(0,this.value-dt*100/RULES.runDuration);this.recoveryDelay=RULES.staminaDelay;if(this.value<=0)this.stop();}else{const recovering=Math.max(0,dt-this.recoveryDelay);this.recoveryDelay=Math.max(0,this.recoveryDelay-dt);this.value=Math.min(100,this.value+recovering*100/RULES.staminaRecovery);}}
}
export function seeded(seed:number){let v=seed>>>0;return()=>{v+=0x6D2B79F5;let t=v;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function chooseThree<T>(items:T[],random:()=>number=Math.random):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,3);}
export function wrapAngle(a:number){return Math.atan2(Math.sin(a),Math.cos(a));}
export function smokeBlocks(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},clouds:{position:{x:number;y:number;z:number};left:number;age:number}[]){const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,dd=x*x+y*y+z*z;return clouds.some(s=>{if(s.left<=0||s.age<.35)return false;const t=dd===0?0:Math.max(0,Math.min(1,((s.position.x-a.x)*x+(s.position.y-a.y)*y+(s.position.z-a.z)*z)/dd));return Math.hypot(a.x+x*t-s.position.x,a.y+y*t-s.position.y,a.z+z*t-s.position.z)<RULES.smokeRadius;});}
