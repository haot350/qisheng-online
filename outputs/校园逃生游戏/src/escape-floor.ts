import type {MapManifest,Vec3} from './types';
/** Floor follows source elevations and bounds, including the open stair landings. */
export function escapeFloorAt(point:Vec3,floors:MapManifest['floors']):number {
 const candidates=(floors??[]).filter(f=>point[0]>=f.bounds.min[0]-1.5&&point[0]<=f.bounds.max[0]+1.5&&point[2]>=f.bounds.min[2]-1.5&&point[2]<=f.bounds.max[2]+1.5);
 if(!candidates.length||point[1]<Math.min(...candidates.map(f=>f.elevation))-.35)return 0;
 return candidates.reduce((best,f)=>Math.abs(point[1]-f.elevation)<Math.abs(point[1]-best.elevation)?f:best).id;
}
