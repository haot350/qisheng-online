import {MODE_UNAVAILABLE_MESSAGE, type ModeEntry} from '@qisheng/shared/operations';

export interface AdmissionMode {mode?: string; variant?: string;}
export interface ModeGate {enabled: boolean; reason: string; revision: number;}
export type GateLookup = (entry: ModeEntry) => Promise<ModeGate>;

export function onlineModeEntry(options: AdmissionMode): ModeEntry {
  if (options.mode === 'coop') return 'escape-coop';
  if (options.mode === 'pvp' && options.variant === 'tdm') return 'escape-tdm';
  if (options.mode === 'pvp' && options.variant === 'ffa') return 'escape-ffa';
  throw Object.assign(Error('MODE_MISMATCH'), {code: 'MODE_MISMATCH', status: 409, publicMessage: '房间玩法已变化，请重新打开。'});
}

/** Call before reservation, again at admission, and before each new round.
 * Reconnect to an already verified seat deliberately does not use this gate.
 */
export async function requireModeAdmission(lookup: GateLookup, requested: AdmissionMode, actual?: AdmissionMode): Promise<ModeEntry> {
  if (actual && actual.mode !== requested.mode) throw Object.assign(Error('MODE_MISMATCH'), {code: 'MODE_MISMATCH', status: 409, publicMessage: '房间玩法已变化，请重新打开。'});
  const entry = onlineModeEntry(actual ?? requested), result = await lookup(entry);
  if (typeof result?.enabled !== 'boolean' || !Number.isSafeInteger(result.revision)) throw Object.assign(Error('CONTROL_UNAVAILABLE'), {code: 'CONTROL_UNAVAILABLE', status: 503, publicMessage: '暂时无法确认房间状态，请稍后重试。'});
  if (!result.enabled) throw Object.assign(Error('MODE_DISABLED'), {code: 'MODE_DISABLED', status: 403, publicMessage: typeof result.reason === 'string' && result.reason.trim() ? result.reason.slice(0, 300) : MODE_UNAVAILABLE_MESSAGE});
  return entry;
}

export function publicAdmissionError(error: unknown): {code: string; message: string; status: number} {
  const e = error as {code?: string; publicMessage?: string};
  if (e?.code === 'MODE_DISABLED') return {code: 'MODE_DISABLED', message: e.publicMessage || MODE_UNAVAILABLE_MESSAGE, status: 403};
  if (e?.code === 'MODE_MISMATCH') return {code: 'MODE_MISMATCH', message: '房间玩法已变化，请重新打开。', status: 409};
  return {code: 'JOIN_UNAVAILABLE', message: '暂时无法加入，请重试。', status: 503};
}
