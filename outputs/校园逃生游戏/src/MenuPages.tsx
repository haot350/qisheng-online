import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import './ui-tokens.css';
import './menu-pages.css';
import {RefinedMenuNavigation} from './RefinedMenuShell';
import {isAndroidApp} from './platform/android';

export type MenuPageId='settings'|'help'|'faq'|'about'|'updates'|'credits'|'copyright'|'ranking'|'feedback'|'account'|'assistant';
export const MenuNavigation=RefinedMenuNavigation;

/** A page returns to the session menu, never through a browser-like history. */
export function useMenuPages(initial:MenuPageId|null=null,blocked=false){
 const [active,setActive]=useState<MenuPageId|null>(initial);
 const [visited,setVisited]=useState<MenuPageId[]>(()=>initial?[initial]:[]);
 const rootFocus=useRef<HTMLElement|null>(null),pendingFocus=useRef<HTMLElement|null>(null);
 const open=useCallback((page:MenuPageId)=>{
  setActive(old=>{if(!old)rootFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;return page;});
  setVisited(old=>old.includes(page)?old:[...old,page]);
 },[]);
 const back=useCallback(()=>{pendingFocus.current=rootFocus.current;setActive(null);},[]);
 const clear=useCallback(()=>{pendingFocus.current=null;rootFocus.current=null;setActive(null);},[]);
 useLayoutEffect(()=>{if(active)return;const focus=pendingFocus.current;pendingFocus.current=null;if(focus?.isConnected&&!focus.closest('[hidden],[inert]'))focus.focus({preventScroll:true});else document.querySelector<HTMLElement>('[data-menu-page="pause"]:not([hidden]) [data-page-heading],.campus-menu:not([hidden]) .menu-home-start')?.focus({preventScroll:true});},[active]);
 useEffect(()=>{
  if(!active)return;
  const key=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||document.querySelector('[role="dialog"][aria-modal="true"]:not([hidden])'))return;
   event.preventDefault();event.stopImmediatePropagation();if(blocked)return;const detailBack=document.querySelector<HTMLButtonElement>('.menu-page[data-menu-page="settings"]:not([hidden]) [data-mobile-detail-back]');if(detailBack&&!detailBack.disabled&&detailBack.getClientRects().length)detailBack.click();else back();
  };
  window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[active,back,blocked]);
 return {active,visited,open,back,clear,backLabel:'返回主菜单'};
}

export function MenuPage({id,title,active,onBack,backLabel='返回主菜单',onNavigate,children,wide=false,tactical=false,onRoot,rootLabel,feedbackUnread=false,updatesUnread=false,navigationDisabled=false,showNavigation=true,centered=false,identity}:{id:string;title:string;active:boolean;onBack?:()=>void;backLabel?:string;onNavigate:(page:MenuPageId)=>void;children:ReactNode;wide?:boolean;tactical?:boolean;onRoot?:()=>void;rootLabel?:string;feedbackUnread?:boolean;updatesUnread?:boolean;navigationDisabled?:boolean;showNavigation?:boolean;centered?:boolean;identity?:string}){
 const ref=useRef<HTMLElement>(null),lastFocus=useRef<HTMLElement|null>(null),lastScroll=useRef(0);
 useLayoutEffect(()=>{
  const shell=ref.current;if(!shell||!active)return;shell.scrollTop=lastScroll.current;
  const previous=lastFocus.current;if(previous?.isConnected&&shell.contains(previous))previous.focus({preventScroll:true});else shell.querySelector<HTMLElement>('[data-page-heading]')?.focus({preventScroll:true});
  return()=>{if(shell.contains(document.activeElement))lastFocus.current=document.activeElement as HTMLElement;};
 },[active]);
 return <section ref={ref} className={'menu-page b-menu-page'+(isAndroidApp()?' is-android':'')+(wide?' menu-page-wide':'')+(tactical?' tactical-menu':'')+(!showNavigation?' menu-page-standalone':'')+(centered?' menu-page-centered':'')} data-menu-page={id} hidden={!active} inert={!active} aria-labelledby={'menu-page-title-'+id} onScroll={event=>{if(active)lastScroll.current=event.currentTarget.scrollTop;}} onFocusCapture={event=>{if(event.target instanceof HTMLElement)lastFocus.current=event.target;}}>
  {showNavigation&&<MenuNavigation active={id==='pause'||id==='lobby'?'start':id} onNavigate={onNavigate} onRoot={onRoot??onBack??(()=>{})} rootLabel={rootLabel} feedbackUnread={feedbackUnread} updatesUnread={updatesUnread} disabled={navigationDisabled} mobileHome={id==='pause'} identity={identity}/>}
  <div className="menu-page-main"><header className="menu-page-header"><h1 id={'menu-page-title-'+id} data-page-heading tabIndex={-1}>{title}</h1>{onBack&&<button className="menu-page-back" onClick={onBack} disabled={navigationDisabled}>← {backLabel}</button>}</header><div className="menu-page-content">{children}</div>{id!=='pause'&&id!=='lobby'&&<footer className="menu-legal-footer">© 2026 LIUFRAME INTERACTIVE · 齐盛Online · <button onClick={()=>onNavigate('copyright')}>版权与许可</button></footer>}</div>
 </section>;
}
