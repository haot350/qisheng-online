import * as THREE from 'three';
import {textureSamplingKey} from '../../../校园逃生游戏/src/resources';
/** Materials stay independent so a section view cannot clip another building. */
export class CampusTextures{
 private pool=new Map<string,THREE.Texture>();
 private keys=new WeakMap<THREE.Texture,string>();
 private groups=new WeakMap<THREE.Object3D,Set<THREE.Texture>>();
 private refs=new Map<THREE.Texture,number>();
 private images=new Map<object,number>();
 retain(group:THREE.Object3D){
  const original=new Set<THREE.Texture>(),used=new Set<THREE.Texture>();
  group.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   const values=material as unknown as Record<string,unknown>;
   for(const [property,value]of Object.entries(values))if(value instanceof THREE.Texture){
    original.add(value);const key=textureSamplingKey(value as unknown as Parameters<typeof textureSamplingKey>[0]);
    const canonical=key?this.pool.get(key):undefined;
    if(canonical){values[property]=canonical;used.add(canonical);}else{if(key){this.pool.set(key,value);this.keys.set(value,key);}used.add(value);}
   }
  }});
  const keptImages=new Set([...used].map(t=>t.image)),closed=new Set<object>();
  for(const texture of original)if(!used.has(texture)){texture.dispose();const image=texture.image;if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap&&!keptImages.has(image)&&!this.images.has(image)&&!closed.has(image)){image.close();closed.add(image);}}
  this.groups.set(group,used);const images=new Set<object>();
  for(const texture of used){this.refs.set(texture,(this.refs.get(texture)??0)+1);if(texture.image&&typeof texture.image==='object')images.add(texture.image);}
  for(const image of images)this.images.set(image,(this.images.get(image)??0)+1);
 }
 release(group:THREE.Object3D):boolean{
  const used=this.groups.get(group);if(!used)return false;this.groups.delete(group);const images=new Set<object>();
  for(const texture of used){const n=(this.refs.get(texture)??1)-1;if(texture.image&&typeof texture.image==='object')images.add(texture.image);if(n>0)this.refs.set(texture,n);else{this.refs.delete(texture);const key=this.keys.get(texture);if(key&&this.pool.get(key)===texture)this.pool.delete(key);texture.dispose();}}
  for(const image of images){const n=(this.images.get(image)??1)-1;if(n>0)this.images.set(image,n);else{this.images.delete(image);if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();}}
  return true;
 }
 diagnostics(){return{textures:this.refs.size,images:this.images.size};}
}
