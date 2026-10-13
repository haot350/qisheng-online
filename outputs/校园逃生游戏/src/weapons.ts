/** Authored Blender firearm assets. Local -Z is the barrel axis; metres, Y up. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import type {WeaponId} from './types';
import {WEAPON_IDS,type WeaponActionSnapshot} from './rules.ts';
import {withDeadline} from './network.ts';
import type {WeaponResource} from './weapon-resources.ts';
import {ResourceLeases,resourceWorkQueue,fetchResource,abortResource,waitForResource} from './resource-leases.ts';
import {staticAssetUrl} from './static-assets.ts';

export type WeaponLod='near'|'far';
export interface WorldWeaponState {aimTarget?:THREE.Vector3;gripWorld?:THREE.Vector3;reloadProgress:number;shotSerial:number;lowered:boolean;empty?:boolean;resetShot?:boolean;action?:WeaponActionSnapshot;}
export interface WorldWeapon {root:THREE.Group;setWeapon(id:WeaponId):void;update(dt:number,state:WorldWeaponState):void;getMuzzleWorld(out?:THREE.Vector3):THREE.Vector3;getMuzzleDirectionWorld(out?:THREE.Vector3):THREE.Vector3;getBarrelDirection(out?:THREE.Vector3):THREE.Vector3;getAnchorWorld(name:string,out?:THREE.Vector3):THREE.Vector3;getAnchorLocal(name:string,out?:THREE.Vector3):THREE.Vector3;getEjectionWorld(out?:THREE.Vector3):THREE.Vector3;getAimReady(toleranceRadians?:number):boolean;isAimReady(target:THREE.Vector3,toleranceRadians?:number):boolean;dispose():void;}
function disposeShared(object:THREE.Object3D){const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();object.traverse(o=>{if(o instanceof THREE.Mesh){geometry.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
const resources=new ResourceLeases<THREE.Group>((key,signal)=>resourceWorkQueue.run(signal,async()=>{
 const url=staticAssetUrl('/weapons/'+key+'.glb'),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 const bytes=await withDeadline(fetchResource(url,signal),30000,{signal});
 const gltf=await withDeadline(loader.parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1)),30000,{signal,onLate:g=>disposeShared(g.scene)});
 if(signal.aborted){disposeShared(gltf.scene);abortResource(signal);}
 const group=gltf.scene,tuned=new Set<THREE.Material>();
 if(!group.getObjectByName('muzzle')){disposeShared(group);throw Error('枪口锚点缺失：'+key);}
 group.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=false;for(const material of(Array.isArray(o.material)?o.material:[o.material]))if(material instanceof THREE.MeshStandardMaterial&&!tuned.has(material)){tuned.add(material);material.envMapIntensity=.9;material.roughness=Math.max(.26,material.roughness);}}});return group;
}),disposeShared);
export function weaponResourceDiagnostics(){return resources.diagnostics();}
/** Preparation and live instances hold independent leases on the same abortable work. */
export async function prepareWeapons(onProgress?:(ratio:number)=>void,required:WeaponResource[]=WEAPON_IDS.flatMap(id=>(['near','far'] as const).map(lod=>({id,lod}))),signal?:AbortSignal):Promise<()=>void>{
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const keys=[...new Set(required.map(row=>row.id+'-'+row.lod))],held=keys.map(key=>resources.acquire(key));let released=false,done=0;
 const release=()=>{if(released)return;released=true;held.forEach(lease=>lease.release());};signal?.addEventListener('abort',release,{once:true});
 try{await waitForResource(Promise.all(held.map(lease=>lease.value.then(()=>{done++;if(!released&&!signal?.aborted)onProgress?.(done/held.length);}))),signal);if(signal?.aborted||released)throw new DOMException('Cancelled','AbortError');onProgress?.(1);return release;}catch(error){release();throw new Error('枪械资源载入失败，请重试。',{cause:error});}finally{signal?.removeEventListener('abort',release);}
}

/** Aim the real barrel ray at a target while rotating about the held grip or mount.
 * The muzzle may sit above/off the pivot: aiming -Z from the pivot alone misses nearby targets.
 * Solve |muzzleOffset + barrel*t| = |target-pivot|, then rotate that vector onto the target.
 */
export function solveMuzzleAimQuaternion(pivotWorld:THREE.Vector3,targetWorld:THREE.Vector3,muzzleOffsetLocal:THREE.Vector3,barrelLocal:THREE.Vector3,out:THREE.Quaternion):boolean {
 const delta=targetWorld.clone().sub(pivotWorld),axis=barrelLocal.clone().normalize(),along=muzzleOffsetLocal.dot(axis),discriminant=along*along+delta.lengthSq()-muzzleOffsetLocal.lengthSq();
 if(delta.lengthSq()<1e-8||discriminant<0)return false;
 const distance=-along+Math.sqrt(discriminant);if(distance<=0)return false;
 const localTarget=muzzleOffsetLocal.clone().addScaledVector(axis,distance);out.setFromUnitVectors(localTarget.normalize(),delta.normalize());return true;
}

/** A per-instance graph around leased, immutable GLB geometry/materials. */
export function createWorldWeapon(initial:WeaponId,lod:WeaponLod='far'):WorldWeapon {
 const root=new THREE.Group();root.name='firearm-mount';const carrier=new THREE.Group();root.add(carrier);
 const flash=new THREE.Mesh(new THREE.ConeGeometry(.031,.11,6),new THREE.MeshBasicMaterial({color:'#ffdb8a',transparent:true,opacity:.8,depthWrite:false}));flash.name='muzzle-flash';flash.rotation.x=-Math.PI/2;flash.visible=false;
 let model:THREE.Group,muzzle:THREE.Object3D;const parts=new Map<string,THREE.Object3D>(),base=new Map<THREE.Object3D,{position:THREE.Vector3;rotation:THREE.Euler}>();let resourceRelease:(()=>void)|undefined,current=initial,lastSerial=-1,kick=0,flashLeft=0,disposed=false,lowered=true,actionReady=true;const aimPoint=new THREE.Vector3();let hasAim=false;const authoredMuzzle=new THREE.Vector3(),authoredGrip=new THREE.Vector3(),authoredBarrel=new THREE.Vector3(0,0,-1),authoredQ=new THREE.Quaternion();
 const setWeapon=(id:WeaponId)=>{const key=id+'-'+lod,shared=resources.peek(key);if(!shared)throw Error('枪械资源尚未就绪：'+id);const lease=resources.retainReady(key),old=resourceRelease;resourceRelease=lease.release;current=id;flash.removeFromParent();carrier.clear();model=shared.clone(true);carrier.add(model);muzzle=model.getObjectByName('muzzle')!;muzzle.add(flash);flash.position.set(0,0,-.055);parts.clear();base.clear();for(const name of ['magazine','slide','pump','bolt','cover','belt','bolt-handle']){const part=model.getObjectByName(name);if(part){parts.set(name,part);base.set(part,{position:part.position.clone(),rotation:part.rotation.clone()});}}flash.visible=false;lastSerial=-1;kick=flashLeft=0;root.updateWorldMatrix(true,true);root.worldToLocal(muzzle.getWorldPosition(authoredMuzzle));const grip=model.getObjectByName('grip');if(grip)root.worldToLocal(grip.getWorldPosition(authoredGrip));else authoredGrip.set(0,0,0);muzzle.getWorldQuaternion(authoredQ);authoredQ.premultiply(root.getWorldQuaternion(new THREE.Quaternion()).invert());authoredBarrel.set(0,0,-1).applyQuaternion(authoredQ).normalize();old?.();};
 setWeapon(initial);
 const targetQ=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),direction=new THREE.Vector3(),origin=new THREE.Vector3(),worldQ=new THREE.Quaternion();
 const anchor=(name:string,out=new THREE.Vector3())=>{root.updateWorldMatrix(true,true);return (model.getObjectByName(name)??muzzle).getWorldPosition(out);};
 const barrel=(out=new THREE.Vector3())=>{root.updateWorldMatrix(true,true);muzzle.getWorldQuaternion(worldQ);return out.set(0,0,-1).applyQuaternion(worldQ).normalize();};
 const ready=(target:THREE.Vector3,tolerance=.12)=>{if(lowered||disposed||!actionReady)return false;const delta=target.clone().sub(anchor('muzzle'));if(delta.lengthSq()<1e-6)return false;return barrel().dot(delta.normalize())>=Math.cos(tolerance);};
 return {root,setWeapon,getMuzzleWorld:(out)=>anchor('muzzle',out),getMuzzleDirectionWorld:barrel,getBarrelDirection:barrel,getAnchorWorld:anchor,getAnchorLocal(name,out=new THREE.Vector3()){anchor(name,out);return root.worldToLocal(out);},getEjectionWorld:(out)=>anchor('ejection',out),getAimReady:(tolerance=.12)=>hasAim&&ready(aimPoint,tolerance),isAimReady:ready,update(dt,state){
  if(disposed)return;lowered=state.lowered;actionReady=state.action?.ready??state.reloadProgress===0;hasAim=!!state.aimTarget;if(state.aimTarget)aimPoint.copy(state.aimTarget);
  if(state.resetShot||state.shotSerial<lastSerial){lastSerial=state.shotSerial;kick=0;flashLeft=0;}else if(state.shotSerial!==lastSerial){if(lastSerial>=0&&state.shotSerial>lastSerial){kick=1;flashLeft=.045;}lastSerial=state.shotSerial;}
  kick=Math.max(0,kick-dt*(current==='r870'||current==='awm'?4.5:16));flashLeft=Math.max(0,flashLeft-dt);
  if(state.aimTarget&&!state.lowered){if(state.gripWorld)origin.copy(state.gripWorld);else root.getWorldPosition(origin);direction.copy(authoredMuzzle);if(state.gripWorld)direction.sub(authoredGrip);if(solveMuzzleAimQuaternion(origin,state.aimTarget,direction,authoredBarrel,targetQ)){if(root.parent){root.parent.getWorldQuaternion(parentQ);targetQ.premultiply(parentQ.invert());}root.quaternion.slerp(targetQ,1-Math.exp(-dt*20));}}else {targetQ.setFromAxisAngle(new THREE.Vector3(1,0,0),state.lowered?-.65:0);root.quaternion.slerp(targetQ,1-Math.exp(-dt*14));}
  model.position.z=kick*.018;model.rotation.x=kick*.045;
  for(const [part,b]of base){part.position.copy(b.position);part.rotation.copy(b.rotation);}
  const action=state.action,progress=THREE.MathUtils.clamp(state.reloadProgress,0,1),reload=action? action.phase==='reload'&&action.active : progress>0,stage=action?.stage,p=action?.stageProgress??progress;
  const magazine=parts.get('magazine'),slide=parts.get('slide'),bolt=parts.get('bolt'),pump=parts.get('pump'),handle=parts.get('bolt-handle'),cover=parts.get('cover'),belt=parts.get('belt');
  if(magazine&&reload&&current!=='m249'){let pull=0;if(stage==='mag-out')pull=p;else if(stage==='mag-in')pull=1-p;else if(!action)pull=progress<.45?Math.sin(progress/.45*Math.PI/2):progress<.78?Math.cos((progress-.45)/.33*Math.PI/2):0;magazine.position.y-=pull*.19;magazine.position.x-=pull*.03;magazine.rotation.z-=pull*.2;}
  if(slide)slide.position.z+=(state.empty?.028:0)+kick*.026;
  if(bolt)bolt.position.z+=(reload&&stage==='chamber'?Math.sin(p*Math.PI)*.055:kick*.025);
  const cycle=action?.phase==='cycle'?action.progress:0;
  if(pump)pump.position.z+=(reload&&stage==='pump'?Math.sin(p*Math.PI)*.09:cycle>0?Math.sin(Math.max(0,Math.min(1,(cycle-.12)/.72))*Math.PI)*.09:kick>0?Math.sin((1-kick)*Math.PI)*.08:0);
  if(current==='awm'&&action?.phase==='cycle'){const stroke=Math.sin(Math.max(0,Math.min(1,(cycle-.15)/.70))*Math.PI);if(bolt)bolt.position.z+=stroke*.10;if(handle){handle.position.z+=stroke*.10;handle.rotation.z+=Math.sin(Math.min(1,cycle/.30)*Math.PI)*-.65;}}
  if(cover&&reload){const lift=stage==='open-cover'?p:stage==='belt-in'?1:stage==='close-cover'?1-p:0;cover.rotation.x-=lift*1.05;}
  if(belt&&reload&&stage==='belt-in')belt.position.y+=(1-p)*.12;
  flash.visible=flashLeft>0&&!state.lowered;flash.scale.setScalar(.8+kick*.4);
 },dispose(){if(disposed)return;disposed=true;flash.removeFromParent();flash.geometry.dispose();(flash.material as THREE.Material).dispose();root.clear();resourceRelease?.();resourceRelease=undefined;}};
}
