import * as THREE from 'three';
import type {GadgetLoot,GrenadeState,LootGadgetId} from '@qisheng/shared/gadgets';

/** Small shared procedural props: no per-kill geometry, textures, or material compilation. */
export class GadgetScene {
 readonly root=new THREE.Group();readonly prepareRoots:THREE.Object3D[]=[];
 private models=new Map<string,THREE.Group>();private grenades=new Map<string,THREE.Group>();
 private geometries=new Set<THREE.BufferGeometry>();private materials=new Set<THREE.Material>();
 private templates=new Map<LootGadgetId,THREE.Group>();private blasts:{mesh:THREE.Mesh;left:number}[]=[];
 constructor(scene:THREE.Scene){
  this.root.name='combat-gadgets';scene.add(this.root);
  const material=(color:number,metalness=.1)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness:.6});this.materials.add(m);return m;};
  const olive=material(0x687258),steel=material(0x333c3a,.55),paper=material(0xf2e8cf),red=material(0x9f342e),black=material(0x282c2d);
  const mesh=(geometry:THREE.BufferGeometry,mat:THREE.Material)=>{this.geometries.add(geometry);const m=new THREE.Mesh(geometry,mat);m.castShadow=true;m.receiveShadow=true;return m;};
  const helmet=new THREE.Group(),dome=mesh(new THREE.SphereGeometry(.24,14,8,0,Math.PI*2,0,Math.PI*.53),olive);helmet.add(dome);const rim=mesh(new THREE.TorusGeometry(.24,.025,5,16),steel);rim.rotation.x=Math.PI/2;helmet.add(rim);this.templates.set('helmet',helmet);
  const grenade=new THREE.Group(),body=mesh(new THREE.SphereGeometry(.13,10,8),olive);body.scale.y=1.3;grenade.add(body);const neck=mesh(new THREE.CylinderGeometry(.045,.045,.09,8),steel);neck.position.y=.18;grenade.add(neck);const pin=mesh(new THREE.TorusGeometry(.043,.009,4,10),steel);pin.position.set(.055,.22,0);grenade.add(pin);this.templates.set('grenade',grenade);
  const cards=new THREE.Group();for(let i=0;i<2;i++){const card=new THREE.Group(),face=mesh(new THREE.BoxGeometry(.19,.013,.28),paper),suit=mesh(new THREE.BoxGeometry(.045,.015,.045),i?red:black);suit.rotation.y=Math.PI/4;suit.position.set(-.04,.012,-.07);card.add(face,suit);card.position.set(i*.08,i*.018,0);card.rotation.y=i*.28;cards.add(card);}this.templates.set('cards',cards);
  for(const template of this.templates.values()){template.visible=false;this.root.add(template);this.prepareRoots.push(template);}
  const blastGeometry=new THREE.IcosahedronGeometry(1,1);this.geometries.add(blastGeometry);
  for(let i=0;i<4;i++){const mat=new THREE.MeshBasicMaterial({color:0xeab778,transparent:true,opacity:0,depthWrite:false});this.materials.add(mat);const blast=new THREE.Mesh(blastGeometry,mat);blast.visible=false;this.root.add(blast);this.blasts.push({mesh:blast,left:0});this.prepareRoots.push(blast);}
 }
 update(loot:readonly GadgetLoot[],projectiles:readonly GrenadeState[],viewerId:string,cooperative:boolean,time:number,dt=0){
  const ids=new Set<string>();for(const item of loot){ids.add(item.id);let model=this.models.get(item.id);if(!model){model=this.templates.get(item.kind)!.clone(true);this.root.add(model);this.models.set(item.id,model);}model.visible=cooperative?!item.usedBy.includes(viewerId):item.availableAt<=time;model.position.set(item.position[0],item.position[1]+.3,item.position[2]);}
  for(const [id,model] of this.models)if(!ids.has(id)){model.removeFromParent();this.models.delete(id);}
  const active=new Set<string>();for(const g of projectiles){active.add(g.id);let model=this.grenades.get(g.id);if(!model){model=this.templates.get('grenade')!.clone(true);this.root.add(model);this.grenades.set(g.id,model);}model.visible=true;model.position.set(...g.position);model.rotation.z=time*5;}
  for(const [id,model] of this.grenades)if(!active.has(id)){model.removeFromParent();this.grenades.delete(id);}
  for(const blast of this.blasts){blast.left=Math.max(0,blast.left-dt);blast.mesh.visible=blast.left>0;if(blast.left){const t=1-blast.left/.45;blast.mesh.scale.setScalar(.4+t*3.5);(blast.mesh.material as THREE.MeshBasicMaterial).opacity=(1-t)*.55;}}
 }
 explosion(position:readonly number[]){const blast=this.blasts.find(b=>b.left<=0)??this.blasts[0];blast.left=.45;blast.mesh.position.set(position[0],position[1],position[2]);}
 clear(){for(const model of [...this.models.values(),...this.grenades.values()])model.removeFromParent();this.models.clear();this.grenades.clear();for(const b of this.blasts){b.left=0;b.mesh.visible=false;}}
 dispose(){this.clear();this.root.removeFromParent();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();this.templates.clear();}
}
