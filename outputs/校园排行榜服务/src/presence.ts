import {body, hash, random, type Context} from './app.js';
import {accountFor} from './accounts.js';
import {AppError} from './validation.js';
import type {PresenceReceipt, PresenceSummary} from '@qisheng/shared/operations-observability';

const TTL = 90000;
const LIMIT = 20000;
type Visit = {account: string | null; client: 'web' | 'native'; seen: number};
const instances = new WeakMap<Context, PresenceTracker>();

export class PresenceTracker {
  private visits = new Map<string, Visit>();
  private lastMinute = -1;
  private lastPrune = -Infinity;
  readonly startedAt: number;
  constructor(private c: Context) {this.startedAt = c.now();}
  private prune(force = false) {
    if (!force && this.c.now() - this.lastPrune < 5000) return;
    this.lastPrune = this.c.now();
    const deadline = this.c.now() - TTL;
    for (const [key, v] of this.visits) if (v.seen <= deadline) this.visits.delete(key);
  }
  heartbeat(token: unknown, client: unknown, active: unknown, account: string | null): PresenceReceipt {
    if (!['web', 'native'].includes(String(client)) || typeof active !== 'boolean' ||
      token !== undefined && (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,100}$/.test(token)))
      throw new AppError('PRESENCE', '会话状态无效。');
    this.prune();
    let sessionId = typeof token === 'string' ? token : random();
    let key = hash(sessionId);
    if ((this.visits.get(key)?.seen ?? Infinity) <= this.c.now() - TTL) this.visits.delete(key);
    if (!active) {
      this.visits.delete(key);
      return {sessionId, heartbeatSeconds: 30, expiresInSeconds: 90};
    }
    // An unknown client token is never adopted: identifiers are server-issued.
    if (!this.visits.has(key)) {sessionId = random(); key = hash(sessionId);}
    if (!this.visits.has(key) && this.visits.size >= LIMIT)
      throw new AppError('PRESENCE_BUSY', '在线统计暂时繁忙。', 503, true);
    this.visits.set(key, {client: client as Visit['client'], account, seen: this.c.now()});
    return {sessionId, heartbeatSeconds: 30, expiresInSeconds: 90};
  }
  summary(): PresenceSummary {
    this.prune(true);
    const values = [...this.visits.values()];
    const rooms = this.c.db.prepare("SELECT players FROM online_rooms WHERE state!='closed' AND updated>?").all(this.c.now() - 30000) as {players: string}[];
    let connected = 0, reserved = 0;
    for (const room of rooms) for (const member of JSON.parse(room.players)) {
      if (typeof member === 'string' || member.connected !== false) connected++;
      else reserved++;
    }
    return {
      checkedAt: this.c.now(), recovering: this.c.now() < this.startedAt + TTL,
      recoveryUntil: this.startedAt + TTL,
      activeAccounts: new Set(values.filter(v => v.account).map(v => v.account)).size,
      guestSessions: values.filter(v => !v.account).length, clientSessions: values.length,
      webSessions: values.filter(v => v.client === 'web').length,
      nativeSessions: values.filter(v => v.client === 'native').length,
      multiplayerConnected: connected, reservedSeats: reserved,
    };
  }
  aggregate() {
    const minute = Math.floor(this.c.now() / 60000) * 60000;
    if (minute === this.lastMinute) return;
    this.lastMinute = minute;
    const s = this.summary();
    // Do not store identifiers, precise activity, or incomplete restart samples.
    if (s.recovering) return;
    const day = new Date(this.c.now() + 8 * 3600000).toISOString().slice(0, 10);
    this.c.db.transaction(() => {
      this.c.db.prepare('INSERT OR REPLACE INTO presence_minutes VALUES(?,?,?,?,?,?)').run(minute, s.activeAccounts, s.guestSessions, s.clientSessions, s.webSessions, s.nativeSessions);
      this.c.db.prepare('INSERT INTO presence_daily VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET accounts_peak=max(accounts_peak,excluded.accounts_peak),guests_peak=max(guests_peak,excluded.guests_peak),sessions_peak=max(sessions_peak,excluded.sessions_peak)').run(day, s.activeAccounts, s.guestSessions, s.clientSessions);
      this.c.db.prepare('DELETE FROM presence_minutes WHERE minute<?').run(minute - 86400000);
      this.c.db.prepare('DELETE FROM presence_daily WHERE day<?').run(new Date(this.c.now() - 365 * 86400000).toISOString().slice(0, 10));
    })();
  }
}

export function presenceRoutes(c: Context) {
  const tracker = new PresenceTracker(c);
  instances.set(c, tracker);
  c.app.post('/v1/presence', {bodyLimit: 1024, config: {rateLimit: {max: 240, timeWindow: '1 minute'}}}, req => {
    const b = body(req);
    const player = c.auth(req, true);
    const account = player ? accountFor(c.db, player.id) : undefined;
    const result = tracker.heartbeat(b.sessionId, b.client, b.active, account?.status === 'active' ? account.id : null);
    tracker.aggregate();
    return result;
  });
  const timer = setInterval(() => tracker.aggregate(), 60000);
  timer.unref();
  c.app.addHook('onClose', async () => {clearInterval(timer); instances.delete(c);});
}
export const readPresence = (c: Context) => instances.get(c)!.summary();
