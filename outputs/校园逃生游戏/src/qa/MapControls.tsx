import {useEffect,useRef,useState} from 'react';
import type {GameAPI,Settings,Snapshot} from '../types';
import {RELEASE_LABEL} from '../release';

/** Development only: finite commands use the normal input API and capsule. */
export default function MapControls({api,snapshot,settings,label,mapLabel='WEB-r01'}:{api:GameAPI|null;snapshot:Snapshot;settings:Settings;label?:string;mapLabel?:string}){
 const [running,setRunning]=useState(''),[result,setResult]=useState('');
 const cancel=useRef<(()=>void)|null>(null);
 useEffect(()=>()=>cancel.current?.(),[api]);
 if(!new URLSearchParams(location.search).has('qaMap'))return null;
 const input=(label:string,seconds:number,apply:(dt:number)=>void)=>{
  cancel.current?.();if(!api||snapshot.phase!=='playing')return;
  let raf=0;const began=performance.now();let last=began,blocked=0,frames=0;
  setRunning(label);setResult('');
  const stop=()=>{cancelAnimationFrame(raf);api.clearInput?.();cancel.current=null;setRunning('');setResult(label+' · '+frames+' 帧 · 加载提示 '+blocked+' 帧');};
  cancel.current=stop;
  const tick=(now:number)=>{frames++;if(document.querySelector('.game-shell.is-buffering'))blocked++;if(now-began>=seconds*1000||document.hidden){stop();return;}apply(Math.min(.05,(now-last)/1000));last=now;raf=requestAnimationFrame(tick);};
  raf=requestAnimationFrame(tick);
 };
 return <aside aria-label="本机地图验收" style={{position:'fixed',bottom:8,left:8,zIndex:10000,maxWidth:'min(510px,95vw)',padding:8,background:'#10191fee',color:'white',font:'12px monospace',border:'1px solid #899'}}>
  <output>{label??RELEASE_LABEL} · {mapLabel} · {document.documentElement.dataset.qaMapManifestHash?.slice(0,12)??''} · {snapshot.phase} · {snapshot.quality} · {snapshot.fps} FPS</output>
  <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:5}}>
   <button disabled={!!running||snapshot.phase!=='playing'} onClick={()=>input('静止转向',12,dt=>api?.look(Math.PI*2*dt/(12*(snapshot.online ? .0022 : .0021)*settings.sensitivity),0))}>转向一周</button>
   <button disabled={!!running||snapshot.phase!=='playing'} onClick={()=>input('前进',2,()=>api?.move(0,1))}>前进2秒</button>
   <button disabled={!!running||snapshot.phase!=='playing'} onClick={()=>input('后退',2,()=>api?.move(0,-1))}>后退2秒</button>
   <button disabled={!!running||snapshot.phase!=='playing'} onClick={()=>input('左移',1,()=>api?.move(-1,0))}>左移1秒</button>
   <button disabled={!!running||snapshot.phase!=='playing'} onClick={()=>input('右移',1,()=>api?.move(1,0))}>右移1秒</button>
   <button disabled={!running} onClick={()=>cancel.current?.()}>停止</button>
  </div><output role="status">{running||result||'通过游戏菜单进入后检查'}</output>
  {(window as any).__gameStartError?.message&&<output role="alert">入场错误：{String((window as any).__gameStartError.message)}</output>}
 </aside>;
}
