/** A UI operation belongs to one engine and one generation. */
export type SessionTicket<T> = Readonly<{ generation: number; owner: T }>;

export class SessionOperations<T> {
  private generation = 0;
  private active: SessionTicket<T> | null = null;

  get revision() {
    return this.generation;
  }
  get busy() {
    return this.active !== null;
  }

  begin(owner: T): SessionTicket<T> | null {
    if (this.active) return null;
    this.active = Object.freeze({ generation: ++this.generation, owner });
    return this.active;
  }

  current(ticket: SessionTicket<T>, owner: T | null) {
    return (
      this.active === ticket &&
      ticket.generation === this.generation &&
      ticket.owner === owner
    );
  }

  finish(ticket: SessionTicket<T>, owner: T | null) {
    if (!this.current(ticket, owner)) return false;
    this.active = null;
    return true;
  }

  cancel() {
    this.generation++;
    this.active = null;
  }
}

/** Resources are accepted only while their scene is alive; late results release once. */
export class SessionScope {
  readonly controller = new AbortController();
  private releases = new Set<() => void>();
  get signal() {
    return this.controller.signal;
  }
  get active() {
    return !this.signal.aborted;
  }

  own(dispose: () => void) {
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      this.releases.delete(release);
      dispose();
    };
    if (!this.active) release();
    else this.releases.add(release);
    return release;
  }

  close() {
    if (!this.active) return;
    // Invalidate continuations before callbacks publish or start more async work.
    this.controller.abort();
    const failures: unknown[] = [];
    for (const release of [...this.releases].reverse()) {
      try {
        release();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      console.warn("Session cleanup failed", new AggregateError(failures));
  }
}

/** Handoff retains a single preparation lease and never releases its successor. */
export class ResourceSlot {
  private release: (() => void) | null = null;
  replace(next: () => void) {
    this.clear();
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      if (this.release === release) this.release = null;
      next();
    };
    this.release = release;
    return release;
  }
  clear() {
    this.release?.();
  }
}
