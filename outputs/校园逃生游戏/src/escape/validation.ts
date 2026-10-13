import {VALIDATED_ESCAPE_EDGES,VALIDATED_ESCAPE_EXTRACTION,VALIDATED_ESCAPE_SITES} from './validated.ts';
import type {EscapeRouteValidation,EscapeVec3} from './types.ts';
const sites=[VALIDATED_ESCAPE_EXTRACTION,...VALIDATED_ESCAPE_SITES];
const edges=new Map(VALIDATED_ESCAPE_EDGES.map(([a,b,length])=>[a+'>'+b,length]));
/** The calibrated graph is a safety gate, not a replacement for the current navigation path. */
export function calibratedEscapeRoute(from:EscapeVec3,to:EscapeVec3):EscapeRouteValidation {
 const closest=(point:EscapeVec3)=>sites.find(site=>Math.hypot(site.position[0]-point[0],site.position[1]-point[1],site.position[2]-point[2])<.12);
 const a=closest(from),b=closest(to);if(!a||!b)return {complete:false,length:Infinity,reason:'uncalibrated endpoint'};
 if(a.id===b.id)return {complete:true,length:0};const length=edges.get(a.id+'>'+b.id);return length===undefined?{complete:false,length:Infinity,reason:'capsule route rejected'}:{complete:true,length};
}