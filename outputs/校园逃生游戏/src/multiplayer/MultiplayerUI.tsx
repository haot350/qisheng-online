import {WEATHER_VISUALS,type WeatherPreset} from '@qisheng/shared/weather';
import {WeatherChoice,RoomWeather} from '../WeatherChoice';
import {useEffect,useState} from 'react';
import {refreshCurrentPage} from '../fresh-browser';
import type {LobbyView,AvatarId,TeamId} from './shared/protocol';
import type {OnlineUIAction} from './online-ui-actions';
import {weapons,avatars,difficulties,modeName} from './online-ui-format';
import {useDialogFocus} from '../dialog-focus';
import {WeaponLoadout} from '../WeaponLoadout';
import {MenuChoice} from '../MenuChoice';
import {useUIPresentation} from '@qisheng/shared/ui';
import styles from './MultiplayerUI.module.css';
import {staticAssetUrl} from '../static-assets';
import {onlineMembers,playerPrimaryWeapon} from './runtime-state';
import {OnlineResult} from './OnlineBattleUI';
import {lobbyUIState} from './lobby-ui-state';
const ui=(names:string|undefined)=>names?.split(/\s+/).filter(Boolean).map(name=>styles[name]).filter(Boolean).join(' ');
export type {OnlineUIAction} from './online-ui-actions';
export {OnlineHelp,OnlineHUD,OnlinePause,OnlineResult,OnlineMinimap,onlineTaskGuidance,onlineInteractionLabel} from './OnlineBattleUI';
export default function MultiplayerUI({view,playerId,onAction,onClose,onIdentity,initialMode='coop',initialVariant='tdm',initialWeather='clear',embedded=false}:{view:LobbyView;playerId:string|null;onAction:(action:OnlineUIAction)=>void;onClose:()=>void;onIdentity?:()=>void;initialMode?:'coop'|'pvp';initialVariant?:'tdm'|'ffa';initialWeather?:WeatherPreset;embedded?:boolean}){
 const presentation=useUIPresentation();
 const [lobbyTab,setLobbyTab]=useState<'browse'|'create'|'code'>('browse'),[code,setCode]=useState(''),[mode,setMode]=useState<'coop'|'pvp'>(initialMode),[variant,setVariant]=useState<'tdm'|'ffa'>(initialVariant),[difficulty,setDifficulty]=useState<'easy'|'standard'|'hard'>('standard'),[maxPlayers,setMaxPlayers]=useState(4),[privateRoom,setPrivate]=useState(false),[title,setTitle]=useState(''),[notice,setNotice]=useState('');
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
 useEffect(()=>{setEquipmentOpen(false);if(room&&me)setLobbyTab('browse');},[room?.roomId,me?.id]);
 const copyCode=async()=>{if(!room)return;try{await navigator.clipboard.writeText(room.inviteCode);setNotice('房间码已复制。');}catch{setNotice('可选中房间码复制。');}};
 const canRetryStart=!!room&&host&&['NOT_READY','CONTROL_PENDING','CONTROL_UNAVAILABLE'].includes(view.errorCode??'');
 return <div className={ui('online-shade')} data-embedded={embedded} data-ui-theme="tactical" data-ui-platform={presentation.platform} data-ui-orientation={presentation.orientation}><section ref={shell} className={ui('online-panel online-lobby-panel')} data-online-lobby role={embedded?undefined:'dialog'} aria-modal={embedded?undefined:true} aria-labelledby="online-title">
  <header className={ui('online-header')}><div><h2 id="online-title">{room?modeName(room):'联机大厅'}</h2></div>{!flow.pending&&!retained&&(!room||['playing','paused'].includes(room.phase))&&<button className={ui('online-close')} onClick={close}>← {closeLabel}</button>}</header>
  <div className={ui('online-body')}>
   {pending&&<section className={ui('online-connection-state')} role="status" aria-live="polite"><span className={ui('online-connection-pulse')} aria-hidden="true"/><h3>{pending[0]}</h3><p>{pending[1]}</p>{flow.canCancel&&<button onClick={close}>{pending[2]}</button>}</section>}
   {!flow.pending&&flow.phase==='admission-error'&&<section className={ui('online-error online-reconnect-error')} role="alert"><h3>加入结果尚未确认</h3><p>{view.error||'可以重新核对，或返回大厅。'}</p><div className={ui('online-actions')}><button className={ui('online-primary')} onClick={()=>onAction({type:'retry'})}>重新核对</button><button onClick={()=>onAction({type:'leave'})}>返回大厅</button></div></section>}
   {!flow.pending&&flow.phase==='reconnect-error'&&<section className={ui('online-error online-reconnect-error')} role="alert"><h3>暂时没能回到原房间</h3><p>原席位仍可尝试重连。</p><div className={ui('online-actions')}><button className={ui('online-primary')} onClick={()=>onAction({type:'reconnect'})}>重试连接</button><button onClick={()=>onAction({type:'leave'})}>返回大厅</button></div></section>}
   {!flow.pending&&flow.phase==='identity-error'&&<section className={ui('online-error')} role="alert"><h3>请确认登录账号</h3><p>{view.error||'登录后可以继续加入房间。'}</p><div className={ui('online-actions')}><button className={ui('online-primary')} onClick={onIdentity}>登录账号</button><button onClick={onClose}>返回主菜单</button></div></section>}
   {!flow.pending&&flow.phase==='map-error'&&<section className={ui('online-error')} role="alert"><h3>游戏需要刷新</h3><p>{view.error||'刷新后可使用当前校园资源继续加入。'}</p><div className={ui('online-actions')}><button className={ui('online-primary')} onClick={()=>void refreshCurrentPage('game')}>刷新游戏</button><button onClick={onClose}>返回主菜单</button></div></section>}
   {flow.phase==='reconnect-expired'&&<section className={ui('online-error')} role="alert"><h3>重连席位已结束</h3><p>可以在大厅加入或创建新一局。</p></section>}
   {(flow.phase==='browse'||flow.phase==='room')&&view.error&&<div className={ui('online-error')} role="alert"><p>{view.error}</p>{canRetryStart&&<button onClick={()=>onAction({type:'start'})}>重试开始</button>}</div>}
   {flow.showRoom&&room&&me&&<>
    <div className={ui('online-room-line')}><div><span>{room.mode==='coop'?difficulties[room.difficulty]:room.variant==='tdm'?'两队对抗':'各自为战'}</span><span>{members.length} / {room.maxPlayers} 人</span></div><button onClick={()=>void copyCode()} aria-label="复制房间码"><strong>{room.inviteCode}</strong><small>复制房间码</small></button></div>
    {notice&&<p className={ui('online-notice')} role="status">{notice}</p>}<RoomWeather preset={room.weather?.preset??'clear'}/>
    <div className={ui('online-room-layout'+(room.phase==='lobby'?'':' is-live'))} data-equipment-open={equipmentOpen}><section className={ui('online-room-roster')}><h3 className={ui('online-roster-heading')}>房间成员</h3><div className={ui('online-members')}>{members.map(p=><article key={p.id} className={ui(p.id===playerId?'is-self':'')}><div className={ui('online-avatar')} aria-hidden="true">{Array.from(p.nickname)[0]||'齐'}</div><div><strong>{p.nickname}<small>#{p.shortId}</small>{p.id===room.hostId&&<span className={ui('online-host')}>房主</span>}</strong><p>{weapons[playerPrimaryWeapon(p)]}{room.mode==='pvp'&&room.variant==='tdm'?<span className={ui('online-member-team')}>{p.team==='blue'?'蓝队':p.team==='red'?'红队':'未选队伍'}</span>:null}</p></div><span className={ui('online-member-state')}>{!p.connected?'连接中断':p.loading?'准备校园资源':p.ready?'准备完成':'尚未准备'}{room.mode==='coop'&&<small>{p.rankConsent?'同意参榜':'不参榜'}</small>}</span></article>)}</div></section>
    {room.phase==='lobby'&&<aside className={ui('online-room-gear')}><section className={ui('online-equipment')} data-open={equipmentOpen} aria-label="我的装备"><div className={ui('online-equipment-summary')}><div><strong>{weapons[playerPrimaryWeapon(me)]}</strong><span>{avatars[me.avatar].replace(' · ',' ')}{room.mode==='pvp'&&room.variant==='tdm'?<span>{me.team==='blue'?'蓝队':'红队'}</span>:null}</span></div><button aria-expanded={equipmentOpen} onClick={()=>setEquipmentOpen(v=>!v)}>{equipmentOpen?'收起装备':'更换装备'}</button></div>{!equipmentOpen&&<img className={ui('online-current-weapon')} src={staticAssetUrl('/weapon-cards/'+playerPrimaryWeapon(me)+'.webp')} alt=""/>}{equipmentOpen&&<div className={ui('online-loadout')}><WeaponLoadout value={playerPrimaryWeapon(me)} mode={room.mode==='coop'?'coop':room.variant} onChange={weapon=>onAction({type:'loadout',weapon,avatar:me.avatar,team:me.team})} disabled={!me.connected||me.loading}/><div className={ui('online-character-options')}><MenuChoice label="角色" value={me.avatar} disabled={!me.connected||me.loading} onChange={avatar=>onAction({type:'loadout',weapon:playerPrimaryWeapon(me),avatar:avatar as AvatarId,team:me.team})} options={Object.entries(avatars).map(([value,label])=>({value,label:label.replace(' · ',' ')}))}/>{room.mode==='pvp'&&room.variant==='tdm'&&<MenuChoice label="队伍" value={me.team} disabled={!me.connected||me.loading} onChange={team=>onAction({type:'loadout',weapon:playerPrimaryWeapon(me),avatar:me.avatar,team:team as TeamId})} options={[{value:'blue',label:'蓝队'},{value:'red',label:'红队'}]}/>}</div></div>}</section>
    {room.mode==='coop'&&<label className={ui('online-consent')}><input aria-label="本局参加合作排行榜" type="checkbox" checked={me.rankConsent} onChange={e=>onAction({type:'consent',value:e.target.checked})}/><span>本局参加合作排行榜<small>全员同意后，成功撤离的队伍成绩才会提交。</small></span></label>}</aside>}</div>
    {room.maintenance&&room.phase==='lobby'&&<p className={ui('online-notice')} role="status">服务正在更新，完成后即可开始。</p>}
    {room.phase==='lobby'?<div className={ui('online-actions online-room-actions'+(host?' is-host':''))}><button className={ui(!host||!me.ready?'online-primary':undefined)} disabled={!me.connected} onClick={()=>onAction({type:'ready',value:!me.ready})}>{me.ready?'取消准备':'准备'}</button>{host&&<button className={ui(me.ready?'online-primary':undefined)} disabled={room.maintenance||members.length<2||members.some(p=>!p.ready||!p.connected||p.loading)} onClick={()=>onAction({type:'start'})}>开始本局</button>}<button className={ui('online-leave')} onClick={()=>onAction({type:'leave'})}>离开房间</button></div>:room.phase==='preparing'?<div className={ui('online-wait')} role="status"><h3>{members.every(p=>!p.loading)?'准备出发，'+Math.ceil(room.countdown)+' 秒':'准备进入校园'}</h3><p>{members.filter(p=>!p.loading).length}/{members.length} 人已完成加载</p><button onClick={()=>onAction({type:'leave'})}>离开房间</button></div>:room.phase==='ended'?<OnlineResult room={room} playerId={playerId} onAction={onAction} onClose={onClose} inline/>:<div className={ui('online-actions')}><button className={ui('online-primary')} onClick={onClose}>返回对局</button><button onClick={()=>onAction({type:'leave'})}>离开房间</button></div>}
   </>}
   {flow.showBrowser&&(!playerId?<div className={ui('online-empty')}><h3>与同伴一起进入校园</h3><p>登录账号，和同伴一起进入房间。</p><button className={ui('online-primary')} onClick={onIdentity}>登录或注册账号</button></div>:<>
    <div className={ui('online-lobby-tools')}><nav className={ui('online-lobby-tabs')} aria-label="大厅页面">{([['browse','寻找房间'],['create','创建房间'],['code','房间码加入']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={lobbyTab===id} onClick={()=>setLobbyTab(id)}>{label}</button>)}</nav>{lobbyTab==='browse'&&<button className={ui('online-refresh')} onClick={()=>onAction({type:'refresh'})}>刷新大厅</button>}</div>
    {lobbyTab==='browse'&&<div className={ui('online-filter-row')} role="group" aria-label="房间玩法"><button type="button" aria-pressed={mode==='coop'} onClick={()=>setMode('coop')}>合作突围</button><button type="button" aria-pressed={mode==='pvp'&&variant==='tdm'} onClick={()=>{setMode('pvp');setVariant('tdm');}}>团队对战</button><button type="button" aria-pressed={mode==='pvp'&&variant==='ffa'} onClick={()=>{setMode('pvp');setVariant('ffa');}}>个人混战</button></div>}
    {lobbyTab==='code'&&<form className={ui('online-code-form')} onSubmit={e=>{e.preventDefault();if(code.trim())onAction({type:'joinCode',code:code.trim().toUpperCase()});}}><label htmlFor="online-invite-code">房间码</label><input id="online-invite-code" aria-label="房间码" value={code} maxLength={16} placeholder="输入同伴的房间码" autoComplete="off" onChange={e=>setCode(e.target.value)}/><button className={ui('online-primary')} disabled={!code.trim()}>加入房间</button></form>}
    {lobbyTab==='create'&&<form className={ui('online-create')} aria-label="创建房间" onSubmit={e=>{e.preventDefault();onAction({type:'create',options:{mode,...(mode==='coop'?{difficulty}:{variant}),private:privateRoom,maxPlayers:Math.min(maxPlayers,mode==='coop'?4:8),weather,title:title.trim()||undefined}});}}>
     <label>房间名称<input aria-label="房间名称" value={title} maxLength={40} placeholder="可不填写" onChange={e=>setTitle(e.target.value)}/></label>
     <fieldset className={ui('online-form-choice')}><legend>玩法</legend><div className={ui('online-filter-row')}><button type="button" aria-pressed={mode==='coop'} onClick={()=>setMode('coop')}>合作突围</button><button type="button" aria-pressed={mode==='pvp'&&variant==='tdm'} onClick={()=>{setMode('pvp');setVariant('tdm');}}>团队对战</button><button type="button" aria-pressed={mode==='pvp'&&variant==='ffa'} onClick={()=>{setMode('pvp');setVariant('ffa');}}>个人混战</button></div></fieldset>
     <div className={ui('online-create-fields')}>{mode==='coop'&&<label>难度<select aria-label="难度" value={difficulty} onChange={e=>setDifficulty(e.target.value as typeof difficulty)}>{Object.entries(difficulties).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}<label>人数上限<select aria-label="人数上限" value={Math.min(maxPlayers,mode==='coop'?4:8)} onChange={e=>setMaxPlayers(Number(e.target.value))}>{Array.from({length:mode==='coop'?3:7},(_,i)=>i+2).map(n=><option key={n} value={n}>{n} 人</option>)}</select></label></div>
     <label className={ui('online-consent')}><input aria-label="私有房间" type="checkbox" checked={privateRoom} onChange={e=>setPrivate(e.target.checked)}/><span>私有房间<small>仅通过房间码加入，不显示在大厅。</small></span></label><WeatherChoice value={weather} onChange={setWeather}/>
     <div className={ui('online-actions online-create-actions')}><button className={ui('online-primary')}>创建并进入</button><button type="button" onClick={()=>setLobbyTab('browse')}>取消</button></div>
    </form>}
    {lobbyTab==='browse'&&<>
    <div className={ui('online-room-list')}>{listedRooms.map(listed=><button key={listed.roomId} disabled={listed.players>=listed.maxPlayers||listed.phase!=='lobby'&&!(listed.mode==='pvp'&&listed.phase==='playing')} onClick={()=>onAction({type:'join',roomId:listed.roomId})}><span><strong>{listed.title||modeName(listed)}</strong><small><span>{modeName(listed)}</span><span>{WEATHER_VISUALS[listed.weather??'clear'].label}</span>{listed.mode==='coop'&&<span>{difficulties[listed.difficulty]}</span>}</small></span><span>{listed.players}/{listed.maxPlayers}</span><span>{listed.phase==='lobby'?'加入':listed.phase==='playing'?'进行中':'准备中'}</span></button>)}</div>
    {!listedRooms.length&&<p className={ui('online-empty')}>暂时没有可加入的公开房间。创建一个，或输入同伴的房间码。</p>}
    </>}
   </>)}
  </div>

 </section></div>;
}
