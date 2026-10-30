export type MapDecodedImage=ImageBitmap|HTMLImageElement;
type DecodeHost={bitmap?:typeof createImageBitmap;Image?:new()=>HTMLImageElement;url:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>};
const cancelled=()=>new DOMException('Cancelled','AbortError');
export function releaseMapImage(image:MapDecodedImage){
 if(typeof (image as ImageBitmap).close==='function')(image as ImageBitmap).close();
 else (image as HTMLImageElement).src='';
}
function bitmapImage(blob:Blob,signal:AbortSignal,create:typeof createImageBitmap){
 return new Promise<ImageBitmap>((resolve,reject)=>{
  let done=false;const abort=()=>{if(done)return;done=true;reject(cancelled());};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();signal.removeEventListener('abort',abort);return;}
  Promise.resolve().then(()=>{if(signal.aborted)throw cancelled();return create(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});}).then(image=>{
   signal.removeEventListener('abort',abort);
   if(done||signal.aborted){image.close();if(!done){done=true;reject(cancelled());}return;}
   done=true;resolve(image);
  },error=>{signal.removeEventListener('abort',abort);if(done)return;done=true;reject(error);});
 });
}
function elementImage(blob:Blob,signal:AbortSignal,host:DecodeHost){
 if(!host.Image)return Promise.reject(new Error('当前浏览器暂时无法打开校园贴图，请更新浏览器后重试。'));
 return new Promise<HTMLImageElement>((resolve,reject)=>{
  const image=new host.Image!(),url=host.url.createObjectURL(blob);let done=false;
  const finish=(error?:unknown)=>{
   if(done)return;done=true;image.onload=image.onerror=null;signal.removeEventListener('abort',abort);host.url.revokeObjectURL(url);
   if(error){image.src='';reject(error);}else resolve(image);
  },abort=()=>finish(cancelled());
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
  image.onload=()=>{if(!image.naturalWidth||!image.naturalHeight){finish(new Error('校园贴图无法打开，请重试。'));return;}finish();};
  image.onerror=()=>finish(new Error('校园贴图无法打开，请重试。'));
  image.decoding='async';image.src=url;
 });
}
/** Safari and embedded browsers may have Image support without ImageBitmap,
 * or may reject its decoding options. Both paths use the verified local bytes. */
export async function decodeMapImage(bytes:ArrayBuffer,signal:AbortSignal,host:DecodeHost={bitmap:globalThis.createImageBitmap?.bind(globalThis),Image:globalThis.Image,url:URL}):Promise<MapDecodedImage>{
 if(signal.aborted)throw cancelled();
 const blob=new Blob([bytes],{type:'image/webp'});
 if(host.bitmap){try{return await bitmapImage(blob,signal,host.bitmap);}catch(error){if(signal.aborted)throw cancelled();if(!host.Image)throw error;}}
 return elementImage(blob,signal,host);
}
