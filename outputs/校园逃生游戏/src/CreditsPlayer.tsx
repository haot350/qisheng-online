import {useCallback,useEffect,useRef,useState} from 'react';
import {CREDITS_DURATION_SECONDS,CREDITS_MODELS,CREDITS_MUSIC,CREDITS_TECHNOLOGIES,CREDITS_THANKS,COPYRIGHT} from '@qisheng/shared/credits';
import {BrandLogo} from './BrandLogo';
import {staticAssetUrl} from './static-assets';
import './credits.css';

export type CreditsPlayerProps={active?:boolean;volume?:number;reducedMotion?:boolean;onClose:()=>void;onCopyright?:()=>void};
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const icon=(brand:string)=>staticAssetUrl(`/credits/icons/${brand}.svg`);

export function CreditsContent(){return <>
  <section className="film-credits-bookend film-credits-opening"><BrandLogo variant="light"/><p>一段仍在继续的校园旅程</p><span>制作名单</span></section>
  <section className="film-credits-section film-credits-studio"><p className="film-credits-kicker">制作与开发</p><h2>OpenQS</h2><p>游戏策划 · 程序开发 · 交互设计 · 视听整合</p></section>
  <section className="film-credits-section"><p className="film-credits-kicker">AI辅助创作与开发</p><div className="film-credits-models">{CREDITS_MODELS.map(model=><div key={model.name}><img src={icon(model.brand)} alt="" width="48" height="48"/><h3>{model.name}</h3></div>)}</div></section>
  <section className="film-credits-section"><p className="film-credits-kicker">校园资料与视觉参考</p><h2>项目资料提供者</h2><p>校园照片与影像 · 空间资料与校准 · 模型及人物参考</p></section>
  {CREDITS_THANKS.map(item=><section className="film-credits-section film-credits-thanks" key={item.title}><h2>{item.title}</h2><p>{item.text}</p></section>)}
  <section className="film-credits-section"><p className="film-credits-kicker">片尾音乐</p><h2>{CREDITS_MUSIC.title}</h2><h3>{CREDITS_MUSIC.artist}</h3><p>钢琴与弦乐</p><p className="film-credits-license">{CREDITS_MUSIC.attribution}<br/>{CREDITS_MUSIC.license} · 片段编排、转码与淡入淡出</p></section>
  <section className="film-credits-section"><p className="film-credits-kicker">开源技术与创作资源</p><div className="film-credits-technologies">{CREDITS_TECHNOLOGIES.map(item=><div key={item.name}><span>{item.role}</span><strong>{item.name}</strong><small>{item.license}</small></div>)}</div><p className="film-credits-license">感谢各项目的维护者与贡献者。<br/>第三方软件与素材保留各自的版权与许可。</p></section>
  <section className="film-credits-section film-credits-thanks"><h2>感谢你，让这座校园继续生长。</h2><p>每一次到来，每一份分享，每一个被认真听见的建议，<br/>都让下一次相遇更值得期待。</p></section>
  <section className="film-credits-bookend film-credits-ending"><BrandLogo variant="light"/><h2>OpenQS</h2><p>{COPYRIGHT.short}</p><p className="film-credits-license">公开源码依MIT许可证提供。<br/>第三方内容及正式视觉素材遵循各自许可与权利声明。</p></section>
</>;}

/** No simulation, account or network state is owned by this presentation. */
export function CreditsPlayer({active=true,volume=.6,reducedMotion=false,onClose,onCopyright}:CreditsPlayerProps){
 const [playing,setPlaying]=useState(false),[time,setTime]=useState(0),[muted,setMuted]=useState(false),[staticMode,setStaticMode]=useState(()=>reducedMotion||typeof document!=='undefined'&&document.documentElement.dataset.motion==='reduced'||typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches),[audioError,setAudioError]=useState(false),[controlsVisible,setControlsVisible]=useState(true);
 const idleTimer=useRef<ReturnType<typeof setTimeout>|null>(null),keyboardFocus=useRef(false);
 const revealControls=useCallback(()=>{if(idleTimer.current!==null)clearTimeout(idleTimer.current);idleTimer.current=null;setControlsVisible(true);if(active&&playing&&!staticMode&&!audioError&&!keyboardFocus.current)idleTimer.current=setTimeout(()=>{idleTimer.current=null;setControlsVisible(false);},2500);},[active,playing,staticMode,audioError]);
 useEffect(()=>{revealControls();return()=>{if(idleTimer.current!==null)clearTimeout(idleTimer.current);idleTimer.current=null;};},[revealControls]);
 const viewport=useRef<HTMLDivElement>(null),track=useRef<HTMLDivElement>(null),audio=useRef<HTMLAudioElement|null>(null),position=useRef(0),distance=useRef(0),visible=useRef(typeof document==='undefined'||!document.hidden),running=useRef(false),volumeRef=useRef(volume);volumeRef.current=volume;
 const paint=useCallback(()=>{if(track.current)track.current.style.transform=staticMode?'none':`translate3d(0,${-distance.current*position.current/CREDITS_DURATION_SECONDS}px,0)`;},[staticMode]);
 useEffect(()=>{if(!active)return;const element=new Audio();element.preload='none';element.src=staticAssetUrl('/credits/wildflowers.mp3');element.volume=Math.max(0,Math.min(1,volume));element.muted=muted;const error=()=>setAudioError(true);element.addEventListener('error',error);audio.current=element;return()=>{element.pause();element.removeAttribute('src');element.load();element.removeEventListener('error',error);audio.current=null;};},[active]);
 useEffect(()=>{if(audio.current){audio.current.volume=Math.max(0,Math.min(1,volume));audio.current.muted=muted;}},[volume,muted]);
 useEffect(()=>{const measure=()=>{distance.current=Math.max(0,(track.current?.scrollHeight??0)-(viewport.current?.clientHeight??0));paint();};const observer=new ResizeObserver(measure);if(viewport.current)observer.observe(viewport.current);if(track.current)observer.observe(track.current);measure();return()=>observer.disconnect();},[paint]);
 useEffect(()=>{if(!active){setPlaying(false);return;}const change=()=>{visible.current=!document.hidden;if(document.hidden){setPlaying(false);audio.current?.pause();}};document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[active]);
 useEffect(()=>{running.current=active&&playing&&!staticMode&&visible.current;const element=audio.current;if(!running.current){element?.pause();return;}let cancelled=false,last=performance.now(),lastUI=0,frame=0;const step=(now:number)=>{if(cancelled||!running.current)return;position.current=Math.min(CREDITS_DURATION_SECONDS,position.current+Math.min(1,(now-last)/1000));last=now;paint();if(element)element.volume=Math.max(0,Math.min(1,volumeRef.current))*Math.max(0,Math.min(1,position.current/2,(CREDITS_DURATION_SECONDS-position.current)/6));if(now-lastUI>100){setTime(position.current);lastUI=now;}if(position.current>=CREDITS_DURATION_SECONDS){setTime(CREDITS_DURATION_SECONDS);setPlaying(false);element?.pause();return;}frame=requestAnimationFrame(step);};frame=requestAnimationFrame(step);return()=>{cancelled=true;cancelAnimationFrame(frame);};},[active,playing,staticMode,paint]);
 const seek=useCallback((next:number)=>{position.current=Math.max(0,Math.min(CREDITS_DURATION_SECONDS,next));setTime(position.current);paint();if(audio.current){try{audio.current.currentTime=position.current;}catch{}}},[paint]);
 const start=()=>{if(staticMode)return;if(position.current>=CREDITS_DURATION_SECONDS)seek(0);setAudioError(false);const element=audio.current;if(element){try{element.currentTime=position.current;}catch{}element.play().catch(()=>setAudioError(true));}setPlaying(true);};
 const toggle=()=>{if(playing){setPlaying(false);audio.current?.pause();}else start();};
 const replay=()=>{seek(0);if(!staticMode)start();viewport.current?.scrollTo({top:0});};
 const changeMode=()=>{setPlaying(false);audio.current?.pause();setStaticMode(value=>!value);};
 useEffect(()=>{if(!active)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[active,onClose]);
 return <section className={'film-credits'+(staticMode?' film-credits-static':'')+(!controlsVisible?' film-credits-controls-hidden':'')} aria-label="齐盛Online制作名单" hidden={!active}
  onPointerMove={revealControls} onPointerDown={()=>{keyboardFocus.current=false;revealControls();}}
  onKeyDownCapture={()=>{keyboardFocus.current=true;revealControls();}}
  onFocusCapture={event=>{if(event.target.matches(':focus-visible')){keyboardFocus.current=true;revealControls();}}}
  onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget)){keyboardFocus.current=false;revealControls();}}}>
  <header className="film-credits-top"><span>齐盛Online · 制作名单</span><button onClick={onClose} aria-label="退出制作名单">退出 <span aria-hidden="true">×</span></button></header>
  <div className="film-credits-viewport" ref={viewport} tabIndex={0} aria-label={staticMode?'制作名单全文':'滚动制作名单'}><div className="film-credits-track" ref={track}><CreditsContent/></div></div>
  {!staticMode&&!playing&&time===0&&<div className="film-credits-start"><button onClick={start}>播放制作名单 <span aria-hidden="true">▶</span></button></div>}
  <footer className="film-credits-controls"><div className="film-credits-control-row"><button onClick={toggle} disabled={staticMode}>{playing?'暂停':time>=CREDITS_DURATION_SECONDS?'重新播放':'播放'}</button><button onClick={()=>setMuted(value=>!value)} aria-pressed={muted}>{muted?'开启音乐':'静音'}</button><button onClick={replay}>从头开始</button><button onClick={changeMode}>{staticMode?'滚动播放':'阅读全文'}</button>{onCopyright?<button onClick={onCopyright}>版权与许可</button>:<a href="/copyright/">版权与许可</a>}</div>{!staticMode&&<div className="film-credits-progress"><time>{clock(time)}</time><input type="range" min="0" max={CREDITS_DURATION_SECONDS} step="1" value={time} onChange={event=>seek(Number(event.target.value))} aria-label="制作名单播放位置"/><time>{clock(CREDITS_DURATION_SECONDS)}</time></div>}{audioError&&<p className="film-credits-audio-note" role="status">音乐暂时未能播放。可继续阅读，或重新点击播放。</p>}</footer>
 </section>;
}
