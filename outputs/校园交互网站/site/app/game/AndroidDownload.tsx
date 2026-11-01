'use client';
import {useEffect,useState} from 'react';
import {GAME_ORIGIN} from '../site-config';
import styles from './AndroidDownload.module.css';
type AndroidRelease={version:string;downloadUrl:string;bytes:number};
export function readAndroidRelease(value:unknown):AndroidRelease|null{
 if(!value||typeof value!=='object')return null;
 const entry=(value as {android?:Record<string,unknown>}).android;
 if(!entry||entry.available!==true||entry.productId!=='qisheng-online-android'||entry.applicationId!=='com.liuframe.qishengonline'||!Number.isSafeInteger(entry.versionCode)||Number(entry.versionCode)<1||Number(entry.versionCode)>2100000000||typeof entry.version!=='string'||!/^\d+\.\d+\.\d+$/.test(entry.version)||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.downloadUrl!=='string'||!new RegExp('^/native/releases/'+entry.sha256+'/[A-Za-z0-9][A-Za-z0-9._-]*\\.apk$').test(entry.downloadUrl)||!Number.isSafeInteger(entry.bytes)||Number(entry.bytes)<=0)return null;
 return {version:entry.version,downloadUrl:new URL(entry.downloadUrl,GAME_ORIGIN).href,bytes:Number(entry.bytes)};
}
export default function AndroidDownload(){
 const [release,setRelease]=useState<AndroidRelease|null>(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),8000);setLoaded(false);setFailed(false);
  void fetch(new URL('/api/v1/native/updates',GAME_ORIGIN),{cache:'no-store',credentials:'omit',signal:abort.signal}).then(response=>{if(!response.ok)throw Error('Download metadata unavailable');return response.json() as Promise<unknown>;}).then(value=>{if(active&&!abort.signal.aborted){setRelease(readAndroidRelease(value));setLoaded(true);}}).catch(()=>{if(active)setFailed(true);}).finally(()=>clearTimeout(timer));
  return()=>{active=false;clearTimeout(timer);abort.abort();};
 },[attempt]);
 return <section className={'game-intro-width '+styles.androidCard} aria-labelledby="game-android-title"><div><h2 id="game-android-title">齐盛Online 安卓版</h2>{release&&loaded&&!failed?<><p className={styles.metadata}>Preview {release.version} · {(release.bytes/1_000_000).toFixed(1)} MB · Android 10+ · ARM64</p><p>完整校园随安装包提供，账号与网页版互通。</p></>:<p role="status">{failed?'暂时无法读取安卓版本。':loaded?'安卓版本暂未开放下载':'正在读取安卓版本…'}</p>}</div>{release&&loaded&&!failed?<a className="game-intro-button" href={release.downloadUrl} download>下载 APK ↓</a>:<button className={styles.refresh} onClick={()=>setAttempt(value=>value+1)} disabled={!loaded&&!failed}>{failed?'重试':'刷新版本'}</button>}</section>;
}
