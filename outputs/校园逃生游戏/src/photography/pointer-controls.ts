import {PointerSession,type PointerPosition} from '../pointer-owner.ts';

export const PHOTO_POINTER_KEYS={shutter:'photo:shutter',composition:'photo:composition',focus:'photo:focus',move:'photo:move'} as const;
type PhotoTarget={setPointerCapture?:(id:number)=>void;releasePointerCapture?:(id:number)=>void;hasPointerCapture?:(id:number)=>boolean;getBoundingClientRect:()=>{left:number;top:number;width:number;height:number}};
type PhotoPointer=PointerPosition&{currentTarget:PhotoTarget;button?:number;preventDefault:()=>void};
type PhotoClick={detail:number;preventDefault:()=>void};

/** Touch release is checked at its actual position, including a window-level fallback. */
export function createShutterPointerHandlers(session:PointerSession,capture:()=>void,enabled:()=>boolean){
 let suppressPointerClick=false;
 return{
  onPointerDown:(event:PhotoPointer)=>{
   if(event.pointerType==='mouse'){suppressPointerClick=false;return;}
   if((event.pointerType!=='touch'&&event.pointerType!=='pen')||!enabled())return;
   event.preventDefault();suppressPointerClick=true;const target=event.currentTarget;
   session.begin(PHOTO_POINTER_KEYS.shutter,event,(cancelled,up)=>{
    suppressPointerClick=true;if(cancelled||!up||!enabled())return;
    const box=target.getBoundingClientRect();
    if(up.clientX>=box.left&&up.clientX<box.left+box.width&&up.clientY>=box.top&&up.clientY<box.top+box.height)capture();
   });
  },
  onPointerUp:(event:PhotoPointer)=>{if(event.pointerType!=='mouse')event.preventDefault();session.releasePointer(event.pointerId,false,event);},
  onPointerCancel:(event:PhotoPointer)=>session.releasePointer(event.pointerId,true,event),
  onLostPointerCapture:(event:PhotoPointer)=>session.releasePointer(event.pointerId,true,event),
  onClick:(event:PhotoClick)=>{if(event.detail!==0&&suppressPointerClick){event.preventDefault();return;}if(enabled())capture();},
 };
}

type CompositionActions={locked:()=>boolean;blocked:()=>boolean;focus:(x:number,y:number)=>void;look:(x:number,y:number)=>void;observe:()=>void};
/** Point selection and drag observation share the same cancellable pointer owner. */
export function createCompositionPointerHandlers(session:PointerSession,actions:CompositionActions){
 return{
  onPointerDown:(event:PhotoPointer)=>{
   if(actions.blocked()||(event.pointerType==='mouse'&&(event.button!==0||actions.locked())))return;
   const target=event.currentTarget,type=event.pointerType,startX=event.clientX,startY=event.clientY;let x=startX,y=startY;
   if(session.begin(PHOTO_POINTER_KEYS.composition,event,(cancelled,up)=>{
    if(cancelled||!up||actions.blocked()||(type==='mouse'&&actions.locked())||Math.hypot(up.clientX-startX,up.clientY-startY)>=8)return;
    const box=target.getBoundingClientRect();
    if(up.clientX<box.left||up.clientX>=box.left+box.width||up.clientY<box.top||up.clientY>=box.top+box.height)return;
    actions.focus((up.clientX-box.left)/box.width*2-1,-((up.clientY-box.top)/box.height*2-1));
    if(type==='mouse')actions.observe();
   },point=>{
    if(actions.blocked()||(type==='mouse'&&actions.locked())){session.release(PHOTO_POINTER_KEYS.composition);return;}
    const dx=point.clientX-x,dy=point.clientY-y;x=point.clientX;y=point.clientY;
    if(type!=='mouse'&&Math.hypot(x-startX,y-startY)>5)actions.look(dx,dy);
   }))event.preventDefault();
  },
  onPointerUp:(event:PhotoPointer)=>session.releasePointer(event.pointerId,false,event),
  onPointerCancel:(event:PhotoPointer)=>session.releasePointer(event.pointerId,true,event),
  onLostPointerCapture:(event:PhotoPointer)=>session.releasePointer(event.pointerId,true,event),
 };
}

/** Pointer and keyboard holds release their own AF sources without touching F or another finger. */
export function createFocusPointerHandlers(session:PointerSession,setHeld:(source:string,held:boolean)=>void,enabled:()=>boolean){
 const keys=new Set<string>();
 const releaseKeys=()=>{for(const code of keys)setHeld('button:'+code,false);keys.clear();};
 return{
  onPointerDown:(event:PhotoPointer)=>{if(!enabled())return;event.preventDefault();const source='pointer:'+event.pointerId;if(session.begin(PHOTO_POINTER_KEYS.focus,event,()=>setHeld(source,false)))setHeld(source,true);},
  onPointerUp:(event:PhotoPointer)=>session.releasePointer(event.pointerId,false,event),
  onPointerCancel:(event:PhotoPointer)=>session.releasePointer(event.pointerId,true,event),
  onLostPointerCapture:(event:PhotoPointer)=>session.releasePointer(event.pointerId,true,event),
  onKeyDown:(event:{code:string;repeat:boolean;preventDefault:()=>void})=>{if(!enabled()||!['Space','Enter'].includes(event.code))return;event.preventDefault();if(!keys.has(event.code)){keys.add(event.code);setHeld('button:'+event.code,true);}},
  onKeyUp:(event:{code:string;preventDefault:()=>void})=>{if(!keys.delete(event.code))return;event.preventDefault();setHeld('button:'+event.code,false);},
  onBlur:releaseKeys,
  cancel:()=>{session.release(PHOTO_POINTER_KEYS.focus);releaseKeys();},
 };
}

/** The fixed movement pad keeps its own owner and clears its axis on every release path. */
export function createMovementPointerHandlers(session:PointerSession,actions:{enabled:()=>boolean;active:(pointerId:number|null)=>void;move:(x:number,y:number)=>void}){
 return{onPointerDown:(event:PhotoPointer)=>{
  if(!actions.enabled())return;const target=event.currentTarget;
  const move=(point:PointerPosition)=>{if(!actions.enabled()){session.release(PHOTO_POINTER_KEYS.move);return;}const box=target.getBoundingClientRect(),x=Math.max(-1,Math.min(1,(point.clientX-box.left-box.width/2)/(box.width/2-12))),y=Math.max(-1,Math.min(1,-(point.clientY-box.top-box.height/2)/(box.height/2-12)));actions.move(x,y);};
  if(session.begin(PHOTO_POINTER_KEYS.move,event,()=>{actions.active(null);actions.move(0,0);},move)){event.preventDefault();actions.active(event.pointerId);move(event);}
 }};
}
