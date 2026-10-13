import type {EscapeDifficulty,EscapeVec3} from './types.ts';
import type {WeaponId} from '../types.ts';
import {NPC_COMBAT_MOVEMENT,NPC_COMBAT_PROFILES} from '../npc-combat-motion.ts';

export type EscapeTacticalState='patrol'|'investigate'|'search'|'chase'|'cover'|'reload'|'peek'|'flank';
export interface TacticalAgent {id:number;position:EscapeVec3;known:EscapeVec3|null;sees:boolean;hasSeen:boolean;memory:number;active:boolean;busy:boolean;reloading:boolean;needsReload:boolean;attackPhase:string;patrolTarget:EscapeVec3;weapon?:WeaponId;}
export interface TacticalProbe {project:(point:EscapeVec3)=>EscapeVec3|null;route:(from:EscapeVec3,to:EscapeVec3)=>EscapeVec3[];safe:(points:EscapeVec3[])=>boolean;visible:(from:EscapeVec3,to:EscapeVec3)=>boolean;geometryVisible?:(from:EscapeVec3,to:EscapeVec3)=>boolean;obstacle?:(from:EscapeVec3,to:EscapeVec3)=>EscapeVec3|null;}
export interface TacticalDecision {state:EscapeTacticalState;goal:EscapeVec3;moving:boolean;canReload:boolean;}
interface Brain {probe?:{kind:string;candidates:number;valid:number;routes:number;accepted:boolean};state:EscapeTacticalState;goal:EscapeVec3|null;coverGoal:boolean;rejectedCover:Reservation|null;goalLeft:number;probeAge:number;reloadWait:number;searchIndex:number;blockedUntil:number;}
interface Reservation {point:EscapeVec3;until:number;}
const distance=(a:EscapeVec3,b:EscapeVec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const elevated=(p:EscapeVec3,y:number):EscapeVec3=>[p[0],p[1]+y,p[2]];
const copy=(p:EscapeVec3):EscapeVec3=>[...p];
/** Physical wall cover is checked from the current capsule, never from smoke. */
export function physicalCoverAt(position:EscapeVec3,known:EscapeVec3,geometryVisible:(from:EscapeVec3,to:EscapeVec3)=>boolean){const target=elevated(known,1.2);return !geometryVisible(elevated(position,1.5),target)&&!geometryVisible(elevated(position,.85),target);}
export const TACTICAL_RULES=Object.freeze({probeInterval:.12,replan:1.3,reservationDistance:1.4,coverRadii:[2,4,6],searchRadius:3,arrival:.65,preciseCoverArrival:.16,reloadFallback:1,failedGoalMemory:8,flankMax:{easy:0,standard:1,hard:2}});
/** Decisions use only the agent's own last observation. All movement remains physical. */
export class EscapeTactics {
 private time=0;private probeClock=0;private brains=new Map<number,Brain>();private reservations=new Map<number,Reservation>();private flankers=new Set<number>();private probeId:number|null=null;private difficulty:EscapeDifficulty='standard';
 reset(){this.time=0;this.probeClock=0;this.brains.clear();this.reservations.clear();this.flankers.clear();this.probeId=null;}
 release(id:number){this.brains.delete(id);this.reservations.delete(id);this.flankers.delete(id);}
 private brain(id:number){let b=this.brains.get(id);if(!b){b={state:'patrol',goal:null,coverGoal:false,rejectedCover:null,goalLeft:0,probeAge:Infinity,reloadWait:0,searchIndex:0,blockedUntil:0};this.brains.set(id,b);}return b;}
 update(dt:number,agents:readonly TacticalAgent[],difficulty:EscapeDifficulty){
  if(!Number.isFinite(dt)||dt<0)throw new RangeError('战术时间步长必须为有限非负数。');this.difficulty=difficulty;this.time+=dt;this.probeClock-=dt;this.probeId=null;
  const active=new Set(agents.filter(a=>a.active).map(a=>a.id));for(const id of this.brains.keys())if(!active.has(id))this.release(id);
  for(const [id,r]of this.reservations)if(r.until<=this.time||!active.has(id))this.reservations.delete(id);
  for(const a of agents){if(!a.active)continue;const b=this.brain(a.id);if((a.needsReload||a.reloading)&&b.state!=='cover'&&b.state!=='reload'){b.goal=null;b.coverGoal=false;b.goalLeft=0;b.probeAge=Infinity;this.reservations.delete(a.id);b.state=a.reloading?'reload':'cover';}b.goalLeft=Math.max(0,b.goalLeft-dt);b.probeAge+=dt;b.reloadWait=a.needsReload?b.reloadWait+dt:0;if(a.busy){b.goal=null;b.coverGoal=false;this.reservations.delete(a.id);}}
  const max=TACTICAL_RULES.flankMax[difficulty],qualified=agents.filter(a=>a.active&&a.sees&&a.known&&!a.busy&&!a.reloading&&!a.needsReload&&distance(a.position,a.known)>8&&distance(a.position,a.known)<30&&this.brain(a.id).blockedUntil<=this.time);
  const chosen=qualified.filter(a=>this.flankers.has(a.id)).sort((a,b)=>a.id-b.id).slice(0,max);for(const a of qualified.sort((a,b)=>this.brain(b.id).probeAge-this.brain(a.id).probeAge||a.id-b.id))if(chosen.length<max&&!chosen.includes(a))chosen.push(a);this.flankers=new Set(chosen.map(a=>a.id));
  if(this.probeClock<=0){const candidates=agents.filter(a=>a.active&&!a.busy&&a.known&&this.brain(a.id).goalLeft<=0&&this.brain(a.id).blockedUntil<=this.time&&((a.needsReload||a.reloading)&&!this.brain(a.id).goal||a.sees&&(this.flankers.has(a.id)||a.attackPhase==='cooldown')||!a.sees&&distance(a.position,a.known)<=1.7)).sort((a,b)=>Number(b.needsReload)-Number(a.needsReload)||this.brain(b.id).probeAge-this.brain(a.id).probeAge||a.id-b.id);if(candidates.length){this.probeId=candidates[0].id;this.probeClock=TACTICAL_RULES.probeInterval;}}
 }
 blocked(id:number){const b=this.brain(id);b.goal=null;b.coverGoal=false;b.goalLeft=0;b.blockedUntil=this.time+TACTICAL_RULES.failedGoalMemory;this.reservations.delete(id);this.flankers.delete(id);}
 private available(id:number,point:EscapeVec3,agents:readonly TacticalAgent[]){return ![...this.reservations].some(([other,r])=>other!==id&&distance(point,r.point)<TACTICAL_RULES.reservationDistance)&&!agents.some(a=>a.active&&a.id!==id&&distance(point,a.position)<.9);}
 private select(a:TacticalAgent,kind:'cover'|'flank'|'peek'|'search',probe:TacticalProbe,agents:readonly TacticalAgent[]){
  const audit={kind,candidates:0,valid:0,routes:0,accepted:false};this.brain(a.id).probe=audit;const target=a.known!;const dx=target[0]-a.position[0],dz=target[2]-a.position[2],length=Math.hypot(dx,dz)||1,forward=[dx/length,dz/length],side=a.id%2?1:-1,candidates:EscapeVec3[]=[];
  if(kind==='cover'){
   for(const radius of TACTICAL_RULES.coverRadii)for(let j=0;j<8;j++){const angle=j*Math.PI/4;candidates.push([a.position[0]+Math.cos(angle)*radius,a.position[1],a.position[2]+Math.sin(angle)*radius]);}
   if(this.difficulty!=='easy'&&probe.obstacle)for(let j=0;j<8;j++){const angle=j*Math.PI/4,dx=Math.cos(angle),dz=Math.sin(angle),wall=probe.obstacle(elevated(a.position,.85),[a.position[0]+dx*6,a.position[1]+.85,a.position[2]+dz*6]);if(!wall)continue;for(const sign of [-1,1])candidates.push([wall[0]-dx*.55-dz*.95*sign,a.position[1],wall[2]-dz*.55+dx*.95*sign]);}
  }
  else if(kind==='search'){const b=this.brain(a.id);for(let j=0;j<NPC_COMBAT_PROFILES[this.difficulty].searchNodes;j++){const angle=(b.searchIndex+j)*2.399963+a.id;candidates.push([target[0]+Math.cos(angle)*TACTICAL_RULES.searchRadius,target[1],target[2]+Math.sin(angle)*TACTICAL_RULES.searchRadius]);}}
  else for(const sign of [side,-side])for(const radius of kind==='flank'?[4,6]:[2,3])candidates.push([a.position[0]-forward[1]*radius*sign+forward[0]*(kind==='flank'?2:.4),a.position[1],a.position[2]+forward[0]*radius*sign+forward[1]*(kind==='flank'?2:.4)]);
  audit.candidates=candidates.length;const rejected=this.brain(a.id).rejectedCover,projected=candidates.map(raw=>{const p=probe.project(raw);if(!p||distance(p,raw)>1.6||Math.abs(p[1]-a.position[1])>.3||!this.available(a.id,p,agents)||kind==='cover'&&!!rejected&&rejected.until>this.time&&distance(p,rejected.point)<TACTICAL_RULES.arrival)return null;const sight=kind==='cover'?probe.geometryVisible??probe.visible:probe.visible,eye=sight(elevated(p,1.5),elevated(target,1.2)),body=sight(elevated(p,.85),elevated(target,1.2));if(kind==='cover'&&(eye||body)||kind==='peek'&&!eye)return null;return {point:p,score:distance(a.position,p)+(kind==='cover'?distance(target,p)<5?30:0:eye?0:3)};}).filter((p):p is {point:EscapeVec3;score:number}=>!!p).sort((x,y)=>x.score-y.score);
  audit.valid=projected.length;
  // Limit route/physical safety probes to three ranked candidates per planning turn.
  for(const p of projected.slice(0,3)){audit.routes++;const route=probe.route(a.position,p.point);if(!route.length||distance(route.at(-1)!,p.point)>.75||!probe.safe([a.position,...route]))continue;audit.accepted=true;this.reservations.set(a.id,{point:copy(p.point),until:this.time+3.5});return copy(p.point);}return null;
 }
 decide(a:TacticalAgent,probe:TacticalProbe,agents:readonly TacticalAgent[]):TacticalDecision {
  const b=this.brain(a.id),known=a.known;let moving=true,canReload=true;
  if(a.busy){b.state='chase';return {state:b.state,goal:known?copy(known):copy(a.position),moving:false,canReload:false};}
  if(!known){b.state='patrol';b.goal=null;b.coverGoal=false;this.reservations.delete(a.id);return {state:b.state,goal:copy(a.patrolTarget),moving:true,canReload:true};}
  const atGoal=b.goal&&distance(a.position,b.goal)<TACTICAL_RULES.arrival;
  if(a.needsReload||a.reloading){
   if(b.state!=='cover'&&b.state!=='reload'){b.goal=null;b.coverGoal=false;b.goalLeft=0;b.probeAge=Infinity;this.reservations.delete(a.id);}
   if(this.probeId===a.id&&!b.goal){b.goal=this.select(a,'cover',probe,agents);b.coverGoal=!!b.goal;b.goalLeft=TACTICAL_RULES.replan;b.probeAge=0;if(!b.goal){const dx=a.position[0]-known[0],dz=a.position[2]-known[2],length=Math.hypot(dx,dz)||1,retreat=probe.project([a.position[0]+dx/length*2,a.position[1],a.position[2]+dz/length*2]);if(retreat&&Math.abs(retreat[1]-a.position[1])<=.3&&this.available(a.id,retreat,agents)){const route=probe.route(a.position,retreat);if(route.length&&distance(route.at(-1)!,retreat)<.75&&probe.safe([a.position,...route]))b.goal=retreat;}}}
   const nearGoal=!!b.goal&&distance(a.position,b.goal)<TACTICAL_RULES.arrival,covered=b.coverGoal&&nearGoal&&physicalCoverAt(a.position,known,probe.geometryVisible??probe.visible);
   if(b.coverGoal&&b.goal&&!covered&&distance(a.position,b.goal)<TACTICAL_RULES.preciseCoverArrival){b.rejectedCover={point:copy(b.goal),until:this.time+TACTICAL_RULES.failedGoalMemory};b.goal=null;b.coverGoal=false;b.goalLeft=0;b.probeAge=Infinity;b.reloadWait=0;this.reservations.delete(a.id);if(b.probe)b.probe={...b.probe,accepted:false};}
   if(b.goal)this.reservations.set(a.id,{point:copy(b.goal),until:this.time+3.5});b.state=a.reloading?'reload':'cover';moving=!!b.goal&&!(b.coverGoal?covered:nearGoal);canReload=b.coverGoal?covered:b.reloadWait>=TACTICAL_RULES.reloadFallback;return {state:b.state,goal:b.goal?copy(b.goal):copy(a.position),moving,canReload};
  }
  if(!a.sees){
   this.flankers.delete(a.id);if(distance(a.position,known)>1.7){b.state=a.hasSeen?'search':'investigate';b.goal=null;b.coverGoal=false;return {state:b.state,goal:copy(known),moving:true,canReload:true};}
   if(this.probeId===a.id&&a.memory>0){b.goal=this.select(a,'search',probe,agents);b.coverGoal=false;b.goalLeft=1.8;b.probeAge=0;b.searchIndex++;}b.state=a.hasSeen?'search':'investigate';return {state:b.state,goal:b.goal?copy(b.goal):copy(known),moving:!!b.goal&&!atGoal,canReload:true};
  }
  // Movement and the fire scheduler run in parallel. Keep an accepted tactical
  // route while raising or firing the gun instead of reissuing a stationary goal.
  const profile=NPC_COMBAT_MOVEMENT[a.weapon??'m4a1'];
  const firing=a.attackPhase==='aim'||a.attackPhase==='fire';
  const kind=this.flankers.has(a.id)?'flank':(a.attackPhase==='cooldown'||firing)&&distance(a.position,known)<=profile.holdDistance+5?'peek':null;
  if(kind&&this.probeId===a.id){b.goal=this.select(a,kind,probe,agents);b.coverGoal=false;b.goalLeft=TACTICAL_RULES.replan;b.probeAge=0;}
  if(kind&&b.goal){b.state=kind;moving=distance(a.position,b.goal)>TACTICAL_RULES.arrival;return {state:b.state,goal:copy(b.goal),moving,canReload:true};}
  b.state='chase';b.goal=null;b.coverGoal=false;return {state:b.state,goal:copy(known),moving:distance(a.position,known)>profile.holdDistance,canReload:true};
 }
 read(id:number){const b=this.brains.get(id);return b?{state:b.state,goal:b.goal?copy(b.goal):null,coverGoal:b.coverGoal,rejectedCover:b.rejectedCover&&b.rejectedCover.until>this.time?{point:copy(b.rejectedCover.point),remaining:b.rejectedCover.until-this.time}:null,waiting:b.reloadWait,probe:b.probe?{...b.probe}:null}:null;}
 get reserved(){return [...this.reservations].map(([id,r])=>({id,point:copy(r.point)}));}
 get flankCount(){return this.flankers.size;}
}
