import * as THREE from 'three';
import {awaitWithSignal,type MapAssetSession} from './map-cache';
import type {MapChunk} from './types';
import {decodeMapImage,releaseMapImage,type MapDecodedImage} from './map-image-decode';

/** Six audited external map images share decode/source storage for one world.
 * Texture transforms and sampling remain on the individual glTF textures. */
export class MapImageSources{
 private sources=new Map<string,Promise<THREE.Source<MapDecodedImage>>>();
 private owned=new Set<MapDecodedImage>();
 private lifetime=new AbortController();
 private decodes=0;
 constructor(private session:MapAssetSession){}
 private logical(url:string){return new URL(url,location.href).pathname;}
 private source(url:string){
  const key=this.logical(url);let pending=this.sources.get(key);
  if(!pending){
   if(this.sources.size>=16)throw Error('校园贴图清单超出本次资源范围。');
   pending=this.session.read(key,{signal:this.lifetime.signal,priority:0}).then(async bytes=>{
    const bitmap=await decodeMapImage(bytes,this.lifetime.signal);
    if(this.lifetime.signal.aborted){releaseMapImage(bitmap);throw new DOMException('Cancelled','AbortError');}
    this.owned.add(bitmap);this.decodes++;return new THREE.Source(bitmap);
   }).catch(error=>{if(this.sources.get(key)===pending)this.sources.delete(key);throw error;});
   this.sources.set(key,pending);
  }
  return pending;
 }
 async prepare(chunk:MapChunk,signal:AbortSignal){
  for(const uri of chunk.dependencies??[]){if(signal.aborted||this.lifetime.signal.aborted)throw new DOMException('Cancelled','AbortError');if(/\.webp$/i.test(uri))await awaitWithSignal(this.source(uri),signal);}
 }
 handler(signal:AbortSignal):THREE.Loader<THREE.Texture>{
  const owner=this;
  return new class extends THREE.Loader<THREE.Texture>{
   override load(url:string,onLoad?:(texture:THREE.Texture)=>void,_onProgress?:(event:ProgressEvent)=>void,onError?:(error:unknown)=>void){
    const texture=new THREE.Texture();texture.userData.mapSourceOwned=true;texture.userData.mapSourceId=owner.logical(url);
    if(signal.aborted||owner.lifetime.signal.aborted){queueMicrotask(()=>{texture.dispose();onError?.(new DOMException('Cancelled','AbortError'));});return texture;}
    void awaitWithSignal(owner.source(url),signal).then(source=>{texture.source=source;texture.needsUpdate=true;onLoad?.(texture);},error=>{texture.dispose();onError?.(error);});
    return texture;
   }
  }();
 }
 diagnostics(){return{images:this.owned.size,decodes:this.decodes,pendingSources:this.sources.size};}
 dispose(){this.lifetime.abort();for(const bitmap of this.owned)releaseMapImage(bitmap);this.owned.clear();this.sources.clear();}
}
