import {useEffect,useState} from 'react';
import {UE_WINDOWS_PREVIEW} from '@qisheng/shared/player-content';
import {rankingClient} from './ranking/client';
import {staticAssetUrl} from './static-assets';
import {isAndroidApp} from './platform/android';
import './native-downloads.css';
import styles from './NativeDownloads.module.css';

type LegacyWindowsDownload={version:string;downloadUrl:string;bytes:number;minimumOS?:string};
type AndroidDownload={version:string;versionCode:number;downloadUrl:string;bytes:number};

export function readAndroidDownload(value:unknown):AndroidDownload|null{
 if(!value||typeof value!=='object')return null;
 const entry=(value as {android?:Record<string,unknown>}).android;
 if(!entry||entry.available!==true||entry.productId!=='qisheng-online-android'||entry.applicationId!=='com.liuframe.qishengonline'||!Number.isSafeInteger(entry.versionCode)||Number(entry.versionCode)<1||Number(entry.versionCode)>2100000000||typeof entry.version!=='string'||!/^\d+\.\d+\.\d+$/.test(entry.version)||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.downloadUrl!=='string'||!new RegExp('^/native/releases/'+entry.sha256+'/[A-Za-z0-9][A-Za-z0-9._-]*\\.apk$').test(entry.downloadUrl)||!Number.isSafeInteger(entry.bytes)||Number(entry.bytes)<=0)return null;
 return {version:entry.version,versionCode:Number(entry.versionCode),downloadUrl:entry.downloadUrl,bytes:Number(entry.bytes)};
}

function readLegacyWindows(value:unknown):LegacyWindowsDownload|null{
 if(!value||typeof value!=='object')return null;
 const entry=(value as {windows?:Record<string,unknown>}).windows;
 if(!entry||entry.available!==true||typeof entry.version!=='string'||!/^\d+\.\d+\.\d+$/.test(entry.version)||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.downloadUrl!=='string'||!new RegExp('^/native/releases/'+entry.sha256+'/[A-Za-z0-9][A-Za-z0-9._-]*\\.zip$').test(entry.downloadUrl)||!Number.isSafeInteger(entry.bytes)||Number(entry.bytes)<=0)return null;
 return {version:entry.version,downloadUrl:entry.downloadUrl,bytes:Number(entry.bytes),minimumOS:typeof entry.minimumOS==='string'&&entry.minimumOS.length<=80?entry.minimumOS:undefined};
}

export function NativeDownloads(){
 const [legacy,setLegacy]=useState<LegacyWindowsDownload|null>(null),[android,setAndroid]=useState<AndroidDownload|null>(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();setLoaded(false);setFailed(false);
  void rankingClient.request<unknown>('/native/updates',{auth:false,signal:abort.signal}).then(value=>{
   if(!abort.signal.aborted){setLegacy(readLegacyWindows(value));setAndroid(readAndroidDownload(value));setLoaded(true);}
  }).catch(()=>{if(!abort.signal.aborted)setFailed(true);});
  return()=>abort.abort();
 },[attempt]);
 return <section className="menu-native-downloads" aria-label="客户端下载">
  <h2>客户端下载</h2>
  <article className="menu-native-current">
   <div><h3><img className="menu-native-product-logo" src={staticAssetUrl(UE_WINDOWS_PREVIEW.logoPath)} width={2172} height={724} alt={UE_WINDOWS_PREVIEW.productName} decoding="async"/></h3><span className="menu-native-meta">{UE_WINDOWS_PREVIEW.title}</span><span className="menu-native-meta">Preview {UE_WINDOWS_PREVIEW.version}，{(UE_WINDOWS_PREVIEW.bytes/1_000_000).toFixed(1)} MB</span><p>{UE_WINDOWS_PREVIEW.description}</p><p className="menu-native-installation">{UE_WINDOWS_PREVIEW.installation}</p><a className="menu-native-about" href="https://qs2027.tianhw.top/" target="_blank" rel="noopener noreferrer">走进《齐盛：2027》</a></div>
   <a className="menu-native-download" href={UE_WINDOWS_PREVIEW.downloadPath} download>下载 Windows 版 <span aria-hidden="true">↓</span></a>
  </article>
  {!isAndroidApp()&&<article className="menu-native-android">
   <div><h3>齐盛Online 安卓版</h3>{android&&loaded&&!failed?<><span className="menu-native-meta">Preview {android.version}，{(android.bytes/1_000_000).toFixed(1)} MB</span><p>适用于 Android 10 及以上的64位 ARM 设备。完整校园随安装包提供，账号与网页版互通。</p></>:<p role="status">{failed?'暂时无法读取安卓版本。':loaded?'安卓版本暂未开放下载':'正在读取安卓版本…'}</p>}</div>
   {android&&loaded&&!failed?<a className="menu-native-download" href={android.downloadUrl} download>下载 APK <span aria-hidden="true">↓</span></a>:<button className="menu-native-refresh" onClick={()=>setAttempt(n=>n+1)} disabled={!loaded&&!failed}>{failed?'重试':'刷新版本'}</button>}
  </article>}
  <details className="menu-native-history">
   <summary>历史客户端 <span>停止更新</span></summary>
   <p>旧版客户端已停止更新，已有 Windows 版本保留下载。</p>
   {failed?<p role="status">暂时无法读取历史版本。<button className={styles.retry} onClick={()=>setAttempt(n=>n+1)}>重试</button></p>:!loaded?<p role="status">正在读取历史版本…</p>:legacy?<article><div><h3>旧版 Windows 客户端</h3><span className="menu-native-meta">Preview {legacy.version}，{(legacy.bytes/1_000_000).toFixed(1)} MB</span>{legacy.minimumOS&&<span className="menu-native-meta">{legacy.minimumOS.replace(/\s*·\s*/g,'，')}</span>}</div><a className="menu-native-download menu-native-download-legacy" href={legacy.downloadUrl} download>下载历史版本 <span aria-hidden="true">↓</span></a></article>:<p>暂无可下载的历史版本。</p>}
  </details>
 </section>;
}
