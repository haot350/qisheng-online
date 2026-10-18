import type {Context} from './app.js';
import {page} from './feedback.js';
import {expireRoomCommands, roomView} from './room-control.js';
import {readPresence} from './presence.js';

export function adminRoomReadRoutes(c: Context, admin: (req: any, write?: boolean, scope?: string) => any) {
  const {app, db, now} = c;
  app.get('/admin/presence', req => {
    admin(req, false, 'stats');
    return {...readPresence(c), minutes: db.prepare('SELECT * FROM presence_minutes WHERE minute>? ORDER BY minute').all(now() - 86400000), daily: db.prepare('SELECT * FROM presence_daily ORDER BY day DESC LIMIT 30').all(), privacy: {ttlSeconds: 90, minuteHours: 24, dailyDays: 365}};
  });
  app.get('/admin/rooms', req => {
    admin(req, false, 'rooms');
    const q = req.query as any, pg = page(q.page), filters: string[] = [], args: any[] = [];
    const history = q.view === 'history';
    filters.push(history ? "(state='closed' OR updated<=?)" : "state!='closed' AND updated>?");
    args.push(now() - 120000);
    if (['lobby', 'preparing', 'countdown', 'playing', 'paused', 'ended', 'draining', 'closed'].includes(q.state)) {filters.push('state=?'); args.push(q.state);}
    if (['coop', 'pvp'].includes(q.mode)) {filters.push('mode=?'); args.push(q.mode);}
    if (['tdm', 'ffa'].includes(q.variant)) {filters.push('variant=?'); args.push(q.variant);}
    if (q.active === 'true') {filters.push("updated>? AND state!='closed'"); args.push(now() - 30000);}
    if (q.search) {filters.push('(instr(id,?)>0 OR instr(players,?)>0)'); args.push(...Array(2).fill(String(q.search).slice(0, 100)));}
    const where = ' WHERE ' + filters.join(' AND ');
    return {items: (db.prepare('SELECT * FROM online_rooms' + where + ' ORDER BY updated DESC,id ASC LIMIT 30 OFFSET ?').all(...args, (pg - 1) * 30) as any[]).map(r => roomView(c, r)), total: (db.prepare('SELECT count(*) n FROM online_rooms' + where).get(...args) as any).n, page: pg, pageSize: 30, checkedAt: now(), view: history ? 'history' : 'current', maintenance: (db.prepare("SELECT value FROM operations WHERE key='maintenance'").get() as any)?.value === 'true'};
  });
  app.get('/admin/room-commands', req => {
    admin(req, false, 'rooms'); expireRoomCommands(c);
    const roomId = String((req.query as any).roomId ?? '').slice(0, 100);
    const sql = 'SELECT q.id,q.room_id roomId,q.action,q.player_id playerId,q.reason,q.created,r.updated,r.state,r.outcome,r.expires FROM room_commands q LEFT JOIN room_command_results r ON r.command_id=q.id';
    const rows = db.prepare(sql + (roomId ? ' WHERE q.room_id=?' : '') + ' ORDER BY q.created DESC LIMIT 30').all(...(roomId ? [roomId] : [])) as any[];
    return {items: rows.map(r => ({...r, state: r.state ?? 'legacy', outcome: r.outcome ?? '旧版本记录，未保存实际执行结果。'})), checkedAt: now()};
  });
}
