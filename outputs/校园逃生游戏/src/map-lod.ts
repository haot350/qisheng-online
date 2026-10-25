type LodObject={name:string;visible:boolean;userData:Record<string,unknown>};
type LodRoot=LodObject&{traverse:(callback:(object:LodObject)=>void)=>void};
type LodEntry={object:LodObject;kind:'near'|'far'};
const cache=new WeakMap<LodRoot,{entries:LodEntry[];near?:boolean}>();
/** Representation detail is independent from the chunk's safety/visibility gate. */
export function presentMapLod(root:LodRoot,distance:number,low:boolean):boolean{
 let state=cache.get(root);
 if(!state){
  const entries:LodEntry[]=[];
  root.traverse((object:LodObject)=>{
   const kind=object.userData.webLod??(/^near__/.test(object.name)?'near':/^far__/.test(object.name)?'far':undefined);
   if(kind==='near'||kind==='far')entries.push({object,kind});
  });
  state={entries};cache.set(root,state);
 }
 const near=!low&&distance<35;if(state.near===near)return false;state.near=near;
 for(const entry of state.entries)entry.object.visible=entry.kind===(near?'near':'far');
 return state.entries.length>0;
}
