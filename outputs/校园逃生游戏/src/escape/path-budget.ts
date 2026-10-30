/** A bounded FIFO for recurring route work. Deferred actors retain their last
 * physical route; critical shot/cover validation does not use this budget. */
export class NpcPathBudget {
 private time=0;
 private used=0;
 private order=0;
 private waiting=new Map<string,{order:number;seen:number}>();
 constructor(readonly limit=2){}
 begin(dt:number){
  this.time+=Math.max(0,dt);this.used=0;
  for(const [key,row] of this.waiting)if(this.time-row.seen>.5)this.waiting.delete(key);
 }
 run<T>(key:string,calculate:()=>T):T|undefined{
  let row=this.waiting.get(key);
  if(!row){if(this.waiting.size>=32)return undefined;row={order:this.order++,seen:this.time};this.waiting.set(key,row);}
  row.seen=this.time;
  if(this.used>=this.limit||[...this.waiting.values()].some(other=>other.order<row!.order))return undefined;
  this.waiting.delete(key);this.used++;return calculate();
 }
 reset(){this.time=0;this.used=0;this.order=0;this.waiting.clear();}
 get pending(){return this.waiting.size;}
 get queries(){return this.used;}
}
