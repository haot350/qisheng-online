import {createRoot} from 'react-dom/client';
import {useEffect,useRef,useState} from 'react';
import {RULES,WEAPONS} from '@qisheng/shared/rules';
import arena from '../../demo/arena.json';
import {isLocalDemo} from './local-client';
import './demo.css';
type Player={id:string;x:number;y:number;angle:number;health:number;ammo:number;reserve:number;shots:number};
type Snapshot={type:string;id?:string;identity?:{sourceVersion:string};players:Player[];shots:{id:string;x:number;y:number;endX:number;endY:number}[]};
function Demo(){
 const canvas=useRef<HTMLCanvasElement>(null),socket=useRef<WebSocket|null>(null),keys=useRef(new Set<string>()),aim=useRef({x:arena.width/2,y:arena.height/2,fire:false,reload:false});
 const state=useRef<Snapshot>({type:'snapshot',players:[],shots:[]}),ownId=useRef('');
 const [connected,setConnected]=useState(false),[status,setStatus]=useState('进入场地后，另开一个浏览器窗口加入。'),[me,setMe]=useState<Player|null>(null);
 useEffect(()=>()=>socket.current?.close(),[]);
 useEffect(()=>{
  const down=(e:KeyboardEvent)=>{if(['w','a','s','d','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Shift','r','R',' '].includes(e.key)){e.preventDefault();keys.current.add(e.key.toLowerCase());if(e.key.toLowerCase()==='r')aim.current.reload=true;}};
  const up=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase());
  const blur=()=>{keys.current.clear();aim.current.fire=false;};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
  const timer=window.setInterval(()=>{
   if(socket.current?.readyState!==WebSocket.OPEN||!connected)return;
   const current=state.current.players.find(p=>p.id===ownId.current);
   const x=Number(keys.current.has('d')||keys.current.has('arrowright'))-Number(keys.current.has('a')||keys.current.has('arrowleft'));
   const y=Number(keys.current.has('s')||keys.current.has('arrowdown'))-Number(keys.current.has('w')||keys.current.has('arrowup'));
   const angle=current?Math.atan2(aim.current.y-current.y,aim.current.x-current.x):0;
   socket.current.send(JSON.stringify({type:'input',moveX:x,moveY:y,sprint:keys.current.has('shift'),angle,fire:aim.current.fire||keys.current.has(' '),reload:aim.current.reload}));aim.current.reload=false;
  },50);
  let frame=0;const draw=()=>{
   const el=canvas.current,ctx=el?.getContext('2d');if(el&&ctx){const sx=el.width/arena.width,sy=el.height/arena.height;ctx.clearRect(0,0,el.width,el.height);ctx.fillStyle='#172b2e';ctx.fillRect(0,0,el.width,el.height);ctx.strokeStyle='#294448';for(let x=0;x<arena.width;x+=2){ctx.beginPath();ctx.moveTo(x*sx,0);ctx.lineTo(x*sx,el.height);ctx.stroke();}for(let y=0;y<arena.height;y+=2){ctx.beginPath();ctx.moveTo(0,y*sy);ctx.lineTo(el.width,y*sy);ctx.stroke();}
    ctx.fillStyle='#719297';for(const o of arena.obstacles)ctx.fillRect(o.x*sx,o.y*sy,o.width*sx,o.height*sy);
    ctx.strokeStyle='#f2c46d';ctx.lineWidth=3;for(const s of state.current.shots){ctx.beginPath();ctx.moveTo(s.x*sx,s.y*sy);ctx.lineTo(s.endX*sx,s.endY*sy);ctx.stroke();}
    for(const p of state.current.players){const own=p.id===ownId.current;ctx.fillStyle=own?'#f2c46d':'#80bdc1';ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,.48*sx,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#142527';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(p.x*sx,p.y*sy);ctx.lineTo((p.x+Math.cos(p.angle)*.7)*sx,(p.y+Math.sin(p.angle)*.7)*sy);ctx.stroke();ctx.fillStyle='#f4f2e8';ctx.font='13px sans-serif';ctx.fillText(own?'你':p.id.slice(0,4),p.x*sx-10,p.y*sy-18);}
   }frame=requestAnimationFrame(draw);
  };draw();return()=>{clearInterval(timer);cancelAnimationFrame(frame);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
 },[connected]);
 function join(){
  if(!isLocalDemo()){setStatus('本地演示只能在 localhost 运行。');return;}
  socket.current?.close();const ws=new WebSocket('ws://'+location.host+'/demo-realtime/');socket.current=ws;
  ws.onopen=()=>ws.send(JSON.stringify({type:'hello',sourceVersion:arena.sourceVersion}));
  ws.onmessage=e=>{try{const value=JSON.parse(String(e.data)) as Snapshot;if(value.type==='welcome'){ownId.current=value.id??'';setConnected(true);setStatus('已连接本机演示服务。');}if(value.type==='snapshot'){state.current=value;setMe(value.players.find(p=>p.id===ownId.current)??null);}}catch{setStatus('演示消息无效。');}};
  ws.onerror=()=>setStatus('连接失败，请先启动 node scripts/dev-demo.mjs。');ws.onclose=()=>{setConnected(false);setMe(null);setStatus('已断开本机演示服务。');};
 }
 return <main className="demo-shell"><header><a className="demo-brand" href="/"><img src="/anonymous-avatar.svg" alt="匿名演示角色"/>LIUFRAME INTERACTIVE</a><a href="/account/">本地账号 ↗</a></header><section className="demo-intro"><p className="demo-eyebrow">开源开发演示 · {arena.sourceVersion}</p><h1>同一个小场地，<br/>两扇浏览器窗口。</h1><p>用匿名角色试跑移动、射击和本地账号。场地与角色为 OpenQS 原创，演示复用共享武器与移动速度规则。</p><button onClick={join} disabled={connected||!isLocalDemo()}>{connected?'已加入本机场地':'进入本机场地'}</button><p className="demo-status" role="status">{status}</p></section><section className="demo-arena" aria-label="本机演示场地"><canvas ref={canvas} width={960} height={720} tabIndex={0} aria-label="WASD移动，鼠标瞄准，按住鼠标或空格开火，R换弹" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();aim.current.x=(e.clientX-r.left)/r.width*arena.width;aim.current.y=(e.clientY-r.top)/r.height*arena.height;}} onPointerDown={e=>{e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);aim.current.fire=true;}} onPointerUp={()=>{aim.current.fire=false;}} onPointerCancel={()=>{aim.current.fire=false;}}/><div className="demo-hud">{me?`生命 ${me.health} · ${WEAPONS.glock.label} ${me.ammo}/${me.reserve} · 发射 ${me.shots}`:'等待加入'} · 在线 {state.current.players.length}</div></section><footer><p>WASD / 方向键移动 · Shift 加速 · 鼠标瞄准 · 按住鼠标 / 空格开火 · R 换弹</p><p>共享步行速度 {RULES.walkSpeed} m/s。本地演示没有竞技结算或公开排行；不能加入正式服务。不覆盖正式校园、故事、驾驶或复杂联机同步。</p></footer></main>;
}
createRoot(document.getElementById('root')!).render(<Demo/>);
