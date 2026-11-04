import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useDialogFocus} from './dialog-focus';
import {LATEST_RELEASE} from './releases';
import {isReleaseUnread,subscribeReleaseRead} from './release-read';
import type {ReactNode} from 'react';
import type {Mode} from './types';
import styles from './MainMenu.module.css';
import {useUIPresentation} from '@qisheng/shared/ui';
import {RefinedScene} from './RefinedMenuShell';
import {BrandLogo} from './BrandLogo';
import {StudioLogo} from './StudioLogo';
import {NativeDownloads} from './NativeDownloads';
import {recentPlayName,type RecentPlay} from './recent-mode';
import {MenuNavigation,type MenuPageId} from './MenuPages';
const escapeDesktop='/ui-b-campus.svg';
const escapeMobile='/ui-b-campus.svg';
const modeScenes={story:'corridor',escape:'gate',dafei:'field',roam:'courtyard'} as const;
function ModeCover({mode,complete=false,composition='responsive',priority=false}:{mode:Mode;complete?:boolean;composition?:'responsive'|'wide';priority?:boolean}){return <RefinedScene priority={priority} scene={modeScenes[mode]} purpose={complete?'complete':'cover'} composition={composition} className={styles.scene}/>;}
export const PLAY_MODES:{id:Mode;label:string;description:string}[]=[
{id:'roam',label:'自由漫游',description:'走过道路与庭院，探索室内，随时举起相机。'},
{id:'escape',label:'校园突围',description:'完成行动任务，应对追兵，守住校门撤离。'},
{id:'story',label:'明天，照常见',description:'借一台相机，和朋友把今天留在照片里。'},
{id:'dafei',label:'大飞模式',description:'驾驶豹5、坦克或电动滑板车，穿行校园争取高分。'},
];
export type EscapeEntry='single'|'coop'|'pvp';
export function MainMenu({practice=false,skipEscapeEntry=false,onTraining,active=true,screen,mode,onMode,onHome,onModes,onAbout,onEntry,onMultiplayer,onStart,onContinue,hasSave,disabled,busy,version,controls,displayControls,optionControls,status,onSettings,onRanking,onIdentity,onFeedback,onAssistant,onBlog,onTest,onCredits,identity,feedbackUnread=false,onHelp,onFAQ,prepareState='idle',announcement,unavailable={},recent,onRecent,onStoryPrepare}: {practice?:boolean;skipEscapeEntry?:boolean;onTraining?:()=>void;recent?:RecentPlay|null;onRecent?:()=>void;onStoryPrepare?:()=>void;active?:boolean;announcement?:ReactNode;unavailable?:Partial<Record<Mode|'single'|'coop'|'tdm'|'ffa',boolean>>;prepareState?:'idle'|'loading'|'ready'|'error';prepareProgress?:number;saveDataWaiting?:boolean;onPrepare?:()=>void;screen:'home'|'modes'|'prepare';mode:Mode;entry:EscapeEntry;variant:'tdm'|'ffa';onMode:(mode:Mode)=>void;onHome:()=>void;onModes:()=>void;onAbout:()=>void;onEntry:(entry:EscapeEntry)=>void;onVariant:(variant:'tdm'|'ffa')=>void;onMultiplayer?:()=>void;onStart:()=>void;onContinue:()=>void;hasSave:boolean;disabled:boolean;busy:boolean;version:string;controls?:ReactNode;displayControls?:ReactNode;optionControls?:ReactNode;status:ReactNode;onSettings:()=>void;onRanking:()=>void;onIdentity:()=>void;identity:string;onFeedback:()=>void;onAssistant?:()=>void;onBlog?:()=>void;onTest?:()=>void;onCredits:()=>void;feedbackUnread?:boolean;onHelp:()=>void;onFAQ:()=>void;onUpdates:()=>void}){
 const presentation=useUIPresentation();
 const [updatesUnread,setUpdatesUnread]=useState(()=>isReleaseUnread(LATEST_RELEASE));
 useEffect(()=>subscribeReleaseRead(()=>setUpdatesUnread(isReleaseUnread(LATEST_RELEASE))),[]);
 const menuRef=useRef<HTMLDivElement>(null),previousScreen=useRef(screen),menuScroll=useRef(0),locations=useRef<Record<string,{scroll:number;focus?:string}>>({});
 useLayoutEffect(()=>{if(active&&menuRef.current)menuRef.current.scrollTop=menuScroll.current;},[active]);
 const navigate=(next:()=>void)=>{locations.current[screen]={scroll:menuRef.current?.scrollTop??0,focus:(document.activeElement as HTMLElement)?.dataset.menuFocus};next();};
 useLayoutEffect(()=>{if(previousScreen.current===screen)return;previousScreen.current=screen;const entry=locations.current[screen],shell=menuRef.current;if(!shell)return;shell.scrollTop=entry?.scroll??0;const target=entry?.focus?shell.querySelector<HTMLElement>(`[data-menu-focus="${entry.focus}"]`):null;(target??shell.querySelector<HTMLElement>(screen==='home'?'[data-menu-focus="home-play"]':screen==='modes'?'[data-menu-mode]':'[data-menu-focus="back"]'))?.focus({preventScroll:true});},[screen]);
 const [prepareStep,setPrepareStep]=useState(0);
 useLayoutEffect(()=>{setPrepareStep(mode==='escape'&&!practice&&skipEscapeEntry?1:0);},[screen,mode,practice,skipEscapeEntry]);
 useLayoutEffect(()=>{if(screen==='prepare'&&menuRef.current){menuRef.current.scrollTop=0;menuRef.current.querySelector<HTMLElement>('[aria-current=step]')?.focus({preventScroll:true});}},[prepareStep,screen]);
 const selected=PLAY_MODES.find(m=>m.id===mode)!;
 const prepareSteps=practice||mode==='roam'||mode==='story'?['本局选项']:mode==='escape'?['选择玩法','选择装备','本局选项']:['选择载具','本局选项'];
 const currentStep=Math.min(prepareStep,prepareSteps.length-1),finalStep=currentStep===prepareSteps.length-1,showEntry=mode==='escape'&&!practice&&currentStep===0,showEquipment=!practice&&(mode==='escape'?currentStep===1:mode==='dafei'&&currentStep===0),showOptions=finalStep;
 const enterSingle=()=>{onEntry('single');setPrepareStep(1);};
 const multiplayerUnavailable=!!unavailable.coop&&!!unavailable.tdm&&!!unavailable.ffa;
 return <section className={styles.menu} data-menu-screen={screen} data-ui-theme={screen==='prepare'&&mode==='escape'?'tactical':'campus'} data-ui-platform={presentation.platform} data-ui-orientation={presentation.orientation} hidden={!active} inert={!active} aria-label="游戏菜单">
  {screen!=='prepare'&&(presentation.platform==='desktop'||screen==='home')&&<MenuNavigation identity={identity} active="start" onRoot={()=>navigate(onHome)} onNavigate={(page:MenuPageId)=>{({account:onIdentity,ranking:onRanking,feedback:onFeedback,assistant:onAssistant??onHelp,blog:onBlog??onAbout,test:onTest??onIdentity,settings:onSettings,faq:onFAQ,about:onAbout,help:onHelp,updates:onAbout,credits:onCredits,copyright:onAbout})[page]();}} feedbackUnread={feedbackUnread} updatesUnread={updatesUnread} mobileHome={screen==='home'}/>}
  <div className={styles.content}>
  <div ref={menuRef} className={styles.scroll} data-menu-scroll onScroll={event=>{if(active)menuScroll.current=event.currentTarget.scrollTop;}}>
  {announcement}
  {screen==='home'?<div className={styles.landing}><div className={styles.landingArt} aria-hidden="true"><ModeCover mode="roam" complete priority/></div><div className={styles.landingCopy}><h1 className={styles.brand}><BrandLogo/></h1><button className={styles.primary} data-menu-focus="home-play" disabled={busy} onClick={()=>navigate(onModes)}>开始游玩 <span aria-hidden="true">→</span></button>{(recent||hasSave)&&<div className={styles.quickPlay}>{recent&&onRecent&&<button disabled={busy} onClick={onRecent}>继续{recentPlayName(recent)}</button>}{hasSave&&recent?.mode!=='story'&&onStoryPrepare&&<button disabled={busy} onClick={onStoryPrepare}>继续上次的故事</button>}</div>}</div></div>:screen==='modes'?<div className={styles.modePage}><header className={styles.heading}><h1>选择玩法</h1><button className={styles.back} data-menu-focus="back" onClick={()=>navigate(onHome)}>返回主菜单</button></header><div className={styles.modeGrid}>{PLAY_MODES.map(m=><button className={styles.modeCard} data-menu-mode={m.id} data-menu-focus={m.id} key={m.id} disabled={busy} onClick={()=>navigate(()=>onMode(m.id))}><ModeCover mode={m.id} complete composition="wide"/><span className={styles.cardCopy}><h2>{m.label}</h2>{unavailable[m.id]&&<span className={styles.unavailable}>暂不可用</span>}<span className={styles.description}>{m.description}</span></span></button>)}</div>{onTraining&&<button className={styles.training} disabled={busy||unavailable.single} onClick={onTraining}>先练习操作</button>}</div>:
  <div className={styles.preparation} data-prepare-mode={mode}><header className={styles.heading}><h1>{practice?'操作练习':selected.label}</h1><button className={styles.back} data-menu-focus="back" onClick={()=>navigate(onHome)} disabled={busy}>返回主菜单</button></header>
   {showEntry?<div className={styles.escapeEntrance}>
    <picture className={styles.escapeArtwork}><source media="(orientation: portrait) and (max-width: 900px)" srcSet={escapeMobile}/><img src={escapeDesktop} alt="" decoding="async" fetchPriority="high"/></picture>
    <div className={styles.entranceChoices} role="group" aria-label="突围玩法"><button className={styles.singleEntrance} type="button" onClick={enterSingle} disabled={busy||unavailable.single}>单人突围{unavailable.single&&<small>暂不可用</small>}</button><button className={styles.multiEntrance} type="button" onClick={()=>onMultiplayer?.()} disabled={busy||multiplayerUnavailable}>多人模式{multiplayerUnavailable&&<small>暂不可用</small>}</button></div>
   </div>:<>
   <nav className={styles.steps} aria-label="开局准备">{prepareSteps.map((label,i)=><button key={label} type="button" aria-current={currentStep===i?'step':undefined} disabled={busy||i>currentStep} onClick={()=>setPrepareStep(i)}>{label}</button>)}{recent?.mode===mode&&(mode==='escape'?currentStep===1:currentStep===0)&&prepareSteps.length>1&&<button className={styles.quickSetup} type="button" disabled={busy} onClick={()=>setPrepareStep(prepareSteps.length-1)}>使用上次配置</button>}</nav>
   {practice?<div className={styles.practice}><h2>熟悉移动与交火</h2><p>依次完成七项操作。</p><button className={styles.inline} onClick={onHelp}>操作说明</button></div>:<div className={styles.prepareLayout} data-has-display={showEquipment||mode==='roam'||mode==='story'} data-step={currentStep}>{showEquipment&&displayControls!=null&&<section className={styles.prepareDisplay} data-prepare-display aria-label={mode==='dafei'?'选择载具':'选择装备'}>{displayControls}</section>}{(mode==='roam'||mode==='story')&&<div className={styles.prepareArt}><ModeCover mode={mode} complete/></div>}{showOptions&&<section className={styles.prepareOptions} data-prepare-options aria-label={prepareSteps[currentStep]}>{optionControls??controls}</section>}</div>}
   {prepareState==='error'&&<div className={styles.status}>{status}</div>}<footer className={styles.actions}>{currentStep>0&&<button className={styles.secondary} disabled={busy} onClick={()=>setPrepareStep(currentStep-1)}>上一步</button>}{!finalStep?<button className={styles.primary} disabled={busy} onClick={()=>setPrepareStep(currentStep+1)}>下一步</button>:<>{mode==='story'&&hasSave&&<button className={styles.primary} disabled={disabled||busy} onClick={onContinue}>继续上次的故事</button>}<button className={mode==='story'&&hasSave?styles.secondary:styles.primary} onClick={onStart} disabled={busy||disabled}>{busy?'正在进入…':practice?'开始练习':mode==='story'?(hasSave?'重新开始故事':'开始故事'):mode==='dafei'?'进入大飞模式':'开始游玩'}</button></>}</footer>
   </>}
  </div>}
  {screen==='home'&&<div className={styles.homeStatus}>{status}</div>}
  </div>
  <footer className={styles.footer}><a href="/copyright/">© 2026 LIUFRAME INTERACTIVE</a><span>{version} 预览版</span></footer>
  </div>
 </section>;
}

export function MenuReadingPanel({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useDialogFocus(true,onClose,true);
 return <div className={styles.shade}><section ref={ref} className={styles.reading} role="dialog" aria-modal="true" aria-labelledby="menu-reading-title">
  <div className={styles.readingHeading}><h2 id="menu-reading-title">{title}</h2><button className={styles.readingClose} aria-label="关闭" onClick={onClose}>×</button></div>
  <div className={styles.readingBody}>{children}</div>
 </section></div>;
}

export function MenuAbout({onUpdates}:{onUpdates:()=>void;onCopyright?:()=>void}) {
 const [unread,setUnread]=useState(()=>isReleaseUnread(LATEST_RELEASE));
 useEffect(()=>subscribeReleaseRead(()=>setUnread(isReleaseUnread(LATEST_RELEASE))),[]);
 return <div className={styles.about}>
  <div className={styles.aboutBrand}><BrandLogo/></div>
  <p className={styles.releaseMeta}>{LATEST_RELEASE.version} 预览版</p>
  <p className={styles.aboutIntro}>自由漫游、摄影，或选择故事、驾驶与枪战玩法。</p>
  <div className={styles.aboutStudio}><p>制作与维护</p><StudioLogo/></div>
  <NativeDownloads/>
  <button className={styles.information} onClick={onUpdates}><span className={styles.informationCopy}><strong>更新记录{unread&&<span className={styles.updateDot} role="img" aria-label="有未读更新"/>}</strong><time dateTime={LATEST_RELEASE.date}>{LATEST_RELEASE.date}</time><span>{LATEST_RELEASE.overview??LATEST_RELEASE.summary[0]}</span></span></button>
  <div className={styles.aboutLinks}><a href="https://zbqsgz.tianhw.top/game" target="_blank" rel="noreferrer">游戏介绍</a><a href="https://zbqsgz.tianhw.top" target="_blank" rel="noreferrer">校园主站</a></div>
 </div>;
}

