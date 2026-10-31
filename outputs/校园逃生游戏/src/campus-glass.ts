import * as THREE from 'three';
import {WEATHER_VISUALS} from '@qisheng/shared/weather';

export type GlassKind='clear'|'frosted';
export type GlassSettings={quality:'auto'|'smooth'|'high'|'ultra';mobile:boolean;low?:boolean;weather?:string;hour?:number};
const environments=new WeakMap<THREE.Scene,CampusGlassEnvironment>();
export function campusGlassKind(material:THREE.Material):GlassKind|null{
 const data=material.userData;
 if(data.qsOpaqueSafety===true||/^(?:WEB_safety|WEB_opaque_safety)$/.test(material.name))return null;
 if(data.qsGlassKind==='clear'||data.qsGlassKind==='frosted')return data.qsGlassKind;
 return material.name==='WEB_glass'?'clear':material.name==='WEB_frosted'?'frosted':null;
}
export function glassReflectionSize(s:GlassSettings):128|256{
 return s.quality==='high'||s.quality==='ultra'?256:s.quality==='smooth'||s.mobile||s.low?128:256;
}
export function ownsGlassEnvironment(texture:{userData:Record<string,unknown>}){return texture.userData.campusGlassEnvironment===true;}
export function prepareCampusGlass(scene:THREE.Scene,material:THREE.Material){environments.get(scene)?.apply(material);}

type GlassSource={color:[number,number,number];opacity:number;roughness:number;metalness:number};
/** Preserve the source values through material cloning and pool reuse. */
export function calibrateCampusGlass(material:THREE.MeshStandardMaterial,kind:GlassKind){
 let source=material.userData.qsCampusGlassSource as GlassSource|undefined;
 if(!source||!Array.isArray(source.color)||source.color.length!==3||![...source.color,source.opacity,source.roughness,source.metalness].every(Number.isFinite)){
  source={color:[material.color.r,material.color.g,material.color.b],opacity:material.opacity,roughness:material.roughness,metalness:material.metalness};
  material.userData.qsCampusGlassSource=source;
 }
 material.color.setRGB(...source.color).multiply(kind==='clear'?new THREE.Color(.76,.86,1):new THREE.Color(.83,.88,.94));
 material.opacity=Math.max(source.opacity,kind==='clear'?.66:.88);
 material.roughness=kind==='clear'?Math.max(.16,Math.min(.24,source.roughness)):Math.max(.54,source.roughness);
 material.metalness=kind==='clear'?Math.max(.2,Math.min(.3,source.metalness)):Math.min(.06,source.metalness);
}

/** Static sky and distant courtyard silhouettes, never live scene/entity data. */
export function reflectionPixels(size:128|256,weather:string,hour=12){
 const width=size*4,height=size*2,data=new Uint8Array(width*height*4);
 const preset=weather==='light-rain'||weather==='rain'?'light-rain':weather==='overcast'||weather==='mist'?'overcast':'clear';
 const hex=WEATHER_VISUALS[preset].sky,sky=[hex>>>16&255,hex>>>8&255,hex&255];
 const day=Math.max(.18,Math.min(1,Math.sin((hour-6)/12*Math.PI))),cloud=preset==='clear'?0:preset==='overcast'?.75:.95;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/width,v=y/(height-1),horizon=.5;
  const tree=.022+.026*Math.pow(Math.max(0,Math.sin(u*Math.PI*38+.4)),4);
  const building=u>.1&&u<.23||u>.5&&u<.62||u>.8&&u<.87;
  const skyline=horizon-(building?.065:tree),foreground=v>skyline;
  const row=(y*width+x)*4;
  for(let c=0;c<3;c++){
   const zenith=sky[c]*(.72+.28*v/horizon),base=foreground?(building?[85,94,98][c]:[69,85,77][c]):zenith;
   const overcast=foreground?[92,99,100][c]:[177,189,198][c];
   data[row+c]=Math.round(Math.min(255,Math.max(0,(base*(1-cloud*.38)+overcast*cloud*.38)*day)));
  }
  data[row+3]=255;
 }
 return{width,height,data};
}
function buildReflection(renderer:THREE.WebGLRenderer,pixels:ReturnType<typeof reflectionPixels>){
 const source=new THREE.DataTexture(pixels.data,pixels.width,pixels.height,THREE.RGBAFormat);
 source.colorSpace=THREE.SRGBColorSpace;source.mapping=THREE.EquirectangularReflectionMapping;source.needsUpdate=true;
 const pmrem=new THREE.PMREMGenerator(renderer);
 try{return pmrem.fromEquirectangular(source);}finally{source.dispose();pmrem.dispose();}
}

/** One PMREM per world/quality/weather, explicitly separate from weapon lighting. */
export class CampusGlassEnvironment{
 private target:THREE.WebGLRenderTarget|null=null;
 private key='';private disposed=false;
 private materials=new Map<THREE.MeshStandardMaterial,()=>void>();
 private settings:GlassSettings;
 constructor(private scene:THREE.Scene,private renderer:THREE.WebGLRenderer,settings:GlassSettings,private createReflection=buildReflection){
  this.settings=settings;environments.set(scene,this);this.set(settings);
 }
 set(settings:GlassSettings){
  if(this.disposed)return;this.settings={...settings};
  const size=glassReflectionSize(settings),weather=settings.weather??'clear',hour=Math.max(0,Math.min(24,Math.round((settings.hour??12)/2)*2));
  const key=size+':'+weather+':'+hour;if(key===this.key)return;
  const next=this.createReflection(this.renderer,reflectionPixels(size,weather,hour));
  next.texture.userData.campusGlassEnvironment=true;
  const previous=this.target;this.target=next;this.key=key;
  for(const material of this.materials.keys())this.apply(material);
  previous?.dispose();
 }
 apply(material:THREE.Material){
  if(this.disposed||!this.target||!(material instanceof THREE.MeshStandardMaterial))return;
  const kind=campusGlassKind(material);if(!kind)return;
  calibrateCampusGlass(material,kind);
  const previousSide=material.side;
  material.side=THREE.DoubleSide;
  if(material.transparent){material.forceSinglePass=true;material.depthWrite=false;}
  if(!this.materials.has(material)){
   const dispose=()=>{material.removeEventListener('dispose',dispose);this.materials.delete(material);};
   this.materials.set(material,dispose);material.addEventListener('dispose',dispose);
  }
  const hadEnvironment=!!material.envMap;material.envMap=this.target.texture;
  material.envMapIntensity=kind==='clear'?1.2:.55;
  // Vertex tint and normals remain authored; calibration uses one two-sided pass.
  if(!hadEnvironment||previousSide!==material.side)material.needsUpdate=true;
 }
 diagnostics(){return{size:glassReflectionSize(this.settings),materials:this.materials.size,estimatedTextureBytes:this.target?this.target.width*this.target.height*8:0};}
 dispose(){
  if(this.disposed)return;this.disposed=true;
  for(const [material,listener]of this.materials){material.removeEventListener('dispose',listener);if(material.envMap===this.target?.texture)material.envMap=null;}
  this.materials.clear();this.target?.dispose();this.target=null;
  if(environments.get(this.scene)===this)environments.delete(this.scene);
 }
}
