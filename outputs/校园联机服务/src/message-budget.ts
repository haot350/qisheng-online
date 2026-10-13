type Bucket = { tokens: number; at: number };
type Category = 'input' | 'loading' | 'control';
const LIMITS: Record<Category, { rate: number; burst: number }> = {
  input: { rate: 60, burst: 90 },
  loading: { rate: 30, burst: 45 },
  control: { rate: 20, burst: 30 },
};

/** Separate budgets prevent valid input and scene readiness from consuming each other's quota. */
export class PlayerMessageBudget {
  private readonly clients = new WeakMap<object, Partial<Record<Category, Bucket>>>();
  private readonly retryAt = new WeakMap<object, number>();
  take(client: object, type: string, now = performance.now()): boolean {
    const category: Category = type === 'input' ? 'input' : type === 'loading' ? 'loading' : 'control';
    const limit = LIMITS[category];
    let state = this.clients.get(client);
    if (!state) { state = {}; this.clients.set(client, state); }
    const old = state[category];
    const at = Number.isFinite(now) ? Math.max(old?.at ?? now, now) : (old?.at ?? 0);
    const tokens = old ? Math.min(limit.burst, old.tokens + (at - old.at) * limit.rate / 1000) : limit.burst;
    state[category] = { tokens: Math.max(0, tokens - 1), at };
    return tokens >= 1;
  }
  retry(client: object, now = performance.now()): boolean {
    if (now - (this.retryAt.get(client) ?? -Infinity) < 1000) return false;
    this.retryAt.set(client, now); return true;
  }
  release(client: object): void { this.clients.delete(client); this.retryAt.delete(client); }
}
