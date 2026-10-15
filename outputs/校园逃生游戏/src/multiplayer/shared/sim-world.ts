import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {init as initNavigation,importNavMesh,NavMeshQuery} from 'recast-navigation';
import type {MapManifest} from '../../types';
import type {Vec3} from './protocol';
import {storyCurbLift,storyDirectRoute} from '../../story-curb';
import {storyCorridorPath} from '../../story-corridor';
import {NavigationAvoidance,normalizeCampusRoute} from '../../navigation/avoidance';
import {VisionGeometry} from '../../vision-geometry';
import {StaticTriangleBlockers} from '../../triangle-blocker';
export const CAPSULE={standing:1.75,crouching:1.15,radius:.3,skin:.015,step:.42,stepDepth:.20,snap:.30,gravity:14,jump:4.1} as const;
const copyPoint=(p:Vec3):Vec3=>[...p];const v=(p:Vec3)=>new THREE.Vector3(...p);let initialized:Promise<unknown>|undefined;
type Actor={body:RAPIER.RigidBody;collider:RAPIER.Collider;controller:RAPIER.KinematicCharacterController;height:number;team:string;kind:'human'|'npc';};
export class SimWorld {
 readonly actors=new Map<string,Actor>();readonly physics:RAPIER.World;readonly query:NavMeshQuery;private avoidance=new NavigationAvoidance();private actorIds=new Map<string,number>();private actorSerial=0;private numericId(id:string){if(!this.actorIds.has(id))this.actorIds.set(id,++this.actorSerial);return this.actorIds.get(id)!;}private nav:ReturnType<typeof importNavMesh>['navMesh'];
 private vision:VisionGeometry;private blockers:StaticTriangleBlockers;private staticCollider:RAPIER.Collider;
 private visibilityCounters={proofHits:0,physicalFallbacks:0,visionQueries:0,learned:0,unmapped:0};
 visibilityQueryStats(){return {...this.visibilityCounters};}
 private constructor(readonly manifest:MapManifest,collision:ArrayBuffer,navData:Uint8Array,vision?:ArrayBuffer){const header=new Uint32Array(collision,0,2);if(collision.byteLength!==8+header[0]*4+header[1]*4)throw Error('Invalid collision binary');const positions=new Float32Array(collision,8,header[0]),indices=new Uint32Array(collision,8+header[0]*4,header[1]);this.physics=new RAPIER.World({x:0,y:-18,z:0});this.staticCollider=this.physics.createCollider(RAPIER.ColliderDesc.trimesh(positions,indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));this.blockers=new StaticTriangleBlockers(positions,indices);this.vision=new VisionGeometry(vision);this.nav=importNavMesh(navData).navMesh;this.query=new NavMeshQuery(this.nav);this.physics.step();}
 static async create(manifest:MapManifest,collision:ArrayBuffer,nav:Uint8Array,vision?:ArrayBuffer){initialized??=Promise.all([RAPIER.init(),initNavigation()]);await initialized;return new SimWorld(manifest,collision,nav,vision);}
 addActor(id:string,position:Vec3,team='none',kind:'human'|'npc'='human'){if(this.actors.has(id))this.removeActor(id);const body=this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()),collider=this.physics.createCollider(RAPIER.ColliderDesc.capsule((CAPSULE.standing-.6)/2,.3),body),controller=this.physics.createCharacterController(.015);controller.enableAutostep(.42,.20,false);controller.enableSnapToGround(.30);controller.setMaxSlopeClimbAngle(Math.PI*.27);controller.setMinSlopeSlideAngle(Math.PI*.30);this.actors.set(id,{body,collider,controller,height:1.75,team,kind});this.restore(id,position);}
 removeActor(id:string){const a=this.actors.get(id);if(!a)return;this.physics.removeCharacterController(a.controller);this.physics.removeRigidBody(a.body);this.actors.delete(id);this.avoidance.remove(this.numericId(id));this.actorIds.delete(id);}
 restore(id:string,point:Vec3){const a=this.actors.get(id);if(!a)return;const p={x:point[0],y:point[1]+a.height/2,z:point[2]};a.body.setTranslation(p,true);a.body.setNextKinematicTranslation(p);this.physics.propagateModifiedBodyPositionsToColliders();}
 /** Authorized remote poses are restored as one collision checkpoint. There is
  * no KCC movement, route shortcut or hidden-actor lookup in this operation. */
 restoreActors(poses:Iterable<{id:string;position:Vec3;crouched?:boolean}>){
  let changed=false;
  for(const pose of poses){const a=this.actors.get(pose.id);if(!a)continue;this.posture(a,pose.position,pose.crouched??a.height<1.5);const p={x:pose.position[0],y:pose.position[1]+a.height/2,z:pose.position[2]};a.body.setTranslation(p,true);a.body.setNextKinematicTranslation(p);changed=true;}
  if(changed)this.physics.propagateModifiedBodyPositionsToColliders();
 }
 private posture(a:Actor,point:Vec3,crouch:boolean){const nextHeight=crouch?1.15:1.75;if(nextHeight===a.height)return;const blocked=nextHeight>a.height&&this.physics.intersectionWithShape({x:point[0],y:point[1]+nextHeight/2,z:point[2]},{x:0,y:0,z:0,w:1},new RAPIER.Capsule((nextHeight-.6)/2,.3),RAPIER.QueryFilterFlags.ONLY_FIXED)!==null;if(blocked)return;this.physics.removeCollider(a.collider,true);a.height=nextHeight;a.collider=this.physics.createCollider(RAPIER.ColliderDesc.capsule((a.height-.6)/2,.3),a.body);}
 setTeam(id:string,team:string){const a=this.actors.get(id);if(a)a.team=team;}
 move(id:string,point:Vec3,desired:Vec3,crouch=false){const a=this.actors.get(id);if(!a)throw Error('Missing simulation actor');this.posture(a,point,crouch);
 a.body.setTranslation({x:point[0],y:point[1]+a.height/2,z:point[2]},true);this.physics.propagateModifiedBodyPositionsToColliders();const allowed=(c:RAPIER.Collider)=>{if(c.handle===a.collider.handle)return false;for(const other of this.actors.values())if(other.collider.handle===c.handle&&a.kind==='human'&&other.kind==='human'&&a.team!=='none'&&a.team===other.team)return false;return true;};a.controller.computeColliderMovement(a.collider,{x:desired[0],y:desired[1],z:desired[2]},undefined,undefined,allowed);let motion=a.controller.computedMovement();if(desired[1]<=0&&Math.hypot(motion.x,motion.z)<Math.hypot(desired[0],desired[2])*.75){const lift=storyCurbLift(this.physics,v(point),v(desired));if(lift>0){a.controller.computeColliderMovement(a.collider,{x:desired[0],y:Math.max(0,desired[1])+lift,z:desired[2]},undefined,undefined,allowed);motion=a.controller.computedMovement();}}
 let staticBlocked=false;for(let i=0;i<a.controller.numComputedCollisions();i++){const hit=a.controller.computedCollision(i);if(hit?.collider&&(hit.collider.parent()===null||hit.collider.parent()!.isFixed())&&hit.normal1.y<.98)staticBlocked=true;}this.avoidance.observe(this.numericId(id),v(point),v(desired),new THREE.Vector3(motion.x,motion.y,motion.z),staticBlocked,this.physics.timestep);const position:Vec3=[point[0]+motion.x,point[1]+motion.y,point[2]+motion.z];a.body.setNextKinematicTranslation({x:position[0],y:position[1]+a.height/2,z:position[2]});return {position,grounded:a.controller.computedGrounded(),crouched:a.height<1.5};}
 step(dt=1/60){this.avoidance.tick(dt);this.physics.timestep=dt;this.physics.propagateModifiedBodyPositionsToColliders();this.physics.step();}
 rayDistance(origin:Vec3,direction:Vec3,max:number){const hit=this.physics.castRay(new RAPIER.Ray({x:origin[0],y:origin[1],z:origin[2]},{x:direction[0],y:direction[1],z:direction[2]}),max,true,RAPIER.QueryFilterFlags.ONLY_FIXED);return hit?.timeOfImpact??max;}
 visible(a:Vec3,b:Vec3){const d=v(b).sub(v(a)),length=d.length();return length<.01||this.rayDistance(a,d.divideScalar(length).toArray() as Vec3,length)>=length-.08;}
 visionRayDistance(origin:Vec3,direction:Vec3,max:number){const physical=this.rayDistance(origin,direction,max);return Math.min(physical,this.vision.rayDistance({x:origin[0],y:origin[1],z:origin[2]},{x:direction[0],y:direction[1],z:direction[2]},physical));}
 /** Boolean LOS only: a strictly intersected immutable face proves blockage.
  * Accurate closest-distance APIs remain unchanged for bullets and effects. */
 visionGeometryVisible(a:Vec3,b:Vec3){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz);
  if(length<.005)return true;
  if(this.blockers.blocks(a,b)){this.visibilityCounters.proofHits++;return false;}
  const origin={x:a[0],y:a[1],z:a[2]},direction={x:dx/length,y:dy/length,z:dz/length};
  this.visibilityCounters.physicalFallbacks++;
  const hit=this.physics.castRayAndGetNormal(new RAPIER.Ray(origin,direction),length,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
  const physical=hit?.timeOfImpact??length;
  if(physical<length-.005){
   const result=hit?.collider.handle===this.staticCollider.handle&&hit.featureType===RAPIER.FeatureType.Face?this.blockers.remember(hit.featureId,a,b,physical):-1;
   if(result===1)this.visibilityCounters.learned++;else if(result===-1)this.visibilityCounters.unmapped++;
   return false;
  }
  this.visibilityCounters.visionQueries++;return this.vision.rayDistance(origin,direction,physical)>=length-.005;
 }
 visionVisible(a:Vec3,b:Vec3){const d=v(b).sub(v(a)),length=d.length();return length<.005||this.visionRayDistance(a,d.divideScalar(length).toArray() as Vec3,length)>=length-.005;}
 supportAt(point:Vec3,height=1.75){const hit=this.physics.castRayAndGetNormal(new RAPIER.Ray({x:point[0],y:point[1]+.14,z:point[2]},{x:0,y:-1,z:0}),.34,true,RAPIER.QueryFilterFlags.ONLY_FIXED);if(!hit||hit.normal.y<Math.cos(Math.PI*.27))return null;const ground=point[1]+.14-hit.timeOfImpact;if(Math.abs(ground-point[1])>.18)return null;const clear=this.physics.intersectionWithShape({x:point[0],y:ground+height/2+.025,z:point[2]},{x:0,y:0,z:0,w:1},new RAPIER.Capsule((height-.6)/2,.285),RAPIER.QueryFilterFlags.ONLY_FIXED)===null;return {height:ground,normalY:hit.normal.y,clear};}
 nearest(point:Vec3):Vec3{const r=this.query.findClosestPoint(v(point),{halfExtents:{x:2,y:1.2,z:2}});if(!r.success)return [...point];const p:Vec3=[r.point.x,r.point.y,r.point.z];const hit=this.physics.castRay(new RAPIER.Ray({x:p[0],y:p[1]+.65,z:p[2]},{x:0,y:-1,z:0}),1.5,true,RAPIER.QueryFilterFlags.ONLY_FIXED);if(hit)p[1]+= .65-hit.timeOfImpact;return p;}
 private groundHeight(point:THREE.Vector3){const hit=this.physics.castRay(new RAPIER.Ray({x:point.x,y:point.y+.65,z:point.z},{x:0,y:-1,z:0}),1.5,true,RAPIER.QueryFilterFlags.ONLY_FIXED);return hit?point.y+.65-hit.timeOfImpact:point.y;}
 path(a:Vec3,b:Vec3):Vec3[]{const from=v(a),to=v(b),corridor=storyCorridorPath(this.physics,from,to);if(corridor)return normalizeCampusRoute(from,to,corridor).map(p=>p.toArray() as Vec3);if(storyDirectRoute(this.physics,from,to))return [copyPoint(a),copyPoint(b)];const points=continuousCampusPath(this.query,this.manifest,from,to).map(p=>{const point=new THREE.Vector3(p.x,p.y,p.z);point.y=this.groundHeight(point);return point;});return normalizeCampusRoute(from,to,points).map(p=>p.toArray() as Vec3);}
 actorPath(id:string,a:Vec3,b:Vec3):Vec3[]{const route=this.path(a,b),next=route.find(p=>Math.hypot(p[0]-a[0],p[2]-a[2])>.1),key=this.numericId(id);if(!next||!this.avoidance.excludes(key,v(a),v(next)))return route;const direction=v(next).sub(v(a)).setY(0).normalize();for(const radius of [1.2,2.4,3.6])for(const angle of [Math.PI/2,-Math.PI/2,Math.PI*.75,-Math.PI*.75,Math.PI]){const candidate=v(a).addScaledVector(direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle),radius),near=this.query.findClosestPoint(candidate,{halfExtents:{x:.6,y:.35,z:.6}});if(!near.success)continue;const point=new THREE.Vector3(near.point.x,near.point.y,near.point.z);point.y=this.groundHeight(point);const q=point.toArray() as Vec3;if(Math.abs(q[1]-a[1])>.3||!this.supportAt(q)?.clear)continue;const first=this.path(a,q),second=this.path(q,b);if(first.length<2||second.length<2||!this.safeRoute(first))continue;const initial=first.find(p=>Math.hypot(p[0]-a[0],p[2]-a[2])>.1);if(initial&&!this.avoidance.excludes(key,v(a),v(initial)))return [...first,...second.slice(1)];}return [];}
 observeNavigation(id:string,from:Vec3,desired:Vec3,actual:Vec3,staticBlocked:boolean,dt:number){this.avoidance.observe(this.numericId(id),v(from),v(desired),v(actual),staticBlocked,dt);}

 safeRoute(points:Vec3[],standing=1.75){if(points.length<2)return false;for(let i=1;i<points.length;i++){const start=v(points[i-1]),end=v(points[i]),steps=Math.ceil(start.distanceTo(end)/.4);for(let n=0;n<=steps;n++){const point=start.clone().lerp(end,steps?n/steps:0).toArray() as Vec3;if(!this.supportAt(point,standing)?.clear)return false;}}return true;}
 floor(point:Vec3){const candidates=(this.manifest.floors??[]).filter(f=>point[0]>=f.bounds.min[0]-1.5&&point[0]<=f.bounds.max[0]+1.5&&point[2]>=f.bounds.min[2]-1.5&&point[2]<=f.bounds.max[2]+1.5);if(!candidates.length||point[1]<Math.min(...candidates.map(f=>f.elevation))-.35)return 0;return candidates.sort((a,b)=>Math.abs(point[1]-a.elevation)-Math.abs(point[1]-b.elevation))[0].id;}
 dispose(){for(const id of this.actors.keys())this.removeActor(id);this.query.destroy();this.nav.destroy();this.blockers.clear();this.vision.dispose();this.physics.free();}
}
export function continuousCampusPath(query:NavMeshQuery,manifest:MapManifest,from:THREE.Vector3,to:THREE.Vector3){
 // Recast's nearest polygon may alternate between adjacent treads during frequent replans.
 // Continue along the surveyed stair centreline until the landing, with physical movement
 // still handled by the same capsule controller. Never reposition an actor onto this path.
 const closest=(points:THREE.Vector3[],point:THREE.Vector3)=>{
  let result:{segment:number;projection:THREE.Vector3;distance:number;progress:number}|undefined;
  for(let i=0;i<points.length-1;i++){
   const a=points[i],ab=points[i+1].clone().sub(a),length=ab.lengthSq();
   const t=length?THREE.MathUtils.clamp(point.clone().sub(a).dot(ab)/length,0,1):0,projection=a.clone().addScaledVector(ab,t),distance=point.distanceTo(projection);
   if(!result||distance<result.distance)result={segment:i,projection,distance,progress:i+t};
  }
  return result!;
 };
 let match:(ReturnType<typeof closest>&{points:THREE.Vector3[]})|undefined;
 for(const route of manifest.stairRoutes??[]){
  const points=route.points.map(p=>new THREE.Vector3(...p)),lower=points[0].y,upper=points.at(-1)!.y;
  if(from.y<lower+.28||from.y>upper-.28)continue;
  const candidate=closest(points,from);
  if(candidate.distance<.9&&(!match||candidate.distance<match.distance))match={points,...candidate};
 }
 if(!match)return campusPath(query,from,to);
 const {points,segment,projection}=match,target=closest(points,to);
 if(target.distance<.9){
  const between=target.progress>=match.progress?points.slice(segment+1,target.segment+1):points.slice(target.segment+1,segment+1).reverse();
  return [projection,...between,target.projection,to.clone()];
 }
 const ascending=to.y>=from.y;
 const prefix=ascending?[projection,...points.slice(segment+1)]:[projection,...points.slice(0,segment+1).reverse()];
 const landing=prefix.at(-1)!;
 return [...prefix,...campusPath(query,landing,to)];
}
export function campusPath(query:NavMeshQuery,from:THREE.Vector3,to:THREE.Vector3){
 type Point={x:number;y:number;z:number};
 const plain=(a:Point,b:Point)=>{const r=query.computePath(a,b,{halfExtents:{x:3,y:1.2,z:3},maxPathPolys:512,maxStraightPathPoints:256});return r.success?r.path:[];};
 const radius=(p:Point)=>Math.hypot(p.x-44,p.z+124);
 const inside=(p:Point)=>p.y<-.4&&radius(p)<19;
 const heightAt=(r:number)=>-2.36+Math.min(1,Math.max(0,(r-8.75)/(18.55-8.75)))*2.54;
 const point=(angle:number,r:number):Point=>({x:44+r*Math.cos(angle),y:heightAt(r),z:-124-r*Math.sin(angle)});
 const ramp=(angle:number,start:number,end:number)=>{
  const count=Math.max(1,Math.ceil(Math.abs(end-start)/.4));
  return Array.from({length:count+1},(_,i)=>point(angle,start+(end-start)*i/count));
 };
 // Preserve the aisle occupied now, even after the target crosses the courtyard centre.
 // Rebuilding from this radius trims completed ramp points on every NPC replan.
 const aisleAt=(p:Point)=>{
  const r=radius(p);
  if(r<8.1||r>19.21||Math.abs(p.y-heightAt(r))>.5)return null;
  const options=[-131,-55,55,131].map(degrees=>{
   const angle=degrees*Math.PI/180,q=point(angle,r);
   return {angle,r,distance:Math.hypot(p.x-q.x,p.z-q.z)};
  }).sort((a,b)=>a.distance-b.distance);
  return options[0].distance<=Math.max(.48,r*.047+.16)?options[0]:null;
 };
 const sourceAisle=aisleAt(from),targetAisle=aisleAt(to);
 if(sourceAisle){
  const {angle,r}=sourceAisle;
  if(targetAisle){
   if(angle===targetAisle.angle)return ramp(angle,r,targetAisle.r);
   return [...ramp(angle,r,8.1),...plain(point(angle,8.1),point(targetAisle.angle,8.1)),...ramp(targetAisle.angle,8.1,targetAisle.r)];
  }
  if(inside(to))return [...ramp(angle,r,8.1),...plain(point(angle,8.1),to)];
  if(r>=19.15)return plain(from,to);
  return [...ramp(angle,r,19.2),...plain(point(angle,19.2),to)];
 }
 if(targetAisle){
  const {angle,r}=targetAisle,entry=inside(from)?8.1:19.2;
  return [...plain(from,point(angle,entry)),...ramp(angle,entry,r)];
 }
 if(inside(from)===inside(to))return plain(from,to);
 const outside=inside(from)?to:from,angle=(outside.z>-124?-55:55)*Math.PI/180;
 const inner=point(angle,8.1),outer=point(angle,19.2);
 return inside(from)?[...plain(from,inner),...ramp(angle,8.1,19.2),...plain(outer,to)]:[...plain(from,outer),...ramp(angle,19.2,8.1),...plain(inner,to)];
}
