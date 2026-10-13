/** Arcade drivetrain tuning; dimensions and authored vehicle assets stay in vehicle-definition.json. */
export const DRIVING_TUNING=Object.freeze({
 normalSpeed:75/3.6,boostSpeed:100/3.6,reverseSpeed:4,
 linearDamping:.025,coastDeceleration:.15,coastEnter:.2,footBrakeDeceleration:7.5,brakeFrontBias:.6,brakeEnter:.12,brakeRelease:.10,ccdSubsteps:2,
 npcMass:72,npcContactTolerance:.001,npcMaximumHorizontalImpulse:1008,
 maximumLateralAcceleration:10,steeringResponse:9,
 ratios:[4.8,3.1,2.2,1.7,1.35,1.08] as readonly number[],reverseRatio:4,finalDrive:6.2,
 idleRpm:900,redline:6500,limiterStart:6200,upshiftRpm:4800,downshiftRpm:2200,
 shiftDuration:.18,shiftInterval:.45,directionChangeSpeed:.35,efficiency:.88,speedFade:.6,
 // Nm at rpm; low-rpm/high-gear pull is deliberately weak, without a stall mechanic.
 torqueCurve:[[900,126],[1500,234],[2500,324],[4000,360],[5500,324],[6500,216]] as readonly (readonly [number,number])[],
});
export function steeringLimit(speed:number,wheelbase:number){
 const v=Math.abs(Number.isFinite(speed)?speed:0),ordinary=.48/(1+v*.045);
 return Math.min(ordinary,Math.atan(wheelbase*DRIVING_TUNING.maximumLateralAcceleration/Math.max(1,v*v)));
}
export function engineTorque(rpm:number){
 const curve=DRIVING_TUNING.torqueCurve,r=Number.isFinite(rpm)?rpm:DRIVING_TUNING.idleRpm;
 if(r<=curve[0][0])return curve[0][1];
 for(let i=1;i<curve.length;i++){const [x1,y1]=curve[i],[x0,y0]=curve[i-1];if(r<=x1)return y0+(y1-y0)*(r-x0)/(x1-x0);}
 return curve[curve.length-1][1];
}
