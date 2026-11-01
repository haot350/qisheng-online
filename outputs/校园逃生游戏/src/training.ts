import type {EscapePlan,EscapeSite,EscapeVec3} from './escape/types';

export const TRAINING_STEPS=['look','move','aim','fire','reload','map','interact'] as const;
export type TrainingStep=typeof TRAINING_STEPS[number];
export type TrainingSnapshot={step:TrainingStep;index:number;total:number;complete:boolean;taskId:string;};
export const TRAINING_TASK_ID='practice-take';

/** A local lesson supplies an ordinary task to the existing EscapeRound. It
 * never adds another interaction, movement, magazine or scoring implementation. */
export function trainingPlan(site:EscapeSite,spawn:EscapeVec3,seed:number):EscapePlan{
 return {seed,difficulty:'easy',tasks:[{id:TRAINING_TASK_ID,kind:'take',label:'取回练习物资',sites:[site],radius:2.4,duration:0}],spawn:[...spawn],extraction:site,budgetSeconds:600,worstRouteMeters:0,fallback:false};
}
type Observation={position:EscapeVec3;yaw:number;pitch:number;aiming:boolean;ammo:number;weapon:string;reloading:boolean;active:boolean;};
/** Observes actual simulation results. UI clicks alone cannot finish a lesson. */
export class CombatTraining{
 private index=0;private previous:Observation|null=null;
 private moved=0;private looked=0;private fired=false;private reloadSeen=false;private reloadAmmo=0;private reloadWeapon='';private mapSeen=false;private interacted=false;
 read():TrainingSnapshot{return {step:TRAINING_STEPS[Math.min(this.index,TRAINING_STEPS.length-1)],index:this.index,total:TRAINING_STEPS.length,complete:this.index>=TRAINING_STEPS.length,taskId:TRAINING_TASK_ID};}
 private advance(){this.index++;this.moved=this.looked=0;}
 record(type:string,data:Record<string,unknown>){
  if(type==='task-complete'&&data.taskId===TRAINING_TASK_ID)this.interacted=true;
  if(this.read().step==='fire'&&type==='shot'&&this.index<TRAINING_STEPS.length)this.fired=true;
 }
 map(open:boolean){if(this.read().step!=='map'||this.read().complete)return;if(open)this.mapSeen=true;else if(this.mapSeen)this.advance();}
 observe(next:Observation){
  if(!next.active||this.read().complete){this.previous=null;return;}
  const old=this.previous;this.previous={...next,position:[...next.position]};
  if(!old)return;
  const step=this.read().step;
  if(step==='look'){const yaw=Math.atan2(Math.sin(next.yaw-old.yaw),Math.cos(next.yaw-old.yaw));this.looked+=Math.hypot(yaw,next.pitch-old.pitch);if(this.looked>=.32)this.advance();}
  else if(step==='move'){const distance=Math.hypot(next.position[0]-old.position[0],next.position[2]-old.position[2]);if(distance<.5)this.moved+=distance;if(this.moved>=2)this.advance();}
  else if(step==='aim'&&next.aiming)this.advance();
  else if(step==='fire'&&this.fired)this.advance();
  else if(step==='reload'){
   if(next.reloading&&!this.reloadSeen){this.reloadSeen=true;this.reloadAmmo=next.ammo;this.reloadWeapon=next.weapon;}
   if(this.reloadSeen&&!next.reloading&&next.weapon===this.reloadWeapon&&next.ammo>this.reloadAmmo)this.advance();
  }else if(step==='interact'&&this.interacted)this.advance();
 }
}
