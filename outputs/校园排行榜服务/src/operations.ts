import {timingSafeEqual} from 'node:crypto';
import type {FastifyRequest} from 'fastify';
import {MODE_ENTRIES, MODE_UNAVAILABLE_MESSAGE, isModeEntry, type GameConfig, type ModeEntry} from '@qisheng/shared/operations';
import {body, random, type Context} from './app.js';
import {AppError} from './validation.js';
import {text} from './feedback.js';

export function internalAuth(c: Context, req: FastifyRequest) {
  const address = req.raw.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') || req.headers['x-forwarded-for'] !== undefined || req.headers.forwarded !== undefined) throw new AppError('INTERNAL_AUTH', '服务认证失败。', 403);
  const supplied = String(req.headers['x-service-token'] ?? ''), expected = c.opts.serviceSecret ?? '';
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new AppError('INTERNAL_AUTH', '服务认证失败。', 403);
}
const iso = (value: number) => new Date(value).toISOString();
function announcementView(r: any, admin = false) {
  return {id: r.id, revision: r.revision, title: r.title, body: r.body, priority: r.priority, audiences: JSON.parse(r.audiences), startsAt: iso(r.starts), endsAt: r.ends === null ? null : iso(r.ends), publishedAt: r.published === null ? null : iso(r.published), link: r.link, ...(admin ? {status: r.status, updatedAt: iso(r.updated), createdAt: iso(r.created)} : {})};
}
type AdminGameConfig = Omit<GameConfig, 'announcements'> & {announcements: ReturnType<typeof announcementView>[]};
export function readGameConfig(c: Context, admin?: false): GameConfig;
export function readGameConfig(c: Context, admin: true): AdminGameConfig;
export function readGameConfig(c: Context, admin = false): GameConfig | AdminGameConfig {
  const revision = (c.db.prepare('SELECT revision FROM operational_config WHERE id=1').get() as any).revision;
  const modes = Object.fromEntries((c.db.prepare('SELECT entry,enabled,reason FROM mode_availability').all() as any[]).map(r => [r.entry, {enabled: !!r.enabled, reason: r.reason}])) as GameConfig['modes'];
  const rows = admin ? c.db.prepare('SELECT * FROM announcements ORDER BY updated DESC,id ASC').all() : c.db.prepare("SELECT * FROM announcements WHERE status='published' AND starts<=? AND (ends IS NULL OR ends>?) ORDER BY CASE priority WHEN 'important' THEN 0 ELSE 1 END,published DESC,id ASC").all(c.now(), c.now());
  return {revision, serverTime: iso(c.now()), modes, announcements: (rows as any[]).map(r => announcementView(r, admin))};
}
export function assertModeEnabled(c: Context, entry: ModeEntry) {
  const mode = c.db.prepare('SELECT enabled,reason FROM mode_availability WHERE entry=?').get(entry) as any;
  if (mode && !mode.enabled) throw new AppError('MODE_DISABLED', mode.reason || MODE_UNAVAILABLE_MESSAGE, 403);
}
export function multiplayerEntry(mode: string, variant?: string | null): ModeEntry {
  return mode === 'coop' ? 'escape-coop' : variant === 'ffa' ? 'escape-ffa' : 'escape-tdm';
}
export function deployedVersion(c: Context, version: string) {
  return c.db.prepare("SELECT max(verified) verified FROM deployments WHERE version=? AND site='game'").get(version) as {verified: number | null};
}
function revisionCheck(c: Context, value: unknown) {
  const current = (c.db.prepare('SELECT revision FROM operational_config WHERE id=1').get() as any).revision;
  if (!Number.isSafeInteger(value) || value !== current) throw new AppError('CONFLICT', '设置已被其他管理员修改，请刷新后再保存。', 409);
  return current + 1;
}
function instant(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new AppError('ANNOUNCEMENT', label + '无效。');
  return Date.parse(value);
}
function safeLink(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 400 || /[\u0000-\u0020\\]/.test(value) || !value.startsWith('/') || value.startsWith('//')) throw new AppError('ANNOUNCEMENT', '通知链接只能使用站内页面地址。');
  const url = new URL(value, 'https://game.tianhw.top');
  if (url.origin !== 'https://game.tianhw.top' || /^\/(api|admin|internal|realtime)(\/|$)/i.test(url.pathname)) throw new AppError('ANNOUNCEMENT', '通知链接只能指向玩家页面。');
  return value;
}
export function operationsRoutes(c: Context) {
  c.app.get('/v1/game-config', () => readGameConfig(c));
  c.app.get('/internal/operations/config', req => {internalAuth(c, req); return readGameConfig(c);});
  c.app.get('/internal/operations/gate', req => {
    internalAuth(c, req);
    const entry = (req.query as any).entry;
    if (!isModeEntry(entry)) throw new AppError('MODE', '玩法无效。');
    const config = readGameConfig(c), mode = config.modes[entry];
    return {...mode, reason: mode.enabled ? '' : mode.reason || MODE_UNAVAILABLE_MESSAGE, revision: config.revision};
  });
  c.app.post('/internal/deployments/verified', req => {
    internalAuth(c, req);
    const b = body(req), id = text(b.id, 3, 120), version = text(b.version, 3, 40), site = b.site;
    if (!/^Preview \d+\.\d+\.\d+$/.test(version) || !['game', 'campus', 'backend'].includes(site) || b.verified !== true) throw new AppError('DEPLOYMENT', '部署验证记录无效。');
    const old = c.db.prepare('SELECT * FROM deployments WHERE id=?').get(id) as any;
    if (old && (old.version !== version || old.site !== site)) throw new AppError('CONFLICT', '部署记录与已有记录不一致。', 409);
    if (!old) c.db.transaction(() => {
      c.db.prepare('INSERT INTO deployments VALUES(?,?,?,?,?)').run(id, version, site, c.now(), c.now());
      c.audit('deployment-verified', id, {version, site, verifiedAt: iso(c.now())}, 'deployment');
    })();
    return {ok: true, id, version, site, verifiedAt: old?.verified ?? c.now()};
  });
}
export function operationsAdminRoutes(c: Context, admin: (req: FastifyRequest, write?: boolean, scope?: string) => any, log: (a: any, action: string, target: string, detail?: any) => void) {
  c.app.get('/admin/game-config', req => {admin(req, false, 'operations'); return readGameConfig(c, true);});
  c.app.post('/admin/game-config/modes', req => {
    const a = admin(req, true, 'operations'), b = body(req);
    if (!b.modes || typeof b.modes !== 'object' || Array.isArray(b.modes) || !Object.keys(b.modes).length || Object.keys(b.modes).some(key => !isModeEntry(key))) throw new AppError('MODE', '请选择要调整的玩法。');
    const updates = Object.entries(b.modes).map(([entry, raw]) => {
      const mode = raw as any;
      if (typeof mode?.enabled !== 'boolean') throw new AppError('MODE', '玩法状态无效。');
      return {entry, enabled: mode.enabled, reason: text(mode.reason ?? '', 0, 300)};
    });
    return c.db.transaction(() => {
      const revision = revisionCheck(c, b.expectedRevision), before = readGameConfig(c).modes;
      for (const m of updates) c.db.prepare('UPDATE mode_availability SET enabled=?,reason=?,updated=? WHERE entry=?').run(m.enabled ? 1 : 0, m.reason, c.now(), m.entry);
      c.db.prepare('UPDATE operational_config SET revision=? WHERE id=1').run(revision);
      log(a, 'mode-availability-update', updates.map(m => m.entry).join(','), {before: Object.fromEntries(updates.map(m => [m.entry, before[m.entry as ModeEntry]])), after: b.modes, revision});
      return readGameConfig(c, true);
    })();
  });
  c.app.post('/admin/announcements', req => {
    const a = admin(req, true, 'operations'), b = body(req);
    return c.db.transaction(() => {
      const revision = revisionCheck(c, b.expectedRevision), id = b.id ? text(b.id, 1, 100) : random(16), old = c.db.prepare('SELECT * FROM announcements WHERE id=?').get(id) as any;
      if (b.id && !old) throw new AppError('ANNOUNCEMENT', '找不到通知。', 404);
      const title = text(b.title ?? old?.title, 1, 80), message = text(b.body ?? old?.body, 1, 2000), priority = b.priority ?? old?.priority ?? 'normal', status = b.status ?? old?.status ?? 'draft';
      const audiences = b.audiences ?? (old ? JSON.parse(old.audiences) : []);
      if (!['normal', 'important'].includes(priority) || !['draft', 'published', 'withdrawn'].includes(status) || !Array.isArray(audiences) || audiences.length > MODE_ENTRIES.length || audiences.some(entry => !isModeEntry(entry)) || new Set(audiences).size !== audiences.length) throw new AppError('ANNOUNCEMENT', '通知设置无效。');
      const starts = b.startsAt === undefined ? old?.starts ?? c.now() : b.startsAt === null ? c.now() : instant(b.startsAt, '开始时间');
      const ends = b.endsAt === undefined ? old?.ends ?? null : b.endsAt === null ? null : instant(b.endsAt, '结束时间');
      if (ends !== null && ends <= starts) throw new AppError('ANNOUNCEMENT', '结束时间必须晚于开始时间。');
      const link = b.link === undefined ? old?.link ?? null : safeLink(b.link), published = status === 'published' ? old?.published ?? c.now() : old?.published ?? null;
      c.db.prepare('INSERT INTO announcements VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,title=excluded.title,body=excluded.body,priority=excluded.priority,audiences=excluded.audiences,status=excluded.status,starts=excluded.starts,ends=excluded.ends,published=excluded.published,link=excluded.link,updated=excluded.updated').run(id, revision, title, message, priority, JSON.stringify(audiences), status, starts, ends, published, link, old?.created ?? c.now(), c.now());
      c.db.prepare('UPDATE operational_config SET revision=? WHERE id=1').run(revision);
      log(a, 'announcement-' + status, id, {before: old ? announcementView(old, true) : null, after: {title, body: message, priority, audiences, status, startsAt: iso(starts), endsAt: ends === null ? null : iso(ends), link}, revision});
      return readGameConfig(c, true);
    })();
  });
}
