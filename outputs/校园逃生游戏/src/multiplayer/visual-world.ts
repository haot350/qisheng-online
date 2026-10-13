import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {ChunkStreamer,combatStructure,type PhotoView} from '../streaming';
import {SceneResources} from '../resources';
import {escapeFloorAt} from '../escape-floor';
import {withDeadline} from '../network';
import {gameMapSession} from '../game-map';
import {MapDecodeQueue} from '../map-decode';
import {MapScenePreparer,type MapRenderContext} from '../map-scene-preparer';
import type {MapManifest,Vec3} from '../types';

/** Visual ownership is independent from authoritative and predicted physics. */
export class OnlineVisualWorld {
 readonly root=new THREE.Group();
 private resources=new SceneResources(true);
 private decode=new MapDecodeQueue();
 private preparer:MapScenePreparer;
 private point:Vec3=[0,0,0];
 private low=false;
 private alive=true;
 readonly streamer:ChunkStreamer<THREE.Group>;
 constructor(readonly manifest:MapManifest,scene:THREE.Scene,context?:MapRenderContext){
  scene.add(this.root);this.root.name='online-campus';this.preparer=new MapScenePreparer(scene,context);
  this.streamer=new ChunkStreamer(manifest.chunks,async(chunk,signal,priority)=>{
   const manager=new THREE.LoadingManager(),loader=new GLTFLoader(manager),abort=()=>manager.abort();loader.setMeshoptDecoder(MeshoptDecoder);
   signal.addEventListener('abort',abort,{once:true});
   try{
    const bytes=await gameMapSession.read(chunk.url,{signal,priority});
    const asset=await withDeadline(this.decode.run(()=>loader.parseAsync(bytes,new URL('.',new URL(chunk.url,location.href)).href),signal,priority),30000,{signal,onLate:g=>{this.resources.retain(g.scene);this.resources.release(g.scene);}});
    const root=asset.scene;this.resources.retain(root);
    try{
     if(signal.aborted||!this.alive)throw new DOMException('Cancelled','AbortError');
     await this.preparer.prepare(root,signal,priority);
     if(signal.aborted||!this.alive)throw new DOMException('Cancelled','AbortError');
     root.visible=false;this.root.add(root);return root;
    }catch(error){this.resources.release(root);throw error;}
   }finally{signal.removeEventListener('abort',abort);}
  },asset=>this.resources.release(asset));
 }
 async initialize(point:Vec3,progress:(p:number)=>void,signal?:AbortSignal){await this.streamer.initialize(point,progress,signal);}
 prepareCombatViews(views:PhotoView[],signal:AbortSignal,progress?:(p:number)=>void){this.streamer.setCombatViews(views);return this.streamer.prepareCombat(signal,progress);}
 /** Once per animation frame; physics uses checkSafety instead. */
 update(point:Vec3,low:boolean,view:PhotoView|null,next?:PhotoView){
  this.point=[...point];this.low=low;
  if(!this.streamer.hasCombatLease())this.streamer.setCombatViews(view?[view,...(next?[next]:[])]:null);
  return this.streamer.update(point,[],low,this.manifest.floors||[]);
 }
 checkSafety(point:Vec3,low:boolean){return this.streamer.checkSafety(point,low,this.manifest.floors||[]);}
 /** Final camera FOV and position determine rendering, never the resident lease. */
 presentViews(view:PhotoView|null,next?:PhotoView){
  this.streamer.setCombatViews(view?[view,...(next?[next]:[])]:null);
  const floor=this.floor(this.point),inside=(this.manifest.floors||[]).some(f=>this.point[0]>=f.bounds.min[0]&&this.point[0]<=f.bounds.max[0]&&this.point[2]>=f.bounds.min[2]&&this.point[2]<=f.bounds.max[2]);
  this.streamer.forEach((asset,chunk,distance)=>{
   const allowed=!chunk.floor||!floor||(inside?Math.abs(chunk.floor-floor)<=1:chunk.floor===1);
   asset.visible=this.streamer.hasCombatLease()&&combatStructure(chunk)?this.streamer.inCombatView(chunk.url):this.streamer.inCombatView(chunk.url)||allowed&&distance<(chunk.kind==='interior'?19:this.low?60:75);
   const shadow=asset.visible&&distance<45;
   if(asset.userData.onlineShadow!==shadow){asset.userData.onlineShadow=shadow;asset.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=shadow&&!!o.userData.campusShadowCaster;});}
  });
 }
 diagnostics(){return {...this.streamer.diagnostics(),gpu:this.preparer.diagnostics(),decode:this.decode.diagnostics(),resources:this.resources.diagnostics()};}
 floor(point:Vec3){return escapeFloorAt(point,this.manifest.floors);}
 retry(){this.streamer.retry();this.streamer.retryView();}
 dispose(){this.alive=false;this.preparer.dispose();this.streamer.dispose();this.root.removeFromParent();}
}
