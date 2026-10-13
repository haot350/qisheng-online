import {staticAssetUrl} from '../static-assets.ts';
import type {StoryIntroCamera,StoryLine,StoryStep,StoryVec3} from './types';

const l=(speaker:StoryLine['speaker'],text:string):StoryLine=>({speaker,text});
export const STORY_CHAPTERS = ['先试声音','画框之外','走到另一头','不放的十秒','三个人的镜头','只放这些','明天，照常见'];
/** Authored equipment sits on the surveyed south paving, outside the planting islands. */
export const STORY_STAGE={
  screen:[-46,1.765,-115.4] as StoryVec3,
  projector:[-46,1.025,-116.25] as StoryVec3,
  actors:{'lin-cen':[-48,.185,-116.25] as StoryVec3,'zhou-xu':[-44,.185,-116.25] as StoryVec3},
};
export const STORY_START:StoryVec3=[-46,.185,-117];
export const SPEAKERS:Record<StoryLine['speaker'],string>={'xu-yuan':'许原','lin-cen':'林岑','zhou-xu':'周序',dafei:'大飞老师',principal:'程国涛',narrator:'校园影像'};
export const PORTRAITS:Partial<Record<StoryLine['speaker'],string>>={'lin-cen':staticAssetUrl('/story/characters/lin-cen.webp'),'zhou-xu':staticAssetUrl('/story/characters/zhou-xu.webp'),dafei:staticAssetUrl('/images/dafei-guide.webp')};
const yard:StoryVec3=[-46,.18,-103], entry:StoryVec3=[-35.9,.61,-78.14], eastTop:StoryVec3=[-34,4.32,-78.14], westTop:StoryVec3=[-65.31,4.32,-81.54];
// The first reference is a real wide-angle photograph of the south courtyard.
// Companions finish beside/behind the photographer, keeping its landmarks clear.
const firstYard:StoryVec3=[-29.1232287,.067,-86],firstYardView:StoryVec3=[-33.628,3.1915,-94.802];
// These waypoints cross the open gap between the south benches, with the
// original low curb resolved by the character controller. No position jumps.
const stageToYard:StoryVec3[]=[[-42,.185,-115.75],[-42,.067,-114],[-42,.067,-110],[-42,.067,-108.2],[-42,.18,-104],yard];
const yardToStage:StoryVec3[]=[yard,[-42,.18,-104],[-42,.067,-108.2],[-42,.067,-110],[-42,.067,-114],[-42,.185,-115.75]];
const yardToFirstShot:StoryVec3[]=[[-46,.18,-98],[-42,.18,-94.25],[-34,.18,-89]];
const firstShotToYard:StoryVec3[]=[[-34,.18,-89],[-42,.18,-94.25],[-46,.18,-98]];
const upstairs:StoryVec3[]=[entry,[-35.9,2.465,-82.02],[-34,2.465,-82.02],eastTop];
// The exterior railing separates the apparent short approach below the east
// stair from its entry. Use the verified open first-floor passage from the west,
// and return to the courtyard on the west road after descending the west stair.
const eastApproach:StoryVec3[]=[[-77,.1,-78],[-65,.61,-78],[-58,.61,-78],[-50,.61,-78],[-42,.61,-78],entry];
const downstairs:StoryVec3[]=[westTop,[-69.74,2.465,-81.54],[-69.74,2.465,-79.27],[-65.31,.61,-79.27],[-77,.1,-78],[-77,.18,-103],yard];

export const INTRO_SHOTS = [
  {time:0,position:[-45.3,1.2,-116.95] as StoryVec3,lookAt:STORY_STAGE.projector,fov:44},
  {time:10,position:[-45.4,1.3,-116.85] as StoryVec3,lookAt:STORY_STAGE.projector,fov:44},
  {time:17,position:[-46.3,1.95,-117] as StoryVec3,lookAt:[-44,1.25,-116.25] as StoryVec3,fov:52},
  {time:28,position:[-48,2.35,-117] as StoryVec3,lookAt:STORY_STAGE.screen,fov:52},
  {time:32,position:[-46,3.5,-116.75] as StoryVec3,lookAt:[-46,1.6,-116.2] as StoryVec3,fov:52},
  {time:45,position:[-46,10,-116.75] as StoryVec3,lookAt:[-46,1.6,-116.2] as StoryVec3,fov:52},
  {time:48,position:[-46,10,-116.75] as StoryVec3,lookAt:[-42,9,-85.65] as StoryVec3,fov:52},
  {time:64,position:[-46,10,-116.75] as StoryVec3,lookAt:[-42,9,-85.65] as StoryVec3,fov:52},
  {time:68,position:[-46,10,-116.75] as StoryVec3,lookAt:[-46,1.6,-116.2] as StoryVec3,fov:52},
  {time:78,position:[-46,3.5,-116.75] as StoryVec3,lookAt:STORY_STAGE.screen,fov:48},
  {time:82,position:[-46,2.6,-116.85] as StoryVec3,lookAt:STORY_STAGE.screen,fov:48},
  {time:90,position:[STORY_START[0],STORY_START[1]+1.63,STORY_START[2]] as StoryVec3,lookAt:STORY_STAGE.screen as StoryVec3,fov:60},
];
/** One camera definition is shared by cinematic playback, preloading and exit/skip. */
export function introCameraAt(seconds:number):StoryIntroCamera{
  const time=Math.max(0,Math.min(90,Number.isFinite(seconds)?seconds:0));
  const a=[...INTRO_SHOTS].reverse().find(s=>s.time<=time)??INTRO_SHOTS[0],b=INTRO_SHOTS.find(s=>s.time>a.time)??a;
  const linear=b.time===a.time?0:(time-a.time)/(b.time-a.time),t=linear*linear*(3-2*linear);
  const mix=(from:StoryVec3,to:StoryVec3):StoryVec3=>from.map((v,i)=>v+(to[i]-v)*t) as StoryVec3;
  return {position:mix(a.position,b.position),lookAt:mix(a.lookAt,b.lookAt),fov:a.fov+(b.fov-a.fov)*t};
}
export const INTRO_CAPTIONS = [
  {time:4,line:l('zhou-xu','先别拍。听得见吗？')},
  {time:11,line:l('lin-cen','只有风。你那根线插了吗？')},
  {time:19,line:l('zhou-xu','……现在插了。')},
  {time:28,line:l('xu-yuan','这是上周早上的？')},
  {time:35,line:l('lin-cen','照片是以前的。拍球那段才是上周。')},
  {time:43,line:l('zhou-xu','你看柱子。光出去了。')},
  {time:61,line:l('xu-yuan','先暂停。')},
  {time:70,line:l('lin-cen','停了。还能开吗？')},
  {time:78,line:l('zhou-xu','能。今天先把片子拍完，别把日落也拖加班。')},
];

export const STORY_STEPS:StoryStep[]=[
  {id:'opening',chapter:0,title:'先试声音',kind:'dialogue',objective:'黄昏，三个人，一次没有准备好的试映。',echo:'morning',next:'borrow-camera'},
  {id:'borrow-camera',chapter:0,title:'把相机交给你',kind:'dialogue',objective:'接过周序的相机。',lines:[
    l('zhou-xu','给。背带先挂好。这台有点重。'),l('xu-yuan','你用手机不就行了？'),l('zhou-xu','今天你拿相机。要是你一直坐在剪辑那儿，永远只会觉得还缺一段。'),l('lin-cen','我们说好的，天黑前回去。'),l('xu-yuan','好。就补三个地方。'),l('zhou-xu','你记一下，这句我听见了。'),
  ],choices:[{label:'先从庭院开始。',flags:{opening:'yard'}},{label:'就找屏幕里这张庭院照片的角度。',flags:{opening:'archive'},reply:[l('zhou-xu','好，楼和树都还在。走近一点看看。')]}],next:'courtyard-arrive',actors:{'lin-cen':{at:STORY_STAGE.actors['lin-cen']},'zhou-xu':{at:STORY_STAGE.actors['zhou-xu']}}},
  {id:'courtyard-arrive',participants:['lin-cen','zhou-xu'],chapter:1,title:'照片背后的庭院',kind:'travel',objective:'跟林岑绕过花池，到庭院东侧取景。',target:{position:firstYard,radius:1.5,label:'庭院参考机位',lookAt:firstYardView},echo:'morning',hints:['楼与树之间的庭院，是这张旧照片里的主角。','跟着林岑沿铺装走到庭院东侧，再回望教学楼。','到机位后等林岑和周序站稳，再举起相机。'],actors:{'lin-cen':{at:[-29.1232287,.067,-84.6],route:[[-48,.185,-115.75],...stageToYard,...yardToFirstShot,[-28.3,.067,-87.5],[-28.3,.067,-86],[-28.3,.067,-85.3],[-29.1232287,.067,-84.6]]},'zhou-xu':{at:[-27,.067,-86],route:[[-44,.185,-115.75],...stageToYard,...yardToFirstShot,[-27,.067,-87.5],[-27,.067,-86]]}},next:'yard-first-shot'},
  {id:'yard-first-shot',photoSubjects:[],participants:[],chapter:1,title:'第一张照片',kind:'photo',objective:'举起相机，回望庭院与教学楼，拍下第一张照片。',target:{position:firstYard,radius:4,label:'拍摄庭院',lookAt:firstYardView},photoLabel:'黄昏里的庭院',echo:'morning',hints:['站在庭院东侧，回望教学楼。','举起相机，对准庭院与教学楼；准备好后按快门。','先用简易拍照，让教学楼进入画面。'],next:'frame-outside'},
  {id:'frame-outside',chapter:1,title:'画框之外',kind:'dialogue',objective:'放下相机，看看刚才画面以外的同伴。',lines:[
    l('lin-cen','旧照片里的树小一点。'),l('zhou-xu','刚才一举相机，身后两个人就不见了。'),l('xu-yuan','我想让楼正好对上。'),l('zhou-xu','可以。但别把今天也裁掉。'),l('lin-cen','我们回庭院里。别又把我的影子挡住了。'),
  ],next:'yard-second-station'},
  {id:'yard-second-station',participants:['lin-cen','zhou-xu'],chapter:1,title:'让影子留下',kind:'travel',objective:'跟林岑回到庭院第二机位。',target:{position:[-49,.18,-101.5],radius:1,label:'第二机位',lookAt:[-45,.8,-98.6]},hints:['跟着林岑回到庭院中段，回望两位同伴。','靠近同伴，让他们站稳，再往后调整构图。','到机位后，等两个人站稳再拍。'],actors:{'lin-cen':{at:[-43,.18,-99.25],route:[[-28.3,.067,-85.3],[-28.3,.067,-86],[-28.3,.067,-87.5],...firstShotToYard,[-43,.18,-99.25]]},'zhou-xu':{at:[-47,.18,-98],route:[[-27,.067,-87.5],...firstShotToYard,[-47,.18,-98]]}},next:'yard-with-friends'},
  {id:'yard-with-friends',photoSubjects:["lin-cen","zhou-xu"],participants:["lin-cen","zhou-xu"],chapter:1,title:'同一片黄昏',kind:'photo',objective:'让林岑和周序一起入镜，拍下他们与庭院。',target:{position:[-52,.18,-103],radius:5,label:'同伴与庭院',lookAt:[-45,1.2,-98.6]},photoLabel:'画框里的我们',next:'sound-investigate'},
  {id:'sound-investigate',chapter:1,title:'声音先到了',kind:'travel',objective:'跟同伴到运动区道路旁，听听球声。',target:{position:[-80.25,.1,-61],radius:5,label:'运动区路边'},echo:'morning',hints:['声音从运动区那侧来；静音时方向标也会帮助你。','沿教学楼外围向西北侧走。','同伴在运动区道路旁等你。'],next:'sound-choice',actors:{'zhou-xu':{at:[-80,.1,-64],pose:'camera',route:[[-77,.18,-103],[-77,.1,-64],[-80,.1,-64]]},'lin-cen':{at:[-81,.1,-60],route:[[-77,.18,-101],[-77,.1,-60],[-81,.1,-60]]}}},
  {id:'sound-choice',chapter:1,title:'一段不用重拍的声音',kind:'compare',objective:'片子开头，怎样写下刚才听见的球声？',lines:[l('zhou-xu','球声是真的，这会儿人却不在那儿了。'),l('lin-cen','像隔着一天打过来。'),l('xu-yuan','画面没拍着，能用吗？'),l('zhou-xu','你听到了，就不一定非得看见。')],choices:[
    {label:'先写球声，再看校园。',flags:{sound:'before'},reply:[l('lin-cen','那就先记声音。别急着写人。')]},
    {label:'先写我们在这里，听见远处的球声。',flags:{sound:'present'},reply:[l('zhou-xu','好，片子里终于有人拿着器材了。')]},
  ],next:'go-east-stair'},
  {id:'go-east-stair',chapter:2,title:'走到另一头',kind:'travel',objective:'跟同伴穿过南楼一层通道，走到东侧楼梯口。',target:{position:entry,radius:3.4,label:'东侧楼梯入口'},hints:['走一层通道，到东侧楼梯。','先沿西侧道路进入一层通道，再向东走到楼梯口。','到楼梯口后，沿台阶上到二层。'],next:'east-stair-top',actors:{'lin-cen':{at:[-35.4,.61,-77.6],route:[[-77.75,.1,-63.5],...eastApproach,[-35.4,.61,-77.6]]},'zhou-xu':{at:[-36.5,.61,-77.8],route:[[-77,.1,-64],...eastApproach,[-36.5,.61,-77.8]]}}},
  {id:'east-stair-top',chapter:2,title:'上到二层',kind:'travel',objective:'上到二层，走到走廊侧边等同伴。',target:{position:[-37,4.32,-76.8],radius:.55,label:'二层走廊等候位置'},hints:['上到二层后，走进走廊，给同伴留出楼梯出口。','经过转折平台后，走回朝南的一段台阶。','走完台阶，向走廊侧边的等候位置走几步。'],next:'corridor-conversation',actors:{'lin-cen':{at:[-40,4.32,-78],route:[...upstairs,[-40,4.32,-78]]},'zhou-xu':{at:[-42,4.32,-78],route:[...upstairs,[-42,4.32,-78]]}}},
  {id:'corridor-conversation',chapter:2,title:'说好的时间',kind:'dialogue',objective:'听完同伴的话，再决定今天先完成什么。',lines:[
    l('xu-yuan','这里再拍一段，后面就能接教室。'),l('zhou-xu','我们已经把“再拍一段”说了三次。'),l('xu-yuan','就差一点了。'),l('zhou-xu','你昨天也是这么说的。'),l('xu-yuan','这片子要也做不好，我真不知道这阵子干成什么了。'),l('zhou-xu','可你每次说再拍一段，明天就又多一段。'),l('xu-yuan','你是不是不想拍了？'),l('zhou-xu','我想拍。我也想按说好的时间回去。'),l('lin-cen','先把这一个镜头定下来。别站着的时候还想整部片子。'),
  ],choices:[{label:'只完成说好的镜头，今天不再加了。',flags:{promise:'finish'},reply:[l('zhou-xu','行。那我给你拿反光板。说好的拍完就收。')]},{label:'把方案缩小，只留三个人能完成的镜头。',flags:{promise:'smaller'},reply:[l('lin-cen','这个我赞成。我不想拍到最后只剩你一个人。')]}],next:'corridor-position'},
  {id:'corridor-position',chapter:2,title:'走廊的窗格',kind:'travel',objective:'沿二层走廊走到窗格前的机位。',target:{position:[-50,4.32,-78],radius:3,label:'二层走廊机位',lookAt:[-58,5.7,-78]},echo:'noon',hints:['沿走廊横向走，不需要进入教室。','停在南楼二层走廊中段。','到走廊中段后，举起相机对准窗格。'],next:'corridor-photo'},
  {id:'corridor-photo',photoSubjects:[],participants:[],chapter:2,title:'照片和窗之间',kind:'photo',objective:'对准走廊中段的窗格，拍下今天的光。',target:{position:[-50,4.32,-78],radius:5,label:'拍摄二层走廊',lookAt:[-58,5.7,-78]},photoLabel:'走廊里的光',next:'reflector-order'},
  {id:'reflector-order',chapter:2,title:'画面里不能只有反光',kind:'cooperate',objective:'商量怎样拍下窗边的林岑。',lines:[l('zhou-xu','玻璃上全是我们的倒影。你要拍人，还是拍三台相机？'),l('lin-cen','我站哪儿？'),l('xu-yuan','等一下，我看看。')],choices:[
    {label:'周序到画框外挡光，林岑靠窗站。',flags:{reflector:'outside'},reply:[l('zhou-xu','对。别拍我的脸，拍我挡住的那一块。')]},
    {label:'林岑整理背带，周序从侧面挡光。',flags:{reflector:'side'},reply:[l('lin-cen','背带刚好有点乱。我整理着，你说拍的时候我不转头。')]},
  ],next:'reflector-sync'},
  {id:'reflector-sync',participants:['lin-cen','zhou-xu'],chapter:2,title:'等第三个手势',kind:'cooperate',objective:'等第三个手势亮起，告诉同伴一起开始。',lines:[l('zhou-xu','我举手三次。第三次，你说开始，我们就不动了。'),l('lin-cen','我看你的手，不用喊。')],target:{position:[-55,4.32,-78],radius:4,label:'协作起拍位置'},rhythm:{period:8,windowStart:3,windowEnd:8,label:'等第三个手势亮起'},actors:{'lin-cen':{at:[-59,4.32,-78],pose:'listen',route:[[-40,4.32,-77.9],[-49,4.32,-77.9],[-56,4.32,-77.9],[-59,4.32,-78]]},'zhou-xu':{at:[-60,4.32,-77.4],pose:'shield'}},hints:['先到取景位置，等同伴站稳。','第三个手势亮起后，选择“一起开始”；错过会再来一轮。','看完两轮手势后，可以点“同步协助”。'],next:'reflector-capture'},
  {id:'reflector-capture',photoSubjects:["lin-cen"],participants:["lin-cen"],chapter:2,title:'有人替画面挡光',kind:'photo',objective:'拍下窗边的林岑，周序可以留在画框外。',target:{position:[-55,4.32,-78],radius:4,label:'窗边协作镜头',lookAt:[-59,5.4,-78]},photoLabel:'窗边的人',actors:{'lin-cen':{at:[-59,4.32,-78],pose:'listen'},'zhou-xu':{at:[-60,4.32,-77.4],pose:'shield'}},hints:['等林岑走到窗边。','从走廊西侧朝窗边看。','相机对准林岑；周序可以留在画框外。'],next:'principal-cameo'},
  {id:'principal-cameo',chapter:2,title:'借一处地方',kind:'dialogue',objective:'和校长说定放映的地方。',lines:[l('principal','你们在庭院里放？'),l('lin-cen','还差最后一个镜头。'),l('principal','可以。结束把器材收好，别留在路上。'),l('zhou-xu','我们自己收。'),l('principal','行，我先走了。'),l('xu-yuan','谢谢。')],next:'review-desk'},
  {id:'review-desk',chapter:3,title:'不放的十秒',kind:'travel',objective:'到二层走廊东侧，和同伴一起看照片。',target:{position:[-43,4.32,-78],radius:3.8,label:'照片回看位置'},hints:['林岑和周序在走廊东侧等你。','剪辑位置在二层走廊东侧。','走近同伴，一起看照片。'],next:'consent-dialogue',actors:{'lin-cen':{at:[-42,4.32,-77.7]},'zhou-xu':{at:[-44,4.32,-77.5]}}},
  {id:'consent-dialogue',chapter:3,title:'撤回一段片子',kind:'dialogue',objective:'林岑有话想说。',lines:[
    l('lin-cen','那段还是别放了。'),l('xu-yuan','……好。'),l('lin-cen','我不是说整个片子。就那十秒。'),l('xu-yuan','知道。后面想怎么拍？'),l('lin-cen','就拍刚才窗边那个吧。先别叫我转头。'),l('zhou-xu','那段从素材表划掉。我这儿也删标记。'),l('xu-yuan','划掉了。我们看能用的这两段。'),
  ],next:'approved-comparison'},
  {id:'approved-comparison',chapter:3,title:'镜头先后',kind:'compare',objective:'庭院和窗边这两张，想怎样接在一起？',lines:[l('xu-yuan','庭院这张我们都在。窗边那张，我一直在看林岑。'),l('zhou-xu','你拍的时候，我拿着板子站在旁边。'),l('lin-cen','画框里的人，也不是自己一个人拍完的。')],choices:[
    {label:'把画框外挡光这件事也写进片子。',flags:{discovery:'reflection'},reply:[l('xu-yuan','原来你一直在旁边。'),l('zhou-xu','当时在。后来确实要回去做题。两件事。'),l('lin-cen','这两张就放在一起吧。')]},
    {label:'下次换个角度，把画框外的人也拍进来。',flags:{discovery:'angle'},reply:[l('zhou-xu','对。从另一边看，我正好在挡光。'),l('xu-yuan','我之前只顾着对窗格。'),l('lin-cen','下次记着就行。')]},
  ],next:'reshoot-order'},
  {id:'reshoot-order',chapter:3,title:'问过她再拍',kind:'cooperate',objective:'和林岑商量一个替代镜头。',lines:[l('xu-yuan','换一个镜头。你想拍什么？'),l('lin-cen','不要问我当时在想什么，问也答不上来。'),l('zhou-xu','那就拍一件正在做的事。')],choices:[
    {label:'整理背带的那一下，可以拍吗？',flags:{replacement:'strap'},reply:[l('lin-cen','这个行。背带刚好打了个结。')]},
    {label:'拍你抬手示意收工，行吗？',flags:{replacement:'wave'},reply:[l('lin-cen','行。最后一下我来喊。别替我喊。')]},
  ],next:'reshoot-photo'},
  {id:'reshoot-photo',photoSubjects:["lin-cen"],participants:["lin-cen"],chapter:3,title:'重新拍这一张',kind:'photo',objective:'等林岑准备好，拍下刚才商量的动作。',target:{position:[-46,4.32,-78.25],radius:4,label:'替代镜头',lookAt:[-42,5.5,-77.7]},photoLabel:'她选择的镜头',actors:{'lin-cen':{at:[-42,4.32,-77.7],pose:'wave'},'zhou-xu':{at:[-44,4.32,-77.5],pose:'listen'}},next:'leave-review'},
  {id:'leave-review',chapter:3,title:'不用补满的空白',kind:'dialogue',objective:'收好替代素材，准备一起完成最后的镜头。',lines:[l('xu-yuan','这里少了十秒。'),l('zhou-xu','片子又不是试卷，不用把每个空填满。'),l('lin-cen','这十秒够你把片尾名字放慢一点。上次我没看清。'),l('xu-yuan','好。名字我重新放。'),l('zhou-xu','最后一个？'),l('xu-yuan','最后一个。')],next:'west-stair'},
  {id:'west-stair',chapter:4,title:'三个人的镜头',kind:'travel',objective:'沿二层走廊向西，走到侧边等同伴。',target:{position:[-62.3,4.32,-76.8],radius:.55,label:'二层西走廊等候位置'},echo:'noon',hints:['这次从西侧下楼，镜头会接回庭院。','沿二层走廊向西，走到侧边的等候位置。','在走廊侧边等同伴，给他们留出楼梯口。'],next:'yard-return',actors:{'lin-cen':{at:westTop,route:[[-55,4.32,-78],[-63,4.32,-78],westTop]},'zhou-xu':{at:[-65,4.32,-80.8],route:[[-57,4.32,-78],[-63,4.32,-78],[-65,4.32,-80.8]]}}},
  {id:'yard-return',chapter:4,title:'回到现在',kind:'travel',objective:'从西侧楼梯下楼，回到庭院机位。',target:{position:[-51,.18,-101],radius:1.25,label:'摄影连作起点'},hints:['沿西侧楼梯下到一层，再走回庭院。','如果叠影影响辨认，可以选择“关闭叠影”。','回到庭院，走到取景点等同伴。'],next:'longshot-order',actors:{'lin-cen':{at:[-45,.18,-98],route:[...downstairs,[-45,.18,-98]]},'zhou-xu':{at:[-44,.18,-102.75],route:[[-65,4.32,-80.8],...downstairs,[-44,.18,-102.75]]}}},
  {id:'longshot-order',chapter:4,title:'把今天拍进去',kind:'cooperate',objective:'选择最后的构图，让两位同伴一起入镜。',lines:[l('xu-yuan','以前的照片、今天的人，能不能在一张里？'),l('zhou-xu','能。只是别让我们一直站着。'),l('lin-cen','我先往前走，你跟上来。'),l('zhou-xu','这次我也进画面。挡光板放那儿了。')],choices:[
    {label:'给庭院多留一点位置，把两个人也拍进去。',flags:{longshot:'approach'},reply:[l('lin-cen','那就留宽一点。我们慢慢走。')]},
    {label:'先对准两个人，校园留在身后。',flags:{longshot:'reveal'},reply:[l('zhou-xu','好。楼不跑，我们也不跑。')]},
  ],next:'longshot-sync'},
  {id:'longshot-sync',participants:['lin-cen','zhou-xu'],chapter:4,title:'同一个开始',kind:'cooperate',objective:'到连作起点，等林岑的第三个手势后一起开始。',target:{position:[-51,.18,-101],radius:5,label:'摄影连作起点'},rhythm:{period:8,windowStart:3,windowEnd:8,label:'第三个手势亮起，一起开始'},hints:['准备好构图，等林岑示意。','屏幕上的三个标记也表示手势；关闭声音照样可以完成。','看完两轮手势后，可以点“同步协助”。'],next:'longshot-first'},
  {id:'longshot-first',photoSubjects:["lin-cen","zhou-xu"],participants:["lin-cen","zhou-xu"],chapter:4,title:'镜头的起点',kind:'photo',objective:'让林岑和周序一起入镜，拍下第一张连作（1/3）。',target:{position:[-51,.18,-101],radius:5,label:'摄影连作起点',lookAt:[-44.5,1.1,-100.4]},photoLabel:'三个人的镜头·起点',echo:'morning',next:'longshot-second-position'},
  {id:'longshot-second-position',chapter:4,title:'往同一个方向走',kind:'travel',objective:'走到庭院中段，与同伴保持同一方向。',target:{position:[-46,.18,-98],radius:1.25,label:'摄影连作中段'},echo:'noon',actors:{'lin-cen':{at:[-42,.18,-96],pose:'walk'},'zhou-xu':{at:[-44,.18,-94.25],pose:'walk'}},hints:['沿庭院铺装走到中段。','同伴在庭院前方，跟到中段。','中段完成后，拍摄第二个构图。'],next:'longshot-second'},
  {id:'longshot-second',photoSubjects:["lin-cen","zhou-xu"],participants:["lin-cen","zhou-xu"],chapter:4,title:'窗格接住正午',kind:'photo',objective:'将林岑、周序与身后的窗格一起拍下（2/3）。',target:{position:[-46,.18,-98],radius:5,label:'摄影连作中段',lookAt:[-43,1.1,-95.125]},photoLabel:'三个人的镜头·中段',echo:'noon',next:'longshot-third-position'},
  {id:'longshot-third-position',chapter:4,title:'三种光，同一个校园',kind:'travel',objective:'走到庭院北侧的最后机位。',target:{position:[-42,.18,-94.25],radius:1.25,label:'共同镜头终点'},echo:'all',actors:{'lin-cen':{at:[-47,.18,-97.25],pose:'wave'},'zhou-xu':{at:[-46,.18,-99],pose:'camera'}},hints:['看向林岑和周序，沿铺装走到最后机位。','终点在庭院北侧，仍在室外铺装上。','回望同伴，再拍第三张。'],next:'longshot-third'},
  {id:'longshot-third',photoSubjects:["lin-cen","zhou-xu"],participants:["lin-cen","zhou-xu"],chapter:4,title:'今天的人',kind:'photo',objective:'回望林岑和周序，拍下最后一张连作（3/3）。',target:{position:[-42,.18,-94.25],radius:5,label:'摄影连作终点',lookAt:[-46.5,1.1,-98.125]},photoLabel:'三个人的镜头·结束',echo:'all',next:'longshot-end'},
  {id:'longshot-end',chapter:4,title:'就到这里',kind:'dialogue',objective:'和同伴一起结束拍摄。',lines:[l('lin-cen','好了。'),l('zhou-xu','这次是她喊的。最后一张拍好了。'),l('xu-yuan','拍到了。'),l('zhou-xu','还要补吗？'),l('xu-yuan','不补了。'),l('lin-cen','那就回去放一次。谁觉得不合适，谁就说。')],next:'editing-place'},
  {id:'editing-place',chapter:5,title:'只放这些',kind:'travel',objective:'跟同伴回到庭院南侧的放映设备旁。',target:{position:STORY_START,radius:3,label:'放映与剪辑位置'},echo:'none',hints:['器材就在最初试音的南侧铺装上。','沿铺装向南绕过花池，不用再次上楼。','回到放映设备旁，和同伴一起选片。'],next:'editing-conversation',actors:{'lin-cen':{at:STORY_STAGE.actors['lin-cen'],pose:'listen',route:[...yardToStage,[-48,.185,-115.75],STORY_STAGE.actors['lin-cen']]},'zhou-xu':{at:STORY_STAGE.actors['zhou-xu'],pose:'listen',route:[...yardToStage,[-44,.185,-115.75],STORY_STAGE.actors['zhou-xu']]}}},
  {id:'editing-conversation',chapter:5,title:'给片子留一个出口',kind:'dialogue',objective:'和同伴一起准备放映。',lines:[l('dafei','这回线插上了吗？'),l('zhou-xu','您别提这个了。'),l('dafei','行。试一下声音，我替你们听。'),l('lin-cen','名字放慢一点。'),l('xu-yuan','这次来得及看清。'),l('zhou-xu','拍到的都在这儿，不用的就留在相册里。')],next:'film-order'},
  {id:'film-order',chapter:5,title:'开头留给谁',kind:'edit',objective:'决定影片先看校园，还是先看同伴。',choices:[
    {label:'优先把校园的照片放在前面。',flags:{filmOrder:'campus'},reply:[l('lin-cen','接到人的时候别太快。让我们真的走进来。')]},
    {label:'优先把同伴的照片放在前面。',flags:{filmOrder:'people'},reply:[l('zhou-xu','那就先看我们。拍得糟一点也没关系。')]},
  ],next:'film-selection'},
  {id:'film-selection',chapter:5,title:'把这些留下',kind:'edit',objective:'选出 3–6 张照片，一起放映。',hints:['挑出今天想一起放的照片。','点照片可以加入或移出成片，未选的仍留在相册。','至少选三张，再按“完成选片”。'],next:'screening'},
  {id:'screening',chapter:5,title:'我们的成片',kind:'screening',objective:'一起看完这部片子。可以暂停，也可以跳到片尾。',echo:'all',next:'screening-end'},
  {id:'screening-end',chapter:5,title:'看完之后',kind:'dialogue',objective:'听同伴说完，收起放映设备。',lines:[l('lin-cen','我看见名字了。'),l('zhou-xu','这几张接起来，真像今天一起走过的路。'),l('xu-yuan','你说不放的那段，没有放。'),l('lin-cen','嗯。没放进去的，也不用补满。'),l('zhou-xu','挺好。回去吗？')],next:'pack-equipment'},
  {id:'pack-equipment',chapter:6,title:'关掉投影机',kind:'cooperate',objective:'关掉投影机，收好相机。',choices:[{label:'关掉投影机，收好相机。',flags:{packed:'yes'}}],echo:'none',next:'walk-home'},
  {id:'walk-home',chapter:6,title:'普通的一条路',kind:'travel',objective:'沿庭院南侧道路，和同伴走到约定的路口。',target:{position:[-24,.18,-100],radius:4,label:'一起离开的路口'},hints:['林岑和周序往庭院东侧走了。','沿铺装绕过花池，再向东走到路口。','收好相机，和他们一起走到路口。'],next:'tomorrow',actors:{'lin-cen':{at:[-25,.067,-99],pose:'walk',route:[[-48,.185,-115.75],[-42,.185,-115.75],[-25,.067,-116.75],[-25,.067,-110],[-25,.067,-104],[-25,.067,-99]]},'zhou-xu':{at:[-25,.067,-102],pose:'walk',route:[[-44,.185,-115.75],[-42,.185,-115.75],[-25,.067,-116.75],[-25,.067,-110],[-25,.067,-104],[-25,.067,-102]]}}},
  {id:'tomorrow',chapter:6,title:'明天，照常见',kind:'dialogue',objective:'和他们道别。',lines:[l('zhou-xu','走不走？'),l('lin-cen','明早那道题，你还讲吗？'),l('xu-yuan','你带来。我先看看。'),l('zhou-xu','明天见。')],next:'finished'},
  {id:'finished',chapter:6,title:'明天，照常见',kind:'finish',objective:'明天，照常见。可以继续摄影漫游，或回到菜单。',echo:'none'},
];

export const STORY_BY_ID=new Map(STORY_STEPS.map(s=>[s.id,s]));
