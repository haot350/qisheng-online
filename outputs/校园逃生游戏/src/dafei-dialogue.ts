export const DAFEI_DIALOGUE = [
  '齐盛，我回来了。',
  '钥匙给你。今天他们跑操，咱们负责送一程。',
  '这几位挺积极，自己的送别会也不肯迟到。',
  '放心，落地还能醒。醒了继续跑，想想都替他们累。',
  '走吧。先送哪位，你定。',
] as const;

export const DAFEI_COMMENTS = {
  first:'起飞挺顺利，落地归他自己管。',
  combo:'接得挺快，他们连地都没站热。',
  danger:'车快散架了。先修车，别把自己也算进去。',
  minute:'最后一分钟，还够送几位。',
} as const;

/** Elapsed visible time only: callers suspend on background, portrait or help. */
export class DialoguePlayback {
  private lineIndex=0;
  private revealed=0;
  private carry=0;
  private ended=false;
  constructor(readonly lines:readonly string[]=DAFEI_DIALOGUE,readonly characterMs=40) {
    if(!lines.length||characterMs<=0)throw new Error('Dialogue requires text and a positive character interval.');
  }
  get snapshot(){
    const characters=Array.from(this.lines[this.lineIndex]);
    return {line:this.lineIndex,text:characters.slice(0,this.revealed).join(''),complete:this.revealed>=characters.length,last:this.lineIndex===this.lines.length-1,ended:this.ended};
  }
  tick(milliseconds:number,suspended=false){
    if(suspended||this.ended||!Number.isFinite(milliseconds)||milliseconds<=0)return false;
    const length=Array.from(this.lines[this.lineIndex]).length;
    if(this.revealed>=length)return false;
    this.carry+=milliseconds;
    const count=Math.floor(this.carry/this.characterMs);
    this.carry-=count*this.characterMs;
    const before=this.revealed;this.revealed=Math.min(length,this.revealed+count);
    return before!==this.revealed;
  }
  advance(){
    if(this.ended)return 'ended';
    const state=this.snapshot;
    if(!state.complete){this.revealed=Array.from(this.lines[this.lineIndex]).length;this.carry=0;return 'complete';}
    if(state.last){this.ended=true;return 'ended';}
    this.lineIndex++;this.revealed=0;this.carry=0;return 'next';
  }
  skip(){this.lineIndex=this.lines.length-1;this.revealed=Array.from(this.lines[this.lineIndex]).length;this.carry=0;this.ended=true;}
}
