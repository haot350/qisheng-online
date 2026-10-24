import type { EscapeDifficulty, EscapeVec3 } from './types.ts';

export interface ExtractionDefender {
  id: number;
  position: EscapeVec3;
  active: boolean;
  sees: boolean;
  known: EscapeVec3 | null;
  busy: boolean;
}

export interface ExtractionDefenseProbe {
  project(point: EscapeVec3): EscapeVec3 | null;
  route(id: number, from: EscapeVec3, to: EscapeVec3): EscapeVec3[];
  safe(points: EscapeVec3[]): boolean;
}

export const EXTRACTION_DEFENSE_RULES = Object.freeze({
  limit: { easy: 1, standard: 2, hard: 2 },
  minRadius: 9,
  maxRadius: 15,
  spacing: 3,
  planInterval: 0.5,
  recheckInterval: 3,
  blockedCooldown: 5,
  projectBudget: 8,
  routeBudget: 3,
});

type Slot = { point: EscapeVec3; checkAt: number };
const copy = (point: EscapeVec3): EscapeVec3 => [...point];
const distance = (a: EscapeVec3, b: EscapeVec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const horizontal = (a: EscapeVec3, b: EscapeVec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const idle = (agent: ExtractionDefender) => agent.active && !agent.sees && !agent.known && !agent.busy;

/** Strategic fallback only: observed players and investigation clues always take priority. */
export class ExtractionDefense {
  private time = 0;
  private clock = 0;
  private center: EscapeVec3 | null = null;
  private slots = new Map<number, Slot>();
  private cursors = new Map<number, number>();
  private attemptedAt = new Map<number, number>();
  private blockedUntil = new Map<number, number>();

  reset() {
    this.time = 0;
    this.clock = 0;
    this.center = null;
    this.slots.clear();
    this.cursors.clear();
    this.attemptedAt.clear();
    this.blockedUntil.clear();
  }

  goal(id: number): EscapeVec3 | null {
    const slot = this.slots.get(id);
    return slot ? copy(slot.point) : null;
  }

  blocked(id: number) {
    if (!this.slots.delete(id)) return;
    this.blockedUntil.set(id, this.time + EXTRACTION_DEFENSE_RULES.blockedCooldown);
  }

  update(dt: number, available: boolean, center: EscapeVec3, difficulty: EscapeDifficulty, agents: readonly ExtractionDefender[], probe: ExtractionDefenseProbe) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('撤离调度时间步长必须为有限非负数。');
    if (!available) { this.reset(); return; }
    if (this.center && distance(this.center, center) > 0.2) this.reset();
    this.center = copy(center);
    this.time += dt;
    const active = new Map(agents.filter(idle).map(agent => [agent.id, agent]));
    for (const id of this.slots.keys()) if (!active.has(id)) this.slots.delete(id);
    for (const id of this.cursors.keys()) if (!active.has(id)) this.cursors.delete(id);
    for (const id of this.attemptedAt.keys()) if (!active.has(id)) this.attemptedAt.delete(id);
    for (const [id, until] of this.blockedUntil) if (until <= this.time || !agents.some(agent => agent.id === id && agent.active)) this.blockedUntil.delete(id);
    const limit = EXTRACTION_DEFENSE_RULES.limit[difficulty];
    for (const id of [...this.slots.keys()].slice(limit)) this.slots.delete(id);
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = EXTRACTION_DEFENSE_RULES.planInterval;
    let projects = 0, routes = 0;
    const reachable = (agent: ExtractionDefender, point: EscapeVec3) => {
      if (distance(agent.position, point) < 0.65) return probe.safe([copy(agent.position), copy(point)]);
      if (routes >= EXTRACTION_DEFENSE_RULES.routeBudget) return false;
      routes++;
      const route = probe.route(agent.id, agent.position, point);
      return route.length > 0 && distance(route[route.length - 1], point) <= 0.75 && probe.safe([copy(agent.position), ...route]);
    };
    // Recheck one retained route per planning turn; arrivals keep their own slot.
    const check = [...this.slots].find(([, slot]) => slot.checkAt <= this.time);
    if (check) {
      const [id, slot] = check;
      if (!reachable(active.get(id)!, slot.point)) this.blocked(id);
      else slot.checkAt = this.time + EXTRACTION_DEFENSE_RULES.recheckInterval;
    }
    const candidates = [...active.values()].filter(agent => !this.slots.has(agent.id) && !this.blockedUntil.has(agent.id))
      .sort((a, b) => (this.attemptedAt.get(a.id) ?? -Infinity) - (this.attemptedAt.get(b.id) ?? -Infinity) || horizontal(a.position, center) - horizontal(b.position, center) || a.id - b.id);
    for (const agent of candidates) {
      if (this.slots.size >= limit || projects >= EXTRACTION_DEFENSE_RULES.projectBudget || routes >= EXTRACTION_DEFENSE_RULES.routeBudget) break;
      this.attemptedAt.set(agent.id, this.time);
      const bearing = Math.atan2(agent.position[2] - center[2], agent.position[0] - center[0]);
      let attempts = 0;
      while (attempts++ < 3 && projects < EXTRACTION_DEFENSE_RULES.projectBudget && routes < EXTRACTION_DEFENSE_RULES.routeBudget) {
        const cursor = this.cursors.get(agent.id) ?? 0;
        this.cursors.set(agent.id, (cursor + 1) % 48);
        const radius = [12, 14.5, 9.5][Math.floor(cursor / 16)];
        const angle = bearing + cursor % 16 * Math.PI / 8;
        const raw: EscapeVec3 = [center[0] + Math.cos(angle) * radius, center[1], center[2] + Math.sin(angle) * radius];
        projects++;
        const point = probe.project(raw);
        if (!point || !point.every(Number.isFinite) || distance(point, raw) > 1.6 || Math.abs(point[1] - center[1]) > 0.65) continue;
        const gateDistance = horizontal(point, center);
        if (gateDistance < EXTRACTION_DEFENSE_RULES.minRadius || gateDistance > EXTRACTION_DEFENSE_RULES.maxRadius ||
          [...this.slots.values()].some(slot => horizontal(slot.point, point) < EXTRACTION_DEFENSE_RULES.spacing) ||
          agents.some(other => other.active && other.id !== agent.id && distance(other.position, point) < 0.9) || !reachable(agent, point)) continue;
        this.slots.set(agent.id, { point: copy(point), checkAt: this.time + EXTRACTION_DEFENSE_RULES.recheckInterval });
        break;
      }
    }
  }
}
