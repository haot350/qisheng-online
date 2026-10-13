import type {NpcState,PlayerState,RoomSnapshot,SmokeState,Vec3} from './protocol';
import {distance,eyeAt,smokeOccludes} from './combat';

export interface VisibilityWorld {visible(a:Vec3,b:Vec3):boolean;rayDistance?(origin:Vec3,direction:Vec3,max:number):number;visionRayDistance?(origin:Vec3,direction:Vec3,max:number):number;visionGeometryVisible?(a:Vec3,b:Vec3):boolean;}
export const REPLICATION_VISIBILITY={lookAheadSeconds:.15,maxLookAhead:1,maxRange:420,cornerRange:25,cacheTicks:6} as const;
type Subject=Pick<PlayerState,'id'|'generation'|'position'> & Partial<Pick<PlayerState,'velocity'|'crouched'>>;
const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export function geometryVisible(world:VisibilityWorld,a:Vec3,b:Vec3){
 if(world.visionGeometryVisible)return world.visionGeometryVisible(a,b);
 const delta:Vec3=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],length=Math.hypot(...delta);
 // Movement LOS tolerates 8cm near its endpoint; replication must not reveal
 // a body sample still behind a complete wall when its shoulder touches it.
 if(length<.005)return true;
 if(world.visionRayDistance)return world.visionRayDistance(a,delta.map(v=>v/length) as Vec3,length)>=length-.005;
 if(world.rayDistance)return world.rayDistance(a,delta.map(v=>v/length) as Vec3,length)>=length-.005;
 return world.visible(a,b);
}
function ahead(velocity:Vec3|undefined):Vec3 {
 const v:Vec3=velocity?[velocity[0]*REPLICATION_VISIBILITY.lookAheadSeconds,0,velocity[2]*REPLICATION_VISIBILITY.lookAheadSeconds]:[0,0,0];
 const length=Math.hypot(v[0],v[2]);return length>REPLICATION_VISIBILITY.maxLookAhead?[v[0]*REPLICATION_VISIBILITY.maxLookAhead/length,0,v[2]*REPLICATION_VISIBILITY.maxLookAhead/length]:v;
}
function bodyPoints(subject:Subject):Vec3[]{const p=subject.position,h=subject.crouched?1.15:1.75;return [[p[0],p[1]+h-.10,p[2]],[p[0],p[1]+h*.58,p[2]],[p[0]-.28,p[1]+h*.65,p[2]],[p[0]+.28,p[1]+h*.65,p[2]],[p[0],p[1]+.20,p[2]]];}
export function sameSide(room:Pick<RoomSnapshot,'mode'|'variant'>,a:Pick<PlayerState,'team'>,b:Pick<PlayerState,'team'>){return room.mode==='coop'||room.variant!=='ffa'&&a.team!=='none'&&a.team===b.team;}
export function authorizedSpectate(room:RoomSnapshot,viewerId:string,requested:string|null):string|null {
 const self=room.players.find(p=>p.id===viewerId);if(!self||self.life==='alive'||self.life==='downed'||room.mode==='pvp'&&room.variant==='ffa')return null;
 const candidates=room.players.filter(p=>p.id!==viewerId&&!p.departed&&p.connected&&p.life==='alive'&&sameSide(room,self,p));
 return candidates.find(p=>p.id===requested)?.id??candidates[0]?.id??null;
}

/** Server-only permissions; the client never supplies a visible-entity list. */
export class RecipientVisibility {
 private cache=new Map<string,{at:number;key:string;visible:boolean}>();
 private previousNpc=new Map<string,{tick:number;generation:number;position:Vec3}>();
 reset(){this.cache.clear();this.previousNpc.clear();}
 private clearRay(world:VisibilityWorld,a:Vec3,b:Vec3,smokes:SmokeState[]){return !smokeOccludes(a,b,smokes)&&geometryVisible(world,a,b);}
 permits(world:VisibilityWorld,observer:PlayerState,subject:Subject,smokes:SmokeState[],tick:number){
  if(distance(observer.position,subject.position)>REPLICATION_VISIBILITY.maxRange)return false;
  const key=JSON.stringify([observer.position,observer.velocity,observer.crouched,subject.position,subject.velocity,subject.crouched,subject.generation,smokes.map(s=>[s.id,s.position,s.radius])]);
  const cached=this.cache.get(subject.id);if(cached&&cached.key===key&&tick-cached.at<=REPLICATION_VISIBILITY.cacheTicks)return cached.visible;
  const eye=eyeAt(observer.position,observer.crouched),points=bodyPoints(subject);let visible=points.some(p=>this.clearRay(world,eye,p,smokes));
  if(!visible&&distance(observer.position,subject.position)<=REPLICATION_VISIBILITY.cornerRange){
   const viewerMove=ahead(observer.velocity),targetMove=ahead(subject.velocity),futureEye=add(eye,viewerMove);
   // Sweep endpoints may be used only when the corresponding movement itself
   // stays on this side of solid geometry. A complete wall/floor never authorizes.
   const futureEyeSafe=Math.hypot(...viewerMove)>.001&&geometryVisible(world,eye,futureEye);
   const futurePoints:Vec3[]=[];
   if(Math.hypot(...targetMove)>.001)for(const point of points){const next=add(point,targetMove);if(geometryVisible(world,point,next))futurePoints.push(next);}
   // eye→points was already rejected above in this same immutable simulation
   // step. Recheck only new sweep endpoints, with identical visibility bounds.
   visible=futurePoints.some(p=>this.clearRay(world,eye,p,smokes));
   if(!visible&&futureEyeSafe)visible=points.some(p=>this.clearRay(world,futureEye,p,smokes))||futurePoints.some(p=>this.clearRay(world,futureEye,p,smokes));
  }
  this.cache.set(subject.id,{at:tick,key,visible});if(this.cache.size>64)for(const [id,value]of this.cache)if(tick-value.at>60)this.cache.delete(id);return visible;
 }
 npcSubject(npc:NpcState,tick:number):Subject {
  const old=this.previousNpc.get(npc.id);let velocity:Vec3=[0,0,0];
  if(old&&old.generation===npc.generation&&tick>old.tick){const dt=(tick-old.tick)/60;velocity=[(npc.position[0]-old.position[0])/dt,0,(npc.position[2]-old.position[2])/dt];}
  this.previousNpc.set(npc.id,{tick,generation:npc.generation,position:[...npc.position]});return {...npc,velocity};
 }
 point(world:VisibilityWorld,observer:PlayerState,point:Vec3,smokes:SmokeState[],radius=0){
  const eye=eyeAt(observer.position,observer.crouched);if(distance(eye,point)>REPLICATION_VISIBILITY.maxRange+radius)return false;
  if(radius===0)return this.clearRay(world,eye,point,smokes);
  return [[0,0,0],[radius,0,0],[-radius,0,0],[0,radius,0],[0,-radius,0]].some(offset=>this.clearRay(world,eye,add(point,offset as Vec3),smokes));
 }
}
