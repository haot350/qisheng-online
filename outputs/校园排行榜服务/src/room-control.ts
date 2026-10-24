import {body, params, hash, random, type Context} from './app.js';
import {AppError} from './validation.js';

const terminal = new Set(['executed', 'noop', 'failed', 'expired']);
const validId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const safeText = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';

export function expireRoomCommands(c: Context) {
  c.db.prepare("UPDATE room_command_results SET state='expired',outcome='指令已过期，未再执行。',updated=? WHERE state='queued' AND expires<=?").run(c.now(), c.now());
  c.db.prepare("UPDATE room_command_results SET state='failed',outcome='未收到最终结果。请刷新房间核对，勿立即重复处理。',updated=? WHERE state='executing' AND expires<=?").run(c.now(), c.now());
}
export function roomView(c: Context, row: any) {
  const runtime = c.db.prepare('SELECT * FROM room_runtime WHERE room_id=?').get(row.id) as any;
  const details = runtime ? JSON.parse(runtime.details) : {};
  const players = JSON.parse(row.players).map((p: any) => typeof p === 'string' ? {playerId: p, nickname: p, connected: true} : {...p, playerId: p.playerId ?? p.id, connected: p.connected !== false});
  const stale = row.updated <= c.now() - 30000;
  return {...row, ...details, players, health: JSON.parse(row.health ?? '{}'),
    generation: runtime?.generation ?? null, revision: runtime?.revision ?? null,
    connected: players.filter((p: any) => p.connected).length,
    reserved: players.filter((p: any) => !p.connected).length,
    occupied: players.length, stale, actionable: !stale && row.state !== 'closed' && !!details.commandCapable};
}
export function submitRoomCommand(c: Context, actor: string, roomId: string, b: any) {
  expireRoomCommands(c);
  if (!['kick', 'close', 'temp-ban'].includes(b.action) || typeof b.reason !== 'string' || b.reason.trim().length < 4 || b.reason.length > 200 || !validId(b.requestId))
    throw new AppError('REQUEST', '请填写处理原因并重新确认操作。');
  const playerId = b.action === 'close' ? null : b.playerId;
  if (playerId !== null && !validId(playerId)) throw new AppError('PLAYER', '请选择房间中的玩家。');
  const minutes = b.action === 'temp-ban' ? Math.min(1440, Math.max(5, Math.floor(Number(b.minutes) || 60))) : 0;
  const fingerprint = hash(JSON.stringify([roomId, b.action, playerId, b.reason.trim(), minutes, b.generation, b.expectedRevision]));
  const key = actor + ':' + b.requestId;
  const old = c.db.prepare('SELECT command_id,fingerprint,state FROM room_command_results WHERE request_key=?').get(key) as any;
  if (old) {
    if (old.fingerprint !== fingerprint) throw new AppError('CONFLICT', '这次操作的内容已变化，请重新确认。', 409);
    return {ok: true, commandId: old.command_id, state: old.state, duplicate: true};
  }
  const row = c.db.prepare('SELECT * FROM online_rooms WHERE id=?').get(roomId);
  if (!row) throw new AppError('ROOM', '找不到房间。', 404);
  const room = roomView(c, row);
  if (!room.actionable) throw new AppError('ROOM_INACTIVE', room.state === 'closed' ? '房间已经关闭。' : '房间状态尚未确认，请刷新后重试。', 409);
  if (room.generation !== b.generation || room.revision !== b.expectedRevision)
    throw new AppError('CONFLICT', '房间状态已经变化，请刷新后重新确认。', 409);
  if (playerId && !room.players.some((p: any) => p.playerId === playerId))
    throw new AppError('ROOM_MEMBER', '此玩家已不在房间中。', 409);
  const pending = c.db.prepare("SELECT r.command_id,r.state FROM room_command_results r JOIN room_commands q ON q.id=r.command_id WHERE q.room_id=? AND r.generation=? AND q.action=? AND COALESCE(q.player_id,'')=? AND r.state IN ('queued','executing')").get(roomId, room.generation, b.action, playerId ?? '') as any;
  if (pending) return {ok: true, commandId: pending.command_id, state: pending.state, duplicate: true};
  const id = random(16), created = c.now();
  c.db.transaction(() => {
    c.db.prepare('INSERT INTO room_commands(id,room_id,action,player_id,reason,created,acked) VALUES(?,?,?,?,?,?,1)').run(id, roomId, b.action, playerId, b.reason.trim(), created);
    c.db.prepare('INSERT INTO room_command_results(command_id,request_key,actor,fingerprint,generation,revision,state,expires,updated,ban_minutes) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, key, actor, fingerprint, room.generation, room.revision, 'queued', created + 60000, created, minutes);
    c.audit('room-' + b.action, roomId, {commandId: id, playerId, reason: b.reason.trim()}, actor);
  })();
  return {ok: true, commandId: id, state: 'queued'};
}

export function roomControlInternalRoutes(c: Context, internal: (req: any) => void) {
  const {app, db, now} = c;
  let cleanupDay = -1;
  const maintenance = () => (db.prepare("SELECT value FROM operations WHERE key='maintenance'").get() as any)?.value === 'true';
  app.post('/internal/multiplayer/rooms/upsert', req => {
    internal(req);
    const b = body(req), created = typeof b.createdAt === 'string' ? Date.parse(b.createdAt) : b.createdAt;
    if (!validId(b.roomId) || !['w1', 'w2', 'w3', 'dev'].includes(b.worker) || !['coop', 'pvp'].includes(b.mode) || !['lobby', 'preparing', 'countdown', 'playing', 'paused', 'ended', 'draining', 'closed'].includes(b.state) || !Array.isArray(b.players) || b.players.length > 8 || !Number.isInteger(b.maxPlayers) || b.maxPlayers < 2 || b.maxPlayers > (b.mode === 'coop' ? 4 : 8) || b.players.length > b.maxPlayers || !Number.isFinite(created) || created < 0 || created > now() + 60000)
      throw new AppError('ROOM', '房间状态无效。');
    const players = b.players.map((p: any) => typeof p === 'string' ? {playerId: p, nickname: '', connected: true, ready: false, loading: false, team: null} : {playerId: p?.playerId, nickname: safeText(p?.nickname, 64), connected: p?.connected !== false, ready: !!p?.ready, loading: !!p?.loading, team: ['red', 'blue', 'none'].includes(p?.team) ? p.team : null});
    if (players.some((p: any) => !validId(p.playerId)) || new Set(players.map((p: any) => p.playerId)).size !== players.length)
      throw new AppError('ROOM', '房间成员无效。');
    const generation = validId(b.generation) ? b.generation : 'legacy-' + hash(b.worker + ':' + created).slice(0, 32);
    const details = {
      commandCapable: b.controlVersion === 1 && validId(b.generation),
      name: safeText(b.name, 80), private: !!b.private, difficulty: ['easy', 'standard', 'hard'].includes(b.difficulty) ? b.difficulty : null,
      elapsed: typeof b.elapsed === 'number' && Number.isFinite(b.elapsed) ? Math.max(0, Math.min(86400, b.elapsed)) : null,
      version: safeText(b.version, 40), protocolVersion: safeText(b.protocolVersion, 80),
      map: b.map && typeof b.map === 'object' ? Object.fromEntries(Object.entries(b.map).filter(([key, value]) => /^(sourceVersion|version|manifestHash|collisionHash|navigationHash|navHash|visionHash)$/.test(key) && typeof value === 'string' && value.length <= 128)) : null,
    };
    const signature = hash(JSON.stringify([b.state, players, b.maxPlayers, b.mode, b.variant, details.name, details.private]));
    const previous = db.prepare('SELECT generation,revision,signature FROM room_runtime WHERE room_id=?').get(b.roomId) as any;
    const revision = previous?.generation === generation ? previous.revision + Number(previous.signature !== signature) : 1;
    const health: Record<string, number> = {};
    for (const k of ['tickP95', 'tickP99', 'cycleP95', 'cycleP99', 'snapshotMs', 'memoryBytes', 'cpuPercent', 'queue', 'inputAgeTicks', 'bufferedBytes'])
      if (typeof b.health?.[k] === 'number' && Number.isFinite(b.health[k]) && b.health[k] >= 0 && b.health[k] <= 1e12) health[k] = b.health[k];
    db.transaction(() => {
      db.prepare('INSERT INTO online_rooms(id,worker,mode,state,players,max_players,created,updated,health,variant) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET worker=excluded.worker,mode=excluded.mode,state=excluded.state,players=excluded.players,max_players=excluded.max_players,created=excluded.created,updated=excluded.updated,health=excluded.health,variant=excluded.variant').run(b.roomId, b.worker, b.mode, b.state, JSON.stringify(players), b.maxPlayers, created, now(), JSON.stringify(health), b.mode === 'pvp' ? b.variant === 'ffa' ? 'ffa' : 'tdm' : null);
      db.prepare('INSERT INTO room_runtime VALUES(?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET generation=excluded.generation,revision=excluded.revision,signature=excluded.signature,details=excluded.details').run(b.roomId, generation, revision, signature, JSON.stringify(details));
      db.prepare("UPDATE room_command_results SET state='noop',outcome='房间或成员已经变化，请刷新后确认。',updated=? WHERE state='queued' AND (generation!=? OR revision!=?) AND command_id IN (SELECT id FROM room_commands WHERE room_id=?)").run(now(), generation, revision, b.roomId);
      if (b.state === 'closed') db.prepare("UPDATE room_command_results SET state='noop',outcome='房间已经关闭。',updated=? WHERE state='queued' AND command_id IN (SELECT id FROM room_commands WHERE room_id=?)").run(now(), b.roomId);
    })();
    if (Math.floor(now() / 86400000) !== cleanupDay) {
      cleanupDay = Math.floor(now() / 86400000);
      expireRoomCommands(c);
      const cutoff = now() - 30 * 86400000;
      db.transaction(() => {
        const commands = db.prepare("DELETE FROM room_commands WHERE created<? AND NOT EXISTS(SELECT 1 FROM room_command_results r WHERE r.command_id=room_commands.id AND r.state IN ('queued','executing'))").run(cutoff).changes;
        const rooms = db.prepare("DELETE FROM online_rooms WHERE state='closed' AND updated<? AND NOT EXISTS(SELECT 1 FROM room_commands q WHERE q.room_id=online_rooms.id)").run(cutoff).changes;
        db.prepare('DELETE FROM room_runtime WHERE NOT EXISTS(SELECT 1 FROM online_rooms r WHERE r.id=room_runtime.room_id)').run();
        if (rooms || commands) c.audit('room-metadata-retention', 'rooms', {rooms, commands, days: 30}, 'system');
      })();
    }
    return {ok: true, maintenance: maintenance(), generation, revision};
  });
  app.get('/internal/multiplayer/rooms/:id/commands', req => {
    internal(req); expireRoomCommands(c);
    const q = req.query as any;
    const runtime = db.prepare('SELECT generation,details FROM room_runtime WHERE room_id=?').get(params(req).id) as any;
    if (!runtime || q.controlVersion !== '1' || q.generation !== runtime.generation || !JSON.parse(runtime.details).commandCapable)
      return {commands: [], maintenance: maintenance()};
    return {commands: db.prepare("SELECT q.id,q.action,q.player_id playerId,q.reason,r.generation,r.revision,r.expires FROM room_commands q JOIN room_command_results r ON r.command_id=q.id WHERE q.room_id=? AND r.state='queued' AND r.expires>? ORDER BY q.created LIMIT 20").all(params(req).id, now()), maintenance: maintenance()};
  });
  app.post('/internal/multiplayer/rooms/:id/commands/:commandId/claim', req => {
    internal(req); expireRoomCommands(c);
    const p = params(req), b = body(req);
    return db.transaction(() => {
      const command = db.prepare('SELECT q.*,r.state,r.expires,r.generation,r.revision FROM room_commands q JOIN room_command_results r ON r.command_id=q.id WHERE q.id=? AND q.room_id=?').get(p.commandId, p.id) as any;
      if (!command || command.state !== 'queued') return {execute: false};
      const row = db.prepare('SELECT * FROM online_rooms WHERE id=?').get(p.id);
      const room = row ? roomView(c, row) : null;
      if (!room?.actionable || room.generation !== b.generation || command.generation !== room.generation || room.revision !== command.revision || b.revision !== command.revision || command.player_id && !room.players.some((m: any) => m.playerId === command.player_id)) {
        db.prepare("UPDATE room_command_results SET state='noop',outcome='房间或成员已经变化，请刷新后确认。',updated=? WHERE command_id=?").run(now(), p.commandId);
        return {execute: false};
      }
      db.prepare("UPDATE room_command_results SET state='executing',updated=? WHERE command_id=? AND state='queued'").run(now(), p.commandId);
      return {execute: true, expires: command.expires};
    })();
  });
  app.post('/internal/multiplayer/rooms/:id/commands/:commandId/ack', req => {
    internal(req);
    const p = params(req), b = body(req);
    if (!['executed', 'noop', 'failed'].includes(b.state)) throw new AppError('REQUEST', '请提供实际执行结果。');
    return db.transaction(() => {
      const row = db.prepare('SELECT q.*,r.state,r.generation,r.ban_minutes,r.actor FROM room_commands q JOIN room_command_results r ON r.command_id=q.id WHERE q.id=? AND q.room_id=?').get(p.commandId, p.id) as any;
      if (!row || row.generation !== b.generation) throw new AppError('ROOM_COMMAND', '操作已经失效。', 409);
      if (terminal.has(row.state)) return {ok: true, state: row.state, duplicate: true};
      if (row.state !== 'executing') throw new AppError('ROOM_COMMAND', '操作尚未开始。', 409);
      const outcomes: Record<string, string> = {executed: '操作已执行。', noop: '目标或房间已经变化，未再执行。', failed: '工作进程未完成操作，请刷新状态后确认。'};
      db.prepare('UPDATE room_command_results SET state=?,outcome=?,updated=? WHERE command_id=?').run(b.state, outcomes[b.state], now(), p.commandId);
      if (b.state === 'executed' && row.action === 'temp-ban' && db.prepare('SELECT 1 FROM players WHERE id=?').get(row.player_id))
        db.prepare('INSERT INTO multiplayer_bans VALUES(?,?,?) ON CONFLICT(player_id) DO UPDATE SET expires=excluded.expires,reason=excluded.reason').run(row.player_id, now() + row.ban_minutes * 60000, row.reason);
      c.audit('room-command-result', p.id, {commandId: p.commandId, state: b.state}, row.actor);
      return {ok: true, state: b.state};
    })();
  });
}
