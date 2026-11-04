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

export type RenderFrameLoad={cpuMs?:number;gpuMs?:number;thermalStatus?:number;powerSave?:boolean;lowMemory?:boolean};
/** Sustained frame time controls automatic quality, with a slower recovery. */
export class AdaptiveRenderQuality{
 scale=1;
 bottleneck:'cpu'|'gpu'|'thermal'|'none'|'unknown'='unknown';
 private elapsed=0;private frames=0;private stable=0;private manualSlow=0;private warned=false;
 private cpu=0;private cpuSamples=0;private gpu=0;private gpuSamples=0;
 reset(){this.scale=1;this.elapsed=this.frames=this.stable=this.manualSlow=0;this.cpu=this.cpuSamples=this.gpu=this.gpuSamples=0;this.warned=false;this.bottleneck='unknown';}
 observe(seconds:number,quality:GraphicsQuality,load:RenderFrameLoad={}):{changed:boolean;warn:boolean}{
  // Loading, suspension and isolated stalls remain in diagnostics, not the governor.
  if(!Number.isFinite(seconds)||seconds<=0||seconds>.1)return{changed:false,warn:false};
  const thermal=(load.thermalStatus??0)>=3,constrained=thermal||load.powerSave||load.lowMemory;
  if(quality==='auto'&&constrained){const ceiling=thermal?.7:.85;if(this.scale>ceiling){this.scale=ceiling;this.stable=0;this.bottleneck='thermal';return{changed:true,warn:false};}}
  this.elapsed+=seconds;this.frames++;
  if(Number.isFinite(load.cpuMs)&&load.cpuMs!>=0){this.cpu+=load.cpuMs!;this.cpuSamples++;}
  if(Number.isFinite(load.gpuMs)&&load.gpuMs!>=0){this.gpu+=load.gpuMs!;this.gpuSamples++;}
  if(this.elapsed<2)return{changed:false,warn:false};
  const fps=this.frames/this.elapsed,window=this.elapsed,cpu=this.cpuSamples?this.cpu/this.cpuSamples:undefined,gpu=this.gpuSamples?this.gpu/this.gpuSamples:undefined;
  this.elapsed=this.frames=this.cpu=this.cpuSamples=this.gpu=this.gpuSamples=0;
  this.bottleneck=cpu!==undefined&&cpu>=12&&(gpu===undefined||cpu>gpu*1.15)?'cpu':gpu!==undefined&&gpu>=15?'gpu':fps>=55?'none':'unknown';
  if(quality!=='auto'){
   this.stable=0;this.manualSlow=fps<45?this.manualSlow+window:0;
   const warn=quality!=='smooth'&&this.manualSlow>=9&&!this.warned;if(warn)this.warned=true;
   return{changed:false,warn};
  }
  this.manualSlow=0;
  if(fps<52){this.stable=0;if(this.bottleneck==='cpu')return{changed:false,warn:false};const next=Math.max(.7,this.scale-.1),changed=next!==this.scale;this.scale=next;return{changed,warn:false};}
  this.stable=fps>=57&&!constrained?this.stable+window:0;
  if(this.stable>=12&&this.scale<1){this.stable=0;this.scale=Math.min(1,this.scale+.05);return{changed:true,warn:false};}
  return{changed:false,warn:false};
 }
}
