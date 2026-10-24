import {adminRoomReadRoutes} from './admin-rooms.js';
import {readPresence} from './presence.js';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {hostname} from 'node:os';
import type {FastifyRequest} from 'fastify';
import type {Context} from './app.js';
import {AppError} from './validation.js';
import {feedbackViews, page} from './feedback.js';
import {readGameConfig} from './operations.js';

type Admin = (req: FastifyRequest, write?: boolean, scope?: string) => any;
const has = (a: any, scope: string) => a.owner || a.scopes.includes(scope);
export function adminDeploymentTarget(host=hostname(),production=process.env.NODE_ENV==='production'||Boolean(process.env.RANKING_CONFIG)||import.meta.url.startsWith('file:///srv/codex/')){
  const configured=process.env.OPENQS_DEPLOYMENT_TARGET_CONFIG;
  const files=configured?[configured]:['/srv/codex/sites/deployment-targets.json','/srv/codex/sites/tools/deployment-targets.json'];
  for(const file of files)try{
    const config=JSON.parse(readFileSync(file,'utf8'));
    const match=Object.entries(config.targets??{}).find(([id,entry])=>/^[a-z0-9][a-z0-9-]*$/.test(id)&&(entry as any)?.hostname===host);
    if(match)return match[0];
  }catch{}
  return production?'production':'local';
}
function range(q: any, filters: string[], args: any[], column: string) {
  for (const [key, op] of [['from', '>='], ['to', '<=']]) {
    if (!q[key]) continue;
    const raw = String(q[key]);
    const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(raw + (key === 'to' ? 'T23:59:59.999+08:00' : 'T00:00:00+08:00')) : /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
    if (!Number.isFinite(value) || value < 0) throw new AppError('QUERY', '请选择有效的日期范围。');
    filters.push(column + op + '?'); args.push(value);
  }
}
const actions: Record<string, string> = {'admin-login': '登录后台', 'feedback-update': '更新反馈', 'feedback-resolve': '解决反馈', 'feedback-close': '关闭反馈', 'feedback-reopen': '重新处理反馈', 'issue-update': '更新公开议题', 'issue-resolve': '解决议题', 'release-update': '更新发布记录', 'mode-availability-update': '调整玩法开放状态', 'announcement-published': '发布通知', 'announcement-draft': '保存通知草稿', 'announcement-withdrawn': '撤下通知', 'deployment-verified': '验证部署', 'room-kick': '移出玩家', 'room-close': '关闭房间', 'room-temp-ban': '限制联机', 'admin-account-update': '更新管理员权限', 'admin-password': '更换管理密码', 'player-update': '更新玩家状态', 'approve': '通过成绩审核', 'reject': '驳回成绩', 'remove': '下架成绩'};

export function readAdminStats(c: Context, q: any) {
  const days=Math.min(366,Math.max(1,Number(q.days)||30)),since=new Date(c.now()-days*86400000).toISOString().slice(0,10),filters=['day>=?'],args:any[]=[since];
  for(const key of ['version','mode','platform'])if(q[key]){filters.push(key+'=?');args.push(String(q[key]).slice(0,80));}
  const where=filters.join(' AND '),rows=(columns:string,extra='',values:any[]=[])=>c.db.prepare('SELECT '+columns+' FROM telemetry_daily WHERE '+where+extra).all(...args,...values);
  return {daily:rows('day,event,sum(count) count',' GROUP BY day,event ORDER BY day'),pages:rows('page,sum(count) count',' AND event=? GROUP BY page ORDER BY count DESC',['page-view']),devices:rows('platform,sum(count) count',' AND event=? GROUP BY platform ORDER BY count DESC',['session-start']),modes:rows('mode,sum(count) count',' AND event=? GROUP BY mode ORDER BY count DESC',['mode-start']),errors:rows('event,code,version,platform,sum(count) count'," AND event IN ('error','connection-error','load-error') GROUP BY event,code,version,platform ORDER BY count DESC LIMIT 100"),choices:Object.fromEntries(['version','mode','platform'].map(key=>[key,c.db.prepare('SELECT DISTINCT '+key+' value FROM telemetry_daily WHERE day>=? AND '+key+"!='' ORDER BY "+key+' LIMIT 100').all(since)])),privacy:{rawDays:30,aggregateDays:365,estimatedSessions:true}};
}

export function adminWorkbenchRoutes(c: Context, admin: Admin) {
  const {app, db, now} = c;
  adminRoomReadRoutes(c,admin);
  app.get('/admin/services',async req=>{
    admin(req,false,'rooms');
    let release:any=null;try{const m=JSON.parse(readFileSync('/srv/codex/sites/current/manifest.json','utf8'));release={id:String(m.releaseId??''),version:String(m.version??'')};}catch{}
    const workerRows=await Promise.all([2567,2568,2569].map(async(port,index)=>{
      const id='w'+(index+1),checkedAt=now();try{
        const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1800)}),h=await response.json() as any;
        if(!response.ok||h.ok!==true||h.worker!==id)throw Error('HEALTH');
        const rooms=db.prepare("SELECT id,state,updated,health FROM online_rooms WHERE worker=? AND state!='closed' AND updated>?").all(id,now()-30000) as any[];
        let map:any=null;try{const mapResponse=await fetch('http://127.0.0.1:'+port+'/map-identity',{signal:AbortSignal.timeout(1800)});if(mapResponse.ok)map=await mapResponse.json();}catch{}
        return {id,available:true,checkedAt,version:h.version,protocolVersion:h.protocolVersion,map,releaseMatches:release?.version?String(release.version).replace(/^Preview /,'')===String(h.version):null,combatRooms:h.combatRooms,rooms:rooms.map(r=>({...r,health:JSON.parse(r.health??'{}')}))};
      }catch{return{id,available:false,checkedAt,rooms:[]};}
    }));
    const target=adminDeploymentTarget();
    return {checkedAt:now(),target,release,api:{ok:true,node:process.version,uptimeSeconds:Math.floor(process.uptime()),schemaVersion:db.pragma('user_version',{simple:true})},workers:workerRows,deployments:db.prepare('SELECT id,version,site,verified FROM deployments ORDER BY verified DESC LIMIT 6').all()};
  });
  const directory = fileURLToPath(new URL('../admin/dist/', import.meta.url));
  for (const url of ['/admin', '/admin/']) app.get(url, (_, reply) => {
    const index = join(directory, 'index.html');
    if (!existsSync(index)) throw new AppError('ADMIN_BUILD', '后台页面尚未就绪，请稍后刷新。', 503, true);
    return reply.type('text/html; charset=utf-8').send(readFileSync(index));
  });
  app.get('/admin/assets/:file', (req, reply) => {
    const file = (req.params as any).file;
    if (!/^[\w.-]+\.(js|css|woff2|svg)$/.test(file)) throw new AppError('FILE', '页面资源不存在，请刷新。', 404);
    const path = join(directory, 'assets', file);
    if (!existsSync(path)) throw new AppError('FILE', '页面已更新，请刷新。', 404);
    const ext = file.split('.').pop(), mime = ext === 'js' ? 'application/javascript' : ext === 'css' ? 'text/css' : ext === 'svg' ? 'image/svg+xml' : 'font/woff2';
    return reply.type(mime).send(readFileSync(path));
  });
  app.get('/admin/overview', req => {
    const a = admin(req), out: Record<string, unknown> = {};
    const n = (sql: string, ...args: any[]) => (db.prepare(sql).get(...args) as any).n;
    if (has(a, 'feedback')) {out.feedback = n("SELECT count(*) n FROM feedback WHERE status!='closed'"); out.awaitingVerification = n("SELECT count(*) n FROM issues WHERE status='verification'");}
    if (has(a, 'ranking')) out.review = n("SELECT count(*) n FROM runs WHERE status='review'");
    if (has(a, 'rooms')) {out.rooms = n("SELECT count(*) n FROM online_rooms WHERE state!='closed' AND updated>?", now() - 30000); out.maintenance = (db.prepare("SELECT value FROM operations WHERE key='maintenance'").get() as any)?.value === 'true';}
    if (has(a, 'players')) out.players = n('SELECT count(*) n FROM players');
    if (has(a, 'stats')) {
      out.presence = readPresence(c);
      const today = new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
      out.todayViews = n("SELECT COALESCE(sum(count),0) n FROM telemetry_daily WHERE day=? AND event='page-view'", today);
      out.todaySessions = n("SELECT COALESCE(sum(count),0) n FROM telemetry_daily WHERE day=? AND event='session-start'", today);
      out.recentErrors = n("SELECT COALESCE(sum(count),0) n FROM telemetry_daily WHERE day=? AND event='error'", today);
      out.databaseBytes = Number(db.pragma('page_count', {simple: true})) * Number(db.pragma('page_size', {simple: true})); out.schemaVersion = db.pragma('user_version', {simple: true});
    }
    if (has(a, 'operations')) {const config = readGameConfig(c); out.disabledModes = Object.entries(config.modes).filter(([, mode]) => !mode.enabled).map(([entry, mode]) => ({entry, reason: mode.reason})); out.activeAnnouncements = config.announcements.length;}
    return out;
  });
  app.get('/admin/feedback', req => {
    admin(req, false, 'feedback');
    const q = req.query as any, pg = page(q.page), filters: string[] = [], args: any[] = [];
    const state = ['received', 'triaged', 'closed', 'resolved', 'all'].includes(q.status) ? q.status : 'received';
    if (state === 'resolved') filters.push("f.status='closed' AND r.feedback_id IS NOT NULL");
    else if (state === 'closed') filters.push("f.status='closed' AND r.feedback_id IS NULL");
    else if (state !== 'all') {filters.push('f.status=?'); args.push(state);}
    const search = String(q.search ?? '').trim().slice(0, 100);
    if (search) {filters.push('(instr(lower(f.title),lower(?))>0 OR instr(lower(f.message),lower(?))>0 OR f.id=?)'); args.push(search, search, search);}
    if (q.version) {
      const version = String(q.version).trim().slice(0, 40).replace(/^Preview\s+/i, '');
      filters.push("(json_extract(f.diagnostics,'$.version')=? OR json_extract(f.diagnostics,'$.version')=?)");
      args.push(version, 'Preview ' + version);
    }
    if (q.mode) {
      const mode = String(q.mode).slice(0, 40);
      const aliases:Record<string,string[]> = {
        coop:['coop','online-coop','escape-coop'],
        tdm:['tdm','online-tdm'], ffa:['ffa','online-ffa'],
        pvp:['pvp','online-pvp'], escape:['escape','escape-solo'],
      };
      const values = aliases[mode] ?? [mode];
      filters.push("json_extract(f.diagnostics,'$.mode') IN (" + values.map(() => '?').join(',') + ')');
      args.push(...values);
    }
    range(q, filters, args, 'f.created');
    const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '', source = ' FROM feedback f LEFT JOIN feedback_resolutions r ON r.feedback_id=f.id';
    const items = feedbackViews(c, db.prepare('SELECT f.*' + source + where + ' ORDER BY f.updated DESC,f.id ASC LIMIT 20 OFFSET ?').all(...args, (pg - 1) * 20) as any[], true);
    return {items, total: (db.prepare('SELECT count(*) n' + source + where).get(...args) as any).n, page: pg, pageSize: 20};
  });
  app.get('/admin/audit', req => {
    admin(req, false, 'accounts');
    const q = req.query as any, pg = page(q.page), filters: string[] = [], args: any[] = [];
    if (q.actor) {filters.push('(a.actor=? OR instr(m.name,?)>0 OR instr(m.username,?)>0)'); args.push(...Array(3).fill(String(q.actor).slice(0, 100)));}
    if (q.action) {filters.push('a.action=?'); args.push(String(q.action).slice(0, 100));}
    if (q.target) {filters.push('instr(a.target,?)>0'); args.push(String(q.target).slice(0, 100));}
    range(q, filters, args, 'a.created');
    const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '', source = " FROM audit a LEFT JOIN administrators m ON m.id=a.actor";
    const items = (db.prepare("SELECT a.id,a.created,a.action,a.target,a.detail,a.actor actorId,COALESCE(m.name,'系统') actor" + source + where + ' ORDER BY a.id DESC LIMIT 50 OFFSET ?').all(...args, (pg - 1) * 50) as any[]).map(r => ({...r, label: actions[r.action] ?? '管理操作', detail: JSON.parse(r.detail)}));
    return {items, total: (db.prepare('SELECT count(*) n' + source + where).get(...args) as any).n, page: pg, pageSize: 50};
  });
}
