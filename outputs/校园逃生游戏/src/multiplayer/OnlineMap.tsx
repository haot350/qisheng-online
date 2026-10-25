import { useEffect,useState } from 'react';
import { EscapeMapCanvas,type EscapeMapFocus } from '../EscapeMapCanvas';
import {escapeFloorAt,escapeLevelAt,mapLevelForPoint} from '../escape-floor';
import {MapLevelPicker} from '../MapLevelPicker';
import '../escape-hud.css';
import { gameMapManifest } from '../game-map';
import type { MapManifest,Snapshot } from '../types';
import type { RoomSnapshot } from './shared/protocol';
import { onlineMapSnapshot,onlineTaskMapSites } from './task-map';
export function OnlineMap({room,playerId,onClose,selectedTaskId,onSelectTask,stairGuide}:{room:RoomSnapshot;playerId:string|null;onClose:()=>void;selectedTaskId?:string;onSelectTask?:(id:string)=>void;stairGuide?:Snapshot['onlineStairGuide']}){
 const [map,setMap]=useState<MapManifest>(),[floor,setFloor]=useState(0),[levelId,setLevelId]=useState<string|null>(null),[selected,setSelected]=useState(room.tasks.find(t=>t.status!=='complete')?.id),[focus,setFocus]=useState<EscapeMapFocus>({key:0});
 useEffect(()=>{const abort=new AbortController();void gameMapManifest(abort.signal).then((m:MapManifest)=>{setMap(m);const p=room.players.find(p=>p.id===playerId);if(p){setFloor(escapeFloorAt(p.position,m));setLevelId(escapeLevelAt(p.position,m)?.id??null);}}).catch(()=>{});return()=>abort.abort();},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code==='KeyM'||e.code==='Escape'){e.preventDefault();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
 const select=(id:string)=>{setSelected(id);onSelectTask?.(id);},tracked=selectedTaskId??selected,p=room.players.find(p=>p.id===playerId),snapshot=onlineMapSnapshot(room,playerId,tracked,map),sites=onlineTaskMapSites(room,map),markers=room.players.filter(m=>!m.departed&&m.id!==playerId&&(room.mode==='coop'||room.variant==='tdm'&&m.team===p?.team)).map(m=>({id:m.id,position:m.position,floor:escapeFloorAt(m.position,map),levelId:escapeLevelAt(m.position,map)?.id,label:m.nickname,down:m.life==='downed'}));
 snapshot.escape!.stairGuide=stairGuide;
 return <div className="online-map-shade"><section className="online-map-panel" role="dialog" aria-modal="true" aria-label="对局地图"><header><h2>校园地图</h2><p>对局仍在继续</p><button onClick={onClose}>返回对局</button></header><div className="online-map-floors"><MapLevelPicker map={map} floor={floor} levelId={levelId} className="fps-map-floors" onChange={(f,id)=>{setFloor(f);setLevelId(id);}}/><button onClick={()=>{if(p){setFloor(escapeFloorAt(p.position,map));setLevelId(escapeLevelAt(p.position,map)?.id??null);setFocus({key:Date.now(),position:[p.position[0],p.position[2]],zoom:2});}}}>我的位置</button></div><EscapeMapCanvas snapshot={snapshot} floor={floor} levelId={map?.levels?.length?levelId:undefined} focus={focus} onSelect={select} markers={markers}/><footer>{room.tasks.map(t=><button key={t.id} aria-pressed={t.id===tracked} onClick={()=>{select(t.id);const site=sites.find(s=>s.taskId===t.id);if(site){setFloor(site.floor??0);setLevelId(mapLevelForPoint(map,site.position,site.levelId)?.id??null);setFocus({key:Date.now(),position:[site.position[0],site.position[2]],zoom:2});}}}>{t.status==='complete'?'✓ ':''}{t.label}</button>)}</footer></section></div>;
}
