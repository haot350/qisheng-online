import * as THREE from 'three';
import {WEATHER_VISUALS,isWeatherPreset,type WeatherState} from '@qisheng/shared/weather';
import type {Vec3} from './types';

type UpwardRay=(origin:Vec3,direction:Vec3,max:number)=>number;
const CELL=2.4,COLUMNS=80,MAX_LINES=240,HEIGHT=14,UP:Vec3=[0,1,0];
const noise=(x:number,z:number,seed:number)=>{let n=(Math.imul(x,374761393)^Math.imul(z,668265263)^seed)>>>0;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};
interface ShelterEntry {roof:number;at:number;}
/** Fixed-world probes are bounded and scoped to the collision-world instance. */
export class RainShelterCache {
 private entries=new Map<string,ShelterEntry>();private identity:unknown;
 begin(identity:unknown){if(identity!==this.identity){this.identity=identity;this.entries.clear();}}
 read(key:string,now:number){const value=this.entries.get(key);return value&&now>=value.at&&now-value.at<4?value.roof:undefined;}
 probe(key:string,origin:Vec3,ray:UpwardRay,now:number){const distance=ray(origin,UP,32),roof=Number.isFinite(distance)&&distance>=0?(distance<31.99?origin[1]+distance+.12:origin[1]-100):1e6;this.entries.delete(key);this.entries.set(key,{roof,at:now});while(this.entries.size>512)this.entries.delete(this.entries.keys().next().value!);return roof;}
 clear(){this.entries.clear();this.identity=undefined;}
 get size(){return this.entries.size;}
}

/** One shared light policy and one small rain draw call; no simulation changes. */
export class WeatherScene {
 private geometry=new THREE.BufferGeometry();private material:THREE.ShaderMaterial;private rain:THREE.LineSegments;
 private bases=new Float32Array(MAX_LINES*2*3);private ends=new Float32Array(MAX_LINES*2);private roofs=new Float32Array(MAX_LINES*2);
 private columns:{x:number;z:number;key:string}[]=[];private cache=new RainShelterCache();
 private state:WeatherState={preset:'clear',seed:0,startedAtTick:0};private enabled=false;private disposed=false;private grid='';
 private defaults:{sky:THREE.Color|null;sun:THREE.Color;sunIntensity:number;ambientSky:THREE.Color;ambientGround:THREE.Color;ambientIntensity:number};
 readonly diagnostics={queries:0,activeLines:0};
 constructor(private scene:THREE.Scene,private sun:THREE.DirectionalLight,private ambient:THREE.HemisphereLight){
  this.defaults={sky:scene.background instanceof THREE.Color?scene.background.clone():null,sun:sun.color.clone(),sunIntensity:sun.intensity,ambientSky:ambient.color.clone(),ambientGround:ambient.groundColor.clone(),ambientIntensity:ambient.intensity};
  this.roofs.fill(1e6);for(let i=0;i<MAX_LINES*2;i++)this.ends[i]=i%2;
  this.geometry.setAttribute('position',new THREE.BufferAttribute(this.bases,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('aEnd',new THREE.BufferAttribute(this.ends,1));this.geometry.setAttribute('aRoof',new THREE.BufferAttribute(this.roofs,1).setUsage(THREE.DynamicDrawUsage));
  this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,uniforms:{uTime:{value:0},uEyeY:{value:0},uAlpha:{value:0},uColor:{value:new THREE.Color(0xbfd9e6)}},vertexShader:`attribute float aEnd;attribute float aRoof;uniform float uTime;uniform float uEyeY;varying float vVisible;void main(){vec3 p=position;p.y=uEyeY-4.0+fract(p.y-uTime*.72)*${HEIGHT.toFixed(1)}+aEnd*.55;p.x+=aEnd*.035;vVisible=step(aRoof,p.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,fragmentShader:`uniform float uAlpha;uniform vec3 uColor;varying float vVisible;void main(){if(vVisible<.99)discard;gl_FragColor=vec4(uColor,uAlpha);#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  this.rain=new THREE.LineSegments(this.geometry,this.material);this.rain.name='weather-light-rain';this.rain.frustumCulled=false;this.rain.renderOrder=1;this.rain.visible=false;scene.add(this.rain);
 }
 set(state:WeatherState,low:boolean,enabled=true){
  if(this.disposed)return;
  if(!enabled){if(this.enabled){this.sun.color.copy(this.defaults.sun);this.sun.intensity=this.defaults.sunIntensity;this.ambient.color.copy(this.defaults.ambientSky);this.ambient.groundColor.copy(this.defaults.ambientGround);this.ambient.intensity=this.defaults.ambientIntensity;if(this.defaults.sky)this.scene.background=this.defaults.sky.clone();}this.enabled=false;this.rain.visible=false;return;}
  const preset=isWeatherPreset(state.preset)?state.preset:'clear',visual=WEATHER_VISUALS[preset];
  if(this.state.seed!==state.seed||this.state.preset!==preset){this.grid='';this.cache.clear();}
  this.state={...state,preset};this.enabled=true;
  this.scene.background=new THREE.Color(visual.sky);if(this.scene.fog)this.scene.fog.color.set(visual.sky);
  this.sun.color.set(visual.sun);this.sun.intensity=visual.sunIntensity;this.ambient.color.set(0xe7ecf0);this.ambient.groundColor.set(0x929a90);this.ambient.intensity=visual.ambientIntensity;
  this.material.uniforms.uAlpha.value=visual.rain*.55;this.rain.visible=visual.rain>0;this.geometry.setDrawRange(0,(low?80:MAX_LINES)*2);this.diagnostics.activeLines=this.rain.visible?(low?80:MAX_LINES):0;
 }
 update(seconds:number,origin:Vec3,ray:UpwardRay|undefined,worldIdentity:unknown){
  if(this.disposed||!this.enabled||this.state.preset!=='light-rain')return;
  this.material.uniforms.uTime.value=Number.isFinite(seconds)?Math.max(0,seconds):0;this.material.uniforms.uEyeY.value=origin[1];
  if(!ray){this.rain.visible=false;return;}this.rain.visible=true;this.cache.begin(worldIdentity);
  const gx=Math.floor(origin[0]/CELL),gz=Math.floor(origin[2]/CELL),band=Math.floor(origin[1]*2),grid=gx+':'+gz+':'+band;
  if(this.grid!==grid){this.grid=grid;this.columns=[];for(let i=0;i<COLUMNS;i++){const x=gx+i%10-5,z=gz+Math.floor(i/10)-4,jitterX=noise(x,z,this.state.seed),jitterZ=noise(z,x,this.state.seed^0x716953);this.columns.push({x:(x+.15+jitterX*.7)*CELL,z:(z+.15+jitterZ*.7)*CELL,key:x+':'+z+':'+band});}for(let i=0;i<MAX_LINES;i++){const c=this.columns[i%COLUMNS],phase=noise(i,gx^gz,this.state.seed);for(let end=0;end<2;end++){const at=(i*2+end)*3;this.bases[at]=c.x;this.bases[at+1]=phase;this.bases[at+2]=c.z;}}this.geometry.attributes.position.needsUpdate=true;}
  let budget=2;for(let i=0;i<COLUMNS;i++){const column=this.columns[i];let roof=this.cache.read(column.key,seconds);if(roof===undefined&&budget>0){roof=this.cache.probe(column.key,[column.x,origin[1]+.1,column.z],ray,seconds);budget--;this.diagnostics.queries++;}for(let line=i;line<MAX_LINES;line+=COLUMNS){this.roofs[line*2]=roof??1e6;this.roofs[line*2+1]=roof??1e6;}}
  this.geometry.attributes.aRoof.needsUpdate=true;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.rain.removeFromParent();this.geometry.dispose();this.material.dispose();this.cache.clear();this.columns=[];this.diagnostics.activeLines=0;}
}
