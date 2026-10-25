import type {MapManifest,Vec3} from './types';
import type {MapBounds,MapChunk,MapLayout,MapLevel} from '@qisheng/shared/types';
export type MapLevelSource=Partial<MapLayout>;
export type StreamFloor={id:number;elevation:number;bounds?:MapBounds;buildingId?:string;levelId?:string;label?:string};
const levelCache=new WeakMap<object,readonly MapLevel[]>(),floorCache=new WeakMap<object,StreamFloor[]>(),layoutCache=new WeakMap<object,MapLayout>();
export function mapLayoutFromManifest(map:MapManifest):MapLayout{
 const cached=layoutCache.get(map);if(cached)return cached;
 const layout={bounds:map.bounds,buildings:map.buildings,levels:map.levels,floors:map.floors,stairRoutes:map.stairRoutes};layoutCache.set(map,layout);return layout;
}
const footprint=(point:readonly number[],bounds:MapBounds,margin=0)=>point[0]>=bounds.min[0]-margin&&point[0]<=bounds.max[0]+margin&&point[2]>=bounds.min[2]-margin&&point[2]<=bounds.max[2]+margin;
export function mapLevels(map:MapLevelSource|undefined):readonly MapLevel[]{
 if(!map)return [];if(map.levels?.length)return map.levels;
 const floors=map.floors;if(!floors)return [];const cached=levelCache.get(floors);if(cached)return cached;
 const result=floors.map(f=>({id:f.levelId??`${f.buildingId??'south-teaching'}:${f.id}`,buildingId:f.buildingId??'south-teaching',floor:f.id,label:f.label,elevation:f.elevation,bounds:f.bounds}));levelCache.set(floors,result);return result;
}
/** Compatibility projection for streaming callers that still pass numeric floor records. */
export function mapStreamingFloors(map:MapLevelSource):StreamFloor[]{
 const cached=floorCache.get(map);if(cached)return cached;
 const result=mapLevels(map).map(f=>({id:f.floor,elevation:f.elevation,bounds:f.bounds,buildingId:f.buildingId,levelId:f.id,label:f.label}));floorCache.set(map,result);return result;
}
export function escapeLevelAt(point:readonly number[],map:MapLevelSource|undefined):MapLevel|null{
 let best:MapLevel|null=null,bestRank=Infinity;
 for(const level of mapLevels(map)){
  if(!footprint(point,level.bounds,1.5)||point[1]<level.elevation-.35||point[1]>level.bounds.max[1]+.35)continue;
  const rank=Math.abs(point[1]-level.elevation)+(footprint(point,level.bounds)?0:100);
  if(rank<bestRank){best=level;bestRank=rank;}
 }
 return best;
}
export function mapLevelForPoint(map:MapLevelSource|undefined,point:readonly number[],levelId?:string):MapLevel|null{return (levelId?mapLevels(map).find(level=>level.id===levelId):undefined)??escapeLevelAt(point,map);}
export function floorLabel(floor:number){return floor<0?`地下 ${Math.abs(floor)} 层`:floor===0?'室外':`${floor} 层`;}
export function mapLevelLabel(map:MapLevelSource|undefined,levelId:string|null,building=true){
 const level=mapLevels(map).find(l=>l.id===levelId);if(!level)return '室外';
 const label=level.label??(level.floor===0?'首层':floorLabel(level.floor)),name=map?.buildings?.find(b=>b.id===level.buildingId)?.label;
 return building&&name?`${name} · ${label}`:label;
}
export function streamFloorForChunk(chunk:MapChunk,floors:readonly StreamFloor[]){
 if(chunk.levelId)return floors.find(f=>f.levelId===chunk.levelId);
 const matches=floors.filter(f=>f.id===chunk.floor&&(!chunk.building||!f.buildingId||f.buildingId===chunk.building));
 return matches.find(f=>f.bounds&&footprint(chunk.center,f.bounds))??matches[0];
}
export function streamFloorAt(point:Vec3,floors:readonly StreamFloor[]){
 let best:StreamFloor|undefined;
 for(const f of floors){if(f.bounds&&(!footprint(point,f.bounds,1.5)||point[1]<f.elevation-.35||point[1]>f.bounds.max[1]+.35))continue;if(!best||Math.abs(point[1]-f.elevation)<Math.abs(point[1]-best.elevation))best=f;}
 return best;
}
export function streamChunkAllowed(chunk:MapChunk,point:Vec3,floors:readonly StreamFloor[],outdoorOnly=false){
 if(chunk.kind!=='interior')return true;if(outdoorOnly)return false;
 const target=streamFloorForChunk(chunk,floors),current=streamFloorAt(point,floors);
 if(!target)return true;
 if(!current)return target.id===1||target.id===0||Math.abs(point[1]-target.elevation)<2.25;
 if(current.buildingId&&target.buildingId&&current.buildingId!==target.buildingId)return Math.abs(point[1]-target.elevation)<2.25;
 return Math.abs(current.id-target.id)<=1;
}
export function chunkAllowedAtLevel(chunk:MapChunk,point:Vec3,map:MapLevelSource,outdoorOnly=false){return streamChunkAllowed(chunk,point,mapStreamingFloors(map),outdoorOnly);}
/** Floor follows source elevations and bounds, including the open stair landings. */
export function escapeFloorAt(point:Vec3,floors:MapManifest['floors']|MapLevelSource):number {
 if(floors&&!Array.isArray(floors))return escapeLevelAt(point,floors)?.floor??0;
 const candidates=(floors??[]).filter(f=>point[0]>=f.bounds.min[0]-1.5&&point[0]<=f.bounds.max[0]+1.5&&point[2]>=f.bounds.min[2]-1.5&&point[2]<=f.bounds.max[2]+1.5);
 if(!candidates.length||point[1]<Math.min(...candidates.map(f=>f.elevation))-.35)return 0;
 return candidates.reduce((best,f)=>Math.abs(point[1]-f.elevation)<Math.abs(point[1]-best.elevation)?f:best).id;
}
