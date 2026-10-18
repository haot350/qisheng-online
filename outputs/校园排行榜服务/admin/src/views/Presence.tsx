import {stamp, useLiveResource, type Row} from '../api';
import {Empty, Load, Panel} from '../ui';

export default function Presence() {
  const r = useLiveResource('presence');
  const peak = Math.max(1, ...(r.data?.minutes ?? []).map((m: Row) => m.sessions));
  const labels = [['activeAccounts', '活跃账号'], ['guestSessions', '游客会话'], ['clientSessions', '客户端会话'], ['multiplayerConnected', '联机连接'], ['reservedSeats', '断线保留席位']];
  return <Panel title="当前在线" actions={<button onClick={r.reload}>刷新</button>}>
    <Load loading={r.loading} error={r.data ? '' : r.error} retry={r.reload}>
      {r.data && <>
        <div className="presence-grid">{labels.map(([key, title]) => <article key={key}><span>{title}</span><strong>{r.data![key]}</strong></article>)}</div>
        <p className="muted">{r.data.recovering ? '服务刚刚启动，在线统计正在恢复。' : '活跃以最近90秒前台心跳计算，游客会话不代表独立人数。'} 网页 {r.data.webSessions} · 原生 {r.data.nativeSessions}</p>
        <small className={r.error ? 'status-warning' : 'muted'}>{r.error ? '刷新失败，以下仍为上次成功的数据。' : ''}更新于 {stamp(r.data.checkedAt)}</small>
        {!!r.data.minutes?.length && <details><summary>最近24小时抽样</summary><div className="presence-spark" aria-label="最近活跃会话趋势">{r.data.minutes.slice(-120).map((v: Row) => <i key={v.minute} title={stamp(v.minute)+' · '+v.sessions+' 会话'} style={{height: Math.max(3, v.sessions / peak * 64)}}/>)}</div></details>}
      </>}
      {!r.loading && !r.data && !r.error && <Empty/>}
    </Load>
  </Panel>;
}
