import {useEffect,useState} from 'react';
import {rankingClient} from './ranking/client';
import {PROTOCOL_VERSION} from '@qisheng/shared/protocol';
import './native-downloads.css';

type NativeEntry={available:boolean;version?:string;protocolVersion?:string;downloadUrl?:string;bytes?:number;sha256?:string;minimumOS?:string};
export function NativeDownloads(){
 const [entries,setEntries]=useState<Record<string,NativeEntry>|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const abort=new AbortController();setFailed(false);void rankingClient.request<Record<string,NativeEntry>>('/native/updates',{auth:false,signal:abort.signal}).then(value=>{if(!abort.signal.aborted)setEntries(value);}).catch(()=>{if(!abort.signal.aborted)setFailed(true);});return()=>abort.abort();},[attempt]);
 const downloads=Object.entries(entries??{}).filter(([platform,value])=>['windows','android'].includes(platform)&&value?.available&&value.protocolVersion===PROTOCOL_VERSION&&typeof value.version==='string'&&/^\d+\.\d+\.\d+$/.test(value.version)&&/^[a-f0-9]{64}$/.test(value.sha256??'')&&typeof value.downloadUrl==='string'&&new RegExp('^/native/releases/'+value.sha256+'/[A-Za-z0-9][A-Za-z0-9._-]*\\.'+(platform==='windows'?'zip':'apk')+'$').test(value.downloadUrl)&&Number.isSafeInteger(value.bytes)&&Number(value.bytes)>0);
 if(!failed&&!downloads.length)return null;
 return <section className="menu-native-downloads" aria-label="客户端测试版"><h2>客户端测试版</h2>{failed?<p>暂时无法读取下载信息。<button className="menu-inline" onClick={()=>setAttempt(n=>n+1)}>重试</button></p>:downloads.map(([platform,entry])=><article key={platform}><div><strong>{platform==='windows'?'Windows':'安卓'} · Preview {entry.version}</strong><span>{(Number(entry.bytes)/1_000_000).toFixed(1)} MB{typeof entry.minimumOS==='string'&&entry.minimumOS.length<=80?' · '+entry.minimumOS:''}</span><p>校园探索、团队对战与个人混战。</p></div><a className="menu-native-download" href={entry.downloadUrl} download>下载测试版 <span aria-hidden="true">↓</span></a></article>)}</section>;
}
