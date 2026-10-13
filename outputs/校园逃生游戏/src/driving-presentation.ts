import type {Phase,Vec3} from './types';
/** Same physical velocity determines prefetch, even while reversing or sliding. */
export function drivingPrefetch(position:Vec3,velocity:Vec3,forward:Vec3):Vec3 {
 const speed=Math.hypot(velocity[0],velocity[2]);
 const direction=speed>.1?velocity:forward,length=Math.hypot(direction[0],direction[2])||1;
 const distance=Math.max(35,Math.min(115,speed*3.5));
 return [position[0]+direction[0]/length*distance,position[1],position[2]+direction[2]/length*distance];
}
export function drivingCameraGain(speed:number,reducedMotion:boolean){return reducedMotion?0:Math.max(0,Math.min(1,(Math.abs(speed)*3.6-60)/60));}
export function canSelectTransmission(phase:Phase){return phase==='menu'||phase==='paused';}
/** Four-cylinder firing frequency derived from the authoritative drivetrain RPM. */
export function engineSoundParameters(speed:number,throttle:number,rpm:number,shiftLeft:number){
 const s=Number.isFinite(speed)?Math.min(45,Math.abs(speed)):0,t=Number.isFinite(throttle)?Math.max(0,Math.min(1,throttle)):0;
 const revolutions=Number.isFinite(rpm)?Math.max(900,Math.min(7200,rpm)):900;
 return {frequency:revolutions/30,cutoff:250+t*490+revolutions*.09,gain:(.026+t*.025+Math.min(.015,s*.0007))*(shiftLeft>0?.65:1),road:Math.min(.018,s*.0007)};
}
