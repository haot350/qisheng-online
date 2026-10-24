import {DRIVING_VEHICLES} from '@qisheng/shared/ranking';
import * as THREE from 'three';

export const CANNON=Object.freeze({ammo:DRIVING_VEHICLES.tank.cannonAmmo,cooldown:DRIVING_VEHICLES.tank.cannonCooldown,radius:DRIVING_VEHICLES.tank.cannonRadius,speed:65,gravity:9.8,lifetime:6});
type Shell={id:number;point:THREE.Vector3;velocity:THREE.Vector3;age:number;active:boolean;mesh:THREE.Mesh};
type Flash={mesh:THREE.Mesh;left:number};
/** Finite, preallocated projectiles. The owner supplies authoritative local world queries. */
export class DrivingCannon {
 readonly root=new THREE.Group();ammo:number=CANNON.ammo;cooldown=0;private serial=0;
 private shells:Shell[]=[];private flashes:Flash[]=[];
 constructor(){
  const shellGeometry=new THREE.SphereGeometry(.085,8,6),shellMaterial=new THREE.MeshBasicMaterial({color:0xffe4a0});
  const flashGeometry=new THREE.IcosahedronGeometry(1,1);
  for(let i=0;i<3;i++){const mesh=new THREE.Mesh(shellGeometry,shellMaterial);mesh.visible=false;this.root.add(mesh);this.shells.push({id:0,point:new THREE.Vector3(),velocity:new THREE.Vector3(),age:0,active:false,mesh});}
  for(let i=0;i<3;i++){const mesh=new THREE.Mesh(flashGeometry,new THREE.MeshBasicMaterial({color:0xe8a459,transparent:true,opacity:.7,depthWrite:false}));mesh.visible=false;this.root.add(mesh);this.flashes.push({mesh,left:0});}
  this.root.name='tank-projectiles';
 }
 fire(origin:THREE.Vector3,direction:THREE.Vector3){
  if(this.ammo<=0||this.cooldown>1e-7||!origin.toArray().every(Number.isFinite)||!direction.toArray().every(Number.isFinite)||direction.lengthSq()<.9)return null;
  const shell=this.shells.find(s=>!s.active);if(!shell)return null;
  shell.id=++this.serial;shell.point.copy(origin);shell.velocity.copy(direction).normalize().multiplyScalar(CANNON.speed);shell.age=0;shell.active=true;shell.mesh.position.copy(origin);shell.mesh.visible=true;this.ammo--;this.cooldown=CANNON.cooldown;return shell.id;
 }
 tick(dt:number,query:(origin:THREE.Vector3,direction:THREE.Vector3,length:number)=>{distance:number;normal:THREE.Vector3}|null,explode:(id:number,point:THREE.Vector3)=>void){
  if(!Number.isFinite(dt)||dt<=0)return;this.cooldown=Math.max(0,this.cooldown-dt);
  for(const s of this.shells){if(!s.active)continue;s.age+=dt;s.velocity.y-=CANNON.gravity*dt;const delta=s.velocity.clone().multiplyScalar(dt),length=delta.length(),dir=delta.clone().normalize(),hit=query(s.point,dir,length);
   if(hit!==null&&hit.distance>=0&&hit.distance<=length){s.point.addScaledVector(dir,hit.distance).addScaledVector(hit.normal,.08);s.active=false;s.mesh.visible=false;this.flash(s.point);explode(s.id,s.point.clone());}
   else if(s.age>=CANNON.lifetime){s.active=false;s.mesh.visible=false;}
   else{s.point.add(delta);s.mesh.position.copy(s.point);}
  }
  for(const f of this.flashes){if(f.left<=0)continue;f.left=Math.max(0,f.left-dt);f.mesh.visible=f.left>0;f.mesh.scale.setScalar((1-f.left/.35)*CANNON.radius+.2);(f.mesh.material as THREE.MeshBasicMaterial).opacity=f.left/.35*.65;}
 }
 private flash(point:THREE.Vector3){const f=this.flashes.find(f=>f.left<=0)??this.flashes[0];f.left=.35;f.mesh.position.copy(point);f.mesh.visible=true;f.mesh.scale.setScalar(.2);}
 dispose(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);materials.add(o.material as THREE.Material);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.removeFromParent();this.root.clear();}
}
