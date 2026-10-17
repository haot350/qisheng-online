import * as THREE from 'three';
import {compileMapShaders} from '../map-scene-preparer';

/** Warm actual skinned/material variants on this renderer, before control is
 * handed over. Sources and their material leases must outlive this preparer. */
export class CombatGpuPreparer {
 private textures=new WeakSet<THREE.Texture>();
 private warm=new THREE.Scene();
 readonly stats={objects:0,textures:0,compileMs:0,uploadMs:0,drawMs:0};
 constructor(private renderer:THREE.WebGLRenderer,private scene:THREE.Scene,private camera:THREE.PerspectiveCamera){
  this.warm.environment=scene.environment;this.warm.environmentIntensity=scene.environmentIntensity;this.warm.fog=scene.fog;
  scene.traverse(object=>{if(object instanceof THREE.Light){const light=object.clone();light.position.copy(object.getWorldPosition(new THREE.Vector3()));this.warm.add(light);}});
 }
 async prepareTextures(textures:Iterable<THREE.Texture>,signal:AbortSignal){
  for(const texture of textures){if(signal.aborted)throw new DOMException('Cancelled','AbortError');if(this.textures.has(texture))continue;const at=performance.now();this.renderer.initTexture(texture);this.stats.uploadMs+=performance.now()-at;this.stats.textures++;this.textures.add(texture);await new Promise<void>(resolve=>setTimeout(resolve,0));}
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
 }
 async prepare(root:THREE.Object3D,signal:AbortSignal){
  const valid=()=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');};valid();
  const textures=new Set<THREE.Texture>(),culled=new Map<THREE.Mesh,boolean>(),visibility=new Map<THREE.Object3D,boolean>();
  root.traverse(object=>visibility.set(object,object.visible));
  root.traverse(object=>{const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;culled.set(mesh,mesh.frustumCulled);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])for(const value of Object.values(material))if(value instanceof THREE.Texture&&!this.textures.has(value))textures.add(value);});
  await this.prepareTextures(textures,signal);
  valid();const start=performance.now();await compileMapShaders(this.renderer,root,this.camera,this.scene,signal);this.stats.compileMs+=performance.now()-start;valid();
  const renderer=this.renderer,parent=root.parent,oldTarget=renderer.getRenderTarget(),oldFace=renderer.getActiveCubeFace(),oldMip=renderer.getActiveMipmapLevel(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
  const at=performance.now();
  // This entry-only draw happens behind the loading page. An ordinary render
  // target uses Linear/NoToneMapping, unlike the actual sRGB/ACES screen. Draw
  // one scissored screen pixel to exercise the real pipeline and hidden muzzle
  // or effect variants; never change the renderer's colour/tone settings.
  try{this.warm.add(root);visibility.forEach((_,object)=>object.visible=true);culled.forEach((_,mesh)=>mesh.frustumCulled=false);renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.autoClear=true;renderer.setRenderTarget(null);renderer.setScissorTest(true);renderer.setScissor(0,0,1,1);renderer.setViewport(0,0,2,2);renderer.render(this.warm,this.camera);}
  finally{root.removeFromParent();if(parent)parent.add(root);visibility.forEach((value,object)=>object.visible=value);culled.forEach((value,mesh)=>mesh.frustumCulled=value);renderer.setRenderTarget(oldTarget,oldFace,oldMip);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;}
  this.stats.drawMs+=performance.now()-at;this.stats.objects++;await new Promise<void>(resolve=>setTimeout(resolve,0));valid();
 }
 dispose(){this.warm.clear();}
}
