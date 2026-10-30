import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {ChunkStreamer} from '../../../校园逃生游戏/src/streaming';
import {MapDecodeQueue} from '../../../校园逃生游戏/src/map-decode';
import {MapImageSources} from '../../../校园逃生游戏/src/map-image-sources';
import {MapScenePreparer} from '../../../校园逃生游戏/src/map-scene-preparer';
import {SceneResources} from '../../../校园逃生游戏/src/resources';
import {presentMapFarParts} from '../../../校园逃生游戏/src/map-far-parts';
import type {MapChunk,MapManifest,Vec3} from '../../../校园逃生游戏/src/types';
import {campusMapSession} from './campus-map';
import {decodeResource} from './resource-loading';
import {campusFloorChunks,campusChunkCutHeight,campusLevel} from './campus-chunk-selection';

export class CampusChunkWorld {
 private root=new THREE.Group();
 private resources=new SceneResources(true);
 private images=new MapImageSources(campusMapSession);
 private decode=new MapDecodeQueue();
 private preparer:MapScenePreparer;
 private streamer:ChunkStreamer<THREE.Group>;
 private dead=false;
 private floorLease:(()=>void)|null=null;
 private floorAbort:AbortController|null=null;
 private revision=0;
 private selection:{buildingId:string;floor:number;urls:Set<string>}|null=null;
 private planes=new WeakMap<THREE.Group,THREE.Plane>();
 private lastDiagnostics=0;
 private snapshot:Record<string,unknown>|null=null;
 constructor(private scene:THREE.Scene,renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera,readonly manifest:MapManifest,private changed:()=>void){
  renderer.localClippingEnabled=true;
  this.root.name='campus-chunks';scene.add(this.root);
  this.preparer=new MapScenePreparer(scene as never,{renderer:renderer as never,camera:camera as never});
  this.streamer=new ChunkStreamer(manifest.chunks,(chunk,signal,priority)=>this.load(chunk,signal,priority),asset=>this.resources.release(asset as never),()=>performance.now(),()=>{if(!this.dead){this.visibility();changed();}});
 }
 private async load(chunk:MapChunk,signal:AbortSignal,priority=3){
  const manager=new THREE.LoadingManager(),loader=new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  manager.addHandler(/\.webp(?:\?|$)/i,this.images.handler(signal) as never);
  await this.images.prepare(chunk,signal);
  const bytes=await campusMapSession.read(chunk.url,{signal,priority});
  const parsed=await this.decode.run(()=>decodeResource(()=>loader.parseAsync(bytes,new URL('.',new URL(chunk.url,location.href)).href),g=>{this.resources.retain(g.scene as never);this.resources.release(g.scene as never);},signal),signal,priority);
  const group=parsed.scene,plane=new THREE.Plane(new THREE.Vector3(0,-1,0),1e6);this.planes.set(group,plane);
  group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;for(const material of Array.isArray(object.material)?object.material:[object.material]){material.clippingPlanes=[plane];material.clipShadows=true;}});
  this.resources.retain(group as never);
  try{
   await this.preparer.prepare(group as never,signal,priority);
   if(this.dead||signal.aborted)throw new DOMException('Cancelled','AbortError');
   group.visible=false;this.root.add(group);return group;
  }catch(error){this.resources.release(group as never);throw error;}
 }
 async initialize(point:Vec3,signal:AbortSignal,onProgress:(value:number)=>void){
  await this.streamer.initialize(point,onProgress,signal,this.manifest.floors);this.visibility();
 }
 update(point:Vec3,low:boolean){
  if(this.dead)return;
  this.streamer.update(point,[],low,this.manifest.floors);this.visibility();
 }
 async selectFloor(buildingId:string,floor:number,signal:AbortSignal,onProgress?:(value:number)=>void){
  const revision=++this.revision;this.floorAbort?.abort();
  if(floor===0){this.floorLease?.();this.floorLease=null;this.selection=null;this.visibility();this.changed();return;}
  if(!campusLevel(this.manifest,buildingId,floor))throw new Error('这一层暂时无法查看。');
  const chunks=campusFloorChunks(this.manifest,buildingId,floor);if(!chunks.length)throw new Error('这一层暂时无法查看。');
  const owner=new AbortController(),cancel=()=>owner.abort();this.floorAbort=owner;
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)owner.abort();
  try{
   const lease=await this.streamer.prepareChunks(chunks,owner.signal,onProgress);
   if(this.dead||owner.signal.aborted||revision!==this.revision){lease();throw new DOMException('Cancelled','AbortError');}
   const previous=this.floorLease;this.floorLease=lease;this.selection={buildingId,floor,urls:new Set(chunks.map(c=>c.url))};
   this.visibility();previous?.();this.changed();
  }finally{signal.removeEventListener('abort',cancel);if(this.floorAbort===owner)this.floorAbort=null;}
 }
 private visibility(){
  const selection=this.selection,cut=selection?campusChunkCutHeight(this.manifest,selection.buildingId,selection.floor):1e6;
  this.streamer.forEach((group,chunk)=>{
   if(chunk.farBundle)presentMapFarParts(group as never,url=>!!selection?.urls.has(url));
   const selected=!!selection?.urls.has(chunk.url);
   const shell=chunk.residency==='structure'&&!chunk.roomCore;
   group.visible=selected||(chunk.kind!=='interior'||shell)&&this.streamer.visibleLod(chunk.url);
   const garage=selection?.buildingId==='garage'?this.manifest.buildings?.find(b=>b.id==='garage'):undefined;
   const overGarage=!!garage&&!!chunk.bounds&&chunk.residency==='structure'&&chunk.bounds.min[0]<garage.bounds.max[0]&&chunk.bounds.max[0]>garage.bounds.min[0]&&chunk.bounds.min[2]<garage.bounds.max[2]&&chunk.bounds.max[2]>garage.bounds.min[2];
   const plane=this.planes.get(group);if(plane)plane.constant=selection&&(chunk.building===selection.buildingId||overGarage)?cut:1e6;
  });
 }
 retry(){this.streamer.retry();this.changed();}
 diagnostics(){const now=performance.now();if(!this.snapshot||now-this.lastDiagnostics>1000){this.lastDiagnostics=now;this.snapshot={...this.streamer.diagnostics(),resources:this.resources.diagnostics(),images:this.images.diagnostics(),gpu:this.preparer.diagnostics(),selectedBuilding:this.selection?.buildingId,selectedFloor:this.selection?.floor};}return this.snapshot;}
 dispose(){if(this.dead)return;this.dead=true;++this.revision;this.floorAbort?.abort();this.floorLease?.();this.floorLease=null;this.streamer.dispose();this.preparer.dispose();this.images.dispose();this.root.removeFromParent();}
}
