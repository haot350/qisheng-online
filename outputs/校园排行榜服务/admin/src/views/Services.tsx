import {stamp,useResource,type Row} from '../api';
import {Empty,KeyValues,Load,PageTitle,Panel} from '../ui';
export default function Services(){
  const r=useResource('services');
  return <><PageTitle eyebrow="只读运行状态" title="服务状态"><button onClick={r.reload}>检查当前状态</button></PageTitle><Load loading={r.loading} error={r.error} retry={r.reload}>{r.data&&<>
    <Panel title="当前入口"><KeyValues items={{目标:r.data.target==='hk'?'香港':r.data.target==='us'?'美国':'本机开发',发行:r.data.release?.id??'未读取到正式发行',版本:r.data.release?.version??'未登记',检查时间:stamp(r.data.checkedAt),API:'正常响应',Node:r.data.api.node,数据库格式:r.data.api.schemaVersion,运行时间:Math.floor(r.data.api.uptimeSeconds/60)+' 分钟'}}/></Panel>
    <div className="service-grid">{r.data.workers.map((w:Row)=><Panel title={'实时工作进程 '+w.id} key={w.id}><p className={w.available?'status-good':'warning-box'}>{w.available?'健康接口已响应':'健康接口暂未响应'}</p><KeyValues items={{版本:w.version??'—',协议:w.protocolVersion??'—',活动战斗房:w.combatRooms??'—',检查时间:stamp(w.checkedAt)}}/>{w.rooms.map((room:Row)=><div className="service-room" key={room.id}><strong>{room.id}</strong><KeyValues items={{阶段:room.state,模拟更新P95:(room.health.tickP95??0).toFixed(2)+' ms',模拟更新P99:(room.health.tickP99??0).toFixed(2)+' ms',工作进程内存:room.health.memoryBytes?Math.round(room.health.memoryBytes/1048576)+' MiB':'—',心跳:stamp(room.updated)}}/></div>)}</Panel>)}</div>
    <p className="muted">健康接口是本次检查；房间数据保留最近30秒心跳。模拟更新时间不等于完整周期或玩家网络延迟。内存是进程值，同一工作进程的多个房间不能相加。</p>
    <Panel title="最近部署复检">{r.data.deployments.length?<div className="table-scroll"><table><thead><tr><th>发行</th><th>版本</th><th>组件</th><th>验证时间</th></tr></thead><tbody>{r.data.deployments.map((d:Row)=><tr key={d.id}><td>{d.id}</td><td>{d.version}</td><td>{d.site}</td><td>{stamp(d.verified)}</td></tr>)}</tbody></table></div>:<Empty/>}</Panel>
  </>}</Load></>;
}
