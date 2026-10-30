import type {MapChunk,MapManifest,Vec3} from './types';

function distance(c:MapChunk,p:Vec3){
 const b=c.lodBounds??c.bounds;
 return b?Math.hypot(...p.map((v,i)=>Math.max(b.min[i]-v,0,v-b.max[i]))):Math.max(0,Math.hypot(...p.map((v,i)=>v-c.center[i]))-c.radius);
}
const structural=(c:MapChunk)=>c.roomCore||c.residency==='structure'||c.combatOccluder===true;
type Group={near?:MapChunk;far?:MapChunk;single?:MapChunk};
export type LodPlan={required:MapChunk[];wanted:MapChunk[];preferred:Set<string>;baseline:Set<string>};

/** A complete lightweight shell remains stable across turns. Near detail follows
 * position, not yaw; an old LOD remains drawable until its replacement is ready. */
export class MapLodSelection{
 readonly enabled:boolean;
 private groups=new Map<string,Group>();
 private previousNear=new Set<string>();
 private preferred=new Map<string,MapChunk>();
 private selected=new Set<string>();
 private baseline=new Set<string>();
 private index:Map<string,MapChunk>;
 constructor(chunks:MapChunk[]){
  this.enabled=chunks.some(c=>c.lodGroup&&c.lod);
  this.index=new Map(chunks.map(c=>[c.url,c]));
  for(const c of chunks){const id=c.lodGroup??c.url,g=this.groups.get(id)??{};
   if(c.lod==='near')g.near=c;else if(c.lod==='far')g.far=c;else g.single=c;
   this.groups.set(id,g);
  }
 }
 plan(point:Vec3,low:boolean,floors:MapManifest['floors']=[],outdoorOnly=false,lookAhead?:Vec3):LodPlan{
  const required=new Map<string,MapChunk>(),wanted=new Map<string,MapChunk>();
  this.preferred.clear();this.selected.clear();this.baseline.clear();
  const add=(map:Map<string,MapChunk>,c:MapChunk|undefined)=>{if(c)map.set(c.url,c);};
  for(const [id,g]of this.groups){
   const c=g.near??g.single??g.far!,d=distance(c,point),ahead=lookAhead?distance(c,lookAhead):Infinity;
   const level=floors.find(f=>(c.levelId&&f.levelId===c.levelId)||(!c.levelId&&f.id===c.floor&&(!c.building||!f.buildingId||f.buildingId===c.building)));
   const sameHeight=!level||Math.abs(point[1]-level.elevation)<2.45;
   const structuralChunk=structural(c),interior=c.kind==='interior';
   const shell=structuralChunk&&!c.roomCore;
   if(shell){const base=g.far??g.single??g.near;add(required,base);if(base)this.baseline.add(base.url);}
   const allowed=!interior||!outdoorOnly&&sameHeight;
   const visible=shell||allowed&&(d<(interior?20:low?85:110)||ahead<(interior?14:35));
   if(!visible)continue;
   let preferred=g.single??g.far??g.near!;
   if(g.near){
    const near=d<(this.previousNear.has(id)?30:24);
    if(near){this.previousNear.add(id);preferred=g.near;}else this.previousNear.delete(id);
    // Prepare the more detailed variant before crossing its selection boundary.
    if(d<36||ahead<28)add(wanted,g.near);
   }
   this.preferred.set(id,preferred);this.selected.add(preferred.url);add(wanted,preferred);
   if(allowed&&structuralChunk&&d<(interior?12:14))add(required,g.near??g.single??g.far);
   if(shell&&g.far)add(wanted,g.far);
  }
  for(const [url,c]of required)wanted.set(url,c);
  return {required:[...required.values()],wanted:[...wanted.values()],preferred:new Set(this.selected),baseline:new Set(this.baseline)};
 }
 visible(url:string,ready:(url:string)=>boolean){
  const c=this.index.get(url);if(!c)return false;
  const id=c.lodGroup??c.url,g=this.groups.get(id)!,preferred=this.preferred.get(id);
  if(!preferred)return false;
  if(ready(preferred.url))return url===preferred.url;
  const fallback=[g.far,g.near,g.single].find(item=>item&&ready(item.url));
  return url===fallback?.url;
 }
}
