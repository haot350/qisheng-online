import {staticAssetUrl} from './static-assets.ts';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {RealityAssociation,RealityMatch} from './reality/types';
import type {PhotoRecord} from './photography/types';
import {markRealityDiscovered} from './reality/store';
import './reality.css';
import {useModalFocus} from './modal-focus';
import {downloadPhoto} from './photography/album';

export type RealityUIProps={match?:RealityMatch;association?:RealityAssociation;photo:PhotoRecord;onClose:()=>void;onReady?:()=>void;reducedMotion?:boolean;paused?:boolean;replay?:boolean};
/** A saved still is held throughout the dissolve; the running world never moves the real photograph. */
export function RealityUI({match,association,photo,onClose,onReady,reducedMotion,paused=false,replay=false}:RealityUIProps){
 const panelRef=useRef<HTMLDivElement|null>(null);useModalFocus(panelRef);
 const a=association??match!.association,[own,setOwn]=useState(''),[ready,setReady]=useState(false),[error,setError]=useState(''),[time,setTime]=useState(0),[attempt,setAttempt]=useState(0);const closeRef=useRef(onClose),readyRef=useRef(onReady);closeRef.current=onClose;readyRef.current=onReady;
 // Modal ownership begins before paint, even while its image is pending or fails.
 useLayoutEffect(()=>{readyRef.current?.();},[]);
 useEffect(()=>{const url=URL.createObjectURL(photo.blob);setOwn(url);return()=>URL.revokeObjectURL(url);},[photo.id]);
 useEffect(()=>{let cancelled=false;setReady(false);setError('');setTime(0);const image=new Image();image.src=staticAssetUrl(a.image);void image.decode().then(()=>{if(cancelled)return;markRealityDiscovered(a.anchorId);setReady(true);}).catch(()=>{if(!cancelled)setError(photo.storageStatus==='temporary'?'这张校园实拍暂时打不开。你的照片暂存于本次游玩中。':'这张校园实拍暂时打不开。你的照片已经保存。');});return()=>{cancelled=true;image.src='';};},[a.anchorId,a.image,attempt,photo.storageStatus]);
 useEffect(()=>{if(!ready||paused)return;let previous=performance.now(),id=0;const tick=(now:number)=>{const dt=Math.min(.1,(now-previous)/1000);previous=now;if(document.visibilityState==='visible'){setTime(old=>old+dt);}id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);},[ready,paused]);
 useEffect(()=>{if(ready&&!replay&&time>=9)closeRef.current();},[time,ready,replay]);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.code==='Escape'||ready&&(event.code==='Space'||event.code==='Enter')){event.preventDefault();event.stopImmediatePropagation();closeRef.current();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[ready]);
 const reduce=reducedMotion??(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches),opacity=ready?(reduce?(time>=1?1:0):Math.max(0,Math.min(1,(time-1)/2))):0;
 if(!ready)return <div ref={panelRef} tabIndex={-1} aria-modal="true" className="reality-pending" role={error?'alert':'status'}><p>{error||'正在打开校园实拍…'}</p>{error&&<button onClick={()=>setAttempt(n=>n+1)}>重试</button>}{error&&photo.storageStatus==='temporary'&&<button onClick={()=>downloadPhoto(photo)}>导出我的照片</button>}<button onClick={onClose}>稍后再看</button></div>;
 return <div ref={panelRef} tabIndex={-1} className="reality-shade" role="dialog" aria-modal="true" aria-label="遇见现实"><div className={`reality-still ${photo.settings.orientation}`}><img src={own||undefined} alt="你刚刚拍摄的数字校园"/><img className="reality-original" src={staticAssetUrl(a.image)} style={{opacity}} alt={`${a.title}的真实校园照片`}/></div><button className="reality-close" onClick={onClose}>{replay?'返回相册':'继续'}</button><footer className="reality-caption" style={{opacity:opacity>.8?1:0}}><span>{a.title}</span><small>{a.date&&<>{a.date} · </>}校园实拍</small></footer></div>;
}

