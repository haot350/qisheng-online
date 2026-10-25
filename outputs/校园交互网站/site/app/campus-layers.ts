import * as THREE from 'three';
import type {MapChunk,MapManifest,MapLevel} from '@qisheng/shared/types';
import {presentMapLod} from '../../../校园逃生游戏/src/map-lod';

type Entry={chunk:MapChunk;group:THREE.Group;touched:number};
type LayerStatus={ready:boolean;progress:number;failed:boolean;resident:number};
/** The viewer owns only its current presentation. It never alters gameplay collision. */
export class CampusLayers{
 private assets=new Map<string,Entry>();
 private pending=new Map<string,AbortController>();
 private failed=new Set<string>();
 private wanted=new Set<string>();
 private queue:MapChunk[]=[];
 private currentLevel:MapLevel|null=null;
 private alive=true;
 private lastSignature='';
 private waiters=new Set<()=>void>();
 private low=false;
 private plane=new THREE.Plane(new THREE.Vector3(0,-1,0),0);
 constructor(readonly manifest:MapManifest,private scene:THREE.Scene,private load:(url:string,signal:AbortSignal)=>Promise<THREE.Group>,private release:(group:THREE.Group)=>void,private changed:(status:LayerStatus)=>void){}
 level(){return this.currentLevel;}
 select(levelId:string|null){this.currentLevel=this.manifest.levels?.find(l=>l.id===levelId)??null;this.lastSignature='';}
 status():LayerStatus{
  const chunks=this.manifest.chunks.filter(c=>this.wanted.has(c.url)),total=chunks.reduce((n,c)=>n+(c.bytes??1),0),done=chunks.reduce((n,c)=>n+(this.assets.has(c.url)?c.bytes??1:0),0);
  return{ready:chunks.every(c=>this.assets.has(c.url)),progress:total?Math.round(done/total*100):100,failed:chunks.some(c=>this.failed.has(c.url)),resident:this.assets.size};
 }
 update(camera:THREE.PerspectiveCamera,target:THREE.Vector3,low:boolean){
  this.low=low;camera.updateMatrixWorld();
  const signature=[...camera.position.toArray(),...target.toArray(),camera.fov,camera.aspect,low,this.currentLevel?.id].map(v=>typeof v==='number'?Math.round(v*20)/20:v).join('/');
  if(signature===this.lastSignature){this.present(target);return;}this.lastSignature=signature;
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const distance=(c:MapChunk)=>{const b=c.bounds;return b?Math.hypot(Math.max(b.min[0]-target.x,0,target.x-b.max[0]),Math.max(b.min[2]-target.z,0,target.z-b.max[2])):Math.hypot(c.center[0]-target.x,c.center[2]-target.z);};
  const level=this.currentLevel,visible=(c:MapChunk)=>{
   if(c.kind==='interior')return !!level&&(c.levelId?c.levelId===level.id:c.building===level.buildingId&&c.floor===level.floor);
   if(level&&c.building===level.buildingId)return true;
   const box=c.bounds?new THREE.Box3(new THREE.Vector3(...c.bounds.min),new THREE.Vector3(...c.bounds.max)):new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...c.center),new THREE.Vector3().setScalar(c.radius*2));
   return frustum.intersectsBox(box)&&(!level||distance(c)<100);
  };
  const wanted=this.manifest.chunks.filter(visible);this.wanted=new Set(wanted.map(c=>c.url));
  for(const [url,controller]of this.pending)if(!this.wanted.has(url))controller.abort();
  this.queue=wanted.filter(c=>!this.assets.has(c.url)&&!this.pending.has(c.url)&&!this.failed.has(c.url)).sort((a,b)=>Number(a.residency==='detail')-Number(b.residency==='detail')||distance(a)-distance(b));
  const now=performance.now();
  for(const [url,entry]of this.assets){if(this.wanted.has(url))entry.touched=now;else if(now-entry.touched>2500||this.assets.size>80){entry.group.removeFromParent();this.release(entry.group);this.assets.delete(url);}}
  this.present(target);this.pump();this.notify();
 }
 private present(target:THREE.Vector3){
  const level=this.currentLevel;this.plane.constant=level?level.elevation+1.65:0;
  for(const [url,entry]of this.assets){
   const group=entry.group;group.visible=this.wanted.has(url);
   presentMapLod(group,Math.hypot(entry.chunk.center[0]-target.x,entry.chunk.center[2]-target.z),this.low);
   const clip=!!level&&(entry.chunk.building===level.buildingId||entry.chunk.levelId===level.id||level.buildingId==='garage'&&entry.chunk.kind!=='interior'),key=clip?level!.id:'';
   if(group.userData.campusClipLevel!==key){group.userData.campusClipLevel=key;group.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){material.clippingPlanes=clip?[this.plane]:null;material.clipShadows=clip;material.needsUpdate=true;}});}
  }
 }
 private pump(){
  if(!this.alive)return;
  while(this.pending.size<2&&this.queue.length){
   const chunk=this.queue.shift()!;if(!this.wanted.has(chunk.url)||this.assets.has(chunk.url)||this.pending.has(chunk.url))continue;
   const controller=new AbortController();this.pending.set(chunk.url,controller);
   void this.load(chunk.url,controller.signal).then(group=>{
    if(!this.alive||controller.signal.aborted||!this.wanted.has(chunk.url)){this.release(group);return;}
    this.assets.set(chunk.url,{chunk,group,touched:performance.now()});group.visible=false;this.scene.add(group);this.lastSignature='';
   }).catch(error=>{if(!controller.signal.aborted&&this.alive){this.failed.add(chunk.url);console.warn('Campus region unavailable',chunk.url,error instanceof Error?error.name:'load');}}).finally(()=>{this.pending.delete(chunk.url);this.lastSignature='';this.pump();this.notify();});
  }
 }
 private notify(){if(!this.alive)return;this.changed(this.status());for(const waiter of [...this.waiters])waiter();}
 ready(){return this.status().ready;}
 whenReady(signal:AbortSignal):Promise<void>{
  if(signal.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
  return new Promise((resolve,reject)=>{const cleanup=()=>{this.waiters.delete(check);signal.removeEventListener('abort',cancel);},cancel=()=>{cleanup();reject(new DOMException('Aborted','AbortError'));},check=()=>{const state=this.status();if(state.failed){cleanup();reject(new Error('Campus layer could not load'));}else if(state.ready){cleanup();resolve();}};this.waiters.add(check);signal.addEventListener('abort',cancel,{once:true});check();});
 }
 retry(){this.failed.clear();this.lastSignature='';}
 dispose(){if(!this.alive)return;this.alive=false;for(const c of this.pending.values())c.abort();for(const entry of this.assets.values()){entry.group.removeFromParent();this.release(entry.group);}this.assets.clear();this.queue=[];this.waiters.clear();}
}
