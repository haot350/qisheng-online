import './driving-guidance.css';
import {staticAssetUrl} from './static-assets.ts';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {DRIVE_RULES} from './driving-rules';
import {DialoguePlayback} from './dafei-dialogue';
import type {DriveInput,DrivingSnapshot,GameAPI,TransmissionMode} from './types';
import {type PointerPosition,type PointerSession} from './pointer-owner';
import {usePointerSession} from './use-pointer-session';

const DrivePointerContext=createContext<PointerSession|null>(null);
function useDrivePointers(){const shared=useContext(DrivePointerContext),standalone=usePointerSession(true,!shared);return shared??standalone;}

const ZERO_DRIVE:DriveInput={steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false};
const timer=(seconds:number)=>`${Math.floor(Math.max(0,seconds)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,seconds)%60).toString().padStart(2,'0')}`;
function Arrow(){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>;}
function direction(angle:number){const names=['前方','右前方','右侧','右后方','后方','左后方','左侧','左前方'];return names[((Math.round(angle/(Math.PI/4))%8)+8)%8];}

export function DafeiIntro({onStart,onBack,onCue,onHelp,onRetry,busy,error='',progress=100,suspended=false,touch=false}:{onStart:()=>void;onBack:()=>void;onCue?:()=>void;onHelp:()=>void;onRetry:()=>void;busy:boolean;error?:string;progress?:number;suspended?:boolean;touch?:boolean}){
  const playback=useRef(new DialoguePlayback()),panel=useRef<HTMLDivElement>(null),lastCuedLine=useRef(-1);
  const [state,setState]=useState(()=>playback.current.snapshot),[photoFailed,setPhotoFailed]=useState(false);
  const [environmentPaused,setEnvironmentPaused]=useState(()=>typeof document!=='undefined'&&(document.hidden||(touch&&innerHeight>innerWidth)));
  const cue=useRef(onCue);cue.current=onCue;
  useEffect(()=>{const pause=()=>setEnvironmentPaused(document.hidden||(touch&&innerHeight>innerWidth));const blur=()=>setEnvironmentPaused(true);document.addEventListener('visibilitychange',pause);window.addEventListener('resize',pause);window.addEventListener('blur',blur);window.addEventListener('focus',pause);pause();return()=>{document.removeEventListener('visibilitychange',pause);window.removeEventListener('resize',pause);window.removeEventListener('blur',blur);window.removeEventListener('focus',pause);};},[touch]);
  useEffect(()=>{if(busy||error||suspended||environmentPaused||state.ended)return;if(lastCuedLine.current!==state.line){cue.current?.();lastCuedLine.current=state.line;}let last=performance.now();const interval=window.setInterval(()=>{const now=performance.now();const changed=playback.current.tick(Math.min(100,now-last));last=now;if(changed)setState(playback.current.snapshot);},16);return()=>window.clearInterval(interval);},[busy,error,suspended,environmentPaused,state.line,state.ended]);
  useEffect(()=>{panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();},[busy,error,state.ended]);
  const advance=()=>{if(busy||error||suspended||environmentPaused)return;playback.current.advance();setState(playback.current.snapshot);};
  return <section className="dafei-intro" role="dialog" aria-modal="true" aria-labelledby="dafei-intro-title" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();onBack();}
    if((e.key==='Enter'||e.key===' '||e.key==='ArrowRight')&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();advance();}
    if(e.key==='Tab'){const controls=panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  }}><div className="dafei-intro-panel" ref={panel}>
    <figure className="dafei-portrait">{!photoFailed&&<img src={staticAssetUrl('/images/dafei-guide.webp')} alt="大飞老师的开场肖像" onError={()=>setPhotoFailed(true)}/>}</figure>
    <div className="dafei-dialogue"><h2 id="dafei-intro-title">大飞老师</h2>
      {busy?<div className="intro-loading" role="status"><p>准备校园与汽车</p><progress max={100} value={Math.max(0,Math.min(100,progress))}/></div>:error?<p className="intro-error" role="alert">{error}</p>:state.ended?<p className="dafei-line">走吧。先送哪位，你定。</p>:<button className="dafei-line dialogue-advance" aria-label={state.complete?'下一句对白':'显示完整对白'} onClick={advance}><span>{state.text||'\u00a0'}</span><span className="dialogue-hint">{state.complete?'点击继续':'点击补全'}</span></button>}
      <div className="dafei-intro-actions">
        {error?<button className="primary" onClick={onRetry} disabled={busy}>重试准备<Arrow/></button>:state.ended&&<><button className="primary" onClick={onStart} disabled={busy}>开始驾驶<Arrow/></button><button className="text-button" onClick={onHelp} disabled={busy}>操作说明</button></>}
        {!state.ended&&!error&&<button className="text-button" onClick={()=>{playback.current.skip();setState(playback.current.snapshot);}} disabled={busy||suspended}>跳过对白</button>}
        <button className="text-button" onClick={onBack}>返回模式选择</button>
      </div>
    </div>
  </div></section>;
}

type HoldField=Exclude<keyof DriveInput,'steer'>;
function DriveHoldButton({api,field,label,value,children,className='',onHeldChange}:{api:GameAPI|null;field:HoldField;label:string;value:number|boolean;children?:ReactNode;className?:string;onHeldChange?:(held:boolean)=>void}){
  const pointers=useDrivePointers(),[pressed,setPressed]=useState(false),key='pedal:'+field;
  const heldChange=useRef(onHeldChange);heldChange.current=onHeldChange;
  const idleValue=typeof value==='boolean'?false:0;
  const update=(next:number|boolean)=>{if(heldChange.current)heldChange.current(Boolean(next));else api?.drive({[field]:next} as Partial<DriveInput>);};
  useEffect(()=>{setPressed(false);return()=>{pointers.release(key,true);if(heldChange.current)heldChange.current(false);else api?.drive({[field]:idleValue} as Partial<DriveInput>);};},[api,field,idleValue,pointers,key]);
  return <button className={`drive-button ${pressed?'active':''} ${className}`} style={className.includes('drive-utility')?{minWidth:44,flex:1,padding:'6px 4px'}:undefined} aria-label={label} aria-pressed={pressed} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{e.preventDefault();e.stopPropagation();if(pointers.begin(key,e,()=>{update(idleValue);setPressed(false);})){update(value);setPressed(true);}}} onPointerUp={e=>pointers.releasePointer(e.pointerId)} onPointerCancel={e=>pointers.releasePointer(e.pointerId,true)} onLostPointerCapture={e=>pointers.releasePointer(e.pointerId,true)}><span>{label}</span>{children}</button>;
}

export function TransmissionChoice({mode,onChange,disabled=false}:{mode:TransmissionMode;onChange:(mode:TransmissionMode)=>void;disabled?:boolean}){
 return <label className="transmission-choice"><span>驾驶变速</span><select aria-label="驾驶变速" value={mode} disabled={disabled} onChange={e=>onChange(e.target.value==='manual'?'manual':'auto')}><option value="auto">自动换挡</option><option value="manual">手动换挡</option></select></label>;
}

/** Each shift is a single command; pointer ownership never changes a held pedal. */
export function DriveShiftButton({api,action,label}:{api:GameAPI|null;action:'shiftUp'|'shiftDown';label:string}){
 const pointers=useDrivePointers(),[pressed,setPressed]=useState(false),key='shift:'+action;
 useEffect(()=>{setPressed(false);return()=>{pointers.release(key,true);};},[api,action,pointers,key]);
 return <button className={`drive-button drive-shift-button ${pressed?'active':''}`} aria-label={action==='shiftUp'?'升高一挡':'降低一挡'} onPointerDown={e=>{e.preventDefault();e.stopPropagation();if(pointers.begin(key,e,cancelled=>{setPressed(false);if(cancelled)api?.cancelAction?.(action);})){setPressed(true);api?.action(action);}}} onPointerUp={e=>pointers.releasePointer(e.pointerId)} onPointerCancel={e=>pointers.releasePointer(e.pointerId,true)} onLostPointerCapture={e=>pointers.releasePointer(e.pointerId,true)} onClick={e=>{if(e.detail===0)api?.action(action);}} onContextMenu={e=>e.preventDefault()}><span>{label}</span></button>;
}

export function drivingGearLabel(gear:number):string{return !Number.isFinite(gear)||gear===0?'N':gear<0?'R':String(Math.round(gear));}
export function DrivingInstrument({driving}:{driving:DrivingSnapshot}){
 const rpm=Number.isFinite(driving.rpm)?Math.max(0,driving.rpm):0,speed=Number.isFinite(driving.speed)?Math.abs(driving.speed)*3.6:0,gear=drivingGearLabel(driving.gear);
 const lastRejection=useRef(driving.rejectedShiftSerial),[rejected,setRejected]=useState(false);
 useEffect(()=>{if(lastRejection.current===driving.rejectedShiftSerial)return;lastRejection.current=driving.rejectedShiftSerial;setRejected(true);const timer=window.setTimeout(()=>setRejected(false),380);return()=>window.clearTimeout(timer);},[driving.rejectedShiftSerial]);
 const color=rpm>=6250?'#f68b77':rpm>=5500?'#e8c27e':'#dce7d6';
 return <aside className={`drive-instrument ${rejected?'gear-rejected':''} ${driving.shiftLeft>0?'gear-shifting':''}`} aria-label={`车速 ${Math.round(speed)} 公里每小时，${driving.transmission==='manual'?'手动':'自动'} ${gear} 挡，转速 ${Math.round(rpm)}`} data-shift={driving.shiftSerial}>
  <svg className="drive-rpm-arc" viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="M8 36A20 20 0 1 1 36 36" pathLength="100" stroke="#ffffff30" strokeWidth="3" strokeLinecap="round"/><path d="M8 36A20 20 0 1 1 36 36" pathLength="100" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${Math.min(100,rpm/7000*100)} 100`}/></svg>
  <div className="drive-instrument-speed"><strong>{Math.round(speed)}</strong><span>km/h</span></div><div className="drive-instrument-gear"><small>{driving.transmission==='manual'?'M':'A'}</small><strong>{gear}</strong></div><small className="drive-instrument-rpm">{(rpm/1000).toFixed(1)} <span>×1000 rpm</span></small>
 </aside>;
}
let manualHintSeenInSession=false;
export function TouchDrive({api,driving,disabled=false}:{api:GameAPI|null;driving:DrivingSnapshot;disabled?:boolean}){
  const pointers=usePointerSession(!disabled),steering=useRef<HTMLDivElement>(null),knob=useRef<HTMLSpanElement>(null),lastLook=useRef([0,0]);
  const pedals=useRef({throttle:false,reverse:false,brake:false});
  useEffect(()=>{pedals.current={throttle:false,reverse:false,brake:false};if(knob.current)knob.current.style.transform='translateX(0)';return()=>{pointers.clear();api?.holdLook(false);api?.drive({...ZERO_DRIVE});};},[api,pointers]);
  const holdPedal=(field:'throttle'|'reverse'|'brake',held:boolean)=>{pedals.current[field]=held;const state=pedals.current;api?.drive({throttle:state.throttle||state.reverse?1:0,reverse:state.reverse,brake:state.brake?1:0});};
  const steer=(e:PointerPosition)=>{if(!steering.current)return;const rect=steering.current.getBoundingClientRect(),range=Math.max(1,rect.width/2-29),value=Math.max(-1,Math.min(1,(e.clientX-rect.left-rect.width/2)/range));api?.drive({steer:value});if(knob.current)knob.current.style.transform=`translateX(${value*range}px)`;};
  return <DrivePointerContext.Provider value={pointers}><div className="touch-layer drive-controls"><div className="look-zone" aria-label="滑动观察驾驶方向" onPointerDown={e=>{if(disabled)return;e.preventDefault();if(pointers.begin('look',e,()=>api?.holdLook(false),event=>{api?.look(event.clientX-lastLook.current[0],event.clientY-lastLook.current[1]);lastLook.current=[event.clientX,event.clientY];})){api?.holdLook(true);lastLook.current=[e.clientX,e.clientY];}}}/>
    <div className="drive-steering" ref={steering} aria-label="左右拖动转向" onPointerDown={e=>{if(disabled)return;e.preventDefault();e.stopPropagation();if(pointers.begin('steer',e,()=>{api?.drive({steer:0});if(knob.current)knob.current.style.transform='translateX(0)';},steer))steer(e);}}><span className="steer-track"/><span className="steer-knob" ref={knob}>↔</span></div>
    <div className="drive-pedals" style={{width:'clamp(186px, 28vw, 226px)'}}>{driving.transmission==='manual'&&<div className="drive-shift-row"><DriveShiftButton api={api} action="shiftDown" label="−挡"/><DriveShiftButton api={api} action="shiftUp" label="+挡"/></div>}<div className="drive-utilities" style={{width:'100%'}}><DriveHoldButton api={api} field="reset" value={true} label="重置" className="drive-utility"><small style={{fontSize:11}}>{driving.resetProgress>0?`${Math.ceil(Math.max(0,DRIVE_RULES.resetDuration-driving.resetProgress))} 秒`:'长按 2 秒'}</small></DriveHoldButton><DriveHoldButton api={api} field="handbrake" value={true} label="手刹" className="drive-utility handbrake-button"><small style={{fontSize:11}}>短按转弯</small></DriveHoldButton><DriveHoldButton api={api} field="boost" value={true} label="加速" className="drive-utility boost-button"><small style={{fontSize:11}}>{driving.boostLeft>0?`${Math.ceil(driving.boostLeft)} 秒`:driving.boostCooldown>0?`冷却 ${Math.ceil(driving.boostCooldown)} 秒`:'已就绪'}</small></DriveHoldButton></div><div className="drive-pedal-row"><DriveHoldButton api={api} field="reverse" value={true} label="倒车" onHeldChange={held=>holdPedal('reverse',held)}/><DriveHoldButton api={api} field="brake" value={1} label="刹车" onHeldChange={held=>holdPedal('brake',held)}/><DriveHoldButton api={api} field="throttle" value={1} label="油门" className="throttle-button" onHeldChange={held=>holdPedal('throttle',held)}/></div></div>
  </div></DrivePointerContext.Provider>;
}

export function DrivingHUD({api,driving,remaining,onPause,onFullscreen,children,touch=false,disabled=false}:{api:GameAPI|null;driving:DrivingSnapshot;remaining:number;onPause:()=>void;onFullscreen:()=>void;children?:ReactNode;touch?:boolean;disabled?:boolean}){
  const pointers=usePointerSession(!disabled);
  const durability=Math.max(0,Math.min(DRIVE_RULES.durability,driving.durability));
  const [manualHint,setManualHint]=useState(false),preparing=driving.countdown>0;
  useEffect(()=>{if(driving.transmission!=='manual'||preparing||manualHintSeenInSession)return;try{if(localStorage.getItem('qisheng-driving-manual-hint')==='1'){manualHintSeenInSession=true;return;}localStorage.setItem('qisheng-driving-manual-hint','1');}catch{}manualHintSeenInSession=true;setManualHint(true);const timer=window.setTimeout(()=>setManualHint(false),7000);return()=>window.clearTimeout(timer);},[driving.transmission,preparing]);
  return <DrivePointerContext.Provider value={pointers}><div className="hud driving-hud"><div className="hud-top"><div className="mission drive-summary"><div className="drive-summary-title"><span>大飞模式</span><strong>积分 {driving.score}</strong></div><div className="drive-summary-score"><span>撞飞 {driving.hits} 次</span><span className={driving.combo>1?'combo-active':''}>连击 {driving.combo}</span></div><div className="drive-summary-car"><span>车况 <strong>{Math.ceil(durability)} / {DRIVE_RULES.durability}</strong></span></div><div className="stat-bar" aria-label={`车辆耐久 ${Math.ceil(durability)}`}><i style={{width:`${durability/DRIVE_RULES.durability*100}%`}}/></div></div><div className="hud-actions"><span className={`timer ${remaining<60?'urgent':''}`}>{timer(remaining)}</span><button className="hud-button fullscreen-button" aria-label="切换全屏" onClick={onFullscreen}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/></svg></button><button className="hud-button" aria-label="暂停驾驶" onClick={onPause}><svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.65" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button></div></div>
    <DrivingInstrument driving={driving}/>
    {!!driving.areas?.length&&<nav className="drive-area-guides" aria-label="校园活动区域">{driving.areas.map(area=><span key={area.id} aria-label={`${area.name}，${direction(area.angle)}`}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{transform:`rotate(${area.angle}rad)`}}><path d="M10 17V3m-5 5 5-5 5 5"/></svg>{area.name}</span>)}</nav>}
    <div className="drive-targets">{driving.targets.slice(0,4).map(target=><span key={target.id} style={{opacity:Math.min(1,Math.max(0,target.remaining))}}>{target.name} {direction(target.angle)}</span>)}</div>
    <div className="desktop-drive-boost"><DriveHoldButton api={api} field="boost" value={true} label="加速"><small>{driving.boostLeft>0?`${Math.ceil(driving.boostLeft)} 秒`:driving.boostCooldown>0?`冷却 ${Math.ceil(driving.boostCooldown)} 秒`:'Shift · 已就绪'}</small></DriveHoldButton></div>
    {driving.countdown>0&&<div className="drive-countdown" role="status"><strong>{Math.ceil(driving.countdown)}</strong><span>准备出发</span></div>}
    {(driving.repairProgress>0||driving.resetProgress>0)&&<div className="drive-progress" role="status"><strong>{driving.resetProgress>0?'正在回到道路':`${driving.repairName||'维修点'}维修中`}</strong><progress max={driving.resetProgress>0?DRIVE_RULES.resetDuration:DRIVE_RULES.repairDuration} value={driving.resetProgress>0?driving.resetProgress:driving.repairProgress}/><span>{driving.resetProgress>0?'继续按住重置':'保持停稳'}</span></div>}
    {manualHint?<p className="drive-guide drive-manual-hint" role="status">{touch?'用 +挡 / −挡换挡。急弯先减速。':'E 升挡 · Q 降挡。急弯先减速。'}</p>:driving.guide&&<p className="drive-guide" role="status"><span>大飞老师</span>{driving.guide}</p>}
    {children}
  </div></DrivePointerContext.Provider>;
}

export function DrivingResult({driving,elapsed,lost,reason,onRestart,onMenu,busy,children}:{driving:DrivingSnapshot;elapsed:number;lost:boolean;reason:string;onRestart:()=>void;onMenu:()=>void;busy:boolean;children?:React.ReactNode}){
  return <div className="result-shade"><section className="result-panel drive-result"><p className="panel-kicker">{lost?'车辆耐久耗尽':'驾驶挑战完成'}</p><h2>{lost?'先停一停，再出发。':'这一圈，开得不错。'}</h2><p>{reason||(lost?'车辆已无法继续行驶。下次留意来袭方向，也可以在维修点停稳修复。':'五分钟结束，看看这一局的成绩。')}</p><div className="result-stats"><div><span>本局积分</span><strong>{driving.score}</strong></div><div><span>撞飞次数</span><strong>{driving.hits}</strong></div><div><span>最高连击</span><strong>{driving.bestCombo}</strong></div><div><span>本次用时</span><strong>{timer(elapsed)}</strong></div><div><span>本规则最高积分</span><strong>{driving.bestScore??'—'}</strong></div>{driving.legacyBestScore!==null&&<div><span>旧规则最高积分</span><strong>{driving.legacyBestScore}</strong></div>}</div>{children}<button className="primary" onClick={onRestart} disabled={busy}>再开一局<Arrow/></button><button className="text-button" onClick={onMenu}>返回模式选择</button></section></div>;
}

export function DrivingHelp({touch}:{touch:boolean}){
  return <div className="help-columns"><div><h3>五分钟，沿路争取积分</h3><p>沿道路寻找四位追逐者，撞飞他们计分。挑战持续五分钟，耐久耗尽提前结束；方向提示给出大致活动区域。追逐者落地昏迷十秒后会在视线外重新登场，不必守在落点。</p><p>有效撞飞基础 100 分。二十秒内连续撞飞不同人物提高倍率，最高 ×4；连续重复同一人重置为 ×1。飞行或昏迷时不重复计分。前十秒追逐者不开火；之后最多两人同时攻击。普通碰墙不扣耐久。</p><p>徐涛会短时冲刺，程国涛会抬手通知同伴。利用遮挡打断，或趁他们准备时撞飞。</p><h3>维修与脱困</h3><p>耐久最多 {DRIVE_RULES.durability} 点。靠近维修点并停稳三秒，恢复 {DRIVE_RULES.repairAmount} 点，每个维修点每局只能使用一次。车辆耐久耗尽则提前结束。</p><p>长按重置两秒，回到附近安全道路并扣除 50 分、清除连击。车辆只在室外道路、庭院和运动区活动，不进入建筑或楼梯。</p><h3>变速与转弯</h3><p>菜单或暂停页可选择自动、手动六挡变速。自动模式自行换挡；手动模式在加速时逐挡升挡，减速后再降挡，车速过高时会拒绝危险降挡。变速偏好保存在本机。</p><p>进入急弯前先松油门、减速，再转向。转弯时短拉手刹可以帮助车尾转向，出弯及时松开；很高车速下手刹以制动为主。甩尾不额外计分。</p><h3>加速与音乐</h3><p>普通极速约 75 km/h，加速时约 100 km/h。加速持续三秒，结束后冷却十二秒。驾驶音乐可在设置中调整，暂停时一起暂停。</p></div><div>{!touch&&<><h3>电脑</h3><dl className="key-list"><div><dt>W / A / D</dt><dd>油门 / 左转 / 右转</dd></div><div><dt>S / 空格</dt><dd>刹车与倒车 / 手刹</dd></div><div><dt>E / Q（手动）</dt><dd>升挡 / 降挡</dd></div><div><dt>Shift / 长按 R</dt><dd>加速 / 重置车辆</dd></div><div><dt>右键拖动 / Esc</dt><dd>观察 / 暂停</dd></div></dl></>}<h3>{touch?'触屏与拖动操作':'手机'}</h3><p>横屏游玩。左侧横摇杆转向，右侧按住油门或刹车，倒车有单独按钮。在右侧空白处滑动观察，可以同时转向、踩油门和短按手刹。手动模式显示独立的“−挡”“+挡”，点一下换一挡，不会松开正在按住的油门或转向。</p><p>松开转向会自动回正；松开踏板则停止输入。按住重置两秒才能完成脱困。</p></div></div>;
}
