type Point=readonly [number,number,number];
type Route={core:string;from_floor:number;to_floor?:number;points:readonly Point[];id?:string;building?:string;fromLevelId?:string;toLevelId?:string};
/** Legacy maps lack building ids. Endpoint coordinates still distinguish
 * identically named flights in separate buildings. */
export function stairRouteKey(route:Route){
 const endpoint=(point:Point|undefined)=>point?.map(n=>n.toFixed(3)).join(',')??'';
 return [route.building??'',route.id??route.core,route.fromLevelId??route.from_floor,route.toLevelId??route.to_floor??'',endpoint(route.points[0]),endpoint(route.points.at(-1))].join(':');
}
export function stairLandingDirection(route:Route,ascending:boolean):[number,number,number]{
 const endpoint=ascending?route.points[0]:route.points.at(-1);
 if(!endpoint)return[1,0,0];
 const inside=ascending?route.points.slice(1):route.points.slice(0,-1).reverse();
 for(const point of inside){const x=endpoint[0]-point[0],z=endpoint[2]-point[2],length=Math.hypot(x,z);if(length>.1)return[x/length,0,z/length];}
 return[1,0,0];
}
