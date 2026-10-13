type Job={priority:number;start:()=>void};
/** Downloads may overlap; scene decoding yields between files instead of bunching together. */
export class MapDecodeQueue {
 private jobs:Job[]=[];private active=false;
 private completed=0;private cancelled=0;private totalMs=0;private longestMs=0;
 run<T>(work:()=>Promise<T>,signal:AbortSignal,priority=3):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
   const abort=()=>{const i=this.jobs.indexOf(job);if(i>=0){this.jobs.splice(i,1);this.cancelled++;reject(new DOMException('Cancelled','AbortError'));}};
   const job:Job={priority,start:()=>{signal.removeEventListener('abort',abort);this.active=true;setTimeout(async()=>{const began=performance.now();try{if(signal.aborted)throw new DOMException('Cancelled','AbortError');resolve(await work());this.completed++;}catch(e){reject(e);}finally{const elapsed=performance.now()-began;this.totalMs+=elapsed;this.longestMs=Math.max(this.longestMs,elapsed);this.active=false;this.pump();}},0);}};
   if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}signal.addEventListener('abort',abort,{once:true});this.jobs.push(job);this.pump();
  });
 }
 private pump(){if(this.active)return;this.jobs.sort((a,b)=>a.priority-b.priority);this.jobs.shift()?.start();}
 diagnostics(){return {pending:this.jobs.length,active:this.active,completed:this.completed,cancelled:this.cancelled,totalMs:this.totalMs,longestMs:this.longestMs};}
}
