import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useDialogFocus} from './dialog-focus';
import {LATEST_RELEASE} from './releases';
import {isReleaseUnread,subscribeReleaseRead} from './release-read';
import type {ReactNode} from 'react';
import type {Mode} from './types';
import './menu.css';
import {RefinedScene} from './RefinedMenuShell';
import {isAndroidApp} from './platform/android';
import {BrandLogo} from './BrandLogo';
import {StudioLogo} from './StudioLogo';
import {NativeDownloads} from './NativeDownloads';
import {recentPlayName,type RecentPlay} from './recent-mode';
import {MenuNavigation,type MenuPageId} from './MenuPages';
import '@qisheng/shared/player-content/reading.css';
import './branding.css';
const modeScenes={story:'corridor',escape:'gate',dafei:'field',roam:'courtyard'} as const;
const MODE_ENTRIES={story:'走进故事',escape:'选择玩法',dafei:'开始驾驶',roam:'走进校园'} as const;
function ModeCover({mode,preparation=false}:{mode:Mode;preparation?:boolean}){return <RefinedScene scene={modeScenes[mode]} className={preparation?'menu-prep-art':'menu-cover'}/>;}
export const PLAY_MODES:{id:Mode;label:string;description:string;detail:string}[]=[
{id:'story',label:'明天，照常见',description:'借一台相机，和朋友把今天留在照片里。',detail:'七章校园故事 · 摄影与同行'},
{id:'escape',label:'校园突围',description:'完成行动任务，应对追兵，守住校门撤离。',detail:'单人突围 · 合作突围 · 玩家对战'},
{id:'dafei',label:'大飞模式',description:'驾驶豹5、坦克或电动滑板车，穿行校园争取高分。',detail:'五分钟驾驶 · 三种载具'},
{id:'roam',label:'自由漫游',description:'走过道路与庭院，探索室内，随时举起相机。',detail:'自由探索 · 没有追逐与倒计时'},
];
export type EscapeEntry='single'|'coop'|'pvp';
export function MainMenu({practice=false,onTraining,active=true,screen,mode,entry,variant,onMode,onHome,onModes,onAbout,onEntry,onVariant,onStart,onContinue,hasSave,disabled,busy,version,controls,status,onSettings,onRanking,onIdentity,onFeedback,onAssistant,onCredits,identity,feedbackUnread=false,onHelp,onFAQ,prepareState='idle',prepareProgress=0,saveDataWaiting=false,onPrepare,announcement,unavailable={},recent,onRecent,onStoryPrepare}: {practice?:boolean;onTraining?:()=>void;recent?:RecentPlay|null;onRecent?:()=>void;onStoryPrepare?:()=>void;active?:boolean;announcement?:ReactNode;unavailable?:Partial<Record<Mode|'single'|'coop'|'tdm'|'ffa',boolean>>;prepareState?:'idle'|'loading'|'ready'|'error';prepareProgress?:number;saveDataWaiting?:boolean;onPrepare?:()=>void;screen:'home'|'modes'|'prepare';mode:Mode;entry:EscapeEntry;variant:'tdm'|'ffa';onMode:(mode:Mode)=>void;onHome:()=>void;onModes:()=>void;onAbout:()=>void;onEntry:(entry:EscapeEntry)=>void;onVariant:(variant:'tdm'|'ffa')=>void;onStart:()=>void;onContinue:()=>void;hasSave:boolean;disabled:boolean;busy:boolean;version:string;controls:ReactNode;status:ReactNode;onSettings:()=>void;onRanking:()=>void;onIdentity:()=>void;identity:string;onFeedback:()=>void;onAssistant?:()=>void;onCredits:()=>void;feedbackUnread?:boolean;onHelp:()=>void;onFAQ:()=>void;onUpdates:()=>void}){
 const [updatesUnread,setUpdatesUnread]=useState(()=>isReleaseUnread(LATEST_RELEASE));
 useEffect(()=>subscribeReleaseRead(()=>setUpdatesUnread(isReleaseUnread(LATEST_RELEASE))),[]);
 const menuRef=useRef<HTMLElement>(null),previousScreen=useRef(screen),menuScroll=useRef(0),locations=useRef<Record<string,{scroll:number;focus?:string}>>({});
 useLayoutEffect(()=>{if(active&&menuRef.current)menuRef.current.scrollTop=menuScroll.current;},[active]);
 const navigate=(next:()=>void)=>{locations.current[screen]={scroll:menuRef.current?.scrollTop??0,focus:(document.activeElement as HTMLElement)?.dataset.menuFocus};next();};
 useLayoutEffect(()=>{if(previousScreen.current===screen)return;previousScreen.current=screen;const entry=locations.current[screen],shell=menuRef.current;if(!shell)return;shell.scrollTop=entry?.scroll??0;const target=entry?.focus?shell.querySelector<HTMLElement>(`[data-menu-focus="${entry.focus}"]`):null;(target??shell.querySelector<HTMLElement>(screen==='home'?'.menu-home-cta':screen==='modes'?'.menu-mode-card':'.menu-back'))?.focus({preventScroll:true});},[screen]);
 const selected=PLAY_MODES.find(m=>m.id===mode)!;
 const multiplayer=mode==='escape'&&entry!=='single';
 return <section ref={menuRef} className={'campus-menu b-campus-menu menu-'+screen+(screen==='prepare'&&mode==='escape'?' tactical-menu':'')+(isAndroidApp()?' is-android':'')} hidden={!active} inert={!active} aria-label="游戏菜单" onScroll={event=>{if(active)menuScroll.current=event.currentTarget.scrollTop;}}>
  {screen!=='prepare'&&<MenuNavigation identity={identity} active="start" onRoot={()=>navigate(onHome)} onNavigate={(page:MenuPageId)=>{({account:onIdentity,ranking:onRanking,feedback:onFeedback,assistant:onAssistant??onHelp,settings:onSettings,faq:onFAQ,about:onAbout,help:onHelp,updates:onAbout,credits:onCredits,copyright:onAbout})[page]();}} feedbackUnread={feedbackUnread} updatesUnread={updatesUnread} mobileHome={screen==='home'}/>}
  <div className="menu-main-content">
  {announcement}
  {screen==='home'?<div className="menu-landing"><div className="menu-landing-art" aria-hidden="true"><ModeCover mode="roam"/></div><div className="menu-landing-copy"><h1 className="menu-brand-title"><BrandLogo/></h1><button className="menu-home-cta primary" data-menu-focus="home-play" disabled={busy} onClick={()=>navigate(onModes)}>开始游玩 <span aria-hidden="true">→</span></button>{(recent||hasSave)&&<div className="menu-quick-play">{recent&&<button disabled={busy} onClick={onRecent}>继续{recentPlayName(recent)} <span aria-hidden="true">↗</span></button>}{hasSave&&recent?.mode!=='story'&&<button disabled={busy} onClick={onStoryPrepare}>继续上次的故事 <span aria-hidden="true">↗</span></button>}</div>}</div></div>:screen==='modes'?<div className="menu-home-content"><header className="menu-heading"><h1>选择玩法</h1><button className="menu-back" data-menu-focus="back" onClick={()=>navigate(onHome)}>← 返回主菜单</button></header><div className="menu-mode-grid">{PLAY_MODES.map(m=><button className={'menu-mode-card mode-card-'+m.id} data-menu-focus={m.id} key={m.id} onClick={()=>navigate(()=>onMode(m.id))}><ModeCover mode={m.id}/><span className="menu-card-copy"><h2>{m.label}</h2>{unavailable[m.id]&&<span className="menu-unavailable">暂不可用</span>}<span className="menu-card-description">{m.description}</span><span className="menu-card-bottom"><span>{MODE_ENTRIES[m.id]}</span><span aria-hidden="true">↗</span></span></span></button>)}</div>{onTraining&&<button className="menu-training-entry" disabled={busy||unavailable.single} onClick={onTraining}>先练习操作 <span aria-hidden="true">→</span></button>}</div>:
  <div className={'menu-preparation preparation-'+mode}><header className="menu-preparation-header"><h1>{practice?"操作练习":selected.label}</h1><button className="menu-back" data-menu-focus="back" onClick={()=>navigate(onHome)} disabled={busy}>← 返回主菜单</button></header>
   {mode==='escape'&&!practice&&<div className="menu-entry-choices"><div className="menu-choice-row choice-count-3" role="group" aria-label="突围玩法">{(['single','coop','pvp'] as const).map((value,i)=><button key={value} aria-pressed={entry===value} onClick={()=>onEntry(value)} disabled={busy}>{['单人突围','合作突围','玩家对战'][i]}{(value==='pvp'?unavailable.tdm&&unavailable.ffa:unavailable[value])&&<small>暂不可用</small>}</button>)}</div>{entry==='pvp'&&<div className="menu-choice-row choice-count-2" role="group" aria-label="对战玩法">{(['tdm','ffa'] as const).map((value,i)=><button key={value} aria-pressed={variant===value} onClick={()=>onVariant(value)} disabled={busy}>{['团队对战','个人混战'][i]}{unavailable[value]&&<small>暂不可用</small>}</button>)}</div>}</div>}
   <div className={'menu-prep-layout'+(mode==='escape'||mode==='dafei'?' has-loadout':'')}>{(mode==='roam'||mode==='story')&&<div className="menu-prep-scene"><ModeCover mode={mode} preparation/></div>}<section className="menu-prep-options" aria-label="游玩准备"><div className="menu-prep-scroll">
    {practice?<div className="menu-online-preview"><h2>熟悉移动与交火</h2><p>依次完成七项操作，随时可以结束练习。</p><button className="menu-inline" onClick={onHelp}>操作说明 ↗</button></div>:multiplayer?<div className="menu-online-preview"><ModeCover mode="escape" preparation/><div><h2>{entry==='coop'?'合作突围':variant==='tdm'?'团队对战':'个人混战'}</h2><p>{entry==='coop'?'2—4人共同完成任务，救援倒地的队友，一起撤离。':variant==='tdm'?'2—8人分队交战，十分钟内争取更多击倒。':'2—8人各自为战，十分钟后比较击倒数。'}</p><button className="menu-inline" onClick={onHelp}>玩法规则 ↗</button></div></div>:<div className="menu-prep-controls">{controls}</div>}
   </div></section></div>
   <div className="menu-prep-status">{status}</div><footer className="menu-prep-actions">{mode==='story'&&hasSave&&<button className="primary" disabled={disabled||busy} onClick={onContinue}>继续上次的故事 <span aria-hidden="true">→</span></button>}<button className={mode==='story'&&hasSave?'secondary':'primary'} onClick={saveDataWaiting?onPrepare:onStart} disabled={busy||(!saveDataWaiting&&disabled)}>{saveDataWaiting?'准备资源':busy?'正在进入…':prepareState==='loading'?'正在准备 '+prepareProgress+'%':prepareState==='error'?'准备未完成':practice?'开始练习':multiplayer?'进入'+(entry==='coop'?'合作':'对战')+'大厅':mode==='story'?(hasSave?'重新开始故事':'开始故事'):mode==='dafei'?'出发前见见大飞老师':'开始游玩'}<span aria-hidden="true">→</span></button></footer>
  </div>}
  {screen==='home'&&<div className="menu-home-status">{status}</div>}<footer className="menu-footer"><a href="/copyright/">© 2026 LIUFRAME INTERACTIVE</a><span>{version} 预览版</span></footer>
  </div>
 </section>;
}

export function MenuReadingPanel({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useDialogFocus(true,onClose,true);
 return <div className="modal-shade"><section ref={ref} className="help-panel menu-reading" role="dialog" aria-modal="true" aria-labelledby="menu-reading-title">
  <div className="panel-heading"><h2 id="menu-reading-title">{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}>×</button></div>
  <div className="menu-reading-body">{children}</div>
  <footer className="menu-reading-footer"><button className="secondary" onClick={onClose}>关闭</button></footer>
 </section></div>;
}

export function MenuAbout({onUpdates,onCopyright}:{onUpdates:()=>void;onCopyright?:()=>void}) {
 const [unread,setUnread]=useState(()=>isReleaseUnread(LATEST_RELEASE));
 useEffect(()=>subscribeReleaseRead(()=>setUnread(isReleaseUnread(LATEST_RELEASE))),[]);
 return <div className="menu-about">
  <div className="menu-about-brand"><BrandLogo/></div>
  <p className="menu-release-meta">{LATEST_RELEASE.version} 预览版</p>
  <p className="menu-about-intro">在数字校园里同行、探索、驾驶，或与同伴完成一场突围。</p>
  <div className="menu-about-studio"><p>制作与维护</p><StudioLogo/></div>
  <NativeDownloads/>
  <button className="menu-information-card menu-update-card" onClick={onUpdates}><span className="menu-information-copy"><strong>更新记录{unread&&<span className="menu-update-dot" role="img" aria-label="有未读更新"/>}</strong><time dateTime={LATEST_RELEASE.date}>{LATEST_RELEASE.date}</time><span>{LATEST_RELEASE.overview??LATEST_RELEASE.summary[0]}</span><span className="menu-information-link">查看本次与历史更新 →</span></span></button>
  <div className="menu-about-links">{onCopyright&&<button onClick={onCopyright}>版权与许可 →</button>}<a href="https://zbqsgz.tianhw.top/game" target="_blank" rel="noreferrer">游戏介绍 ↗</a><a href="https://zbqsgz.tianhw.top" target="_blank" rel="noreferrer">校园主站 ↗</a></div><p className="menu-release-meta">© 2026 LIUFRAME INTERACTIVE 齐盛Online</p>
 </div>;
}

