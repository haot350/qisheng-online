import type {GadgetId} from '@qisheng/shared/gadgets';
export type GadgetWheelState={x:number;y:number;selected:GadgetId;choices:readonly GadgetId[]};
export const gadgetWheelPositions=(count:number)=>Array.from({length:count},(_,i)=>({x:(i-(count-1)/2)*70,y:-66+Math.abs(i-(count-1)/2)*20}));
type Timer=(callback:()=>void,delay:number)=>unknown;
/** Pointer ownership stays with PointerSession; this owns the delayed tap/selection intent. */
export class GadgetTouchGesture{
 private current:{x:number;y:number;centerX:number;centerY:number;selected:GadgetId;choices:readonly GadgetId[];open:boolean;timer:unknown}|null=null;
 constructor(private callbacks:{wheel:(state:GadgetWheelState|null)=>void;use:()=>void;select:(id:GadgetId)=>void},private delay:Timer=(f,ms)=>setTimeout(f,ms),private clear:(timer:unknown)=>void=timer=>clearTimeout(timer as ReturnType<typeof setTimeout>)){}
 begin(x:number,y:number,selected:GadgetId,choices:readonly GadgetId[],width:number,height:number){this.end(true);const state={x,y,centerX:Math.max(90,Math.min(width-90,x)),centerY:Math.max(100,Math.min(height-50,y)),selected,choices:[...choices],open:false,timer:undefined as unknown};this.current=state;state.timer=this.delay(()=>{if(this.current===state)this.open();},300);}
 private open(){const g=this.current;if(!g)return;g.open=true;this.callbacks.wheel({x:g.centerX,y:g.centerY,selected:g.selected,choices:g.choices});}
 move(x:number,y:number){const g=this.current;if(!g)return;if(!g.open&&Math.hypot(x-g.x,y-g.y)>18)this.open();if(!g.open)return;const dx=x-g.centerX,dy=y-g.centerY;if(Math.hypot(dx,dy)<20)return;let nearest=0,distance=Infinity;gadgetWheelPositions(g.choices.length).forEach((p,i)=>{const d=Math.hypot(dx-p.x,dy-p.y);if(d<distance){nearest=i;distance=d;}});g.selected=g.choices[nearest];this.callbacks.wheel({x:g.centerX,y:g.centerY,selected:g.selected,choices:g.choices});}
 end(cancelled=false){const g=this.current;this.current=null;if(!g)return;this.clear(g.timer);this.callbacks.wheel(null);if(cancelled)return;if(g.open)this.callbacks.select(g.selected);else this.callbacks.use();}
}
