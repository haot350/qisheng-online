import {type Context} from './app.js';
import {AppError} from './validation.js';

const source=`SELECT id,'solo' source,mode,status,submitted submittedAt,summary,publish_board published,difficulty,CASE WHEN mode='dafei' THEN COALESCE(json_extract(config,'$.vehicleId'),'bao5') END vehicleId,rule_version ruleVersion FROM runs WHERE player_id=? AND record_stats=1 AND submitted IS NOT NULL AND status IN ('ranked','unranked','review','removed','rejected')
 UNION ALL SELECT r.id,'multiplayer' source,r.mode,r.status,r.submitted submittedAt,p.summary,CASE WHEN r.status='valid' AND NOT EXISTS(SELECT 1 FROM multiplayer_participants member JOIN players person ON person.id=member.player_id WHERE member.result_id=r.id AND person.restricted=1) THEN 1 ELSE 0 END published,r.difficulty,NULL vehicleId,r.rule_version ruleVersion FROM multiplayer_results r JOIN multiplayer_participants p ON p.result_id=r.id WHERE p.player_id=?`;
export function accountMatches(c:Context,playerId:string,query:Record<string,unknown>,restricted:boolean) {
  const limit=query.limit===undefined?20:Number(query.limit),mode=query.mode;
  if(!Number.isInteger(limit)||limit<1||limit>20||mode!==undefined&&!['escape','coop','pvp','dafei'].includes(String(mode)))throw new AppError('MATCHES','战绩筛选无效。');
  const filters:string[]=[],args:unknown[]=[playerId,playerId];
  if(mode){filters.push('mode=?');args.push(mode);}
  if(query.cursor!==undefined){
    let cursor:any;try{if(typeof query.cursor!=='string'||query.cursor.length>512)throw Error();cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));}catch{throw new AppError('MATCHES','分页位置已失效，请重新打开战绩。');}
    if(!Array.isArray(cursor)||cursor.length!==3||!Number.isSafeInteger(cursor[0])||!['solo','multiplayer'].includes(cursor[1])||typeof cursor[2]!=='string'||cursor[2].length>100)throw new AppError('MATCHES','分页位置已失效，请重新打开战绩。');
    filters.push('(submittedAt < ? OR (submittedAt = ? AND source < ?) OR (submittedAt = ? AND source = ? AND id < ?))');args.push(cursor[0],cursor[0],cursor[1],cursor[0],cursor[1],cursor[2]);
  }
  const rows=c.db.prepare('SELECT * FROM ('+source+')'+(filters.length?' WHERE '+filters.join(' AND '):'')+' ORDER BY submittedAt DESC,source DESC,id DESC LIMIT ?').all(...args,limit+1) as any[];
  const items=rows.slice(0,limit).map(r=>({...r,summary:r.summary?JSON.parse(r.summary):null,published:!restricted&&!!r.published&&(r.source==='solo'?r.status==='ranked':r.status==='valid'),canPublish:r.source==='solo'&&r.status==='ranked'&&!restricted,...(r.source==='solo'?{runId:r.id}:{}),vehicleId:r.vehicleId??undefined}));
  const last=items.at(-1);
  return {items,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify([last.submittedAt,last.source,last.id])).toString('base64url'):null};
}
