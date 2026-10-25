import {NavMeshQuery,type NavMesh} from 'recast-navigation';
import type {MapManifest} from '../types';
const expanded=new WeakSet<NavMeshQuery>();
export function createCampusQuery(nav:NavMesh,manifest:MapManifest){
 const modern=!!manifest.levels?.length,query=new NavMeshQuery(nav,modern?{maxNodes:16384}:undefined);
 if(modern)expanded.add(query);return query;
}
export const expandedCampusQuery=(query:NavMeshQuery)=>expanded.has(query);
export function campusQueryPathOptions(query:NavMeshQuery){return expanded.has(query)?{maxPathPolys:4096,maxStraightPathPoints:4096}:{maxPathPolys:512,maxStraightPathPoints:256};}
