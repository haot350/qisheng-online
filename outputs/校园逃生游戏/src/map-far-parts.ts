import type * as THREE from 'three';
const parts=new WeakMap<THREE.Object3D,{node:THREE.Object3D;nearUrl:string}[]>();
/** Keep the distant occluder until its exact near source is prepared and shown. */
export function presentMapFarParts(root:THREE.Object3D,nearVisible:(url:string)=>boolean){
 let entries=parts.get(root);
 if(!entries){entries=[];root.traverse(node=>{if(typeof node.userData.nearUrl==='string')entries!.push({node,nearUrl:node.userData.nearUrl});});parts.set(root,entries);}
 for(const part of entries)part.node.visible=!nearVisible(part.nearUrl);
}
