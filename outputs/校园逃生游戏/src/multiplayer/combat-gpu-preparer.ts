import * as THREE from 'three';
import {compileMapShaders} from '../map-scene-preparer';

/** Warm actual skinned/material variants on this renderer, before control is
 * handed over. Sources and their material leases must outlive this preparer. */
export class CombatGpuPreparer {
 private textures=new WeakSet<THREE.Texture>();
 private target=new THREE.WebGLRenderTarget(2,2);
 private warm=new THREE.Scene();
 readonly stats={objects:0,textures:0,compileMs:0,uploadMs:0};
 constructor(private renderer:THREE.WebGLRenderer,private scene:THREE.Scene,private camera:THREE.PerspectiveCamera){
  this.warm.environment=scene.environment;this.warm.fog=scene.fog;
  scene.traverse(object=>{if(object instanceof THREE.Light){const light=object.clone();light.position.copy(object.getWorldPosition(new THREE.Vector3()));this.warm.add(light);}});
 }
 async prepare(root:THREE.Group,signal:AbortSignal){
  const valid=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};valid();
  const textures=new Set<THREE.Texture>(),culled=new Map<THREE.Mesh,boolean>();
  root.traverse(object=>{const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;culled.set(mesh,mesh.frustumCulled);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])for(const value of Object.values(material))if(value instanceof THREE.Texture&&!this.textures.has(value))textures.add(value);});
  for(const texture of textures){valid();const at=performance.now();this.renderer.initTexture(texture);this.stats.uploadMs+=performance.now()-at;this.stats.textures++;this.textures.add(texture);await new Promise<void>(resolve=>setTimeout(resolve,0));}
  valid();const start=performance.now();await compileMapShaders(this.renderer,root,this.camera,this.scene,signal);this.stats.compileMs+=performance.now()-start;valid();
  const renderer=this.renderer,parent=root.parent,visible=root.visible,oldTarget=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
  const at=performance.now();
  try{this.warm.add(root);root.visible=true;culled.forEach((_,mesh)=>mesh.frustumCulled=false);renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.autoClear=true;renderer.setRenderTarget(this.target);renderer.setScissorTest(false);renderer.setViewport(0,0,2,2);renderer.render(this.warm,this.camera);}
  finally{root.removeFromParent();if(parent)parent.add(root);root.visible=visible;culled.forEach((value,mesh)=>mesh.frustumCulled=value);renderer.setRenderTarget(oldTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;}
  this.stats.uploadMs+=performance.now()-at;this.stats.objects++;await new Promise<void>(resolve=>setTimeout(resolve,0));valid();
 }
 dispose(){this.target.dispose();this.warm.clear();}
}
