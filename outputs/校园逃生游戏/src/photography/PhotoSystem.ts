import * as THREE from 'three';
import { hidePhotoGuides } from '../photography-markers.ts';
import { AlbumFullError,photoCount,removePhoto,savePhoto,watchAlbum } from './album.ts';
import { capturePoseMeta,copyCaptureEvidence,mergeCaptureEvidence } from './capture-meta.ts';
import { alphaPixelPass,axialFocusDistance,focusPullDistance } from './focus.ts';
import { captureSize,clamp,ExposureClock,fieldOfView,normalizePhotoSettings,photographyBufferBytes,solveExposure,whiteBalanceGain } from './math.ts';
import { previewSize,previewTier,type PhotoPreviewQuality } from './preview.ts';
import * as shader from './shaders.ts';
import { DEFAULT_PHOTO_SETTINGS,type PhotoCaptureEvidence,type PhotoCaptureMeta,type PhotoExposure,type PhotoFocusState,type PhotoRecord,type PhotoSettings,type PhotoSnapshot } from './types.ts';
export type PhotoOptions={mobile:boolean;temporaryCount?:()=>number;onCapture?:(photo:PhotoRecord)=>void;onChange?:(snapshot:PhotoSnapshot)=>void;onRetryView?:()=>void;onFocusAcquired?:(event:{sessionId:number;requestId:number;source:string})=>void;onExposureStarted?:(event:{shotId:number})=>void;captureEvidence?:(camera:THREE.PerspectiveCamera,settings:Readonly<PhotoSettings>)=>PhotoCaptureEvidence};
type Capture={resolve:(photo:PhotoRecord|null)=>void;reject:(error:Error)=>void;settings:PhotoSettings;exposure:PhotoExposure;camera:THREE.PerspectiveCamera;firstCamera:THREE.PerspectiveCamera;meta:PhotoCaptureMeta;evidence?:PhotoCaptureEvidence;size?:[number,number];id:number};
type FocusRequest={id:number;source:string;start:number;target:number;found:boolean;elapsed:number;duration:number;continuous:boolean;announced:boolean};
export class PhotoSystem{
 readonly camera=new THREE.PerspectiveCamera(53,1.5,.075,420);
 private settings={...DEFAULT_PHOTO_SETTINGS};private enabled=false;private disposed=false;private suspended=false;private low=false;
 private previewQuality:PhotoPreviewQuality='high';private adaptiveRatio=1;
 private previewMobile=false;
 private viewStatus={ready:false,failed:false,progress:0};private outputReady=false;
 private clock=new ExposureClock();private shot:Capture|null=null;private lastRecord:PhotoRecord|null=null;private finishing=false;private saveController:AbortController|null=null;private serial=0;private focusPoint=new THREE.Vector2();private focusState:PhotoFocusState='idle';private focusOwners=new Set<string>();private focusRequest:FocusRequest|null=null;private focusSession=0;private focusSerial=0;private activeFocusConfirmed=false;private shutterPending=false;private roll=0;private meter=.18;private lockedMeter=.18;private balance=new THREE.Vector3(1,1,1);private histogram=Array(32).fill(0) as number[];private count=0;private lastId:string|null=null;private message='';private elapsed=0;private publishTime=0;private sampleTime=0;private samplePending=false;
 private sceneTarget:THREE.WebGLRenderTarget|null=null;private accumulation:[THREE.WebGLRenderTarget,THREE.WebGLRenderTarget]|null=null;private output:THREE.WebGLRenderTarget|null=null;private previous:THREE.WebGLRenderTarget|null=null;private meterTarget=new THREE.WebGLRenderTarget(32,24,{depthBuffer:false});private a=0;private accumulatedWeight=0;private previousReady=false;private previousMatrix=new THREE.Matrix4();private inverseMatrix=new THREE.Matrix4();private viewProjection=new THREE.Matrix4();
 private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));private screen=new THREE.Scene();private screenCamera=new THREE.Camera();private material:THREE.ShaderMaterial;private accumulationMaterial:THREE.ShaderMaterial;private previousMaterial:THREE.ShaderMaterial;private meterMaterial:THREE.ShaderMaterial;private copyMaterial:THREE.ShaderMaterial;private ray=new THREE.Raycaster();private alphaCache=new WeakMap<object,{data:ArrayLike<number>;width:number;height:number}>();private targetSize:[number,number]=[0,0];private unwatch:()=>void;private sceneCalls=0;private sceneTriangles=0;private passCalls=0;
 constructor(private renderer:THREE.WebGLRenderer,private scene:THREE.Scene,private options:PhotoOptions){
  this.previewMobile=options.mobile;
  const uniforms={image:{value:null},depthImage:{value:null},resolution:{value:new THREE.Vector2()},nearPlane:{value:.075},farPlane:{value:420},focusDistance:{value:20},focalLength:{value:24},aperture:{value:8},sensorWidth:{value:36},useFocus:{value:1},maxBlur:{value:18},samples:{value:16}};
  const make=(fragment:string,extra:Record<string,{value:unknown}>={})=>new THREE.ShaderMaterial({vertexShader:shader.vertex,fragmentShader:fragment,uniforms:{...THREE.UniformsUtils.clone(uniforms),...extra},depthTest:false,depthWrite:false,toneMapped:false});
  this.material=make(shader.finalImage,{previous:{value:null},inverseViewProjection:{value:new THREE.Matrix4()},previousViewProjection:{value:new THREE.Matrix4()},previousReady:{value:0},motionAmount:{value:0},alreadyFocused:{value:0},gain:{value:1},iso:{value:100},noiseSeed:{value:0},highlights:{value:0},magnify:{value:1},balance:{value:new THREE.Vector3(1,1,1)},toneMappingExposure:{value:1}});
  this.accumulationMaterial=make(shader.accumulate,{accumulated:{value:null},blend:{value:1}});this.previousMaterial=make(shader.previousImage);this.meterMaterial=make(shader.meterImage);this.copyMaterial=make(shader.copyImage);this.screen.add(this.quad);
  this.unwatch=watchAlbum(n=>{if(!this.disposed){this.count=n;this.emit();}});void photoCount().then(n=>{if(!this.disposed){this.count=n;this.emit();}}).catch(()=>{});
 }
 open(baseCamera:THREE.PerspectiveCamera){if(this.disposed)return;this.cancel();this.focusSession++;this.enabled=true;this.suspended=false;this.viewStatus={ready:false,failed:false,progress:0};this.message='按住 F 或对焦按钮对焦，空格或快门拍摄。';this.copyPose(baseCamera);this.previousReady=false;this.emit();}
 close(){this.cancel();this.enabled=false;this.suspended=false;this.releaseTargets();this.emit();}
 pause(reason='拍摄已暂停'){this.cancel();this.suspended=true;this.message=reason;this.emit();}
 resume(){if(this.suspended)this.message=this.lastId?(this.lastRecord?.storageStatus==='temporary'?'本次照片尚未保存，可从相册导出。':'照片保存在本机相册中，可以继续取景。'):'按住 F 或对焦按钮对焦，空格或快门拍摄。';this.suspended=false;this.previousReady=false;this.emit();}
 setQuality(low:boolean){if(this.low!==low){this.low=low;if(!this.shot)this.previousReady=false;}}
 setPreviewMobile(mobile:boolean){if(this.previewMobile!==mobile){this.previewMobile=mobile;if(!this.shot)this.previousReady=false;}}
 setPreviewQuality(quality:PhotoPreviewQuality,adaptiveRatio=1){const old=previewTier(this.previewQuality,this.adaptiveRatio);this.previewQuality=quality;this.adaptiveRatio=adaptiveRatio;if(!this.shot&&old!==previewTier(quality,adaptiveRatio))this.previousReady=false;}
 /** Called before streaming: preparing a view never publishes or advances exposure. */
 prepareView(baseCamera:THREE.PerspectiveCamera){if(!this.enabled||this.disposed)return;if(!this.shot||this.shutterPending||this.clock.state==='timer'||this.shot.settings.timer>0&&this.shot.meta.samples===0||this.shot.exposure.shutter<=.25)this.copyPose(baseCamera);else{this.camera.copy(this.shot.camera);this.camera.updateMatrixWorld();}}
 setViewStatus(value:{ready:boolean;failed:boolean;progress:number}){const next={ready:!!value.ready,failed:!!value.failed,progress:clamp(value.progress,0,1)};if(next.ready===this.viewStatus.ready&&next.failed===this.viewStatus.failed&&next.progress===this.viewStatus.progress)return;this.viewStatus=next;if(!next.ready&&this.shot){this.cancel();this.message='取景资源尚未完整，本次拍摄已取消。';}this.emit();}
 retryView(){if(!this.enabled||this.disposed)return;this.options.onRetryView?.();}
 /** Only an unsaved capture needs a temporary export entry; stored photos come from IndexedDB. */
 lastCapture(){return this.lastRecord;}
 statistics(){return{drawCalls:this.sceneCalls+this.passCalls,triangles:this.sceneTriangles+this.passCalls*2,sceneDrawCalls:this.sceneCalls,postprocessingCalls:this.passCalls};}
 configure(partial:Partial<PhotoSettings>){if(this.shot){this.message='本次拍摄参数已锁定，取消拍摄后可调整。';this.emit();return;}const previous=this.settings,wasLock=previous.aeLock;this.settings=normalizePhotoSettings(partial,previous);if(!wasLock&&this.settings.aeLock)this.lockedMeter=this.meter;if(this.settings.focusMode!==previous.focusMode||this.settings.focusDistance!==previous.focusDistance)this.resetFocus();else if(this.settings.focalLength!==previous.focalLength||this.settings.orientation!==previous.orientation){this.focusRequest=null;this.focusState='idle';this.activeFocusConfirmed=false;if(this.focusOwners.size)this.beginFocus(this.focusOwners.values().next().value!);}this.previousReady=false;this.emit();}
 snapshot():PhotoSnapshot{const exp=this.shot?.exposure??solveExposure(this.settings,this.settings.aeLock?this.lockedMeter:this.meter),tier=previewTier(this.previewQuality,this.adaptiveRatio),size=previewSize(this.previewMobile,tier,this.settings.orientation==='portrait');return{open:this.enabled,settings:{...this.settings},exposure:{...exp},state:this.suspended?'paused':this.clock.state==='idle'?'viewfinder':this.clock.state,remaining:this.clock.state==='timer'?this.clock.timer:Math.max(0,this.clock.duration-this.clock.elapsed),progress:this.clock.duration>0?this.clock.elapsed/this.clock.duration:0,viewReady:this.viewStatus.ready,viewFailed:this.viewStatus.failed,viewProgress:this.viewStatus.progress,focusConfirmed:this.focusState==='locked',focusState:this.focusState,shutterPending:this.shutterPending,focusDistance:this.settings.focusDistance,focusPoint:this.focusPoint.toArray() as [number,number],roll:this.roll,histogram:[...this.histogram],message:this.message,albumCount:this.count+(this.options.temporaryCount?.()??0),lastPhotoId:this.lastId,width:this.targetSize[0],height:this.targetSize[1],bufferBytes:photographyBufferBytes(...this.targetSize),previewTier:tier,previewWidth:size[0],previewHeight:size[1]};}
 focus(x:number,y:number){if(!this.enabled||this.suspended||this.shot||this.disposed)return;const magnify=this.settings.magnify?5:1;this.focusPoint.set(clamp(x/magnify,-1,1),clamp(y/magnify,-1,1));this.activeFocusConfirmed=false;if(!this.focusRequest)this.focusState='idle';this.emit();}
 setFocusHeld(source:string,held:boolean){
  if(!held){if(!this.focusOwners.delete(source))return;if(!this.focusOwners.size&&this.focusRequest?.source!=='shutter-auto'){this.focusRequest=null;if(this.focusState==='acquiring')this.focusState='idle';}this.emit();return;}
  if(!source||!this.enabled||this.suspended||this.disposed||this.shot||this.settings.focusMode==='manual'||this.focusOwners.has(source))return;
  const first=this.focusOwners.size===0;this.focusOwners.add(source);if(first)this.beginFocus(source);this.emit();
 }
 capture():Promise<PhotoRecord|null>{
  if(!this.enabled||this.suspended||this.disposed)return Promise.resolve(null);if(this.shot)return Promise.reject(Error('当前照片尚未完成。'));if(this.count+(this.options.temporaryCount?.()??0)>=50){this.message=new AlbumFullError().message;this.emit();return Promise.reject(new AlbumFullError());}
  if(!this.viewStatus.ready)return Promise.reject(Error(this.viewStatus.failed?'取景资源未载入，请重试后再拍摄。':'正在准备取景资源，可以继续移动和观察。'));
  const exposure=solveExposure(this.settings,this.settings.aeLock?this.lockedMeter:this.meter),id=++this.serial;this.accumulatedWeight=0;this.previousReady=false;
  const promise=new Promise<PhotoRecord|null>((resolve,reject)=>{this.shot={resolve,reject,settings:{...this.settings},exposure,camera:this.camera.clone(),firstCamera:this.camera.clone(),meta:{eligible:true,resourcesComplete:true,unstable:false,samples:0,translation:0,rotationDegrees:0,locked:exposure.shutter>.25},id};});
  this.shutterPending=this.settings.interface==='simple'&&this.settings.focusMode!=='manual'&&!this.activeFocusConfirmed;
  if(this.shutterPending){this.beginFocus('shutter-auto',.12);this.message='快速对焦中';}else{this.focusRequest=null;if(this.focusState==='acquiring')this.focusState='idle';this.startExposure();}this.emit();return promise;
 }
 cancel(){this.serial++;this.saveController?.abort();this.saveController=null;const shot=this.shot;this.shot=null;this.finishing=false;this.shutterPending=false;this.clock.cancel();this.accumulatedWeight=0;this.resetFocus();shot?.resolve(null);this.previousReady=false;this.emit();}
 private resetFocus(){this.focusOwners.clear();this.focusRequest=null;this.focusState='idle';this.activeFocusConfirmed=false;}
 private startExposure(){if(!this.shot)return;this.shutterPending=false;this.shot.settings={...this.settings};this.shot.exposure=solveExposure(this.settings,this.settings.aeLock?this.lockedMeter:this.meter);this.shot.camera.copy(this.camera);this.clock.start(this.settings.timer,this.shot.exposure.shutter);this.message=this.settings.timer?'自拍倒计时开始。':this.shot.exposure.shutter>.25?'架机长曝光，校园仍在活动。':'正在拍摄';}
 private beginFocus(source:string,duration=.2){if(this.settings.focusMode==='manual')return;const target=this.findFocus();this.focusRequest={id:++this.focusSerial,source,start:this.settings.focusDistance,target:target.distance,found:target.found,elapsed:0,duration,continuous:source!=='shutter-auto'&&this.settings.focusMode==='continuous'&&this.focusOwners.size>0,announced:false};this.focusState='acquiring';this.activeFocusConfirmed=false;}
 private advanceFocus(dt:number){
  if(this.shot&&!this.shutterPending)return;
  if(!this.focusRequest&&this.settings.focusMode==='continuous'&&this.focusOwners.size)this.beginFocus(this.focusOwners.values().next().value!);
  const request=this.focusRequest;if(!request||dt<=0)return;const previousState=this.focusState;
  const target=this.findFocus();request.target=target.distance;request.found=target.found;
  request.elapsed+=dt;
  if(request.continuous){const alpha=1-Math.exp(-dt/.05);this.settings.focusDistance=1/((1-alpha)/this.settings.focusDistance+alpha/request.target);}
  else this.settings.focusDistance=focusPullDistance(request.start,request.target,request.elapsed/request.duration);
  const converged=request.elapsed+1e-8>=request.duration&&(!request.continuous||Math.abs(1/this.settings.focusDistance-1/request.target)<=Math.max(.0005,.02/request.target));
  if(!converged){this.focusState='acquiring';this.activeFocusConfirmed=false;return;}
  if(!request.continuous)this.settings.focusDistance=request.target;
  this.focusState=request.found?'locked':'not-found';this.activeFocusConfirmed=request.found&&request.source!=='shutter-auto';
  if(request.found&&!request.announced){request.announced=true;this.options.onFocusAcquired?.({sessionId:this.focusSession,requestId:request.id,source:request.source});}
  if(!request.continuous)this.focusRequest=null;
  const startsExposure=this.shutterPending;if(startsExposure){this.focusRequest=null;this.startExposure();}if(!request.continuous||previousState!==this.focusState||startsExposure)this.emit();
 }
 private emit(){if(!this.disposed)this.options.onChange?.(this.snapshot());}
 private copyPose(base:THREE.PerspectiveCamera){this.camera.position.copy(base.position);this.camera.quaternion.copy(base.quaternion);this.camera.up.copy(base.up);this.camera.near=base.near;this.camera.far=Math.max(360,base.far);this.camera.aspect=this.settings.orientation==='portrait'?2/3:3/2;this.camera.fov=fieldOfView(this.settings.focalLength,this.settings.orientation==='portrait');this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.roll=new THREE.Euler().setFromQuaternion(this.camera.quaternion,'YXZ').z*180/Math.PI;}
 private findFocus(){
  this.scene.updateMatrixWorld();
  this.ray.setFromCamera(this.focusPoint,this.camera);const hit=this.ray.intersectObjects(this.scene.children,true).find(h=>{
   let node:THREE.Object3D|null=h.object;while(node){if(!node.visible||node.userData.excludePhotography)return false;node=node.parent;}
   if(!(h.object instanceof THREE.Mesh))return false;const material=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex??0]:h.object.material;if(material instanceof THREE.Material&&(!material.visible||material.opacity<.3))return false;
   const mapped=material as THREE.MeshBasicMaterial;if(mapped.alphaTest>0&&mapped.map&&h.uv){const im=mapped.map.image as object;if(!im)return true;let alpha=this.alphaCache.get(im);if(!alpha){const image=im as {width:number;height:number;data?:Uint8Array};if(image.data instanceof Uint8Array&&image.data.length===image.width*image.height*4)alpha={data:image.data,width:image.width,height:image.height};else try{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(ctx){ctx.drawImage(im as CanvasImageSource,0,0);alpha={data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};}}catch{/* Tainted third-party images retain geometric AF fallback. */}if(alpha)this.alphaCache.set(im,alpha);}
    if(alpha){const uv=h.uv.clone();mapped.map.transformUv(uv);if(!alphaPixelPass(alpha,uv.x,uv.y,mapped.alphaTest))return false;}}
   return true;
  });
  if(hit){const p=hit.point.clone().applyMatrix4(this.camera.matrixWorldInverse);return{distance:axialFocusDistance(p.z),found:true};}return{distance:2000,found:false};
 }
 private allocate(width:number,height:number,keepHistory=false){
  if(this.targetSize[0]===width&&this.targetSize[1]===height)return;const keepPrevious=keepHistory&&this.previous&&Math.abs(this.targetSize[0]/this.targetSize[1]-width/height)<.001,oldPrevious=keepPrevious?this.previous:null,oldReady=this.previousReady;if(keepPrevious)this.previous=null;this.releaseTargets();this.targetSize=[width,height];
  const hdr=()=>new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});this.sceneTarget=hdr();this.sceneTarget.depthBuffer=true;this.sceneTarget.depthTexture=new THREE.DepthTexture(width,height,THREE.UnsignedIntType);this.accumulation=[hdr(),hdr()];this.output=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false});this.previous=oldPrevious??new THREE.WebGLRenderTarget(width,height,{depthBuffer:false});this.a=0;this.previousReady=!!keepPrevious&&oldReady;
 }
 private releaseTargets(){this.sceneTarget?.depthTexture?.dispose();this.sceneTarget?.dispose();this.accumulation?.forEach(t=>t.dispose());this.output?.dispose();this.previous?.dispose();this.sceneTarget=null;this.accumulation=null;this.output=null;this.previous=null;this.targetSize=[0,0];this.outputReady=false;}
 private draw(material:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget|null){this.passCalls++;this.quad.material=material;this.renderer.setRenderTarget(target);this.renderer.render(this.screen,this.screenCamera);}
 /** A critical nearby stall keeps the last framed image, never swaps to the walking camera. */
 renderFrozen():boolean{if(!this.enabled||this.disposed||!this.outputReady||!this.output)return false;const r=this.renderer,oldTarget=r.getRenderTarget(),viewport=r.getViewport(new THREE.Vector4()),scissor=r.getScissor(new THREE.Vector4()),oldScissor=r.getScissorTest(),oldColor=r.getClearColor(new THREE.Color()).clone(),oldAlpha=r.getClearAlpha();try{this.passCalls=0;r.setScissorTest(false);r.setRenderTarget(null);r.setClearColor(0x080b0c,1);r.setViewport(0,0,r.domElement.width/r.getPixelRatio(),r.domElement.height/r.getPixelRatio());r.clear();const w=r.domElement.width/r.getPixelRatio(),h=r.domElement.height/r.getPixelRatio(),aspect=this.output.width/this.output.height,vw=Math.min(w,h*aspect),vh=vw/aspect;r.setViewport((w-vw)/2,(h-vh)/2,vw,vh);this.copyMaterial.uniforms.image.value=this.output.texture;this.draw(this.copyMaterial,null);return true;}finally{r.setRenderTarget(oldTarget);r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(oldScissor);r.setClearColor(oldColor,oldAlpha);}}
 /** Parameter previews keep the world fixed and never advance AF, exposure or capture evidence. */
 renderPausedPreview(baseCamera:THREE.PerspectiveCamera):boolean{
  if(!this.enabled||this.disposed)return false;
  if(!this.suspended||this.shot||!this.viewStatus.ready)return this.renderFrozen();
  return this.renderView(baseCamera,0,true);
 }
 /** No game/physics mutation occurs here; dt is the already-advanced simulation interval. */
 render(baseCamera:THREE.PerspectiveCamera,dt:number):boolean{return this.renderView(baseCamera,dt,false);}
 private renderView(baseCamera:THREE.PerspectiveCamera,dt:number,pausedPreview:boolean):boolean{
  try{return this.renderPreparedView(baseCamera,dt,pausedPreview);}catch{this.failView();return false;}
 }
 private failView(){this.message='相机画面暂时无法显示，请重新打开相机。';this.cancel();this.enabled=false;this.releaseTargets();this.emit();}
 private renderPreparedView(baseCamera:THREE.PerspectiveCamera,dt:number,pausedPreview:boolean):boolean{
  if(!this.enabled||this.disposed||this.suspended&&!pausedPreview)return false;this.passCalls=0;
  const delta=pausedPreview?0:clamp(Number.isFinite(dt)?dt:0,0,.1);this.elapsed+=delta;
  this.prepareView(baseCamera);
  const wasPending=this.shutterPending;this.advanceFocus(delta);
  const full=!!this.shot&&!this.shutterPending&&this.clock.state!=='timer',size=full?(this.shot!.size??=captureSize(this.options.mobile,this.low,this.shot!.settings.orientation==='portrait')):previewSize(this.previewMobile,previewTier(this.previewQuality,this.adaptiveRatio),this.settings.orientation==='portrait');this.allocate(...size,full);
  const r=this.renderer,oldTarget=r.getRenderTarget(),oldTone=r.toneMapping,oldAuto=r.autoClear,viewport=r.getViewport(new THREE.Vector4()),scissor=r.getScissor(new THREE.Vector4()),oldScissor=r.getScissorTest(),oldColor=r.getClearColor(new THREE.Color()).clone(),oldAlpha=r.getClearAlpha(),oldFog=this.scene.fog;r.toneMapping=THREE.NoToneMapping;r.autoClear=true;r.setScissorTest(false);if(oldFog instanceof THREE.Fog)this.scene.fog=new THREE.Fog(oldFog.color,180,390);
  const restoreGuides=full?hidePhotoGuides(this.scene):()=>{};
  try{
   r.setRenderTarget(this.sceneTarget);r.clear();r.render(this.scene,this.camera);this.sceneCalls=r.info.render.calls;this.sceneTriangles=r.info.render.triangles;
   const s=full?this.shot!.settings:this.settings,e=full?this.shot!.exposure:solveExposure(s,s.aeLock?this.lockedMeter:this.meter),depth=this.sceneTarget!.depthTexture;
   for(const m of[this.material,this.accumulationMaterial,this.previousMaterial]){const u=m.uniforms;u.image.value=this.sceneTarget!.texture;u.depthImage.value=depth;u.resolution.value.set(...size);u.nearPlane.value=this.camera.near;u.farPlane.value=this.camera.far;u.focusDistance.value=s.focusDistance;u.focalLength.value=s.focalLength;u.aperture.value=e.aperture;u.sensorWidth.value=s.orientation==='portrait'?24:36;u.useFocus.value=s.depthPreview||full?1:0;u.maxBlur.value=full?(this.options.mobile?64:90):(this.options.mobile?18:32);u.samples.value=full?(this.options.mobile?24:32):(this.options.mobile?16:24);}
   const weight=this.clock.tick(wasPending?0:delta);
   if(weight>0&&this.shot){
    const shot=this.shot,first=shot.meta.samples===0,accumulates=shot.exposure.shutter>=1/30;
    if(first){shot.firstCamera.copy(this.camera);shot.camera.copy(this.camera);}
    else if(!accumulates)shot.camera.copy(this.camera);
    shot.meta.resourcesComplete=shot.meta.resourcesComplete&&this.viewStatus.ready;shot.meta=capturePoseMeta(shot.firstCamera,this.camera,shot.meta);
    const evidence=this.options.captureEvidence?.(this.camera.clone(),{...shot.settings});
    if(evidence){shot.evidence=accumulates&&shot.evidence?mergeCaptureEvidence(shot.evidence,evidence):copyCaptureEvidence(evidence);if(accumulates&&shot.meta.unstable)shot.evidence.frameClear=false;}
    if(first)this.options.onExposureStarted?.({shotId:shot.id});
   }
   if(weight>0&&this.shot&&this.shot.exposure.shutter>=1/30){const next=1-this.a;this.accumulationMaterial.uniforms.accumulated.value=this.accumulation![this.a].texture;this.accumulationMaterial.uniforms.blend.value=weight/(this.accumulatedWeight+weight);this.draw(this.accumulationMaterial,this.accumulation![next]);this.a=next;this.accumulatedWeight+=weight;}
   const u=this.material.uniforms;this.viewProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.inverseMatrix.copy(this.viewProjection).invert();u.inverseViewProjection.value.copy(this.inverseMatrix);u.previousViewProjection.value.copy(this.previousMatrix);u.previous.value=this.previous!.texture;u.previousReady.value=this.previousReady?1:0;u.motionAmount.value=pausedPreview?0:clamp(e.shutter/Math.max(delta,1/120)*.45,0,.85);u.alreadyFocused.value=this.accumulatedWeight>0?1:0;if(this.accumulatedWeight>0)u.image.value=this.accumulation![this.a].texture;u.gain.value=e.gain;u.iso.value=e.iso;u.noiseSeed.value=full?this.shot!.id:this.elapsed;u.highlights.value=!full&&s.highlights?1:0;const k=s.whiteBalance==='auto'?null:s.whiteBalance==='daylight'?5500:s.whiteBalance==='cloudy'?6500:s.whiteBalance==='tungsten'?3200:s.kelvin;u.balance.value.copy(k?new THREE.Vector3(...whiteBalanceGain(k)):this.balance);
   u.magnify.value=!full&&s.magnify?5:1;
   this.draw(this.material,this.output);
   this.outputReady=true;
   this.copyMaterial.uniforms.image.value=this.output!.texture;r.setRenderTarget(null);r.setViewport(0,0,r.domElement.width/r.getPixelRatio(),r.domElement.height/r.getPixelRatio());r.setClearColor(0x080b0c,1);r.clear();const w=r.domElement.width/r.getPixelRatio(),h=r.domElement.height/r.getPixelRatio(),aspect=size[0]/size[1],vw=Math.min(w,h*aspect),vh=vw/aspect;r.setViewport((w-vw)/2,(h-vh)/2,vw,vh);this.draw(this.copyMaterial,null);
   this.draw(this.previousMaterial,this.previous);this.previousMatrix.copy(this.viewProjection);this.previousReady=true;this.sampleTime+=delta;if(this.sampleTime>.25&&!this.samplePending&&!this.shot){this.sampleTime=0;this.sampleMeter();}
   if(this.clock.state==='saving'&&this.shot&&!this.finishing){this.finishing=true;void this.finish(this.shot,this.output!);}
  }catch{this.failView();return false;}finally{restoreGuides();r.setRenderTarget(oldTarget);r.toneMapping=oldTone;r.autoClear=oldAuto;r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(oldScissor);r.setClearColor(oldColor,oldAlpha);this.scene.fog=oldFog;}
  this.publishTime+=delta;if(this.publishTime>.15){this.publishTime=0;this.emit();}return true;
 }
 private sampleMeter(){
  this.samplePending=true;this.meterMaterial.uniforms.image.value=this.sceneTarget!.texture;this.draw(this.meterMaterial,this.meterTarget);const pixels=new Uint8Array(32*24*4),displayPixels=new Uint8Array(32*24*4),token=this.serial,rawRead=this.renderer.readRenderTargetPixelsAsync(this.meterTarget,0,0,32,24,pixels);this.copyMaterial.uniforms.image.value=this.output!.texture;this.draw(this.copyMaterial,this.meterTarget);const displayRead=this.renderer.readRenderTargetPixelsAsync(this.meterTarget,0,0,32,24,displayPixels);void Promise.all([rawRead,displayRead]).then(()=>{
   if(this.disposed||!this.enabled||token!==this.serial)return;let weighted=0,total=0,red=0,green=0,blue=0;const histogram=Array(32).fill(0) as number[];
   for(let y=0;y<24;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4,dx=(x+.5)/32*2-1,dy=(y+.5)/24*2-1,r=pixels[i]/Math.max(1,255-pixels[i]),g=pixels[i+1]/Math.max(1,255-pixels[i+1]),b=pixels[i+2]/Math.max(1,255-pixels[i+2]),l=.2126*r+.7152*g+.0722*b;let w=.5+.5*Math.exp(-(dx*dx+dy*dy));if(this.settings.metering==='center')w=.15+Math.exp(-(dx*dx+dy*dy)*4);if(this.settings.metering==='spot')w=Math.hypot(dx-this.focusPoint.x,dy-this.focusPoint.y)<.14?1:0;weighted+=l*w;total+=w;if(l>.02&&l<2&&(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(.01,r,g,b)<.25){red+=r;green+=g;blue+=b;}const display=.2126*displayPixels[i]+.7152*displayPixels[i+1]+.0722*displayPixels[i+2];histogram[Math.min(31,Math.floor(display/256*32))]++;}
   if(total)this.meter=this.meter*.65+weighted/total*.35;const avg=(red+green+blue)/3;if(avg>0)this.balance.lerp(new THREE.Vector3(clamp(avg/Math.max(red,.0001),.5,2),clamp(avg/Math.max(green,.0001),.5,2),clamp(avg/Math.max(blue,.0001),.5,2)),.12);this.histogram=histogram;this.emit();
  }).catch(()=>{}).finally(()=>{this.samplePending=false;});
 }
 private async finish(shot:Capture,target:THREE.WebGLRenderTarget){
  this.message='正在保存照片';this.emit();try{const width=target.width,height=target.height,pixels=new Uint8Array(width*height*4);await this.renderer.readRenderTargetPixelsAsync(target,0,0,width,height,pixels);if(this.disposed||shot.id!==this.serial||this.shot!==shot)return;
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('浏览器无法导出照片');const image=ctx.createImageData(width,height);for(let y=0;y<height;y++)image.data.set(pixels.subarray(y*width*4,(y+1)*width*4),(height-y-1)*width*4);ctx.putImageData(image,0,0);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('照片编码失败')),`image/${shot.settings.format}`,.94));if(this.disposed||shot.id!==this.serial||this.shot!==shot)return;
   const record:PhotoRecord={id:crypto.randomUUID(),createdAt:new Date().toISOString(),kind:'virtual-photo',blob,width,height,settings:shot.settings,exposure:shot.exposure,position:shot.camera.position.toArray() as [number,number,number],quaternion:shot.camera.quaternion.toArray() as [number,number,number,number],captureMeta:{...shot.meta,eligible:shot.meta.eligible&&shot.meta.samples>0},captureEvidence:shot.evidence?copyCaptureEvidence(shot.evidence):undefined,storageStatus:'saved',software:'齐盛数字校园',camera:'虚拟 EOS 5D Mark II',lens:'虚拟 EF24–105mm f/4L IS USM'};
   const controller=new AbortController();this.saveController=controller;let stored=false;try{await savePhoto(record,controller.signal);stored=true;this.count++;this.message='照片已保存到本机相册。';}catch(error){if(shot.id!==this.serial||this.disposed)return;record.storageStatus='temporary';this.message='未保存，可从相册导出本次照片。';}
   if(shot.id!==this.serial||this.disposed){if(stored)await removePhoto(record.id).catch(()=>{});return;}this.saveController=null;this.lastId=record.id;this.lastRecord=stored?null:record;this.shot=null;this.finishing=false;this.clock.cancel();this.accumulatedWeight=0;shot.resolve(record);this.options.onCapture?.(record);this.emit();
  }catch(error){if(this.shot===shot){this.shot=null;this.finishing=false;this.clock.cancel();this.accumulatedWeight=0;this.message='照片未生成，请重新拍摄。';shot.reject(Error(this.message));this.emit();}}
 }
 dispose(){if(this.disposed)return;this.cancel();this.disposed=true;this.enabled=false;this.lastRecord=null;this.unwatch();this.releaseTargets();this.meterTarget.dispose();this.quad.geometry.dispose();for(const m of[this.material,this.accumulationMaterial,this.previousMaterial,this.meterMaterial,this.copyMaterial])m.dispose();this.screen.clear();}
}
