import * as THREE from 'three';
/** GLTF scenes may share resources; evicting one region must not destroy another. */
export class SceneResources {
  private refs=new Map<{dispose():void},number>();
  private objects=new Map<THREE.Object3D,Set<{dispose():void}>>();
  private bitmaps=new WeakMap<object,{dispose():void}>();
  private texturePool=new Map<string,THREE.Texture>();
  private textureKeys=new WeakMap<THREE.Texture,string>();
  constructor(private shareNamedTextures=false){}
  private internTextures(root:THREE.Object3D){
    const original=new Set<THREE.Texture>(),used=new Set<THREE.Texture>();
    root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        const values=material as unknown as Record<string,unknown>;
        for(const [property,value]of Object.entries(values))if(value instanceof THREE.Texture){
          original.add(value);const key=textureSamplingKey(value);
          if(key){const shared=this.texturePool.get(key);if(shared){values[property]=shared;used.add(shared);}else{this.texturePool.set(key,value);this.textureKeys.set(value,key);used.add(value);}}
          else used.add(value);
        }
      }
    });
    const keptImages=new Set([...used].map(t=>t.image)),closed=new Set<object>();
    for(const texture of original)if(!used.has(texture)){
      texture.dispose();const bitmap=texture.image;
      if(typeof ImageBitmap!=='undefined'&&bitmap instanceof ImageBitmap&&!keptImages.has(bitmap)&&!closed.has(bitmap)&&!this.refs.has(this.bitmaps.get(bitmap)!)){bitmap.close();closed.add(bitmap);}
    }
  }
  retain(root:THREE.Object3D){
    if(this.shareNamedTextures)this.internTextures(root);
    const all=new Set<{dispose():void}>();
    root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;all.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        all.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture){all.add(value);
          if(typeof ImageBitmap!=='undefined'&&value.image instanceof ImageBitmap){let bitmap=this.bitmaps.get(value.image);if(!bitmap){const image=value.image;bitmap={dispose:()=>image.close()};this.bitmaps.set(image,bitmap);}all.add(bitmap);}
        }
      }
    });
    this.objects.set(root,all);for(const item of all)this.refs.set(item,(this.refs.get(item)??0)+1);
  }
  release(root:THREE.Object3D){
    const all=this.objects.get(root);if(!all)return;this.objects.delete(root);root.removeFromParent();
    for(const item of all){const n=(this.refs.get(item)??1)-1;if(n>0)this.refs.set(item,n);else{this.refs.delete(item);if(item instanceof THREE.Texture){const key=this.textureKeys.get(item);if(key&&this.texturePool.get(key)===item)this.texturePool.delete(key);}item.dispose();}}
  }
  diagnostics(){
    let geometries=0,materials=0,textures=0,textureBytesEstimate=0;
    const buffers=new Set<ArrayBufferLike>();
    for(const resource of this.refs.keys()){
      if(resource instanceof THREE.BufferGeometry){geometries++;
        for(const attribute of Object.values(resource.attributes) as (THREE.BufferAttribute|THREE.InterleavedBufferAttribute)[])buffers.add(attribute instanceof THREE.InterleavedBufferAttribute?attribute.data.array.buffer:attribute.array.buffer);
        if(resource.index)buffers.add(resource.index.array.buffer);
      }else if(resource instanceof THREE.Texture){textures++;const image=resource.image as {width?:number;height?:number}|undefined;
        textureBytesEstimate+=(image?.width??0)*(image?.height??0)*4*(resource.generateMipmaps?4/3:1);
      }else if(resource instanceof THREE.Material)materials++;
    }
    return {scenes:this.objects.size,geometries,materials,textures,geometryBytes:[...buffers].reduce((n,b)=>n+b.byteLength,0),textureBytesEstimate:Math.ceil(textureBytesEstimate)};
  }
}
/** Preserve every shader sampling parameter; only audited image names may share storage. */
export function textureSamplingKey(texture:THREE.Texture){
  if(!texture.name||!texture.image)return null;
  const image=texture.image as {width?:number;height?:number};
  return JSON.stringify([texture.name,image.width,image.height,texture.colorSpace,texture.flipY,texture.wrapS,texture.wrapT,texture.magFilter,texture.minFilter,texture.anisotropy,texture.channel,texture.mapping,texture.format,texture.type,texture.premultiplyAlpha,texture.unpackAlignment,texture.generateMipmaps,texture.matrixAutoUpdate,texture.offset.toArray(),texture.repeat.toArray(),texture.center.toArray(),texture.rotation,...(texture.matrixAutoUpdate?[]:texture.matrix.elements)]);
}
