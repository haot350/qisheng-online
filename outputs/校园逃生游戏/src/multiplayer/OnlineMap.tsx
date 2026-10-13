import { useEffect,useState } from 'react';
import { EscapeMapCanvas,type EscapeMapFocus } from '../EscapeMapCanvas';
import { escapeFloorAt } from '../escape-floor';
import '../escape-hud.css';
import { gameMapManifest } from '../game-map';
import type { MapManifest } from '../types';
import type { RoomSnapshot } from './shared/protocol';
import { onlineMapSnapshot,onlineTaskMapSites } from './task-map';
export function OnlineMap({room,playerId,onClose,selectedTaskId,onSelectTask}:{room:RoomSnapshot;playerId:string|null;onClose:()=>void;selectedTaskId?:string;onSelectTask?:(id:string)=>void}){
 const [floors,setFloors]=useState<MapManifest['floors']>([]),[floor,setFloor]=useState(0),[selected,setSelected]=useState(room.tasks.find(t=>t.status!=='complete')?.id),[focus,setFocus]=useState<EscapeMapFocus>({key:0});
 useEffect(()=>{const abort=new AbortController();void gameMapManifest(abort.signal).then((m:MapManifest)=>{setFloors(m.floors);const p=room.players.find(p=>p.id===playerId);if(p)setFloor(escapeFloorAt(p.position,m.floors));}).catch(()=>{});return()=>abort.abort();},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code==='KeyM'||e.code==='Escape'){e.preventDefault();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
 const select=(id:string)=>{setSelected(id);onSelectTask?.(id);},tracked=selectedTaskId??selected,p=room.players.find(p=>p.id===playerId),snapshot=onlineMapSnapshot(room,playerId,tracked,floors),sites=onlineTaskMapSites(room,floors),markers=room.players.filter(m=>!m.departed&&m.id!==playerId&&(room.mode==='coop'||room.variant==='tdm'&&m.team===p?.team)).map(m=>({id:m.id,position:m.position,floor:escapeFloorAt(m.position,floors),label:m.nickname,down:m.life==='downed'}));
 return <div className="online-map-shade"><section className="online-map-panel" role="dialog" aria-modal="true" aria-label="对局地图"><header><h2>校园地图</h2><p>对局仍在继续</p><button onClick={onClose}>返回对局</button></header><div className="online-map-floors">{[0,...(floors||[]).map(f=>f.id)].map(f=><button key={f} aria-pressed={f===floor} onClick={()=>setFloor(f)}>{f===0?'室外':f+' 层'}</button>)}<button onClick={()=>{if(p){setFloor(escapeFloorAt(p.position,floors));setFocus({key:Date.now(),position:[p.position[0],p.position[2]],zoom:2});}}}>我的位置</button></div><EscapeMapCanvas snapshot={snapshot} floor={floor} focus={focus} onSelect={select} markers={markers}/><footer>{room.tasks.map(t=><button key={t.id} aria-pressed={t.id===tracked} onClick={()=>{select(t.id);const site=sites.find(s=>s.taskId===t.id);if(site){setFloor(site.floor??0);setFocus({key:Date.now(),position:[site.position[0],site.position[2]],zoom:2});}}}>{t.status==='complete'?'✓ ':''}{t.label}</button>)}</footer></section></div>;
}
