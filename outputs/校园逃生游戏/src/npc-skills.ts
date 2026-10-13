import type {Vec3} from './types.ts';
import {DRIVE_AI,type NPCRegion} from './driving-ai.ts';

export type NpcSkillKind='sprint'|'callout';
export const NPC_SKILLS=Object.freeze({grace:10,sprint:{windup:.6,duration:1.2,speed:5.4,cooldown:10,minDistance:10,maxDistance:24},callout:{windup:1.2,duration:0,cooldown:20,minDistance:8,maxDistance:32,allyDistance:45,memory:5}});
/** Simulation-time state: interruption costs the full cooldown and grants no immunity. */
export class NpcSkill {
 phase:'ready'|'windup'|'active'|'cooldown'='ready';left=0;
 constructor(public kind:NpcSkillKind){}
 get busy(){return this.phase==='windup'||this.phase==='active';}
 begin(){if(this.phase!=='ready')return false;this.phase='windup';this.left=NPC_SKILLS[this.kind].windup;return true;}
 tick(dt:number){
  if(this.phase==='ready'||(this.phase==='active'&&this.kind==='callout'))return false;
  this.left=Math.max(0,this.left-Math.max(0,dt));if(this.left>1e-8)return false;
  if(this.phase==='windup'){this.phase='active';this.left=NPC_SKILLS[this.kind].duration;return true;}
  if(this.phase==='active')this.complete();else{this.phase='ready';this.left=0;}return false;
 }
 complete(){this.phase='cooldown';this.left=NPC_SKILLS[this.kind].cooldown;}
 interrupt(){if(this.busy)this.complete();}
 recover(){this.complete();}
}
export class TeamInvestigation {
 target:Vec3|null=null;left=0;
 receive(point:Vec3,ttl=NPC_SKILLS.callout.memory){this.target=[...point];this.left=ttl;}
 clear(){this.target=null;this.left=0;}
 tick(dt:number,position:Vec3,sees:boolean){if(!this.target)return;if(sees||Math.hypot(position[0]-this.target[0],position[2]-this.target[2])<1){this.clear();return;}this.left=Math.max(0,this.left-dt);if(this.left<=1e-8)this.clear();}
}
/** Regional commands obey the same outer leash as voluntary pursuit, along the whole path. */
export function calloutPathInRegion(region:NPCRegion,points:readonly Vec3[],target:Vec3){
 if(points.length<2||Math.hypot(points.at(-1)![0]-target[0],points.at(-1)![2]-target[2])>1.5)return false;
 return points.every(p=>Math.hypot(p[0]-region.home[0],p[2]-region.home[2])<=DRIVE_AI.leashRadius&&Math.abs(p[1]-target[1])<.8);
}
