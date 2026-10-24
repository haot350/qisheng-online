import {stamp, useLiveResource} from '../api';
import {Empty, Load, Panel} from '../ui';
import {PRESENCE_SAMPLE_INTERVAL_MS,samplePresenceMinutes} from '../presence-samples';

export default function Presence() {
  const r = useLiveResource('presence');
  const checkedAt=Number(r.data?.checkedAt),samples=samplePresenceMinutes(r.data?.minutes??[],checkedAt);
  const peak = Math.max(1, ...samples.map(m => m.sessions));
  const lastBucket=Math.floor(checkedAt/PRESENCE_SAMPLE_INTERVAL_MS);
  const labels = [['activeAccounts', '活跃账号'], ['guestSessions', '游客会话'], ['clientSessions', '客户端会话'], ['multiplayerConnected', '联机连接'], ['reservedSeats', '断线保留席位']];
  return <Panel title="当前在线" actions={<button onClick={r.reload}>刷新</button>}>
    <Load loading={r.loading} error={r.data ? '' : r.error} retry={r.reload}>
      {r.data && <>
        <div className="presence-grid">{labels.map(([key, title]) => <article key={key}><span>{title}</span><strong>{r.data![key]}</strong></article>)}</div>
        <p className="muted">{r.data.recovering ? '服务刚刚启动，在线统计正在恢复。' : '活跃以最近90秒前台心跳计算，游客会话不代表独立人数。'} 网页 {r.data.webSessions} · 原生 {r.data.nativeSessions}</p>
        <small className={r.error ? 'status-warning' : 'muted'}>{r.error ? '刷新失败，以下仍为上次成功的数据。' : ''}更新于 {stamp(r.data.checkedAt)}</small>
        {!!samples.length && <details><summary>最近24小时 · 每12分钟采样</summary><div className="presence-spark" role="img" aria-label={'活跃会话趋势，'+stamp(samples[0].minute)+' 至 '+stamp(samples.at(-1)!.minute)+'；空白表示没有记录'} style={{display:'grid',gridTemplateColumns:'repeat(120,minmax(0,1fr))'}}>{samples.map(v => <i key={v.minute} title={stamp(v.minute)+' · '+v.sessions+' 会话'} style={{height: Math.max(3, v.sessions / peak * 64),minWidth:0,gridColumn:Math.floor(v.minute/PRESENCE_SAMPLE_INTERVAL_MS)-lastBucket+120}}/>)}</div><p className="muted">每12分钟保留最后一条有效记录，空白表示没有记录。{stamp(samples[0].minute)} 至 {stamp(samples.at(-1)!.minute)}。</p></details>}
      </>}
      {!r.loading && !r.data && !r.error && <Empty/>}
    </Load>
  </Panel>;
}
