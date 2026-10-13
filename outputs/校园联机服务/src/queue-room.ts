/** Application reservation ownership, independent of Colyseus private seat internals. */
export class QueueRoomOwnership {
 private pending=new Map<string,ReturnType<typeof setTimeout>>();private closing=false;private creatorReleased=false;
 constructor(private creatorId:string|null,private empty:()=>boolean,private disconnect:()=>Promise<unknown>){}
 register(id:string){
  if(this.closing)throw Error('ROOM_CLOSING');this.consume(id);
  const timer=setTimeout(()=>{this.pending.delete(id);void this.closeIfAbandoned().catch(()=>{});},30000);timer.unref?.();this.pending.set(id,timer);
 }
 consume(id:string){const timer=this.pending.get(id);if(timer)clearTimeout(timer);this.pending.delete(id);}
 async release(id:string){
  this.consume(id);if(this.creatorId===id)this.creatorReleased=true;
  return this.closeIfAbandoned();
 }
 private async closeIfAbandoned(){
  if(this.closing||!this.creatorReleased||!this.empty()||this.pending.size)return false;
  this.closing=true;await this.disconnect();return true;
 }
 dispose(){for(const timer of this.pending.values())clearTimeout(timer);this.pending.clear();}
}
