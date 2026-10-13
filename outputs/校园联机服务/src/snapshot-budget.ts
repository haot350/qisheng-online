/** Snapshot recovery uses the same socket budget as routine state updates.
 * No replicator state is advanced while blocked. Resume with one latest baseline.
 */
export class SnapshotSendBudget {
 private blocked=false;
 private pendingFull=false;
 constructor(readonly highWater=131072,readonly lowWater=32768){}
 get pendingBaseline(){return this.pendingFull;}
 admit(bufferedBytes:number,requestFull=false):{forceFull:boolean}|null{
  if(requestFull)this.pendingFull=true;
  const amount=Number.isFinite(bufferedBytes)?Math.max(0,bufferedBytes):this.highWater+1;
  if(amount>this.highWater||this.blocked&&amount>this.lowWater){this.blocked=true;this.pendingFull=true;return null;}
  this.blocked=false;return{forceFull:this.pendingFull};
 }
 committed(){this.pendingFull=false;}
}
