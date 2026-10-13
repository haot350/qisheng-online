/** Short physical drift: rear-wheel brake pulse, powered carry, then progressive grip recovery. */
export const HANDBRAKE_RULES={minimumSpeed:5,minimumSteer:.25,counterSteer:.2,minimumUp:.94,enter:.15,release:.5,slipRecovery:.18,driveRecovery:.25,maximumHold:1.1,pulseDuration:.22,carryTransition:.18,fadeStart:75/3.6,fadeEnd:100/3.6,softSlip:22*Math.PI/180,slipLookAhead:.12,maximumSlip:32*Math.PI/180,frictionSlip:3.8,sideFriction:1,rearFrictionSlip:.43,rearSideFriction:.45,brake:36,carryBrake:7,carryDrive:.55} as const;
export type HandbrakeSample={pressed:boolean;speed:number;steer:number;wheelContacts:number;rearContacts:boolean;upY:number;slipAngle:number};
export type HandbrakeStage='idle'|'pulse'|'carry'|'recover'|'brake';
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const approach=(value:number,target:number,change:number)=>value+Math.max(-change,Math.min(change,target-value));
export class HandbrakeControl {
 private previousSlip=0;private held=false;private elapsed=0;private age=0;private amount=0;private active=false;private spent=false;private turn=0;private drive=1;private brakeAmount=0;private currentStage:HandbrakeStage='idle';
 get assist(){return this.amount;}
 get pressed(){return this.held;}
 get rearDrive(){return this.drive;}
 /** Impulse at 60 Hz; the physics controller scales this by its actual substep. */
 get brake(){return this.brakeAmount;}
 get stage(){return this.currentStage;}
 reset(){this.held=false;this.previousSlip=this.elapsed=this.age=this.amount=this.turn=this.brakeAmount=0;this.active=this.spent=false;this.drive=1;this.currentStage='idle';}
 tick(sample:HandbrakeSample,dt:number){
  const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)),r=HANDBRAKE_RULES;
  if(step===0)return this.amount;
  const justPressed=sample.pressed&&!this.held;
  if(!sample.pressed||justPressed){this.elapsed=0;this.spent=false;}
  this.held=sample.pressed;if(this.held)this.elapsed+=step;
  const supported=sample.wheelContacts>=3&&sample.rearContacts&&sample.upY>=r.minimumUp;
  const finite=[sample.speed,sample.steer,sample.upY,sample.slipAngle].every(Number.isFinite);
  const safety=!finite||!supported||Math.abs(sample.slipAngle)>=r.maximumSlip;
  // A high-speed press is braking only for its entire press, even after it slows down.
  if(justPressed&&sample.speed>r.fadeEnd)this.spent=true;
  if(safety){this.active=false;this.spent=this.held;if(!finite)this.amount=0;}
  const eligible=this.held&&!this.spent&&this.elapsed<=r.maximumHold&&sample.speed>=r.minimumSpeed&&sample.speed<=r.fadeEnd&&Math.abs(sample.steer)>=r.minimumSteer&&supported&&finite;
  if(!this.active&&eligible){this.active=true;this.age=0;this.turn=Math.sign(sample.steer);}
  if(this.active){
   this.age+=step;
   const counter=Math.abs(sample.steer)>=r.counterSteer&&Math.sign(sample.steer)!==this.turn;
   if(!this.held||counter||this.elapsed>r.maximumHold||sample.speed<r.minimumSpeed||sample.speed>r.fadeEnd||safety){this.active=false;this.spent=this.held;}
  }
  // Predict a short part of the angular trend so tyre re-grip arrests inertia, not just the last sampled angle.
  const slip=Math.abs(sample.slipAngle),growing=finite?Math.max(0,(slip-this.previousSlip)/step):0,predicted=slip+growing*r.slipLookAhead;
  this.previousSlip=finite?slip:0;
  const speedAmount=clamp((r.fadeEnd-sample.speed)/(r.fadeEnd-r.fadeStart)),slipAmount=clamp((r.maximumSlip-predicted)/(r.maximumSlip-r.softSlip));
  const target=this.active?speedAmount*slipAmount:0;
  const recovery=!supported ? .12 : predicted>r.softSlip ? r.slipRecovery : r.release;
  this.amount=approach(this.amount,target,step/(target>this.amount?r.enter:recovery));

  if(this.amount<1e-8)this.amount=0;
  this.currentStage=this.active?(this.age<=r.pulseDuration?'pulse':'carry'):this.amount>0?'recover':this.held?'brake':'idle';
  const carry=clamp((this.age-r.pulseDuration)/r.carryTransition);
  const targetDrive=this.currentStage==='pulse'?0:this.currentStage==='carry'?r.carryDrive*carry:this.held&&this.currentStage==='brake'?0:1;
  this.drive=this.currentStage==='pulse'?0:approach(this.drive,targetDrive,step/r.driveRecovery);
  const targetBrake=this.currentStage==='pulse'?r.brake:this.currentStage==='carry'?r.brake+(r.carryBrake-r.brake)*carry:this.currentStage==='brake'?r.brake:0;
  this.brakeAmount=approach(this.brakeAmount,targetBrake,r.brake*step/.08);
  return this.amount;
 }
}