import {useEffect,useRef,type CSSProperties} from 'react';
import type {NearbyInteraction,NearbyInteractionAction} from './nearby-interaction';
import {usePointerSession} from './use-pointer-session';
import {INPUT_RESET_EVENT} from './pointer-owner';
import './nearby-interaction.css';
export const INTERACTION_ACTION_LABELS:Record<NearbyInteractionAction,string>={revive:'救援',take:'取走物资',activate:'启动设备',hold:'开始守点',carry:'领取物资',deliver:'送达物资',extract:'开始撤离',ammo:'补充弹药',replace:'替换主枪',supply:'领取补给'};
export function interactionActionLabel(interaction:NearbyInteraction){return !interaction.available?(interaction.kind==='supply'?'补给已满':'弹药已满'):INTERACTION_ACTION_LABELS[interaction.action];}
export function NearbyInteractionUI({interaction,label,touch=false,onPress,loading=false,error=false,screen}:{interaction:NearbyInteraction;label:string;touch?:boolean;onPress:(pressed:boolean)=>void;loading?:boolean;error?:boolean;screen?:{x:number;y:number}|null}){
 const callback=useRef(onPress),keyboard=useRef(false);callback.current=onPress;
 const enabled=interaction.available&&!loading,held=interaction.action==='revive',pointers=usePointerSession(enabled),action=loading?'准备装备…':error?'重试':interactionActionLabel(interaction);
 const releaseKeyboard=()=>{if(keyboard.current){keyboard.current=false;callback.current(false);}};
 useEffect(()=>()=>{pointers.clear();releaseKeyboard();},[interaction.id,pointers]);
 useEffect(()=>{const reset=()=>releaseKeyboard();document.addEventListener(INPUT_RESET_EVENT,reset);window.addEventListener('blur',reset);return()=>{document.removeEventListener(INPUT_RESET_EVENT,reset);window.removeEventListener('blur',reset);};},[]);
 const trigger=()=>{callback.current(true);callback.current(false);};
 const style=screen?{left:(screen.x*100)+'%',top:(screen.y*100)+'%'} as CSSProperties:undefined;
 return <div className={'nearby-interaction'+(!interaction.available?' unavailable':'')+(screen?' is-anchored':'')} style={style} role="status"><span>{label}</span>{!interaction.available?<small>{action}</small>:touch?<button type="button" disabled={loading} aria-label={(held?'按住':'')+action+' '+label}
 onContextMenu={e=>e.preventDefault()}
 onPointerDown={e=>{if(!enabled)return;e.preventDefault();e.stopPropagation();if(pointers.begin('interaction',e,cancelled=>{if(held)callback.current(false);else if(!cancelled)trigger();})&&held)callback.current(true);}}
 onKeyDown={e=>{if(held&&enabled&&!e.repeat&&(e.key===' '||e.key==='Enter')){e.preventDefault();keyboard.current=true;callback.current(true);}}}
 onKeyUp={e=>{if(held&&(e.key===' '||e.key==='Enter')){e.preventDefault();releaseKeyboard();}}} onBlur={releaseKeyboard}
 onClick={e=>{if(e.detail===0&&!held&&enabled)trigger();}}>{held?'按住'+action:action}</button>:<small>{held?'按住 ':''}<kbd>E</kbd> {action}</small>}</div>;
}
