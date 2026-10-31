import type {AccountSessionStore} from '@qisheng/shared/community/client';
import type {BundledMapResource} from '@qisheng/shared/map-client';

type NativeObject={postMessage:(message:string)=>void;onmessage:((event:{data:string})=>void)|null};
type Reply={id:string;ok:boolean;value?:unknown;error?:string};
export type AndroidBundleInfo={productId:'qisheng-online-android';version:string;webVersion:string;internalOnly:true;mapManifestSha256:string;resources:BundledMapResource[]};
declare global {interface Window {LiuFrameNative?:NativeObject;__qishengNativeEvent?:(type:string)=>void}}
const pending=new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
let serial=0,ready=false,token='',sessionQueue:Promise<unknown>=Promise.resolve();
let bundleInfo:AndroidBundleInfo|undefined;
let requestPrefix='';

export const isAndroidApp=()=>ready;
export const androidBundle=()=>bundleInfo;
function request<T=Record<string,unknown>>(method:string,params:Record<string,unknown>={},timeout=15000):Promise<T>{
 const bridge=window.LiuFrameNative;
 if(!bridge||location.origin!=='https://game.tianhw.top')return Promise.reject(Error('应用连接尚未就绪。'));
 if(pending.size>=16)return Promise.reject(Error('操作正在处理中。'));
 requestPrefix||=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():'android-'+Date.now().toString(36);
 const id=requestPrefix+'-'+(++serial);
 return new Promise<T>((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('操作暂未完成，请重试。'));},timeout);
  pending.set(id,{resolve:value=>resolve(value as T),reject,timer});
  try{bridge.postMessage(JSON.stringify({id,method,params}));}catch{clearTimeout(timer);pending.delete(id);reject(Error('操作暂未完成，请重试。'));}
 });
}
const notify=(message:string)=>{let node=document.querySelector<HTMLElement>('[data-android-status]');if(!node){node=document.createElement('div');node.dataset.androidStatus='';node.setAttribute('role','status');Object.assign(node.style,{position:'fixed',bottom:'max(24px, env(safe-area-inset-bottom))',left:'16px',right:'16px',zIndex:'100000',padding:'12px 16px',background:'#252b31',color:'#fff7e6',borderRadius:'4px',font:'15px/1.5 sans-serif',pointerEvents:'none'});document.body.append(node);}node.textContent=message;setTimeout(()=>node?.remove(),4500);};
const secureStore:AccountSessionStore={read:()=>token,write:value=>{
 token=value;
 // Preserve mutation order even if a sign-in is followed immediately by logout.
 sessionQueue=sessionQueue.catch(()=>{}).then(()=>request('session.write',{token:value})).catch(()=>notify('本次登录未能保存，重新打开应用后可能需要再次登录。'));
}};
export const androidSessionStore=():AccountSessionStore|undefined=>ready?secureStore:undefined;

export async function initializeAndroid(){
 if(ready)return bundleInfo!;
 const bridge=window.LiuFrameNative;
 if(!bridge||location.origin!=='https://game.tianhw.top')throw Error('请从齐盛Online安卓应用打开。');
 bridge.onmessage=event=>{let reply:Reply;try{reply=JSON.parse(event.data) as Reply;}catch{return;}if(typeof reply.id!=='string')return;const job=pending.get(reply.id);if(!job)return;pending.delete(reply.id);clearTimeout(job.timer);if(reply.ok===true)job.resolve(reply.value);else job.reject(Error(typeof reply.error==='string'?reply.error:'操作暂未完成，请重试。'));};
 window.__qishengNativeEvent=type=>{
  if(type==='back'){let handled=false;window.dispatchEvent(new CustomEvent('qisheng:native-back',{detail:{handle(){handled=true;}}}));if(!handled)void request('system.backUnhandled').catch(()=>{});return;}
  if(type==='background'){window.dispatchEvent(new Event('qisheng:native-background'));return;}
  if(type==='resume')window.dispatchEvent(new Event('qisheng:native-resume'));
 };
 const [identity,response]=await Promise.all([request<{productId:string;version:string;internalOnly:boolean;session:string}>('init'),fetch('/android/bundle-info.json',{cache:'no-store'})]);
 if(!response.ok)throw Error('应用资源未能读取，请重新安装。');
 const info=await response.json() as AndroidBundleInfo;
 if(identity.productId!=='qisheng-online-android'||identity.internalOnly!==true||info.productId!==identity.productId||info.version!==identity.version||info.internalOnly!==true||!Array.isArray(info.resources)||!/^[a-f0-9]{64}$/.test(info.mapManifestSha256))throw Error('应用资源版本不一致，请重新安装。');
 if(typeof WebAssembly==='undefined')throw Error('系统网页组件暂不支持此游戏，请更新后重试。');
 const probe=document.createElement('canvas'),gl=probe.getContext('webgl2');
 if(!gl)throw Error('此设备暂不能启用游戏画面，请更新系统网页组件后重试。');
 gl.getExtension('WEBGL_lose_context')?.loseContext();
 token=typeof identity.session==='string'?identity.session:'';
 // Never keep a second plaintext account token in WebView storage.
 try{localStorage.removeItem('qisheng-ranking-session-v1');}catch{}
 bundleInfo=info;ready=true;
 installDownloadAdapter();
 const sessionState=(event:Event)=>{const value=(event as CustomEvent<{inSession:boolean;playing:boolean}>).detail;if(!value||typeof value.inSession!=='boolean'||typeof value.playing!=='boolean')return;void request('system.orientation',{value:value.inSession?'landscape':'auto'}).catch(()=>{});void request('system.awake',{value:value.playing}).catch(()=>{});};
 addEventListener('qisheng:native-session-state',sessionState);
 addEventListener('pagehide',()=>{removeEventListener('qisheng:native-session-state',sessionState);for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('页面已关闭。'));}pending.clear();},{once:true});
 return info;
}

async function exportBlob(blob:Blob,filename:string){
 if(blob.size<=0||blob.size>32*1024*1024)throw Error('文件过大，暂时无法导出。');
 const mime=blob.type.split(';')[0]||'application/octet-stream';
 if(!['image/jpeg','image/png','application/json','text/plain'].includes(mime))throw Error('此文件请在网页版下载。');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const {exportId}=await request<{exportId:string}>('export.begin',{filename,mime,bytes:bytes.byteLength});
 try{
  for(let offset=0;offset<bytes.length;offset+=48*1024){const part=bytes.subarray(offset,offset+48*1024);let value='';for(const byte of part)value+=String.fromCharCode(byte);await request('export.chunk',{exportId,data:btoa(value)});}
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
  const result=await request<{saved:boolean}>('export.finish',{exportId,sha256},300000);
  notify(result.saved?'文件已保存。':'已取消保存。');
 }catch(error){void request('export.cancel',{exportId}).catch(()=>{});throw error;}
}
function installDownloadAdapter(){
 document.addEventListener('click',event=>{
  const anchor=(event.target instanceof Element?event.target.closest('a[download]'):null) as HTMLAnchorElement|null;
  if(!anchor||!anchor.href.startsWith('blob:')||new URL(anchor.href).origin!==location.origin)return;
  event.preventDefault();
  void fetch(anchor.href).then(response=>response.blob()).then(blob=>exportBlob(blob,anchor.download||'齐盛导出')).catch(error=>notify(error instanceof Error?error.message:'文件未保存，请重试。'));
 },true);
 // Some existing download links are activated before they are attached to the DOM.
 const click=HTMLAnchorElement.prototype.click;
 HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){void fetch(this.href).then(response=>response.blob()).then(blob=>exportBlob(blob,this.download||'齐盛导出')).catch(error=>notify(error instanceof Error?error.message:'文件未保存，请重试。'));return;}click.call(this);};
}
