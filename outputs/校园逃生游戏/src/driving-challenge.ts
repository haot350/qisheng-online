import {DAFEI_BEST_KEY,DAFEI_OLD_BEST_KEYS} from './ranking/shared.ts';
import {DRIVE_RULES,DriveScore,DriveBoost} from './driving-rules.ts';
import {DAFEI_COMMENTS} from './dafei-dialogue.ts';
import type {DriveInput,DrivingSnapshot,Point,Vec3} from './types.ts';
import type {VehicleState} from './vehicle-physics.ts';
const bearing=(from:Vec3,to:Vec3,yaw:number)=>Math.atan2(Math.sin(Math.atan2(to[0]-from[0],-(to[2]-from[2]))+yaw),Math.cos(Math.atan2(to[0]-from[0],-(to[2]-from[2]))+yaw));
export class DrivingChallenge {
 readonly score=new DriveScore();readonly boost=new DriveBoost();
 durability:number=DRIVE_RULES.durability;countdown:number=DRIVE_RULES.countdown;elapsed=0;resetProgress=0;repairProgress=0;repairName='';guide='';bestScore:number|null=null;legacyBestScore:number|null=null;
 private resetReady=0;private damaged=false;private used=new Set<string>();private repairId='';private guideUntil=0;private lastGuide=-Infinity;private said=new Set<keyof typeof DAFEI_COMMENTS>();private pendingGuide=new Set<keyof typeof DAFEI_COMMENTS>();private targets=new Map<number,{name:string;position:Vec3;expires:number}>();
 constructor(readonly repairs:Point[]){for(const [key,field] of [[DAFEI_BEST_KEY,'bestScore'],...DAFEI_OLD_BEST_KEYS.map(key=>[key,'legacyBestScore'] as const)] as const)try{const value=localStorage.getItem(key),score=value===null?NaN:Number(value);if(Number.isFinite(score)&&score>=0)this[field]=this[field]===null?score:Math.max(this[field]!,score);}catch{}}
 tick(dt:number,input:DriveInput,speed:number,position:Vec3){
  if(this.countdown>0){const remaining=Math.max(0,dt-this.countdown);this.countdown=Math.max(0,this.countdown-dt);if(remaining<1e-9)return {reset:false,repair:false,repairEvent:undefined};dt=remaining;}
  this.elapsed=Math.min(DRIVE_RULES.round,this.elapsed+dt);this.score.update(this.elapsed);this.boost.update(dt);this.resetReady=Math.max(0,this.resetReady-dt);
  if(input.boost)this.boost.trigger();this.resetProgress=input.reset&&this.resetReady===0?Math.min(DRIVE_RULES.resetDuration,this.resetProgress+dt):0;
  const reset=this.resetProgress>=DRIVE_RULES.resetDuration;
  const point=this.repairs.find(p=>!this.used.has(p.id)&&Math.hypot(position[0]-p.position[0],position[2]-p.position[2])<DRIVE_RULES.repairRadius&&Math.abs(position[1]-p.position[1])<.8);
  if(point&&this.durability<DRIVE_RULES.durability&&!input.reset&&Math.abs(speed)<DRIVE_RULES.repairSpeed&&!this.damaged){if(this.repairId!==point.id)this.repairProgress=0;this.repairId=point.id;this.repairName=point.label;this.repairProgress+=dt;}else{this.repairProgress=0;this.repairId='';this.repairName='';}
  this.damaged=false;let repair=false;let repairEvent:{id:string;amount:number;before:number;after:number}|undefined;if(point&&this.repairProgress>=DRIVE_RULES.repairDuration){this.used.add(point.id);const beforeRepair=this.durability;this.durability=Math.min(DRIVE_RULES.durability,this.durability+DRIVE_RULES.repairAmount);this.repairProgress=0;repair=true;repairEvent={id:point.id,amount:this.durability-beforeRepair,before:beforeRepair,after:this.durability};}
  if(this.guideUntil<this.elapsed)this.guide='';if(this.durability<=DRIVE_RULES.durability*.25)this.pendingGuide.add('danger');else this.pendingGuide.delete('danger');if(this.elapsed>=240)this.pendingGuide.add('minute');this.flushGuide();
  for(const [id,target] of this.targets)if(target.expires<this.elapsed)this.targets.delete(id);
  return {reset,repair,repairEvent};
 }
 hit(id:number){const gained=this.score.hit(id,this.elapsed);if(this.score.hits===1)this.pendingGuide.add('first');if(this.score.combo>=3)this.pendingGuide.add('combo');this.flushGuide();return gained;}
 damage(amount:number){this.durability=Math.max(0,this.durability-amount);this.damaged=true;this.repairProgress=0;}
 resetCar(){this.score.resetCar();this.resetProgress=0;this.resetReady=5;this.repairProgress=0;}
 hint(id:number,name:string,position:Vec3){this.targets.set(id,{name,position:[...position],expires:this.elapsed+3});}
 private flushGuide(){
  if(this.said.size>=4||this.elapsed-this.lastGuide<DRIVE_RULES.guideInterval)return;
  // Urgent condition tips take precedence over a queued combo acknowledgement.
  const id=(['danger','minute','first','combo'] as const).find(id=>this.pendingGuide.has(id)&&!this.said.has(id));
  if(!id)return;this.pendingGuide.delete(id);this.said.add(id);this.lastGuide=this.elapsed;this.guide=DAFEI_COMMENTS[id];this.guideUntil=this.elapsed+3.5;
 }
 finish(){if(this.bestScore===null||this.score.score>this.bestScore){this.bestScore=this.score.score;try{localStorage.setItem(DAFEI_BEST_KEY,String(this.bestScore));}catch{}}}
 isRepairUsed(id:string){return this.used.has(id);}
 snapshot(position:Vec3,yaw:number,speed:number,powertrain?:Pick<VehicleState,'gear'|'rpm'|'transmission'|'shiftLeft'|'shiftSerial'|'rejectedShiftSerial'>):DrivingSnapshot{return {gear:powertrain?.gear??1,rpm:powertrain?.rpm??900,transmission:powertrain?.transmission??'auto',shiftLeft:powertrain?.shiftLeft??0,shiftSerial:powertrain?.shiftSerial??0,rejectedShiftSerial:powertrain?.rejectedShiftSerial??0,score:this.score.score,hits:this.score.hits,combo:this.score.combo,bestCombo:this.score.bestCombo,bestScore:this.bestScore,legacyBestScore:this.legacyBestScore,durability:this.durability,speed:Math.abs(speed),boostLeft:this.boost.left,boostCooldown:this.boost.cooldown,countdown:this.countdown,resetProgress:this.resetProgress,repairProgress:this.repairProgress,repairName:this.repairName,guide:this.guide,targets:[...this.targets.entries()].map(([id,t])=>({id,name:t.name,angle:bearing(position,t.position,yaw),remaining:t.expires-this.elapsed}))};}
}
