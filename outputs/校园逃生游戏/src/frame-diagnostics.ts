/** Bounded samples of whole RAF intervals and CPU work; no player-facing diagnostics. */
export class FrameDiagnostics {
 private intervals:number[]=[];
 private cpu:number[]=[];
 private phases=new Map<string,number[]>();
 private previous=0;
 private began=0;
 private longFrames=0;
 constructor(private capacity=600,private clock=()=>performance.now()){}
 begin(timestamp:number,active=true){
  if(active&&this.previous){const dt=timestamp-this.previous;this.push(this.intervals,dt);if(dt>50)this.longFrames++;}
  this.previous=active?timestamp:0;this.began=this.clock();
 }
 phase(name:string,elapsed:number){let values=this.phases.get(name);if(!values){values=[];this.phases.set(name,values);}this.push(values,elapsed);}
 end(){this.push(this.cpu,this.clock()-this.began);}
 reset(){this.intervals=[];this.cpu=[];this.phases.clear();this.previous=0;this.longFrames=0;}
 private push(values:number[],n:number){if(Number.isFinite(n)&&n>=0){values.push(n);if(values.length>this.capacity)values.shift();}}
 private stats(values:number[]){const sorted=[...values].sort((a,b)=>a-b),at=(p:number)=>sorted[Math.floor((sorted.length-1)*p)]??0;return {samples:sorted.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:0,p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1)??0};}
 snapshot(){return {frameIntervalMs:this.stats(this.intervals),frameCpuMs:this.stats(this.cpu),longFrames:this.longFrames,phases:Object.fromEntries([...this.phases].map(([name,values])=>[name,this.stats(values)]))};}
}
