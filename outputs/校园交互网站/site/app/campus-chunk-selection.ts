import type {MapChunk,MapManifest,Vec3} from '../../../校园逃生游戏/src/types';

export function campusLevel(manifest:MapManifest,buildingId:string,floor:number){
 return manifest.levels?.find(level=>level.buildingId===buildingId&&level.floor===floor);
}
/** Inspect one complete level, with the best delivered variant of every group. */
export function campusFloorChunks(manifest:MapManifest,buildingId:string,floor:number){
 const level=campusLevel(manifest,buildingId,floor);if(!level)return[];
 const groups=new Map<string,MapChunk>();
 for(const chunk of manifest.chunks){
  if(chunk.building!==buildingId||chunk.levelId!==level.id)continue;
  const key=chunk.lodGroup??chunk.url,previous=groups.get(key);
  if(!previous||chunk.lod==='near')groups.set(key,chunk);
 }
 return[...groups.values()];
}
export function campusLevelPose(manifest:MapManifest,buildingId:string,floor:number){
 const level=campusLevel(manifest,buildingId,floor),building=manifest.buildings?.find(b=>b.id===buildingId),bounds=level?.bounds??building?.bounds;
 if(!bounds)return null;
 const center=bounds.min.map((n,i)=>(n+bounds.max[i])/2) as Vec3;
 const span=Math.max(bounds.max[0]-bounds.min[0],bounds.max[2]-bounds.min[2]);
 const elevation=level?.elevation??bounds.min[1];
 return{position:[center[0]+span*.55,elevation+span*.75,center[2]+span*.75],target:[center[0],elevation+1,center[2]],fov:40};
}
export function campusChunkCutHeight(manifest:MapManifest,buildingId:string,floor:number){
 const level=campusLevel(manifest,buildingId,floor);if(!level)return 1e6;
 const above=manifest.levels?.filter(l=>l.buildingId===buildingId&&l.elevation>level.elevation).sort((a,b)=>a.elevation-b.elevation)[0];
 return Math.min(level.elevation+(floor<0?2.35:2.85),above?above.elevation-.45:Infinity);
}
