export type LoadingIdentity = { epoch: number; generation: number };
export type LoadingReport = { epoch: number; ready: boolean; scopeReady: boolean };
export type LoadingObservation = { blocked: boolean; failed?: boolean; combatReady?: boolean };
export type FrameLoadingState = { blocked: boolean; failed: boolean; scopeReady: boolean };
type LoadingFrame = LoadingIdentity & { token: number; blocked: boolean; failed: boolean; scopeReady: boolean; observed: number };

/** All required views in one display frame must agree before control is released. */
export class FrameLoadingGate {
  private serial = 0;
  private identity: LoadingIdentity | undefined;
  private frame: LoadingFrame | undefined;
  private sent: (LoadingReport & { generation: number }) | undefined;
  private heldBlocked = true;
  private heldScope = false;
  private retryAt = -Infinity;
  private retryPending = false;
  constructor(private readonly send: (report: LoadingReport) => boolean | void) {}
  private same(a: LoadingIdentity | undefined, b: LoadingIdentity) {
    return a?.epoch === b.epoch && a.generation === b.generation;
  }
  begin(identity: LoadingIdentity): number {
    if (!this.same(this.identity, identity)) this.invalidate();
    this.identity = { ...identity };
    this.frame = { ...identity, token: ++this.serial, blocked: false, failed: false, scopeReady: true, observed: 0 };
    return this.serial;
  }
  /** Invalidated frames cannot unlock a new life, loading epoch or connection. */
  invalidate() {
    this.serial++;
    this.frame = undefined;
    this.identity = undefined;
    this.sent = undefined;
    this.heldBlocked = true;
    this.heldScope = false;
    this.retryAt = -Infinity;
    this.retryPending = false;
  }
  cancelFrame() { this.serial++; this.frame = undefined; }
  state(): FrameLoadingState {
    return { blocked: this.heldBlocked || !!this.frame?.blocked, failed: !!this.frame?.failed,
      scopeReady: this.heldScope && this.frame?.scopeReady !== false };
  }
  private commit(ready: boolean, scopeReady: boolean, force = false) {
    const identity = this.identity;
    if (!identity) return;
    if (!force && this.sent?.epoch === identity.epoch && this.sent.generation === identity.generation &&
        this.sent.ready === ready && this.sent.scopeReady === scopeReady) return;
    const report = { epoch: identity.epoch, ready, scopeReady };
    if (this.send(report) !== false) this.sent = { ...report, generation: identity.generation };
  }
  observe(token: number, status: LoadingObservation): FrameLoadingState {
    const frame = this.frame;
    if (!frame || frame.token !== token) return this.state();
    frame.observed++;
    frame.blocked ||= status.blocked || status.failed === true;
    frame.failed ||= status.failed === true;
    frame.scopeReady &&= status.combatReady !== false;
    // Restrictions are immediate. Earlier ready views must never undo them.
    if (frame.blocked || !frame.scopeReady)
      this.commit(frame.blocked ? false : this.sent?.ready === true, frame.scopeReady && !frame.blocked);
    return this.state();
  }
  finish(token: number, identity: LoadingIdentity, now: number): FrameLoadingState {
    const frame = this.frame;
    if (!frame || frame.token !== token || !this.same(frame, identity) || !this.same(this.identity, identity))
      return this.state();
    const waitingRetry = this.retryPending && now < this.retryAt;
    this.heldBlocked = frame.observed === 0 || frame.blocked || waitingRetry;
    this.heldScope = !this.heldBlocked && frame.scopeReady;
    this.commit(!this.heldBlocked, this.heldScope, this.retryPending && !waitingRetry);
    if (!waitingRetry) this.retryPending = false;
    this.frame = undefined;
    return { blocked: this.heldBlocked, failed: frame.failed, scopeReady: this.heldScope };
  }
  /** A server-side budget refusal stays closed until a fresh complete frame passes. */
  retry(epoch: number, retryAfterMs: number, now: number): boolean {
    if (!this.identity || this.identity.epoch !== epoch || !Number.isSafeInteger(epoch) ||
        !Number.isFinite(retryAfterMs) || retryAfterMs < 0) return false;
    this.cancelFrame();
    this.heldBlocked = true;
    this.heldScope = false;
    this.retryAt = now + Math.min(1000, Math.max(100, retryAfterMs));
    this.retryPending = true;
    // The server has already applied this restriction; do not echo it into its budget.
    this.sent = { ...this.identity, ready: false, scopeReady: false };
    return true;
  }
}
