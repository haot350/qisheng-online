import {useLayoutEffect,useState,type CSSProperties,type RefObject} from 'react';
import type {HitType,WeaponId} from './types';
import './crosshair.css';

type CanvasBounds={left:number;top:number;width:number;height:number};
export type CrosshairProps={
 weapon:WeaponId;
 aiming:boolean;
 spread?:number;
 fov?:number;
 hit?:number;
 hitType?:HitType|null;
 canvasHost?:RefObject<HTMLElement|null>;
 scope?:boolean;
};

/** The render canvas, including its CSS size, is the aiming coordinate space. */
function useCanvasBounds(canvasHost?:CrosshairProps['canvasHost']){
 const [bounds,setBounds]=useState<CanvasBounds|null>(null);
 useLayoutEffect(()=>{
  const host=canvasHost?.current;
  let observedCanvas:HTMLCanvasElement|null=null;
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>measure());
  const measure=()=>{
   const canvas=host?.querySelector('canvas')??document.querySelector<HTMLCanvasElement>('.world canvas');
   if(canvas&&canvas!==observedCanvas){if(observedCanvas)observer?.unobserve(observedCanvas);observer?.observe(canvas);observedCanvas=canvas;}
   const rect=(canvas??host)?.getBoundingClientRect();
   if(!rect||rect.width<=0||rect.height<=0)return;
   const next={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
   setBounds(previous=>previous&&Object.keys(next).every(key=>previous[key as keyof CanvasBounds]===next[key as keyof CanvasBounds])?previous:next);
  };
  if(host)observer?.observe(host);
  const mutations=host&&typeof MutationObserver!=='undefined'?new MutationObserver(measure):null;
  mutations?.observe(host!,{childList:true});
  measure();
  window.addEventListener('resize',measure);
  window.addEventListener('orientationchange',measure);
  window.visualViewport?.addEventListener('resize',measure);
  window.visualViewport?.addEventListener('scroll',measure);
  return()=>{observer?.disconnect();mutations?.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('orientationchange',measure);window.visualViewport?.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('scroll',measure);};
 },[canvasHost]);
 return bounds;
}

function CrosshairHit({type}:{type:HitType|null}){
 return <i className={'hit-mark combat-crosshair-hit hit-'+(type??'body')}><svg width="38" height="38" viewBox="0 0 38 38" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m8 8 6 6m10 10 6 6M30 8l-6 6M14 24l-6 6"/>{type==='head'&&<circle cx="19" cy="19" r="3"/>}{type==='suppressed'&&<circle cx="19" cy="19" r="16"/>}</svg></i>;
}

export function Crosshair({weapon,aiming,spread=.006,fov=60,hit=0,hitType=null,canvasHost,scope}:CrosshairProps){
 const bounds=useCanvasBounds(canvasHost),scoped=scope??(weapon==='awm'&&aiming);
 const height=bounds?.height??(typeof window==='undefined'?390:window.innerHeight);
 const finiteSpread=Number.isFinite(spread)?Math.max(0,spread):.006;
 const finiteFov=Number.isFinite(fov)?Math.max(1,Math.min(179,fov)):60;
 const gap=Math.min(54,Math.max(4,finiteSpread/Math.tan(finiteFov*Math.PI/360)*height/2));
 const style:CSSProperties=bounds?{inset:'auto',left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}:{};
 const lensStyle:CSSProperties|undefined=bounds?{width:Math.min(bounds.width,bounds.height)*.88,height:Math.min(bounds.width,bounds.height)*.88}:undefined;
 return <div className="combat-crosshair-layer" aria-hidden="true" style={style}>
  {scoped?<div className="fps-scope combat-crosshair-scope"><div className="fps-scope-lens combat-crosshair-lens" style={lensStyle}><svg viewBox="0 0 100 100"><g><path d="M0 50H48M52 50H100M50 0V48M50 52V100"/>{[25,35,65,75].map(p=><path key={p} d={'M'+p+' 48V52M48 '+p+'H52'}/>)}</g><circle cx="50" cy="50" r=".3"/><text x="50" y="78" textAnchor="middle">6×</text></svg>{hit>0&&<i className={'fps-scope-hit'+(hitType==='head'?' head':'')}>×</i>}</div></div>:
   <div className={'reticle escape-reticle combat-crosshair'+(aiming?' is-aiming':'')} style={{'--spread-gap':gap+'px'} as CSSProperties}>
    <span className="combat-crosshair-dot"/>
    {!aiming&&<><b className="reticle-line top"/><b className="reticle-line right"/><b className="reticle-line bottom"/><b className="reticle-line left"/></>}
    {hit>0&&<CrosshairHit type={hitType}/>}
   </div>}
 </div>;
}
