import {mkdir,writeFile} from 'node:fs/promises';
import {STORY_CHAPTERS,STORY_STEPS,INTRO_SHOTS,INTRO_CAPTIONS,SPEAKERS} from './content.ts';

const destination=new URL('../../docs/v2.0/',import.meta.url);
await mkdir(destination,{recursive:true});
let text='# 《明天，照常见》完整剧本、分镜与互动\n\n版本：v2.0；日期：2026-10-04。此文档直接由实际运行的剧情数据生成。\n\n';
text+='故事发生在2027年春。许原、林岑、周序均为虚构学生；历史实拍保留真实来源，与上周共同拍摄的虚构素材分开标注。所有关键剧情可在简易摄影与静音条件下完成。\n\n';
text+='## 开场：90秒\n\n镜头共享一条可暂停、可跳过的时钟；演员和画面资源缺失时不开始片段。跳过直接应用开场终态，不重复触发对白、音乐或存档。53–65秒显示“GPT-6 制作”，82秒以后显片名。\n\n| 时间 | 镜头位置 | 看向 | 视角 |\n|---|---|---|---|\n';
for(const shot of INTRO_SHOTS)text+=`| ${shot.time}秒 | ${shot.position.join(', ')} | ${shot.lookAt.join(', ')} | ${shot.fov}° |\n`;
text+='\n开场字幕：\n\n';
for(const c of INTRO_CAPTIONS)text+=`- ${c.time}秒　${SPEAKERS[c.line.speaker]}：${c.line.text}\n`;
text+='\n## 章节节奏\n\n建议体验45–60分钟，含照片对照、可选专业摄影和档案浏览；不通过强制等待补足时长。实际通关时间需通过真人试玩记录，尚未声称已验证。\n\n| 章节 | 建议节奏 |\n|---|---|\n| 先试声音 | 2–3分钟 |\n| 画框之外 | 8–10分钟 |\n| 走到另一头 | 10–12分钟 |\n| 不放的十秒 | 8–10分钟 |\n| 三个人的镜头 | 10–12分钟 |\n| 只放这些与尾声 | 7–10分钟 |\n\n';
for(let chapter=0;chapter<STORY_CHAPTERS.length;chapter++){
  text+=`## ${chapter}. ${STORY_CHAPTERS[chapter]}\n\n`;
  for(const step of STORY_STEPS.filter(s=>s.chapter===chapter)){
    text+=`### ${step.title}（${step.id}）\n\n类型：${step.kind}；目标：${step.objective}\n\n`;
    if(step.target)text+=`机位／互动脚底坐标：(${step.target.position.join(', ')})；平面半径${step.target.radius}米；目标层高单独检查。${step.target.lookAt?`取景主体：(${step.target.lookAt.join(', ')})。`:''}\n\n`;
    for(const line of step.lines??[])text+=`${SPEAKERS[line.speaker]}：${line.text}\n\n`;
    for(const [i,choice]of(step.choices??[]).entries()){
      text+=`选项${i+1}：**${choice.label}**\n\n`;
      for(const line of choice.reply??[])text+=`${SPEAKERS[line.speaker]}：${line.text}\n\n`;
      if(choice.flags)text+=`实际变化：${Object.entries(choice.flags).map(([k,v])=>`${k}=${v}`).join('；')}。\n\n`;
    }
    if(step.actors)for(const[id,order]of Object.entries(step.actors))text+=`演员${SPEAKERS[id]}：最终位置(${order.at.join(', ')})；姿态${order.pose??'idle'}；${order.route?.length?`沿${order.route.map(p=>`(${p.join(', ')})`).join(' → ')}移动。`:'由现有导航与胶囊控制器走到目标。'}\n\n`;
    if(step.rhythm)text+=`协作同步：循环${step.rhythm.period}秒，${step.rhythm.windowStart}–${step.rhythm.windowEnd}秒手势窗口；第三次提示提供直接协助，不扣分、不重置章节。\n\n`;
    if(step.photoLabel)text+=`相册标题：${step.photoLabel}；成片只使用玩家实际拍摄的照片。\n\n`;
    if(step.hints?.length)text+=`逐级提示：\n\n${step.hints.map((h,i)=>`${i+1}. ${h}`).join('\n')}\n\n`;
    text+=`后续：${step.next??'故事结束'}。\n\n`;
  }
}
text+='## 素材与同意规则\n\n林岑撤回的十秒从来不作为图片、视频、隐藏奖励或谜题内容加载。比较只使用已经同意的庭院和窗边镜头；替代动作由她选择。相册与影片不得把真实学校照片中的人物当作虚构对白的说话者。\n\n';
text+='## 成片\n\n玩家从实际相册中选择3–6张。开头选择改变校园／同伴的优先顺序，声音选择和替代镜头选择改变字幕。每张播放7秒并保留真实内容，片尾6秒。所有分支通向完整结尾，没有分数或道德评价。\n';
await writeFile(new URL('完整剧本与分镜.md',destination),text,'utf8');
console.log(`Exported ${STORY_STEPS.length} story steps and ${STORY_STEPS.reduce((n,s)=>n+(s.lines?.length??0)+(s.choices?.reduce((a,c)=>a+(c.reply?.length??0),0)??0),0)+INTRO_CAPTIONS.length} dialogue lines.`);
