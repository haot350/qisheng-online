import type {StoryGuidance,StorySnapshot} from './types';

export function deviceGuidance(guide:StoryGuidance,touch:boolean,subject='主体'):StoryGuidance{
 const copy:Partial<Record<StoryGuidance['stage'],[string,string]>>=touch?{
  move:['先走两步','拖动左侧摇杆。'],look:['看看周围','在右侧空白处拖动，转向同伴。'],
  raise:['把相机举起来','点“相机”。'],focus:['先确认焦点',`对准${subject}，按住“对焦”。`],
  shutter:['留下这一张','点圆形快门。'],close:['放下相机','点“放下相机”，继续和同伴说话。'],
 }:{
  move:['先走两步','按 WASD 移动。'],look:['看看周围','移动鼠标，转向同伴。'],
  raise:['把相机举起来','按 C。'],focus:['先确认焦点',`对准${subject}，按住 F 对焦。`],
  shutter:['留下这一张','按空格拍摄。'],close:['放下相机','按 C，继续和同伴说话。'],
 };
 const text=copy[guide.stage];return text?{...guide,title:text[0],body:text[1]}:guide;
}

/** Task intent stays visible; a waiting reason is not a replacement objective. */
export function storyObjectiveCopy(s:Pick<StorySnapshot,'objective'|'interaction'>){
 return{action:s.objective,blocker:s.interaction.state==='waiting'?s.interaction.reason:undefined};
}
