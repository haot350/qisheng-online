import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {createWorldWeapon} from '../weapons.ts';
import type {AvatarId,PlayerState,WeaponId} from './shared/protocol';
import {resourceWorkQueue,fetchResource,waitForResource} from '../resource-leases.ts';
import {withDeadline} from '../network.ts';
import {staticAssetUrl} from '../static-assets.ts';

const STYLES:AvatarId[]=['campus-a','campus-b','tactical-a','tactical-b'];
const BASE='/avatars/v0.5.0/';
type Entry={refs:number;scene?:THREE.Group;work:Promise<THREE.Group>;controller:AbortController};
const assets=new Map<AvatarId,Entry>();
function disposeSource(scene:THREE.Group){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
 scene.traverse(o=>{const m=o as THREE.SkinnedMesh;if(!m.isMesh)return;geometries.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:[m.material]){materials.add(mat);for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value);}if(m.isSkinnedMesh)skeletons.add(m.skeleton);});
 skeletons.forEach(s=>s.dispose());textures.forEach(t=>{t.dispose();const image=t.source?.data;if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)image.close();});materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());scene.clear();
}
function release(style:AvatarId,entry:Entry){entry.refs=Math.max(0,entry.refs-1);if(entry.refs!==0)return;if(assets.get(style)===entry)assets.delete(style);entry.controller.abort();if(entry.scene){disposeSource(entry.scene);entry.scene=undefined;}}
function retain(style:AvatarId){let entry=assets.get(style);if(!entry||entry.controller.signal.aborted){
 const created:Entry={refs:0,work:Promise.resolve(new THREE.Group()),controller:new AbortController()};entry=created;assets.set(style,created);
 created.work=resourceWorkQueue.run(created.controller.signal,async()=>{const signal=created.controller.signal,url=staticAssetUrl(BASE+style+'.glb'),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);const bytes=await withDeadline(fetchResource(url,signal),30000,{signal});const gltf=await withDeadline(loader.parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1)),30000,{signal,onLate:g=>disposeSource(g.scene)});if(signal.aborted||created.refs===0){disposeSource(gltf.scene);throw new DOMException('Cancelled','AbortError');}created.scene=gltf.scene;let triangles=0;gltf.scene.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh)triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;});gltf.scene.userData.triangles=triangles;return gltf.scene;}).catch(error=>{created.controller.abort();if(assets.get(style)===created)assets.delete(style);throw error;});
 }entry.refs++;return entry;}

/** Required assets are prepared before the server receives loading-ready. */
export async function preparePlayerAvatars(styles:AvatarId[]=STYLES,signal?:AbortSignal):Promise<{release:()=>void}>{
 const held=[...new Set(styles)].map(style=>({style,entry:retain(style)}));let released=false;
 const drop=()=>{if(released)return;released=true;held.forEach(({style,entry})=>release(style,entry));};
 const aborted=()=>drop();signal?.addEventListener('abort',aborted,{once:true});
 try{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');await waitForResource(Promise.all(held.map(x=>x.entry.work)),signal);if(signal?.aborted||released)throw new DOMException('Cancelled','AbortError');return {release:drop};}catch(error){drop();throw error;}finally{signal?.removeEventListener('abort',aborted);}
}
export const prepareAvatars=preparePlayerAvatars;
export function avatarResourceState(){return [...assets].map(([style,entry])=>({style,refs:entry.refs,ready:!!entry.scene}));}

/** Two-bone IK uses the authored skeleton; targets and gait follow authoritative movement. */
export function createPlayerAvatar(style:AvatarId,team:string){
 const entry=assets.get(style);if(!entry?.scene)throw Error('人物模型尚未就绪。');entry.refs++;
 const root=new THREE.Group(),body=new THREE.Group(),model=cloneSkeleton(entry.scene) as THREE.Group;root.name='online-player-'+style;body.add(model);root.add(body);
 const bones=new Map<string,THREE.Bone>(),rest=new Map<THREE.Bone,{q:THREE.Quaternion;p:THREE.Vector3}>(),privateMaterials=new Set<THREE.Material>(),privateSkeletons=new Set<THREE.Skeleton>();
 const accents=new Map<THREE.Material,THREE.Material>();model.traverse(o=>{if((o as THREE.Bone).isBone){const b=o as THREE.Bone;bones.set(b.name,b);rest.set(b,{q:b.quaternion.clone(),p:b.position.clone()});}const mesh=o as THREE.SkinnedMesh;if(!mesh.isMesh)return;mesh.castShadow=true;mesh.frustumCulled=false;if(mesh.isSkinnedMesh)privateSkeletons.add(mesh.skeleton);const tint=(mat:THREE.Material)=>{if(mat.name!=='TeamAccent')return mat;let copy=accents.get(mat);if(!copy){copy=mat.clone();if(copy instanceof THREE.MeshStandardMaterial)copy.color.set(team==='red'?0x9b493c:team==='blue'?0x3e6774:0x74835e);accents.set(mat,copy);privateMaterials.add(copy);}return copy;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(tint):tint(mesh.material);});
 root.updateMatrixWorld(true);
 const legs=['l','r'].map(side=>({a:bones.get('thigh_'+side)!,b:bones.get('calf_'+side)!,end:bones.get('foot_'+side)!}));
 const arms=['l','r'].map(side=>({a:bones.get('upperarm_'+side)!,b:bones.get('lowerarm_'+side)!,end:bones.get('hand_'+side)!}));
 const restFeet=legs.map(l=>root.worldToLocal(l.end.getWorldPosition(new THREE.Vector3()))),footQ=legs.map(l=>root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(l.end.getWorldQuaternion(new THREE.Quaternion())));
 let weapon:WeaponId='m4a1';const gun=createWorldWeapon(weapon,'far');root.add(gun.root);
 let gait=0,initialized=false,disposed=false,lastSerial=0,recoil=0,crouch=0,lean=0;const last=new THREE.Vector3(),position=new THREE.Vector3(),delta=new THREE.Vector3(),localMovement=new THREE.Vector3(0,0,-1),forward=new THREE.Vector3(),grip=new THREE.Vector3(),support=new THREE.Vector3();
 const tempA=new THREE.Vector3(),tempB=new THREE.Vector3(),tempC=new THREE.Vector3(),tempQ=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
 function toWorld(local:THREE.Vector3){return root.localToWorld(local);}
 function orient(bone:THREE.Bone,child:THREE.Bone,target:THREE.Vector3){bone.getWorldPosition(tempA);child.getWorldPosition(tempB);tempB.sub(tempA).normalize();tempC.copy(target).sub(tempA).normalize();if(tempC.lengthSq()<.1)return;tempQ.setFromUnitVectors(tempB,tempC).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));bone.parent!.getWorldQuaternion(parentQ);bone.quaternion.copy(parentQ.invert().multiply(tempQ));bone.updateWorldMatrix(false,true);}
 function solve(limb:typeof legs[number],target:THREE.Vector3,bend:THREE.Vector3){const origin=limb.a.getWorldPosition(new THREE.Vector3()),joint=limb.b.getWorldPosition(new THREE.Vector3()),end=limb.end.getWorldPosition(new THREE.Vector3());const l1=origin.distanceTo(joint),l2=joint.distanceTo(end),axis=target.clone().sub(origin),d=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.001,l1+l2-.003);axis.normalize();const direction=bend.clone().sub(origin);direction.addScaledVector(axis,-direction.dot(axis));if(direction.lengthSq()<1e-5)direction.set(0,0,-1).addScaledVector(axis,axis.z);direction.normalize();const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),knee=origin.clone().addScaledVector(axis,along).addScaledVector(direction,height),goal=origin.clone().addScaledVector(axis,d);orient(limb.a,limb.b,knee);orient(limb.b,limb.end,goal);}
 function setWorldQ(bone:THREE.Bone,q:THREE.Quaternion){bone.parent!.getWorldQuaternion(parentQ);bone.quaternion.copy(parentQ.invert().multiply(q));bone.updateWorldMatrix(false,true);}
 const poseTargets={feet:[new THREE.Vector3(),new THREE.Vector3()],hands:[new THREE.Vector3(),new THREE.Vector3()]};
 return {root,resetPresentation(){gait=0;initialized=false;lastSerial=0;recoil=0;crouch=0;lean=0;for(const value of [last,position,delta,grip,support,tempA,tempB,tempC,...poseTargets.feet,...poseTargets.hands])value.set(0,0,0);body.position.set(0,0,0);body.rotation.set(0,0,0);for(const [bone,value]of rest){bone.quaternion.copy(value.q);bone.position.copy(value.p);}gun.update(0,{reloadProgress:0,shotSerial:0,resetShot:true,lowered:true});},update(dt:number,p:PlayerState,shotSerial:number){
  if(disposed)return;dt=Math.min(.1,Math.max(0,dt));for(const [bone,value]of rest){bone.quaternion.copy(value.q);bone.position.copy(value.p);}body.position.set(0,0,0);body.rotation.set(0,0,0);
  root.getWorldPosition(position);delta.copy(position).sub(last);const distance=initialized?Math.hypot(delta.x,delta.z):0;initialized=true;last.copy(position);const speed=dt>0?Math.min(8,distance/dt):0,moving=p.grounded&&distance>.0005&&distance<1;
  if(moving){localMovement.copy(delta).applyAxisAngle(up,-root.rotation.y).setY(0).normalize();gait+=distance*(p.sprinting?5.8:8.2);}
  crouch=THREE.MathUtils.damp(crouch,(p.crouched||p.sliding||!!p.revivingTarget) ? .35 : 0,14,dt);
  lean=THREE.MathUtils.damp(lean,p.sliding?.42:p.sprinting?.13:0,12,dt);body.position.y=-crouch+(moving?Math.abs(Math.sin(gait))*.017:0);body.rotation.x=-lean;
  root.updateMatrixWorld(true);const stride=moving?THREE.MathUtils.clamp(speed*(p.sprinting?.075:.065),.05,.36):0;
  legs.forEach((leg,i)=>{const phase=gait+i*Math.PI,swing=Math.sin(phase),foot=restFeet[i].clone().addScaledVector(localMovement,swing*stride);foot.y+=Math.max(0,Math.cos(phase))*(moving?(p.sprinting?.12:.065):0);if(p.sliding){foot.z-=.27;foot.y+=.015;}if(p.revivingTarget){foot.z+=i===0?.20:-.20;}const target=toWorld(foot);poseTargets.feet[i].copy(target);solve(leg,target,toWorld(new THREE.Vector3(restFeet[i].x,.52,-.7)));setWorldQ(leg.end,root.getWorldQuaternion(new THREE.Quaternion()).multiply(footQ[i]));});
  const shotChanged=shotSerial>lastSerial;if(shotChanged)recoil=.04;lastSerial=shotSerial;recoil=Math.max(0,recoil-dt*.35);
  if(p.weapon!==weapon){weapon=p.weapon;gun.setWeapon(weapon);}
  const reloading=p.weaponAction.phase==='reload',lowered=p.sprinting&&!p.aim||!!p.revivingTarget,low=crouch;
  grip.copy(toWorld(new THREE.Vector3(.075,1.30-low+(p.aim?.08:0),-.145+recoil)));
  forward.set(0,0,-1).applyEuler(new THREE.Euler(p.pitch,p.yaw,0,'YXZ'));gun.root.position.copy(root.worldToLocal(grip.clone()));
  gun.update(dt,{gripWorld:grip,aimTarget:grip.clone().addScaledVector(forward,30),reloadProgress:reloading?p.weaponAction.progress:0,shotSerial,lowered,empty:p.ammo===0,action:{phase:p.weaponAction.phase as any,stage:p.weaponAction.stage as any,progress:p.weaponAction.progress,stageProgress:p.weaponAction.stageProgress??p.weaponAction.progress,active:p.weaponAction.phase!=='idle',ready:p.weaponAction.ready,elapsed:0,duration:1,pending:false,empty:p.ammo===0,shellIndex:p.weaponAction.shellIndex??0,shellCount:p.weaponAction.shellCount??0}});
  root.updateMatrixWorld(true);const actualGrip=gun.getAnchorWorld('grip'),offset=grip.clone().sub(actualGrip);gun.root.position.add(offset.applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert()));root.updateMatrixWorld(true);
  const right=gun.getAnchorWorld('grip').addScaledVector(forward,-.055);support.copy(gun.getAnchorWorld('support')).addScaledVector(forward,-.105);if(support.distanceTo(right)>.75)support.copy(right).addScaledVector(forward,.26);support.y-=.025;
  if(reloading){const amount=Math.sin(THREE.MathUtils.clamp(p.weaponAction.progress,0,1)*Math.PI);support.lerp(toWorld(new THREE.Vector3(-.22,1.03-low,-.13)),amount);}
  if(p.revivingTarget){support.copy(toWorld(new THREE.Vector3(-.16,.74,-.40)));right.copy(toWorld(new THREE.Vector3(.13,.76,-.42)));}
  const hands=[support,right];arms.forEach((arm,i)=>{poseTargets.hands[i].copy(hands[i]);solve(arm,hands[i],toWorld(new THREE.Vector3(i===0?-.37:.38,1.01-low,.08)));const handQ=gun.root.getWorldQuaternion(new THREE.Quaternion());handQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),i===0?-Math.PI/2:Math.PI/2));setWorldQ(arm.end,handQ);});
  for(const [name,bone]of bones)if(/^(middle|ring|pinky|thumb)_0[123]_[lr]$/.test(name))bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),name.startsWith('thumb')?.40:.75));
  const head=bones.get('Head');if(head&&p.life==='alive'){const axis=new THREE.Vector3(1,0,0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())),look=new THREE.Quaternion().setFromAxisAngle(axis,THREE.MathUtils.clamp(p.pitch*.6,-.65,.65));setWorldQ(head,look.multiply(head.getWorldQuaternion(new THREE.Quaternion())));}gun.root.visible=p.life==='alive'&&!p.revivingTarget;
  if(p.life!=='alive'){body.rotation.set(Math.PI/2,0,p.life==='downed'?.14:0);body.position.set(0,.20,.07);}
  root.updateMatrixWorld(true);
 },getPoseDiagnostic(){return {style,weapon,hands:poseTargets.hands.map(v=>v.toArray()),shoulders:arms.map(l=>l.a.getWorldPosition(new THREE.Vector3()).toArray()),armLengths:arms.map(l=>l.a.getWorldPosition(new THREE.Vector3()).distanceTo(l.b.getWorldPosition(new THREE.Vector3()))+l.b.getWorldPosition(new THREE.Vector3()).distanceTo(l.end.getWorldPosition(new THREE.Vector3()))),handErrors:arms.map((limb,i)=>limb.end.getWorldPosition(new THREE.Vector3()).distanceTo(poseTargets.hands[i])),feet:poseTargets.feet.map(v=>v.toArray()),actualFeet:legs.map(l=>l.end.getWorldPosition(new THREE.Vector3()).toArray()),triangles:(entry.scene!.userData.triangles??0)};},dispose(){if(disposed)return;disposed=true;gun.dispose();privateMaterials.forEach(m=>m.dispose());privateSkeletons.forEach(s=>s.dispose());root.clear();release(style,entry);}};
}
