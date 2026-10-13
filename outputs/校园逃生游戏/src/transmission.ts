import type {TransmissionMode} from './types';
import {DRIVING_TUNING as T,engineTorque} from './driving-tuning.ts';
import VEHICLE from './vehicle-definition.json' with {type:'json'};
export type TransmissionState={gear:number;rpm:number;transmission:TransmissionMode;shiftLeft:number;shiftSerial:number;rejectedShiftSerial:number};
export type TransmissionSample={speed:number;throttle:number;reverse:boolean;brake:number};
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n));
/** A clutch-free six-speed drivetrain, advanced by the existing fixed physics substep. */
export class Transmission {
 private state:TransmissionState={gear:1,rpm:T.idleRpm,transmission:'auto',shiftLeft:0,shiftSerial:0,rejectedShiftSerial:0};
 private interval=0;
 private forwardGear=1;
 private wheelRpm(speed:number){return Math.abs(speed)*60/(2*Math.PI*VEHICLE.physics.wheelRadius);}
 ratio(gear=this.state.gear){return gear<0?T.reverseRatio:T.ratios[gear-1]??0;}
 expectedRpm(speed:number,gear=this.state.gear){return this.wheelRpm(speed)*this.ratio(gear)*T.finalDrive;}
 read(speed?:number):TransmissionState{if(speed!==undefined)this.refresh(speed);return {...this.state};}
 private select(gear:number){if(gear===this.state.gear)return;this.state.gear=gear;if(gear>0)this.forwardGear=gear;this.state.shiftLeft=T.shiftDuration;this.state.shiftSerial++;this.interval=T.shiftInterval;}
 shift(direction:1|-1,speed:number){
  if(this.state.transmission!=='manual'||this.state.shiftLeft>0||this.interval>0)return false;
  const target=this.state.gear+direction;
  if(this.state.gear<1||target<1||target>T.ratios.length||this.expectedRpm(speed,target)>T.redline){this.state.rejectedShiftSerial++;return false;}
  this.select(target);return true;
 }
 setMode(mode:TransmissionMode,speed:number){
  if(mode===this.state.transmission)return;
  this.state.transmission=mode;
  if(this.state.gear>0){
   let best=1,distance=Infinity;
   for(let gear=1;gear<=T.ratios.length;gear++){const rpm=this.expectedRpm(speed,gear);if(rpm>T.redline)continue;const d=Math.abs(rpm-3500);if(d<distance){best=gear;distance=d;}}
   this.select(Math.abs(speed)<=T.directionChangeSpeed?1:best);
  }
  this.refresh(speed);
 }
 private refresh(speed:number){this.state.rpm=clamp(this.expectedRpm(speed),T.idleRpm,T.redline);}
 tick(sample:TransmissionSample,dt:number){
  const step=Number.isFinite(dt)?clamp(dt,0,.1):0;if(step===0)return this.read();
  this.state.shiftLeft=Math.max(0,this.state.shiftLeft-step);this.interval=Math.max(0,this.interval-step);
  const speed=Number.isFinite(sample.speed)?sample.speed:0;
  // Reverse and forward are requested with the existing pedals, only after braking to a near-stop.
  if(Math.abs(speed)<=T.directionChangeSpeed){
   if(sample.reverse&&sample.throttle>0)this.select(-1);
   else if(!sample.reverse&&sample.throttle>0&&this.state.gear<0)this.select(this.state.transmission==='manual'?this.forwardGear:1);
   else if(this.state.transmission==='auto'&&this.state.gear>1)this.select(1);
  }
  if(this.state.transmission==='auto'&&this.state.gear>0&&speed>=0&&!sample.reverse&&this.interval===0){
   const rpm=this.expectedRpm(speed);
   if(rpm>=T.upshiftRpm&&this.state.gear<T.ratios.length&&sample.throttle>.05&&sample.brake<.1)this.select(this.state.gear+1);
   else if(rpm<T.downshiftRpm&&this.state.gear>1&&this.expectedRpm(speed,this.state.gear-1)<=T.upshiftRpm)this.select(this.state.gear-1);
  }
  this.refresh(speed);return this.read();
 }
 /** Forward wheel force magnitude; caller handles direction and braking, never edits body velocity. */
 force(speed:number,throttle:number,boosted:boolean){
  if(this.state.shiftLeft>0||throttle<=0)return 0;
  const rpm=this.expectedRpm(speed),limiter=clamp((T.redline-rpm)/(T.redline-T.limiterStart),0,1);
  const limit=this.state.gear<0?T.reverseSpeed:boosted?T.boostSpeed:T.normalSpeed;
  const fraction=clamp((limit-Math.abs(speed))/T.speedFade,0,1),speedFade=fraction*(2-fraction);
  const boost=boosted&&this.state.gear>0?VEHICLE.physics.boostForce/VEHICLE.physics.engineForce:1;
  const torque=engineTorque(Math.max(T.idleRpm,rpm)),force=torque*this.ratio()*T.finalDrive*T.efficiency/VEHICLE.physics.wheelRadius*boost;
  return Math.min(boost>1?VEHICLE.physics.boostForce:VEHICLE.physics.engineForce,force)*clamp(throttle,0,1)*limiter*speedFade;
 }
 reset(){const transmission=this.state.transmission;this.state={gear:1,rpm:T.idleRpm,transmission,shiftLeft:0,shiftSerial:0,rejectedShiftSerial:0};this.interval=0;this.forwardGear=1;}
}