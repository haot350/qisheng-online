/** One bounded Redis read per polling interval, shared by all local HTTP waiters.
 * Other workers are observed from the store; local changes can wake it sooner.
 */
export class QueueLongPoll {
 private waiters=new Map<string,{raw:string;until:number;resolve:()=>void}>();
 private timer:ReturnType<typeof setTimeout>|null=null;
 private deadlineTimer:ReturnType<typeof setTimeout>|null=null;
 private polling:Promise<void>|null=null;
 private wakeRequested=false;
 private batchRequests=0;
 private keysRead=0;
 constructor(private readMany:(keys:string[])=>Promise<(string|null)[]>,private intervalMs=150,private limit=256,private now=Date.now,private readTimeoutMs=1500){}
 get size(){return this.waiters.size;}
 get diagnostics(){return{activeWaiters:this.size,batchRequests:this.batchRequests,keysRead:this.keysRead};}
 wait(id:string,raw:string,milliseconds:number){
  this.cancel(id);
  if(milliseconds<=0)return{done:Promise.resolve(),cancel:()=>{},accepted:true};
  if(this.size>=this.limit)return{done:Promise.resolve(),cancel:()=>{},accepted:false};
  let owned!:{raw:string;until:number;resolve:()=>void};
  const done=new Promise<void>(resolve=>{owned={raw,until:this.now()+Math.min(8000,milliseconds),resolve};this.waiters.set(id,owned);});
  this.schedule();this.scheduleDeadline();return{done,cancel:()=>{if(this.waiters.get(id)===owned)this.cancel(id);},accepted:true};
 }
 cancel(id:string){const waiter=this.waiters.get(id);if(!waiter)return;this.waiters.delete(id);waiter.resolve();if(!this.size&&this.timer){clearTimeout(this.timer);this.timer=null;}this.scheduleDeadline();}
 close(){for(const id of [...this.waiters.keys()])this.cancel(id);}
 wake(){if(!this.size)return;if(this.polling){this.wakeRequested=true;return;}if(this.timer){clearTimeout(this.timer);this.timer=null;}void this.poll();}
 private schedule(){if(this.timer||this.polling||!this.size)return;const deadline=Math.min(...[...this.waiters.values()].map(w=>w.until-this.now()));this.timer=setTimeout(()=>{this.timer=null;void this.poll();},Math.max(0,Math.min(this.intervalMs,deadline)));this.timer.unref?.();}
 private scheduleDeadline(){if(this.deadlineTimer)clearTimeout(this.deadlineTimer);this.deadlineTimer=null;if(!this.size)return;const until=Math.min(...[...this.waiters.values()].map(w=>w.until));this.deadlineTimer=setTimeout(()=>{this.deadlineTimer=null;for(const[id,w]of this.waiters)if(this.now()>=w.until)this.cancel(id);this.scheduleDeadline();},Math.max(0,until-this.now()));this.deadlineTimer.unref?.();}
 async poll(){
  if(this.polling)return this.polling;
  const entries=[...this.waiters.entries()];if(!entries.length)return;
  this.polling=(async()=>{
   try{
    this.batchRequests++;this.keysRead+=entries.length;
    let deadline:ReturnType<typeof setTimeout>|undefined;
    let rows:(string|null)[];
    try{rows=await Promise.race([this.readMany(entries.map(([id])=>'campus:queue:'+id)),new Promise<never>((_resolve,reject)=>{deadline=setTimeout(()=>reject(Error('QUEUE_READ_TIMEOUT')),this.readTimeoutMs);})]);}finally{if(deadline)clearTimeout(deadline);}
    for(const [index,[id,waiter]]of entries.entries()){
     if(this.waiters.get(id)!==waiter)continue;
     let terminal=true;try{const row=rows[index]?JSON.parse(rows[index]!):null;terminal=!row||!['waiting','reserving'].includes(row.status)||JSON.parse(waiter.raw).tokenHash!==row.tokenHash;}catch{}
     if(terminal||this.now()>=waiter.until)this.cancel(id);
    }
   }catch{
    // Complete this batch so Express can perform its normal fresh, authenticated
    // response read rather than keeping sockets indefinitely on a store error.
    for(const [id,waiter]of entries)if(this.waiters.get(id)===waiter)this.cancel(id);
   }
  })();
  try{await this.polling;}finally{this.polling=null;if(this.wakeRequested){this.wakeRequested=false;this.wake();}else this.schedule();}
 }
}
