import * as THREE from 'three';
import type {CharacterState,WeaponKind} from './characters';
import {createWorldWeapon} from './weapons';
import {portraitHit,type BodyLayout} from './combat.ts';
import {NPC_LAYOUT} from './npc-layout.ts';
import {NPC_LAYOUT_V13} from './npc-layout-v13.ts';
import {NPC_LAYOUT_MOTION} from './npc-layout-motion.ts';
import {NPC_LAYOUT_COMBAT} from './npc-layout-combat.ts';
import {NpcLocomotion,chooseNpcPose,isNpcMovingPose,isNpcArmedPose,type NpcMotionPose} from './npc-locomotion.ts';
import {NPC_IDENTITY,npcPoseFilename,type NpcIdentityId,type NpcPose} from './npc-roster.ts';
import {withDeadline} from './network.ts';
import {resourceWorkQueue,fetchResource,decodeResourceImage,abortResource,waitForResource} from './resource-leases.ts';
import {staticAssetUrl} from './static-assets.ts';

type Pose={texture:THREE.Texture;shape:BodyLayout;hand:readonly [number,number,number];alpha?:{width:number;height:number;data:Uint8Array}};
type Entry={key:string;refs:number;abort:AbortController;promise:Promise<Pose>;pose?:Pose;disposed:boolean};
const cache=new Map<string,Entry>();
const poseKey=(id:NpcIdentityId,pose:NpcPose,mobile:boolean)=>`${id}:${pose}:${mobile?'mobile':'desktop'}`;
const cancelled=()=>new Error('人物图片载入已中止。');

export function npcPortraitLayout(id:NpcIdentityId,pose:NpcPose):{shape:BodyLayout;hand:readonly [number,number,number]}{
 const rows=NPC_LAYOUT_COMBAT as unknown as Record<string,Record<string,BodyLayout&{hand:readonly [number,number,number]}>>;
 const calibrated=rows[id]?.[pose];
 if(calibrated)return{shape:calibrated,hand:calibrated.hand};
 if(pose==='attack'||pose==='reload'||pose.startsWith('combat-')){
  const row=rows[id]?.[pose];
  if(!row)throw new Error('新版人物动作尚未校准：'+id+' / '+pose);
  return{shape:row,hand:row.hand};
 }
 if(pose.startsWith('walk-')||pose.startsWith('run-')){const rows=NPC_LAYOUT_MOTION as unknown as Partial<Record<NpcIdentityId,Partial<Record<NpcMotionPose,BodyLayout&{hand:readonly [number,number,number]}>>>>;const row=rows[id]?.[pose as NpcMotionPose];if(!row)throw Error('人物行走动作尚未准备好。');return{shape:row,hand:row.hand};}
 const def=NPC_IDENTITY[id];
 if(def.legacyLayout!==undefined)return{shape:NPC_LAYOUT[def.legacyLayout][0] as unknown as BodyLayout,hand:[-.08,.74,.18]};
 const row=NPC_LAYOUT_V13[id as 'xutao'|'chengguotao'][pose as 'idle'|'attack'|'skill'];
 if(!row)throw Error('人物姿态尚未准备好。');
 return{shape:row as unknown as BodyLayout,hand:row.hand};
}
function releaseEntry(entry:Entry){
 if(entry.refs<=0)return;
 if(--entry.refs===0){
  if(cache.get(entry.key)===entry)cache.delete(entry.key);
  entry.abort.abort();
  if(entry.pose&&!entry.disposed){entry.disposed=true;entry.pose.texture.dispose();}
 }
}
function retainEntry(id:NpcIdentityId,pose:NpcPose,mobile:boolean):Entry{
 const key=poseKey(id,pose,mobile),existing=cache.get(key);
 if(existing&&!existing.abort.signal.aborted){existing.refs++;return existing;}
 const abort=new AbortController(),entry:Entry={key,refs:1,abort,promise:undefined as unknown as Promise<Pose>,disposed:false};
 cache.set(key,entry);
 const filename=npcPoseFilename(id,pose,mobile);
 entry.promise=resourceWorkQueue.run(abort.signal,async()=>{
  const bytes=await withDeadline(fetchResource(staticAssetUrl(filename),abort.signal),30000,{signal:abort.signal});
  const image=await withDeadline(decodeResourceImage(bytes,abort.signal),30000,{signal:abort.signal});abortResource(abort.signal);
  const texture=new THREE.Texture(image);texture.needsUpdate=true;
  try{
   texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;
   const {shape,hand}=npcPortraitLayout(id,pose);let alpha:Pose['alpha'];
   const im=texture.image as {width:number;height:number};
   if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(ctx){ctx.drawImage(texture.image,0,0);const rgba=ctx.getImageData(0,0,im.width,im.height).data,data=new Uint8Array(im.width*im.height);for(let j=0;j<data.length;j++)data[j]=rgba[j*4+3];alpha={width:im.width,height:im.height,data};canvas.width=canvas.height=0;}
   }
   if(entry.refs===0)throw cancelled();
   const loaded={texture,shape,hand,alpha};entry.pose=loaded;return loaded;
  }catch(error){texture.dispose();entry.disposed=true;throw error;}
 }).catch(error=>{abort.abort();if(cache.get(key)===entry)cache.delete(key);throw error;});
 return entry;
}

/** Load selected identities only; overlapping rounds share identity/pose/quality entries. */
export async function prepareBillboards(ids:readonly NpcIdentityId[],progress:(p:number)=>void=()=>{},mobile=false,signal?:AbortSignal):Promise<()=>void>{
 if(signal?.aborted)throw cancelled();
 const unique=[...new Set(ids)],entries=unique.flatMap(id=>NPC_IDENTITY[id].poses.map(pose=>retainEntry(id,pose,mobile)));
 let released=false,completed=0;
 const release=()=>{if(released)return;released=true;entries.forEach(releaseEntry);};
 if(!entries.length){progress(1);return release;}
 signal?.addEventListener('abort',release,{once:true});
 try{
  const work=Promise.all(entries.map(entry=>entry.promise.then(()=>{if(!released&&!signal?.aborted)progress(++completed/entries.length);})));
  await waitForResource(work,signal);
  if(signal?.aborted)throw cancelled();
  return release;
 }catch(error){release();throw new Error('人物图片未能载入，请重试。',{cause:error});}finally{signal?.removeEventListener('abort',release);}
}
function poseGeometry(shape:BodyLayout){
 const height=1.75*shape.h/(shape.box[3]-shape.box[1]),width=height*shape.w/shape.h,bottom=height*(shape.h-shape.box[3])/shape.h;
 const anchorX=shape.anchorX??(shape.box[0]+shape.box[2])*.5;
 const g=new THREE.PlaneGeometry(width,height);g.translate(width*(.5-anchorX/shape.w),height*.5-bottom,0);return g;
}

export function createBillboardCharacter(identityId:NpcIdentityId,mobile=false){
 const def=NPC_IDENTITY[identityId],entries=def.poses.map(pose=>cache.get(poseKey(identityId,pose,mobile)));
 if(entries.some(entry=>!entry?.pose))throw Error('人物图片尚未准备好。');
 // Rig ownership prevents a round cancellation from disposing a still-visible texture.
 const retained=entries as Entry[];retained.forEach(entry=>entry.refs++);
 const poses=Object.fromEntries(def.poses.map((pose,i)=>[pose,retained[i].pose!])) as Record<NpcPose,Pose>;
 const geometries=Object.fromEntries(def.poses.map(pose=>[pose,poseGeometry(poses[pose].shape)])) as Record<NpcPose,THREE.PlaneGeometry>;
 const root=new THREE.Group();root.name=def.name;root.userData.identityId=identityId;
 const material=new THREE.MeshBasicMaterial({map:poses.idle.texture,alphaTest:.5,side:THREE.DoubleSide,toneMapped:false,depthTest:true,depthWrite:true});
 const plane=new THREE.Mesh(geometries.idle,material);plane.name=`${identityId}-portrait`;root.add(plane);
 const shade=new THREE.Mesh(new THREE.CircleGeometry(.36,20),new THREE.MeshBasicMaterial({color:0x192522,transparent:true,opacity:.17,depthWrite:false}));shade.rotation.x=-Math.PI/2;shade.position.y=.025;root.add(shade);
 const gun=createWorldWeapon(def.weapon,'far');root.add(gun.root);const gait=new NpcLocomotion(),cameraPosition=new THREE.Vector3(),verticalAxis=new THREE.Vector3(0,1,0),desiredGrip=new THREE.Vector3(),gripOffset=new THREE.Vector3(),gripWorld=new THREE.Vector3();let suppressed=0,variant:NpcPose='idle',disposed=false;
 const update=(dt:number,state:CharacterState&{portraitPose?:NpcPose;portraitBob?:number},_distance:number,camera?:THREE.Camera)=>{
  if(disposed)return;suppressed=THREE.MathUtils.damp(suppressed,state.suppressed>0?1:0,8,dt);
  if(state.suppressed>0)gait.reset(root.position);
  const motion=gait.update(dt,state.speed,root.position);
  const next=state.portraitPose&&Object.hasOwn(poses,state.portraitPose)?state.portraitPose:chooseNpcPose(motion,{...state,skill:state.skill===def.skill?state.skill:undefined},!!poses.skill);
  if(next!==variant){variant=next;plane.geometry=geometries[variant];material.map=poses[variant].texture;}plane.userData.pose=variant;
  plane.scale.y=1-suppressed*.38;plane.position.y=isNpcMovingPose(variant)&&suppressed<.1?(state.portraitBob??motion.bob):0;
  if(camera){camera.getWorldPosition(cameraPosition);plane.rotation.y=Math.atan2(cameraPosition.x-root.position.x,cameraPosition.z-root.position.z)-root.rotation.y;}
  material.color.setHex(state.hit>0?0xffd8c7:state.suppressed>0?0xb4b6bb:0xffffff);
  desiredGrip.fromArray(poses[variant].hand);desiredGrip.y=desiredGrip.y*plane.scale.y+plane.position.y;desiredGrip.applyAxisAngle(verticalAxis,plane.rotation.y);gun.root.position.copy(desiredGrip);root.updateWorldMatrix(true,true);
  gun.update(dt,{aimTarget:state.aimTarget,gripWorld:gripWorld.copy(desiredGrip).applyMatrix4(root.matrixWorld),reloadProgress:state.reloadProgress??0,shotSerial:state.shotSerial??0,lowered:!isNpcArmedPose(variant)||state.suppressed>0||state.reloading||!!state.skill,action:state.action});
  gun.root.position.copy(desiredGrip).sub(gun.getAnchorLocal('grip',gripOffset).applyQuaternion(gun.root.quaternion));root.updateWorldMatrix(true,true);
 };
 return{root,update,preparationTextures:Object.values(poses).map(pose=>pose.texture),resetPresentation(){gait.reset();suppressed=0;variant='idle';plane.geometry=geometries.idle;material.map=poses.idle.texture;material.color.setHex(0xffffff);plane.position.set(0,0,0);plane.rotation.set(0,0,0);plane.scale.set(1,1,1);for(const value of [cameraPosition,desiredGrip,gripOffset,gripWorld])value.set(0,0,0);gun.update(0,{reloadProgress:0,shotSerial:0,resetShot:true,lowered:true});},setWeapon(id:WeaponKind){gun.setWeapon(id);},getMuzzleWorld(){root.updateWorldMatrix(true,true);return gun.getMuzzleWorld();},getMuzzleDirectionWorld(){root.updateWorldMatrix(true,true);return gun.getMuzzleDirectionWorld();},getEjectionWorld(){root.updateWorldMatrix(true,true);return gun.getEjectionWorld();},getAimReady(toleranceRadians=.12){root.updateWorldMatrix(true,true);return gun.getAimReady(toleranceRadians);},isAimReady(target:THREE.Vector3,toleranceRadians=.12){root.updateWorldMatrix(true,true);return gun.isAimReady(target,toleranceRadians);},hitTest(origin:THREE.Vector3,direction:THREE.Vector3){return portraitHit(origin,direction,plane,poses[variant].shape,poses[variant].alpha);},dispose(){if(disposed)return;disposed=true;gun.dispose();Object.values(geometries).forEach(g=>g.dispose());material.dispose();shade.geometry.dispose();(shade.material as THREE.Material).dispose();root.clear();retained.forEach(releaseEntry);}};
}


export function billboardResourceDiagnostics(){
 let pixels=0,references=0,ready=0;
 for(const entry of cache.values()){references+=entry.refs;if(entry.pose){ready++;const image=entry.pose.texture.image as {width:number;height:number};pixels+=image.width*image.height;}}
 return{entries:cache.size,ready,references,decodedPixels:pixels,approxRgbaBytes:pixels*4,keys:[...cache.keys()]};
}
