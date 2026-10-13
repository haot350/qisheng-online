import {useEffect,useRef,useState} from 'react';
import type {StorySnapshot} from './story';
import type {StoryGuidanceAction} from './story/types';
import type {PhotoGuideSnapshot} from './types';
import './story.css';
import {useModalFocus} from './modal-focus';
import {deviceGuidance,storyObjectiveCopy} from './story/guidance';

export type StoryHUDProps={
  snapshot:StorySnapshot; onInteract:()=>void; onAdvance:()=>void; onChoose:(index:number)=>void;
  onSkipIntro:()=>void; onPhoto:()=>void; onArchive:()=>void; onPause:()=>void; onHint:()=>void;
  onSkipCinematic?:()=>void;onSkipCredits?:()=>void;onAlbum?:()=>void;
  onGuidance?:(action:StoryGuidanceAction)=>void;
  onPresentOnly?:(present:boolean)=>void; onExport?:()=>void; onImport?:(file:File)=>void; onChooseImport?:()=>void; onRetryRealityHints?:()=>void;
  onOverlayChange?:(open:boolean)=>void; onReturnMenu?:()=>void; onContinueRoam?:()=>void;
  suspended?:boolean; touch?:boolean; realityHints?:boolean; realityHintState?:PhotoGuideSnapshot["referenceState"]; onRealityHintsChange?:(enabled:boolean)=>void;
};
export function StoryHUD({snapshot:s,onInteract,onAdvance,onChoose,onSkipIntro,onSkipCinematic,onSkipCredits,onAlbum,onGuidance,onPhoto,onArchive,onPause,onHint,onPresentOnly,onExport,onChooseImport,onRetryRealityHints,onOverlayChange,onReturnMenu,onContinueRoam,suspended=false,touch=false,realityHints=false,realityHintState,onRealityHintsChange}:StoryHUDProps){
  const [historyOpen,setHistoryOpen]=useState(false),[portraitFailed,setPortraitFailed]=useState(''),[helpOpen,setHelpOpen]=useState(false);
  const lastStep=useRef(s.step);
  const overlayCallback=useRef(onOverlayChange),historyState=useRef(historyOpen);overlayCallback.current=onOverlayChange;
  const controls=useRef({onAdvance,onSkipIntro,suspended});controls.current={onAdvance,onSkipIntro,suspended};
  useEffect(()=>{if(lastStep.current!==s.step){lastStep.current=s.step;setPortraitFailed('');}},[s.step]);
  // Frame snapshots replace parent props. A new callback identity must never
  // close/reopen the modal or reset live camera/movement input every frame.
  useEffect(()=>{historyState.current=historyOpen;overlayCallback.current?.(historyOpen);},[historyOpen]);
  useEffect(()=>()=>{if(historyState.current)overlayCallback.current?.(false);},[]);
  useEffect(()=>{if(!s.dialogue||historyOpen)return;const key=(e:KeyboardEvent)=>{if(controls.current.suspended||e.repeat||e.target instanceof HTMLInputElement||e.target instanceof HTMLButtonElement||e.target instanceof HTMLTextAreaElement)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();controls.current.onAdvance();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[!!s.dialogue,historyOpen]);
  const historyRef=useRef<HTMLElement|null>(null);useModalFocus(historyRef,historyOpen);const blocked=suspended||historyOpen;
 useEffect(()=>{if(!historyOpen)return;const key=(e:KeyboardEvent)=>{if(e.code!=='Escape')return;e.preventDefault();e.stopImmediatePropagation();setHistoryOpen(false);};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[historyOpen]);
 const currentFilm=s.film[Math.min(s.film.length-1,Math.floor(s.screeningTime/7))];
 const focusSubject=s.step==='yard-first-shot'?'庭院与教学楼':s.photoTask?.subjects.map(id=>id==='lin-cen'?'林岑':id==='zhou-xu'?'周序':'主体').join('和')||'主体';
 const guide=deviceGuidance(s.guidance,touch,focusSubject),instruction=storyObjectiveCopy(s);
  const filmCredits=s.screeningTime>=s.film.length*7;
  const photoSelecting=s.step==='film-selection';
  const creditOpacity=Math.max(0,Math.min(1,s.introTime-53,65-s.introTime));
  return <div className={`story-ui ${touch?'story-touch':''} ${s.introActive?'story-cinematic':''} ${suspended?'story-suspended':''}`}>
    {!s.introActive&&!s.finished&&!s.screeningActive&&<>
      {!s.dialogue&&!s.options.length&&!s.guidance.active&&<section className="story-objective" aria-live="polite"><span className="story-chapter">{String(s.chapter).padStart(2,'0')} · {s.chapterTitle}</span><p>{instruction.action}</p>{instruction.blocker&&<small className="story-blocker" role="status">{instruction.blocker}</small>}{s.distance!==null&&!s.dialogue&&!s.options.length&&<small>{s.navigation?.visible!==false&&s.navigation&&<i className="story-direction" aria-hidden="true" style={{transform:`rotate(${s.navigation.bearing}rad)`}}>↑</i>}{s.navigation?.label??s.target?.label} · {s.distance<2?'就在附近':`${Math.round(s.navigation?.distance??s.distance)} 米`}{s.navigation?.floorHint&&` · ${s.navigation.floorHint}`}</small>}</section>}
      <nav className="story-tools" aria-label="故事工具">
        <button onClick={onPhoto} disabled={blocked||s.cinematicActive||!s.cameraReceived} aria-label="举起或收起相机">相机</button>
        <button onClick={onArchive} disabled={blocked}>校园实拍</button>
        <button onClick={()=>setHistoryOpen(true)} disabled={blocked}>对白记录</button>
        <button onClick={onPause} disabled={blocked} aria-label="暂停故事">Ⅱ</button>
      </nav>
      <div className="story-assist"><button onClick={()=>setHelpOpen(v=>!v)} disabled={blocked}>提示</button>{s.echo!=='none'||s.presentOnly?<button onClick={()=>onPresentOnly?.(!s.presentOnly)} disabled={blocked}>{s.presentOnly?'显示叠影':'关闭叠影'}</button>:null}</div>
      {helpOpen&&<aside className="story-help-popover"><button onClick={()=>{onHint();setHelpOpen(false);}} disabled={blocked}>查看当前提示</button><button onClick={()=>{onGuidance?.('route-help');setHelpOpen(false);}} disabled={blocked||!s.target}>{s.guidance.routeHelpRequested?'收起前进方向':'显示前进方向'}</button><button onClick={()=>{onGuidance?.('replay');setHelpOpen(false);}} disabled={blocked||!s.cameraReceived}>重新练习操作</button><label className="story-photo-guide-toggle"><input type="checkbox" checked={realityHints} disabled={blocked} onChange={e=>onRealityHintsChange?.(e.target.checked)}/>实拍机位提示</label><small>黄色：任务机位。蓝色：校园实拍机位。{realityHintState==='loading'?'正在载入提示。':realityHintState==='error'?'机位提示未能载入。':''}</small>{realityHintState==='error'&&onRetryRealityHints&&<button onClick={onRetryRealityHints} disabled={blocked}>重试机位提示</button>}</aside>}
      {s.hint&&!s.dialogue&&!s.options.length&&!s.guidance.active&&!helpOpen&&<aside className="story-hint" role="status">{s.hint}</aside>}
      {s.guidance.active&&!helpOpen&&!s.dialogue&&!s.options.length&&<aside className="story-guidance" role="status"><strong>{guide.title}</strong><p>{guide.body}</p><button onClick={()=>onGuidance?.('skip')} disabled={blocked}>跳过操作引导</button></aside>}
      {s.guidance.stalled&&!s.guidance.active&&!s.dialogue&&!s.options.length&&!s.guidance.routeHelpRequested&&<aside className="story-stall-help">需要一点方向吗？<button onClick={()=>onGuidance?.('route-help')} disabled={blocked}>看看路线</button></aside>}
      {s.notice&&!s.lastCaptureResult&&<div className="story-notice" role="status">{s.notice}</div>}
      {s.cooperation&&!s.dialogue&&<div className="story-sync" aria-live="polite"><small>{s.cooperation.assisted?'同步协助已开启':s.cooperation.label}</small><span aria-label={s.cooperation.ready?'可以开始':'等待手势'}>{[0,1,2].map(i=><b key={i} className={s.cooperation!.gesture>=i+1?'lit':''}/>)}</span>{s.cooperation.canEnableAssist&&<button onClick={()=>onGuidance?.('enable-sync')} disabled={blocked}>开启同步协助</button>}</div>}
      
      {!s.dialogue&&!s.options.length&&s.kind!=='photo'&&s.canInteract&&<button className="story-interact" onClick={onInteract} disabled={blocked}>{touch?s.interaction.label:`E · ${s.interaction.label}`}</button>}
      {!s.dialogue&&!s.options.length&&s.kind==='photo'&&<button className="story-interact" onClick={onPhoto} disabled={blocked}>{touch?'举起相机':'C · 举起相机'}</button>}
    </>}
    {s.introActive&&<>
      <button className="story-opening-pause" onClick={onPause} disabled={blocked} aria-label="暂停开场">Ⅱ</button><button className="story-skip" onClick={onSkipIntro} disabled={blocked}>跳过开场</button>
      {s.introCredit&&<div className="story-credit" style={{opacity:creditOpacity}} aria-label="由 OpenAI GPT-6 Astra 制作"><span>由 OpenAI</span><span>GPT-6 Astra 制作</span></div>}
      {s.introTitle&&<div className="story-title"><span>齐盛 · 校园影像</span><h1>{s.introTitle}</h1><p>2027 年春 · 一次模拟考试之后</p></div>}
    </>}
    {s.cinematicActive&&<button className="story-camera-skip" onClick={onSkipCinematic??onSkipIntro} disabled={blocked}>跳过镜头</button>}
      {s.step==='approved-comparison'&&!suspended&&<div className="story-comparison" aria-label="你们获准使用的两张任务照片">{['yard-with-friends','reflector-capture'].map(task=>{const p=s.comparison.find(photo=>photo.taskId===task);return <figure key={task}>{p?.url?<img src={p.url} alt={p.label??'获准使用的任务照片'}/>:<div>这张照片已不在本机相册中。仍可继续对话。</div>}<figcaption>{task==='yard-with-friends'?'庭院：同伴与校园':'窗边：同伴与光'}</figcaption></figure>;})}</div>}
    {s.dialogue&&!(s.introActive&&s.introCredit)&&<section className={`story-dialogue ${s.introActive?'story-opening-dialogue':''}`} aria-label={`${s.dialogue.speakerName}的对白`}>
      {!s.introActive&&s.dialogue.portraitUrl&&portraitFailed!==s.dialogue.portraitUrl&&<img className="story-portrait" src={s.dialogue.portraitUrl} alt="" onError={()=>setPortraitFailed(s.dialogue!.portraitUrl!)}/>}
      <button className="story-dialogue-line" onClick={onAdvance} disabled={blocked||s.introActive} aria-label={s.dialogue.complete?'下一句对白':'显示完整对白'}>
        <strong>{s.dialogue.speakerName}</strong><span>{s.dialogue.text||'\u00a0'}</span>{!s.introActive&&<small>{s.dialogue.complete?(s.cinematicActive?'镜头进行中':'点击继续'):'点击补全'}</small>}
      </button>
    </section>}
    {!s.dialogue&&!s.introActive&&(s.options.length>0||photoSelecting)&&<section className={`story-choices ${photoSelecting?'story-selection':''}`} aria-label={photoSelecting?'选择影片照片':'对话选项'}>
      <h2>{s.stepTitle}</h2><p>{s.objective}</p>
      {photoSelecting?<>
        <div className="story-photo-grid">{s.photos.map((p,index)=><button key={p.id} className={s.selected.includes(p.id)?'selected':''} onClick={()=>onChoose(index)} disabled={blocked||(!p.url&&!s.selected.includes(p.id))} aria-pressed={s.selected.includes(p.id)}>{p.url?<img src={p.url} alt={p.label??'你的校园照片'}/>:<span className="story-photo-unavailable">照片不可用</span>}<span>{p.taskId?'任务照片 · ':'随拍 · '}{p.label??`照片 ${index+1}`}</span>{s.selected.includes(p.id)&&<b aria-label="已选">✓</b>}</button>)}</div>
        <footer><span>已选 {s.selected.filter(id=>s.photos.some(p=>p.id===id&&p.url)).length} / 6 张</span>{s.photos.filter(p=>p.url).length<3&&<button onClick={onPhoto} disabled={blocked}>举起相机，补拍照片</button>}<button className="story-primary" onClick={onInteract} disabled={blocked||s.selected.filter(id=>s.photos.some(p=>p.id===id&&p.url)).length<3}>完成选片，开始放映</button></footer>
      </>:<div className="story-choice-buttons">{s.options.map(c=><button key={c.index} onClick={()=>onChoose(c.index)} disabled={blocked}>{c.label}<span aria-hidden="true">↗</span></button>)}</div>}
    </section>}
    {s.screeningActive&&<section className="story-screening" aria-label="你们的成片">
      {!filmCredits&&currentFilm?.photos[0]?.url&&<img key={currentFilm.id} src={currentFilm.photos[0].url} alt={currentFilm.title}/>}
      <div className={`story-film-caption ${filmCredits?'story-film-credits':''}`}><small>{filmCredits?'明天，照常见':currentFilm?.title??'明天，照常见'}</small><p>{filmCredits?'许原　林岑　周序':currentFilm?.caption??'许原　林岑　周序'}</p>{filmCredits&&<p>拍摄、剪辑、收拾器材：三个人。</p>}</div>
      <div className="story-film-controls"><button onClick={onPause} disabled={blocked}>暂停</button><button onClick={onSkipCredits??onAdvance} disabled={blocked||filmCredits}>到片尾</button></div>
      <progress aria-label="影片放映进度" max={s.screeningDuration} value={s.screeningTime}/>
    </section>}
    {s.finished&&<section className="story-ending" aria-labelledby="story-ending-title"><span className="story-chapter">故事完成 · 预览版</span><h1 id="story-ending-title">明天，照常见</h1><p>许原、林岑、周序的镜头，到这里结束。<br/>你拍下的校园，可以从这里再看一遍。</p><div className="story-ending-photos">{s.film.slice(0,3).map(f=>f.photos[0]?.url&&<img key={f.id} src={f.photos[0].url} alt={f.title}/>)}</div>{s.photos.some(p=>p.persisted===false&&p.url)&&<p>有照片暂留在本次游玩中，离开前请打开相册导出。</p>}<div className="story-ending-actions"><button className="story-primary" disabled={blocked} onClick={onContinueRoam??onPhoto}>继续摄影漫游</button><button disabled={blocked} onClick={onAlbum??onArchive}>打开相册</button><button disabled={blocked} onClick={onArchive}>校园实拍</button><button disabled={blocked} onClick={onReturnMenu??onPause}>返回菜单</button></div><details><summary>制作与资料</summary><p>校园资料、空间校准与项目发起：项目制作者。剧情、程序与视听制作协助：OpenAI GPT-6 Astra。许原、林岑、周序为虚构人物。历史实拍与虚构故事分别标注来源。</p><p>剧情音乐：<a href="https://www.scottbuckley.com.au/" target="_blank" rel="noopener noreferrer">Scott Buckley</a> 创作的 <a href="https://www.scottbuckley.com.au/library/childhood/" target="_blank" rel="noopener noreferrer">Childhood</a>、<a href="https://www.scottbuckley.com.au/library/aphelion/" target="_blank" rel="noopener noreferrer">Aphelion</a> 与 <a href="https://www.scottbuckley.com.au/library/golden-hour/" target="_blank" rel="noopener noreferrer">Golden Hour</a>，依据 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> 使用。</p><p>游戏播放进行音量与片段编排，保留原音频。<a href="/story/audio/ATTRIBUTION.txt" target="_blank" rel="noopener noreferrer">查看完整音乐署名</a>；其他资源来源以发行包许可证清单为准。</p></details></section>}
    {historyOpen&&<section ref={historyRef} tabIndex={-1} className="story-history" role="dialog" aria-modal="true" aria-labelledby="story-history-title"><div><header><h2 id="story-history-title">刚才的对白</h2><button onClick={()=>setHistoryOpen(false)} aria-label="关闭对白记录">关闭</button></header><div className="story-history-lines">{s.history.length?s.history.map((line,i)=><p key={`${line.step}-${i}`}><strong>{({ 'xu-yuan':'许原','lin-cen':'林岑','zhou-xu':'周序',dafei:'大飞老师',principal:'程国涛',narrator:'校园影像' } as const)[line.speaker]}</strong><span>{line.text}</span></p>):<p>后续的对白会保留在这里。</p>}</div><footer>{onExport&&<button onClick={onExport}>导出故事进度</button>}{onChooseImport&&<button onClick={()=>{setHistoryOpen(false);onChooseImport();}}>导入故事进度</button>}<small>进度文件不包含照片；照片请从相册另行导出。</small></footer></div></section>}
  </div>;
}

