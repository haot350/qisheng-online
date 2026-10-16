import type {RenderProfile} from '@qisheng/shared/render-profile';
type RendererTarget={setPixelRatio:(ratio:number)=>void;shadowMap:{enabled:boolean;needsUpdate:boolean}};
type ShadowTarget={map:{dispose:()=>void}|null;mapSize:{x:number;set:(width:number,height:number)=>unknown}};
/** Both worlds apply exactly the same settings, including changes made mid-session. */
export function applyRendererProfile(renderer:RendererTarget,shadow:ShadowTarget,profile:RenderProfile){
 renderer.setPixelRatio(profile.pixelRatio);renderer.shadowMap.enabled=profile.shadows;
 if(shadow.mapSize.x!==profile.shadowSize){shadow.map?.dispose();shadow.map=null;shadow.mapSize.set(profile.shadowSize,profile.shadowSize);}
 renderer.shadowMap.needsUpdate=true;
}
