/** The three-building map needs a larger bounded A* pool. The old map keeps
 * its existing pool; per-frame request limits are managed by NpcPathBudget. */
export function mapNavigationQueryOptions(map:{mapCatalogId?:string}){
 return{maxNodes:map.mapCatalogId==='web-r01-campus-1'?4096:2048};
}
