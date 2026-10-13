import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PhotoSystem} from '../src/photography/PhotoSystem.ts';

test('photography view readiness only gates capture, deduplicates publication and never pauses observation',async()=>{
 let changes=0,retries=0;const photo=new PhotoSystem({} as THREE.WebGLRenderer,new THREE.Scene(),{mobile:false,onChange:()=>changes++,onRetryView:()=>retries++}),camera=new THREE.PerspectiveCamera(60,16/9,.075,360);
 try{
  photo.open(camera);const opened=changes;photo.setViewStatus({ready:false,failed:false,progress:.25});assert.equal(changes,opened+1);photo.setViewStatus({ready:false,failed:false,progress:.25});assert.equal(changes,opened+1,'stable readiness does not produce another engine snapshot');
  assert.equal(photo.snapshot().state,'viewfinder');await assert.rejects(photo.capture(),/准备取景/);const beforePrepare=changes;camera.position.set(8,2,-5);photo.prepareView(camera);assert.deepEqual(photo.camera.position.toArray(),[8,2,-5]);assert.equal(changes,beforePrepare,'preparation does not publish inside the frame pipeline');
  photo.setViewStatus({ready:false,failed:true,progress:.25});await assert.rejects(photo.capture(),/重试/);photo.retryView();assert.equal(retries,1);photo.setViewStatus({ready:true,failed:false,progress:1});const shot=photo.capture();assert.equal(photo.snapshot().state,'viewfinder');assert.equal(photo.snapshot().shutterPending,true);photo.cancel();assert.equal(await shot,null);
 }finally{photo.dispose();}
});

test('opening and reopening a viewfinder never inherit a previous camera view readiness',async()=>{
 const photo=new PhotoSystem({} as THREE.WebGLRenderer,new THREE.Scene(),{mobile:false}),camera=new THREE.PerspectiveCamera();
 try{photo.open(camera);assert.equal(photo.snapshot().viewReady,false);await assert.rejects(photo.capture(),/准备取景/);photo.setViewStatus({ready:true,failed:false,progress:1});photo.close();camera.rotation.y=1;photo.open(camera);assert.equal(photo.snapshot().viewReady,false);assert.equal(photo.snapshot().viewProgress,0);await assert.rejects(photo.capture(),/准备取景/);}finally{photo.dispose();}
});

test('a newly missing view cancels an incomplete exposure without turning it into a game pause',async()=>{
 const photo=new PhotoSystem({} as THREE.WebGLRenderer,new THREE.Scene(),{mobile:false}),camera=new THREE.PerspectiveCamera(60,1.5,.075,360);
 try{
  photo.open(camera);photo.setViewStatus({ready:true,failed:false,progress:1});photo.configure({interface:'professional',mode:'M',shutter:2});const shot=photo.capture();camera.position.set(9,2,4);photo.prepareView(camera);assert.deepEqual(photo.camera.position.toArray(),[0,0,0],'long exposure stays at its tripod pose');photo.setViewStatus({ready:false,failed:false,progress:.8});assert.equal(await shot,null);assert.equal(photo.snapshot().state,'viewfinder');photo.prepareView(camera);assert.deepEqual(photo.camera.position.toArray(),[9,2,4],'observation remains available after cancelling');
 }finally{photo.dispose();}
});

test('critical streaming renders the last photography target without advancing exposure or the camera',()=>{
 const viewport=new THREE.Vector4(0,0,1000,600),scissor=viewport.clone(),color=new THREE.Color(0x335566),drawn:number[][]=[];let target:THREE.WebGLRenderTarget|null=null,scissorTest=true,alpha=.5;
 const renderer={domElement:{width:1000,height:600},getPixelRatio:()=>1,getRenderTarget:()=>target,setRenderTarget:(value:THREE.WebGLRenderTarget|null)=>{target=value;},getViewport:(value:THREE.Vector4)=>value.copy(viewport),setViewport:(x:number|THREE.Vector4,y?:number,w?:number,h?:number)=>{if(x instanceof THREE.Vector4)viewport.copy(x);else viewport.set(x,y!,w!,h!);},getScissor:(value:THREE.Vector4)=>value.copy(scissor),setScissor:(value:THREE.Vector4)=>scissor.copy(value),getScissorTest:()=>scissorTest,setScissorTest:(value:boolean)=>{scissorTest=value;},getClearColor:(value:THREE.Color)=>value.copy(color),getClearAlpha:()=>alpha,setClearColor:(value:THREE.Color|number,a:number)=>{color.set(value);alpha=a;},clear:()=>{},render:()=>drawn.push(viewport.toArray())} as unknown as THREE.WebGLRenderer;
 const photo=new PhotoSystem(renderer,new THREE.Scene(),{mobile:false}),camera=new THREE.PerspectiveCamera(60,1.5,.075,360);
 try{
  photo.open(camera);assert.equal(photo.renderFrozen(),false,'no fabricated last frame exists before a render');const internal=photo as unknown as {output:THREE.WebGLRenderTarget;outputReady:boolean};internal.output=new THREE.WebGLRenderTarget(1200,800);internal.outputReady=true;photo.pause();const snapshot=photo.snapshot(),pose=photo.camera.position.toArray();assert.equal(photo.renderFrozen(),true);assert.deepEqual(drawn,[[50,0,900,600]]);assert.deepEqual(photo.camera.position.toArray(),pose);assert.equal(photo.snapshot().state,snapshot.state);assert.equal(photo.snapshot().remaining,snapshot.remaining);assert.deepEqual(viewport.toArray(),[0,0,1000,600]);assert.equal(scissorTest,true);assert.equal(alpha,.5);assert.equal(target,null);
 }finally{photo.dispose();}
});
