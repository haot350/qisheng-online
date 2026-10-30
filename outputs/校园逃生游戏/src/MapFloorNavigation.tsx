import {useId} from 'react';
import {mapBuildings,mapFloorsFor} from './map-space-ui';
import './map-navigation.css';
export function MapFloorNavigation({buildingId,floor,onBuilding,onFloor}:{buildingId:string;floor:number;onBuilding:(id:string)=>void;onFloor:(floor:number)=>void}){
 const id=useId();
 return <nav className="fps-map-floors" aria-label="查看楼栋与楼层"><label htmlFor={id}>区域</label><select id={id} value={buildingId} onChange={e=>{onBuilding(e.target.value);onFloor(0);}}><option value="">校园全图</option>{mapBuildings.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</select>{mapFloorsFor(buildingId).map(f=><button key={f} type="button" aria-pressed={f===floor} onClick={()=>onFloor(f)}>{f===0?(buildingId?'外观':'室外'):f<0?'地下'+Math.abs(f)+'层':f+'层'}</button>)}</nav>;
}
