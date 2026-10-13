import type {PhotoRecord} from './types.ts';
import {downloadPhoto} from './album.ts';

export type PhotoDelivery='shared'|'downloaded'|'cancelled';
export type PhotoSharePlatform={navigator?:Pick<Navigator,'canShare'|'share'>;download?:(photo:PhotoRecord)=>void;File?:typeof File;isCurrent?:()=>boolean};
/** Called directly by the chosen photo's button so Safari retains user activation. */
export async function shareOrDownloadPhoto(photo:PhotoRecord,platform:PhotoSharePlatform={}):Promise<PhotoDelivery>{
 const nav=platform.navigator??(typeof navigator==='undefined'?undefined:navigator),FileCtor=platform.File??(typeof File==='undefined'?undefined:File),download=platform.download??downloadPhoto;
 if(nav?.share&&nav.canShare&&FileCtor){
  const extension=photo.blob.type==='image/png'?'png':'jpg',file=new FileCtor([photo.blob],`齐盛-${photo.createdAt.replace(/[:.]/g,'-')}.${extension}`,{type:photo.blob.type||'image/jpeg'}),data:ShareData={files:[file],title:'齐盛 · 校园照片'};
  let supported=false;try{supported=nav.canShare(data);}catch{/* A rejected capability check uses the download route. */}
  if(supported)try{await nav.share(data);return 'shared';}catch(error){if(error&&typeof error==='object'&&'name' in error&&error.name==='AbortError')return 'cancelled';}
 }
 if(platform.isCurrent&&!platform.isCurrent())return 'cancelled';
 download(photo);return 'downloaded';
}
