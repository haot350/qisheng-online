import {useEffect,useRef} from 'react';

type DialogEntry={root:HTMLElement;layer:HTMLElement;z:string;inert:boolean;hidden:string|null};
const stack:DialogEntry[]=[];
const controls='button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]';
function layerFor(root:HTMLElement){
  for(let node:HTMLElement|null=root;node&&node!==document.body;node=node.parentElement){
    if(getComputedStyle(node).position==='fixed')return node;
  }
  return root;
}
function refreshStack(){
  const top=stack.at(-1)?.root;
  stack.forEach((entry,index)=>{
    entry.layer.style.zIndex=String(400+index*10);
    const blocked=!!top&&entry.root!==top&&!entry.root.contains(top);
    entry.root.inert=blocked||entry.inert;
    if(blocked)entry.root.setAttribute('aria-hidden','true');
    else if(entry.hidden===null)entry.root.removeAttribute('aria-hidden');
    else entry.root.setAttribute('aria-hidden',entry.hidden);
  });
}
function focusable(root:HTMLElement){
  return Array.from(root.querySelectorAll<HTMLElement>(controls)).filter(node=>node.getClientRects().length&&!node.closest('[inert]'));
}
function visualLevel(node:Element){
  let level=0;
  for(let current:Element|null=node;current;current=current.parentElement){
    const z=Number.parseInt(getComputedStyle(current).zIndex,10);
    if(Number.isFinite(z))level=Math.max(level,z);
  }
  return level;
}
export function isTopmostDialog(shell:Element|null){
  const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .filter(node=>node.getClientRects().length&&!node.closest('[inert]'));
  dialogs.sort((a,b)=>a.contains(b)?-1:b.contains(a)?1:visualLevel(a)-visualLevel(b));
  return !!shell&&dialogs.at(-1)===shell;
}
/** Registration order owns both visual stacking and keyboard input. */
export function registerDialog(root:HTMLElement,onClose?:()=>void,escape=false){
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const layer=layerFor(root),entry={root,layer,z:layer.style.zIndex,inert:root.inert,hidden:root.getAttribute('aria-hidden')};
  stack.push(entry);refreshStack();
  if(!root.hasAttribute('tabindex'))root.tabIndex=-1;
  (focusable(root)[0]??root).focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{
    if(!isTopmostDialog(root))return;
    if(escape&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose?.();return;}
    if(event.key!=='Tab')return;
    const items=focusable(root),first=items[0],last=items.at(-1);
    if(!first){event.preventDefault();root.focus();return;}
    if(!root.contains(document.activeElement)||event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last){
      event.preventDefault();(event.shiftKey?last:first)?.focus({preventScroll:true});
    }
  };
  window.addEventListener('keydown',key,true);
  return()=>{
    window.removeEventListener('keydown',key,true);
    const index=stack.indexOf(entry);if(index>=0)stack.splice(index,1);
    layer.style.zIndex=entry.z;root.inert=entry.inert;
    if(entry.hidden===null)root.removeAttribute('aria-hidden');else root.setAttribute('aria-hidden',entry.hidden);
    refreshStack();
    const top=stack.at(-1)?.root;
    if(previous?.isConnected&&!previous.closest('[inert]')&&(!top||top.contains(previous)))previous.focus({preventScroll:true});
    else if(top)(focusable(top)[0]??top).focus({preventScroll:true});
  };
}
export function useDialogFocus(enabled:boolean,onClose?:()=>void,escape=false){
  const shell=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{if(enabled&&shell.current)return registerDialog(shell.current,()=>close.current?.(),escape);},[enabled,escape]);
  return shell;
}
