import type {Vec3,AttackPhase} from './types.ts';

export type NPCRegion={npcId:number;id:string;label:string;home:Vec3;spawnPoints:Vec3[];respawnPoints?:Vec3[];patrolPoints:Vec3[]};
export const DRIVE_AI=Object.freeze({coreRadius:32,leashRadius:44,outsideTime:6,patrolSpeed:2,chaseSpeed:3.4,sight:38,memory:3,hearing:18,boostHearing:28,hearingSpeed:2,returnWait:2,slots:2,firstShotGap:.45,initialAim:.9,nextAim:.55,burst:2,cooldownMin:1.8,cooldownMax:2.6});
const horizontal=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
/** Only voluntary movement is leashed; physical flight never consults this state. */
export class DrivingPatrol {
 state:'patrol'|'investigate'|'chase'|'return'='patrol';sees=false;memory=0;outside=0;wait=0;reacquire=0;target:Vec3|null=null;index:number;direction:number;spawn:Vec3;
 constructor(public region:NPCRegion,private random:()=>number){this.spawn=[...region.spawnPoints[Math.floor(random()*region.spawnPoints.length)]];this.index=Math.floor(random()*region.patrolPoints.length);this.direction=random()<.5?-1:1;}
 recover(){this.state='return';this.sees=false;this.memory=0;this.outside=0;this.target=null;this.wait=0;this.reacquire=0;}
 reenter(point:Vec3){this.spawn=[...point];this.state='patrol';this.sees=false;this.memory=0;this.outside=0;this.target=null;this.wait=1;this.reacquire=1.2;this.index=Math.floor(this.random()*this.region.patrolPoints.length);this.direction=this.random()<.5?-1:1;}
 canSense(car:Vec3){return this.state!=='return'&&this.reacquire<=0&&horizontal(car,this.region.home)<=(this.state==='patrol'?DRIVE_AI.coreRadius:DRIVE_AI.leashRadius);}
 receiveCallout(point:Vec3,ttl=5){
  if(this.state==='return'||this.sees||this.reacquire>0||horizontal(point,this.region.home)>DRIVE_AI.leashRadius)return false;
  this.state='investigate';this.sees=false;this.target=[...point];this.memory=ttl;this.outside=0;this.wait=0;return true;
 }
 update(dt:number,npc:Vec3,car:Vec3,sense?:{sees:boolean;hears:boolean}){
  this.wait=Math.max(0,this.wait-dt);this.reacquire=Math.max(0,this.reacquire-dt);this.memory=Math.max(0,this.memory-dt);
  if(this.state==='return'){
   if(horizontal(npc,this.region.home)<1){this.state='patrol';this.wait=DRIVE_AI.returnWait;this.reacquire=DRIVE_AI.returnWait;this.index=Math.floor(this.random()*this.region.patrolPoints.length);}
   return;
  }
  if(this.state!=='patrol'){
   const distance=horizontal(car,this.region.home);this.outside=distance>DRIVE_AI.coreRadius?this.outside+dt:0;
   if(distance>DRIVE_AI.leashRadius||this.outside>=DRIVE_AI.outsideTime||this.memory===0){this.recover();return;}
  }
  if(sense){
   this.sees=this.canSense(car)&&sense.sees;
   if(this.sees){this.state='chase';this.memory=DRIVE_AI.memory;this.target=[...car];}
   else if(this.canSense(car)&&sense.hears){if(this.state==='patrol')this.state='investigate';this.memory=DRIVE_AI.memory;this.target=[...car];}
  }
  if(this.state==='patrol'&&this.wait===0&&horizontal(npc,this.region.patrolPoints[this.index])<.8){this.index=(this.index+this.direction+this.region.patrolPoints.length)%this.region.patrolPoints.length;this.wait=1+this.random();}
 }
 get destination():Vec3{return this.state==='return'?this.region.home:this.target??this.region.patrolPoints[this.index];}
 get speed(){return this.wait>0?0:this.state==='chase'||this.state==='investigate'?DRIVE_AI.chaseSpeed:DRIVE_AI.patrolSpeed;}
}

/** Cooldown advances independently of ownership of one of the two attack seats. */
export class DrivingAttack {
 phase:AttackPhase='search';left=0;remaining=0;hasFired=false;firstInBurst=true;
 tick(dt:number){if(this.phase==='cooldown'){this.left=Math.max(0,this.left-dt);if(this.left<1e-8){this.left=0;this.phase='search';}}}
 begin(automatic:boolean){this.phase='aim';this.left=this.hasFired?DRIVE_AI.nextAim:DRIVE_AI.initialAim;this.remaining=automatic?DRIVE_AI.burst:1;this.firstInBurst=true;}
 aim(dt:number){if(this.phase==='aim'){this.left=Math.max(0,this.left-dt);if(this.left<1e-8){this.left=0;this.phase='fire';}}}
 cancel(phase:AttackPhase='search'){if(this.phase==='cooldown'&&phase==='search')return;this.phase=phase;this.left=0;this.remaining=0;this.firstInBurst=true;}
 shot(random:()=>number){this.hasFired=true;this.firstInBurst=false;if(--this.remaining<=0){this.phase='cooldown';this.left=DRIVE_AI.cooldownMin+random()*(DRIVE_AI.cooldownMax-DRIVE_AI.cooldownMin);}}
}
export type DrivingAttacker={id:number;eligible:boolean;reloading:boolean;automatic:boolean;attack:DrivingAttack};
/** Allocate after all sensing/movement, with waiting age independent of array order. */
export class DrivingFireCoordinator {
 time=0;private lastFirst=-Infinity;private seats=new Set<number>();private waiting=new Map<number,number>();private nextRank=0;private ranks=new Map<number,number>();
 reset(){this.time=0;this.lastFirst=-Infinity;this.seats.clear();this.waiting.clear();this.ranks.clear();this.nextRank=0;}
 release(id:number){this.seats.delete(id);this.waiting.delete(id);this.ranks.delete(id);}
 update(dt:number,agents:DrivingAttacker[]){
  this.time+=dt;
  for(const a of [...agents].sort((a,b)=>a.id-b.id)){a.attack.tick(dt);if(!a.eligible||a.reloading){this.release(a.id);a.attack.cancel(a.reloading?'reload':'search');continue;}
   if(this.seats.has(a.id)&&a.attack.phase!=='aim'&&a.attack.phase!=='fire')this.release(a.id);
   if(!this.seats.has(a.id)&&a.attack.phase!=='cooldown'&&!this.waiting.has(a.id)){this.waiting.set(a.id,this.time);this.ranks.set(a.id,this.nextRank++);}
  }
  // ids break a truly simultaneous initial arrival; subsequent rounds use queue age.
  const eligible=agents.filter(a=>a.eligible&&!a.reloading&&!this.seats.has(a.id)&&a.attack.phase!=='cooldown').sort((a,b)=>(this.waiting.get(a.id)??Infinity)-(this.waiting.get(b.id)??Infinity)||(this.ranks.get(a.id)??a.id)-(this.ranks.get(b.id)??b.id));
  for(const a of eligible){if(this.seats.size>=DRIVE_AI.slots)break;this.seats.add(a.id);this.waiting.delete(a.id);this.ranks.delete(a.id);a.attack.begin(a.automatic);}
  for(const a of agents)if(this.seats.has(a.id))a.attack.aim(dt);
 }
 owns(id:number){return this.seats.has(id);}
 canFire(id:number,attack:DrivingAttack){return this.owns(id)&&attack.phase==='fire'&&(!attack.firstInBurst||this.time-this.lastFirst>=DRIVE_AI.firstShotGap-1e-8);}
 shot(id:number,attack:DrivingAttack,random:()=>number){if(attack.firstInBurst)this.lastFirst=this.time;attack.shot(random);if(attack.phase==='cooldown')this.release(id);}
 get active(){return this.seats.size;}
 get priority(){return [...this.waiting].sort((a,b)=>a[1]-b[1]||(this.ranks.get(a[0])??a[0])-(this.ranks.get(b[0])??b[0])).map(([id])=>id);}
}
