/** A reading panel may resume only the session it interrupted, after every panel closes. */
export class OverlayResumeGate<T extends object>{
  private session:T|null=null;
  request(session:T|null,wasPlaying:boolean){if(session&&wasPlaying)this.session=session;}
  cancel(){this.session=null;}
  take(session:T|null,blocked:boolean){
    if(this.session!==session){this.cancel();return false;}
    if(blocked||!this.session)return false;
    this.cancel();return true;
  }
}
