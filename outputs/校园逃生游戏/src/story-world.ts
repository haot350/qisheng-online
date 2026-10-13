import {staticAssetUrl} from './static-assets.ts';
import * as THREE from 'three';
import type {StorySnapshot,StoryVec3} from './story/types';
import {STORY_STAGE} from './story/content';
import type {GameWorld} from './world';
import {withDeadline} from './network';
import {ResourceLeases,resourceWorkQueue,fetchResource,decodeResourceImage,abortResource,waitForResource} from './resource-leases.ts';
import {StoryCompanionAvoidance} from './story-companion-avoidance';

type ActorRig={mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>;textures:THREE.Texture[];poses:Record<string,THREE.Texture>;position:THREE.Vector3;heading:number;clock:number;pose:string;path:THREE.Vector3[];routeClock:number;target:THREE.Vector3;avoidance:StoryCompanionAvoidance};
const storyPictures=new ResourceLeases<THREE.Texture>((url,signal)=>resourceWorkQueue.run(signal,async()=>{
 const bytes=await withDeadline(fetchResource(url,signal),20000,{signal}),image=await withDeadline(decodeResourceImage(bytes,signal),20000,{signal});abortResource(signal);const texture=new THREE.Texture(image);texture.needsUpdate=true;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}),texture=>texture.dispose());
export async function createStoryWorld(scene:THREE.Scene,world:GameWorld,sourceSignal:AbortSignal){
 const controller=new AbortController(),signal=controller.signal,abort=()=>controller.abort();sourceSignal.addEventListener('abort',abort,{once:true});if(sourceSignal.aborted)controller.abort();
 const root=new THREE.Group();root.name='Story_present_friends_and_projector';scene.add(root);
 const pictureReleases:(()=>void)[]=[],geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 const actors=new Map<string,ActorRig>();let disposed=false,lastStep='';
 const load=async(url:string)=>{abortResource(signal);const lease=storyPictures.acquire(staticAssetUrl(url));pictureReleases.push(lease.release);const texture=await waitForResource(lease.value,signal);if(disposed)throw new DOMException('Cancelled','AbortError');return texture;};
 const mesh=<G extends THREE.BufferGeometry,M extends THREE.Material>(geo:G,mat:M,p:StoryVec3,parent:THREE.Group=root)=>{geometries.add(geo);materials.add(mat);const m=new THREE.Mesh<G,M>(geo,mat);m.position.fromArray(p);parent.add(m);return m;};
 const groundedGroup=(name:string,foot:StoryVec3)=>{const g=new THREE.Group();g.name=name;const support=world.supportAt(new THREE.Vector3(...foot),1.75);g.position.set(foot[0],support?.height??foot[1],foot[2]);root.add(g);return g;};
 const metal=new THREE.MeshStandardMaterial({color:0x667075,metalness:.6,roughness:.48});
 const screenGroup=groundedGroup('Story_physical_projection_screen',[STORY_STAGE.screen[0],STORY_STAGE.screen[1]-1.58,STORY_STAGE.screen[2]]);
 const screen=mesh(new THREE.PlaneGeometry(2.8,1.575),new THREE.MeshBasicMaterial({color:0xe8e5d9,side:THREE.DoubleSide}),[0,1.58,0],screenGroup);screen.rotation.y=Math.PI;
 for(const x of[-1.48,1.48]){
  mesh(new THREE.CylinderGeometry(.019,.023,2.45,8),metal,[x,1.225,0],screenGroup);
  mesh(new THREE.BoxGeometry(.045,.038,.62),metal,[x,.022,0],screenGroup);
 }
 for(const y of[.758,2.402])mesh(new THREE.BoxGeometry(3,.035,.055),metal,[0,y,0],screenGroup);
 const projection=mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}),[0,1.58,-.006],screenGroup);projection.rotation.y=Math.PI;
 const projectorGroup=groundedGroup('Story_physical_projector_tripod',[STORY_STAGE.projector[0],STORY_STAGE.projector[1]-.84,STORY_STAGE.projector[2]]);
 mesh(new THREE.BoxGeometry(.38,.13,.25),new THREE.MeshStandardMaterial({color:0x333b40,roughness:.72}),[0,.84,0],projectorGroup);
 const lens=mesh(new THREE.CylinderGeometry(.038,.038,.06,12),new THREE.MeshStandardMaterial({color:0x9ddfea,metalness:.5,emissive:0x355c7d}),[0,.85,.15],projectorGroup);lens.rotation.x=Math.PI/2;
 mesh(new THREE.CylinderGeometry(.025,.028,.68,8),metal,[0,.41,0],projectorGroup);
 for(let i=0;i<3;i++){
  const angle=i*Math.PI*2/3,foot=new THREE.Vector3(Math.cos(angle)*.32,.022,Math.sin(angle)*.32),head=new THREE.Vector3(0,.66,0),direction=head.clone().sub(foot);
  const leg=mesh(new THREE.CylinderGeometry(.012,.016,direction.length(),8),metal,foot.clone().add(head).multiplyScalar(.5).toArray() as StoryVec3,projectorGroup);
  leg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
 }
 // Four actual side faces widen from the lens to the rectangular screen. There
 // are no unanchored photograph planes anywhere else in the school.
 root.updateMatrixWorld(true);
 const lensPoint=new THREE.Vector3(0,.85,.185).applyMatrix4(projectorGroup.matrixWorld),corners=[[-1.375,.82,-.012],[1.375,.82,-.012],[1.375,2.34,-.012],[-1.375,2.34,-.012]].map(p=>new THREE.Vector3(...p).applyMatrix4(screenGroup.matrixWorld));
 lens.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(0,1.58,0).applyMatrix4(screenGroup.matrixWorld).sub(lensPoint).normalize());
 const positions:number[]=[];for(let i=0;i<4;i++)positions.push(...lensPoint.toArray(),...corners[i].toArray(),...corners[(i+1)%4].toArray());
 const beamGeometry=new THREE.BufferGeometry();beamGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const beam=mesh(beamGeometry,new THREE.MeshBasicMaterial({color:0xd8d1ad,transparent:true,opacity:.018,depthWrite:false,side:THREE.DoubleSide}),[0,0,0]);
 const lamp=new THREE.PointLight(0xffedb8,0,4,2);lamp.position.copy(lensPoint);root.add(lamp);
 const archiveImages:THREE.Texture[]=[];
 try{
  await Promise.all(['lin-cen','zhou-xu'].map(async id=>{
   const poseNames=id==='lin-cen'?['strap','wave']:['shield','camera'];
   const [images,poseEntries]=await Promise.all([Promise.all(['front','side','back'].map(view=>load(`/story/characters/${id}-${view}.webp`))),Promise.all(poseNames.map(async p=>[p,await load(`/story/characters/${id}-${p}.webp`)]))]);
   const poses=Object.fromEntries(poseEntries),first=images[0].image as {width:number;height:number};
   const material=new THREE.MeshStandardMaterial({map:images[0],alphaTest:.48,side:THREE.DoubleSide,roughness:1,metalness:0});
   const m=mesh(new THREE.PlaneGeometry(1.74*first.width/first.height,1.74),material,[0,0,0]) as ActorRig['mesh'];m.castShadow=true;
   const start=STORY_STAGE.actors[id as keyof typeof STORY_STAGE.actors];
   actors.set(id,{mesh:m,textures:images,poses,position:new THREE.Vector3(...start),heading:Math.PI,clock:0,pose:'idle',path:[],routeClock:0,target:new THREE.Vector3(Infinity,Infinity,Infinity),avoidance:new StoryCompanionAvoidance()});
  }));
  try{
   const manifest=await fetch(staticAssetUrl('/story/archive/manifest.json'),{signal}).then(r=>{if(!r.ok)throw Error('档案尚未准备好');return r.json();});
   // The five optional discoveries are revealed only after the player's shot.
   const picks=['img_3908'].map(id=>manifest.photos.find((p:{id:string})=>p.id===id)).filter(Boolean);
   for(const p of picks)archiveImages.push(await load(p.thumbnail));
  }catch(e){if(signal.aborted)throw e;}
 }catch(e){dispose();throw e;}
 function pose(s:StorySnapshot,dt:number,player?:THREE.Vector3){
  if(disposed)return;
  for(const a of s.actors){
   const rig=actors.get(a.id);if(!rig)continue;
   const start=new THREE.Vector3(...a.position),destination=new THREE.Vector3(...a.destination),stepChanged=lastStep!==s.step,targetChanged=rig.target.distanceTo(destination)>.2;
   let resynced=false;
   if(stepChanged&&!rig.clock||rig.position.distanceTo(start)>3){rig.position.copy(start);resynced=true;}
   if(stepChanged||targetChanged||resynced){rig.avoidance.reset();rig.path=[];rig.routeClock=0;}
   const remaining=destination.clone().sub(rig.position);let desired=new THREE.Vector3();rig.routeClock-=dt;
   if(a.visible&&!a.holding&&remaining.length()>.12){
    if(rig.routeClock<=0||targetChanged){rig.path=world.storyPath(rig.position,destination);rig.target.copy(destination);rig.routeClock=.4;}
    while(rig.path.length&&rig.path[0].clone().sub(rig.position).setY(0).length()<.23)rig.path.shift();
    const others=s.actors.filter(other=>other.id!==a.id&&other.visible).map(other=>actors.get(other.id)?.position).filter((p):p is THREE.Vector3=>!!p);
    const next=rig.avoidance.waypoint(world,rig.position,destination,rig.path[0],player,others);
    if(next){desired.copy(next).sub(rig.position);desired.y=0;const distance=desired.length();if(distance>0)desired.multiplyScalar(Math.min(distance,1.45*dt)/distance);if(desired.lengthSq()>.000001)rig.heading=Math.atan2(desired.x,desired.z);}
   }else rig.avoidance.reset();
   const before=rig.position.clone(),moved=world.moveActor(100+(a.id==='lin-cen'?0:1),rig.position,desired,dt);
   rig.avoidance.observe(before,moved,desired,dt,player);rig.position.copy(moved);rig.clock+=dt;rig.pose=a.pose;
   if(a.id==='zhou-xu'&&s.cooperation&&!s.dialogue){const phase=s.cooperation.phase,ready=s.cooperation.gesture===3,raised=ready||(phase>=1&&phase<1.45)||(phase>=2&&phase<2.45);rig.pose=raised?'shield':'idle';}
   rig.mesh.position.copy(rig.position).add(new THREE.Vector3(0,.87+(desired.lengthSq()>0?Math.sin(rig.clock*9)*.009:Math.sin(rig.clock*1.8)*.003),0));rig.mesh.visible=a.visible;
  }lastStep=s.step;
 }
 function orient(camera:THREE.PerspectiveCamera,s:StorySnapshot){
  for(const[,rig]of actors){const angle=Math.atan2(camera.position.x-rig.position.x,camera.position.z-rig.position.z),relative=THREE.MathUtils.euclideanModulo(angle-rig.heading+Math.PI,Math.PI*2)-Math.PI,index=Math.abs(relative)<Math.PI/3?0:Math.abs(relative)>Math.PI*2/3?2:1,t=rig.poses[rig.pose]??rig.textures[index];
   if(rig.mesh.material.map!==t){rig.mesh.material.map=t;rig.mesh.material.needsUpdate=true;}const im=t.image as {width:number;height:number},base=rig.textures[0].image as {width:number;height:number};rig.mesh.scale.x=(im.width/im.height)/(base.width/base.height)*(relative<0&&index===1&&!rig.poses[rig.pose]?-1:1);rig.mesh.rotation.y=angle;
  }
  const packed=['walk-home','tomorrow','finished'].includes(s.step),show=!packed&&!s.presentOnly&&(s.introActive?s.introTime>=28&&s.introTime<61||s.introTime>=73:['borrow-camera','editing-place','editing-conversation','film-order','film-selection','screening','screening-end','pack-equipment'].includes(s.step));
  screenGroup.visible=!packed;projectorGroup.visible=!packed;
  if(archiveImages.length){const index=s.introActive&&s.introTime>=48&&s.introTime<61?Math.min(2,Math.floor((s.introTime-48)/4.4)):0,t=archiveImages[index%archiveImages.length],im=t.image as {width:number;height:number},ratio=im.width/im.height,width=Math.min(2.75,1.52*ratio),height=width/ratio;
   if(projection.material.map!==t){projection.material.map=t;projection.material.needsUpdate=true;}projection.scale.set(width,height,1);
  }
  projection.visible=show&&archiveImages.length>0;projection.material.opacity=projection.visible?.96:0;beam.visible=projection.visible;lamp.intensity=projection.visible?.45:0;
 }
 function dispose(){if(disposed)return;disposed=true;controller.abort();sourceSignal.removeEventListener('abort',abort);root.removeFromParent();pictureReleases.splice(0).forEach(drop=>drop());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());actors.forEach(rig=>rig.avoidance.reset());actors.clear();}
 return {root,update:pose,orient,blockedCompanions:()=>[...actors].filter(([,rig])=>rig.avoidance.needsSpace).map(([id])=>id),actorPositions:()=>[...actors].map(([id,r])=>({id:id as 'lin-cen'|'zhou-xu',position:r.position.toArray() as StoryVec3})),dispose};
}


