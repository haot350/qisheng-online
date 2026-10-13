import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import './menu-pages.css';

export type MenuPageId='settings'|'help'|'faq'|'about'|'updates'|'credits'|'ranking'|'feedback'|'account';
const labels:Record<MenuPageId,string>={settings:'设置',help:'操作说明',faq:'帮助',about:'关于',updates:'更新记录',credits:'制作与鸣谢',ranking:'排行榜',feedback:'反馈与进展',account:'账号与档案'};
type PageEntry={page:MenuPageId;returnFocus:HTMLElement|null};

/** Menus own navigation; leaving a page never changes the running session. */
export function useMenuPages(initial:MenuPageId|null=null){
 const [history,setHistory]=useState<PageEntry[]>(()=>initial?[{page:initial,returnFocus:null}]:[]);
 const [visited,setVisited]=useState<MenuPageId[]>(()=>initial?[initial]:[]);
 const active=history.at(-1)?.page??null;
 const pendingFocus=useRef<HTMLElement|null>(null);
 const open=useCallback((page:MenuPageId)=>{
  const focus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setVisited(old=>old.includes(page)?old:[...old,page]);
  setHistory(old=>old.at(-1)?.page===page?old:[...old,{page,returnFocus:focus}]);
 },[]);
 const back=useCallback(()=>setHistory(old=>{
  pendingFocus.current=old.at(-1)?.returnFocus??null;
  return old.slice(0,-1);
 }),[]);
 const clear=useCallback(()=>{pendingFocus.current=null;setHistory([]);},[]);
 useLayoutEffect(()=>{
  const focus=pendingFocus.current;pendingFocus.current=null;
  if(focus?.isConnected&&!focus.closest('[hidden],[inert]'))focus.focus({preventScroll:true});
 },[active]);
 useEffect(()=>{
  if(!active)return;
  const key=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||document.querySelector('[role="dialog"][aria-modal="true"]:not([hidden])'))return;
   event.preventDefault();event.stopImmediatePropagation();back();
  };
  window.addEventListener('keydown',key,true);
  return()=>window.removeEventListener('keydown',key,true);
 },[active,back]);
 return {active,visited,open,back,clear,backLabel:history.length>1?'返回'+labels[history[history.length-2].page]:'返回菜单'};
}

export function MenuPage({id,title,active,onBack,backLabel='返回菜单',onNavigate,children,wide=false}:{id:string;title:string;active:boolean;onBack?:()=>void;backLabel?:string;onNavigate:(page:MenuPageId)=>void;children:ReactNode;wide?:boolean}){
 const ref=useRef<HTMLElement>(null),lastFocus=useRef<HTMLElement|null>(null),lastScroll=useRef(0);
 useLayoutEffect(()=>{
  const shell=ref.current;if(!shell)return;
  if(!active)return;
  shell.scrollTop=lastScroll.current;
  const previous=lastFocus.current;
  if(previous?.isConnected&&shell.contains(previous))previous.focus({preventScroll:true});
  else shell.querySelector<HTMLElement>('[data-page-heading]')?.focus({preventScroll:true});
  return()=>{if(shell.contains(document.activeElement))lastFocus.current=document.activeElement as HTMLElement;};
 },[active]);
 return <section ref={ref} className={'menu-page'+(wide?' menu-page-wide':'')} data-menu-page={id} hidden={!active} inert={!active} aria-labelledby={'menu-page-title-'+id} onScroll={event=>{if(active)lastScroll.current=event.currentTarget.scrollTop;}} onFocusCapture={event=>{if(event.target instanceof HTMLElement)lastFocus.current=event.target;}}>
  <header className="menu-page-header"><div><p>齐盛Online · 游戏菜单</p><h1 id={'menu-page-title-'+id} data-page-heading tabIndex={-1}>{title}</h1></div><nav aria-label="游戏服务">{(['ranking','feedback','account'] as const).map(page=><button key={page} aria-current={id===page?'page':undefined} onClick={()=>onNavigate(page)}>{labels[page]}</button>)}</nav></header>
  <div className="menu-page-toolbar">{onBack&&<button className="menu-page-back" onClick={onBack}>← {backLabel}</button>}<nav aria-label="菜单页面">{(['settings','faq','about'] as const).map(page=><button key={page} aria-current={id===page?'page':undefined} onClick={()=>onNavigate(page)}>{labels[page]}</button>)}</nav></div>
  <div className="menu-page-content">{children}</div>
 </section>;
}
