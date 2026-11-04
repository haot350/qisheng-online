import {memo,useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useUIPresentation} from '@qisheng/shared/ui';
import {useAccountAppearances} from '@qisheng/shared/community/appearance';
import {AccountAvatar} from '@qisheng/shared/community/AccountAvatar';
import {rankingClient} from '../ranking/client';
import type {OnlineDiagnostics} from '../types';
import type {RoomSnapshot} from './shared/protocol';
import {roomRoster} from './shared/wire';
import {TeamIdentity} from '../TeamIdentity';
import {clock} from './online-ui-format';
import {bindScoreboardKeyboard} from './scoreboard-input';
import {scoreboardView,sameScoreboard,scoreboardNetwork,sameScoreboardNetwork,SCOREBOARD_INTERVAL_MS,SCOREBOARD_NETWORK_INTERVAL_MS,type ScoreboardView,type ScoreboardNetwork} from './scoreboard-state';
import styles from './OnlineScoreboard.module.css';

const ScoreboardPanel=memo(function ScoreboardPanel({view,network,touch,onClose,onConnection}:{view:ScoreboardView;network:ScoreboardNetwork|null;touch:boolean;onClose:()=>void;onConnection?:()=>void}){
 const presentation=useUIPresentation(),ids=view.groups.flatMap(group=>group.rows.map(p=>p.id)),appearances=useAccountAppearances(rankingClient,ids);
 const columns=view.mode==='coop'?['击倒','助攻','爆头']:['击倒','死亡','助攻'];
 return createPortal(<div className={styles.overlay} data-ui-theme="tactical" data-ui-platform={presentation.platform} data-ui-orientation={presentation.orientation} data-touch={touch}>
  <section className={styles.panel} role="region" aria-label="当前战况" onPointerDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
   <header className={styles.header}><h2>{view.mode==='coop'?'合作突围':view.mode==='tdm'?'团队对战':'个人混战'}</h2><time>{clock(view.remaining)}</time><button aria-label="关闭战况" onPointerDown={e=>e.preventDefault()} onClick={onClose}>关闭</button></header>
   <div className={styles.body} data-team={view.mode==='tdm'}>{view.groups.map(group=><section className={styles.group} key={group.id}>
    {view.mode==='tdm'&&<header className={styles.teamHeader}><TeamIdentity team={group.id as 'blue'|'red'|'none'}/>{group.score!==null&&<strong>{group.score}</strong>}</header>}
    <table><thead><tr>{view.mode==='ffa'&&<th scope="col" className={styles.rank}>名次</th>}<th scope="col" className={styles.playerColumn}>玩家</th>{columns.map(label=><th key={label} scope="col">{label}</th>)}<th scope="col" className={styles.latency}>延迟</th></tr></thead>
     <tbody>{group.rows.map(p=>{const appearance=appearances.get(p.id);return <tr key={p.id} data-self={p.self} data-departed={p.departed}>{view.mode==='ffa'&&<td className={styles.rank}>{p.rank}</td>}<th scope="row" className={styles.playerColumn}><div className={styles.identity}><AccountAvatar name={p.nickname} size={30} avatar={appearance?.avatar} image={appearance?.avatarImage} client={rankingClient}/><span><strong>{p.nickname}</strong><small>{p.status}</small></span></div></th>{p.values.map((value,i)=><td key={i}>{value}</td>)}<td className={styles.latency}>{p.ping}</td></tr>;})}</tbody>
    </table>
   </section>)}</div>
   <footer className={styles.footer}><dl><div><dt>往返延迟</dt><dd>{network?.rtt??'—'}</dd></div><div><dt>延迟波动</dt><dd>{network?.jitter??'—'}</dd></div></dl><span className={styles.connection} data-poor={network?.poor}>{network?.label??'等待连接数据'}</span>{onConnection&&<button onPointerDown={e=>e.preventDefault()} onClick={onConnection}>连接详情</button>}</footer>
  </section>
 </div>,document.body);
});
export function OnlineScoreboard({room,playerId,diagnostics,touch,onConnection}:{room:RoomSnapshot;playerId:string|null;diagnostics?:OnlineDiagnostics;touch:boolean;onConnection?:()=>void}){
 const [held,setHeld]=useState(false),[toggled,setToggled]=useState(false),[view,setView]=useState<ScoreboardView|null>(null),[network,setNetwork]=useState<ScoreboardNetwork|null>(null);
 const latest=useRef({room,playerId,diagnostics,onConnection});latest.current={room,playerId,diagnostics,onConnection};
 const opened=held||toggled;
 const close=useCallback(()=>{setHeld(false);setToggled(false);},[]);
 const openConnection=useCallback(()=>{close();latest.current.onConnection?.();},[close]);
 useEffect(()=>bindScoreboardKeyboard(setHeld,{enabled:()=>latest.current.room.phase==='playing'}),[room.roomId]);
 useEffect(()=>{const reset=()=>{setHeld(false);setToggled(false);},hidden=()=>{if(document.hidden)reset();};window.addEventListener('blur',reset);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',hidden);};},[]);
 useEffect(()=>{setHeld(false);setToggled(false);},[room.roomId]);
 useLayoutEffect(()=>{
  if(!opened)return;
  const read=()=>{const next=latest.current,nextView=scoreboardView(next.room,roomRoster(next.room),next.playerId);setView(old=>sameScoreboard(old,nextView)?old:nextView);};
  const readNetwork=()=>{const current=latest.current,measured=roomRoster(current.room).some(p=>p.id===current.playerId&&p.ping>0),next=scoreboardNetwork(current.diagnostics,measured);setNetwork(old=>sameScoreboardNetwork(old,next)?old:next);};
  read();readNetwork();const rows=setInterval(read,SCOREBOARD_INTERVAL_MS),net=setInterval(readNetwork,SCOREBOARD_NETWORK_INTERVAL_MS);
  return()=>{clearInterval(rows);clearInterval(net);};
 },[opened,room.roomId]);
 return <span className={styles.control}><button className={styles.trigger} aria-label="查看战况" aria-expanded={opened} onPointerDown={e=>e.preventDefault()} onClick={()=>setToggled(v=>!v)}><span>战况{!touch&&<kbd>Tab</kbd>}</span><strong>{clock(room.remaining)}</strong></button>{opened&&view?.roomId===room.roomId&&<ScoreboardPanel view={view} network={network} touch={touch} onClose={close} onConnection={onConnection?openConnection:undefined}/>}</span>;
}
