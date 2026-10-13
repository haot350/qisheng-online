import type {NpcPose} from './npc-roster.ts';

export type NpcMotionPose='walk-a'|'walk-b'|'run-a'|'run-b';
export const NPC_MOTION_POSES=['walk-a','walk-b','run-a','run-b'] as const;
export const NPC_GAIT={walkCycle:1.3,runCycle:2.1,runThreshold:2.55,minSpeed:.12,maxSpeed:8} as const;
export type NpcMotionSample={pose:NpcMotionPose|'idle';speed:number;phase:number;bob:number};

/** Advance the stride from travelled metres, never from the animation clock. */
export class NpcLocomotion {
 private previous:{x:number;z:number}|null=null;
 private phase=0;
 private speed=0;
 private pose:NpcMotionPose|'idle'='idle';
 private bob=0;
 update(dt:number,intendedSpeed:number,position:{x:number;z:number}):NpcMotionSample {
  // Combat and rendering refresh the rig with dt=0 after its movement update.
  // Such refreshes must not consume another stride or switch back to idle.
  if(dt<=0)return this.read();
  const previous=this.previous;
  this.previous={x:position.x,z:position.z};
  const distance=previous?Math.hypot(position.x-previous.x,position.z-previous.z):0;
  const valid=Number.isFinite(distance)&&Number.isFinite(dt)&&Number.isFinite(intendedSpeed);
  const maximum=NPC_GAIT.maxSpeed*dt+.035;
  this.speed=valid&&intendedSpeed>NPC_GAIT.minSpeed&&distance<=maximum?distance/dt:0;
  if(this.speed<NPC_GAIT.minSpeed){this.speed=0;this.phase=0;this.pose='idle';this.bob=0;return this.read();}
  const running=this.speed>=NPC_GAIT.runThreshold;
  this.phase=(this.phase+distance/(running?NPC_GAIT.runCycle:NPC_GAIT.walkCycle))%1;
  this.pose=`${running?'run':'walk'}-${this.phase<.5?'a':'b'}`;
  this.bob=Math.abs(Math.sin(this.phase*Math.PI*2))*(running?.014:.008);
  return this.read();
 }
 reset(position?:{x:number;z:number}){
  this.previous=position?{x:position.x,z:position.z}:null;
  this.phase=0;this.speed=0;this.pose='idle';this.bob=0;
 }
 private read():NpcMotionSample{return{pose:this.pose,speed:this.speed,phase:this.phase,bob:this.bob};}
}

/** Special abilities lower the gun; ordinary combat keeps its real moving legs. */
export function chooseNpcPose(motion:NpcMotionSample,state:{suppressed:number;skill?:'sprint'|'callout';attackPhase?:string;reloading?:boolean},hasSkill:boolean):NpcPose {
 if(state.suppressed>0)return'idle';
 if(hasSkill&&state.skill){return state.skill==='sprint'&&motion.speed>=NPC_GAIT.runThreshold?motion.pose:'skill';}
 if(state.reloading||state.attackPhase==='reload')return'reload';
 const combat=state.attackPhase==='aim'||state.attackPhase==='fire'||state.attackPhase==='cooldown';
 if(motion.pose!=='idle')return ('combat-'+motion.pose) as NpcPose;
 return combat?'attack':'idle';
}

export function isNpcMovingPose(pose:NpcPose){return pose.startsWith('walk-')||pose.startsWith('run-')||pose.startsWith('combat-walk-')||pose.startsWith('combat-run-');}
export function isNpcArmedPose(pose:NpcPose){return pose==='attack'||pose.startsWith('combat-walk-')||pose.startsWith('combat-run-');}
