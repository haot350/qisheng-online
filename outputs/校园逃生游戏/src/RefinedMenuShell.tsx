import {useEffect,useRef,useState,type ReactNode} from 'react';
import {BrandLogo} from './BrandLogo';
import {staticAssetUrl} from './static-assets';
import {isAndroidApp} from './platform/android';
import {useDialogFocus} from './dialog-focus';
import type {MenuPageId} from './MenuPages';
import './b-menu.css';

type NavigationProps={active:string;onNavigate:(page:MenuPageId)=>void;onRoot:()=>void;rootLabel?:string;identity?:string;feedbackUnread?:boolean;updatesUnread?:boolean;mobileHome?:boolean;disabled?:boolean};
const groups=[
 [['start','游玩'],['account','账号与档案'],['ranking','排行榜']],
 [['assistant','小齐'],['settings','设置'],['feedback','反馈与进展']],
 [['faq','帮助'],['credits','制作名单'],['about','关于']],
] as const;
function Glyph({name}:{name:string}){const lines:Record<string,ReactNode>={start:<path d="m9 5 10 7-10 7V5Z"/>,account:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,menu:<path d="M4 6h16M4 12h16M4 18h16"/>,close:<path d="m6 6 12 12M18 6 6 18"/>};return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{lines[name]??<path d="m9 5 7 7-7 7"/>}</svg>;}
export function RefinedMenuNavigation({active,onNavigate,onRoot,identity,feedbackUnread=false,updatesUnread=false,mobileHome=false,disabled=false}:NavigationProps){
 const [more,setMore]=useState(false),trigger=useRef<HTMLButtonElement>(null),android=isAndroidApp();
 const close=()=>setMore(false),drawer=useDialogFocus(more,close,true);
 const selected=active==='help'?'faq':['updates','copyright'].includes(active)?'about':active;
 useEffect(()=>{setMore(false);},[active]);
 useEffect(()=>{if(!more)return;const back=(event:Event)=>{(event as CustomEvent<{handle?:()=>void}>).detail?.handle?.();event.stopImmediatePropagation();setMore(false);};window.addEventListener('qisheng:native-back',back,true);return()=>window.removeEventListener('qisheng:native-back',back,true);},[more]);
 const navigate=(id:string)=>{setMore(false);if(id==='start')onRoot();else onNavigate(id as MenuPageId);};
 const promo=<a className="menu-qisheng2027-promo" href="https://qs2027.tianhw.top/" target="_blank" rel="noopener noreferrer" aria-label="访问齐盛2027官方网站，在新标签页打开"><img src={staticAssetUrl('/images/branding/qisheng-2027-primary.webp')} alt="齐盛2027" width={2172} height={724} decoding="async"/><span>官方网站 <i aria-hidden="true">↗</i></span></a>;
 const links=()=><nav aria-label="主菜单">{groups.map((group,index)=><section className={'menu-nav-group'+(index===2?' menu-nav-info':'')} aria-label={['游玩','服务','资料'][index]} key={index}>{index===2&&promo}{group.map(([id,label])=><button key={id} className={id==='start'?'menu-home-start':undefined} data-menu-focus={id} aria-current={selected===id?'page':undefined} disabled={disabled} onClick={()=>navigate(id)}><span>{label}</span>{((id==='feedback'&&feedbackUnread)||(id==='about'&&updatesUnread))&&<i className="menu-update-dot" role="img" aria-label={id==='feedback'?'有新回复':'有未读更新'}/>}<span className="menu-navigation-arrow" aria-hidden="true">›</span></button>)}</section>)}</nav>;
 return <aside className={'menu-navigation b-navigation'+(mobileHome?' menu-navigation-home':'')+(android?' is-android':'')} aria-label="游戏菜单">
  <div className="b-desktop-navigation"><button className="menu-navigation-name" onClick={onRoot} disabled={disabled} aria-label="返回主菜单"><BrandLogo className="menu-logo-dark"/><BrandLogo variant="light" className="menu-logo-light"/></button>{links()}<button className="b-navigation-account" onClick={()=>navigate('account')} disabled={disabled}><span className="b-navigation-avatar" aria-hidden="true">{identity?Array.from(identity)[0]:'齐'}</span><span>{identity||'登录账号'}</span></button></div>
  <div className="b-mobile-header"><button onClick={onRoot} disabled={disabled} className="b-mobile-brand" aria-label="返回主菜单"><BrandLogo/></button><button ref={trigger} className="b-icon-button" onClick={()=>setMore(true)} disabled={disabled} aria-label="打开菜单" aria-expanded={more}><Glyph name="menu"/></button></div>
  {android&&<nav className="b-android-navigation" aria-label="主要导航"><button onClick={onRoot} disabled={disabled} aria-current={selected==='start'?'page':undefined}><Glyph name="start"/><span>游玩</span></button><button onClick={()=>navigate('account')} disabled={disabled} aria-current={selected==='account'?'page':undefined}><Glyph name="account"/><span>档案</span></button><button onClick={()=>setMore(true)} disabled={disabled} aria-expanded={more}><Glyph name="menu"/><span>更多</span>{feedbackUnread&&<i className="menu-update-dot" aria-label="有新回复"/>}</button></nav>}
  {more&&<div className="b-drawer-shade" onClick={close}><section ref={drawer} className="b-menu-drawer" role="dialog" aria-modal="true" aria-labelledby="b-menu-drawer-title" onClick={event=>event.stopPropagation()}><header><h2 id="b-menu-drawer-title">菜单</h2><button className="b-icon-button" onClick={close} aria-label="关闭菜单"><Glyph name="close"/></button></header>{links()}<footer><span>LIUFRAME INTERACTIVE</span></footer></section></div>}
 </aside>;
}

export function RefinedScene({scene='courtyard',className=''}:{scene?:'courtyard'|'gate'|'corridor'|'field'|'sunken'|'library';className?:string}){
 const portrait=staticAssetUrl('/assets/ui-b/'+scene+'-portrait.webp'),wide=staticAssetUrl('/assets/ui-b/'+scene+'-wide.webp');
 return <picture className={'b-scene '+className}><source media={isAndroidApp()?'(orientation:portrait)':'(max-width:760px) and (orientation:portrait) and (pointer:coarse)'} srcSet={portrait}/><img src={wide} alt="" decoding="async" draggable={false}/></picture>;
}
