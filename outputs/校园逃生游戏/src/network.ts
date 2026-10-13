/** Release a stalled browser request without letting a late result leak its resources. */
export function withDeadline<T>(work:Promise<T>,milliseconds:number,options:{signal?:AbortSignal;onTimeout?:()=>void;onLate?:(value:T)=>void}={}):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);};
    const fail=(error:Error)=>{if(settled)return;settled=true;cleanup();reject(error);};
    const abort=()=>fail(new Error('资源请求已中止。'));
    const timer=setTimeout(()=>{fail(new Error('资源载入超时，请重试。'));options.onTimeout?.();},milliseconds);
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    work.then(value=>{if(settled){options.onLate?.(value);return;}settled=true;cleanup();resolve(value);},error=>{if(settled)return;settled=true;cleanup();reject(error);});
  });
}
