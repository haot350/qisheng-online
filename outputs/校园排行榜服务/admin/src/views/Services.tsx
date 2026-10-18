import {stamp,stateName,useLiveResource,type Row} from '../api';
import {Empty,KeyValues,Load,PageTitle,Panel} from '../ui';
export default function Services(){
  const r=useLiveResource('services');
  return <><PageTitle eyebrow="只读运行状态" title="服务状态"><button onClick={r.reload}>检查当前状态</button></PageTitle><Load loading={r.loading} error={r.data?'':r.error} retry={r.reload}>{r.data&&<>
    <Panel title="当前入口"><KeyValues items={{目标:r.data.target==='hk'?'香港':r.data.target==='us'?'美国':'本机开发',发行:r.data.release?.id??'未读取到正式发行',版本:r.data.release?.version??'未登记',检查时间:stamp(r.data.checkedAt),API:'正常响应',Node:r.data.api.node,数据库格式:r.data.api.schemaVersion,运行时间:Math.floor(r.data.api.uptimeSeconds/60)+' 分钟'}}/></Panel>
    <div className="service-grid">{r.data.workers.map((w:Row)=><Panel title={'实时工作进程 '+w.id} key={w.id}><p className={w.available?'status-good':'warning-box'}>{w.available?'健康接口已响应':'健康接口暂未响应'}</p><KeyValues items={{版本:w.version??'—',协议:w.protocolVersion??'—',发行核对:w.releaseMatches===true?'与当前发行一致':w.releaseMatches===false?'与静态发行不一致':'尚未确认',地图:w.map?.sourceVersion??'尚未确认',活动战斗房:w.combatRooms??'—',检查时间:stamp(w.checkedAt)}}/>{w.rooms.map((room:Row)=><div className="service-room" key={room.id}><strong>{room.id}</strong><KeyValues items={{阶段:stateName[room.state]??room.state,完整周期P95:room.health.cycleP95===undefined?'尚未上报':room.health.cycleP95.toFixed(2)+' ms',完整周期P99:room.health.cycleP99===undefined?'尚未上报':room.health.cycleP99.toFixed(2)+' ms',工作进程内存:room.health.memoryBytes?Math.round(room.health.memoryBytes/1048576)+' MiB':'—',心跳:stamp(room.updated)}}/></div>)}</Panel>)}</div>
    {r.error&&<p className="warning-box">刷新失败，显示上次成功的数据。</p>}
    <p className="muted">健康接口是本次检查；房间数据保留最近30秒心跳。模拟更新时间不等于完整周期或玩家网络延迟。内存是进程值，同一工作进程的多个房间不能相加。</p>
    <Panel title="最近部署复检">{r.data.deployments.length?<div className="table-scroll"><table><thead><tr><th>发行</th><th>版本</th><th>组件</th><th>验证时间</th></tr></thead><tbody>{r.data.deployments.map((d:Row)=><tr key={d.id}><td>{d.id}</td><td>{d.version}</td><td>{d.site}</td><td>{stamp(d.verified)}</td></tr>)}</tbody></table></div>:<Empty/>}</Panel>
  </>}</Load></>;
}
