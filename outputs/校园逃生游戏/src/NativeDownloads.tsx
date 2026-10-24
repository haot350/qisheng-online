import {useEffect,useState} from 'react';
import {UE_WINDOWS_PREVIEW} from '@qisheng/shared/player-content';
import {rankingClient} from './ranking/client';
import {staticAssetUrl} from './static-assets';
import './native-downloads.css';

type LegacyWindowsDownload={version:string;downloadUrl:string;bytes:number;minimumOS?:string};

function readLegacyWindows(value:unknown):LegacyWindowsDownload|null{
 if(!value||typeof value!=='object')return null;
 const entry=(value as {windows?:Record<string,unknown>}).windows;
 if(!entry||entry.available!==true||typeof entry.version!=='string'||!/^\d+\.\d+\.\d+$/.test(entry.version)||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.downloadUrl!=='string'||!new RegExp('^/native/releases/'+entry.sha256+'/[A-Za-z0-9][A-Za-z0-9._-]*\\.zip$').test(entry.downloadUrl)||!Number.isSafeInteger(entry.bytes)||Number(entry.bytes)<=0)return null;
 return {version:entry.version,downloadUrl:entry.downloadUrl,bytes:Number(entry.bytes),minimumOS:typeof entry.minimumOS==='string'&&entry.minimumOS.length<=80?entry.minimumOS:undefined};
}

export function NativeDownloads(){
 const [historyOpen,setHistoryOpen]=useState(false),[legacy,setLegacy]=useState<LegacyWindowsDownload|null>(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!historyOpen)return;
  const abort=new AbortController();setLoaded(false);setFailed(false);
  void rankingClient.request<unknown>('/native/updates',{auth:false,signal:abort.signal}).then(value=>{
   if(!abort.signal.aborted){setLegacy(readLegacyWindows(value));setLoaded(true);}
  }).catch(()=>{if(!abort.signal.aborted)setFailed(true);});
  return()=>abort.abort();
 },[historyOpen,attempt]);
 return <section className="menu-native-downloads" aria-label="客户端下载">
  <h2>客户端下载</h2>
  <article className="menu-native-current">
   <div><img className="menu-native-product-logo" src={staticAssetUrl(UE_WINDOWS_PREVIEW.logoPath)} width={2172} height={724} alt="齐盛：2027" decoding="async"/><h3>{UE_WINDOWS_PREVIEW.productName}</h3><span className="menu-native-meta">{UE_WINDOWS_PREVIEW.title} · Preview {UE_WINDOWS_PREVIEW.version} · {(UE_WINDOWS_PREVIEW.bytes/1_000_000).toFixed(1)} MB</span><p>{UE_WINDOWS_PREVIEW.description}</p><p className="menu-native-installation">{UE_WINDOWS_PREVIEW.installation}</p></div>
   <a className="menu-native-download" href={UE_WINDOWS_PREVIEW.downloadPath} download>下载 Windows 版 <span aria-hidden="true">↓</span></a>
  </article>
  <details className="menu-native-history" onToggle={event=>setHistoryOpen(event.currentTarget.open)}>
   <summary>历史客户端 <span>停止更新</span></summary>
   <p>Godot 客户端已停止更新，已有 Windows 版本保留下载。</p>
   {failed?<p role="status">暂时无法读取历史版本。<button className="menu-inline" onClick={()=>setAttempt(n=>n+1)}>重试</button></p>:!loaded?<p role="status">正在读取历史版本…</p>:legacy?<article><div><h3>Godot · Windows</h3><span className="menu-native-meta">Preview {legacy.version} · {(legacy.bytes/1_000_000).toFixed(1)} MB{legacy.minimumOS?' · '+legacy.minimumOS:''}</span></div><a className="menu-native-download menu-native-download-legacy" href={legacy.downloadUrl} download>下载历史版本 <span aria-hidden="true">↓</span></a></article>:<p>暂无可下载的历史版本。</p>}
  </details>
 </section>;
}
