import {floorLabel,mapLevels,type MapLevelSource} from './escape-floor';

export function MapLevelPicker({map,floor,levelId,onChange,available,className='fps-map-floors'}:{map?:MapLevelSource;floor:number;levelId?:string|null;onChange:(floor:number,levelId:string|null)=>void;available?:number[];className?:string}){
 const levels=mapLevels(map);
 if(!map?.levels?.length){
  const floors=[...new Set([0,...(available??levels.map(l=>l.floor))])].filter(Number.isInteger).sort((a,b)=>a-b);
  return <nav className={className} aria-label="查看楼层">{floors.map(f=><button key={f} type="button" aria-pressed={f===floor} onClick={()=>onChange(f,levels.find(l=>l.floor===f)?.id??null)}>{floorLabel(f)}</button>)}</nav>;
 }
 const selected=levels.find(l=>l.id===levelId),buildingId=selected?.buildingId??'',buildings=[...new Set(levels.map(l=>l.buildingId))];
 const chooseBuilding=(id:string)=>{const candidates=levels.filter(l=>l.buildingId===id).sort((a,b)=>a.floor-b.floor),next=candidates.find(l=>l.floor===floor)??candidates.find(l=>l.floor===1)??candidates[0];onChange(next?.floor??0,next?.id??null);};
 return <nav className={className+' fps-map-level-picker'} aria-label="查看区域与楼层"><label><span>区域</span><select aria-label="地图区域" value={buildingId} onChange={e=>chooseBuilding(e.target.value)}><option value="">校园全图</option>{buildings.map(id=><option key={id} value={id}>{map.buildings?.find(b=>b.id===id)?.label??id}</option>)}</select></label>{buildingId&&<div role="group" aria-label="查看楼层">{levels.filter(l=>l.buildingId===buildingId).sort((a,b)=>a.floor-b.floor).map(level=><button key={level.id} type="button" aria-pressed={level.id===levelId} onClick={()=>onChange(level.floor,level.id)}>{level.label??floorLabel(level.floor)}</button>)}</div>}</nav>;
}
