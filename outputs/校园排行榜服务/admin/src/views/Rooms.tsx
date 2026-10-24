import {useEffect, useState} from 'react';
import {api, modeName, query, roomCommandNotice, roomSnapshotFresh, stamp, stateName, useLiveResource, useSavedState, type Row} from '../api';
import {Badge, Confirm, Dialog, Empty, Field, FormError, KeyValues, Load, PageTitle, Pager, Panel, useNotify} from '../ui';

export default function Rooms() {
  const [filter, setFilter] = useSavedState('rooms-live-filter', {page: 1, view: 'current', state: '', mode: '', search: ''});
  const resource = useLiveResource('rooms?' + query(filter));
  const [action, setAction] = useState<Row | null>(null);
  const [localNow, setLocalNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setLocalNow(Date.now());
    const timer = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {clearInterval(timer); document.removeEventListener('visibilitychange', update);};
  }, []);
  const notify = useNotify();
  const change = (key: string, value: unknown) => setFilter(f => ({...f, [key]: value, page: 1}));
  const select = (item: Row) => setAction({...item, requestId: crypto.randomUUID()});
  const fresh = (row?: Row, now = localNow) => !!resource.data && roomSnapshotFresh(row?.updated ?? resource.data.checkedAt, resource.data.checkedAt, resource.lastSuccessAt, now, resource.lastReadFailed);
  const canManage = (room: Row, now = localNow) => fresh(room, now) && room.actionable;
  const actionAvailable = !action || (action.type === 'maintenance' ? fresh() : canManage(action.room));
  const ensureAction = () => {if (!action || !(action.type === 'maintenance' ? fresh(undefined, Date.now()) : canManage(action.room, Date.now()))) throw Error('房间状态暂未确认，请刷新成功后重新处理。');};
  return <>
    <PageTitle eyebrow="实时服务" title="房间"><button onClick={resource.reload}>刷新</button></PageTitle>
    <div className="room-view-tabs" aria-label="房间范围">{[['current', '当前房间'], ['history', '历史记录']].map(([v, label]) => <button key={v} className={filter.view === v ? 'primary' : ''} onClick={() => change('view', v)}>{label}</button>)}</div>
    <div className="filter-bar">
      <Field label="搜索"><input type="search" value={filter.search} onChange={e => change('search', e.target.value)} placeholder="房间编号或玩家昵称"/></Field>
      <Field label="玩法"><select value={filter.mode} onChange={e => change('mode', e.target.value)}><option value="">全部玩法</option><option value="coop">合作突围</option><option value="pvp">玩家对战</option></select></Field>
      <Field label="状态"><select value={filter.state} onChange={e => change('state', e.target.value)}><option value="">全部状态</option>{['lobby', 'preparing', 'countdown', 'playing', 'paused', 'ended', 'draining', 'closed'].map(s => <option key={s} value={s}>{stateName[s] ?? s}</option>)}</select></Field>
    </div>
    <Panel>
      <Load loading={resource.loading} error={!resource.data ? resource.error : ''} retry={resource.reload}>
        {resource.data && <>
          <div className="maintenance-row"><div><strong>{resource.data.maintenance ? '部署维护：已停止新开局' : '新开局正常开放'}</strong><small>最近更新 {stamp(resource.data.checkedAt)}{!fresh() ? resource.lastReadFailed ? ' · 刷新失败，显示上次数据；操作暂不可用' : ' · 数据已过期，刷新后可操作' : ''}</small></div><button disabled={!fresh()} onClick={() => select({type: 'maintenance', enabled: !resource.data!.maintenance})}>{resource.data.maintenance ? '恢复新开局' : '停止新开局'}</button></div>
          <div className="room-grid">{resource.data.items.map((r: Row) => <article className={'room-card' + (!canManage(r) ? ' room-card-inactive' : '')} key={r.id}>
            <header><div><h2>{r.name || r.id}</h2><small>{r.id}</small></div>{(r.stale || !fresh(r)) && r.state !== 'closed' ? <span className="badge">状态未知</span> : <Badge value={r.state}/>}</header>
            <p>{modeName[r.mode === 'pvp' ? r.variant : r.mode] ?? r.mode} · {r.private ? '私人' : '公开'} · {r.worker}</p>
            {!fresh(r) && <small className="muted">以下为上次记录，连接人数与席位尚未重新确认。</small>}
            <div className="room-seat-summary"><strong>{r.connected}<small>已连接</small></strong><strong>{r.reserved}<small>等待重连</small></strong><strong>{r.occupied}/{r.max_players}<small>席位</small></strong></div>
            <ul className="room-players">{r.players.map((p: Row) => <li key={p.playerId}><div><span>{p.nickname || p.playerId}</span><small>{p.connected ? p.loading ? '加载中' : p.ready ? '已准备' : '在线' : '等待重连'}{p.team && p.team !== 'none' ? ' · ' + (p.team === 'blue' ? '蓝队' : '红队') : ''}</small></div>{canManage(r) && <button onClick={() => select({type: 'player', room: r, player: p})}>管理</button>}</li>)}</ul>
            <details className="room-details"><summary>房间详情</summary><KeyValues items={{更新时间: stamp(r.updated),开始建立: stamp(r.created),比赛时间: r.elapsed === null || r.elapsed === undefined ? '尚未上报' : Math.floor(r.elapsed)+' 秒',难度: stateName[r.difficulty] ?? r.difficulty ?? '—',协议: r.protocolVersion || '尚未上报',完整周期P95: r.health.cycleP95 === undefined ? '尚未上报' : r.health.cycleP95.toFixed(2)+' ms',完整周期P99: r.health.cycleP99 === undefined ? '尚未上报' : r.health.cycleP99.toFixed(2)+' ms',输入年龄: r.health.inputAgeTicks === undefined ? '尚未上报' : r.health.inputAgeTicks+' 步',发送积压: r.health.bufferedBytes === undefined ? '尚未上报' : r.health.bufferedBytes+' B'}}/>{r.map && <div className="room-map-identity">{Object.entries(r.map).map(([k, v]) => <small key={k}>{k}：{String(v)}</small>)}</div>}</details>
            {canManage(r) && <button className="danger" onClick={() => select({type: 'close', room: r})}>{r.state === 'ended' ? '解散房间' : '结束房间'}</button>}
            {!canManage(r) && <small className="muted">{r.state === 'closed' ? '已关闭 · 仅供查看' : '等待工作进程确认状态'}</small>}
          </article>)}</div>
          {!resource.data.items.length && <Empty>没有符合条件的房间。</Empty>}
          <Pager page={filter.page} size={30} total={resource.data.total} count={resource.data.items.length} onChange={page => setFilter(f => ({...f, page}))}/>
        </>}
      </Load>
    </Panel>
    <RoomCommands/>
    {action && (action.type === 'player' ? <RoomPlayer item={action} available={actionAvailable} ensureAction={ensureAction} onClose={() => setAction(null)} onSaved={result => {setAction(null); resource.reload(); notify(roomCommandNotice(result));}}/> : <Confirm
      title={action.type === 'maintenance' ? action.enabled ? '停止新开局' : '恢复新开局' : action.room.state === 'ended' ? '解散房间' : '结束房间'}
      description={!actionAvailable ? '显示的是上次数据，当前操作暂不可用。请取消并刷新房间后重新确认。' : action.type === 'maintenance' ? '已开始的比赛继续进行，玩家无需离开。' : (action.room.name || action.room.id)+' · '+action.room.connected+' 位已连接玩家、'+action.room.reserved+' 个重连席位将离开。正在进行的比赛不会授予胜利。'}
      reason={action.type === 'close'} danger={action.type === 'close'} onClose={() => setAction(null)}
      onConfirm={async reason => {ensureAction(); const result = await api(action.type === 'maintenance' ? 'rooms/maintenance' : 'rooms/'+action.room.id, action.type === 'maintenance' ? {enabled: action.enabled} : {action: 'close', reason, requestId: action.requestId, generation: action.room.generation, expectedRevision: action.room.revision}); resource.reload(); notify(action.type === 'maintenance' ? '新开局设置已更新' : roomCommandNotice(result));}}
    />)}
  </>;
}
function RoomPlayer({item, available, ensureAction, onClose, onSaved}: {item: Row; available: boolean; ensureAction: () => void; onClose: () => void; onSaved: (result: Row) => void}) {
  const [action, setAction] = useState('kick'), [minutes, setMinutes] = useState(60), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <Dialog title={'管理 '+(item.player.nickname || item.player.playerId)} onClose={() => !busy && onClose()} dirty={!!reason || action !== 'kick'}>
    <p>{item.room.name || item.room.id} · 此操作仅影响所选玩家。</p>
    {!available && <p className="warning-box">房间状态暂未确认。请取消并刷新后重新处理。</p>}
    <Field label="处理方式"><select value={action} onChange={e => setAction(e.target.value)}><option value="kick">移出当前房间</option><option value="temp-ban">移出并临时限制联机</option></select></Field>
    {action === 'temp-ban' && <Field label="限制分钟数（5—1440）"><input type="number" min={5} max={1440} value={minutes} onChange={e => setMinutes(Number(e.target.value))}/></Field>}
    <Field label="处理原因"><textarea rows={3} maxLength={200} value={reason} onChange={e => setReason(e.target.value)}/></Field><FormError error={error}/>
    <div className="actions"><button data-dialog-dismiss disabled={busy} onClick={onClose}>取消</button><button className="danger" disabled={busy || !available || reason.trim().length < 4} onClick={async () => {setBusy(true);try {ensureAction(); const result = await api('rooms/'+item.room.id, {action, minutes, reason, playerId: item.player.playerId, requestId: item.requestId, generation: item.room.generation, expectedRevision: item.room.revision});onSaved(result);} catch(e) {setError((e as Error).message);} finally {setBusy(false);}}}>{busy ? '正在提交…' : '确认处理'}</button></div>
  </Dialog>;
}
function RoomCommands() {
  const r = useLiveResource('room-commands');
  const actions: Record<string, string> = {kick: '移出玩家', 'temp-ban': '移出并限制联机', close: '结束／解散房间'};
  const states: Record<string, string> = {queued: '等待执行', executing: '执行中', executed: '已执行', noop: '无需执行', failed: '执行失败', expired: '已过期', legacy: '旧版记录'};
  return <Panel title="操作结果" actions={<button onClick={r.reload}>刷新</button>}><Load loading={r.loading} error={r.data ? '' : r.error} retry={r.reload}>{r.data?.items.length ? <div className="table-scroll"><table><thead><tr><th>房间与操作</th><th>结果</th><th>提交时间</th></tr></thead><tbody>{r.data.items.map((v: Row) => <tr key={v.id}><td>{v.roomId}<small>{actions[v.action] ?? v.action}{v.playerId ? ' · '+v.playerId : ''}</small><small>操作 {v.id}</small></td><td><strong>{states[v.state] ?? v.state}</strong><small>{v.outcome || '最长等待60秒，过期后不会执行。'}</small></td><td>{stamp(v.created)}</td></tr>)}</tbody></table></div> : <Empty>暂无房间操作。</Empty>}</Load>{r.data && <small className="muted">{r.error ? '刷新失败 · ' : ''}更新于 {stamp(r.data.checkedAt)}</small>}</Panel>;
}
