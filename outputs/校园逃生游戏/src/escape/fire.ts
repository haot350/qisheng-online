import {ESCAPE_DIFFICULTIES,ESCAPE_RULES} from './config.ts';
import type {EscapeDifficulty} from './types.ts';
import {NPC_COMBAT_PROFILES} from '../npc-combat-motion.ts';
export type EscapeAttackPhase='search'|'aim'|'fire'|'cooldown'|'reload';
export class EscapeAttack {
 phase:EscapeAttackPhase='search';left=0;remaining=0;hasFired=false;firstInBurst=true;
 tick(dt:number){if(this.phase==='cooldown'){this.left=Math.max(0,this.left-dt);if(this.left<1e-8){this.left=0;this.phase='search';}}}
 begin(automatic:boolean,difficulty:EscapeDifficulty='easy'){const p=NPC_COMBAT_PROFILES[difficulty];this.phase='aim';this.left=this.hasFired?p.nextAim:p.initialAim;this.remaining=automatic?p.burst:1;this.firstInBurst=true;}
 aim(dt:number){if(this.phase==='aim'){this.left=Math.max(0,this.left-dt);if(this.left<1e-8){this.left=0;this.phase='fire';}}}
 cancel(phase:EscapeAttackPhase='search'){if(this.phase==='cooldown'&&phase==='search')return;this.phase=phase;this.left=0;this.remaining=0;this.firstInBurst=true;}
 shot(random:()=>number,difficulty:EscapeDifficulty='easy'){const p=NPC_COMBAT_PROFILES[difficulty];this.hasFired=true;this.firstInBurst=false;if(--this.remaining<=0){this.phase='cooldown';this.left=p.cooldownMin+random()*(p.cooldownMax-p.cooldownMin);}}
 reset(){this.phase='search';this.left=0;this.remaining=0;this.hasFired=false;this.firstInBurst=true;}
}
export interface EscapeAttacker {id:number;eligible:boolean;reloading:boolean;automatic:boolean;attack:EscapeAttack;ready?:boolean;}
export const FIRE_READINESS={wait:1.25,retry:.35} as const;
export class EscapeFireCoordinator {
 time=0;private lastFirst=-Infinity;private seats=new Set<number>();private waiting=new Map<number,{time:number;rank:number}>();private nextRank=0;private agents=new Map<number,EscapeAttacker>();private unready=new Map<number,number>();private retryAt=new Map<number,number>();private grants=new Map<number,number>();private nextGrant=0;
 constructor(public difficulty:EscapeDifficulty='standard',public maxFire=ESCAPE_DIFFICULTIES[difficulty].maxFire){}
 reset(){this.time=0;this.lastFirst=-Infinity;this.seats.clear();this.waiting.clear();this.nextRank=0;this.agents.clear();this.unready.clear();this.retryAt.clear();this.grants.clear();this.nextGrant=0;}
 release(id:number){this.seats.delete(id);this.waiting.delete(id);this.unready.delete(id);this.grants.delete(id);}
 update(dt:number,agents:EscapeAttacker[],options:{paused?:boolean;blocked?:boolean;grace?:boolean}={}){
  if(options.paused||options.blocked)return;if(!Number.isFinite(dt)||dt<0)throw new RangeError('射击时间步长必须是有限非负数。');this.time+=dt;this.agents=new Map(agents.map(a=>[a.id,a]));for(const id of this.seats)if(!this.agents.has(id))this.release(id);for(const id of this.waiting.keys())if(!this.agents.has(id))this.waiting.delete(id);
  for(const id of this.retryAt.keys())if(!this.agents.has(id))this.retryAt.delete(id);
  for(const a of [...agents].sort((a,b)=>a.id-b.id)){
   a.attack.tick(dt);
   if(options.grace||!a.eligible||a.reloading){this.release(a.id);a.attack.cancel(a.reloading?'reload':'search');continue;}
   if(this.seats.has(a.id)&&a.attack.phase!=='aim'&&a.attack.phase!=='fire')this.release(a.id);
   // Raising starts after receiving a seat. Only a completed aim cycle can time
   // out, otherwise testing readiness before ownership would prevent raising.
   if(this.seats.has(a.id)&&a.attack.phase==='fire'&&a.ready===false){
    const waited=(this.unready.get(a.id)??0)+dt;this.unready.set(a.id,waited);
    if(waited>=FIRE_READINESS.wait){this.release(a.id);a.attack.cancel();this.retryAt.set(a.id,this.time+FIRE_READINESS.retry);}
   }else this.unready.delete(a.id);
   if(!this.seats.has(a.id)&&a.attack.phase!=='cooldown'&&!this.waiting.has(a.id))this.waiting.set(a.id,{time:this.time,rank:this.nextRank++});
  }
  if(options.grace)return;
  const candidates=agents.filter(a=>a.eligible&&!a.reloading&&!this.seats.has(a.id)&&a.attack.phase!=='cooldown'&&(this.retryAt.get(a.id)??0)<=this.time).sort((a,b)=>(this.waiting.get(a.id)?.time??Infinity)-(this.waiting.get(b.id)?.time??Infinity)||(this.waiting.get(a.id)?.rank??a.id)-(this.waiting.get(b.id)?.rank??b.id));
  for(const a of candidates){if(this.seats.size>=this.maxFire)break;this.seats.add(a.id);this.grants.set(a.id,this.nextGrant++);this.waiting.delete(a.id);a.attack.begin(a.automatic,this.difficulty);}for(const a of agents)if(this.seats.has(a.id))a.attack.aim(dt);
 }
 owns(id:number){return this.seats.has(id);}
 canFire(id:number,attack:EscapeAttack=this.agents.get(id)?.attack!){
  if(!attack||this.agents.get(id)?.ready===false||!this.owns(id)||attack.phase!=='fire')return false;
  if(!attack.firstInBurst)return true;
  if(this.time-this.lastFirst<ESCAPE_RULES.firstShotGap-1e-8)return false;
  // Seat admission alone is insufficient: polling low ids first otherwise lets
  // their next burst repeatedly steal a shared first-shot slot from older seats.
  return ![...this.seats].some(other=>other!==id&&(this.grants.get(other)??Infinity)<(this.grants.get(id)??Infinity)&&this.agents.get(other)?.ready!==false&&this.agents.get(other)?.attack.phase==='fire'&&this.agents.get(other)?.attack.firstInBurst);
 }
 fired(id:number,random:()=>number=Math.random){const a=this.agents.get(id);if(!a||!this.canFire(id,a.attack))return false;if(a.attack.firstInBurst)this.lastFirst=this.time;a.attack.shot(random,this.difficulty);if(a.attack.phase==='cooldown')this.release(id);return true;}
 shot(id:number,attack:EscapeAttack,random:()=>number){if(!this.canFire(id,attack))return false;if(attack.firstInBurst)this.lastFirst=this.time;attack.shot(random,this.difficulty);if(attack.phase==='cooldown')this.release(id);return true;}
 get active(){return this.seats.size;}
 get priority(){return [...this.waiting].sort((a,b)=>a[1].time-b[1].time||a[1].rank-b[1].rank).map(([id])=>id);}
}
