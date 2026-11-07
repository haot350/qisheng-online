import index from './generated/billboard-alpha-index.json' with {type:'json'};
import {ResourceLeases,fetchResource,waitForResource} from './resource-leases.ts';
import {staticAssetUrl} from './static-assets.ts';
import {decodePortraitMask} from './portrait-mask.ts';
type MaskRecord={bundle:string;offset:number;bytes:number;width:number;height:number;imageSha256:string};
const records=index.records as Record<string,MaskRecord>;
const bundles=new ResourceLeases<ArrayBuffer>((url,signal)=>fetchResource(url,signal),()=>{});
export function retainBillboardMask(filename:string,signal:AbortSignal){
 const row=records[filename];if(!row)throw Error('人物轮廓尚未准备好。');
 const imageHash=/\/([a-f0-9]{64})\.[a-z0-9]+$/.exec(staticAssetUrl(filename))?.[1];
 if(imageHash&&imageHash!==row.imageSha256)throw Error('人物图片与轮廓版本不一致。');
 const lease=bundles.acquire(staticAssetUrl(row.bundle));
 const mask=(async()=>{
 try{
  const buffer=await waitForResource(lease.value,signal);
  if(!Number.isSafeInteger(row.offset)||!Number.isSafeInteger(row.bytes)||row.offset<0||row.bytes<24||row.offset+row.bytes>buffer.byteLength)throw Error('人物轮廓数据不完整。');
  const mask=decodePortraitMask(new Uint8Array(buffer,row.offset,row.bytes));
  if(mask.width!==row.width||mask.height!==row.height)throw Error('人物轮廓尺寸不一致。');
  return mask;
 }catch(error){lease.release();throw error;}
 })();
 return{mask,release:lease.release};
}
