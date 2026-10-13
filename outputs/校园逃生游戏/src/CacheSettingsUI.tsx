import {useEffect,useRef,useState} from 'react';
import {mapByteCache,type MapCacheStats} from './map-cache';
import {downloadCompleteGameMap,cancelCompleteGameMap,gameMapSession} from './game-map';
import {mapDownloadSize as size,mapDownloadState} from './map-download-state';
import './map-download.css';
import {retentionStatus,requestRetention,type RetentionState} from './storage-retention';

export function CacheSettingsUI(){
 const [stats,setStats]=useState<MapCacheStats>(()=>mapByteCache().stats()),[loading,setLoading]=useState(true),[indexError,setIndexError]=useState(''),[operationError,setOperationError]=useState(''),[clearing,setClearing]=useState(false),[confirmClear,setConfirmClear]=useState(false),[revision,setRevision]=useState(0);
 const alive=useRef(false);
 const [retention,setRetention]=useState<RetentionState>('checking'),[retainOnDownload,setRetainOnDownload]=useState(false),[retaining,setRetaining]=useState(false);
 useEffect(()=>{let active=true;void retentionStatus(navigator.storage).then(s=>{if(active)setRetention(s);});return()=>{active=false;};},[]);
 const retain=()=>{setRetaining(true);void requestRetention(navigator.storage).then(s=>{if(alive.current)setRetention(s);}).finally(()=>{if(alive.current)setRetaining(false);});};
 useEffect(()=>{alive.current=true;const cache=mapByteCache(),off=cache.subscribe(()=>setStats(cache.stats()));return()=>{alive.current=false;off();};},[]);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setIndexError('');
  void Promise.all([mapByteCache().refresh(),gameMapSession.resourceIndex(abort.signal)]).then(([,index])=>mapByteCache().refresh(Object.values(index.resources),abort.signal)).then(()=>{if(!abort.signal.aborted)setLoading(false);}).catch(()=>{if(!abort.signal.aborted){setIndexError('暂时无法读取地图信息，请重新检查。');setLoading(false);}});
  return()=>abort.abort();
 },[revision]);
 const view=mapDownloadState(stats,{loading,error:indexError}),current=stats.current,received=Math.min(current?.totalBytes??0,Math.max(current?.bytes??0,stats.prefetch.running?stats.prefetch.bytes+(stats.prefetch.receiving??0):0)),percent=current?.totalBytes?Math.min(current.complete?100:99,Math.floor(received/current.totalBytes*100)):0;
 const start=()=>{setOperationError('');if(indexError||!stats.available){setRevision(v=>v+1);return;}if(stats.prefetch.running){cancelCompleteGameMap();return;}if(retainOnDownload&&retention!=='granted'&&retention!=='unsupported')retain();void downloadCompleteGameMap().catch(()=>{if(alive.current)setOperationError('地图暂时未能下载，请重试。');});};
 const clear=()=>{setOperationError('');setClearing(true);void mapByteCache().clear().catch(()=>{if(alive.current)setOperationError('地图缓存暂时无法清除，请重试。');}).finally(()=>{if(alive.current){setClearing(false);setConfirmClear(false);}});};
 return <section className="map-download" aria-labelledby="map-download-title">
  <header className="map-download-heading"><div><span className="map-download-eyebrow">本机存储</span><h3 id="map-download-title">地图下载</h3></div>{!loading&&!indexError&&stats.available&&current&&<span className="map-download-percent" aria-label={'当前地图已缓存 '+percent+'%'}>{percent}%</span>}</header>
  <p className="map-download-status" role="status">{clearing?'正在清理地图缓存':view.title}</p>
  {!loading&&!indexError&&stats.available&&current&&<><div className="map-download-amount"><strong>{size(stats.prefetch.running?received:current.bytes)}</strong><span> / {size(current.totalBytes)} {stats.prefetch.running?'已接收':'已缓存'}</span></div><progress aria-label="当前地图缓存进度" max={current.totalBytes||1} value={current.complete?current.totalBytes:Math.min(current.totalBytes*.999,received)}/><p className="map-download-description">{current.complete?'下次进入可直接复用这张地图。':'还需下载 '+size(current.remainingBytes)+'。游玩时也会自动缓存途经区域。'}</p></>}
  {loading&&<div className="map-download-placeholder" aria-hidden="true"/>}
  {retention!=='checking'&&<div className="map-download-retention">
   {retention==='granted'?<p role="status">浏览器已允许保留本站数据。主动清除浏览器数据仍会删除它们。</p>:retention==='unsupported'?<p>此浏览器不支持申请保留数据，地图仍会正常缓存。</p>:<><label><input type="checkbox" checked={retainOnDownload} onChange={e=>setRetainOnDownload(e.target.checked)}/>完整下载时申请保留本机数据</label><button type="button" className="text-button" disabled={retaining} onClick={retain}>{retaining?'正在申请…':'申请保留本站数据'}</button><p role="status">{retention==='denied'?'浏览器未批准，已有地图缓存仍可使用。':retention==='error'?'暂时无法申请，可以重试；地图下载不受影响。':'由浏览器决定是否批准，适用于本站存储，不能代替照片和存档备份。'}</p></>}
  </div>}
  {(indexError||stats.reason)&&<p className="map-download-message" role={indexError?'alert':undefined}>{indexError||stats.reason}</p>}
  {stats.prefetch.pausedBy==='battle'&&!current?.complete&&<p className="map-download-description">下载将为对局让出网络，返回菜单后自动继续。</p>}
  {(operationError||stats.prefetch.error)&&!indexError&&<p className="map-download-message" role="alert">{operationError||stats.prefetch.error}</p>}
  <div className="map-download-actions"><button type="button" className="map-download-primary" disabled={clearing||view.disabled} onClick={start}>{view.action}</button><button type="button" className="map-download-secondary" disabled={clearing||loading||!stats.bytes} onClick={()=>setConfirmClear(true)}>清理缓存</button></div>
  {confirmClear&&<div className="map-download-confirm" role="group" aria-label="确认清理地图缓存"><strong>清理本机的地图缓存？</strong><p>已下载的地图需要重新加载。照片、存档和设置不会删除。</p><div><button type="button" disabled={clearing} onClick={clear}>{clearing?'正在清理':'确认清理'}</button><button type="button" disabled={clearing} onClick={()=>setConfirmClear(false)}>取消</button></div></div>}
  {!loading&&!indexError&&stats.available&&current&&<details className="map-download-details"><summary>存储详情</summary><dl><div><dt>当前地图</dt><dd>{current.files} / {current.totalFiles} 个文件 · {size(current.bytes)}</dd></div><div><dt>旧版及其他地图</dt><dd>{size(current.oldBytes)}</dd></div><div><dt>地图总占用</dt><dd>{size(stats.bytes)}</dd></div><div><dt>本机缓存额度</dt><dd>{size(stats.budget)}</dd></div></dl><p>下载可随时暂停，已缓存的部分会保留。浏览器可能自动清理缓存。</p></details>}
 </section>;
}
export default CacheSettingsUI;
