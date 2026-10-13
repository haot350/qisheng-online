import type { LoadingCommand, PlayerState } from './shared/protocol';

/** A locally ready frame is insufficient until authority cancelled the old input timeline. */
export class LoadingInputBarrier {
  private command?: LoadingCommand;
  private acknowledged = false;
  begin(command: LoadingCommand) {
    this.command = { ...command };
    this.acknowledged = false;
  }
  confirm(state: Pick<PlayerState, 'generation' | 'loadingEpoch' | 'loading' | 'ack' | 'actionAck'>) {
    const command = this.command;
    if (!command || state.generation !== command.generation || state.loadingEpoch !== command.epoch ||
        state.ack < command.seq || (state.actionAck ?? 0) < command.cancelActionThrough ||
        state.loading !== !command.ready) return false;
    const changed = !this.acknowledged;
    this.acknowledged = true;
    return changed && command.ready;
  }
  get blocked() { return !this.command?.ready || !this.acknowledged; }
  get pendingSequence() { return this.acknowledged ? null : this.command?.seq ?? null; }
  reset() { this.command = undefined; this.acknowledged = false; }
}

/** Stop adding obsolete continuous input; recovery still passes the loading input barrier. */
export class InputSendBudget {
  static readonly high = 128 * 1024;
  static readonly low = 32 * 1024;
  blocked = false;
  update(bufferedBytes: number) {
    const bytes = Number.isFinite(bufferedBytes) ? Math.max(0, bufferedBytes) : Infinity;
    if (this.blocked) { if (bytes <= InputSendBudget.low) this.blocked = false; }
    else if (bytes >= InputSendBudget.high) this.blocked = true;
    return this.blocked;
  }
}
