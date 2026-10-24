import {WEATHER_VISUALS,type WeatherPreset} from '@qisheng/shared/weather';
import {WeatherChoice,RoomWeather} from '../WeatherChoice';
import {useEffect,useState} from 'react';
import {refreshCurrentPage} from '../fresh-browser';
import type {LobbyView,AvatarId,TeamId} from './shared/protocol';
import type {OnlineUIAction} from './online-ui-actions';
import {weapons,avatars,difficulties,modeName} from './online-ui-format';
import {useDialogFocus} from '../dialog-focus';
import {WeaponLoadout} from '../WeaponLoadout';
import {onlineMembers,playerPrimaryWeapon} from './runtime-state';
import {OnlineResult} from './OnlineBattleUI';
import {lobbyUIState} from './lobby-ui-state';
import './online.css';
export type {OnlineUIAction} from './online-ui-actions';
export {OnlineHelp,OnlineHUD,OnlinePause,OnlineResult,OnlineMinimap,onlineTaskGuidance,onlineInteractionLabel} from './OnlineBattleUI';
export default function MultiplayerUI({view,playerId,onAction,onClose,onIdentity,initialMode='coop',initialVariant='tdm',initialWeather='clear',embedded=false}:{view:LobbyView;playerId:string|null;onAction:(action:OnlineUIAction)=>void;onClose:()=>void;onIdentity?:()=>void;initialMode?:'coop'|'pvp';initialVariant?:'tdm'|'ffa';initialWeather?:WeatherPreset;embedded?:boolean}){
 const [create,setCreate]=useState(false),[code,setCode]=useState(''),[mode,setMode]=useState<'coop'|'pvp'>(initialMode),[variant,setVariant]=useState<'tdm'|'ffa'>(initialVariant),[difficulty,setDifficulty]=useState<'easy'|'standard'|'hard'>('standard'),[maxPlayers,setMaxPlayers]=useState(4),[privateRoom,setPrivate]=useState(false),[title,setTitle]=useState(''),[notice,setNotice]=useState('');
 const [equipmentOpen,setEquipmentOpen]=useState(false),[weather,setWeather]=useState<WeatherPreset>(initialWeather);
 const flow=lobbyUIState(view,playerId),room=flow.showRoom?view.currentRoom:null,me=room?.players.find(p=>p.id===playerId),host=room?.hostId===playerId;
 const retained=flow.phase==='admission-error'||flow.phase==='reconnect-error';
 const close=()=>{if(flow.phase==='leaving')return;if(flow.pending||retained)onAction({type:'leave'});else onClose();};
 const shell=useDialogFocus(!embedded,close,true);
 const members=room?onlineMembers(room):[],listedRooms=view.rooms.filter(r=>r.mode===mode&&(mode==='coop'||r.variant===variant));
 const pendingCopy={
  connecting:['正在连接房间','连接完成后会进入房间准备。','取消连接'],
  queued:['正在等候空位',view.queuePosition?'前方还有 '+view.queuePosition+' 人。':'有空位后会继续加入。','取消等候'],
  reconnecting:['正在回到原房间','正在恢复连接'+(typeof view.reconnectLeft==='number'?'，剩余 '+Math.ceil(view.reconnectLeft)+' 秒。':'。'),'取消重连'],
  checking:['正在核对加入结果','正在确认上一次加入请求，请稍候。','取消核对'],
  leaving:['正在离开房间','席位释放后会返回大厅。','正在离开…'],
  'awaiting-seat':['正在同步房间','收到本人的房间信息后即可继续准备。','取消进入'],
 } as const;
 const pending=flow.pending?pendingCopy[flow.phase as keyof typeof pendingCopy]:null;
 const closeLabel=pending?pending[2]:retained?'返回大厅':room&&['playing','paused'].includes(room.phase)?'返回对局':room?'离开房间':'返回主菜单';
 useEffect(()=>{setEquipmentOpen(false);if(room&&me)setCreate(false);},[room?.roomId,me?.id]);
 const copyCode=async()=>{if(!room)return;try{await navigator.clipboard.writeText(room.inviteCode);setNotice('房间码已复制。');}catch{setNotice('可选中房间码复制。');}};
 const canRetryStart=!!room&&host&&['NOT_READY','CONTROL_PENDING','CONTROL_UNAVAILABLE'].includes(view.errorCode??'');
 return <div className="online-shade"><section ref={shell} className="online-panel tactical-menu" role={embedded?undefined:'dialog'} aria-modal={embedded?undefined:true} aria-labelledby="online-title">
  <header className="online-header"><div><h2 id="online-title">{room?modeName(room):'联机大厅'}</h2></div><button className="online-close" aria-label={closeLabel} disabled={flow.phase==='leaving'} onClick={close}>×</button></header>
  <div className="online-body">
   {pending&&<section className="online-connection-state" role="status" aria-live="polite"><span className="online-connection-pulse" aria-hidden="true"/><h3>{pending[0]}</h3><p>{pending[1]}</p>{flow.canCancel&&<button onClick={close}>{pending[2]}</button>}</section>}
   {!flow.pending&&flow.phase==='admission-error'&&<section className="online-error online-reconnect-error" role="alert"><h3>加入结果尚未确认</h3><p>{view.error||'可以重新核对，或返回大厅。'}</p><div className="online-actions"><button className="online-primary" onClick={()=>onAction({type:'retry'})}>重新核对</button><button onClick={()=>onAction({type:'leave'})}>返回大厅</button></div></section>}
   {!flow.pending&&flow.phase==='reconnect-error'&&<section className="online-error online-reconnect-error" role="alert"><h3>暂时没能回到原房间</h3><p>原席位仍可尝试重连。</p><div className="online-actions"><button className="online-primary" onClick={()=>onAction({type:'reconnect'})}>重试连接</button><button onClick={()=>onAction({type:'leave'})}>返回大厅</button></div></section>}
   {!flow.pending&&flow.phase==='identity-error'&&<section className="online-error" role="alert"><h3>请确认登录账号</h3><p>{view.error||'登录后可以继续加入房间。'}</p><div className="online-actions"><button className="online-primary" onClick={onIdentity}>登录账号</button><button onClick={onClose}>返回主菜单</button></div></section>}
   {!flow.pending&&flow.phase==='map-error'&&<section className="online-error" role="alert"><h3>游戏需要刷新</h3><p>{view.error||'刷新后可使用当前校园资源继续加入。'}</p><div className="online-actions"><button className="online-primary" onClick={()=>void refreshCurrentPage('game')}>刷新游戏</button><button onClick={onClose}>返回主菜单</button></div></section>}
   {flow.phase==='reconnect-expired'&&<section className="online-error" role="alert"><h3>重连席位已结束</h3><p>可以在大厅加入或创建新一局。</p></section>}
   {(flow.phase==='browse'||flow.phase==='room')&&view.error&&<div className="online-error" role="alert"><p>{view.error}</p>{canRetryStart&&<button onClick={()=>onAction({type:'start'})}>重试开始</button>}</div>}
   {flow.showRoom&&room&&me&&<>
    <div className="online-room-line"><span>{room.mode==='coop'?difficulties[room.difficulty]:room.variant==='tdm'?'两队对抗':'各自为战'} · {members.length}/{room.maxPlayers} 人</span><button onClick={()=>void copyCode()}>房间码 <strong>{room.inviteCode}</strong></button></div>
    {notice&&<p className="online-notice" role="status">{notice}</p>}<RoomWeather preset={room.weather?.preset??'clear'}/>
    <div className="online-members">{members.map(p=><article key={p.id} className={p.id===playerId?'is-self':''}><div className={'online-avatar avatar-'+p.avatar} aria-hidden="true"><span>{p.avatar.startsWith('campus')?'校园':'战术'}</span></div><div><strong>{p.nickname}<small>#{p.shortId}</small>{p.id===room.hostId&&<span className="online-host">房主</span>}</strong><p>{weapons[playerPrimaryWeapon(p)]}{room.mode==='pvp'&&room.variant==='tdm'?' · '+(p.team==='blue'?'蓝队':p.team==='red'?'红队':'未选队伍'):''}</p></div><span className="online-member-state">{!p.connected?'连接中断':p.loading?'准备校园资源':p.ready?'已准备':'未准备'}{room.mode==='coop'&&<small>{p.rankConsent?'同意参榜':'不参榜'}</small>}</span></article>)}</div>
    {room.phase==='lobby'&&<section className="online-equipment" aria-label="我的装备"><div className="online-equipment-summary"><div><small>我的装备</small><strong>{weapons[playerPrimaryWeapon(me)]}</strong><span>{avatars[me.avatar]}{room.mode==='pvp'&&room.variant==='tdm'?' · '+(me.team==='blue'?'蓝队':'红队'):''}</span></div><button aria-expanded={equipmentOpen} onClick={()=>setEquipmentOpen(v=>!v)}>{equipmentOpen?'收起装备':'更换装备'}</button></div>{equipmentOpen&&<div className="online-loadout"><WeaponLoadout value={playerPrimaryWeapon(me)} mode={room.mode==='coop'?'coop':room.variant} onChange={weapon=>onAction({type:'loadout',weapon,avatar:me.avatar,team:me.team})}/><label>角色<select aria-label="角色" value={me.avatar} onChange={e=>onAction({type:'loadout',weapon:playerPrimaryWeapon(me),avatar:e.target.value as AvatarId,team:me.team})}>{Object.entries(avatars).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>{room.mode==='pvp'&&room.variant==='tdm'&&<label>队伍<select aria-label="队伍" value={me.team} onChange={e=>onAction({type:'loadout',weapon:playerPrimaryWeapon(me),avatar:me.avatar,team:e.target.value as TeamId})}><option value="blue">蓝队</option><option value="red">红队</option></select></label>}</div>}</section>}
    {room.mode==='coop'&&room.phase==='lobby'&&<label className="online-consent"><input aria-label="本局参加合作排行榜" type="checkbox" checked={me.rankConsent} onChange={e=>onAction({type:'consent',value:e.target.checked})}/><span>本局参加合作排行榜<small>全员同意后，成功撤离的队伍成绩才会提交。</small></span></label>}
    {room.maintenance&&room.phase==='lobby'&&<p className="online-notice" role="status">服务正在更新，完成后即可开始。</p>}
    {room.phase==='lobby'?<div className="online-actions online-room-actions"><button className={!host||!me.ready?'online-primary':undefined} disabled={!me.connected} onClick={()=>onAction({type:'ready',value:!me.ready})}>{me.ready?'取消准备':'准备'}</button>{host&&<button className={me.ready?'online-primary':undefined} disabled={room.maintenance||members.length<2||members.some(p=>!p.ready||!p.connected||p.loading)} onClick={()=>onAction({type:'start'})}>开始本局</button>}<button className="online-leave" onClick={()=>onAction({type:'leave'})}>离开房间</button></div>:room.phase==='preparing'?<div className="online-wait" role="status"><h3>{members.every(p=>!p.loading)?'准备出发 · '+Math.ceil(room.countdown)+' 秒':'准备进入校园'}</h3><p>{members.filter(p=>!p.loading).length}/{members.length} 人已完成加载</p><button onClick={()=>onAction({type:'leave'})}>离开房间</button></div>:room.phase==='ended'?<OnlineResult room={room} playerId={playerId} onAction={onAction} onClose={onClose} inline/>:<div className="online-actions"><button className="online-primary" onClick={onClose}>返回对局</button><button onClick={()=>onAction({type:'leave'})}>离开房间</button></div>}
   </>}
   {flow.showBrowser&&(!playerId?<div className="online-empty"><h3>与同伴一起进入校园</h3><p>登录账号，和同伴一起进入房间。</p><button className="online-primary" onClick={onIdentity}>登录或注册账号</button></div>:<>
    <div className="online-lobby-tools"><button className="online-primary" onClick={()=>setCreate(v=>!v)}>创建房间</button><form onSubmit={e=>{e.preventDefault();if(code.trim())onAction({type:'joinCode',code:code.trim().toUpperCase()});}}><input aria-label="房间码" value={code} maxLength={16} placeholder="输入房间码" autoComplete="off" onChange={e=>setCode(e.target.value)}/><button disabled={!code.trim()}>加入</button></form><button onClick={()=>onAction({type:'refresh'})}>刷新大厅</button></div>
    {create&&<form className="online-create" onSubmit={e=>{e.preventDefault();onAction({type:'create',options:{mode,...(mode==='coop'?{difficulty}:{variant}),private:privateRoom,maxPlayers:Math.min(maxPlayers,mode==='coop'?4:8),weather,title:title.trim()||undefined}});}}>
     <h3>创建房间</h3><div className="online-loadout"><label>玩法<select aria-label="玩法" value={mode} onChange={e=>setMode(e.target.value as 'coop'|'pvp')}><option value="coop">合作突围 · 2—4 人</option><option value="pvp">玩家对战 · 2—8 人</option></select></label>{mode==='coop'?<label>难度<select aria-label="难度" value={difficulty} onChange={e=>setDifficulty(e.target.value as typeof difficulty)}>{Object.entries(difficulties).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>:<label>对战方式<select aria-label="对战方式" value={variant} onChange={e=>setVariant(e.target.value as typeof variant)}><option value="tdm">团队对战</option><option value="ffa">个人混战</option></select></label>}<label>人数上限<select aria-label="人数上限" value={Math.min(maxPlayers,mode==='coop'?4:8)} onChange={e=>setMaxPlayers(Number(e.target.value))}>{Array.from({length:mode==='coop'?3:7},(_,i)=>i+2).map(n=><option key={n} value={n}>{n} 人</option>)}</select></label><label>房间名称<input aria-label="房间名称" value={title} maxLength={40} placeholder="可不填写" onChange={e=>setTitle(e.target.value)}/></label></div>
     <label className="online-consent"><input aria-label="私有房间" type="checkbox" checked={privateRoom} onChange={e=>setPrivate(e.target.checked)}/><span>私有房间<small>仅通过房间码加入，不显示在大厅。</small></span></label><WeatherChoice value={weather} onChange={setWeather}/>
     <div className="online-actions"><button className="online-primary">创建并进入</button><button type="button" onClick={()=>setCreate(false)}>取消</button></div>
    </form>}
    <div className="online-room-list">{listedRooms.map(listed=><button key={listed.roomId} disabled={listed.players>=listed.maxPlayers||listed.phase!=='lobby'&&!(listed.mode==='pvp'&&listed.phase==='playing')} onClick={()=>onAction({type:'join',roomId:listed.roomId})}><span><strong>{listed.title||modeName(listed)}</strong><small>{modeName(listed)} · {WEATHER_VISUALS[listed.weather??'clear'].label}{listed.mode==='coop'?' · '+difficulties[listed.difficulty]:''}</small></span><span>{listed.players}/{listed.maxPlayers}</span><span>{listed.phase==='lobby'?'加入':listed.phase==='playing'?'进行中':'准备中'} ↗</span></button>)}</div>
    {!listedRooms.length&&<p className="online-empty">暂时没有可加入的公开房间。创建一个，或输入同伴的房间码。</p>}
   </>)}
  </div>
  {flow.showBrowser&&<footer className="online-footer"><span>合作完成行动任务，或与同伴进行玩家对战。</span><button onClick={close}>返回主菜单</button></footer>}
 </section></div>;
}
