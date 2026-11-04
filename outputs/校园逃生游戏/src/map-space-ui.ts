import layout from './generated/map-layout.json';
export type CampusMapBounds={min:number[];max:number[]};
export type CampusMapBuilding={id:string;label:string;bounds:CampusMapBounds};
export type CampusMapLevel={id:string;buildingId:string;floor:number;label:string;elevation:number;bounds:CampusMapBounds};
export type CampusMapStair={core:string;buildingId:string;from_floor:number;to_floor:number;fromLevelId:string;toLevelId:string;points:number[][]};
export type CampusMapLayout={schema:number;sourceSha256:string;visualRevision:string;bounds:CampusMapBounds;buildings:CampusMapBuilding[];levels:CampusMapLevel[];stairs:CampusMapStair[];landmarks:{id:string;label:string;position:number[]}[];rooms:unknown[]};
export const campusLayout:CampusMapLayout=layout;
export const mapBuildings=campusLayout.buildings;
type Point=readonly number[];
export function mapBuildingAt(point:Point|undefined){
 if(!point)return undefined;
 return mapBuildings.find(b=>point[0]>=b.bounds.min[0]-1&&point[0]<=b.bounds.max[0]+1&&point[2]>=b.bounds.min[2]-1&&point[2]<=b.bounds.max[2]+1&&point[1]>=b.bounds.min[1]-.4&&point[1]<b.bounds.max[1]);
}
export function mapBuildingIdAt(point:Point|undefined){return mapBuildingAt(point)?.id??'';}
export function mapLocationName(point:Point|undefined,floor:number){
 const building=mapBuildingAt(point);return floor===0?'室外':(building?.label??'')+' '+(floor<0?'地下'+Math.abs(floor)+'层':floor+'层');
}
export function mapFloorsFor(buildingId:string){return buildingId?[0,...new Set(campusLayout.levels.filter(l=>l.buildingId===buildingId).map(l=>l.floor))]:[0];}
export function mapBoundsFor(floor:number,buildingId:string){const b=floor===0?campusLayout.bounds:mapBuildings.find(b=>b.id===buildingId)?.bounds??layout.bounds;return {min:[b.min[0],b.min[2]],max:[b.max[0],b.max[2]]};}
