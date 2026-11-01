'use client';
import {useEffect,useRef,useState} from 'react';
import {inspectAvatarInput} from './avatar-input';
import {useDialogFocus} from './dialog-focus';
import styles from './avatar-crop.module.css';

type Props={file:File;busy:boolean;errorMessage?:string;onCancel:()=>void;onSave:(dataUrl:string)=>Promise<void>};
type Source={canvas:HTMLCanvasElement;width:number;height:number};
export function AvatarCrop({file,busy,errorMessage='',onCancel,onSave}:Props){
 const [source,setSource]=useState<Source|null>(null),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[error,setError]=useState(''),[encoding,setEncoding]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null),drag=useRef<{id:number;x:number;y:number}|null>(null),alive=useRef(true),saving=useRef(false),busyRef=useRef(busy);busyRef.current=busy;
 const close=()=>{if(!busyRef.current)onCancel();};const shell=useDialogFocus(true,close,true);
 useEffect(()=>{alive.current=true;let cancelled=false;setSource(null);setZoom(1);setOffset({x:0,y:0});let imageURL='';let bitmap:ImageBitmap|null=null;void(async()=>{try{
  if(file.size>5*1024*1024)throw new Error('图片不能超过5 MiB。');inspectAvatarInput(new Uint8Array(await file.arrayBuffer()));
  let image:CanvasImageSource,width:number,height:number;
  if(typeof createImageBitmap==='function'){bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});image=bitmap;width=bitmap.width;height=bitmap.height;}
  else{imageURL=URL.createObjectURL(file);const picture=new Image();picture.src=imageURL;await picture.decode();image=picture;width=picture.naturalWidth;height=picture.naturalHeight;}
  if(cancelled)return;const ratio=Math.min(1,1600/Math.max(width,height)),prepared=document.createElement('canvas');prepared.width=Math.max(1,Math.round(width*ratio));prepared.height=Math.max(1,Math.round(height*ratio));const context=prepared.getContext('2d');if(!context)throw new Error('暂时无法处理图片。');context.drawImage(image,0,0,prepared.width,prepared.height);setSource({canvas:prepared,width:prepared.width,height:prepared.height});
 }catch(value){if(!cancelled)setError(value instanceof Error?value.message:'图片读取失败，请重新选择。');}finally{bitmap?.close();if(imageURL)URL.revokeObjectURL(imageURL);}})();return()=>{cancelled=true;alive.current=false;drag.current=null;};},[file]);
 const scale=source?Math.max(512/source.width,512/source.height)*zoom:1;
 const bounded=(value:{x:number;y:number})=>source?{x:Math.max(-(source.width*scale-512)/2,Math.min((source.width*scale-512)/2,value.x)),y:Math.max(-(source.height*scale-512)/2,Math.min((source.height*scale-512)/2,value.y))}:{x:0,y:0};
 useEffect(()=>{const context=canvas.current?.getContext('2d');if(!context||!source)return;const position=bounded(offset);context.clearRect(0,0,512,512);context.drawImage(source.canvas,(512-source.width*scale)/2+position.x,(512-source.height*scale)/2+position.y,source.width*scale,source.height*scale);},[source,zoom,offset]);
 async function save(){if(saving.current||busy||!source||!canvas.current)return;saving.current=true;setEncoding(true);setError('');try{
  const current=canvas.current;const blob=await new Promise<Blob>((resolve,reject)=>current.toBlob(value=>value?resolve(value):reject(new Error('图片处理失败，请重试。')),'image/webp',.92));
  if(!alive.current)return;const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('图片处理失败，请重试。'));reader.readAsDataURL(blob);});
  if(alive.current)await onSave(dataUrl);
 }catch(value){if(alive.current)setError(value instanceof Error?value.message:'图片保存失败，请重试。');}finally{saving.current=false;if(alive.current)setEncoding(false);}}
 return <div className={styles.backdrop}><section ref={shell} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title" aria-busy={busy}>
  <header><h2 id="avatar-crop-title">调整头像</h2></header><div className={styles.body}>
   {(error||errorMessage)&&<p role="alert" className={styles.error}>{error||errorMessage}</p>}
   {!source&&!error&&<p role="status">正在读取图片…</p>}
   <div className={styles.preview} hidden={!source}><canvas ref={canvas} width={512} height={512} tabIndex={0} role="img" aria-label="头像预览，可拖动或用方向键调整位置" onPointerDown={event=>{if(busy||encoding)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};}} onPointerMove={event=>{const previous=drag.current;if(!previous||previous.id!==event.pointerId||busy||encoding)return;const rect=event.currentTarget.getBoundingClientRect(),ratio=512/rect.width,dx=(event.clientX-previous.x)*ratio,dy=(event.clientY-previous.y)*ratio;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};setOffset(value=>bounded({x:value.x+dx,y:value.y+dy}));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={event=>{if(busy||encoding)return;const step=event.shiftKey?20:5,delta=({ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}} as Record<string,{x:number;y:number}>)[event.key];if(delta){event.preventDefault();setOffset(value=>bounded({x:value.x+delta.x,y:value.y+delta.y}));}}}/><span aria-hidden="true"/></div>
   {source&&<label className={styles.zoom}>缩放<input type="range" min="1" max="3" step="0.01" value={zoom} disabled={busy||encoding} onChange={event=>setZoom(Number(event.target.value))}/></label>}
  </div><footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className={styles.primary} disabled={busy||encoding||!source} onClick={()=>void save()}>{busy?'正在保存…':encoding?'正在处理…':'保存头像'}</button></footer>
 </section></div>;
}
