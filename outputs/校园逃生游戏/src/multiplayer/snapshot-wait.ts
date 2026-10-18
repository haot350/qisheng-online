export interface SnapshotSource<T> {read:()=>T|null;subscribe:(listener:()=>void)=>()=>void;}
/** Subscribe before reading so the initial state cannot fall between the two. */
export function waitForSnapshot<T>(source:SnapshotSource<T>,accept:(snapshot:T)=>boolean,signal:AbortSignal,timeoutMs:number,timeoutError:()=>Error):Promise<T>{
 return new Promise((resolve,reject)=>{
  let settled=false,off=()=>{};
  const finish=(run:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);off();signal.removeEventListener('abort',cancel);run();};
  const cancel=()=>finish(()=>reject(new DOMException('Cancelled','AbortError')));
  const check=()=>{const value=source.read();if(value&&accept(value))finish(()=>resolve(value));};
  const timer=setTimeout(()=>finish(()=>reject(timeoutError())),timeoutMs);
  signal.addEventListener('abort',cancel,{once:true});
  off=source.subscribe(check);if(settled)off();
  if(signal.aborted)cancel();else check();
 });
}
