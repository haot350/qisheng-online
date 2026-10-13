import * as THREE from 'three';
import {PhotoSystem,type PhotoOptions} from '../src/photography/PhotoSystem.ts';

/** CPU render adapter verifies state and uniforms; it does not claim GPU/pixel validation. */
export function photoFixture(options:Partial<PhotoOptions>={},scene=new THREE.Scene()){
 let target:THREE.WebGLRenderTarget|null=null,scissorTest=false,alpha=1;
 const viewport=new THREE.Vector4(0,0,960,640),scissor=viewport.clone(),color=new THREE.Color();
 const focusUniforms:number[]=[],scenePoses:number[][]=[];
 let exportRead:((pixels:Uint8Array)=>Promise<Uint8Array>)|undefined;
 const renderer={domElement:{width:960,height:640},toneMapping:THREE.ACESFilmicToneMapping,autoClear:true,info:{render:{calls:1,triangles:2}},getPixelRatio:()=>1,getRenderTarget:()=>target,setRenderTarget:(value:THREE.WebGLRenderTarget|null)=>{target=value;},getViewport:(value:THREE.Vector4)=>value.copy(viewport),setViewport:(x:number|THREE.Vector4,y?:number,w?:number,h?:number)=>{if(x instanceof THREE.Vector4)viewport.copy(x);else viewport.set(x,y!,w!,h!);},getScissor:(value:THREE.Vector4)=>value.copy(scissor),setScissor:(value:THREE.Vector4)=>scissor.copy(value),getScissorTest:()=>scissorTest,setScissorTest:(value:boolean)=>{scissorTest=value;},getClearColor:(value:THREE.Color)=>value.copy(color),getClearAlpha:()=>alpha,setClearColor:(value:THREE.Color|number,a:number)=>{color.set(value);alpha=a;},clear:()=>{},render:(renderScene:THREE.Scene,camera:THREE.Camera)=>{if(camera instanceof THREE.PerspectiveCamera)scenePoses.push(camera.position.toArray());else{const material=(renderScene.children[0] as THREE.Mesh)?.material as THREE.ShaderMaterial;if(material.uniforms.focusDistance)focusUniforms.push(material.uniforms.focusDistance.value);}},readRenderTargetPixelsAsync:(_target:THREE.WebGLRenderTarget,_x:number,_y:number,width:number,_height:number,pixels:Uint8Array)=>width>32&&exportRead?exportRead(pixels):Promise.resolve(pixels)} as unknown as THREE.WebGLRenderer;
 const photo=new PhotoSystem(renderer,scene,{mobile:true,...options}),camera=new THREE.PerspectiveCamera(53,1.5,.075,420);
 camera.updateMatrixWorld();photo.open(camera);photo.setViewStatus({ready:true,failed:false,progress:1});
 return{photo,camera,scene,focusUniforms,scenePoses,setExportRead:(read:(pixels:Uint8Array)=>Promise<Uint8Array>)=>{exportRead=read;},frame:(dt=1/60)=>photo.render(camera,dt),advance:(seconds:number)=>{const frames=Math.ceil(seconds*60);for(let i=0;i<frames;i++)photo.render(camera,1/60);},dispose:()=>{photo.dispose();scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});}};
}

export function focusWall(distance=5){const scene=new THREE.Scene(),wall=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshBasicMaterial());wall.position.z=-distance;scene.add(wall);return{scene,wall};}

/** Minimal encoding surface for lifecycle tests; browser encoders are tested separately. */
export async function withPhotoCanvas<T>(run:()=>Promise<T>){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData:()=>{}}),toBlob:(callback:(blob:Blob)=>void,type:string)=>callback(new Blob(['encoded-photo'],{type}))})}});
 try{return await run();}finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');}
}
