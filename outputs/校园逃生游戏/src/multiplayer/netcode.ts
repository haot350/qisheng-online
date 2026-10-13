import type {PlayerState,Vec3} from './shared/protocol';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const HZ=60;
/** Monotonic clock estimate shared by prediction, interpolation and shot rewind. */
export class OnlineClock {
 private anchorTick=0;private anchorAt=0;private initialized=false;private previousTick=0;private previousAt=0;private jitter=0;private latency=80;private delay=100;private lastRender=-Infinity;
 observe(tick:number,now:number,rtt=this.latency){if(!Number.isFinite(tick)||!Number.isFinite(now))return;this.latency=clamp(rtt,0,1000);if(this.initialized&&tick<=this.previousTick)return;
  if(this.initialized){const variation=Math.abs((now-this.previousAt)-(tick-this.previousTick)*1000/HZ);this.jitter+=(Math.min(200,variation)-this.jitter)*.15;this.delay+=(clamp(75+this.jitter*2.5,75,150)-this.delay)*.15;}
  const candidate=tick+this.latency*HZ/2000,estimate=this.initialized?this.serverTick(now):candidate;
  // Delayed bursts may not move the clock backwards. Large reconnect gaps explicitly rebase.
  this.anchorTick=!this.initialized||Math.abs(candidate-estimate)>30?candidate:Math.max(estimate-1,candidate);this.anchorAt=now;this.previousTick=tick;this.previousAt=now;this.initialized=true;
 }
 setRtt(rtt:number){if(Number.isFinite(rtt))this.latency=clamp(rtt,0,1000);}
 serverTick(now:number){return this.anchorTick+Math.max(0,now-this.anchorAt)*HZ/1000;}
 renderTick(now:number){const candidate=this.serverTick(now)-this.latency*HZ/2000-this.delay*HZ/1000;this.lastRender=Math.max(this.lastRender,candidate);return this.lastRender;}
 predictionTick(now:number){return Math.ceil(this.serverTick(now)+this.latency*HZ/2000+2);}
 reset(tick:number,now:number){this.initialized=false;this.lastRender=-Infinity;this.observe(tick,now,this.latency);}
 get interpolationMs(){return this.delay;}
 get rttMs(){return this.latency;}
 get jitterMs(){return this.jitter;}
}
interface Spatial {position:Vec3;yaw:number;generation:number;velocity?:Vec3;pitch?:number;}
type Sample<T>={tick:number;value:T};
/** Time-based interpolation. Hidden entities are removed immediately by the caller. */
export class SnapshotBuffer<T extends Spatial> {
 private frames:Sample<T>[]=[];
 push(tick:number,value:T){if(!Number.isFinite(tick))return;const last=this.frames.at(-1);if(last&&tick<=last.tick)return;if(last&&value.generation!==last.value.generation)this.frames=[];this.frames.push({tick,value:{...value,position:[...value.position],...(value.velocity?{velocity:[...value.velocity]}:{})} as T});if(this.frames.length>24)this.frames.shift();}
 sample(tick:number):T|null{const frames=this.frames;if(!frames.length)return null;let a=frames[0],b:Sample<T>|undefined;for(const f of frames){if(f.tick<=tick)a=f;else{b=f;break;}}
  if(b){const t=clamp((tick-a.tick)/Math.max(1,b.tick-a.tick),0,1),angle=Math.atan2(Math.sin(b.value.yaw-a.value.yaw),Math.cos(b.value.yaw-a.value.yaw));return{...a.value,position:a.value.position.map((v,i)=>v+(b!.value.position[i]-v)*t) as Vec3,yaw:a.value.yaw+angle*t,pitch:a.value.pitch===undefined?undefined:a.value.pitch+((b.value.pitch??a.value.pitch)-a.value.pitch)*t} as T;}
  const seconds=clamp((tick-a.tick)/HZ,0,.1),velocity=a.value.velocity??[0,0,0];return{...a.value,position:a.value.position.map((v,i)=>v+velocity[i]*seconds) as Vec3} as T;
 }
 clear(){this.frames=[];}
 get size(){return this.frames.length;}
}
/** Display-only correction; simulation always uses authoritative collision state. */
export class PresentationCorrection {
 offset:Vec3=[0,0,0];hardResets=0;samples:number[]=[];
 add(before:Vec3,after:Vec3,teleport=false){const delta=before.map((x,i)=>x-after[i]) as Vec3,length=Math.hypot(...delta);if(teleport||length>8){this.offset=[0,0,0];this.hardResets++;return;}this.offset=this.offset.map((x,i)=>x+delta[i]) as Vec3;this.samples.push(length);if(this.samples.length>600)this.samples.shift();}
 update(dt:number,visible:(offset:Vec3)=>boolean){const scale=Math.exp(-Math.max(0,dt)*14);this.offset=this.offset.map(x=>x*scale) as Vec3;if(!visible(this.offset))this.offset=[0,0,0];return this.offset;}
 clear(){this.offset=[0,0,0];}
}
export function predictedAim(authority:Pick<PlayerState,'life'|'sliding'>,intent:boolean,active:boolean){return authority.life==='alive'&&active&&!authority.sliding&&intent;}
