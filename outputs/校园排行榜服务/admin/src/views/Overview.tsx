import Presence from './Presence';
import { useState } from "react";
import {
  has,
  modeName,
  query,
  stamp,
  useResource,
  type Administrator,
  type Row,
} from "../api";
import { Empty, Field, KeyValues, Load, PageTitle, Panel } from "../ui";
export function Overview({ administrator }: { administrator: Administrator }) {
  const r = useResource("overview");
  const cards = [
    ["feedback", "待处理反馈", "feedback", "feedback"],
    ["awaitingVerification", "待验证议题", "issues", "feedback"],
    ["review", "待审核成绩", "rankings", "ranking"],
    ["rooms", "在线房间", "rooms", "rooms"],
    ["disabledModes", "停用玩法", "operations", "operations"],
    ["activeAnnouncements", "当前通知", "operations", "operations"],
    ["recentErrors", "今日错误记录", "stats", "stats"],
  ];
  return (
    <>
      <PageTitle
        eyebrow="齐盛 · 校园游戏"
        title={"你好，" + administrator.name}
      >
        <button onClick={r.reload}>刷新工作台</button>
      </PageTitle>
      <Load loading={r.loading} error={r.error} retry={r.reload}>
        {r.data && (
          <>
            {has(administrator, 'stats') && <Presence/>}
            <div className="dashboard-grid">
              {cards
                .filter((x) => has(administrator, x[3]))
                .map(([key, label, path]) => (
                  <a className={"metric-card"+(["feedback","awaitingVerification","review","recentErrors"].includes(key)&&Number(r.data![key])>0?" needs-attention":"")} href={"#" + path} key={key}>
                    <span>{label}</span>
                    <strong>
                      {Array.isArray(r.data![key])
                        ? r.data![key].length
                        : (r.data![key] ?? "—")}
                    </strong>
                    <small>{["feedback","awaitingVerification","review","recentErrors"].includes(key)?"查看并处理 →":"查看详情 →"}</small>
                  </a>
                ))}
            </div>
            <div className="two-panels">
              <Panel title="优先处理">
                <div className="quick-links">
                  {has(administrator, "feedback") && (
                    <>
                      <a href="#feedback">
                        <strong>回复玩家</strong>
                        <span>读取反馈，记录处理结果并通知提交者。</span>
                      </a>
                      <a href="#issues">
                        <strong>整理公开进展</strong>
                        <span>
                          将重复反馈关联至同一问题，公开经过审核的摘要。
                        </span>
                      </a>
                    </>
                  )}
                  {has(administrator, "operations") && (
                    <a href="#operations">
                      <strong>管理玩法与通知</strong>
                      <span>调整入口状态，向玩家说明维护及更新。</span>
                    </a>
                  )}
                  {has(administrator, "publish") && (
                    <a href="#releases">
                      <strong>核对上线版本</strong>
                      <span>查看部署复检记录与公开更新说明。</span>
                    </a>
                  )}
                </div>
              </Panel>
              <Panel title="服务概况">
                <KeyValues
                  items={{
                    新开局:
                      r.data.maintenance === undefined
                        ? "无查看权限"
                        : r.data.maintenance
                          ? "部署维护中"
                          : "正常开放",
                    ...(r.data.todayViews !== undefined
                      ? { 今日页面访问: r.data.todayViews }
                      : {}),
                    ...(r.data.players !== undefined
                      ? { 已建立玩家身份: r.data.players }
                      : {}),
                    ...(r.data.databaseBytes !== undefined
                      ? {
                          数据库占用:
                            (r.data.databaseBytes / 1e6).toFixed(1) + " MB",
                        }
                      : {}),
                  }}
                />
                {Array.isArray(r.data.disabledModes) &&
                  r.data.disabledModes.length > 0 && (
                    <p className="warning-box">
                      暂时关闭：
                      {r.data.disabledModes
                        .map(
                          (m: string | Row) =>
                            modeName[typeof m === "string" ? m : m.entry ?? m.id] ??
                            (typeof m === "string" ? m : m.entry ?? m.id),
                        )
                        .join("、")}
                    </p>
                  )}
                {has(administrator, "stats") && (
                  <a className="text-link" href="#stats">
                    查看访问与故障 →
                  </a>
                )}
              </Panel>
            </div>
          </>
        )}
      </Load>
    </>
  );
}
const events: Record<string, string> = {
  "page-view": "页面访问",
  "session-start": "估计访问会话",
  "mode-start": "玩法进入",
  error: "错误记录",
  "connection-error": "连接错误",
  "load-error": "加载错误",
};
export function Stats() {
  const [days, setDays] = useState(30),
    [filters,setFilters]=useState({version:'',mode:'',platform:''}),
    r = useResource("stats?"+query({days,...filters}));
  return (
    <>
      <PageTitle eyebrow="聚合数据" title="访问与故障">
        <button onClick={r.reload}>刷新</button>
      </PageTitle>
      <div className="filter-bar">
        <Field label="时间范围">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>最近7天</option>
            <option value={30}>最近30天</option>
            <option value={90}>最近90天</option>
            <option value={365}>最近一年</option>
          </select>
        </Field>
        {(['version','mode','platform'] as const).map(key=><Field key={key} label={{version:'版本',mode:'玩法',platform:'设备'}[key]}><select value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}><option value="">全部</option>{(r.data?.choices?.[key]??[]).map((x:Row)=><option key={x.value} value={x.value}>{modeName[x.value]??x.value}</option>)}</select></Field>)}
        <p className="muted">会话为估算次数，同一玩家可能产生多个会话。</p>
      </div>
      <Load loading={r.loading} error={r.error} retry={r.reload}>
        {r.data && (
          <>
            <Panel title="每日趋势图"><Trend rows={r.data.daily}/></Panel>
            <div className="dashboard-grid compact">
              {Object.entries(events)
                .slice(0, 4)
                .map(([event, label]) => (
                  <div className="metric-card" key={event}>
                    <span>{label}</span>
                    <strong>
                      {r
                        .data!.daily.filter((d: Row) => d.event === event)
                        .reduce((n: number, d: Row) => n + d.count, 0)}
                    </strong>
                  </div>
                ))}
            </div>
            <div className="two-panels">
              <Panel title="每日趋势">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>类型</th>
                        <th>次数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.data.daily.map((x: Row, i: number) => (
                        <tr key={i}>
                          <td>{x.day}</td>
                          <td>{events[x.event] ?? x.event}</td>
                          <td>{x.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!r.data.daily.length && <Empty>所选时间内没有数据。</Empty>}
              </Panel>
              <div>
                {[
                  ["pages", "页面", "page"],
                  ["devices", "设备", "platform"],
                  ["modes", "玩法", "mode"],
                ].map(([key, title, label]) => (
                  <Panel title={title} key={key}>
                    <div className="stat-list">
                      {r.data![key].length ? (
                        r.data![key].map((x: Row, i: number) => (
                          <div key={i}>
                            <span>
                              {modeName[x[label]] ?? x[label] ?? "未记录"}
                            </span>
                            <strong>{x.count}</strong>
                          </div>
                        ))
                      ) : (
                        <Empty />
                      )}
                    </div>
                  </Panel>
                ))}
              </div>
            </div>
            <Panel title="故障摘要">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>错误摘要</th>
                      <th>版本</th>
                      <th>设备</th>
                      <th>次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.data.errors.map((x: Row, i: number) => (
                      <tr key={i}>
                        <td>{x.code || "未记录代码"}</td>
                        <td>{x.version || "—"}</td>
                        <td>{x.platform || "—"}</td>
                        <td>{x.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!r.data.errors.length && <Empty>所选时间内没有故障记录。</Empty>}
            </Panel>
          </>
        )}
      </Load>
    </>
  );
}
function Trend({rows}:{rows:Row[]}){
  const days=[...new Set(rows.map(r=>String(r.day)))].sort().slice(-90),series=['page-view','session-start','mode-start'],colors=['trend-visits','trend-sessions','trend-modes'];
  if(!days.length)return <Empty>所选条件下没有数据。</Empty>;
  const values=series.map(event=>days.map(day=>rows.filter(r=>r.day===day&&r.event===event).reduce((n,r)=>n+Number(r.count),0))),max=Math.max(1,...values.flat());
  return <div className="trend-chart"><svg role="img" aria-label={'最近'+days.length+'个有记录日的页面访问、访问会话及玩法进入趋势，最高'+max} viewBox="0 0 600 150"><path className="trend-axis" d="M 20 10 V 125 H 580"/>{values.map((v,i)=><polyline key={series[i]} className={colors[i]} points={v.map((count,j)=>(20+j*560/Math.max(1,days.length-1))+','+(125-count*110/max)).join(' ')}/>)}</svg><div className="trend-legend"><span>页面访问</span><span>估计会话</span><span>玩法进入</span></div><p className="muted">{days[0]} 至 {days.at(-1)} · 图中最多显示90个有记录日；详细数字见下表。</p></div>;
}
