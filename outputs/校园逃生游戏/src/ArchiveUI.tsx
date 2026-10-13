import {staticAssetUrl} from './static-assets.ts';
import {useEffect,useRef,useState} from 'react';
import {downloadPhoto} from './photography/album';
import {PhotoImage,PhotoThumbnail,useAlbumMedia} from './photography/AlbumMedia';
import {shareOrDownloadPhoto} from './photography/share';
import type {PhotoRecord} from './photography/types';
import {RealityUI} from './RealityUI';
import './archive.css';
import {useModalFocus} from './modal-focus';
type ArchivePhoto={id:string;title:string;date:string|null;dateStatus:string;thumbnail:string;image:string;sourceSha:string;exif:{camera?:string;equivalentFocalLength?:number;focalLength?:number}};
export function ArchiveUI({onClose,onRealityState}:{onClose:()=>void;onRealityState?:(ready:boolean)=>void}){
 const panelRef=useRef<HTMLElement|null>(null),controls=useRef({onClose,reality:false});useModalFocus(panelRef);
 const [photos,setPhotos]=useState<ArchivePhoto[]>([]),[selected,setSelected]=useState<ArchivePhoto|null>(null),[reality,setReality]=useState<PhotoRecord|null>(null),[error,setError]=useState(''),[tab,setTab]=useState<'archive'|'album'>('archive'),[ready,setReady]=useState(false),[retry,setRetry]=useState(0),[imageAttempt,setImageAttempt]=useState(0),[imageError,setImageError]=useState(false),[photoAction,setPhotoAction]=useState(''),[sharing,setSharing]=useState(false);
 const media=useAlbumMedia([],tab==='album'),record=useRef(media.record),owner=useRef({active:true,serial:0});record.current=media.record;
 useEffect(()=>{owner.current.active=true;return()=>{owner.current.active=false;owner.current.serial++;};},[]);
 useEffect(()=>{owner.current.serial++;setPhotoAction('');setSharing(false);},[media.selected?.id,tab]);
 useEffect(()=>{const controller=new AbortController();setError('');void fetch('/story/archive/manifest.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('archive');return r.json();}).then(m=>{if(controller.signal.aborted)return;if(!Array.isArray(m.photos))throw Error('archive');setPhotos(m.photos);setSelected(old=>m.photos.find((p:ArchivePhoto)=>p.id===old?.id)??m.photos[0]??null);}).catch(()=>{if(!controller.signal.aborted)setError('校园实拍暂时无法打开。');});return()=>controller.abort();},[retry]);
 useEffect(()=>{setReady(false);setImageError(false);},[selected?.id,imageAttempt]);
 controls.current={onClose,reality:!!reality};useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code!=='Escape'||controls.current.reality)return;e.preventDefault();e.stopImmediatePropagation();controls.current.onClose();};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[]);
 const realityState=useRef(onRealityState);realityState.current=onRealityState;useEffect(()=>()=>realityState.current?.(false),[]);
 const closeReality=()=>{setReality(null);onRealityState?.(false);};
 const exportSelected=(metadata=false)=>{if(!media.record)return;try{downloadPhoto(media.record,metadata);setPhotoAction(metadata?'已请求导出拍摄参数。':'已请求导出照片。');}catch{setPhotoAction('未能导出，请再试一次。');}};
 const shareSelected=async()=>{const photo=media.record;if(!photo||sharing)return;const serial=++owner.current.serial,isCurrent=()=>owner.current.active&&owner.current.serial===serial&&record.current?.id===photo.id;setSharing(true);setPhotoAction('');try{const outcome=await shareOrDownloadPhoto(photo,{isCurrent});if(isCurrent()&&outcome==='downloaded')setPhotoAction('已请求导出照片。');}catch{if(isCurrent())setPhotoAction('未能分享，可重试或导出照片。');}finally{if(isCurrent())setSharing(false);}};
 const cameraInfo=selected?[selected.date,selected.exif.camera,(selected.exif.equivalentFocalLength??selected.exif.focalLength)?String(selected.exif.equivalentFocalLength??selected.exif.focalLength)+'mm':null].filter(Boolean).join(' · '):'';
 return <div className="archive-shade"><section ref={panelRef} tabIndex={-1} className="archive-panel" role="dialog" aria-modal="true" aria-labelledby="archive-title"><header><div><small>齐盛 · 校园影像</small><h2 id="archive-title">{tab==='archive'?'校园实拍':'本机相册'}</h2></div><button onClick={onClose} aria-label="关闭影像档案">关闭</button></header><nav aria-label="影像类型"><button aria-pressed={tab==='archive'} onClick={()=>setTab('archive')}>校园实拍</button><button aria-pressed={tab==='album'} onClick={()=>setTab('album')}>我的照片 · {media.photos.length}</button></nav>
 {tab==='archive'?<>
  {error&&<div className="archive-error" role="alert"><span>{error}</span><button onClick={()=>setRetry(n=>n+1)}>重试实拍档案</button></div>}
  <div className="archive-layout"><div className="archive-thumbnails">{photos.map(p=><button key={p.id} aria-pressed={p.id===selected?.id} onClick={()=>setSelected(p)}><img src={staticAssetUrl(p.thumbnail)} loading="lazy" alt=""/><span>{p.title}</span></button>)}</div>{selected&&<div className="archive-detail"><div className="archive-comparison">{!imageError&&<img key={selected.id+'-'+imageAttempt} src={staticAssetUrl(selected.image)} alt={selected.title} onLoad={()=>setReady(true)} onError={()=>{setReady(true);setImageError(true);}}/>}{!ready&&<span role="status">正在打开这张实拍…</span>}{imageError&&<div className="archive-image-error" role="alert"><p>这张校园实拍暂时打不开。</p><button onClick={()=>setImageAttempt(n=>n+1)}>重试这张实拍</button></div>}</div><div className="archive-caption"><strong>{selected.title}</strong>{cameraInfo&&<p>{cameraInfo}</p>}<details><summary>拍摄资料与来源</summary><p>资料来源：项目提供的真实校园照片。</p><p>这里显示完整原片构图；“遇见现实”可能使用局部裁切。</p>{!selected.date&&<p>原片没有可核实的拍摄日期。</p>}</details></div></div>}</div>
 </>:<>
  {media.listLoading&&<p role="status">正在打开本机相册…</p>}
  {media.listError&&<div className="archive-error" role="alert"><span>本机相册暂时无法读取。</span><button onClick={media.retryList}>重试相册</button></div>}
  {media.recordError&&<div className="archive-error" role="alert"><span>这张照片暂时无法读取。</span><button onClick={media.retryRecord}>重试照片</button></div>}
  {media.missing&&<p role="status">这张照片已不在本机相册中，可选择另一张。</p>}
  {media.error&&!media.listError&&!media.recordError&&<p role="alert">{media.error}</p>}
  {media.loading&&<p role="status">正在打开选中的照片…</p>}
  {media.record&&<div className="archive-detail"><div className="archive-comparison"><PhotoImage photo={media.record}/></div><p>{media.record.taskLabel??'校园随拍'} · {media.record.width}×{media.record.height}{media.record.storageStatus==='temporary'?' · 暂存于本次游玩中':''}</p><nav className="archive-photo-actions" aria-label="照片操作"><button onClick={()=>void shareSelected()} disabled={sharing}>{sharing?'正在打开分享…':'分享照片'}</button><button onClick={()=>exportSelected()}>导出照片</button><button onClick={()=>exportSelected(true)}>导出拍摄参数</button>{media.record.reality&&<button onClick={()=>setReality(media.record)}>重看遇见现实</button>}</nav>{photoAction&&<p role="status">{photoAction}</p>}</div>}
  <div className="archive-album">{media.photos.map((p,i)=><article key={p.id}><button aria-pressed={p.id===media.selected?.id} onClick={()=>media.select(p)}><PhotoThumbnail photo={p} cache={media.cache} alt={'你的照片 '+(i+1)}/><span>{p.taskLabel??'校园随拍'}{p.storageStatus==='temporary'?' · 暂存':''}</span></button></article>)}{!media.listLoading&&!media.listError&&!media.photos.length&&<p>相册还没有照片。回到校园，举起相机拍一张吧。</p>}</div>
 </>}<footer><a href="/story/audio/ATTRIBUTION.txt" target="_blank" rel="noreferrer">音乐来源与许可</a><details><summary>关于这些影像</summary><p>校园实拍来自项目提供的资料；照片、章节进度和发现记录保存在当前浏览器。换设备或清除站点数据前，请分别导出进度和照片。</p></details></footer></section>{reality?.reality&&<RealityUI photo={reality} association={reality.reality} replay onReady={()=>onRealityState?.(true)} onClose={closeReality}/>}</div>;
}
