import * as THREE from 'three';
import {wrapAngle,WEAPONS} from './rules.ts';
import type {WeaponId} from './types';
import type {AttackPhase,IncomingDamage} from './types';

/** Shots advance only after the magazine actually consumed a round. */
export class AttackCycle {
 phase:AttackPhase='search';left=0;remaining=0;private continuing=false;
 cancel(phase:AttackPhase='search'){this.phase=phase;this.left=0;this.remaining=0;this.continuing=false;}
 update(dt:number,eligible:boolean,reloading:boolean,automatic:boolean){
  if(reloading){this.cancel('reload');return false;}
  if(!eligible){this.cancel();return false;}
  if(this.phase==='search'||this.phase==='reload'||this.phase==='suppressed'){
   this.phase='aim';this.left=this.continuing?.25:.65;this.remaining=automatic?3:1;
  }else if(this.phase==='cooldown'){
   this.left=Math.max(0,this.left-dt);if(this.left===0){this.phase='aim';this.left=.25;this.remaining=automatic?3:1;}
  }else if(this.phase==='aim'){
   this.left=Math.max(0,this.left-dt);if(this.left===0)this.phase='fire';
  }
  return this.phase==='fire';
 }
 shot(random:()=>number){if(this.phase!=='fire')return;if(--this.remaining<=0){this.phase='cooldown';this.left=.8+random()*.6;this.continuing=true;}}
}

export type HitRegion='head'|'torso'|'arm'|'leg';
export interface BodyHit {distance:number;region:HitRegion;point:THREE.Vector3}
export interface BodyLayout {w:number;h:number;box:number[];head:number[];torso:number[];arms:number[][];legs:number[][];anchorX?:number}
/** Intersect the visible image plane, then an anatomical region and its alpha mask. */
export function portraitHit(origin:THREE.Vector3,direction:THREE.Vector3,plane:THREE.Mesh,shape:BodyLayout,alpha?:{width:number;height:number;data:Uint8Array}):BodyHit|null {
 plane.updateWorldMatrix(true,false);
 const inv=plane.matrixWorld.clone().invert(),localOrigin=origin.clone().applyMatrix4(inv),localDirection=direction.clone().transformDirection(inv);
 if(Math.abs(localDirection.z)<1e-6)return null;
 const t=-localOrigin.z/localDirection.z;if(t<0)return null;
 const local=localOrigin.addScaledVector(localDirection,t),geometry=plane.geometry;
 geometry.computeBoundingBox();const box=geometry.boundingBox!;
 const u=(local.x-box.min.x)/(box.max.x-box.min.x),vy=(local.y-box.min.y)/(box.max.y-box.min.y);
 if(u<0||u>1||vy<0||vy>1)return null;
 const x=u*shape.w,y=(1-vy)*shape.h;
 if(alpha){const px=Math.min(alpha.width-1,Math.floor(u*alpha.width)),py=Math.min(alpha.height-1,Math.floor((1-vy)*alpha.height));if(alpha.data[py*alpha.width+px]<128)return null;}
 const inside=(r:number[])=>x>=r[0]&&y>=r[1]&&x<=r[2]&&y<=r[3];
 const region:HitRegion|null=inside(shape.head)?'head':inside(shape.torso)?'torso':shape.arms.some(inside)?'arm':shape.legs.some(inside)?'leg':null;
 if(!region)return null;const point=local.applyMatrix4(plane.matrixWorld);return {point,distance:point.distanceTo(origin),region};
}
export function hitDamage(base:number,region:HitRegion){return region==='head'?100:base*(region==='arm'?.65:region==='leg'?.55:1);}
export function muzzleTarget(origin:THREE.Vector3,aimPoint:THREE.Vector3,rayDistance:(o:THREE.Vector3,d:THREE.Vector3,max:number)=>number){
 const direction=aimPoint.clone().sub(origin),distance=direction.length();direction.divideScalar(Math.max(.0001,distance));
 const stop=Math.min(distance,rayDistance(origin,direction,distance));return {direction,distance:stop,blocked:stop<distance-.04,point:origin.clone().addScaledVector(direction,stop)};
}
export class DamageDirections {
 private sources:{id:number;position:THREE.Vector3;left:number;strength:number}[]=[];
 add(id:number,position:THREE.Vector3,damage:number){this.sources=this.sources.filter(s=>s.id!==id);this.sources.push({id,position:position.clone(),left:1,strength:Math.min(1,.35+damage/35)});if(this.sources.length>6)this.sources.shift();}
 update(dt:number){for(const s of this.sources)s.left-=dt;this.sources=this.sources.filter(s=>s.left>0);}
 reset(){this.sources=[];}
 read(eye:THREE.Vector3,yaw:number):IncomingDamage[]{return this.sources.map(s=>{const d=s.position.clone().sub(eye);return{id:s.id,angle:wrapAngle(Math.atan2(d.x,-d.z)+yaw),vertical:d.y>1.2?1:d.y< -1.2?-1:0,strength:s.strength,remaining:s.left};});}
}
export class RecoilSpring {
 pitch=0;yaw=0;private sequence=0;private sinceShot=1;private previousWeapon:WeaponId|null=null;
 kick(up:number,side:number,random:()=>number){this.pitch=Math.min(.18,this.pitch+up);this.yaw=THREE.MathUtils.clamp(this.yaw+(random()-.5)*side*2,-.055,.055);}
 kickWeapon(id:WeaponId,random:()=>number){const def=WEAPONS[id];if(this.previousWeapon!==id||this.sinceShot>.28)this.sequence=0;this.previousWeapon=id;this.sinceShot=0;const shot=this.sequence++;const patterns:Record<WeaponId,readonly number[]>={glock:[0,-.2,.15],mp5:[-.2,-.3,-.15,.1,.35,.5,.4,.1,-.3,-.5],m4a1:[0,-.25,-.4,-.2,.15,.5,.65,.4,0,-.35,-.45],ak47:[.1,.35,.55,.3,-.15,-.65,-.8,-.45,.25,.65],r870:[0,.2,-.1],awm:[0,.1,-.1],m249:[-.1,-.25,-.4,-.2,.1,.35,.6,.55,.25,-.1,-.35]};const pattern=patterns[id],side=pattern[shot%pattern.length]*def.recoilSide+(random()-.5)*def.recoilSide*.16;this.pitch=Math.min(.18,this.pitch+def.recoil*(1+Math.min(shot,10)*.035));this.yaw=THREE.MathUtils.clamp(this.yaw+side,-.075,.075);return {pitch:def.recoil,yaw:side,sequence:shot};}
 update(dt:number,recover:number){this.sinceShot+=Math.max(0,dt);this.pitch=THREE.MathUtils.damp(this.pitch,0,recover,dt);this.yaw=THREE.MathUtils.damp(this.yaw,0,recover,dt);}
 reset(){this.pitch=this.yaw=0;this.sequence=0;this.sinceShot=1;this.previousWeapon=null;}
}
