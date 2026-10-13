import type {WeaponId} from './types.ts';
import {WEAPONS} from './rules.ts';

export type NpcCombatDifficulty='easy'|'standard'|'hard';
export const NPC_COMBAT_PROFILES=Object.freeze({
 easy:{reactionMin:.70,reactionMax:1.15,initialAim:.90,nextAim:.55,burst:2,cooldownMin:1.8,cooldownMax:2.6,runSpeed:3.2,memory:7,searchNodes:3},
 standard:{reactionMin:.40,reactionMax:.65,initialAim:.70,nextAim:.45,burst:3,cooldownMin:1.4,cooldownMax:2.0,runSpeed:3.5,memory:8,searchNodes:4},
 hard:{reactionMin:.28,reactionMax:.45,initialAim:.55,nextAim:.35,burst:3,cooldownMin:1.2,cooldownMax:1.7,runSpeed:3.8,memory:9,searchNodes:5},
});
export const NPC_SENSE_RULES=Object.freeze({standingSight:40,crouchedSight:24,halfFov:1.28,closeSight:5,footstepMemory:3,shotMemory:4,shotRange:38,hearingWalk:9,hearingSprint:24,hearingCrouch:3});
export function npcReaction(difficulty:NpcCombatDifficulty,random:()=>number){const p=NPC_COMBAT_PROFILES[difficulty];return p.reactionMin+(p.reactionMax-p.reactionMin)*Math.max(0,Math.min(1,random()));}
/** -Z is the logical forward axis in both adapters. Perception never bypasses solid cover. */
export function npcSightEligible(from:NpcShotVector,to:NpcShotVector,yaw:number,crouched:boolean,clear:boolean){
 if(!clear||![...from,...to,yaw].every(Number.isFinite))return false;
 const dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2],distance=Math.hypot(dx,dy,dz);
 if(distance>=(crouched?NPC_SENSE_RULES.crouchedSight:NPC_SENSE_RULES.standingSight))return false;
 if(distance<NPC_SENSE_RULES.closeSight)return true;
 const desired=Math.atan2(-dx,-dz),difference=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
 return Math.abs(difference)<NPC_SENSE_RULES.halfFov;
}
/** The HUD, prediction and authoritative pellets read the same existing penalties. */
export function playerWeaponSpread(weapon:WeaponId,state:{aim:boolean;actualSpeed:number;sliding?:boolean}){
 return WEAPONS[weapon].spread*(state.aim?.55:1)*(state.actualSpeed>.1?1.7:1)*(state.sliding?1.65:1);
}

/** Stand-off distances only affect movement, never damage or firing accuracy. */
export const NPC_COMBAT_MOVEMENT:Readonly<Record<WeaponId,{holdDistance:number}>>={
 glock:{holdDistance:9},mp5:{holdDistance:6.5},m4a1:{holdDistance:13},
 ak47:{holdDistance:10},r870:{holdDistance:4.8},awm:{holdDistance:24},m249:{holdDistance:16},
};
export const NPC_MOVING_ACCURACY={walkSpeed:2.1,runSpeed:3.2,walkMultiplier:1.2,runMultiplier:1.6,response:9} as const;

export function npcMovingSpread(actualSpeed:number){
 const speed=Number.isFinite(actualSpeed)?Math.max(0,actualSpeed):0;
 if(speed<=NPC_MOVING_ACCURACY.walkSpeed)return 1+(NPC_MOVING_ACCURACY.walkMultiplier-1)*Math.min(1,speed/NPC_MOVING_ACCURACY.walkSpeed);
 const t=Math.min(1,(speed-NPC_MOVING_ACCURACY.walkSpeed)/(NPC_MOVING_ACCURACY.runSpeed-NPC_MOVING_ACCURACY.walkSpeed));
 return NPC_MOVING_ACCURACY.walkMultiplier+(NPC_MOVING_ACCURACY.runMultiplier-NPC_MOVING_ACCURACY.walkMultiplier)*t;
}

/** Smooth the real capsule velocity; intended speed must not punish blocked NPCs. */
export class NpcMovingAccuracy {
 private multiplier=1;
 update(dt:number,actualSpeed:number){
  if(!Number.isFinite(dt)||dt<0)throw new RangeError('NPC accuracy timestep must be finite and non-negative.');
  const target=npcMovingSpread(actualSpeed);
  this.multiplier=target+(this.multiplier-target)*Math.exp(-NPC_MOVING_ACCURACY.response*dt);
  if(Math.abs(this.multiplier-target)<.001)this.multiplier=target;
  return this.multiplier;
 }
 reset(){this.multiplier=1;}
 read(){return this.multiplier;}
}

export type NpcShotVector=[number,number,number];
const normalized=(v:NpcShotVector):NpcShotVector=>{const length=Math.hypot(...v)||1;return [v[0]/length,v[1]/length,v[2]/length];};
/** Shared standing aim error, followed by weapon spread, preserves the single-player random draw order. */
export function npcAimDirection(direction:NpcShotVector,movingMultiplier:number,target:{crouched:boolean;sprinting:boolean},random:()=>number):NpcShotVector{
 const error=((target.crouched?.055:.043)+(target.sprinting?.025:0))*movingMultiplier;
 return normalized(direction.map(value=>value+(random()-.5)*error*2) as NpcShotVector);
}
export function npcPelletDirection(direction:NpcShotVector,spread:number,movingMultiplier:number,random:()=>number):NpcShotVector{
 return normalized(direction.map(value=>value+(random()-.5)*spread*2*movingMultiplier) as NpcShotVector);
}
