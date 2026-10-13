/** Releases only the input owned by this pointer, including cancel/lost-capture. */
export function releaseOwnedPointer(owner:{current:number|null},event:{pointerId:number},release:()=>void):boolean{
  if(owner.current!==event.pointerId)return false;
  owner.current=null;release();return true;
}

export const INPUT_RESET_EVENT='qisheng-input-reset';
export type PointerPosition={pointerId:number;clientX:number;clientY:number;pointerType?:string;buttons?:number};
type CaptureTarget={setPointerCapture?:(id:number)=>void;releasePointerCapture?:(id:number)=>void;hasPointerCapture?:(id:number)=>boolean};
type OwnedTouch={pointerId:number;target:CaptureTarget;release:(cancelled:boolean,event?:PointerPosition)=>void;move?:(event:PointerPosition)=>void};

/** One session owns every touch in a control group, including uncaptured touches. */
export class PointerSession {
  private owners=new Map<string,OwnedTouch>();
  private enabled=true;
  begin(key:string,event:PointerPosition&{currentTarget:CaptureTarget},release:OwnedTouch['release'],move?:OwnedTouch['move']){
    if(!this.enabled||this.owners.has(key)||[...this.owners.values()].some(owner=>owner.pointerId===event.pointerId))return false;
    const owner={pointerId:event.pointerId,target:event.currentTarget,release,move};this.owners.set(key,owner);
    // Capture is optional. Window/document listeners still own the touch if Safari rejects it.
    try{owner.target.setPointerCapture?.(event.pointerId);}catch{}
    return true;
  }
  owns(key:string,pointerId:number){return this.owners.get(key)?.pointerId===pointerId;}
  move(event:PointerPosition){
    if(!this.enabled)return;
    for(const [key,owner] of this.owners)if(owner.pointerId===event.pointerId){
      if(event.pointerType==='mouse'&&event.buttons===0)this.release(key,true);
      else owner.move?.(event);
      return;
    }
  }
  releasePointer(pointerId:number,cancelled=false,event?:PointerPosition){
    for(const [key,owner] of this.owners)if(owner.pointerId===pointerId){this.release(key,cancelled,event);return;}
  }
  release(key:string,cancelled=true,event?:PointerPosition){
    const owner=this.owners.get(key);if(!owner)return;
    this.owners.delete(key);
    // Remove ownership before releasing capture: lostpointercapture can fire synchronously.
    try{if(owner.target.hasPointerCapture?.(owner.pointerId)!==false)owner.target.releasePointerCapture?.(owner.pointerId);}catch{}
    owner.release(cancelled,event);
  }
  clear(){for(const key of [...this.owners.keys()])this.release(key,true);}
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.clear();}
  get size(){return this.owners.size;}
}

/** Capture-phase fallbacks survive overlays, a failed capture and pointer-up outside the button. */
export function listenPointerSession(session:PointerSession,win:EventTarget&{innerWidth?:number;innerHeight?:number},doc:EventTarget&{hidden?:boolean}){
  const up=(event:Event)=>session.releasePointer((event as unknown as PointerPosition).pointerId,false,event as unknown as PointerPosition);
  const cancel=(event:Event)=>session.releasePointer((event as unknown as PointerPosition).pointerId,true,event as unknown as PointerPosition);
  const move=(event:Event)=>session.move(event as unknown as PointerPosition);
  const clear=()=>session.clear();
  const visibility=()=>{if(doc.hidden)clear();};
  const resize=()=>{if((win.innerHeight??0)>(win.innerWidth??0))clear();};
  const listeners:[EventTarget,string,EventListener,boolean][]=[
    [win,'pointermove',move,true],
    ...[win,doc].flatMap(target=>[[target,'pointerup',up,true],[target,'pointercancel',cancel,true],[target,'lostpointercapture',cancel,true]] as [EventTarget,string,EventListener,boolean][]),
    [win,'blur',clear,true],[win,'pagehide',clear,true],[win,'orientationchange',clear,true],[win,'resize',resize,true],
    [doc,'visibilitychange',visibility,true],[doc,INPUT_RESET_EVENT,clear,true],
  ];
  for(const [target,name,listener,capture] of listeners)target.addEventListener(name,listener,{capture});
  return()=>{session.clear();for(const [target,name,listener,capture] of listeners)target.removeEventListener(name,listener,{capture});};
}
