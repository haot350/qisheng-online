import * as THREE from 'three';
import {MapDecodeQueue} from './map-decode.ts';
import {withDeadline} from './network.ts';

export type MapRenderContext={renderer:THREE.WebGLRenderer;camera:THREE.PerspectiveCamera};
const cancelled=()=>new DOMException('Cancelled','AbortError');
const yieldTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

/** Three's compileAsync owns an uncancellable polling timer. Use the same public
 * compile entry point, but own the readiness polling so abort can safely release
 * materials without a later timer dereferencing their disposed renderer state. */
export async function compileMapShaders(renderer:THREE.WebGLRenderer,root:THREE.Object3D,camera:THREE.PerspectiveCamera,scene:THREE.Scene,signal:AbortSignal){
 const timeout=new AbortController(),abort=()=>timeout.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const work=new Promise<void>((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>|undefined,done=false;
  const finish=(error?:Error)=>{if(done)return;done=true;if(timer!==undefined)clearTimeout(timer);timeout.signal.removeEventListener('abort',cancel);if(error)reject(error);else resolve();};
  const cancel=()=>finish(cancelled());timeout.signal.addEventListener('abort',cancel,{once:true});if(timeout.signal.aborted){cancel();return;}
  try{
   const gl=renderer.getContext(),extension=gl.getExtension('KHR_parallel_shader_compile'),materials=renderer.compile(root,camera,scene);
   const poll=()=>{
    if(timeout.signal.aborted){cancel();return;}
    try{
     if(gl.isContextLost())throw new Error('图形资源尚未恢复，请重新载入校园。');
     for(const material of materials){
      const properties=renderer.properties.get(material) as {currentProgram?:{program?:WebGLProgram}};
      const program=properties.currentProgram?.program;if(!program)throw new Error('校园画面准备失败，请重试。');
      if(extension&&!gl.getProgramParameter(program,extension.COMPLETION_STATUS_KHR)){timer=setTimeout(poll,10);return;}
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('校园画面准备失败，请重试。');
     }
     finish();
    }catch(error){finish(error as Error);}
   };
   timer=setTimeout(poll,extension?0:10);
  }catch(error){finish(error as Error);}
 });
 try{await withDeadline(work,30000,{signal,onTimeout:()=>timeout.abort()});}
 finally{signal.removeEventListener('abort',abort);timeout.abort();}
}

/** Upload only owned map resources, in bounded batches, without drawing a partial campus. */
export class MapScenePreparer{
 private queue=new MapDecodeQueue();
 private textureReady=new WeakSet<THREE.Texture>();
 private lifetime=new AbortController();
 private alive=true;
 private stats={chunks:0,meshes:0,textures:0,assemblyMs:0,compileMs:0,uploadMs:0};
 constructor(private scene:THREE.Scene,private context?:MapRenderContext){}
 prepare(root:THREE.Group,signal:AbortSignal,priority=3){
  const combined=new AbortController(),abort=()=>combined.abort(),caller=signal;caller.addEventListener('abort',abort,{once:true});this.lifetime.signal.addEventListener('abort',abort,{once:true});if(caller.aborted||this.lifetime.signal.aborted)abort();signal=combined.signal;
  return this.queue.run(async()=>{
   const valid=()=>{if(!this.alive||signal.aborted)throw cancelled();};
   valid();const meshes:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
   let started=performance.now();
   for(let i=0;i<meshes.length;i++){
    valid();const mesh=meshes[i];mesh.receiveShadow=true;mesh.frustumCulled=true;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    for(const material of materials)if(material instanceof THREE.MeshStandardMaterial){
     material.envMapIntensity=.65;if(material.transparent&&material.opacity>.95){material.transparent=false;material.depthWrite=true;}
    }
    mesh.userData.campusShadowCaster=materials.every(m=>!m.transparent&&!/(glass|leaf|leaves|grass|floor|road|ground|玻璃|叶片|灌木|草地|地坪|地面|道路|沥青|跑道|标线|铺装|步道|石板|细缝)/i.test(m.name+' '+mesh.name));
    mesh.castShadow=!!mesh.userData.campusShadowCaster;
    if((i+1)%32===0){this.stats.assemblyMs+=performance.now()-started;await yieldTask();started=performance.now();}
   }
   this.stats.assemblyMs+=performance.now()-started;
   if(this.context){
    const {renderer,camera}=this.context;
    if(renderer.getContext().isContextLost())throw new Error('图形资源尚未恢复，请重新载入校园。');
    const textures=new Set<THREE.Texture>();
    for(const mesh of meshes)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])for(const value of Object.values(m))if(value instanceof THREE.Texture&&!this.textureReady.has(value))textures.add(value);
    for(const texture of textures){valid();started=performance.now();renderer.initTexture(texture);this.textureReady.add(texture);this.stats.textures++;this.stats.uploadMs+=performance.now()-started;await yieldTask();}
    valid();started=performance.now();try{await compileMapShaders(renderer,root,camera,this.scene,signal);}catch(error){valid();throw error;}this.stats.compileMs+=performance.now()-started;valid();
    const target=new THREE.WebGLRenderTarget(2,2),warm=new THREE.Scene();
    warm.environment=this.scene.environment;warm.fog=this.scene.fog;
    this.scene.traverse(o=>{if(o instanceof THREE.Light){const light=o.clone();light.position.copy(o.getWorldPosition(new THREE.Vector3()));warm.add(light);}});
    root.updateMatrixWorld(true);
    try{
     for(let offset=0;offset<meshes.length;offset+=24){
      valid();const batch=meshes.slice(offset,offset+24).map(mesh=>{
       const proxy=new THREE.Mesh(mesh.geometry,mesh.material);proxy.matrixAutoUpdate=false;proxy.matrix.copy(mesh.matrixWorld);proxy.frustumCulled=false;proxy.receiveShadow=mesh.receiveShadow;warm.add(proxy);return proxy;
      });
      // State changes are synchronous and fully restored before yielding to RAF.
      const oldTarget=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear,shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
      started=performance.now();
      try{renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.autoClear=true;renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setViewport(0,0,2,2);renderer.render(warm,camera);}
      finally{renderer.setRenderTarget(oldTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;for(const mesh of batch)warm.remove(mesh);}
      this.stats.uploadMs+=performance.now()-started;await yieldTask();
     }
    }finally{target.dispose();}
   }
   // Map nodes are immutable. Compute their final world matrices once instead of
   // recomposing several thousand transforms on every rendered frame.
   root.updateMatrixWorld(true);root.traverse(node=>{node.matrixAutoUpdate=false;node.matrixWorldAutoUpdate=false;});
   valid();this.stats.chunks++;this.stats.meshes+=meshes.length;
  },signal,priority).finally(()=>{caller.removeEventListener('abort',abort);this.lifetime.signal.removeEventListener('abort',abort);});
 }
 diagnostics(){return {...this.stats};}
 dispose(){this.alive=false;this.lifetime.abort();}
}
