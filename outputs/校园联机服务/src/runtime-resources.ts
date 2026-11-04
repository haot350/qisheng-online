import os from 'node:os';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
export type ResourceSample={source:'cgroup-v2'|'host';cpuPercent:number;memAvailable:number;effectiveCpuCores:number;memoryLimit:number|null;memoryPressureLimit:number|null};
type CpuTime={user:number;nice:number;sys:number;idle:number;irq:number};
type Dependencies={read:(file:string)=>Promise<string>;platform:()=>string;cpus:()=>{times:CpuTime}[];free:()=>number;now:()=>number;cgroupRoot:string;membership:string};
const defaults:Dependencies={read:f=>readFile(f,'utf8'),platform:()=>os.platform(),cpus:()=>os.cpus(),free:()=>os.freemem(),now:()=>performance.now(),cgroupRoot:'/sys/fs/cgroup',membership:'/proc/self/cgroup'};
const limit=(s:string|undefined,allowZero=false)=>{if(!s||s.trim()==='max')return null;const n=Number(s.trim());return Number.isFinite(n)&&(allowZero?n>=0:n>0)?n:null;};
const value=(s:string|undefined)=>{const n=Number(s?.trim());return Number.isFinite(n)&&n>=0?n:null;};
export class ResourceMonitor{
 private d:Dependencies;private hostPrevious:CpuTime[]=[];private previousTime:number|null=null;private usages=new Map<string,number>();
 constructor(overrides:Partial<Dependencies>={}){this.d={...defaults,...overrides};}
 async sample():Promise<ResourceSample>{
  const d=this.d,cpus=d.cpus(),time=d.now(),hostCount=Math.max(1,cpus.length);let idle=0,total=0;
  cpus.forEach((c,i)=>{const old=this.hostPrevious[i]??c.times;idle+=c.times.idle-old.idle;for(const k of Object.keys(c.times) as (keyof CpuTime)[])total+=c.times[k]-old[k];});this.hostPrevious=cpus.map(c=>({...c.times}));
  const hostCpu=total>0?Math.max(0,Math.min(100,100*(1-idle/total))):0;
  const fallback:ResourceSample={source:'host',cpuPercent:hostCpu,memAvailable:d.free(),effectiveCpuCores:hostCount,memoryLimit:null,memoryPressureLimit:null};
  const elapsed=this.previousTime===null?0:time-this.previousTime;this.previousTime=time;
  if(d.platform()!=='linux')return fallback;
  let location:string;try{const raw=await d.read(d.membership);const row=raw.split('\n').find(v=>v.startsWith('0::/'));if(!row)return fallback;location=row.slice(3);}catch{return fallback;}
  const root=path.posix.resolve(d.cgroupRoot),leaf=path.posix.resolve(root,'.'+location);if(leaf!==root&&!leaf.startsWith(root+'/'))return fallback;
  const scopes:string[]=[];for(let p=leaf;scopes.length<64;){scopes.push(p);if(p===root)break;const next=path.posix.dirname(p);if(next===p)return fallback;p=next;}
  if(scopes.at(-1)!==root)return fallback;
  const read=async(f:string)=>{try{return await d.read(f);}catch{return undefined;}};
  const readings=await Promise.all(scopes.map(async p=>({p,values:await Promise.all(['cpu.max','cpu.stat','memory.current','memory.high','memory.max'].map(n=>read(p+'/'+n)))})));
  let cores=hostCount,headroom=d.free(),hard:number|null=null,pressure:number|null=null,cpu:number|null=null,found=false;const nextUsages=new Map<string,number>();
  for(const {p,values:[cpuMax,stat,current,high,max]}of readings){
   const used=value(current),hardHere=limit(max,true),highHere=limit(high,true),pressureHere=hardHere===null?highHere:highHere===null?hardHere:Math.min(hardHere,highHere);
   if(used!==null&&pressureHere!==null){headroom=Math.min(headroom,Math.max(0,pressureHere-used));pressure=pressure===null?pressureHere:Math.min(pressure,pressureHere);found=true;}
   if(hardHere!==null)hard=hard===null?hardHere:Math.min(hard,hardHere);
   if(cpuMax){const [quotaRaw,periodRaw]=cpuMax.trim().split(/\s+/),quota=limit(quotaRaw),period=limit(periodRaw);if(quota!==null&&period!==null){const available=quota/period;cores=Math.min(cores,available);found=true;const usage=value(stat?.match(/^usage_usec\s+(\d+)$/m)?.[1]);if(usage!==null){nextUsages.set(p,usage);const old=this.usages.get(p);if(old!==undefined&&usage>=old&&elapsed>0){const percent=(usage-old)/(elapsed*1000*available)*100;cpu=Math.max(cpu??0,percent);}}}}
  }
  this.usages=nextUsages;
  if(!found)return fallback;
  return {source:'cgroup-v2',cpuPercent:Math.max(0,Math.min(100,cpu??hostCpu)),memAvailable:headroom,effectiveCpuCores:cores,memoryLimit:hard,memoryPressureLimit:pressure};
 }
}
