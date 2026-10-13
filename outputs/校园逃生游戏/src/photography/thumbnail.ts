import type {PhotoMetadata} from './types.ts';

export const THUMBNAIL_EDGE=320,THUMBNAIL_CACHE_LIMIT=24;
export function thumbnailSize(width:number,height:number):[number,number]{
 const w=Math.max(1,Number.isFinite(width)?width:1),h=Math.max(1,Number.isFinite(height)?height:1),ratio=Math.min(1,THUMBNAIL_EDGE/Math.max(w,h));
 return[Math.max(1,Math.round(w*ratio)),Math.max(1,Math.round(h*ratio))];
}

/** Resize into a disposable decode surface; the original blob is never rewritten. */
export async function thumbnailBlob(blob:Blob,width:number,height:number):Promise<Blob>{
 const[w,h]=thumbnailSize(width,height),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 let bitmap:ImageBitmap|null=null,image:HTMLImageElement|null=null,source='';
 try{
  const context=canvas.getContext('2d');if(!context)throw Error('缩略图暂时无法生成。');
  if(typeof createImageBitmap==='function'){bitmap=await createImageBitmap(blob,{resizeWidth:w,resizeHeight:h,resizeQuality:'medium'});context.drawImage(bitmap,0,0,w,h);}
  else{image=new Image();source=URL.createObjectURL(blob);image.src=source;await image.decode();context.drawImage(image,0,0,w,h);}
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('缩略图暂时无法生成。')),'image/jpeg',.78));
 }finally{bitmap?.close();if(image)image.src='';if(source)URL.revokeObjectURL(source);canvas.width=0;canvas.height=0;}
}

type ThumbnailOptions={limit?:number;build?:(blob:Blob,width:number,height:number)=>Promise<Blob>;createURL?:(blob:Blob)=>string;revokeURL?:(url:string)=>void};
/** Each open album owns a bounded LRU. Work is serial to avoid parallel original decodes. */
export class AlbumThumbnailCache{
 private urls=new Map<string,string>();private pending=new Map<string,Promise<string>>();private revisions=new Map<string,number>();private queue:Promise<unknown>=Promise.resolve();private disposed=false;private generation=0;
 private limit:number;private build:NonNullable<ThumbnailOptions['build']>;private createURL:NonNullable<ThumbnailOptions['createURL']>;private revokeURL:NonNullable<ThumbnailOptions['revokeURL']>;
 constructor(private read:(photo:PhotoMetadata)=>Promise<Blob>,options:ThumbnailOptions={}){this.limit=Math.max(1,Math.min(THUMBNAIL_CACHE_LIMIT,options.limit??THUMBNAIL_CACHE_LIMIT));this.build=options.build??thumbnailBlob;this.createURL=options.createURL??(blob=>URL.createObjectURL(blob));this.revokeURL=options.revokeURL??(url=>URL.revokeObjectURL(url));}
 get size(){return this.urls.size;}
 /** Layout-effect setup may run again after React's development cleanup replay. */
 activate(){this.disposed=false;}
 get(photo:PhotoMetadata):Promise<string>{
  if(this.disposed)return Promise.reject(Error('相册已关闭。'));
  const cached=this.urls.get(photo.id);if(cached){this.urls.delete(photo.id);this.urls.set(photo.id,cached);return Promise.resolve(cached);}
  const pending=this.pending.get(photo.id);if(pending)return pending;
  const revision=this.revisions.get(photo.id)??0,generation=this.generation,current=()=>!this.disposed&&this.generation===generation&&(this.revisions.get(photo.id)??0)===revision;
  const work=this.queue.then(async()=>{if(!current())throw Error('缩略图请求已取消。');const original=await this.read(photo);if(!current())throw Error('缩略图请求已取消。');const thumbnail=await this.build(original,photo.width,photo.height);if(!current())throw Error('缩略图请求已取消。');while(this.urls.size>=this.limit)this.evict(this.urls.keys().next().value!);const url=this.createURL(thumbnail);this.urls.set(photo.id,url);return url;});
  this.queue=work.catch(()=>{});this.pending.set(photo.id,work);const release=()=>{if(this.pending.get(photo.id)===work)this.pending.delete(photo.id);};void work.then(release,release);return work;
 }
 private evict(id:string){const url=this.urls.get(id);if(url)this.revokeURL(url);this.urls.delete(id);}
 remove(id:string){this.revisions.set(id,(this.revisions.get(id)??0)+1);this.pending.delete(id);this.evict(id);}
 reconcileAvailable(ids:Iterable<string>){const available=new Set(ids);for(const id of new Set([...this.urls.keys(),...this.pending.keys()]))if(!available.has(id))this.remove(id);}
 dispose(){if(this.disposed)return;this.disposed=true;this.generation++;for(const id of this.urls.keys())this.evict(id);this.pending.clear();}
}
