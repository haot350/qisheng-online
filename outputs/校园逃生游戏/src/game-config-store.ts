import { defaultGameConfig, MODE_ENTRIES, MODE_UNAVAILABLE_MESSAGE, isModeEntry, type Announcement, type GameConfig, type ModeEntry } from '@qisheng/shared/operations';

export const GAME_CONFIG_KEY = 'qisheng-game-config-v1';
export function entryFor(mode: 'story'|'roam'|'dafei'|'escape', entry: 'single'|'coop'|'pvp' = 'single', variant: 'tdm'|'ffa' = 'tdm'): ModeEntry {
  return mode !== 'escape' ? mode : entry === 'single' ? 'escape-solo' : entry === 'coop' ? 'escape-coop' : variant === 'ffa' ? 'escape-ffa' : 'escape-tdm';
}
export class ModeUnavailableError extends Error {
  readonly code = 'MODE_DISABLED';
  constructor(readonly entry: ModeEntry, reason: string) { super(reason || MODE_UNAVAILABLE_MESSAGE); }
}
export function parseGameConfig(value: unknown): GameConfig {
  const v = value as GameConfig;
  if (!v || !Number.isSafeInteger(v.revision) || v.revision < 0 || !Number.isFinite(Date.parse(v.serverTime)) || !v.modes || !Array.isArray(v.announcements)) throw Error('Invalid game configuration');
  const modes = defaultGameConfig().modes;
  for (const id of MODE_ENTRIES) {
    const row = v.modes[id];
    if (!row || typeof row.enabled !== 'boolean' || typeof row.reason !== 'string') throw Error('Incomplete game configuration');
    modes[id] = { enabled: row.enabled, reason: row.reason.slice(0, 500) };
  }
  const announcements: Announcement[] = v.announcements.slice(0, 100).map(a => {
    if (!a || typeof a.id !== 'string' || !Number.isSafeInteger(a.revision) || typeof a.title !== 'string' || typeof a.body !== 'string' || !['normal','important'].includes(a.priority) || !Array.isArray(a.audiences) || !a.audiences.every(isModeEntry) || !Number.isFinite(Date.parse(a.startsAt)) || !Number.isFinite(Date.parse(a.publishedAt)) || a.endsAt !== null && !Number.isFinite(Date.parse(a.endsAt))) throw Error('Invalid announcement');
    return { ...a, link: typeof a.link === 'string' && /^\/(?!\/)/.test(a.link) && !/[\\\r\n]/.test(a.link) ? a.link : null };
  });
  return { revision: v.revision, serverTime: v.serverTime, modes, announcements };
}
type StorageLike = Pick<Storage, 'getItem'|'setItem'>;
export type GameConfigDiagnostics = {
  attempts: number;
  failures: number;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  revision: number;
  lastFailure: { stage: 'request'|'response'|'parse'; status: number | null; name: string } | null;
};
export class GameConfigStore {
  private listeners = new Set<() => void>();
  private pending: Promise<GameConfig> | null = null;
  private offset = 0;
  private state: { config: GameConfig; ready: boolean };
  private request: typeof fetch;
  private diagnosticState: GameConfigDiagnostics;
  constructor(private url: string, request: typeof fetch = globalThis.fetch, private storage?: StorageLike, private now = Date.now) {
    // Browser fetch must retain its Window receiver rather than the store instance.
    this.request = (input, init) => request.call(globalThis, input, init);
    let config = defaultGameConfig(now());
    try {
      const saved = JSON.parse(storage?.getItem(GAME_CONFIG_KEY) || 'null');
      if (saved && Number.isFinite(saved.savedAt)) { config = parseGameConfig(saved.config); this.offset = Date.parse(config.serverTime) - saved.savedAt; }
    } catch { /* Browser storage is optional. */ }
    this.state = { config, ready: false };
    this.diagnosticState = { attempts: 0, failures: 0, lastAttemptAt: null, lastSuccessAt: null, revision: config.revision, lastFailure: null };
  }
  snapshot = () => this.state;
  diagnostics = (): GameConfigDiagnostics => ({ ...this.diagnosticState, lastFailure: this.diagnosticState.lastFailure ? { ...this.diagnosticState.lastFailure } : null });
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  available(entry: ModeEntry) { return this.state.config.modes[entry].enabled; }
  serverNow() { return this.now() + this.offset; }
  assert(entry: ModeEntry) { const mode = this.state.config.modes[entry]; if (!mode.enabled) throw new ModeUnavailableError(entry, mode.reason); }
  active(entry?: ModeEntry) {
    const at = this.now() + this.offset;
    return this.state.config.announcements.filter(a => Date.parse(a.startsAt) <= at && (!a.endsAt || Date.parse(a.endsAt) > at) && (!entry || a.audiences.length === 0 || a.audiences.includes(entry)))
      .sort((a,b) => Number(b.priority === 'important') - Number(a.priority === 'important') || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  }
  refresh(): Promise<GameConfig> {
    if (this.pending) return this.pending;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000);
    this.diagnosticState.attempts++;
    this.diagnosticState.lastAttemptAt = this.now();
    this.pending = (async () => {
      let stage: 'request'|'response'|'parse' = 'request';
      let status: number | null = null;
      try {
        const response = await this.request(this.url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
        stage = 'response'; status = response.status;
        if (!response.ok) throw Error('Configuration unavailable');
        stage = 'parse';
        const config = parseGameConfig(await response.json());
        // A delayed edge response cannot overwrite a later operational revision.
        if (config.revision >= this.state.config.revision) {
          this.offset = Date.parse(config.serverTime) - this.now();
          this.state = { config, ready: true };
          try { this.storage?.setItem(GAME_CONFIG_KEY, JSON.stringify({ config, savedAt: this.now() })); } catch {}
        }
        this.diagnosticState.lastSuccessAt = this.now();
        this.diagnosticState.revision = this.state.config.revision;
        this.diagnosticState.lastFailure = null;
      } catch (error) {
        // Diagnostic metadata stays separate from player-facing policy and contains no response body or URL.
        this.diagnosticState.failures++;
        const name = error instanceof Error && /^[\w.-]{1,80}$/.test(error.name) ? error.name : 'Error';
        this.diagnosticState.lastFailure = { stage, status, name };
        // Keep the last known policy; first-time offline single-player remains available.
      }
      finally {
        clearTimeout(timer); this.pending = null;
        this.state = { ...this.state, ready: true };
        for (const fn of this.listeners) fn();
      }
      return this.state.config;
    })();
    return this.pending;
  }
  async check(entry: ModeEntry) { await this.refresh(); this.assert(entry); }
}
