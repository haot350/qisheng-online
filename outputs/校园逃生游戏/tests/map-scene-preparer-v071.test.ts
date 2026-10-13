import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MapScenePreparer} from '../src/map-scene-preparer.ts';
import {SceneResources} from '../src/resources.ts';
const flush=()=>new Promise<void>(resolve=>setTimeout(resolve,5));

function fixture(){
 const calls:string[]=[],scene=new THREE.Scene(),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(),texture=new THREE.Texture({width:4,height:4});
 const material=new THREE.MeshStandardMaterial({map:texture});const geometry=new THREE.BoxGeometry();root.add(new THREE.Mesh(geometry,material));
 let compiled=false,polls=0,target:THREE.WebGLRenderTarget|null=null,viewport=new THREE.Vector4(0,0,800,600),scissor=new THREE.Vector4(0,0,800,600),scissorTest=true;
 const renderer={shadowMap:{autoUpdate:true,needsUpdate:true},autoClear:false,
  getContext:()=>({isContextLost:()=>false,getExtension:()=>({COMPLETION_STATUS_KHR:0x91b1}),getProgramParameter:()=>{polls++;return compiled;}}),initTexture:()=>calls.push('texture'),
  compile:()=>{calls.push('compile');return new Set([material]);},properties:{get:()=>({currentProgram:{program:{}}})},
  getRenderTarget:()=>target,setRenderTarget:(t:THREE.WebGLRenderTarget|null)=>{target=t;},
  getViewport:(v:THREE.Vector4)=>v.copy(viewport),setViewport:(v:THREE.Vector4|number,y?:number,w?:number,h?:number)=>{viewport=typeof v==='number'?new THREE.Vector4(v,y,w,h):v.clone();},
  getScissor:(v:THREE.Vector4)=>v.copy(scissor),setScissor:(v:THREE.Vector4)=>{scissor=v.clone();},
  getScissorTest:()=>scissorTest,setScissorTest:(v:boolean)=>{scissorTest=v;},render:()=>calls.push('offscreen'),
 };
 return {calls,scene,root,camera,texture,material,geometry,renderer,finish:()=>compiled=true,polls:()=>polls,state:()=>({target,viewport,scissor,scissorTest})};
}

test('map readiness waits for texture, completed shader compile and offscreen geometry upload, restoring renderer state',async()=>{
 const f=fixture(),preparer=new MapScenePreparer(f.scene,{renderer:f.renderer as unknown as THREE.WebGLRenderer,camera:f.camera});
 let ready=false;const work=preparer.prepare(f.root,new AbortController().signal).then(()=>ready=true);
 for(let i=0;i<20&&!f.calls.includes('compile');i++)await flush();
 assert.deepEqual(f.calls,['texture','compile']);assert.equal(ready,false);f.finish();await work;
 assert.deepEqual(f.calls,['texture','compile','offscreen']);assert.equal(ready,true);
 f.root.traverse(node=>{assert.equal(node.matrixAutoUpdate,false);assert.equal(node.matrixWorldAutoUpdate,false);});
 assert.equal(f.state().target,null);assert.deepEqual(f.state().viewport.toArray(),[0,0,800,600]);assert.equal(f.state().scissorTest,true);assert.equal(f.renderer.autoClear,false);assert.equal(f.renderer.shadowMap.autoUpdate,true);assert.equal(f.renderer.shadowMap.needsUpdate,true);
 assert.equal(preparer.diagnostics().chunks,1);assert.equal(preparer.diagnostics().textures,1);preparer.dispose();f.geometry.dispose();f.material.dispose();f.texture.dispose();
});

test('cancelling never-completing shader preparation promptly releases polling and cannot advertise readiness',async()=>{
 const f=fixture(),preparer=new MapScenePreparer(f.scene,{renderer:f.renderer as unknown as THREE.WebGLRenderer,camera:f.camera}),ctl=new AbortController();
 const work=preparer.prepare(f.root,ctl.signal);for(let i=0;i<20&&!f.calls.includes('compile');i++)await flush();
 ctl.abort();await assert.rejects(work,{name:'AbortError'});const polls=f.polls();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(f.polls(),polls,'cancel removes the GPU polling timer');assert.equal(f.calls.includes('offscreen'),false);assert.equal(preparer.diagnostics().chunks,0);preparer.dispose();f.geometry.dispose();f.material.dispose();f.texture.dispose();
});

test('world disposal cancels an active compile and queued chunks without more GPU work',async()=>{
 const f=fixture(),preparer=new MapScenePreparer(f.scene,{renderer:f.renderer as unknown as THREE.WebGLRenderer,camera:f.camera}),signal=new AbortController().signal;
 const active=preparer.prepare(f.root,signal);for(let i=0;i<20&&!f.calls.includes('compile');i++)await flush();
 const queued=preparer.prepare(new THREE.Group(),signal),checks=Promise.all([assert.rejects(active,{name:'AbortError'}),assert.rejects(queued,{name:'AbortError'})]);preparer.dispose();await checks;const calls=[...f.calls],polls=f.polls();await new Promise(resolve=>setTimeout(resolve,30));assert.deepEqual(f.calls,calls);assert.equal(f.polls(),polls);assert.equal(preparer.diagnostics().chunks,0);f.geometry.dispose();f.material.dispose();f.texture.dispose();
});

test('shader preparation rejects context loss before any scene upload',async()=>{
 const f=fixture(),gl=f.renderer.getContext();let lost=false;f.renderer.getContext=()=>({...gl,isContextLost:()=>lost});
 const preparer=new MapScenePreparer(f.scene,{renderer:f.renderer as unknown as THREE.WebGLRenderer,camera:f.camera}),work=preparer.prepare(f.root,new AbortController().signal);
 for(let i=0;i<20&&!f.calls.includes('compile');i++)await flush();lost=true;await assert.rejects(work,/图形资源/);assert.equal(f.calls.includes('offscreen'),false);assert.equal(preparer.diagnostics().chunks,0);preparer.dispose();f.geometry.dispose();f.material.dispose();f.texture.dispose();
});

test('without parallel shader extension, link readiness still precedes offscreen upload',async()=>{
 const f=fixture(),gl=f.renderer.getContext();f.renderer.getContext=()=>({...gl,getExtension:()=>null} as unknown as typeof gl);f.finish();
 const preparer=new MapScenePreparer(f.scene,{renderer:f.renderer as unknown as THREE.WebGLRenderer,camera:f.camera});await preparer.prepare(f.root,new AbortController().signal);
 assert.deepEqual(f.calls,['texture','compile','offscreen']);assert.ok(f.polls()>0);assert.equal(preparer.diagnostics().chunks,1);preparer.dispose();f.geometry.dispose();f.material.dispose();f.texture.dispose();
});

test('resource diagnostics count shared geometry once and release returns ownership to zero',()=>{
 const refs=new SceneResources(),geometry=new THREE.BoxGeometry(),texture=new THREE.Texture({width:16,height:16}),material=new THREE.MeshStandardMaterial({map:texture}),a=new THREE.Group(),b=new THREE.Group();
 a.add(new THREE.Mesh(geometry,material));b.add(new THREE.Mesh(geometry,material));refs.retain(a);refs.retain(b);
 const report=refs.diagnostics();assert.equal(report.scenes,2);assert.equal(report.geometries,1);assert.equal(report.materials,1);assert.equal(report.textures,1);assert.ok(report.geometryBytes>0);
 refs.release(a);assert.equal(refs.diagnostics().geometries,1);refs.release(b);assert.deepEqual(refs.diagnostics(),{scenes:0,geometries:0,materials:0,textures:0,geometryBytes:0,textureBytesEstimate:0});
});
