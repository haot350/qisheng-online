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

type FadeResources={activate:()=>void;restore:()=>void;setOpacity:(factor:number)=>void;destroy:()=>void};
const retainedFades=new WeakMap<THREE.Object3D,FadeResources>();
/** Keep the transparent shader variant alive for the whole pooled appearance.
 * Disposing its last material after each death also deletes the GPU program. */
export function preparePresentationFade(root:THREE.Object3D):FadeResources{
 const retained=retainedFades.get(root);if(retained)return retained;
 const meshes:{mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];fade:THREE.Material|THREE.Material[]}[]=[],copies=new Map<THREE.Material,THREE.Material>(),base=new Map<THREE.Material,number>(),weapons:{object:THREE.Object3D;visible:boolean}[]=[];
 const copy=(material:THREE.Material)=>{let value=copies.get(material);if(!value){value=material.clone();value.transparent=true;value.depthWrite=false;copies.set(material,value);base.set(value,material.opacity);}return value;};
 root.traverse(object=>{if(object.name==='firearm-mount')weapons.push({object,visible:object.visible});let parent:THREE.Object3D|null=object;while(parent&&parent!==root){if(parent.name==='firearm-mount')return;parent=parent.parent;}const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;meshes.push({mesh,original:mesh.material,fade:Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material)});});
 let active=false,destroyed=false;const result:FadeResources={activate(){if(active||destroyed)return;active=true;for(const [original,material]of copies){base.set(material,original.opacity);for(const [key,value]of Object.entries(original)){const target=material as unknown as Record<string,unknown>;if(value instanceof THREE.Texture||value===null&&target[key] instanceof THREE.Texture)target[key]=value;}}for(const row of meshes)row.mesh.material=row.fade;for(const row of weapons){row.visible=row.object.visible;row.object.visible=false;}result.setOpacity(1);},restore(){if(!active)return;active=false;for(const row of meshes)row.mesh.material=row.original;for(const row of weapons)row.object.visible=row.visible;},setOpacity(factor){for(const material of copies.values())material.opacity=(base.get(material)??1)*THREE.MathUtils.clamp(factor,0,1);},destroy(){if(destroyed)return;result.restore();destroyed=true;copies.forEach(material=>material.dispose());copies.clear();base.clear();meshes.length=weapons.length=0;retainedFades.delete(root);}};retainedFades.set(root,result);return result;
}
export function createPresentationFade(root:THREE.Object3D){const prepared=preparePresentationFade(root);prepared.activate();let ended=false;return{setOpacity:prepared.setOpacity,dispose(){if(ended)return;ended=true;prepared.restore();}};}
export function disposePresentationFade(root:THREE.Object3D){retainedFades.get(root)?.destroy();}
export function clearPresentationRoot(root:THREE.Object3D){root.removeFromParent();root.visible=false;root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.set(1,1,1);root.updateMatrixWorld(true);}
