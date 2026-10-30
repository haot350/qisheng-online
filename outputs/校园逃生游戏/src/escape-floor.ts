import type {MapManifest,Vec3} from './types';
/** Floor follows source elevations and bounds, including the open stair landings. */
export function escapeFloorAt(point:Vec3,floors:MapManifest['floors']):number {
 return escapeLevelAt(point,floors)?.id??0;
}
export function escapeLevelAt(point:Vec3,floors:MapManifest['floors']){
 const candidates=(floors??[]).filter(f=>point[0]>=f.bounds.min[0]-1.5&&point[0]<=f.bounds.max[0]+1.5&&point[2]>=f.bounds.min[2]-1.5&&point[2]<=f.bounds.max[2]+1.5&&point[1]>=f.elevation-.35&&point[1]<f.bounds.max[1]-.1);
 return candidates.reduce<NonNullable<MapManifest['floors']>[number]|undefined>((best,f)=>!best||Math.abs(point[1]-f.elevation)<Math.abs(point[1]-best.elevation)?f:best,undefined);
}
