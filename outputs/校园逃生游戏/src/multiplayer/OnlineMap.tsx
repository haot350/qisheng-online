import { useEffect,useState } from 'react';
import { EscapeMapCanvas,type EscapeMapFocus } from '../EscapeMapCanvas';
import { escapeFloorAt } from '../escape-floor';
import {MapFloorNavigation} from '../MapFloorNavigation';
import {mapBuildingIdAt} from '../map-space-ui';
import {useUIPresentation} from '@qisheng/shared/ui';
import {useDialogFocus} from '../dialog-focus';
import styles from './OnlineMap.module.css';
import { gameMapManifest } from '../game-map';
import type { MapManifest,Snapshot } from '../types';
import type { RoomSnapshot } from './shared/protocol';
import { onlineMapSnapshot } from './task-map';
export function OnlineMap({room,playerId,onClose,selectedTaskId,stairGuide}:{room:RoomSnapshot;playerId:string|null;onClose:()=>void;selectedTaskId?:string;onSelectTask?:(id:string)=>void;stairGuide?:Snapshot['onlineStairGuide']}){
 const presentation=useUIPresentation(),dialog=useDialogFocus(true,onClose,true);
 const [buildingId,setBuildingId]=useState(mapBuildingIdAt(room.players.find(p=>p.id===playerId)?.position));
 const [floors,setFloors]=useState<MapManifest['floors']>([]),[floor,setFloor]=useState(0),[focus,setFocus]=useState<EscapeMapFocus>({key:0});
 useEffect(()=>{const abort=new AbortController();void gameMapManifest(abort.signal).then((m:MapManifest)=>{setFloors(m.floors);const p=room.players.find(p=>p.id===playerId);if(p)setFloor(escapeFloorAt(p.position,m.floors));}).catch(()=>{});return()=>abort.abort();},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code==='KeyM'){e.preventDefault();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
 const tracked=selectedTaskId,p=room.players.find(p=>p.id===playerId),snapshot=onlineMapSnapshot(room,playerId,tracked,floors),markers=room.players.filter(m=>!m.departed&&m.id!==playerId&&(room.mode==='coop'||room.variant==='tdm'&&m.team===p?.team)).map(m=>({id:m.id,position:m.position,floor:escapeFloorAt(m.position,floors),label:m.nickname,down:m.life==='downed'}));
 snapshot.escape!.stairGuide=stairGuide;
 return <div className={styles.shade} data-ui-theme="tactical" data-ui-platform={presentation.platform} data-ui-orientation={presentation.orientation}><section ref={dialog} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="online-map-title"><header className={styles.header}><div><h2 id="online-map-title">校园地图</h2><p>对局仍在继续</p></div><button className={styles.return} onClick={onClose}>返回对局 <span aria-hidden="true">↗</span></button></header><div className={styles.tools}><MapFloorNavigation buildingId={buildingId} floor={floor} onBuilding={setBuildingId} onFloor={setFloor}/><button className={styles.locate} disabled={!p} onClick={()=>{if(p){setBuildingId(mapBuildingIdAt(p.position));setFloor(escapeFloorAt(p.position,floors));setFocus({key:Date.now(),position:[p.position[0],p.position[2]],zoom:2});}}}>我的位置</button></div><div className={styles.body} data-has-tasks={room.tasks.length>0}><div className={styles.canvas}><EscapeMapCanvas snapshot={snapshot} floor={floor} buildingId={buildingId} focus={focus} markers={markers}/></div>{room.tasks.length>0&&<aside className={styles.objectives} aria-label="行动任务">{!tracked&&!room.extraction.available&&room.tasks.some(t=>t.status!=='complete')&&<p role="status">暂未找到路线，可在地图查看任务位置。</p>}{room.tasks.map(t=><article key={t.id} data-current={t.id===tracked}><span aria-hidden="true">{t.status==='complete'?'✓':room.tasks.indexOf(t)+1}</span><strong>{t.label}</strong></article>)}</aside>}</div></section></div>;
}
