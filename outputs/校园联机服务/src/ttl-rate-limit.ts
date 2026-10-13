/** Bounded per-address counters; expired addresses do not accumulate forever. */
export class TtlRateLimit {
 private entries=new Map<string,{at:number;count:number}>();
 constructor(readonly limit:number,readonly windowMs:number,readonly maxKeys=4096){}
 allow(key:string,now=Date.now()){
  if(this.entries.size>=this.maxKeys)for(const [id,row]of this.entries)if(now-row.at>=this.windowMs)this.entries.delete(id);
  const row=this.entries.get(key);
  if(row&&now-row.at<this.windowMs){if(row.count>=this.limit)return false;row.count++;return true;}
  // Do not evict live counters to let address churn reset another user's limit.
  if(!row&&this.entries.size>=this.maxKeys)return false;
  this.entries.set(key,{at:now,count:1});return true;
 }
 get size(){return this.entries.size;}
}
