import * as THREE from 'three';
import {STORY_BY_ID} from './story/content.ts';
import type {StorySnapshot,StoryTarget,StoryVec3} from './story/types';
import type {RealityManifest} from './reality/types';
import type {Mode,PhotoGuideSnapshot} from './types';

type Support=(position:THREE.Vector3,height?:number)=>{height:number;normalY:number;clear:boolean}|null;
export type MarkerTarget={id:string;label:string;position:StoryVec3;radius:number;optional:boolean};
export function taskPhotoMarker(story?:StorySnapshot|null):MarkerTarget|null{
 if(!story||story.introActive||story.cinematicActive||story.screeningActive||story.finished||story.dialogue||story.options.length)return null;
 const step=STORY_BY_ID.get(story.step);if(!step)return null;
 const photo=step.kind==='photo'?step:['travel','cooperate'].includes(step.kind)?STORY_BY_ID.get(step.next??''):undefined;
 if(photo?.kind!=='photo'||!photo.target)return null;
 return markerTarget(photo.id,photo.target,false);
}
function markerTarget(id:string,target:StoryTarget,optional:boolean):MarkerTarget{return{id,label:optional?'实拍机位 · 可选':'任务取景',position:[...target.position],radius:target.radius,optional};}
/** These are calibrated camera eyes; markers belong at the standing feet. */
export function realityPhotoMarkers(manifest:RealityManifest):MarkerTarget[]{
 return manifest.anchors.filter(a=>a.enabled&&a.validation?.geometry&&a.validation.walkable&&a.validation.visible>=4&&a.reference.position.every(Number.isFinite)).map(a=>({id:a.id,label:`实拍机位 · ${a.reference.focalLength}mm`,position:[a.reference.position[0],a.reference.position[1]-1.63,a.reference.position[2]],radius:a.reference.radius,optional:true}));
}
export function markerSceneVisible(mode:Mode,active:boolean,story?:StorySnapshot|null,overlay=false){return active&&!overlay&&(mode==='roam'||mode==='story'&&!!story&&!story.introActive&&!story.cinematicActive&&!story.screeningActive&&!story.finished&&!story.dialogue&&!story.options.length);}

/** Every segment uses static support/standing clearance at the authored floor. */
export function markerRange(target:MarkerTarget,support:Support,segments=64){
 const points:Array<THREE.Vector3|null>=[];
 for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,p=new THREE.Vector3(target.position[0]+Math.cos(a)*target.radius,target.position[1],target.position[2]+Math.sin(a)*target.radius),s=support(p,1.75);points.push(s?.clear&&s.normalY>.9&&Math.abs(s.height-target.position[1])<.2?p.setY(s.height+.026):null);}
 const positions:number[]=[];
 for(let i=0;i<segments;i++){const a=points[i],b=points[i+1];if(a&&b&&Math.abs(a.y-b.y)<.12)positions.push(...a.toArray(),...b.toArray());}
 return {positions,validSegments:positions.length/6};
}
function groundBadge(target:MarkerTarget,support:Support){
 const origin=new THREE.Vector3(...target.position),s=support(origin,1.75);if(s?.clear&&s.normalY>.9)return origin.setY(s.height);
 for(const radius of [.5,1,1.5,2]){if(radius>target.radius)break;for(let i=0;i<16;i++){const a=i/16*Math.PI*2,p=origin.clone().add(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius)),hit=support(p,1.75);if(hit?.clear&&hit.normalY>.9)return p.setY(hit.height);}}
 return null;
}
function clear(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)for(const material of Array.isArray(m.material)?m.material:[m.material]){materials.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}});root.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
function labelTexture(text:string,color:string){
 const canvas=typeof document!=='undefined'?document.createElement('canvas'):null;if(!canvas?.getContext)return undefined;
 canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');if(!ctx)return undefined;
 ctx.fillStyle='#101e24';ctx.fillRect(0,0,512,128);ctx.strokeStyle=color;ctx.lineWidth=8;ctx.strokeRect(4,4,504,120);ctx.fillStyle=color;ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
type Visual={root:THREE.Group;badge:THREE.Group;target:MarkerTarget;segments:number};
function visual(target:MarkerTarget,support:Support):Visual{
 const root=new THREE.Group(),badge=new THREE.Group();root.name=`photo-guide:${target.id}`;root.userData.excludePhotography=true;root.userData.photographyGuide=true;root.userData.target={...target};
 const color=target.optional?0x62e0ee:0xffd449,range=markerRange(target,support),positions=range.positions;
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const outline=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x142127,depthTest:true,depthWrite:false,linewidth:3}));root.add(outline);
 // Actual visible width comes from ground quads, not unsupported WebGL linewidth.
 const vertices:number[]=[];for(let i=0;i<positions.length;i+=6){const a=new THREE.Vector3(...positions.slice(i,i+3)),b=new THREE.Vector3(...positions.slice(i+3,i+6)),n=new THREE.Vector3(b.z-a.z,0,a.x-b.x).normalize().multiplyScalar(target.optional?.055:.085),a1=a.clone().add(n),a2=a.clone().sub(n),b1=b.clone().add(n),b2=b.clone().sub(n);vertices.push(...a1.toArray(),...a2.toArray(),...b1.toArray(),...a2.toArray(),...b2.toArray(),...b1.toArray());}
 const strip=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));root.add(strip);
 const point=groundBadge(target,support);badge.visible=!!point;if(point){badge.position.copy(point);root.add(badge);
  const mat=new THREE.MeshBasicMaterial({color,depthTest:true,depthWrite:true}),dark=new THREE.MeshBasicMaterial({color:0x12232b,depthTest:true,depthWrite:true});
  const pad=new THREE.Mesh(new THREE.CircleGeometry(.48,32),dark);pad.rotation.x=-Math.PI/2;pad.position.y=.035;badge.add(pad);
  const body=new THREE.Mesh(new THREE.BoxGeometry(.46,.28,.09),mat);body.position.y=.7;badge.add(body);
  const top=new THREE.Mesh(new THREE.BoxGeometry(.16,.075,.095),mat);top.position.set(-.09,.87,0);badge.add(top);
  const lens=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.11,16),dark);lens.rotation.x=Math.PI/2;lens.position.set(.035,.7,.08);badge.add(lens);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(.36,.2),dark);face.position.set(0,.7,.047);badge.add(face);
  const texture=labelTexture(target.label,target.optional?'#62e0ee':'#ffd449');const label=new THREE.Mesh(new THREE.PlaneGeometry(target.optional?1.65:1.35,.38),new THREE.MeshBasicMaterial({...(texture?{map:texture}:{}),color:0xffffff,side:THREE.DoubleSide,depthTest:true,depthWrite:false}));label.position.set(0,1.1,0);badge.add(label);
 }
 return {root,badge,target,segments:range.validSegments};
}
/** Guides remain visible while composing, but never enter captured photographs. */
export function hidePhotoGuides(scene:THREE.Object3D){const hidden:THREE.Object3D[]=[];scene.traverse(o=>{if(o.visible&&o.userData.photographyGuide){o.visible=false;hidden.push(o);}});return ()=>hidden.forEach(o=>{o.visible=true;});}

export class PhotographyMarkers{
 readonly root=new THREE.Group();private task:Visual|null=null;private references:Visual[]=[];private signature='';private manifest:RealityManifest|null=null;private request:AbortController|null=null;private serial=0;private closed=false;private enabled=false;private state:PhotoGuideSnapshot['referenceState']='off';
 constructor(scene:THREE.Scene,private support:Support,private onChange:()=>void=()=>{},private load:(signal:AbortSignal)=>Promise<RealityManifest>=async signal=>{const response=await fetch('/story/reality/manifest.json',{signal});if(!response.ok)throw Error('实拍机位暂未载入');const data=await response.json();if(data.version!==1||!Array.isArray(data.anchors))throw Error('实拍机位资料无效');return data;}){this.root.name='photography-guides';this.root.userData.photographyGuide=true;this.root.userData.excludePhotography=true;this.root.visible=false;scene.add(this.root);}
 read():PhotoGuideSnapshot{return {task:this.task?{id:this.task.target.id,position:[...this.task.target.position],radius:this.task.target.radius,validSegments:this.task.segments}:undefined,references:this.enabled,referenceState:this.state,referenceCount:this.references.length,visible:this.root.visible,entries:[this.task,...this.references].filter((v):v is Visual=>!!v).map(v=>({id:v.target.id,optional:v.target.optional,visible:this.root.visible&&v.root.visible,position:[...v.target.position],radius:v.target.radius,segments:v.segments}))};}
 private async prepare(){if(this.request||this.manifest||this.closed)return;const request=new AbortController(),serial=++this.serial;this.request=request;this.state='loading';this.onChange();const timeout=setTimeout(()=>request.abort(),12000);
  try{const data=await this.load(request.signal);if(this.closed||serial!==this.serial||!this.enabled)return;this.manifest=data;this.state='ready';}
  catch{if(!this.closed&&serial===this.serial&&this.enabled)this.state='error';}
  finally{clearTimeout(timeout);if(serial===this.serial){this.request=null;this.onChange();}}
 }
 update(mode:Mode,active:boolean,story:StorySnapshot|undefined,enabled:boolean,camera:THREE.PerspectiveCamera,player:THREE.Vector3,overlay=false){
  if(this.closed)return;const visible=markerSceneVisible(mode,active,story,overlay);this.root.visible=visible;
  if(enabled!==this.enabled){this.enabled=enabled;this.serial++;this.request?.abort();this.request=null;this.state=enabled?(this.manifest?'ready':'off'):'off';this.onChange();}
  if(!visible)return;
  const target=mode==='story'?taskPhotoMarker(story):null,signature=target?JSON.stringify(target):'';
  if(signature!==this.signature){if(this.task){this.task.root.removeFromParent();clear(this.task.root);}this.task=target?visual(target,this.support):null;if(this.task)this.root.add(this.task.root);this.signature=signature;}
  if(enabled){if(!this.manifest&&this.state!=='error')void this.prepare();if(this.manifest&&!this.references.length){this.references=realityPhotoMarkers(this.manifest).map(t=>visual(t,this.support));this.references.forEach(v=>this.root.add(v.root));}}
  for(const reference of this.references)reference.root.visible=enabled&&Math.abs(player.y-reference.target.position[1])<1.5&&player.distanceTo(new THREE.Vector3(...reference.target.position))<70&&(!this.task||new THREE.Vector3(...reference.target.position).distanceTo(new THREE.Vector3(...this.task.target.position))>1.5);
  for(const item of [this.task,...this.references])if(item?.badge.visible){const p=item.badge.position;item.badge.rotation.y=Math.atan2(camera.position.x-p.x,camera.position.z-p.z);const scale=item.target.optional?1:Math.min(1.8,Math.max(1,camera.position.distanceTo(p)/20));item.badge.scale.set(scale,scale,scale);}
 }
 retry(){if(this.closed||!this.enabled)return;this.serial++;this.request?.abort();this.request=null;this.state=this.manifest?'ready':'off';this.onChange();if(!this.manifest)void this.prepare();}
 reset(){this.serial++;this.request?.abort();this.request=null;clear(this.root);this.task=null;this.references=[];this.signature='';this.root.visible=false;this.state=this.enabled&&this.manifest?'ready':'off';}
 dispose(){if(this.closed)return;this.reset();this.closed=true;this.root.removeFromParent();}
}
