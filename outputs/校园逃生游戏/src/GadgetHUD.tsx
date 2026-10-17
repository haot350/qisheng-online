import {useEffect,useState} from 'react';
import type {GadgetView,GadgetId} from '@qisheng/shared/gadgets';
import {GADGET_LABELS,gadgetCount} from '@qisheng/shared/gadgets';
import type {GameAPI} from './types';
import './gadget-hud.css';

export function GadgetHUD({view,smokes,touch,api}:{view:GadgetView;smokes:number;touch:boolean;api:GameAPI|null}){
 const [open,setOpen]=useState(false),count=gadgetCount(view,view.selectedGadget,smokes),choices:GadgetId[]=view.canUseCards===false?['smoke','grenade']:['smoke','grenade','cards'];
 const select=(id:GadgetId)=>{api?.selectGadget?.(id);setOpen(false);};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.altKey||e.ctrlKey||e.metaKey||e.repeat||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select'))return;if(e.code==='KeyB'){e.preventDefault();e.stopImmediatePropagation();setOpen(v=>!v);}else if(open&&['Digit1','Digit2','Digit3'].includes(e.code)){const id=choices[Number(e.code.slice(-1))-1];if(id){e.preventDefault();e.stopImmediatePropagation();select(id);}}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[open,api,view.canUseCards]);
 return <div className={'gadget-status'+(touch?' is-touch':'')} aria-label="随身道具">
  {view.helmetDurability>0&&<span className="gadget-helmet" aria-label={'头盔耐久 '+Math.ceil(view.helmetDurability)}>◒ <b>{Math.ceil(view.helmetDurability)}</b></span>}
  <span className="gadget-choice"><button type="button" aria-expanded={open} aria-label="选择道具" onClick={()=>setOpen(v=>!v)}>{touch?'道具':<kbd>G</kbd>} {GADGET_LABELS[view.selectedGadget]} <b>{count}</b> <small>{touch?'⌃':'B 选择'}</small></button></span>
  {open&&<div className="gadget-picker" role="group" aria-label="选择道具">{choices.map((id,i)=><button type="button" key={id} aria-pressed={id===view.selectedGadget} onClick={()=>select(id)}>{!touch&&<kbd>{i+1}</kbd>} {GADGET_LABELS[id]} <b>{gadgetCount(view,id,smokes)}</b></button>)}</div>}
  {view.cardsLeft>0&&<span className={view.confiscating?'confiscating':'cards-active'} role="status">{view.confiscating?'收牌中 · 拉开距离':'体力不消耗'} <b>{Math.ceil(view.cardsLeft)}秒</b></span>}
 </div>;
}
