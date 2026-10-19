import * as THREE from 'three';

/** Exercise the actual screen colour/tone pipeline, behind the loading page.
 * Ordinary render targets select a different shader variant in WebGLRenderer.
 * Nothing asynchronous may run inside draw: every state is restored before RAF. */
export function warmScreenPixel(renderer:THREE.WebGLRenderer,draw:()=>void){
 const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
 const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4());
 const scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear;
 const shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
 try{
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.autoClear=true;
  renderer.setRenderTarget(null);renderer.setScissorTest(true);renderer.setScissor(0,0,1,1);renderer.setViewport(0,0,2,2);
  draw();
 }finally{
  renderer.setRenderTarget(target,face,mip);renderer.setViewport(viewport);renderer.setScissor(scissor);
  renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear;
  renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;
 }
}
