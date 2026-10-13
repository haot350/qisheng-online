import * as THREE from 'three';
import type {GameEvent} from './shared/protocol';

/** Only appearance resources are kept; release must remove all world-space state. */
export class BoundedAppearancePool<T> {
 private entries:{key:string;value:T}[]=[];private closed=false;
 constructor(readonly limit:number,private sanitize:(value:T)=>void,private destroy:(value:T)=>void){}
 acquire(key:string,create:()=>T):T {const at=this.entries.findIndex(e=>e.key===key);return at<0?create():this.entries.splice(at,1)[0].value;}
 release(key:string,value:T){this.sanitize(value);if(this.closed||this.limit<=0){this.destroy(value);return;}this.entries.push({key,value});while(this.entries.length>this.limit)this.destroy(this.entries.shift()!.value);}
 get size(){return this.entries.length;}
 dispose(){if(this.closed)return;this.closed=true;for(const e of this.entries)this.destroy(e.value);this.entries=[];}
}

export const DEATH_PRESENTATION_SECONDS=2;
export function authorizedDeath(event:GameEvent,id:string,generation:number,kind:'player'|'npc') {
 return event.targetId===id&&(event.type==='death'||kind==='npc'&&event.type==='down')&&Number.isSafeInteger(event.data?.generation)&&event.data?.generation===generation;
}
export function deathPresentation(elapsed:number){const t=Math.max(0,elapsed);return {fall:Math.min(1,t/.32),opacity:t<=1.35?1:Math.max(0,(DEATH_PRESENTATION_SECONDS-t)/.65),done:t>=DEATH_PRESENTATION_SECONDS};}

/** Fading uses private temporary materials so shared avatar textures/materials stay intact. */
export function createPresentationFade(root:THREE.Object3D){
 const meshes:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[]}[]=[],copies=new Map<THREE.Material,THREE.Material>(),base=new Map<THREE.Material,number>(),weapons:{object:THREE.Object3D;visible:boolean}[]=[];
 root.traverse(object=>{if(object.name==='firearm-mount'){weapons.push({object,visible:object.visible});object.visible=false;}const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;meshes.push({mesh,material:mesh.material});const copy=(material:THREE.Material)=>{let value=copies.get(material);if(!value){value=material.clone();value.transparent=true;value.depthWrite=false;copies.set(material,value);base.set(value,material.opacity);}return value;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);});
 let ended=false;return{setOpacity(factor:number){for(const material of copies.values())material.opacity=(base.get(material)??1)*THREE.MathUtils.clamp(factor,0,1);},dispose(){if(ended)return;ended=true;for(const e of meshes)e.mesh.material=e.material;for(const e of weapons)e.object.visible=e.visible;copies.forEach(material=>material.dispose());meshes.length=0;weapons.length=0;copies.clear();base.clear();}};
}
export function clearPresentationRoot(root:THREE.Object3D){root.removeFromParent();root.visible=false;root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.set(1,1,1);root.updateMatrixWorld(true);}
