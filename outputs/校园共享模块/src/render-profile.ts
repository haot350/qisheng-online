export type GraphicsQuality='auto'|'smooth'|'high'|'ultra';
export type RenderDevice={mobile:boolean;pixelRatio:number};
export type RenderProfile={pixelRatio:number;shadows:boolean;shadowSize:number;low:boolean;mobileTextures:boolean;previewMobile:boolean;label:string};

/** Rendering policy is independent from the player's chosen input controls. */
export function resolveRenderProfile(quality:GraphicsQuality,device:RenderDevice,autoScale=1):RenderProfile{
 const native=Number.isFinite(device.pixelRatio)?Math.max(.5,device.pixelRatio):1;
 const scale=Math.max(.7,Math.min(1,Number.isFinite(autoScale)?autoScale:1));
 const low=quality==='smooth'||quality==='auto'&&(device.mobile||scale<.85);
 const ceiling=quality==='ultra'?2:quality==='high'?(device.mobile?1.5:1.6):quality==='smooth'?.8:(device.mobile?1:1.5)*scale;
 return{pixelRatio:Math.min(native,ceiling),shadows:!low,shadowSize:quality==='ultra'?2048:1024,low,mobileTextures:quality==='smooth'||quality==='auto'&&device.mobile,previewMobile:quality==='smooth'||quality==='auto'&&device.mobile,label:quality==='ultra'?'超清画面':quality==='high'?'高清画面':quality==='smooth'?'优先流畅':low?'自动 · 流畅':'自动调整'};
}

/** Three-second windows and a longer recovery delay prevent quality oscillation. */
export class AdaptiveRenderQuality{
 scale=1;
 private elapsed=0;private frames=0;private stable=0;private manualSlow=0;private warned=false;
 reset(){this.scale=1;this.elapsed=this.frames=this.stable=this.manualSlow=0;this.warned=false;}
 observe(seconds:number,quality:GraphicsQuality):{changed:boolean;warn:boolean}{
  if(!Number.isFinite(seconds)||seconds<=0||seconds>.5)return{changed:false,warn:false};
  this.elapsed+=seconds;this.frames++;
  if(this.elapsed<3)return{changed:false,warn:false};
  const fps=this.frames/this.elapsed,window=this.elapsed;this.elapsed=this.frames=0;
  if(quality!=='auto'){
   this.stable=0;this.manualSlow=fps<27?this.manualSlow+window:0;
   const warn=quality!=='smooth'&&this.manualSlow>=9&&!this.warned;if(warn)this.warned=true;
   return{changed:false,warn};
  }
  this.manualSlow=0;
  if(fps<27){this.stable=0;const next=Math.max(.7,this.scale-.15),changed=next!==this.scale;this.scale=next;return{changed,warn:false};}
  this.stable=fps>=50?this.stable+window:0;
  if(this.stable>=12&&this.scale<1){this.stable=0;this.scale=Math.min(1,this.scale+.1);return{changed:true,warn:false};}
  return{changed:false,warn:false};
 }
}
