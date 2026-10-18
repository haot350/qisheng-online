import {useEffect,useRef,useState} from 'react';
import {type PointerSession} from './pointer-owner';
import {usePointerSession} from './use-pointer-session';
import {PHOTO_POINTER_KEYS,createShutterPointerHandlers,createCompositionPointerHandlers,createFocusPointerHandlers,createMovementPointerHandlers} from './photography/pointer-controls';
import type {PhotoControl,PhotoMetadata,PhotoRecord,PhotoSettings,PhotoSnapshot} from './photography/types';
import {APERTURES,ISOS,SHUTTERS,shutterLabel} from './photography/math';
import {downloadPhoto,AlbumFullError} from './photography/album';
import {PhotoImage,PhotoThumbnail,useAlbumMedia} from './photography/AlbumMedia';
import {shareOrDownloadPhoto} from './photography/share';
import './photo.css';
import {useModalFocus} from './modal-focus';
import {RealityUI} from './RealityUI';
import './reality.css';
export type PhotoUIProps={snapshot:PhotoSnapshot;system:PhotoControl;onClose:()=>void;onPause?:()=>void;touch?:boolean;keyboardBlocked?:boolean;temporaryPhotos?:PhotoRecord[];onPanelState?:(open:boolean)=>void;onAlbumState?:(open:boolean)=>void;onRemove?:(id:string)=>void;feedback?:{message:string;persisted:boolean}|null;onArchive?:()=>void;onObserve?:()=>void;onCursorRelease?:()=>void;onLook?:(x:number,y:number)=>void;onMove?:(x:number,y:number)=>void;lastPhoto?:PhotoRecord|null;task?:{label:string;objective:string;progress?:string};realityNotice?:string;onTaskAction?:(action:'opened'|'focus'|'shutter'|'closed')=>void;onRealityState?:(ready:boolean)=>void;realityHints?:boolean;realityHintState?:'off'|'loading'|'ready'|'error';onRealityHintsChange?:(enabled:boolean)=>void;onRetryRealityHints?:()=>void};
const compact=(n:number)=>Number(n.toFixed(1));
const ALBUM_FULL_MESSAGE=new AlbumFullError().message;
const previewedPhotos=new WeakSet<PhotoRecord>();
export function PhotoUI({snapshot:p,system,onClose,onPause,onArchive,onObserve,onCursorRelease,onLook,onMove,lastPhoto,task,feedback,touch=false,keyboardBlocked=false,temporaryPhotos,onPanelState,onAlbumState,onRemove,realityNotice,onRealityState,realityHints=false,realityHintState,onRealityHintsChange,onRetryRealityHints}:PhotoUIProps){
 const s=p.settings,[panel,setPanel]=useState(false),[album,setAlbum]=useState(false),[error,setError]=useState(''),[observing,setObserving]=useState(()=>typeof document!=='undefined'&&!!document.pointerLockElement),shotRef=useRef<HTMLButtonElement>(null),compositionRef=useRef<HTMLDivElement>(null);const busy=p.shutterPending||p.state==='timer'||p.state==='exposing'||p.state==='saving';
 const photoError=(error===ALBUM_FULL_MESSAGE&&p.albumCount<50?'':error)||(p.albumCount>=50&&p.message===ALBUM_FULL_MESSAGE?ALBUM_FULL_MESSAGE:'');
 const inputBlocked=keyboardBlocked||panel||album||p.state==='paused';
 const pointers=usePointerSession(!inputBlocked);
 const [showHint,setShowHint]=useState(true);useEffect(()=>{const timer=setTimeout(()=>setShowHint(false),7000);return()=>clearTimeout(timer);},[]);
 const update=(v:Partial<PhotoSettings>)=>system.configure(v);
 const take=()=>{setError('');void system.capture().catch(e=>setError(e instanceof AlbumFullError?e.message:'这次拍摄未完成，请再试一次。'));};
 const shutterEnabled=!busy&&p.state!=='paused'&&p.viewReady&&!panel&&!album&&!keyboardBlocked;
 const shutterAction=useRef({take,enabled:shutterEnabled});shutterAction.current={take,enabled:shutterEnabled};
 const shutterHandlers=useRef(createShutterPointerHandlers(pointers,()=>shutterAction.current.take(),()=>shutterAction.current.enabled));
 const compositionActions=useRef({system,onObserve,onLook,blocked:inputBlocked||(p.state==='exposing'&&p.exposure.shutter>.25)});compositionActions.current={system,onObserve,onLook,blocked:inputBlocked||(p.state==='exposing'&&p.exposure.shutter>.25)};
 const compositionHandlers=useRef(createCompositionPointerHandlers(pointers,{locked:()=>typeof document!=='undefined'&&!!document.pointerLockElement,blocked:()=>compositionActions.current.blocked,focus:(x,y)=>compositionActions.current.system.focus(x,y),look:(x,y)=>compositionActions.current.onLook?.(x,y),observe:()=>compositionActions.current.onObserve?.()}));
 const modalCallbacks=useRef({onPanelState,onAlbumState});modalCallbacks.current={onPanelState,onAlbumState};
 const panelState=useRef(false),albumState=useRef(false);
 const focusAction=useRef({system,enabled:!busy&&!inputBlocked&&s.focusMode!=='manual'});focusAction.current={system,enabled:!busy&&!inputBlocked&&s.focusMode!=='manual'};
 const focusSystems=useRef(new Map<string,PhotoControl>());
 const focusHandlers=useRef(createFocusPointerHandlers(pointers,(source,held)=>{const owner=held?focusAction.current.system:focusSystems.current.get(source);if(held)focusSystems.current.set(source,owner!);else focusSystems.current.delete(source);owner?.setFocusHeld(source,held);},()=>focusAction.current.enabled));
 const {cancel:cancelFocus,...focusButtonHandlers}=focusHandlers.current;
 useEffect(()=>{panelState.current=panel;modalCallbacks.current.onPanelState?.(panel);},[panel]);
 useEffect(()=>{albumState.current=album;modalCallbacks.current.onAlbumState?.(album);},[album]);
 useEffect(()=>{const changed=()=>setObserving(!!document.pointerLockElement);changed();document.addEventListener('pointerlockchange',changed);return()=>document.removeEventListener('pointerlockchange',changed);},[]);
 useEffect(()=>{if(inputBlocked||busy||s.focusMode==='manual')cancelFocus();},[inputBlocked,busy,s.focusMode,cancelFocus]);
 useEffect(()=>{if(!shutterEnabled)pointers.release(PHOTO_POINTER_KEYS.shutter);if(compositionActions.current.blocked)pointers.release(PHOTO_POINTER_KEYS.composition);},[shutterEnabled,inputBlocked,p.state,p.exposure.shutter,pointers]);
 useEffect(()=>()=>{if(panelState.current)modalCallbacks.current.onPanelState?.(false);if(albumState.current)modalCallbacks.current.onAlbumState?.(false);cancelFocus();pointers.clear();},[system,pointers,cancelFocus]);
 const resumeObservation=useRef(false);
 const openPhotoPanel=(kind:'parameters'|'album')=>{if(keyboardBlocked||kind==='album'&&busy)return;if(!panel&&!album)resumeObservation.current=!touch&&(observing||!!document.pointerLockElement);onCursorRelease?.();if(kind==='parameters'){setAlbum(false);setPanel(true);}else{setPanel(false);setAlbum(true);}};
 const closePhotoPanel=()=>{modalCallbacks.current.onPanelState?.(false);modalCallbacks.current.onAlbumState?.(false);setPanel(false);setAlbum(false);const resume=resumeObservation.current;resumeObservation.current=false;if(resume&&!keyboardBlocked&&!busy)onObserve?.();};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(touch||keyboardBlocked||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(e.code!=='KeyP'&&e.code!=='KeyV')return;if(busy&&e.code==='KeyV')return;e.preventDefault();e.stopImmediatePropagation();if(e.code==='KeyP'&&panel||e.code==='KeyV'&&album)closePhotoPanel();else openPhotoPanel(e.code==='KeyP'?'parameters':'album');};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[touch,keyboardBlocked,busy,panel,album,observing,onObserve,onCursorRelease]);
 const [preview,setPreview]=useState<PhotoRecord|null>(null);
 useEffect(()=>{if(!lastPhoto){setPreview(null);return;}if(previewedPhotos.has(lastPhoto))return;previewedPhotos.add(lastPhoto);setPreview(lastPhoto);const timer=setTimeout(()=>setPreview(null),3000);return()=>clearTimeout(timer);},[lastPhoto?.id]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code!=='Escape'||keyboardBlocked||album||(typeof document!=='undefined'&&document.pointerLockElement))return;e.preventDefault();e.stopImmediatePropagation();if(album||panel)closePhotoPanel();else if(busy)system.cancel();else onClose();};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[system,onClose,busy,album,panel,keyboardBlocked]);
 useEffect(()=>{const element=compositionRef.current;if(!element)return;const wheel=(e:WheelEvent)=>{e.preventDefault();if(compositionActions.current.blocked)return;system.configure({focalLength:Math.max(24,Math.min(105,system.snapshot().settings.focalLength+(e.deltaY>0?-3:3)))});};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);},[system]);
 return <div className={`photo-ui ${s.interface==='simple'?'photo-simple':''} ${touch?'photo-touch':''}`} aria-label="摄影取景器">
  <div ref={compositionRef} className={`photo-composition ${s.orientation}`} {...compositionHandlers.current}>
   {s.grid&&<div className="photo-grid" aria-hidden="true"><i/><i/><b/><b/></div>}
   <div className={`photo-focus ${p.focusState==='acquiring'?'acquiring':p.focusConfirmed?'confirmed':''}`} style={{left:`${50+(p.focusPoint?.[0]??0)*50*(s.magnify?5:1)}%`,top:`${50-(p.focusPoint?.[1]??0)*50*(s.magnify?5:1)}%`}} aria-label={p.focusConfirmed?'对焦完成':'对焦点'}/>
   {s.level&&<div className={`photo-level ${Math.abs(p.roll)<1?'balanced':''}`} aria-label={`倾斜 ${compact(p.roll)} 度`}><i style={{transform:`rotate(${p.roll}deg)`}}/><span>{compact(p.roll)}°</span></div>}
  </div>
  <header className="photo-header"><div><strong>{s.interface==='simple'?'简易拍照':'EOS 5D Mark II'}</strong>{s.interface==='professional'&&<small>{s.mode} · EF24–105mm f/4L</small>}</div><nav>{!touch&&onCursorRelease&&<button onClick={onCursorRelease} title="Tab 操作界面">操作界面</button>}<button disabled={keyboardBlocked} onClick={()=>panel?closePhotoPanel():openPhotoPanel('parameters')} aria-expanded={panel}>摄影参数{!touch&&<small> P</small>}</button><button disabled={keyboardBlocked||busy} onClick={()=>openPhotoPanel('album')}>相册{!touch&&<small> V</small>} {p.albumCount}/50</button>{onArchive&&<button disabled={keyboardBlocked||busy} onClick={onArchive}>校园实拍</button>}{onPause&&<button className="photo-pause" disabled={keyboardBlocked} onClick={onPause} aria-label="暂停游戏">暂停</button>}<button onClick={()=>{if(panel){modalCallbacks.current.onPanelState?.(false);setPanel(false);}onClose();}}>放下相机</button></nav></header>
  {!panel&&!album&&!keyboardBlocked&&!busy&&(!observing&&!touch||showHint)&&<div className="photo-observe-hint">{touch?'按住对焦 · 点击快门':observing?'移动鼠标观察 · F 对焦 · 空格拍照':'点击画面继续观察'}</div>}
  {task&&!panel&&!album&&!busy&&!keyboardBlocked&&<aside className="photo-task"><strong>{task.label}</strong><span>{task.objective}</span>{task.progress&&task.progress!==task.objective&&<small>{task.progress}</small>}</aside>}
  {realityNotice&&<div className="photo-reality-notice" role="status">{realityNotice}</div>}
  {s.interface==='professional'&&<div className="photo-readout"><span>{Math.round(s.focalLength)}mm</span><span>f/{p.exposure.aperture}</span><span>{shutterLabel(p.exposure.shutter)}</span><span>ISO {p.exposure.iso}</span><span className={Math.abs(p.exposure.meterEV)>2?'warning':''}>{p.exposure.meterEV>=0?'+':''}{compact(p.exposure.meterEV)} EV{s.aeLock?' · AE锁定':''}</span><span>{p.focusDistance>=1000?'∞':`${compact(p.focusDistance)}m`}</span></div>}
  {s.interface==='professional'&&s.histogram&&<div className="photo-histogram" aria-label="亮度直方图">{p.histogram.map((n,i)=><i key={i} style={{height:`${n/Math.max(1,...p.histogram)*100}%`}}/>)}</div>}
  {(busy||p.state==='paused'&&!panel&&!album&&!keyboardBlocked)&&<div className="photo-exposure-status" role="status"><strong>{p.shutterPending?'正在对焦':p.state==='timer'?`${Math.ceil(p.remaining)}`:p.state==='saving'?'正在保存':p.state==='paused'?'摄影已暂停':`${p.remaining.toFixed(1)} 秒`}</strong><span>{p.state==='timer'?'自拍倒计时':p.state==='exposing'?'正在曝光，请保持构图':''}</span>{busy&&<button onClick={()=>system.cancel()}>取消本次拍摄</button>}</div>}
  {!p.viewReady&&<aside className="photo-view-loading" role="status"><span>{p.viewFailed?'取景尚未准备好':'正在准备取景'} · {Math.round(p.viewProgress*100)}%</span><small>{panel?'关闭参数面板后可以继续构图。':inputBlocked?'返回取景后继续构图。':'可以继续移动和观察，准备好后即可拍摄。'}</small>{p.viewFailed&&system.retryView&&<button onClick={()=>system.retryView?.()}>重新载入取景</button>}</aside>}
  <aside className="photo-tools"><label>变焦 {Math.round(s.focalLength)}mm<input aria-label="焦距" type="range" min="24" max="105" value={s.focalLength} disabled={busy} onChange={e=>update({focalLength:Number(e.target.value)})}/></label><button className={p.focusState==='acquiring'?'photo-af active':'photo-af'} disabled={busy||inputBlocked||s.focusMode==='manual'} aria-label="按住对焦" {...focusButtonHandlers} onContextMenu={e=>e.preventDefault()}>对焦{!touch&&<small>按住 F</small>}</button><button ref={shotRef} className="photo-shutter" aria-label="拍摄照片" disabled={!shutterEnabled} {...shutterHandlers.current}><i/></button></aside>
  {onMove&&touch&&<PhotoMovement pointers={pointers} onMove={onMove} disabled={inputBlocked||(p.state==='exposing'&&p.exposure.shutter>.25)}/>}
  {panel&&<section className="photo-settings" aria-label="摄影参数"><div className="photo-settings-title"><strong>{s.interface==='simple'?'自动拍照':'专业参数'}</strong><button onClick={closePhotoPanel}>收起</button></div>
   <button onClick={()=>update({interface:s.interface==='simple'?'professional':'simple'})}>{s.interface==='simple'?'使用专业参数':'使用简易拍照'}</button><button onClick={()=>update({orientation:s.orientation==='portrait'?'landscape':'portrait'})}>{s.orientation==='portrait'?'改为横构图':'改为竖构图'}</button>
   {onRealityHintsChange&&<><Check label="实拍机位提示" checked={realityHints} action={onRealityHintsChange}/><p>黄色标记指向任务机位；蓝色标记指向校园实拍。{realityHintState==='loading'?'正在载入机位提示。':realityHintState==='error'?'提示未载入。':''}</p>{realityHintState==='error'&&onRetryRealityHints&&<button onClick={onRetryRealityHints}>重试机位提示</button>}</>}
   {s.interface==='simple'?<label>拍摄预设<select value={s.preset} disabled={busy} onChange={e=>update({preset:e.target.value as PhotoSettings['preset']})}><option value="landscape">风景 · 较大景深</option><option value="portrait">人物 · 优先大光圈</option><option value="motion">运动 · 优先高速快门</option></select></label>:<>
    <label>曝光模式<select value={s.mode} disabled={busy} onChange={e=>update({mode:e.target.value as PhotoSettings['mode']})}><option>P</option><option>Av</option><option>Tv</option><option>M</option></select></label>
    <label>光圈<select value={s.aperture} disabled={busy||s.mode==='P'||s.mode==='Tv'} onChange={e=>update({aperture:Number(e.target.value)})}>{APERTURES.map(n=><option key={n} value={n}>f/{n}</option>)}</select></label>
    <label>快门<select value={s.shutter} disabled={busy||s.mode==='P'||s.mode==='Av'} onChange={e=>update({shutter:Number(e.target.value)})}>{SHUTTERS.map(n=><option key={n} value={n}>{shutterLabel(n)}</option>)}</select></label>
    <label>ISO<select value={s.autoISO?'auto':s.iso} disabled={busy} onChange={e=>update(e.target.value==='auto'?{autoISO:true}:{autoISO:false,iso:Number(e.target.value)})}>{s.mode!=='M'&&<option value="auto">自动 ISO</option>}{ISOS.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
    {s.mode==='P'&&<label>程序偏移 {s.programShift.toFixed(1)}<input type="range" min="-3" max="3" step=".333333" disabled={busy} value={s.programShift} onChange={e=>update({programShift:Number(e.target.value)})}/></label>}
   </>}
   {(s.interface==='simple'||s.mode!=='M')&&<label>曝光补偿 {s.compensation>=0?'+':''}{s.compensation.toFixed(1)} EV<input type="range" min="-2" max="2" step=".333333" disabled={busy} value={s.compensation} onChange={e=>update({compensation:Number(e.target.value)})}/></label>}
   <label>对焦<select value={s.focusMode} disabled={busy} onChange={e=>update({focusMode:e.target.value as PhotoSettings['focusMode']})}><option value="single">单次 AF · 合焦后锁定</option><option value="continuous">连续 AF · 按住时跟焦</option><option value="manual">手动对焦</option></select></label>
   {s.focusMode==='manual'&&<><label>焦点距离 {s.focusDistance>=1000?'∞':`${compact(s.focusDistance)}m`}<input type="range" min={Math.log(.45)} max={Math.log(2000)} step=".025" disabled={busy} value={Math.log(s.focusDistance)} onChange={e=>update({focusDistance:Math.exp(Number(e.target.value))})}/></label><Check label="5× 对焦放大（不改变成片构图）" checked={s.magnify} action={v=>update({magnify:v})}/></>}
   <label>白平衡<select value={s.whiteBalance} disabled={busy} onChange={e=>update({whiteBalance:e.target.value as PhotoSettings['whiteBalance']})}><option value="auto">自动</option><option value="daylight">日光 · 5500K</option><option value="cloudy">阴天 · 6500K</option><option value="tungsten">钨丝灯 · 3200K</option><option value="kelvin">自定义色温</option></select></label>{s.whiteBalance==='kelvin'&&<label>色温 {s.kelvin}K<input type="range" min="2500" max="10000" step="100" value={s.kelvin} disabled={busy} onChange={e=>update({kelvin:Number(e.target.value)})}/></label>}
   <label>测光<select value={s.metering} disabled={busy} onChange={e=>update({metering:e.target.value as PhotoSettings['metering']})}><option value="evaluative">全画面加权</option><option value="center">中央重点</option><option value="spot">点测光 · 对焦点</option></select></label><Check label="锁定曝光测光" checked={s.aeLock} action={v=>update({aeLock:v})}/>
   <label>自拍<select value={s.timer} disabled={busy} onChange={e=>update({timer:Number(e.target.value) as 0|2|10})}><option value="0">即时拍摄</option><option value="2">2 秒</option><option value="10">10 秒</option></select></label><label>文件格式<select value={s.format} disabled={busy} onChange={e=>update({format:e.target.value as 'jpeg'|'png'})}><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label>
   <Check label="三分线" checked={s.grid} action={v=>update({grid:v})}/><Check label="水平仪" checked={s.level} action={v=>update({level:v})}/><Check label="亮度直方图" checked={s.histogram} action={v=>update({histogram:v})}/><Check label="高光警告" checked={s.highlights} action={v=>update({highlights:v})}/><Check label="景深预览" checked={s.depthPreview} action={v=>update({depthPreview:v})}/>
   <p>{touch?'按住对焦，点击快门。拖动画面观察。':'移动鼠标观察，按住 F 对焦，空格拍照；滚轮变焦，P 参数，V 相册。'}长于 1/4 秒的曝光固定机位。</p>
  </section>}
  {photoError&&!album&&<div className="photo-message photo-error" role="alert">{photoError}{p.albumCount>=50?<button onClick={()=>setAlbum(true)}>管理相册</button>:<button disabled={!shutterEnabled} onClick={take}>重试拍摄</button>}</div>}
  {preview&&!album&&!panel&&<aside className="photo-result" role="status"><PhotoImage photo={preview}/><div><strong>{preview.storageStatus==='temporary'?'未保存，可导出本次照片':'照片已保存'}</strong>{feedback?.message&&<span>{feedback.message}</span>}{preview.storageStatus==='temporary'&&<button onClick={()=>downloadPhoto(preview)}>导出本次照片</button>}</div></aside>}
  {album&&<PhotoAlbum onClose={closePhotoPanel} extra={lastPhoto??undefined} extras={temporaryPhotos} onRealityState={onRealityState} onRemove={onRemove}/>}
 </div>;
}
function Check({label,checked,action}:{label:string;checked:boolean;action:(v:boolean)=>void}){return <label className="photo-check"><input type="checkbox" checked={checked} onChange={e=>action(e.target.checked)}/>{label}</label>;}
function PhotoMovement({onMove,disabled,pointers}:{onMove:(x:number,y:number)=>void;disabled:boolean;pointers:PointerSession}){
 const [id,setId]=useState<number|null>(null),[axis,setAxis]=useState<[number,number]>([0,0]);
 const actions=useRef({onMove,disabled});actions.current={onMove,disabled};
 const handlers=useRef(createMovementPointerHandlers(pointers,{enabled:()=>!actions.current.disabled,active:setId,move:(x,y)=>{setAxis([x,y]);actions.current.onMove(x,y);}}));
 useEffect(()=>{if(disabled)pointers.release(PHOTO_POINTER_KEYS.move);return()=>pointers.release(PHOTO_POINTER_KEYS.move);},[disabled,pointers]);
 return <div className={`photo-move-pad ${disabled?'disabled':''}`} aria-label="摄影移动摇杆" data-pointer={id??''} {...handlers.current}><i style={{transform:`translate(${axis[0]*24}px,${-axis[1]*17}px)`}}>↕</i><small>移动</small></div>;
}

export function PhotoAlbum({onClose,extra,extras=[],onRealityState,onRemove}:{onClose:()=>void;extra?:PhotoRecord;extras?:PhotoRecord[];onRealityState?:(ready:boolean)=>void;onRemove?:(id:string)=>void}){
 const allExtras=extra&&!extras.some(p=>p.id===extra.id)?[extra,...extras]:extras;
 const media=useAlbumMedia(allExtras),selected=media.record,[reality,setReality]=useState<PhotoRecord|null>(null),[confirmDelete,setConfirmDelete]=useState<PhotoMetadata|null>(null),[deleting,setDeleting]=useState(false),[sharing,setSharing]=useState(false),[delivery,setDelivery]=useState('');
 const mounted=useRef(true),operation=useRef(0),panelRef=useRef<HTMLDivElement|null>(null),albumControls=useRef({onClose,reality});albumControls.current={onClose,reality};useModalFocus(panelRef);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current++;};},[]);
 useEffect(()=>{setConfirmDelete(null);setDelivery('');},[media.selected?.id]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code!=='Escape'||albumControls.current.reality)return;e.preventDefault();e.stopImmediatePropagation();if(confirmDelete){setConfirmDelete(null);return;}albumControls.current.onClose();};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[confirmDelete]);
 const stateRef=useRef(onRealityState);stateRef.current=onRealityState;useEffect(()=>()=>stateRef.current?.(false),[]);const closeReality=()=>{setReality(null);stateRef.current?.(false);};
 const erase=async(p:PhotoMetadata)=>{if(deleting)return;const token=++operation.current;setDeleting(true);media.setError('');try{await media.erase(p);if(!mounted.current||token!==operation.current)return;onRemove?.(p.id);setConfirmDelete(null);setDelivery('照片已删除。');}catch{if(mounted.current&&token===operation.current)media.setError('照片未删除，请重试。');}finally{if(mounted.current&&token===operation.current)setDeleting(false);}};
 const share=(p:PhotoRecord)=>{if(sharing)return;const token=++operation.current;setSharing(true);setDelivery('');media.setError('');void shareOrDownloadPhoto(p,{isCurrent:()=>mounted.current&&token===operation.current}).then(result=>{if(!mounted.current||token!==operation.current)return;if(result==='shared')setDelivery('已完成分享。');else if(result==='downloaded')setDelivery('已请求导出照片。');}).catch(()=>{if(mounted.current&&token===operation.current)media.setError('照片未导出，请重试。');}).finally(()=>{if(mounted.current&&token===operation.current)setSharing(false);});};
 const exportParameters=(p:PhotoRecord)=>{try{downloadPhoto(p,true);setDelivery('已请求导出拍摄参数。');}catch{media.setError('拍摄参数未导出，请重试。');}};
 const actionError=media.error!==media.listError&&media.error!==media.recordError?media.error:'';
 return <div ref={panelRef} tabIndex={-1} className="photo-album" role="dialog" aria-modal="true" aria-label="本机摄影相册"><header><div><strong>本机相册</strong><small>选择一张照片，查看、分享或导出。</small></div><button onClick={onClose}>返回</button></header>
  {media.listError&&<div className="photo-album-alert" role="alert"><span>{media.listError}</span><button onClick={media.retryList}>重新读取相册</button></div>}
  {actionError&&<div className="photo-album-alert" role="alert">{actionError}</div>}
  <div className="photo-album-body"><section className="photo-thumbnails" aria-label="照片列表">{media.photos.map(p=><button key={p.id} className={media.selected?.id===p.id?'selected':''} disabled={deleting||sharing} onClick={()=>media.select(p)}><PhotoThumbnail photo={p} cache={media.cache}/><small>{p.storageStatus==='temporary'?'未保存 · ':''}{new Date(p.createdAt).toLocaleString('zh-CN')}</small></button>)}{media.listLoading&&!media.photos.length&&<p role="status">正在读取本机相册…</p>}{!media.photos.length&&!media.listLoading&&!media.listError&&<p>相册还没有照片，试着拍一张校园。</p>}</section>
   <section className="photo-review" aria-label="选中照片">
    {media.loading&&<p role="status">正在读取这张照片…</p>}
    {media.recordError&&<div className="photo-album-alert" role="alert"><span>{media.recordError}</span><button onClick={media.retryRecord}>重新读取照片</button></div>}
    {media.missing&&!media.recordError&&<div className="photo-album-alert"><span>这张照片已不在本机相册中，可选择另一张。</span><button onClick={media.retryRecord}>重新读取</button></div>}
    {selected&&<><PhotoImage photo={selected}/>{selected.storageStatus==='temporary'&&<p role="status">未保存，可导出本次照片。</p>}<p>{selected.taskLabel??'校园随拍'} · {Math.round(selected.settings.focalLength)}mm · f/{selected.exposure.aperture} · {shutterLabel(selected.exposure.shutter)} · ISO {selected.exposure.iso} · {selected.width}×{selected.height}</p>
     <nav className="photo-album-actions"><button disabled={sharing||deleting} onClick={()=>share(selected)}>{sharing?'正在处理…':'分享／导出照片'}</button><button disabled={sharing||deleting} onClick={()=>exportParameters(selected)}>导出拍摄参数</button>{selected.reality&&<button disabled={sharing||deleting} onClick={()=>setReality(selected)}>重看遇见现实</button>}<button disabled={sharing||deleting} onClick={()=>{setDelivery('');setConfirmDelete(media.selected);}}>删除这张</button></nav>
    </>}
    {confirmDelete&&<div className="photo-delete-confirm" role="alert"><span>删除这张照片？</span><button disabled={deleting} onClick={()=>setConfirmDelete(null)}>取消</button><button disabled={deleting} onClick={()=>void erase(confirmDelete)}>{deleting?'正在删除…':'删除'}</button></div>}
    {delivery&&<p className="photo-delivery-result" role="status">{delivery}</p>}
   </section>
  </div>{reality?.reality&&<RealityUI photo={reality} association={reality.reality} replay onReady={()=>stateRef.current?.(true)} onClose={closeReality}/>}</div>;
}
