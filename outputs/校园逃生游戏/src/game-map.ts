import type {MapManifest} from './types';
import type {MapIdentity} from './multiplayer/shared/protocol';
import {MapAssetSession,abortMapRequest,mapByteCache,type MapResourceIndex} from './map-cache.ts';

export const gameMapSession=new MapAssetSession('/map/resource-index.json');
export type GameMapBundle={manifest:MapManifest;manifestBytes:ArrayBuffer;collision:ArrayBuffer;navigation:ArrayBuffer;vision?:ArrayBuffer;identity:MapIdentity;index:MapResourceIndex};
let bundle:GameMapBundle|undefined;
/** The exact bytes used for admission are reused by local simulation and rendering. */
export async function loadGameMapBundle(signal?:AbortSignal):Promise<GameMapBundle>{
 if(signal?.aborted)throw abortMapRequest();if(bundle)return bundle;
 const {index,manifestBytes}=await gameMapSession.initialize(signal),manifest=JSON.parse(new TextDecoder().decode(manifestBytes)) as MapManifest;
 const [collision,navigation,vision]=await Promise.all([gameMapSession.read(manifest.collisionUrl,{signal,priority:0}),gameMapSession.read(manifest.navmeshUrl,{signal,priority:0}),manifest.visionUrl?gameMapSession.read(manifest.visionUrl,{signal,priority:0}):undefined]);
 if(signal?.aborted)throw abortMapRequest();
 return bundle??={manifest,manifestBytes,collision,navigation,vision,index,identity:{sourceVersion:manifest.sourceVersion||manifest.source,manifestHash:index.manifest.sha256,collisionHash:index.resources[manifest.collisionUrl].sha256,navigationHash:index.resources[manifest.navmeshUrl].sha256,...(manifest.visionUrl?{visionHash:index.resources[manifest.visionUrl].sha256}:{})}};
}
export async function gameMapManifest(signal?:AbortSignal){const {manifestBytes}=await gameMapSession.initialize(signal);return JSON.parse(new TextDecoder().decode(manifestBytes)) as MapManifest;}
export const downloadCompleteGameMap=()=>gameMapSession.prefetch();
export const cancelCompleteGameMap=()=>mapByteCache().cancelPrefetch();
export const setGameMapDownloadContext=(context:{onlineBattle:boolean;menu:boolean})=>mapByteCache().setDownloadContext(context);
