import {stamp,stateName,useLiveResource,type Row} from '../api';
import {Empty,KeyValues,Load,PageTitle,Panel} from '../ui';
function targetName(target:unknown){
  if(target==='hk'||target==='hk-main')return '香港';
  if(target==='us')return '美国';
  if(target==='local')return '本机开发';
  return target==='production'?'生产目标待识别':'未确认';
}
export default function Services(){
  const r=useLiveResource('services');
  const stale=Boolean(r.data&&(r.error||Date.now()-Number(r.data.checkedAt)>30000));
  const reasons:Record<string,string>={ready:'可以新建房间',maintenance:'维护中',capacity:'席位已满',busy:'正在处理加入',warming:'服务正在准备'};
  const bytes=(n:unknown)=>typeof n==='number'?(n/1048576).toFixed(1)+' MiB':'—';
  return <><PageTitle title="服务状态"><button onClick={r.reload}>检查当前状态</button></PageTitle><Load loading={r.loading} error={r.data?'':r.error} retry={r.reload}>{r.data&&<>
    {r.error&&<p className="warning-box" role="status">本次刷新失败，下方为上次成功的数据，请根据检查时间核对。</p>}
    <Panel title="最近检查"><KeyValues items={{目标:targetName(r.data.target),发行:r.data.release?.id??'未读取到正式发行',版本:r.data.release?.version??'未登记',检查时间:stamp(r.data.checkedAt),API:r.error?'本次检查失败，保留上次数据':r.refreshing?'正在复检':'本次检查已响应',API版本:r.data.api.version??'未知',Node:r.data.api.node,数据库格式:r.data.api.schemaVersion,运行时间:Math.floor(r.data.api.uptimeSeconds/60)+' 分钟'}}/></Panel>
    <Panel title="接纳状态"><KeyValues items={{新房间:stale?'数据已过期':r.data.admission?reasons[r.data.admission.reason]??'尚未读取':'尚未读取',排队请求:r.data.admission?.queued??'—'}}/></Panel>
    {r.data.operations&&<Panel title="恢复与空间"><KeyValues items={{最近备份:r.data.operations.backup.available?stamp(r.data.operations.backup.createdAt):'尚未读取',备份状态:r.data.operations.backup.available?(r.data.operations.backup.stale?'需要新备份':r.data.operations.backup.complete&&r.data.operations.backup.restoreVerified?'隔离恢复已通过':'恢复范围待核对'):'尚未读取',备份体积:bytes(r.data.operations.backup.bytes),项目占用:bytes(r.data.operations.storage.physicalBytes),磁盘剩余:bytes(r.data.operations.storage.freeBytes),空间检查:r.data.operations.storage.available?(r.data.operations.storage.stale?'数据已过期':r.data.operations.storage.passed?(r.data.operations.storage.warning?'接近空间上限':'正常'):'暂停新发行'):'尚未读取',源站证书到期:r.data.operations.certificate.available?stamp(r.data.operations.certificate.expiresAt):'尚未登记',证书续期:r.data.operations.certificate.available?(r.data.operations.certificate.expired?'已到期':r.data.operations.certificate.renewal==='automatic'?'自动续期':r.data.operations.certificate.warning?'请安排手动续期':'手动续期'):'尚未登记'}}/></Panel>}
    <div className="service-grid">{r.data.workers.map((w:Row)=><Panel title={'实时工作进程 '+w.id} key={w.id}><p className={r.error||r.refreshing?'muted':w.available?'status-good':'warning-box'}>{r.error||r.refreshing?'上次检查：':''}{w.available?'健康接口已响应':'健康接口暂未响应'}</p><KeyValues items={{版本:w.version??'—',协议:w.protocolVersion??'—',预期版本:w.expected?.version??'未知',兼容核对:w.releaseMatches===true?'兼容运行':w.releaseMatches===false?'兼容身份不一致':'尚未确认',地图:w.map?.sourceVersion??'尚未确认',活动战斗房:w.combatRooms??'—',检查时间:stamp(w.checkedAt)}}/>{w.rooms.map((room:Row)=><div className="service-room" key={room.id}><strong>{room.id}</strong><KeyValues items={{阶段:stateName[room.state]??room.state,完整周期P95:room.health.cycleP95===undefined?'尚未上报':room.health.cycleP95.toFixed(2)+' ms',完整周期P99:room.health.cycleP99===undefined?'尚未上报':room.health.cycleP99.toFixed(2)+' ms',工作进程内存:room.health.memoryBytes?Math.round(room.health.memoryBytes/1048576)+' MiB':'—',心跳:stamp(room.updated)}}/></div>)}</Panel>)}</div>
    <p className="muted">健康状态对应所列检查时间；房间数据保留最近30秒心跳。模拟更新时间不等于完整周期或玩家网络延迟。内存是进程值，同一工作进程的多个房间不能相加。</p>
    {r.data.operations&&<Panel title="服务日志"><div className="table-scroll"><table><thead><tr><th>文件</th><th>更新时间</th><th>错误</th><th>警告</th><th>诊断码</th></tr></thead><tbody>{r.data.operations.logs.map((log:Row)=><tr key={log.name}><td>{log.name}</td><td>{log.available?stamp(log.updatedAt):'尚未读取'}</td><td>{log.errors??'—'}</td><td>{log.warnings??'—'}</td><td>{Object.entries(log.codes??{}).map(([code,count])=>code+' '+count).join('，')||'—'}</td></tr>)}</tbody></table></div></Panel>}
    <Panel title="最近部署复检">{r.data.deployments.length?<div className="table-scroll"><table><thead><tr><th>发行</th><th>版本</th><th>组件</th><th>验证时间</th></tr></thead><tbody>{r.data.deployments.map((d:Row)=><tr key={d.id}><td>{d.id}</td><td>{d.version}</td><td>{d.site}</td><td>{stamp(d.verified)}</td></tr>)}</tbody></table></div>:<Empty/>}</Panel>
  </>}</Load></>;
}
