import {DEFAULT_PHOTO_SETTINGS,type PhotoSettings,type PhotoExposure} from './types.ts';
export const APERTURES=[4,4.5,5,5.6,6.3,7.1,8,9,10,11,13,14,16,18,20,22];
export const SHUTTERS=[1/8000,1/6400,1/5000,1/4000,1/3200,1/2500,1/2000,1/1600,1/1250,1/1000,1/800,1/640,1/500,1/400,1/320,1/250,1/200,1/160,1/125,1/100,1/80,1/60,1/50,1/40,1/30,1/25,1/20,1/15,1/13,1/10,1/8,1/6,1/5,1/4,1/3,.4,.5,.6,.8,1,1.3,1.6,2,2.5,3.2,4,5,6,8,10,13,15,20,25,30];
export const ISOS=[100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200,4000,5000,6400];
export const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
export const nearest=(v:number,values:readonly number[])=>values.reduce((a,b)=>Math.abs(Math.log(b/v))<Math.abs(Math.log(a/v))?b:a,values[0]);
const finite=(v:number,other:number)=>Number.isFinite(v)?v:other;
export function normalizePhotoSettings(partial:Partial<PhotoSettings>,base:PhotoSettings=DEFAULT_PHOTO_SETTINGS):PhotoSettings{
 const s={...base,...partial};s.focalLength=clamp(finite(s.focalLength,24),24,105);s.aperture=nearest(clamp(finite(s.aperture,8),4,22),APERTURES);s.shutter=nearest(clamp(finite(s.shutter,1/125),1/8000,30),SHUTTERS);s.iso=nearest(clamp(finite(s.iso,100),100,6400),ISOS);s.focusDistance=clamp(finite(s.focusDistance,20),.45,2000);s.kelvin=Math.round(clamp(finite(s.kelvin,6500),2500,10000));s.compensation=clamp(finite(s.compensation,0),-2,2);s.programShift=clamp(finite(s.programShift,0),-3,3);if(s.mode==='M')s.autoISO=false;return s;
}
export function fieldOfView(focal:number,portrait=false){return 2*Math.atan((portrait?36:24)/(2*focal))*180/Math.PI;}
export const exposureGain=(t:number,iso:number,n:number)=>t*iso/(n*n)/.0125;
/** Linear luminance is measured before exposure. The scene is not a calibrated radiometer. */
export function solveExposure(settings:PhotoSettings,luminance:number):PhotoExposure{
 const s=normalizePhotoSettings(settings),l=clamp(luminance,.000001,100),target=.18/l*2**s.compensation;
 let n=s.aperture,t=s.shutter,iso=s.iso;
 const simple=s.interface==='simple',mode=simple?'P':s.mode,auto=mode!=='M'&&(simple||s.autoISO);
 if(mode==='P'){
  n=simple?(s.preset==='portrait'?4:s.preset==='motion'?5.6:8):nearest(clamp(8*2**(s.programShift/2),4,22),APERTURES);
  iso=auto?100:s.iso;t=target*.0125*n*n/iso;
  const handheld=simple&&s.preset==='motion'?1/500:1/(s.focalLength*1.5);
  if(auto&&t>handheld){iso=nearest(clamp(iso*t/handheld,100,6400),ISOS);t=target*.0125*n*n/iso;}
  t=nearest(clamp(t,1/8000,30),SHUTTERS);
 }else if(mode==='Av'){
  iso=auto?100:s.iso;t=target*.0125*n*n/iso;
  if(auto&&t>1/(s.focalLength*1.5)){iso=nearest(clamp(iso*t*s.focalLength*1.5,100,6400),ISOS);t=target*.0125*n*n/iso;}
  t=nearest(clamp(t,1/8000,30),SHUTTERS);
 }else if(mode==='Tv'){
  iso=auto?100:s.iso;n=Math.sqrt(t*iso/(target*.0125));
  if(auto&&n<4){iso=nearest(clamp(16*target*.0125/t,100,6400),ISOS);n=Math.sqrt(t*iso/(target*.0125));}
  n=nearest(clamp(n,4,22),APERTURES);
 }
 const gain=exposureGain(t,iso,n),meterEV=Math.log2(l*gain/.18),difference=mode==='M'?0:meterEV-s.compensation;
 return{aperture:n,shutter:t,iso,gain,meterEV,limited:Math.abs(difference)>.45};
}
/** Thin-lens circle of confusion, in output pixels, with metres converted consistently to mm. */
export function circleOfConfusion(f:number,n:number,s:number,z:number,width:number,portrait=false){const focus=Math.max(.45,s)*1000,depth=Math.max(.001,z)*1000;return f*f*Math.abs(depth-focus)/(n*depth*(focus-f))*width/(portrait?24:36);}
export function kelvinRGB(k:number):[number,number,number]{const t=clamp(k,2500,10000)/100;return[clamp(t<=66?255:329.698727446*(t-60)**-.1332047592,0,255)/255,clamp(t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*(t-60)**-.0755148492,0,255)/255,clamp(t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307,0,255)/255];}
export function whiteBalanceGain(k:number):[number,number,number]{const base=kelvinRGB(6500),v=kelvinRGB(k);return v.map((c,i)=>base[i]/Math.max(c,.08)) as [number,number,number];}
export function captureSize(mobile:boolean,low:boolean,portrait=false):[number,number]{const w=mobile?(low?1200:1536):2400,h=Math.round(w*2/3);return portrait?[h,w]:[w,h];}
/** RGBA16F scene + depth32 + two HDR accumulators + two RGBA8 outputs. */
export const photographyBufferBytes=(width:number,height:number)=>width*height*36+32*24*4;
export const shutterLabel=(s:number)=>s>=1?`${Number(s.toFixed(1))}″`:`1/${Math.round(1/s)}`;
export class ExposureClock{
 state:'idle'|'timer'|'exposing'|'saving'='idle';timer=0;elapsed=0;duration=0;
 start(timer:number,duration:number){if(this.state!=='idle')return false;this.timer=timer;this.duration=duration;this.elapsed=0;this.state=timer>0?'timer':'exposing';return true;}
 tick(dt:number){if(!Number.isFinite(dt)||dt<=0)return 0;if(this.state==='timer'){this.timer=Math.max(0,this.timer-dt);if(this.timer===0)this.state='exposing';return 0;}if(this.state!=='exposing')return 0;const weight=Math.min(dt,this.duration-this.elapsed);this.elapsed+=weight;if(this.elapsed>=this.duration)this.state='saving';return weight;}
 cancel(){this.state='idle';this.timer=0;this.elapsed=0;this.duration=0;}
}
