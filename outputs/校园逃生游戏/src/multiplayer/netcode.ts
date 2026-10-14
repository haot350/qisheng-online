import type {PlayerState,Vec3} from './shared/protocol';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const HZ=60;
/** Monotonic clock estimate shared by prediction, interpolation and shot rewind. */
export class OnlineClock {
 private anchorTick=0;private anchorAt=0;private initialized=false;private previousTick=0;private previousAt=0;private jitter=0;private latency=80;private delay=100;private lastRender=-Infinity;private lastServer=-Infinity;discontinuities=0;
 observe(tick:number,now:number,rtt=this.latency){if(!Number.isFinite(tick)||!Number.isFinite(now))return;this.latency=clamp(rtt,0,1000);if(this.initialized&&tick<=this.previousTick)return;
  if(this.initialized){const variation=Math.abs((now-this.previousAt)-(tick-this.previousTick)*1000/HZ);this.jitter+=(Math.min(200,variation)-this.jitter)*.15;this.delay+=(clamp(75+this.jitter*2.5,75,150)-this.delay)*.15;}
  const candidate=tick+this.latency*HZ/2000,estimate=this.initialized?this.serverTick(now):candidate;
  // Delayed bursts may not move the clock backwards. Large reconnect gaps explicitly rebase.
  const discontinuity=this.initialized&&Math.abs(candidate-estimate)>30;
  if(discontinuity){this.discontinuities++;this.lastServer=-Infinity;}
  this.anchorTick=!this.initialized||discontinuity?candidate:estimate+clamp(candidate-estimate,-.25,.25);this.anchorAt=now;this.previousTick=tick;this.previousAt=now;this.initialized=true;
 }
 setRtt(rtt:number){if(Number.isFinite(rtt))this.latency=clamp(rtt,0,1000);}
 serverTick(now:number){const estimate=this.anchorTick+Math.max(0,now-this.anchorAt)*HZ/1000;this.lastServer=Math.max(this.lastServer,estimate);return this.lastServer;}
 renderTick(now:number){const candidate=this.serverTick(now)-this.latency*HZ/2000-this.delay*HZ/1000;this.lastRender=Math.max(this.lastRender,candidate);return this.lastRender;}
 predictionTick(now:number){return Math.ceil(this.serverTick(now)+this.latency*HZ/2000+2);}
 reset(tick:number,now:number){this.initialized=false;this.lastRender=this.lastServer=-Infinity;this.observe(tick,now,this.latency);}
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
 offset:Vec3=[0,0,0];hardResets=0;collisionCuts=0;samples:number[]=[];lastReason='none';
 add(before:Vec3,after:Vec3,teleport=false,reason='authority'){const delta=before.map((x,i)=>x-after[i]) as Vec3,length=Math.hypot(...delta);this.lastReason=reason;this.samples.push(length);if(this.samples.length>600)this.samples.shift();if(teleport||length>8){this.offset=[0,0,0];this.hardResets++;this.lastReason=teleport?'generation':'severe-desync';return;}this.offset=this.offset.map((x,i)=>x+delta[i]) as Vec3;}
 update(dt:number,visible:(offset:Vec3)=>boolean){const scale=Math.exp(-Math.max(0,dt)*14);this.offset=this.offset.map(x=>x*scale) as Vec3;if(Math.hypot(...this.offset)<.002){this.offset=[0,0,0];return this.offset;}if(!visible(this.offset)){
   // Keep the longest safe display segment rather than dropping all smoothing.
   this.collisionCuts++;this.lastReason='collision-clamp';let low=0,high=1;for(let i=0;i<6;i++){const mid=(low+high)/2;if(visible(this.offset.map(x=>x*mid) as Vec3))low=mid;else high=mid;}
   const removed=Math.hypot(...this.offset)*(1-low);this.offset=this.offset.map(x=>x*low) as Vec3;if(removed>.25)this.hardResets++;
  }return this.offset;}
 clear(){this.offset=[0,0,0];}
}
/** Bounded recipient-private evidence. No enemy positions, credentials or persistence. */
type ConnectionTraceEntry={at:number;kind:string;data:Record<string,number|string|boolean>};
export class ConnectionTrace {
 private entries:ConnectionTraceEntry[]=[];
 private incidents:{at:number;until:number;trigger:string;entries:ConnectionTraceEntry[]}[]=[];
 record(kind:string,data:Record<string,number|string|boolean>,now=performance.now()){
  const entry={at:now,kind,data:{...data}};this.entries.push(entry);while(this.entries.length>240||this.entries[0]?.at<now-2000)this.entries.shift();
  for(const incident of this.incidents)if(now<=incident.until){incident.entries.push(entry);if(incident.entries.length>400)incident.entries.shift();}
  const trigger=kind==='authority-correction'&&Number(data.distance)>.25||kind==='rebase-request'||kind==='long-frame';
  if(trigger&&!this.incidents.some(incident=>now<=incident.until)){this.incidents.push({at:now,until:now+2000,trigger:kind,entries:[...this.entries]});while(this.incidents.length>3)this.incidents.shift();}
 }
 read(){return this.entries.slice(-120).map(e=>({...e,data:{...e.data}}));}
 evidence(){return{recent:this.read(),incidents:this.incidents.map(i=>({...i,entries:i.entries.map(e=>({...e,data:{...e.data}}))}))};}
}
export function predictedAim(authority:Pick<PlayerState,'life'|'sliding'>,intent:boolean,active:boolean){return authority.life==='alive'&&active&&!authority.sliding&&intent;}
