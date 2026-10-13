import * as THREE from 'three';
import type {PhotoRecord} from '../photography/types.ts';
import {discoveredReality} from './store.ts';
import type {RealityAnchor,RealityContext,RealityManifest,RealityMatch,RealityPoint} from './types.ts';

export const REALITY_MANIFEST_URL='/story/reality/manifest.json';
export function realityProjection(world:RealityPoint,position:RealityPoint,quaternion:[number,number,number,number],focal:number,orientation:'landscape'|'portrait'='landscape'):{image:[number,number];depth:number}{
 const local=new THREE.Vector3(...world).sub(new THREE.Vector3(...position)).applyQuaternion(new THREE.Quaternion(...quaternion).invert()),depth=-local.z;
 const sensorX=orientation==='landscape'?36:24,sensorY=orientation==='landscape'?24:36;
 return {image:[.5+local.x*focal/(sensorX*Math.max(.00001,depth)),.5-local.y*focal/(sensorY*Math.max(.00001,depth))],depth};
}
function quantile(values:number[],p:number){const sorted=[...values].sort((a,b)=>a-b),i=(sorted.length-1)*p;return sorted[Math.floor(i)]+(sorted[Math.ceil(i)]-sorted[Math.floor(i)])*(i%1);}
function angle(a:number,b:number){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));}
function direction(q:[number,number,number,number]){const v=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(...q));return{yaw:Math.atan2(-v.x,-v.z),pitch:Math.asin(Math.max(-1,Math.min(1,v.y)))};}
function area(points:[number,number][]){return(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])))*(Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])));}
function validManifest(m:RealityManifest){return m?.version===1&&Array.isArray(m.anchors)&&m.anchors.every(a=>typeof a.id==='string'&&a.kind==='composition'&&a.landmarks.length>=6&&a.landmarks.every(p=>p.world.length===3&&p.image.length===2&&[...p.world,...p.image].every(Number.isFinite)));}

/** Geometry / camera composition recognition runs on this device, after an actual completed capture. */
export class RealityMatcher{
 constructor(readonly manifest:RealityManifest){if(!validManifest(manifest))throw Error('现实影像的构图资料不完整。');}
 static async load(options:{signal?:AbortSignal}={}){const r=await fetch(REALITY_MANIFEST_URL,{signal:options.signal});if(!r.ok)throw Error('现实影像资料暂未载入。');return new RealityMatcher(await r.json());}
 evaluate(photo:PhotoRecord,context:RealityContext):RealityMatch|null{
  if(!['story','roam'].includes(context.mode)||!photo.captureMeta?.eligible||!photo.captureMeta.resourcesComplete||photo.captureMeta.unstable)return null;
  const matches=this.manifest.anchors.flatMap(anchor=>{const match=this.check(photo,anchor,context);return match?[match]:[];});
  return matches.sort((a,b)=>a.median-b.median||a.p90-b.p90)[0]??null;
 }
 private check(photo:PhotoRecord,a:RealityAnchor,context:RealityContext):RealityMatch|null{
  const p=this.manifest.policy,r=a.reference;if(!a.enabled||!a.validation.walkable||!a.validation.geometry||photo.settings.orientation!==a.orientation)return null;
  if(Math.hypot(photo.position[0]-r.position[0],photo.position[2]-r.position[2])>r.radius||Math.abs(photo.position[1]-r.position[1])>r.verticalTolerance||Math.abs(photo.settings.focalLength/r.focalLength-1)>p.focalRelative)return null;
  const d=direction(photo.quaternion),ref=direction(r.quaternion);if(angle(d.yaw,ref.yaw)>p.yawDegrees*Math.PI/180||Math.abs(d.pitch-ref.pitch)>p.pitchDegrees*Math.PI/180)return null;
  const errors:number[]=[],points:[number,number][]=[],diag=Math.hypot(photo.width,photo.height);let required=0;
  for(const l of a.landmarks){const v=realityProjection(l.world,photo.position,photo.quaternion,photo.settings.focalLength,photo.settings.orientation);if(v.depth<=.1||v.image.some(n=>n<0||n>1)||!context.isLandmarkVisible(l.world,photo))continue;points.push(v.image);errors.push(Math.hypot((v.image[0]-l.image[0])*photo.width,(v.image[1]-l.image[1])*photo.height)/diag);if(l.required)required++;}
  if(errors.length<p.minimumVisible||required<Math.min(2,a.landmarks.filter(l=>l.required).length))return null;
  const median=quantile(errors,.5),p90=quantile(errors,.9),occupied=area(points);if(median>p.median||p90>p.p90||occupied<a.subject.minArea||occupied>a.subject.maxArea||occupied/a.subject.referenceArea<.55||occupied/a.subject.referenceArea>1.65)return null;
  return {anchor:a,photo,median,p90,visible:errors.length,first:!discoveredReality().has(a.id),association:{anchorId:a.id,realPhotoId:a.photoId,title:a.title,date:a.date,image:a.image,thumbnail:a.thumbnail,sourceSha:a.sourceSha,kind:'composition',matchedAt:new Date().toISOString(),cropped:a.crop[2]<.999||a.crop[3]<.999,sourceImage:`/story/archive/${a.photoId}.webp`}};
 }
}
