import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useDialogFocus} from './dialog-focus';
import {LATEST_RELEASE} from './releases';
import {isReleaseUnread,subscribeReleaseRead} from './release-read';
import type {ReactNode} from 'react';
import type {Mode} from './types';
import storyDesktop from './assets/mode-covers/story-desktop.webp';
import storyMobile from './assets/mode-covers/story-mobile.webp';
import escapeDesktop from './assets/mode-covers/escape-desktop.webp';
import escapeMobile from './assets/mode-covers/escape-mobile.webp';
import dafeiDesktop from './assets/mode-covers/dafei-desktop.webp';
import dafeiMobile from './assets/mode-covers/dafei-mobile.webp';
import roamDesktop from './assets/mode-covers/roam-desktop.webp';
import roamMobile from './assets/mode-covers/roam-mobile.webp';
import './menu.css';
import {BrandLogo} from './BrandLogo';
import {NativeDownloads} from './NativeDownloads';
import {recentPlayName,type RecentPlay} from './recent-mode';
import {MenuNavigation,type MenuPageId} from './MenuPages';
import '@qisheng/shared/player-content/reading.css';
import './branding.css';
const MODE_COVERS:Record<Mode,{desktop:string;mobile:string;entry:string}>={
 story:{desktop:storyDesktop,mobile:storyMobile,entry:'走进故事'},
 escape:{desktop:escapeDesktop,mobile:escapeMobile,entry:'选择玩法'},
 dafei:{desktop:dafeiDesktop,mobile:dafeiMobile,entry:'开始驾驶'},
 roam:{desktop:roamDesktop,mobile:roamMobile,entry:'走进校园'},
};
function ModeCover({mode,preparation=false}:{mode:Mode;preparation?:boolean}){const cover=MODE_COVERS[mode];return <picture className={preparation?'menu-prep-art':'menu-cover'}><source media="(max-width:1100px)" srcSet={cover.mobile}/><img src={cover.desktop} alt="" decoding="async" draggable={false}/></picture>;}
export const PLAY_MODES:{id:Mode;label:string;description:string;detail:string}[]=[
{id:'story',label:'明天，照常见',description:'借一台相机，和朋友把今天留在照片里。',detail:'七章校园故事 · 摄影与同行'},
{id:'escape',label:'校园突围',description:'完成行动任务，应对追兵，守住校门撤离。',detail:'单人突围 · 合作突围 · 玩家对战'},
{id:'dafei',label:'大飞模式',description:'驾驶越野车穿过校园，撞飞追逐者争取高分。',detail:'五分钟驾驶 · 自动／手动六挡'},
{id:'roam',label:'自由漫游',description:'走过道路与庭院，探索室内，随时举起相机。',detail:'自由探索 · 没有追逐与倒计时'},
];
export type EscapeEntry='single'|'coop'|'pvp';
export function MainMenu({active=true,screen,mode,entry,variant,onMode,onHome,onModes,onAbout,onEntry,onVariant,onStart,onContinue,hasSave,disabled,busy,version,controls,status,onSettings,onRanking,onIdentity,onFeedback,onAssistant,onCredits,feedbackUnread=false,onHelp,onFAQ,prepareState='idle',prepareProgress=0,saveDataWaiting=false,onPrepare,announcement,unavailable={},recent,onRecent,onStoryPrepare}:{recent?:RecentPlay|null;onRecent?:()=>void;onStoryPrepare?:()=>void;active?:boolean;announcement?:ReactNode;unavailable?:Partial<Record<Mode|'single'|'coop'|'tdm'|'ffa',boolean>>;prepareState?:'idle'|'loading'|'ready'|'error';prepareProgress?:number;saveDataWaiting?:boolean;onPrepare?:()=>void;screen:'home'|'modes'|'prepare';mode:Mode;entry:EscapeEntry;variant:'tdm'|'ffa';onMode:(mode:Mode)=>void;onHome:()=>void;onModes:()=>void;onAbout:()=>void;onEntry:(entry:EscapeEntry)=>void;onVariant:(variant:'tdm'|'ffa')=>void;onStart:()=>void;onContinue:()=>void;hasSave:boolean;disabled:boolean;busy:boolean;version:string;controls:ReactNode;status:ReactNode;onSettings:()=>void;onRanking:()=>void;onIdentity:()=>void;identity:string;onFeedback:()=>void;onAssistant?:()=>void;onCredits:()=>void;feedbackUnread?:boolean;onHelp:()=>void;onFAQ:()=>void;onUpdates:()=>void}){
 const [updatesUnread,setUpdatesUnread]=useState(()=>isReleaseUnread(LATEST_RELEASE));
 useEffect(()=>subscribeReleaseRead(()=>setUpdatesUnread(isReleaseUnread(LATEST_RELEASE))),[]);
 const menuRef=useRef<HTMLElement>(null),previousScreen=useRef(screen),menuScroll=useRef(0),locations=useRef<Record<string,{scroll:number;focus?:string}>>({});
 useLayoutEffect(()=>{if(active&&menuRef.current)menuRef.current.scrollTop=menuScroll.current;},[active]);
 const navigate=(next:()=>void)=>{locations.current[screen]={scroll:menuRef.current?.scrollTop??0,focus:(document.activeElement as HTMLElement)?.dataset.menuFocus};next();};
 useLayoutEffect(()=>{if(previousScreen.current===screen)return;previousScreen.current=screen;const entry=locations.current[screen],shell=menuRef.current;if(!shell)return;shell.scrollTop=entry?.scroll??0;const target=entry?.focus?shell.querySelector<HTMLElement>(`[data-menu-focus="${entry.focus}"]`):null;(target??shell.querySelector<HTMLElement>(screen==='home'?'.menu-home-start':screen==='modes'?'.menu-mode-card':'.menu-back'))?.focus({preventScroll:true});},[screen]);
 const selected=PLAY_MODES.find(m=>m.id===mode)!;
 const multiplayer=mode==='escape'&&entry!=='single';
 return <section ref={menuRef} className={'campus-menu menu-'+screen+(screen==='prepare'&&mode==='escape'?' tactical-menu':'')} hidden={!active} inert={!active} aria-label="游戏菜单" onScroll={event=>{if(active)menuScroll.current=event.currentTarget.scrollTop;}}>
  {screen==='prepare'&&<><ModeCover mode={mode} preparation/><div className="menu-prep-wash"/></>}
  {screen!=='prepare'&&<MenuNavigation active="start" onRoot={()=>navigate(onHome)} onNavigate={(page:MenuPageId)=>{({account:onIdentity,ranking:onRanking,feedback:onFeedback,assistant:onAssistant??onHelp,settings:onSettings,faq:onFAQ,about:onAbout,help:onHelp,updates:onAbout,credits:onCredits,copyright:onAbout})[page]();}} feedbackUnread={feedbackUnread} updatesUnread={updatesUnread} mobileHome={screen==='home'}/>}
  <div className="menu-main-content">
  {announcement}
  {screen==='home'?<div className="menu-landing"><div className="menu-landing-art" aria-hidden="true"><ModeCover mode="roam"/><div/></div><div className="menu-landing-copy"><p className="menu-eyebrow">齐盛 · 数字校园</p><h1 className="menu-brand-title"><BrandLogo/></h1><p className="menu-landing-subtitle">从熟悉的校园，开始新的故事。</p><button className="menu-home-cta primary" data-menu-focus="home-play" disabled={busy} onClick={()=>navigate(onModes)}>开始游玩 <span aria-hidden="true">→</span></button>{(recent||hasSave)&&<div className="menu-quick-play">{recent&&<button disabled={busy} onClick={onRecent}><small>最近游玩</small><strong>{recentPlayName(recent)}</strong><span aria-hidden="true">→</span></button>}{hasSave&&recent?.mode!=='story'&&<button disabled={busy} onClick={onStoryPrepare}><small>明天，照常见</small><strong>继续上次的故事</strong><span aria-hidden="true">→</span></button>}</div>}</div></div>:screen==='modes'?<div className="menu-home-content"><button className="menu-back" data-menu-focus="back" onClick={()=>navigate(onHome)}>← 返回主菜单</button><div className="menu-heading"><h1>选择玩法</h1></div><div className="menu-mode-grid">{PLAY_MODES.map(m=><button className={'menu-mode-card mode-card-'+m.id} data-menu-focus={m.id} key={m.id} onClick={()=>navigate(()=>onMode(m.id))}><ModeCover mode={m.id}/><span className="menu-cover-shade"/><span className="menu-card-copy"><h2>{m.label}</h2>{unavailable[m.id]&&<span className="menu-unavailable">暂不可用</span>}<span className="menu-card-description">{m.description}</span><span className="menu-card-bottom"><span>{MODE_COVERS[m.id].entry}</span><span aria-hidden="true">↗</span></span></span></button>)}</div></div>:
  <div className="menu-preparation"><button className="menu-back" data-menu-focus="back" onClick={()=>navigate(onHome)} disabled={busy}>← 返回主菜单</button><div className="menu-prep-grid"><div className="menu-prep-intro"><p className="menu-eyebrow">准备出发</p><h1>{selected.label}</h1><p>{mode==='escape'&&entry==='pvp'?'选择装备，在校园中与其他玩家交战。':mode==='escape'&&entry==='coop'?'和同伴完成行动任务，一起从校门撤离。':selected.description}</p><button className="menu-inline" onClick={onHelp}>操作说明 ↗</button></div><section className="menu-prep-options" aria-label="游玩准备"><div className="menu-prep-scroll">
   {mode==='escape'&&<><div className="menu-choice-row" role="group" aria-label="突围玩法">{(['single','coop','pvp'] as const).map((value,i)=><button key={value} aria-pressed={entry===value} onClick={()=>onEntry(value)} disabled={busy}>{['单人突围','合作突围','玩家对战'][i]}{(value==='pvp'?unavailable.tdm&&unavailable.ffa:unavailable[value])&&<small>暂不可用</small>}</button>)}</div>{entry==='pvp'&&<div className="menu-choice-row" role="group" aria-label="对战玩法">{(['tdm','ffa'] as const).map((value,i)=><button key={value} aria-pressed={variant===value} onClick={()=>onVariant(value)} disabled={busy}>{['团队对战','个人混战'][i]}{unavailable[value]&&<small>暂不可用</small>}</button>)}</div>}</>}
   {multiplayer?<div className="menu-online-preview"><h2>{entry==='coop'?'和同伴一起撤离':variant==='tdm'?'两队交战':'各自为战'}</h2><p>{entry==='coop'?'2—4 人共同完成任务，可以救援倒地的队友。':variant==='tdm'?'2—8 人自动平衡分队，十分钟内争取更多击倒。':'2—8 人十分钟复活赛，按击倒数决定名次。'}</p></div>:controls}
   {status}</div><div className="menu-prep-actions">{mode==='story'&&hasSave&&<button className="primary wide" disabled={disabled||busy} onClick={onContinue}>继续上次的故事 <span aria-hidden="true">→</span></button>}<button className={mode==='story'&&hasSave?'secondary wide':'primary wide'} onClick={saveDataWaiting?onPrepare:onStart} disabled={busy||(!saveDataWaiting&&disabled)}>{saveDataWaiting?'准备资源':busy?'正在进入…':prepareState==='loading'?'正在准备 '+prepareProgress+'%':prepareState==='error'?'准备未完成':multiplayer?'进入'+(entry==='coop'?'合作':'对战')+'大厅':mode==='story'?(hasSave?'重新开始故事':'开始故事'):mode==='dafei'?'出发前见见大飞老师':'开始游玩'}<span aria-hidden="true">→</span></button></div>
  </section></div></div>}
  {screen==='home'&&status}<footer className="menu-footer"><div><a href="https://zbqsgz.tianhw.top/game">游戏介绍 ↗</a><a href="/copyright/">© 2026 OpenQS · 齐盛Online</a></div><span>{version} · 预览版</span></footer>
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
  <p className="menu-release-meta">{LATEST_RELEASE.version} · 预览版</p>
  <p className="menu-about-intro">在数字校园里同行、探索、驾驶，或与同伴完成一场突围。</p>
  <NativeDownloads/>
  <button className="menu-information-card menu-update-card" onClick={onUpdates}><span className="menu-information-copy"><strong>更新记录{unread&&<span className="menu-update-dot" role="img" aria-label="有未读更新"/>}</strong><time dateTime={LATEST_RELEASE.date}>{LATEST_RELEASE.date}</time><span>{LATEST_RELEASE.overview??LATEST_RELEASE.summary[0]}</span><span className="menu-information-link">查看本次与历史更新 →</span></span></button>
  <div className="menu-about-links">{onCopyright&&<button onClick={onCopyright}>版权与许可 →</button>}<a href="https://zbqsgz.tianhw.top/game" target="_blank" rel="noreferrer">游戏介绍 ↗</a><a href="https://zbqsgz.tianhw.top" target="_blank" rel="noreferrer">校园主站 ↗</a></div><p className="menu-release-meta">© 2026 OpenQS · 齐盛Online</p>
 </div>;
}

