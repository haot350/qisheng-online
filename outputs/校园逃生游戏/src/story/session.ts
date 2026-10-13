import {INTRO_CAPTIONS,introCameraAt,PORTRAITS,SPEAKERS,STORY_BY_ID,STORY_CHAPTERS,STORY_STAGE,STORY_START} from './content.ts';
import type {StoryActor,StoryCaptureResult,StoryCheckpoint,StoryFilm,StoryGuidanceAction,StoryGuidanceStage,StoryHistory,StoryInteraction,StoryLine,StoryPhoto,StoryPhotoTask,StorySnapshot,StoryStep,StoryVec3} from './types';

const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
const distance=(a:StoryVec3,b:StoryVec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const mix=(a:StoryVec3,b:StoryVec3,t:number):StoryVec3=>a.map((v,i)=>v+(b[i]-v)*t) as StoryVec3;
const safePosition=(p:unknown):p is StoryVec3=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000);
const validFlags=(f:unknown):f is Record<string,string>=>!!f&&typeof f==='object'&&!Array.isArray(f)&&Object.entries(f).length<100&&Object.entries(f).every(([k,v])=>k.length<64&&typeof v==='string'&&v.length<200);
const GUIDANCE:Record<StoryGuidanceStage,[string,string]>={
  move:['先走两步','按 WASD，或拖动左侧摇杆。'],
  look:['看看周围','移动鼠标，或在右侧空白处拖动，转向同伴。'],
  follow:['跟上林岑','沿铺装绕过花池，去庭院取景。同伴走远了会停下来等你。'],
  raise:['把相机举起来','按 C，或点“相机”。先用简易拍照即可。'],
  focus:['先确认焦点','对准教学楼或人物，按住 F 对焦。也可以直接按空格，让相机自动对焦。'],
  shutter:['留下这一张','按空格，或点圆形快门。'],
  close:['放下相机','这一张已经拍好了。按 C 或点“放下相机”，继续和同伴说话。'],
  complete:['操作引导完成','需要时可从提示菜单重新练习。'],
  skipped:['操作引导已跳过','随时可以从提示菜单重新练习。'],
};

export function validateStoryCheckpoint(value:unknown):StoryCheckpoint {
  if(!value||typeof value!=='object')throw new Error('这不是有效的故事存档。');
  const v=value as StoryCheckpoint;
  if(v.format!=='qisheng-story'||v.version!==1||!STORY_BY_ID.has(v.step)||!validFlags(v.flags))throw new Error('故事存档版本或章节无效。');
  if(![v.line,v.revealed,v.elapsed,v.introTime,v.screeningTime,v.hintLevel,v.savedAt].every(n=>Number.isFinite(n)&&n>=0))throw new Error('故事存档的时间或对白位置无效。');
  if(![v.line,v.revealed,v.hintLevel].every(Number.isInteger))throw new Error('故事存档的对白位置无效。');
  if(v.cooperationTime!==undefined&&(!Number.isFinite(v.cooperationTime)||v.cooperationTime<0||v.cooperationTime>86400))throw new Error('存档中的协作时间无效。');
  if(typeof v.finished!=='boolean'||typeof v.presentOnly!=='boolean'||!Array.isArray(v.photos)||v.photos.length>50||!Array.isArray(v.selected)||v.selected.length>6||!v.selected.every(s=>typeof s==='string'))throw new Error('故事存档的照片清单无效。');
  if(!v.photos.every(p=>p&&typeof p.id==='string'&&p.id.length<200&&safePosition(p.position)&&(!p.url||typeof p.url==='string'&&p.url.length<500000)&&(!p.lookAt||safePosition(p.lookAt))&&(!p.taskId||typeof p.taskId==='string'&&STORY_BY_ID.get(p.taskId)?.kind==='photo')&&(!p.subjects||Array.isArray(p.subjects)&&p.subjects.every(id=>typeof id==='string'&&id.length<64))))throw new Error('故事照片的位置或内容无效。');
  if(new Set(v.photos.map(p=>p.id)).size!==v.photos.length||v.selected.some(id=>!v.photos.some(p=>p.id===id)))throw new Error('故事照片出现重复或缺失。');
  if(!Array.isArray(v.history)||v.history.length>400||!v.history.every(h=>h&&typeof h.text==='string'&&h.text.length<1200&&typeof h.step==='string'&&h.speaker in SPEAKERS))throw new Error('故事对白记录无效。');
  if(!Array.isArray(v.actors)||v.actors.length!==2||new Set(v.actors.map(a=>a.id)).size!==2||!v.actors.every(a=>(a.id==='lin-cen'||a.id==='zhou-xu')&&safePosition(a.position)&&safePosition(a.destination)))throw new Error('故事角色位置无效。');
  if(v.reply&&(!Array.isArray(v.reply)||v.reply.length>12||!v.reply.every(l=>l&&typeof l.text==='string'&&l.text.length<1200&&l.speaker in SPEAKERS)))throw new Error('存档中的选项对白无效。');
  if(v.replyNext&&!STORY_BY_ID.has(v.replyNext))throw new Error('存档中的后续章节无效。');
  if(v.actorRoutes&&Object.entries(v.actorRoutes).some(([id,route])=>!['lin-cen','zhou-xu'].includes(id)||!Array.isArray(route)||route.length>100||!route.every(safePosition)))throw new Error('存档中的同行路线无效。');
  if(v.cinematicTime!==undefined&&(!Number.isFinite(v.cinematicTime)||v.cinematicTime<0||v.cinematicTime>20))throw new Error('存档中的镜头时间无效。');
  const step=STORY_BY_ID.get(v.step)!;
  if(v.line>(step.lines?.length??0)+12||v.introTime>90||v.hintLevel>3||v.elapsed>60*60*24)throw new Error('故事存档超出允许范围。');
  return copy(v);
}

/** Story time is advanced only by the engine's visible, unpaused update. Never steps physics. */
export class StorySession {
  private stepId='opening'; private line=0; private revealed=0; private letterCarry=0;
  private reply:StoryLine[]|null=null; private replyNext:string|null=null;
  private time=0; private openingTime=0; private finished=false; private flags:Record<string,string>={};
  private photos:StoryPhoto[]=[]; private selected:string[]=[]; private history:StoryHistory[]=[];
  private hintLevel=0; private presentOnly=false; private notice=''; private noticeLeft=0;
  private position:StoryVec3=[...STORY_START]; private photoOpen=false; private screeningTime=0;
  private cooperationTime=0; private cinematicTime=0;
  private guidanceStage:StoryGuidanceStage='move'; private replaying=false;
  private guideOrigin:StoryVec3=[...STORY_START]; private lookOrigin:StoryVec3|null=null;
  private lastPhotoTask:StoryPhotoTask|null=null; private photoTaskLeft=0;
  private lastCaptureResult:StoryCaptureResult|null=null;
  private stalledTime=0; private bestTargetDistance=Infinity;
  private actors:StoryActor[]=[
    {id:'lin-cen',name:'林岑',position:[...STORY_STAGE.actors['lin-cen']],destination:[...STORY_STAGE.actors['lin-cen']],pose:'idle',visible:true},
    {id:'zhou-xu',name:'周序',position:[...STORY_STAGE.actors['zhou-xu']],destination:[...STORY_STAGE.actors['zhou-xu']],pose:'idle',visible:true},
  ];
  private routes=new Map<StoryActor['id'],StoryVec3[]>(); private externalActors=new Set<StoryActor['id']>();
  private blockedCompanions=new Set<string>();
  private lastChapter=-1;
  constructor(private readonly options:{onCheckpoint?:(checkpoint:StoryCheckpoint)=>void}={}){}
  private get step():StoryStep{return STORY_BY_ID.get(this.stepId)!;}
  private get lines():StoryLine[]{
    if(this.reply)return this.reply;
    if(this.stepId==='screening-end'){
      const tasks=new Set(this.selected.map(id=>this.photos.find(p=>p.id===id)?.taskId));
      const replacement=tasks.has('reshoot-photo');
      return [{speaker:'lin-cen',text:'我看见名字了。'},
        {speaker:'zhou-xu',text:replacement?(this.flags.replacement==='strap'?'还有你整理背带那一下。':'还有你抬手喊收工那一下。'):tasks.has('reflector-capture')?'挡光那张也留下了。':'这几张接起来，真像今天一起走过的路。'},
        {speaker:'xu-yuan',text:'你说不放的那段，没有放。'},
        {speaker:'lin-cen',text:replacement?'嗯。这一张是我选的。':'嗯。没放进去的，也不用补满。'},
        {speaker:'zhou-xu',text:'挺好。回去吗？'}];
    }
    return this.step.lines??[];
  }
  private get nearTarget(){const t=this.step.target;return !t||(Math.hypot(t.position[0]-this.position[0],t.position[2]-this.position[2])<=t.radius&&Math.abs(t.position[1]-this.position[1])<=1.25);}
  private get actorsReady(){const people=this.step.participants??(this.step.kind==='travel'?Object.keys(this.step.actors??{}):[]);return this.actors.filter(a=>people.includes(a.id)).every(a=>!this.routes.get(a.id)?.length&&distance(a.position,a.destination)<.55);}
  private get rhythmReady(){const r=this.step.rhythm;if(!r||this.flags[`sync:${this.stepId}`]==='yes')return true;const phase=this.cooperationTime%r.period;return phase>=r.windowStart&&phase<=r.windowEnd;}
  private get tutorialActive(){return this.guidanceStage!=='complete'&&this.guidanceStage!=='skipped'&&(this.replaying||this.stepId==='courtyard-arrive'||this.stepId==='yard-first-shot');}
  private get travelReady(){return this.step.kind==='travel'&&!this.photoOpen&&!this.replaying&&!this.lines[this.line]&&!this.step.choices?.length&&this.nearTarget&&this.actorsReady&&!(this.tutorialActive&&['move','look'].includes(this.guidanceStage));}
  private setGuide(stage:StoryGuidanceStage){this.guidanceStage=stage;this.flags.guideStage=stage;}
  private get cinematicActive(){return this.stepId==='longshot-end'&&this.cinematicTime<20;}
  private addHistory(line:StoryLine){const last=this.history.at(-1);if(!last||last.step!==this.stepId||last.text!==line.text)this.history.push({...line,step:this.stepId});if(this.history.length>400)this.history.shift();}
  private say(text:string){this.notice=text;this.noticeLeft=5;}
  private desiredPose(id:StoryActor['id']){
    if(id==='lin-cen'&&this.stepId==='reshoot-photo')return this.flags.replacement==='strap'?'strap':'wave';
    if(id==='lin-cen'&&['reflector-sync','reflector-capture'].includes(this.stepId)&&(this.flags.reflector==='side'||this.flags.reflector==='seated'))return 'strap';
    return this.step.actors?.[id]?.pose??'idle';
  }
  private get objective(){
    if(this.stepId==='reshoot-photo')return this.flags.replacement==='strap'?'拍下林岑整理背带的动作。':'拍下林岑抬手示意收工的动作。';
    return this.step.objective;
  }
  private get interaction():StoryInteraction{
    if(this.replaying&&this.tutorialActive)return {state:'travel',label:'正在练习操作',reason:'当前剧情位置已保留，练习后继续。',enabled:false};
    if(this.finished)return {state:'complete',label:'故事完成',reason:'照片留在本机相册中。',enabled:false};
    if(this.lines[this.line])return {state:'dialogue',label:this.photoOpen?'先放下相机':this.revealed>=Array.from(this.lines[this.line].text).length?'继续对白':'显示完整对白',reason:this.photoOpen?'放下相机，继续和同伴说话。':'点击对白继续。',enabled:!this.photoOpen&&!this.cinematicActive};
    if(this.photoOpen&&(this.step.choices?.length||this.stepId==='film-selection'))return {state:'choices',label:'放下相机',reason:'放下相机，再作选择。',enabled:false};
    if(this.step.choices?.length||this.stepId==='film-selection')return {state:'choices',label:this.stepId==='film-selection'?'选择照片':'选择下一步',reason:this.stepId==='film-selection'?'选 3–6 张照片，准备好后开始放映。':'点选一个选项。',enabled:true};
    if(this.stepId==='courtyard-arrive'&&this.tutorialActive&&['move','look'].includes(this.guidanceStage))return {state:'travel',label:'先试试移动与观察',reason:'完成当前操作，或跳过操作引导。',enabled:false};
    if(!this.nearTarget){const label=this.step.target?.label??'同伴身边';return {state:'travel',label:`前往${label}`,reason:`前往${label}。${Math.abs((this.step.target?.position[1]??this.position[1])-this.position[1])>1.25?'沿楼梯到目标楼层。':''}`,enabled:false};}
    if(!this.actorsReady){const participants=this.step.participants??Object.keys(this.step.actors??{}),waiting=this.actors.filter(a=>participants.includes(a.id)&&(!!this.routes.get(a.id)?.length||distance(a.position,a.destination)>=.55)),names=waiting.map(a=>a.name).join('、')||'同伴',blocked=waiting.filter(a=>this.blockedCompanions.has(a.id));return {state:'waiting',label:`等${names}`,reason:waiting.some(a=>a.holding)?`走近${names}，让他们继续同行。`:blocked.length?`往旁边或后退一步，让${blocked.map(a=>a.name).join('、')}过去。`:`等${names}站好。`,enabled:false};}
    if(this.step.kind==='photo')return {state:'photo',label:this.photoOpen?'按快门拍摄':'举起相机',reason:this.objective,enabled:true};
    if(!this.rhythmReady)return {state:'timing',label:'等第三个手势',reason:'等第三个手势亮起，再一起开始。',enabled:false};
    if(this.step.kind==='travel')return {state:'ready',label:'到了',reason:'同伴已经就位。',enabled:false};
    return {state:'ready',label:'一起开始',reason:'准备好了，一起开始。',enabled:!this.photoOpen};
  }
  private enter(id:string){
    const next=STORY_BY_ID.get(id);if(!next)throw new Error(`Unknown story step: ${id}`);
    this.blockedCompanions.clear();
    this.stepId=id;this.line=0;this.revealed=0;this.letterCarry=0;this.reply=null;this.replyNext=null;this.hintLevel=0;this.notice='';this.screeningTime=0;this.cooperationTime=0;this.cinematicTime=0;this.stalledTime=0;this.bestTargetDistance=Infinity;delete this.flags.routeHelp;
    if(id==='courtyard-arrive'&&this.guidanceStage==='move'){this.guideOrigin=[...this.position];this.lookOrigin=null;}
    if(id==='yard-first-shot'&&this.tutorialActive&&!['close','complete'].includes(this.guidanceStage))this.setGuide('raise');
    for(const a of this.actors){const order=next.actors?.[a.id];if(!order)continue;const adjusted=copy(order);
      if(['reflector-sync','reflector-capture'].includes(id)&&(this.flags.reflector==='side'||this.flags.reflector==='seated')){if(a.id==='lin-cen')adjusted.pose='strap';else adjusted.at=[-58,4.32,-77.4];}
      const route=(adjusted.route?.length?adjusted.route:[adjusted.at]).map(p=>[...p] as StoryVec3);if(distance(route.at(-1)!,adjusted.at)>.05)route.push([...adjusted.at]);this.routes.set(a.id,route);a.destination=[...route[0]];a.holding=false;a.pose=id==='reshoot-photo'&&a.id==='lin-cen'&&this.flags.replacement==='strap'?'strap':adjusted.pose??'idle';}
    if(next.kind==='finish')this.finished=true;
    if(next.chapter!==this.lastChapter||next.kind==='finish'){this.lastChapter=next.chapter;this.options.onCheckpoint?.(this.checkpoint());}
  }
  private next(){if(this.step.next)this.enter(this.step.next);}
  update(dt:number,context:{position:StoryVec3;photoOpen:boolean;viewForward?:StoryVec3;overlayOpen?:boolean}){
    if(context.overlayOpen)return;
    if(!Number.isFinite(dt)||dt<=0)return;if(safePosition(context.position))this.position=[...context.position];this.photoOpen=context.photoOpen;
    const step=Math.min(dt,.5),wasReplaying=this.replaying;this.time+=step;
    if(this.noticeLeft>0){this.noticeLeft=Math.max(0,this.noticeLeft-step);if(!this.noticeLeft)this.notice='';}
    this.photoTaskLeft=Math.max(0,this.photoTaskLeft-step);if(!this.photoTaskLeft)this.lastCaptureResult=null;
    if(this.stepId==='opening'){
      this.openingTime=Math.min(90,this.openingTime+step);
      if(this.openingTime>=90)this.enter('borrow-camera');return;
    }
    if(this.finished)return;
    if(this.tutorialActive){
      if(this.guidanceStage==='move'&&Math.hypot(this.position[0]-this.guideOrigin[0],this.position[2]-this.guideOrigin[2])>=.8){this.setGuide('look');this.lookOrigin=context.viewForward?[...context.viewForward]:null;}
      else if(this.guidanceStage==='look'&&context.viewForward){if(!this.lookOrigin)this.lookOrigin=[...context.viewForward];else{const cosine=context.viewForward.reduce((n,v,i)=>n+v*this.lookOrigin![i],0)/(Math.hypot(...context.viewForward)*Math.hypot(...this.lookOrigin));if(cosine<Math.cos(.14))this.setGuide(this.replaying?'raise':'follow');}}
      if(context.photoOpen&&this.guidanceStage==='raise')this.setGuide('focus');
      if(!context.photoOpen&&this.guidanceStage==='close')this.guidance('closed');
    }
    if(this.step.target&&!this.nearTarget){const d=distance(this.position,this.step.target.position);if(d<this.bestTargetDistance-.5){this.bestTargetDistance=d;this.stalledTime=0;}else this.stalledTime+=step;}else if(this.nearTarget&&!this.actorsReady&&!this.lines[this.line])this.stalledTime+=step;else this.stalledTime=0;
    if(this.cinematicActive&&!this.photoOpen)this.cinematicTime=Math.min(20,this.cinematicTime+step);
    if(this.nearTarget&&this.actorsReady&&!this.lines[this.line]&&!this.photoOpen)this.cooperationTime+=step;
    for(const actor of this.actors){
      const moving=!!this.routes.get(actor.id)?.length,far=distance(actor.position,this.position);
      actor.holding=this.step.kind==='travel'&&moving&&(actor.holding?far>6:far>8);
      if(this.externalActors.has(actor.id))continue;
      if(actor.holding)continue;
      const route=this.routes.get(actor.id);if(!route?.length)continue;
      const target=route[0],d=distance(actor.position,target),move=1.45*step;
      if(d<=move){actor.position=[...target];route.shift();actor.destination=[...(route[0]??target)];if(!route.length)actor.pose=this.desiredPose(actor.id);}
      else{actor.position=mix(actor.position,target,move/d);actor.pose='walk';}
    }
    // Consume at most one arrival per visible update, including after restore.
    // Photography, choices and the synchronised start remain player actions.
    if(this.travelReady){this.next();this.options.onCheckpoint?.(this.checkpoint());return;}
    // Dialogue waits while the camera is raised. Actors and environment keep moving.
    if(!this.photoOpen&&!this.replaying&&!wasReplaying&&this.line<this.lines.length){const n=Array.from(this.lines[this.line].text).length;this.letterCarry+=step;const letters=Math.floor(this.letterCarry/.04);this.letterCarry-=letters*.04;this.revealed=Math.min(n,this.revealed+letters);}
    if(this.step.kind==='screening'&&!this.photoOpen&&this.film.length>=3){this.screeningTime+=step;if(this.screeningTime>=this.filmDuration)this.next();}
  }
  advance(){
    if(this.photoOpen||this.finished||this.replaying||this.step.kind==='screening')return;
    if(this.stepId==='opening'){this.skipIntro();return;}
    const current=this.lines[this.line];
    if(current){const length=Array.from(current.text).length;if(this.revealed<length){this.revealed=length;this.letterCarry=0;return;}if(this.cinematicActive)return;this.addHistory(current);this.line++;this.revealed=0;this.letterCarry=0;if(this.line<this.lines.length)return;}
    if(this.cinematicActive)return;
    if(this.reply){const id=this.replyNext;this.reply=null;this.replyNext=null;if(id)this.enter(id);return;}
    if(this.step.choices?.length||this.step.id==='film-selection')return;
    if(this.step.kind==='dialogue'||this.step.kind==='compare')this.next();
  }
  skipToCredits(){if(this.step.kind==='screening'&&!this.photoOpen&&!this.replaying){this.screeningTime=Math.max(this.screeningTime,this.film.length*7);this.options.onCheckpoint?.(this.checkpoint());}}
  interact(){
    if(this.photoOpen||this.finished||this.replaying||this.stepId==='opening'||this.step.kind==='screening')return;
    if(this.step.id==='film-selection'){
      if(this.film.length<3){this.say('选至少三张可用照片，再一起放映。');return;}
      this.options.onCheckpoint?.(this.checkpoint());this.next();return;
    }
    if(this.lines[this.line]||this.step.choices?.length){this.advance();return;}
    if(this.step.kind==='travel'){
      return;
    }else if(this.step.kind==='cooperate'&&this.step.rhythm){
      if(!this.nearTarget||!this.actorsReady){this.say('先到取景位置，等同伴站稳。');return;}
      if(!this.rhythmReady){this.say('等第三个标记亮起，再一起开始。');return;}this.next();
    }else if(this.step.kind==='photo')this.say(this.actorsReady?'举起相机，再按快门。':'等同伴走到机位，再拍。');
  }
  choose(index:number){
    if(this.photoOpen||this.replaying||!Number.isInteger(index)||this.line<this.lines.length||this.reply)return;
    if(this.stepId==='film-selection'){
      const photo=this.photos[index];if(!photo)return;const selected=this.selected.indexOf(photo.id);
      if(selected>=0)this.selected.splice(selected,1);else if(this.selected.length<6)this.selected.push(photo.id);else this.say('成片最多选六张，其他照片仍留在相册。');return;
    }
    const choice=this.step.choices?.[index];if(!choice)return;
    Object.assign(this.flags,choice.flags??{});const next=choice.next??this.step.next;
    if(choice.reply?.length){this.reply=choice.reply;this.replyNext=next??null;this.line=0;this.revealed=0;this.letterCarry=0;}
    else if(next)this.enter(next);
  }
  photographed(photo:StoryPhoto):boolean{
    if(!photo||typeof photo.id!=='string'||!photo.id||photo.id.length>200||!safePosition(photo.position)||photo.lookAt&&!safePosition(photo.lookAt))return false;
    if(this.photos.some(p=>p.id===photo.id))return false;
    if(this.photos.length>=50){this.say('故事相册已满。导出想保留的照片，再从相册删除几张。');return false;}
    const stored:StoryPhoto={...copy(photo),chapter:this.step.chapter,label:'校园随拍',taskId:undefined};this.photos.push(stored);
    if(this.lastPhotoTask?.status==='retry')this.lastPhotoTask=null;
    const persisted=photo.persisted!==false;
    const result=(status:StoryCaptureResult['status'],message:string,taskId?:string)=>{this.lastCaptureResult={photoId:photo.id,url:photo.url,taskId,title:stored.label??'校园随拍',status,message,persisted};this.photoTaskLeft=8;};
    result('saved','');
    if(this.replaying){if(this.guidanceStage==='shutter'){this.flags.guideCapture=photo.id;this.setGuide(this.photoOpen?'close':'complete');if(!this.photoOpen){this.replaying=false;delete this.flags.guideReplay;}}return false;}
    if(this.step.kind!=='photo')return false;
    if(this.flags.guidePending){this.say('第一张任务照片已经完成。放下相机，继续同行。');return false;}
    if(photo.exposureStepId&&photo.exposureStepId!==this.stepId){result('saved','这张留作随拍。');return false;}
    const reject=(instruction:string)=>{this.lastPhotoTask={id:this.stepId,title:this.step.title,objective:this.objective,subjects:this.step.photoSubjects??[],status:'retry',message:instruction};result('retry',instruction,this.stepId);this.say(instruction);return false;};
    const t=this.step.target!;
    if(Math.hypot(photo.position[0]-t.position[0],photo.position[2]-t.position[2])>t.radius)return reject('回到任务取景位置，再拍一张。');
    if(Math.abs(photo.position[1]-t.position[1])>2.2)return reject('任务在另一层，沿楼梯到目标楼层再拍。');
    if(!(photo.actorsReady??this.actorsReady))return reject('等同伴到位，再拍一张。');
    if(!(photo.rhythmReady??this.rhythmReady))return reject('第三个手势亮起后再拍一次。');
    if(photo.frameClear===false)return reject('主体被挡住了，向旁边挪一点再拍。');
    if(photo.subjectsVerified){const missing=(this.step.photoSubjects??[]).filter(id=>!photo.subjects?.includes(id));if(missing.length){const names=missing.map(id=>SPEAKERS[id]).join('、');return reject(`还没拍清${names}，让${missing.length===1?'这位':'这两位'}同伴进入画面并避开遮挡。`);}}
    if(photo.lookAt&&t.lookAt){const a=photo.lookAt.map((v,i)=>v-photo.position[i]),b=t.lookAt.map((v,i)=>v-photo.position[i]);const cos=a.reduce((n,v,i)=>n+v*b[i],0)/(Math.hypot(...a)*Math.hypot(...b));if(!Number.isFinite(cos)||cos<.65)return reject('转向任务主体，让它进入画面再拍。');}
    stored.taskId=this.stepId;stored.label=this.step.photoLabel??this.step.title;
    if(this.stepId==='reshoot-photo')stored.label=this.flags.replacement==='strap'?'她选择的镜头·整理背带':'她选择的镜头·抬手收工';
    if(!this.selected.includes(photo.id)&&this.selected.length<6)this.selected.push(photo.id);
    const completedMessage=persisted?'任务完成。':'任务完成；照片暂存，可导出本次照片。';
    this.lastPhotoTask={id:this.stepId,title:this.step.title,objective:this.objective,subjects:this.step.photoSubjects??[],status:'completed',message:completedMessage,acceptedPhotoId:photo.id};result('completed',completedMessage,this.stepId);
    if(this.stepId==='yard-first-shot'&&this.tutorialActive&&this.photoOpen){this.flags.guideCapture=photo.id;this.flags.guidePending=this.step.next??'';this.setGuide('close');this.options.onCheckpoint?.(this.checkpoint());return true;}
    if(this.tutorialActive&&this.stepId==='yard-first-shot')this.setGuide('complete');
    // This is a quiet step transition, never a surprise dialogue while the camera is up.
    this.next();this.options.onCheckpoint?.(this.checkpoint());return true;
  }
  skipIntro(){if(this.stepId!=='opening')return;this.openingTime=90;this.enter('borrow-camera');}
  /** End the current camera move without skipping its dialogue or the next interaction. */
  skipCinematic(){if(this.cinematicActive)this.cinematicTime=20;}
  hint(){if(this.finished)return;this.hintLevel=Math.min(3,this.hintLevel+1);}
  guidance(action:StoryGuidanceAction){
    if(action==='enable-sync'){const r=this.step.rhythm;if(r&&this.nearTarget&&this.actorsReady&&this.cooperationTime>=r.period*2){this.flags[`sync:${this.stepId}`]='yes';this.say('准备好了，随时可以开始。');}return;}
    if(action==='route-help'){if(this.flags.routeHelp==='yes')delete this.flags.routeHelp;else{this.flags.routeHelp='yes';this.hint();}return;}
    if(action==='skip'){this.setGuide('skipped');this.replaying=false;delete this.flags.guideReplay;if(this.flags.guidePending){const next=this.flags.guidePending;delete this.flags.guidePending;this.enter(next);}return;}
    if(action==='replay'){if(this.stepId==='opening'||this.stepId==='borrow-camera')return;this.replaying=true;this.flags.guideReplay='yes';this.guideOrigin=[...this.position];this.lookOrigin=null;delete this.flags.guideCapture;this.setGuide('move');return;}
    if(!this.tutorialActive)return;
    if(action==='raised'&&this.guidanceStage==='raise')this.setGuide('focus');
    else if(action==='focused'&&this.guidanceStage==='focus')this.setGuide('shutter');
    else if(action==='closed'&&this.guidanceStage==='close'&&this.flags.guideCapture){this.setGuide('complete');this.replaying=false;delete this.flags.guideReplay;const next=this.flags.guidePending;delete this.flags.guidePending;if(next)this.enter(next);}
  }
  setPresentOnly(value:boolean){this.presentOnly=value;}
  removePhotos(ids:readonly string[]){
    const removed=new Set(ids);this.photos=this.photos.filter(p=>!removed.has(p.id));this.selected=this.selected.filter(id=>!removed.has(id));
    if(this.lastCaptureResult&&removed.has(this.lastCaptureResult.photoId))this.lastCaptureResult=null;
  }
  reconcileAvailablePhotos(available:readonly {id:string;url?:string}[]){
    const sources=new Map(available.map(p=>[p.id,p]));this.removePhotos(this.photos.filter(p=>!sources.has(p.id)).map(p=>p.id));
    for(const p of this.photos){const url=sources.get(p.id)?.url;if(url)p.url=url;}
    if(this.step.kind==='screening'&&this.film.length<3){this.enter('film-selection');this.say('有照片暂不可用。重新选至少三张照片，再一起放映。');}
  }
  /** Engine feeds Rapier-controlled feet back here; script only chooses reachable route points. */
  setCompanionBlocking(ids:readonly string[]){this.blockedCompanions=new Set(ids);}
  setActorPosition(id:StoryActor['id'],position:StoryVec3){
    if(!safePosition(position))return;const actor=this.actors.find(a=>a.id===id);if(!actor)return;
    this.externalActors.add(id);actor.position=[...position];const route=this.routes.get(id);
    if(route?.length){if(distance(position,route[0])<.5){const reached=route.shift()!;actor.destination=[...(route[0]??reached)];}actor.pose=route.length?(actor.holding?'idle':'walk'):this.desiredPose(id);}
  }
  private get film():StoryFilm[]{
    const selected=this.selected.map(id=>this.photos.find(p=>p.id===id)).filter((p):p is StoryPhoto=>!!p?.url);
    const people=(p:StoryPhoto)=>!!p.subjects?.length||p.label?.includes('我们')||p.label?.includes('人')||p.label?.includes('选择');
    const ordered=[...selected].sort((a,b)=>this.flags.filmOrder==='people'?Number(people(b))-Number(people(a)):Number(people(a))-Number(people(b)));
    return ordered.map((p,i)=>({id:p.id,title:p.label??`镜头 ${i+1}`,photos:[copy(p)],caption:i===0?(this.flags.sound==='before'?'先记得球声，再看见这片校园。':'我们就在这里，听见远处的声音。'):i===ordered.length-1?(this.flags.promise==='smaller'?'只留下三个人一起完成的这些。':'今天说好的镜头，到这里结束。'):p.taskId?.startsWith('longshot-')?(this.flags.longshot==='reveal'?'同伴就在前面，校园从身后展开。':'先看见庭院，再走近同伴。'):p.taskId==='reshoot-photo'?'这一张，我们问过她。':p.taskId==='reflector-capture'?(this.flags.discovery==='angle'?'换一个角度，还能拍到挡光的人。':'她在窗边，他在画框外帮忙。'):'同一片校园，不同的一个时刻。',seconds:7}));
  }
  private get filmDuration(){return this.film.length*7+6;}
  get snapshot():StorySnapshot{
    const step=this.step,objective=this.objective,current=this.lines[this.line];let dialogue:StorySnapshot['dialogue']=null;
    if(this.stepId==='opening'){
      const caption=[...INTRO_CAPTIONS].reverse().find(c=>c.time<=this.openingTime);
      if(caption&&this.openingTime-caption.time<7){const full=caption.line.text,count=Math.floor((this.openingTime-caption.time)/.04);dialogue={...caption.line,text:Array.from(full).slice(0,count).join(''),fullText:full,complete:count>=Array.from(full).length,speakerName:SPEAKERS[caption.line.speaker],portraitUrl:PORTRAITS[caption.line.speaker]};}
    }else if(current&&!this.photoOpen)dialogue={...current,text:Array.from(current.text).slice(0,this.revealed).join(''),fullText:current.text,complete:this.revealed>=Array.from(current.text).length,speakerName:SPEAKERS[current.speaker],portraitUrl:PORTRAITS[current.speaker]};
    let camera:StorySnapshot['introCamera']=null;
    if(this.stepId==='opening')camera=introCameraAt(this.openingTime);
    if(this.replaying)dialogue=null;
    const options=!this.replaying&&!dialogue&&!this.reply?(step.id==='film-selection'?this.photos.map((p,index)=>({label:p.label??`照片 ${index+1}`,index})):step.choices?.map((c,index)=>({label:c.label,index}))??[]):[];
    const interaction=this.interaction,guide=GUIDANCE[this.guidanceStage];
    let photoTask:StoryPhotoTask|null=null;
    if(step.kind==='photo')photoTask=this.lastPhotoTask?.id===step.id&&(this.lastPhotoTask.status==='retry'||this.photoTaskLeft>0||!!this.flags.guidePending)?copy(this.lastPhotoTask):{id:step.id,title:step.title,objective,subjects:step.photoSubjects??[],status:!this.nearTarget?'approach':!this.actorsReady?'waiting':'ready',message:!this.nearTarget?'先到任务取景位置。':!this.actorsReady?interaction.reason:'任务主体进入画面后，按快门拍摄。'};
    const comparison=step.id==='approved-comparison'?['yard-with-friends','reflector-capture'].map(id=>[...this.photos].reverse().find(p=>p.taskId===id)).filter((p):p is StoryPhoto=>!!p).map(copy):[];
    return {chapter:step.chapter,chapterTitle:STORY_CHAPTERS[step.chapter],chapterCount:STORY_CHAPTERS.length,step:step.id,stepTitle:step.title,kind:step.kind,objective,target:step.target?copy(step.target):null,distance:step.target?distance(this.position,step.target.position):null,canInteract:!this.photoOpen&&interaction.enabled,
      dialogue,options,actors:copy(this.actors),introTime:this.openingTime,introActive:this.stepId==='opening',cinematicActive:this.cinematicActive,cinematicTime:this.stepId==='longshot-end'?this.cinematicTime:0,cinematicDuration:20,introCamera:camera,introTitle:this.openingTime>=82?'明天，照常见':'',introCredit:this.openingTime>=53&&this.openingTime<65,cameraReceived:this.stepId!=='opening'&&this.stepId!=='borrow-camera',echo:this.presentOnly?'none':this.stepId==='opening'?(this.openingTime<28?'none':this.openingTime<48?'morning':this.openingTime<61?'all':this.openingTime<73?'none':'morning'):step.echo??'none',presentOnly:this.presentOnly,finished:this.finished,elapsed:this.time,hint:step.hints?.[Math.min(this.hintLevel-1,(step.hints?.length??1)-1)]??(this.hintLevel?step.objective:''),hintLevel:this.hintLevel,history:copy(this.history),notice:this.notice,photos:copy(this.photos),film:this.film,selected:[...this.selected],screeningTime:this.screeningTime,screeningDuration:this.filmDuration,screeningActive:step.kind==='screening',checkpointLabel:`${STORY_CHAPTERS[step.chapter]} · ${step.title}`,cooperation:step.rhythm?{label:!this.nearTarget?'先到同伴身边':!this.actorsReady?'等同伴到位':this.rhythmReady?'一起开始':step.rhythm.label,ready:this.nearTarget&&this.actorsReady&&this.rhythmReady,phase:this.cooperationTime%step.rhythm.period,period:step.rhythm.period,cycles:Math.floor(this.cooperationTime/step.rhythm.period),gesture:Math.min(3,Math.floor(this.cooperationTime%step.rhythm.period)) as 0|1|2|3,assisted:this.flags[`sync:${this.stepId}`]==='yes',canEnableAssist:this.nearTarget&&this.actorsReady&&this.cooperationTime>=step.rhythm.period*2&&this.flags[`sync:${this.stepId}`]!=='yes'}:null,
      guidance:{active:this.tutorialActive,stage:this.guidanceStage,title:guide[0],body:guide[1],replaying:this.replaying,canSkip:this.tutorialActive,stalled:this.stalledTime>=20,routeHelpRequested:this.flags.routeHelp==='yes'},interaction,photoTask,captureEligibility:{stepId:this.stepId,actorsReady:this.actorsReady,rhythmReady:this.rhythmReady},lastCaptureResult:this.lastCaptureResult?copy(this.lastCaptureResult):null,comparison};
  }
  checkpoint():StoryCheckpoint{
    // Player images live in the photography store. Blob URLs are session-only, never persistent.
    return {format:'qisheng-story',version:1,savedAt:Date.now(),step:this.stepId,line:this.line,revealed:this.revealed,elapsed:this.time,introTime:this.openingTime,finished:this.finished,flags:{...this.flags},photos:this.photos.map(p=>{const next=copy(p);if(next.url?.startsWith('blob:'))delete next.url;return next;}),selected:[...this.selected],history:copy(this.history),hintLevel:this.hintLevel,presentOnly:this.presentOnly,actors:copy(this.actors),screeningTime:this.screeningTime,cooperationTime:this.cooperationTime,cinematicTime:this.cinematicTime,reply:this.reply?copy(this.reply):undefined,replyNext:this.replyNext??undefined,actorRoutes:copy(Object.fromEntries(this.routes))};
  }
  export(){return JSON.stringify(this.checkpoint(),null,2);}
  restore(input:StoryCheckpoint|string,contextPosition?:StoryVec3){
    const v=validateStoryCheckpoint(typeof input==='string'?JSON.parse(input):input);
    this.blockedCompanions.clear();
    if(contextPosition&&safePosition(contextPosition))this.position=[...contextPosition];
    this.stepId=v.step;this.reply=v.reply?copy(v.reply):null;this.replyNext=v.replyNext??null;this.line=Math.min(v.line,this.lines.length);this.revealed=v.revealed;this.letterCarry=0;
    this.time=v.elapsed;this.openingTime=v.introTime;this.finished=this.step.kind==='finish';this.flags={...v.flags};this.photos=copy(v.photos);this.selected=[...v.selected];this.history=copy(v.history);this.hintLevel=v.hintLevel;this.presentOnly=v.presentOnly;this.actors=copy(v.actors);this.screeningTime=v.screeningTime;this.cooperationTime=v.cooperationTime??0;this.notice='';this.noticeLeft=0;this.photoOpen=false;this.routes.clear();
    this.guidanceStage=this.flags.guideStage&&this.flags.guideStage in GUIDANCE?this.flags.guideStage as StoryGuidanceStage:['opening','borrow-camera','courtyard-arrive'].includes(this.stepId)?'move':this.stepId==='yard-first-shot'?'raise':'complete';
    this.replaying=this.flags.guideReplay==='yes';this.guideOrigin=[...this.position];this.lookOrigin=null;this.stalledTime=0;this.bestTargetDistance=Infinity;this.lastPhotoTask=null;this.lastCaptureResult=null;this.photoTaskLeft=0;
    if(this.flags.replacement==='book')this.flags.replacement='wave';if(this.flags.reflector==='seated')this.flags.reflector='side';
    // Version-1 saves have no task markers. Only the already-selected legacy
    // captures can migrate; arbitrary free shots are never used for comparison.
    for(const photo of this.photos){if(photo.taskId||!this.selected.includes(photo.id))continue;const oldLabel=photo.label?.replace('长镜头','摄影连作');const task=[...STORY_BY_ID.values()].find(s=>s.kind==='photo'&&s.photoLabel===oldLabel);if(task)photo.taskId=task.id;}
    if(this.flags.guidePending&&this.flags.guideCapture){const p=this.photos.find(p=>p.id===this.flags.guideCapture);if(p){this.lastPhotoTask={id:p.taskId??'yard-first-shot',title:'第一张照片',objective:'放下相机，继续同行。',subjects:[],status:'completed',message:'第一张任务照片已完成。放下相机继续。',acceptedPhotoId:p.id};this.photoTaskLeft=6;this.setGuide('close');}}
    for(const actor of this.actors){
      // Legacy opening and camera-handover saves used the planting strip.
      // Move only that initial set; later chapters retain their physical feet.
      if(this.stepId==='opening'||this.stepId==='borrow-camera'){actor.position=[...STORY_STAGE.actors[actor.id]];actor.destination=[...actor.position];actor.pose='idle';actor.visible=true;continue;}
      const route=v.actorRoutes?.[actor.id];if(route?.length)this.routes.set(actor.id,copy(route));else if(distance(actor.position,actor.destination)>.1)this.routes.set(actor.id,[actor.destination]);
    }
    this.lastChapter=this.step.chapter;
    // A restored camera segment replays from its stable start rather than resuming mid-move.
    this.cinematicTime=this.stepId==='longshot-end'?0:(v.cinematicTime??0);
  }
  /** Resolve already-persisted player image URLs after restore; no narrative state changes. */
  resolvePhoto(id:string,url:string){const p=this.photos.find(p=>p.id===id);if(p)p.url=url;}
}
