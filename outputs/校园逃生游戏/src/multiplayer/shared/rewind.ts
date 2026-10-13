/** Server-owned bounds for the historical frame a connection may use to shoot. */
export const REWIND_LIMIT_TICKS = 15;
export function sanitizeRewindTick(value: unknown, currentTick: number) {
  return Math.max(0, currentTick - REWIND_LIMIT_TICKS, Math.min(currentTick,
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : currentTick));
}
export type RewindDecision = { accepted: boolean; tick: number; reason?: 'unsent' | 'stale' | 'future' | 'outside-window' | 'invalid' };
export class ServerRewindWindow {
  private firstTick = -1;
  private latestTick = -1;
  private sentAt = -Infinity;
  private rtt = 0;
  reset() { this.firstTick = -1; this.latestTick = -1; this.sentAt = -Infinity; this.rtt = 0; }
  recordSnapshot(tick: number, atMs: number) {
    if (Number.isSafeInteger(tick) && tick >= this.latestTick && Number.isFinite(atMs)) {
      if (this.firstTick < 0) this.firstTick = tick;
      this.latestTick = tick; this.sentAt = atMs;
    }
  }
  // This value comes from an echoed server nonce, never a client-reported ping.
  recordRTT(ms: number) {
    if (Number.isFinite(ms) && ms >= 0 && ms <= 5000) this.rtt = this.rtt ? this.rtt * .7 + Math.min(500, ms) * .3 : Math.min(500, ms);
  }
  authorize(requested: unknown, currentTick: number, atMs: number): RewindDecision {
    const oneWayTicks = this.rtt / 2000 * 60;
    const trusted = sanitizeRewindTick(Math.max(this.firstTick, Math.min(this.latestTick, currentTick - oneWayTicks - 6)), currentTick);
    if (this.latestTick < 0) return { accepted: false, tick: currentTick, reason: 'unsent' };
    if (atMs - this.sentAt > 500) return { accepted: false, tick: trusted, reason: 'stale' };
    if (typeof requested !== 'number' || !Number.isFinite(requested)) return { accepted: false, tick: trusted, reason: 'invalid' };
    if (requested > this.latestTick || requested > currentTick) return { accepted: false, tick: trusted, reason: 'future' };
    if (requested < this.firstTick) return { accepted: false, tick: trusted, reason: 'unsent' };
    // 75–150ms adaptive render buffering plus 3 ticks of scheduling jitter.
    // No low-ping client may arbitrarily select the full 250ms history.
    const earliest = Math.max(this.firstTick, currentTick - REWIND_LIMIT_TICKS, currentTick - Math.ceil(oneWayTicks + 9 + 3));
    const latest = Math.min(this.latestTick, currentTick - Math.max(0, Math.floor(oneWayTicks + 4.5 - 3)));
    if (requested < earliest || requested > latest) return { accepted: false, tick: trusted, reason: 'outside-window' };
    return { accepted: true, tick: sanitizeRewindTick(requested, currentTick) };
  }
}
