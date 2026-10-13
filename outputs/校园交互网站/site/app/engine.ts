import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {DEFAULT_ENVIRONMENT, DEFAULT_VIEW, VIEW_ZONES, validateView, type EnvironmentSettings, type ViewState} from './viewer-state';
import type {CampusFloor} from './site-config';
import {decodeResource,ResourceFailure,resourceFailureKind,type ResourceFailureKind} from './resource-loading';
import {campusMapSession} from './campus-map';
export type {EnvironmentSettings, ViewState} from './viewer-state';
export type EngineRetry={kind:'base'}|{kind:'floor';floor:CampusFloor}|{kind:'detail';zone:string};
export type EngineStatus = {phase:'loading'|'ready'|'detail'|'error';progress?:number;message?:string;captureReady?:boolean;retry?:EngineRetry;errorKind?:ResourceFailureKind|'context';refresh?:boolean};
export type ViewerUpdate = {zone:string;floor:CampusFloor;environment:EnvironmentSettings;tour:'stopped'|'playing'|'paused'};
export type CampusEngine = {
 select:(id:string)=>void; zoom:(ratio:number)=>void; dispose:()=>void;
 setEnvironment:(patch:Partial<EnvironmentSettings>)=>void;
 setFloor:(floor:CampusFloor)=>void; retry:()=>void;
 setTour:(action:'start'|'pause'|'resume'|'stop')=>void;
 capture:()=>Promise<Blob>; getView:()=>ViewState; restoreView:(state:ViewState)=>void; reset:()=>void;
};
type CameraPose = {position:number[];target:number[];fov:number};
type Manifest = {baseUrl:string;overviewCamera:CameraPose;regions:Record<string,{group:string;label:string;camera:CameraPose;detailUrl?:string;bounds:{min:number[];max:number[]}}>;
 interior?:{building:string;structureUrl:string;floors:Record<string,{url:string;label:string;camera:CameraPose}>}};
type Tween = {start:number;fromP:THREE.Vector3;toP:THREE.Vector3;fromT:THREE.Vector3;toT:THREE.Vector3;fromF:number;toF:number};
type Atmosphere = {sky:THREE.Color;ambient:THREE.Color;ground:THREE.Color;sun:THREE.Color;position:THREE.Vector3;direct:number;fill:number;exposure:number;fog:number;rain:number};
const TOUR = ['gate','admin','teaching','library','canteen','dorm','sports','all'];

export async function createCampusEngine(host:HTMLElement,publish:(s:EngineStatus)=>void,onUpdate?:(update:ViewerUpdate)=>void):Promise<CampusEngine>{
 const compact=matchMedia('(max-width:767px)').matches;
 const motionQuery=matchMedia('(prefers-reduced-motion:reduce)');let reduced=motionQuery.matches;
 let renderer:THREE.WebGLRenderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'})}catch{throw new ResourceFailure('webgl','WebGL initialization failed')}
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','校园三维模型。拖动旋转，滚轮缩放，方向键平移。');host.appendChild(canvas);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.25,5000);
 const sky=new THREE.Color(),fog=new THREE.FogExp2(0xebece7,.0004);scene.background=sky;scene.fog=fog;
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;
 controls.maxPolarAngle=Math.PI*.475;controls.minPolarAngle=.12;controls.minDistance=15;controls.maxDistance=2000;
 controls.screenSpacePanning=false;controls.zoomSpeed=.7;controls.panSpeed=.65;controls.listenToKeyEvents(canvas);
 const hemi=new THREE.HemisphereLight(0xf7f5ed,0x929c81,2.25);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xfff2d9,3.2);sun.target.position.set(-40,0,-95);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-205,right:205,top:190,bottom:-190,near:1,far:850});
 sun.shadow.bias=-.00012;sun.shadow.normalBias=.12;sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshStandardMaterial({color:0xe5e7df,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(-40,-4,-95);floor.receiveShadow=true;scene.add(floor);
 // A single small draw call, with no textures, postprocessing or per-drop objects.
 const rainCount=280,rainData=new Float32Array(rainCount*6);
 for(let i=0;i<rainCount;i++){const j=i*6,x=-215+((i*97)%359),y=5+((i*37)%110),z=-240+((i*71)%295);rainData.set([x,y,z,x-.6,y+3.4,z+.2],j)}
 const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainData,3).setUsage(THREE.DynamicDrawUsage));
 const rainMaterial=new THREE.LineBasicMaterial({color:0xd8e5ed,transparent:true,opacity:0,depthWrite:false});
 const rain=new THREE.LineSegments(rainGeometry,rainMaterial);rain.frustumCulled=false;rain.visible=false;scene.add(rain);
 let dead=false,raf=0,inFrame=false,until=0,tween:Tween|null=null,base:THREE.Group|null=null,manifest:Manifest|null=null,selected='all',loaded=false;
 let loadSerial=0,detailAbort:AbortController|null=null,detail:THREE.Group|null=null,detailId='',contextLost=false;
 let selectedFloor:CampusFloor=0,displayedFloor:CampusFloor=0,interiorSerial=0,interiorAbort:AbortController|null=null,interiorStructure:THREE.Group|null=null,interiorFurniture:THREE.Group|null=null;
 let environment={...DEFAULT_ENVIRONMENT},pendingView:ViewState|null=null,restoreSerial=0;
 let tour:ViewerUpdate['tour']='stopped',tourIndex=0,tourTimer:ReturnType<typeof setTimeout>|null=null,tourDeadline=0,tourRemaining=8000,tourPausedAt:number|null=null;
 let suspendedAt:number|null=document.hidden?performance.now():null,suspendedTotal=0;
 let atmosphereTween:{start:number;from:Atmosphere;to:Atmosphere}|null=null,lastShadow=0;
 let lastStatus:EngineStatus={phase:'loading',message:'准备校园模型'};
 const baseAbort=new AbortController(),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 let frameCount=0,totalTime=0,lastFrame=0,autoLow=false;
 const diagnostics={ready:false,selected:'all',floor:0,renderedFrames:0,drawCalls:0,triangles:0,averageFps:0,pixelRatio:1,detail:'',error:'',contextLost:false,quality:'auto',tour:'stopped',environment:{...environment}};
 (window as unknown as {campusDiagnostics:unknown}).campusDiagnostics=diagnostics;
 const clock=()=> (suspendedAt??performance.now())-suspendedTotal;
 const emit=()=>{diagnostics.tour=tour;diagnostics.floor=selectedFloor;diagnostics.environment={...environment};if(!dead)onUpdate?.({zone:selected,floor:selectedFloor,environment:{...environment},tour})};
 function captureReady(){return loaded&&!dead&&!contextLost&&!interiorAbort&&displayedFloor===selectedFloor}
 function onStatus(s:EngineStatus){lastStatus={...s,captureReady:captureReady()};if(!dead&&!contextLost)publish(lastStatus)}
 function atmosphere(settings:EnvironmentSettings):Atmosphere{
  const angle=(settings.hour-6)/13*Math.PI,height=Math.sin(angle),warm=1-height;
  const cover={clear:0,overcast:.78,mist:.48,rain:.92}[settings.weather];
  const skyColor=new THREE.Color(0xc8dbe5).lerp(new THREE.Color(0xeac5a0),warm*.85).lerp(new THREE.Color(settings.weather==='rain'?0x899aa8:0xbac3c8),cover);
  return {sky:skyColor,ambient:new THREE.Color(0xf1f5f5).lerp(new THREE.Color(0xd8b293),warm*.55).lerp(new THREE.Color(0xcbd9e2),cover*.65),ground:new THREE.Color(0x929c81).lerp(new THREE.Color(0x748078),cover),sun:new THREE.Color(0xfff2d9).lerp(new THREE.Color(0xffb678),warm*.9),position:new THREE.Vector3(-40+Math.cos(angle)*330,35+height*285,65),direct:(2.4+height*.85)*(1-cover*.86),fill:2.15+cover*.48,exposure:1.13-cover*.12+height*.05,fog:{clear:.00038,overcast:.00105,mist:.0035,rain:.00175}[settings.weather],rain:settings.weather==='rain'?.42:0};
 }
 let currentAtmosphere=atmosphere(environment);
 function applyAtmosphere(value:Atmosphere){
  sky.copy(value.sky);fog.color.copy(value.sky);fog.density=value.fog;hemi.color.copy(value.ambient);hemi.groundColor.copy(value.ground);hemi.intensity=value.fill;
  sun.color.copy(value.sun);sun.intensity=value.direct;sun.position.copy(value.position);renderer.toneMappingExposure=value.exposure;
  rainMaterial.opacity=value.rain;rain.visible=loaded&&value.rain>.005;
 }
 function sampleAtmosphere(time:number){
  if(!atmosphereTween)return;
  const p=THREE.MathUtils.clamp((time-atmosphereTween.start)/800,0,1),t=p*p*(3-2*p),a=atmosphereTween.from,b=atmosphereTween.to;
  currentAtmosphere={sky:a.sky.clone().lerp(b.sky,t),ambient:a.ambient.clone().lerp(b.ambient,t),ground:a.ground.clone().lerp(b.ground,t),sun:a.sun.clone().lerp(b.sun,t),position:a.position.clone().lerp(b.position,t),direct:THREE.MathUtils.lerp(a.direct,b.direct,t),fill:THREE.MathUtils.lerp(a.fill,b.fill,t),exposure:THREE.MathUtils.lerp(a.exposure,b.exposure,t),fog:THREE.MathUtils.lerp(a.fog,b.fog,t),rain:THREE.MathUtils.lerp(a.rain,b.rain,t)};
  applyAtmosphere(currentAtmosphere);
  if(time-lastShadow>100||p===1){renderer.shadowMap.needsUpdate=true;lastShadow=time}
  if(p===1)atmosphereTween=null;
 }
 function applyQuality(){
  const low=environment.smooth||autoLow,ratio=low?1:Math.min(devicePixelRatio||1,compact?1.25:1.5);
  renderer.setPixelRatio(ratio);renderer.shadowMap.enabled=!compact&&!low;renderer.shadowMap.needsUpdate=true;
  rainGeometry.setDrawRange(0,(low?90:compact?150:rainCount)*2);diagnostics.pixelRatio=ratio;diagnostics.quality=environment.smooth?'smooth':autoLow?'auto-low':'auto';
 }
 function constrainCamera(){
  const target=controls.target,p=camera.position;
  if(![target.x,target.y,target.z,p.x,p.y,p.z,camera.fov].every(Number.isFinite)){target.fromArray(DEFAULT_VIEW.target);p.fromArray(DEFAULT_VIEW.position);camera.fov=40}
  target.x=THREE.MathUtils.clamp(target.x,-210,120);target.y=THREE.MathUtils.clamp(target.y,0,30);target.z=THREE.MathUtils.clamp(target.z,-230,40);
  const offset=p.clone().sub(target),spherical=new THREE.Spherical().setFromVector3(offset);
  spherical.radius=THREE.MathUtils.clamp(spherical.radius||15,15,2000);spherical.phi=THREE.MathUtils.clamp(spherical.phi,controls.minPolarAngle,controls.maxPolarAngle);
  p.copy(target).add(offset.setFromSpherical(spherical));p.y=THREE.MathUtils.clamp(p.y,2,2000);camera.fov=THREE.MathUtils.clamp(camera.fov,20,75);camera.updateProjectionMatrix();camera.lookAt(target);
 }
 function request(){if(dead||contextLost)return;until=clock()+350;if(!raf&&!inFrame&&suspendedAt===null)raf=requestAnimationFrame(render)}
 function render(){
  raf=0;if(dead||contextLost||suspendedAt!==null)return;inFrame=true;const now=clock(),delta=lastFrame?Math.min(.05,(now-lastFrame)/1000):0;
  if(tween&&tour!=='paused'){
   const p=Math.min(1,(now-tween.start)/(reduced?1:1100)),t=p*p*(3-2*p);camera.position.lerpVectors(tween.fromP,tween.toP,t);controls.target.lerpVectors(tween.fromT,tween.toT,t);camera.fov=THREE.MathUtils.lerp(tween.fromF,tween.toF,t);if(p===1)tween=null;
  }
  sampleAtmosphere(now);controls.update();constrainCamera();
  const raining=rain.visible&&!reduced;
  if(raining&&delta){for(let i=0;i<rainCount;i++){const j=i*6;rainData[j+1]-=delta*60;if(rainData[j+1]<2)rainData[j+1]+=110;rainData[j+4]=rainData[j+1]+3.4}rainGeometry.attributes.position.needsUpdate=true}
  const renderStart=performance.now();renderer.render(scene,camera);diagnostics.renderedFrames++;diagnostics.drawCalls=renderer.info.render.calls;diagnostics.triangles=renderer.info.render.triangles;
  host.dataset.viewer=JSON.stringify({...diagnostics,camera:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,aspect:camera.aspect,width:host.clientWidth,height:host.clientHeight,renderMs:performance.now()-renderStart});
  const arrow=document.getElementById('north-arrow');if(arrow)arrow.style.transform=`rotate(${-controls.getAzimuthalAngle()*180/Math.PI}deg)`;
  if(lastFrame){totalTime+=now-lastFrame;frameCount++}lastFrame=now;
  if(frameCount>=60){diagnostics.averageFps=Math.round(frameCount*1000/totalTime);if(!autoLow&&!environment.smooth&&diagnostics.averageFps<27){autoLow=true;applyQuality()}frameCount=0;totalTime=0}
  inFrame=false;if(((tween&&tour!=='paused')||atmosphereTween||raining||now<until)&&!raf)raf=requestAnimationFrame(render);else if(!raf)lastFrame=0;
 }
 function resize(){
  const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),nextAspect=w/h;
  if(loaded&&!pendingView){const scale=Math.max(1,1.32/nextAspect)/Math.max(1,1.32/camera.aspect);camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);if(scale!==1)tween=null}
  renderer.setSize(w,h);camera.aspect=nextAspect;constrainCamera();request();
 }
 const observer=new ResizeObserver(resize);observer.observe(host);
 function clearTourTimer(){if(tourTimer!==null){clearTimeout(tourTimer);tourTimer=null}}
 function scheduleTour(){
  clearTourTimer();if(dead||!loaded||tour!=='playing'||suspendedAt!==null)return;
  if(!tourDeadline)tourDeadline=clock()+tourRemaining;
  tourTimer=setTimeout(()=>{tourTimer=null;if(dead||suspendedAt!==null||tour!=='playing')return;if(tourIndex>=TOUR.length-1){tour='stopped';tourDeadline=0;emit();return}tourIndex++;tourRemaining=8000;tourDeadline=clock()+8000;void selectInternal(TOUR[tourIndex]);scheduleTour()},Math.max(0,tourDeadline-clock()));
 }
 function setTour(action:'start'|'pause'|'resume'|'stop'){
  if(dead)return;
  if(action==='start'){clearTourTimer();tour='playing';tourIndex=0;tourRemaining=8000;tourDeadline=0;tourPausedAt=null;pendingView=null;void selectInternal(TOUR[0]);scheduleTour()}
  else if(action==='pause'&&tour==='playing'){tourRemaining=tourDeadline?Math.max(0,tourDeadline-clock()):8000;tourDeadline=0;tourPausedAt=clock();tour='paused';clearTourTimer()}
  else if(action==='resume'&&tour==='paused'){if(tween&&tourPausedAt!==null)tween.start+=clock()-tourPausedAt;tourPausedAt=null;tour='playing';tourDeadline=0;scheduleTour();request()}
  else if(action==='stop'){if(tour!=='stopped')tween=null;tour='stopped';tourDeadline=0;tourRemaining=8000;tourPausedAt=null;clearTourTimer()}
  emit();request();
 }
 function interrupt(){++restoreSerial;if(tour!=='stopped')setTour('stop');tween=null;pendingView=null;request()}
 controls.addEventListener('change',request);controls.addEventListener('start',interrupt);controls.addEventListener('end',request);
 function syncSuspension(){
  const blocked=document.hidden||contextLost;
  if(blocked&&suspendedAt===null){suspendedAt=performance.now();cancelAnimationFrame(raf);raf=0;clearTourTimer();lastFrame=0}
  else if(!blocked&&suspendedAt!==null){suspendedTotal+=performance.now()-suspendedAt;suspendedAt=null;scheduleTour();request()}
 }
 document.addEventListener('visibilitychange',syncSuspension);
 function lose(e:Event){e.preventDefault();contextLost=true;diagnostics.contextLost=true;syncSuspension();publish({phase:'error',captureReady:false,errorKind:'context',retry:{kind:'base'},message:'三维显示已中断。可以重新加载，或等待浏览器恢复。'})}
 function restore(){contextLost=false;diagnostics.contextLost=false;renderer.shadowMap.needsUpdate=true;onStatus(lastStatus);syncSuspension();request()}
 canvas.addEventListener('webglcontextlost',lose);canvas.addEventListener('webglcontextrestored',restore);
 function motionChanged(){reduced=motionQuery.matches;request()}motionQuery.addEventListener('change',motionChanged);
 function disposeGroup(group:THREE.Object3D){const geo=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),tex=new Set<THREE.Texture>();group.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;if((m as THREE.InstancedMesh).isInstancedMesh)(m as THREE.InstancedMesh).dispose();geo.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:[m.material]){mats.add(mat);for(const v of Object.values(mat))if(v instanceof THREE.Texture)tex.add(v)}});geo.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());tex.forEach(t=>{t.dispose();const src=t.source?.data;if(typeof ImageBitmap!=='undefined'&&src instanceof ImageBitmap)src.close()})}
 // Preserve region roots while consolidating static draws; instanced vegetation stays instanced.
 function prepare(group:THREE.Group){group.updateMatrixWorld(true);
  const boundaries=new Set<THREE.Object3D>(group.children);
  group.traverse(o=>{if(o.name==='south_teaching_exterior'||/^floor_[1-5]_/.test(o.name)||typeof o.userData.floor==='number')boundaries.add(o)});
  for(const root of boundaries){
  const inverse=root.matrixWorld.clone().invert();const batches=new Map<string,{mat:THREE.Material;items:THREE.Mesh[]}>();
  root.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;let parent=mesh.parent;while(parent&&parent!==root){if(boundaries.has(parent))return;parent=parent.parent}const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];mesh.receiveShadow=true;mesh.castShadow=!materials.some(m=>m.transparent);mesh.frustumCulled=true;
   if((mesh as THREE.InstancedMesh).isInstancedMesh||materials.length!==1||materials[0].transparent)return;
   const key=materials[0].uuid;if(!batches.has(key))batches.set(key,{mat:materials[0],items:[]});batches.get(key)!.items.push(mesh);
  });
  for(const {mat,items} of batches.values()){if(items.length<2)continue;const gs:THREE.BufferGeometry[]=[];
   for(const item of items){const src=item.geometry,g=new THREE.BufferGeometry();for(const [name,size] of [['position',3],['normal',3],['uv',2]] as const){const a=src.getAttribute(name);if(!a&&name!=='uv')continue;const data=new Float32Array(src.getAttribute('position').count*size);if(a)for(let i=0;i<a.count;i++){data[i*size]=a.getX(i);data[i*size+1]=a.getY(i);if(size===3)data[i*size+2]=a.getZ(i);}g.setAttribute(name,new THREE.BufferAttribute(data,size));}if(src.index)g.setIndex(src.index.clone());else g.setIndex(Array.from({length:src.getAttribute('position').count},(_,i)=>i));if(!g.getAttribute('normal'))g.computeVertexNormals();g.applyMatrix4(inverse.clone().multiply(item.matrixWorld));gs.push(g);}
   const merged=mergeGeometries(gs,false);gs.forEach(g=>g.dispose());if(!merged)continue;const m=new THREE.Mesh(merged,mat);m.name=`batch_${root.name}_${mat.name}`;m.castShadow=!mat.transparent;m.receiveShadow=true;root.add(m);items.forEach(o=>o.removeFromParent());
  }
 }return group}
 async function load(url:string,signal:AbortSignal,progress?:(n:number|undefined)=>void){
  const bytes=await campusMapSession.read(url,{signal,progress,priority:0});
  const parsed=await decodeResource(()=>loader.parseAsync(bytes,new URL('.',new URL(url,location.href)).href),g=>disposeGroup(g.scene),signal);
  if(signal.aborted||dead){disposeGroup(parsed.scene);throw new DOMException('Aborted','AbortError')}
  try{return prepare(parsed.scene)}catch(error){disposeGroup(parsed.scene);throw error}
 }

 function animatePose(pose:CameraPose,wide=false){
  const target=new THREE.Vector3().fromArray(pose.target),position=new THREE.Vector3().fromArray(pose.position),portrait=Math.max(1,1.32/camera.aspect)*(wide?1.13:1.08);
  position.sub(target).multiplyScalar(portrait).add(target);
  tween={start:clock(),fromP:camera.position.clone(),toP:position,fromT:controls.target.clone(),toT:target,fromF:camera.fov,toF:pose.fov};request();
 }
 function framePose(id:string){if(!manifest)return;const pose=id==='all'?manifest.overviewCamera:manifest.regions[id]?.camera;if(pose)animatePose(pose,id==='all')}
 function showSouthExterior(show:boolean){for(const group of [base,detail]){const south=group?.getObjectByName('south_teaching_exterior');if(south)south.visible=show}}
 function clearInterior(resetSelection=true){
  ++interiorSerial;interiorAbort?.abort();interiorAbort=null;
  for(const group of [interiorStructure,interiorFurniture])if(group){scene.remove(group);disposeGroup(group)}
  interiorStructure=null;interiorFurniture=null;displayedFloor=0;if(resetSelection)selectedFloor=0;showSouthExterior(true);emit();renderer.shadowMap.needsUpdate=true;request();
 }
 function updateFloorVisibility(){
  showSouthExterior(!interiorStructure||selectedFloor===0);
  interiorStructure?.traverse(o=>{const match=/^floor_([1-5])_(structure|facade|ceiling)/.exec(o.name),floor=Number(o.userData.floor??match?.[1]),role=o.userData.role??match?.[2];if(floor)o.visible=floor<=selectedFloor&&(role!=='ceiling'||floor<selectedFloor)});
  renderer.shadowMap.needsUpdate=true;request();
 }
 async function selectFloorInternal(floor:CampusFloor,frame=true){
  if(dead||!Number.isInteger(floor)||floor<0||floor>4)return;
  if(floor===0){clearInterior();onStatus({phase:'ready'});if(frame)framePose('teaching');return}
  if(!loaded||!manifest?.interior)return;
  if(selected!=='teaching')await selectInternal('teaching',false);
  const info=manifest.interior.floors[String(floor)];if(!info)return;
  const serial=++interiorSerial;interiorAbort?.abort();const abort=new AbortController();interiorAbort=abort;selectedFloor=floor;emit();
  onStatus({phase:'detail',message:`正在载入南教学楼${info.label}`});
  const results=await Promise.allSettled([interiorStructure?Promise.resolve(null):load(manifest.interior.structureUrl,abort.signal),load(info.url,abort.signal)]);
  const groups=results.map(r=>r.status==='fulfilled'?r.value:null);
  if(dead||serial!==interiorSerial||results.some(r=>r.status==='rejected')){
   groups.forEach(g=>{if(g)disposeGroup(g)});
   if(!dead&&serial===interiorSerial&&!abort.signal.aborted){const failure=results.find(r=>r.status==='rejected') as PromiseRejectedResult;clearInterior(false);diagnostics.error=String(failure.reason);onStatus({phase:'ready',retry:{kind:'floor',floor},errorKind:resourceFailureKind(failure.reason),message:`${info.label}未能载入，暂时显示外观。`})}return;
  }
  if(groups[0]){interiorStructure=groups[0];scene.add(groups[0])}
  if(interiorFurniture){scene.remove(interiorFurniture);disposeGroup(interiorFurniture)}
  interiorFurniture=groups[1];if(interiorFurniture)scene.add(interiorFurniture);
  interiorAbort=null;displayedFloor=floor;updateFloorVisibility();onStatus({phase:'ready'});if(frame)animatePose(info.camera);emit();
 }
 function setFloor(floor:CampusFloor){interrupt();void selectFloorInternal(floor)}
 async function selectInternal(id:string,frame=true){
  if(dead||!VIEW_ZONES.some(zone=>zone===id))return;
  if(id!=='teaching'&&(selectedFloor!==0||interiorAbort))clearInterior();
  const same=id===selected;selected=id;diagnostics.selected=id;emit();if(!manifest||!loaded)return;
  if(frame)framePose(id);if(same&&(detailId===id||detailAbort))return;
  const serial=++loadSerial;detailAbort?.abort();detailAbort=null;
  if(detail){scene.remove(detail);disposeGroup(detail);detail=null;const previous=base?.getObjectByName(manifest.regions[detailId]?.group||`zone_${detailId}`);if(previous)previous.visible=true;detailId='';diagnostics.detail='';renderer.shadowMap.needsUpdate=true;request()}
  const url=manifest.regions[id]?.detailUrl;if(!url){onStatus({phase:'ready'});return}
  detailAbort=new AbortController();onStatus({phase:'detail',message:'正在载入这一处的近景细节'});
  try{const next=await load(url,detailAbort.signal);if(dead||serial!==loadSerial){disposeGroup(next);return}detail=next;detailId=id;diagnostics.detail=id;diagnostics.error='';scene.add(next);const old=base?.getObjectByName(manifest.regions[id].group);if(old)old.visible=false;updateFloorVisibility();onStatus({phase:'ready'});request()}
  catch(e){if(serial!==loadSerial||dead||(e as Error).name==='AbortError')return;diagnostics.error=String(e);onStatus({phase:'ready',retry:{kind:'detail',zone:id},errorKind:resourceFailureKind(e),message:'近景未能载入，可继续浏览外观。'})}
  finally{if(serial===loadSerial)detailAbort=null}
 }
 function select(id:string){if(dead||!VIEW_ZONES.some(zone=>zone===id))return;interrupt();if(selectedFloor||interiorAbort)clearInterior();void selectInternal(id)}
 function zoom(ratio:number){if(dead||!Number.isFinite(ratio)||ratio<=0)return;interrupt();camera.position.sub(controls.target).multiplyScalar(THREE.MathUtils.clamp(ratio,.1,10)).add(controls.target);constrainCamera();controls.update();request()}
 function setEnvironment(patch:Partial<EnvironmentSettings>){
  if(dead)return;
  const next={...environment};
  if(typeof patch.hour==='number'&&Number.isFinite(patch.hour))next.hour=THREE.MathUtils.clamp(patch.hour,7,18);
  if(patch.weather&&['clear','overcast','mist','rain'].includes(patch.weather))next.weather=patch.weather;
  if(typeof patch.smooth==='boolean')next.smooth=patch.smooth;
  if(next.hour===environment.hour&&next.weather===environment.weather&&next.smooth===environment.smooth)return;
  sampleAtmosphere(clock());const qualityChanged=next.smooth!==environment.smooth;environment=next;
  atmosphereTween={start:clock(),from:currentAtmosphere,to:atmosphere(environment)};
  if(pendingView)pendingView.environment={...environment};if(qualityChanged)applyQuality();emit();request();
 }
 function getView():ViewState{constrainCamera();return {v:1,zone:selected,floor:selectedFloor,position:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,environment:{...environment}}}
 function applyPose(state:ViewState){
  tween=null;camera.position.fromArray(state.position);controls.target.fromArray(state.target);camera.fov=state.fov;
  // Drain OrbitControls' previous damping before setting an exact shared pose.
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
  camera.position.fromArray(state.position);controls.target.fromArray(state.target);constrainCamera();request();
 }
 function restoreView(state:ViewState){
  const safe=validateView(state);if(dead||!safe)return;
  const serial=++restoreSerial;
  setTour('stop');setEnvironment(safe.environment);applyPose(safe);pendingView=loaded?null:safe;
  if(loaded)void selectInternal(safe.zone,false).then(()=>{if(!dead&&serial===restoreSerial)return selectFloorInternal(safe.floor??0,false)});
 }
 function reset(){if(dead)return;interrupt();setEnvironment({...DEFAULT_ENVIRONMENT});void selectInternal('all')}
 function capture():Promise<Blob>{
  if(!captureReady())return Promise.reject(new Error('请等待当前楼层载入后再生成图片。'));
  if(document.hidden)return Promise.reject(new Error('请回到校园页面后再保存画面。'));
  const size=renderer.getSize(new THREE.Vector2()),pixelRatio=renderer.getPixelRatio();
  const scale=Math.min(2,1920/Math.max(size.x,size.y)),width=Math.max(1,Math.round(size.x*scale)),height=Math.max(1,Math.round(size.y*scale));
  const output=document.createElement('canvas');output.width=width;output.height=height;
  try{
   const context=output.getContext('2d');if(!context)throw new Error('浏览器暂时无法生成图片，请重试。');
   // Copy the fresh frame synchronously; the live renderer never preserves its drawing buffer.
   renderer.setPixelRatio(1);renderer.setSize(width,height,false);constrainCamera();renderer.render(scene,camera);context.drawImage(canvas,0,0,width,height);
  }catch(error){return Promise.reject(error)}
  finally{renderer.setPixelRatio(pixelRatio);renderer.setSize(size.x,size.y,false);request()}
  return new Promise((resolve,reject)=>{try{output.toBlob(blob=>blob?resolve(blob):reject(new Error('图片生成失败，请重试。')),'image/png')}catch(error){reject(error)}});
 }
 function keyboard(e:KeyboardEvent){
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))interrupt();
  if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.8)}if(e.key==='-'){e.preventDefault();zoom(1.25)}
  if(e.key==='Home'){e.preventDefault();select('all')}
 }
 canvas.addEventListener('keydown',keyboard);
 camera.position.fromArray(DEFAULT_VIEW.position);controls.target.fromArray(DEFAULT_VIEW.target);applyQuality();applyAtmosphere(currentAtmosphere);resize();emit();
 function finishBaseLoad(){
  if(pendingView){const view=pendingView;pendingView=null;restoreView(view)}
  else{const p=manifest!.overviewCamera;camera.position.fromArray(p.position);controls.target.fromArray(p.target);camera.fov=p.fov;void selectInternal(selected)}
  if(tour==='paused')tourPausedAt=clock();scheduleTour();request();
 }
 // Return a disposable owner immediately, including while a request is in flight.
 void (async()=>{try{
  const {manifestBytes}=await campusMapSession.initialize(baseAbort.signal);manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
  base=await load(manifest!.baseUrl,baseAbort.signal,n=>onStatus({phase:'loading',progress:n,message:n===100?'正在准备光影与材质':'正在载入校园模型'}));
  if(dead){disposeGroup(base);return}scene.add(base);loaded=true;diagnostics.ready=true;renderer.shadowMap.needsUpdate=true;applyAtmosphere(currentAtmosphere);
  finishBaseLoad();
 }catch(e){if(dead||(e as Error).name==='AbortError')return;diagnostics.error=String(e);setTour('stop');onStatus({phase:'error',retry:{kind:'base'},errorKind:resourceFailureKind(e),message:resourceFailureKind(e)==='timeout'?'校园下载暂时没有进展，请重新加载。':resourceFailureKind(e)==='decode'?'校园模型未能打开，请重新加载。':'校园模型未能载入，请检查网络后重新加载。'})}})();
 return {select,zoom,setFloor,retry(){const target=lastStatus.retry;if(target?.kind==='floor')setFloor(target.floor);else if(target?.kind==='detail')void selectInternal(target.zone)},setEnvironment,setTour,capture,getView,restoreView,reset,dispose(){
  if(dead)return;dead=true;++interiorSerial;baseAbort.abort();detailAbort?.abort();interiorAbort?.abort();clearTourTimer();cancelAnimationFrame(raf);observer.disconnect();
  document.removeEventListener('visibilitychange',syncSuspension);motionQuery.removeEventListener('change',motionChanged);
  canvas.removeEventListener('keydown',keyboard);canvas.removeEventListener('webglcontextlost',lose);canvas.removeEventListener('webglcontextrestored',restore);
  controls.removeEventListener('change',request);controls.removeEventListener('start',interrupt);controls.removeEventListener('end',request);controls.dispose();
  disposeGroup(scene);rainGeometry.dispose();rainMaterial.dispose();sun.shadow.dispose();renderer.dispose();canvas.remove();
 }};
}
