import type {MapManifest} from './types';
import type {MapIdentity} from './multiplayer/shared/protocol';
import {MapAssetSession,abortMapRequest,mapByteCache,decodedMapResourceBinding,type MapResourceIndex} from './map-cache.ts';

export const gameMapSession=new MapAssetSession('/map/resource-index.json');
export type GameMapBundle={manifest:MapManifest;manifestBytes:ArrayBuffer;collision:ArrayBuffer;navigation:ArrayBuffer;vision?:ArrayBuffer;identity:MapIdentity;index:MapResourceIndex};
export type MapBundleProgress={stage:'download'|'decode'|'ready';completedBytes:number;totalBytes:number;completedFiles:number;totalFiles:number;resource?:string};
let bundle:GameMapBundle|undefined;
/** Authority hashes describe decoded bytes, independently of transfer representation. */
export async function loadGameMapBundle(signal?:AbortSignal,onProgress?:(detail:MapBundleProgress)=>void):Promise<GameMapBundle>{
 if(signal?.aborted)throw abortMapRequest();
 if(bundle){const rows=[bundle.manifest.collisionUrl,bundle.manifest.navmeshUrl,bundle.manifest.visionUrl].filter((url):url is string=>!!url).map(url=>bundle!.index.resources[url]);const total=rows.reduce((n,r)=>n+r.bytes,0);onProgress?.({stage:'ready',completedBytes:total,totalBytes:total,completedFiles:rows.length,totalFiles:rows.length});return bundle;}
 const {index,manifestBytes}=await gameMapSession.initialize(signal),manifest=JSON.parse(new TextDecoder().decode(manifestBytes)) as MapManifest;
 const urls=[manifest.collisionUrl,manifest.navmeshUrl,...(manifest.visionUrl?[manifest.visionUrl]:[])],units=new Map(urls.map(url=>[url,{bytes:0,total:index.resources[url].bytes,done:false}]));
 const report=(stage:MapBundleProgress['stage'],resource?:string)=>{if(signal?.aborted)return;onProgress?.({stage,resource,completedBytes:[...units.values()].reduce((n,v)=>n+v.bytes,0),totalBytes:[...units.values()].reduce((n,v)=>n+v.total,0),completedFiles:[...units.values()].filter(v=>v.done).length,totalFiles:units.size});};report('download');
 const read=(url:string)=>gameMapSession.read(url,{signal,priority:0,onStage:detail=>{const unit=units.get(url)!;unit.bytes=detail.bytes;unit.total=detail.totalBytes;unit.done=detail.stage==='ready';report(detail.stage,url);}});
 const [collision,navigation,vision]=await Promise.all([read(manifest.collisionUrl),read(manifest.navmeshUrl),manifest.visionUrl?read(manifest.visionUrl):undefined]);
 if(signal?.aborted)throw abortMapRequest();
 if(import.meta.env?.DEV&&typeof document!=='undefined')document.documentElement.dataset.qaMapManifestHash=index.manifest.sha256;
 const result=bundle??={manifest,manifestBytes,collision,navigation,vision,index,identity:{sourceVersion:manifest.sourceVersion||manifest.source,manifestHash:index.manifest.sha256,collisionHash:decodedMapResourceBinding(index.resources[manifest.collisionUrl]).sha256,navigationHash:decodedMapResourceBinding(index.resources[manifest.navmeshUrl]).sha256,...(manifest.visionUrl?{visionHash:decodedMapResourceBinding(index.resources[manifest.visionUrl]).sha256}:{})}};report('ready');return result;
}
export async function gameMapManifest(signal?:AbortSignal){const {manifestBytes}=await gameMapSession.initialize(signal);return JSON.parse(new TextDecoder().decode(manifestBytes)) as MapManifest;}
export const downloadCompleteGameMap=()=>gameMapSession.prefetch();
export const cancelCompleteGameMap=()=>mapByteCache().cancelPrefetch();
export const setGameMapDownloadContext=(context:{onlineBattle:boolean;menu:boolean})=>mapByteCache().setDownloadContext(context);
