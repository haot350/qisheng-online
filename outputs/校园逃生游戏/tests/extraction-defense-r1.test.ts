import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtractionDefense, EXTRACTION_DEFENSE_RULES as RULES, type ExtractionDefender, type ExtractionDefenseProbe } from '../src/escape/extraction-defense.ts';
import { EscapeTactics, type TacticalAgent } from '../src/escape/tactics.ts';
import type { EscapeVec3 } from '../src/escape/types.ts';

const center: EscapeVec3 = [0, 0, 0];
const agent = (id: number, changes: Partial<ExtractionDefender> = {}): ExtractionDefender => ({ id, position: [20, 0, id * 3], active: true, sees: false, known: null, busy: false, ...changes });
const open: ExtractionDefenseProbe = { project: point => [...point], route: (_id, from, to) => [[...from], [...to]], safe: () => true };
const assigned = (defense: ExtractionDefense, agents: ExtractionDefender[]) => agents.filter(a => defense.goal(a.id));

test('撤离开启只分配少量圈外独占位置，其他NPC保留普通巡逻', () => {
  for (const [difficulty, limit] of [['easy', 1], ['standard', 2], ['hard', 2]] as const) {
    const defense = new ExtractionDefense(), agents = Array.from({ length: 9 }, (_, id) => agent(id));
    defense.update(.1, false, center, difficulty, agents, open);
    assert.equal(assigned(defense, agents).length, 0);
    defense.update(.1, true, center, difficulty, agents, open);
    const chosen = assigned(defense, agents);
    assert.equal(chosen.length, limit);
    const goals = chosen.map(a => defense.goal(a.id)!);
    for (const goal of goals) assert.ok(Math.hypot(goal[0], goal[2]) >= 9 && Math.hypot(goal[0], goal[2]) <= 15);
    if (goals.length === 2) assert.ok(Math.hypot(goals[0][0] - goals[1][0], goals[0][2] - goals[1][2]) >= RULES.spacing);
  }
});

test('真实视觉、声音或队友线索立即释放拦截，继续既有追击和搜索', () => {
  const defense = new ExtractionDefense(), a = agent(0);
  defense.update(.1, true, center, 'easy', [a], open);
  assert.ok(defense.goal(a.id));
  for (const sees of [true, false]) {
    const observed = { ...a, sees, known: [20, 0, 20] as EscapeVec3 };
    defense.update(.01, true, center, 'easy', [observed], open);
    assert.equal(defense.goal(a.id), null, 'release does not wait for the planning clock');
    const frame: TacticalAgent = { ...observed, hasSeen: sees, memory: 7, reloading: false, needsReload: false, attackPhase: 'search', patrolTarget: [40, 0, 0], weapon: 'm4a1' };
    const tactics = new EscapeTactics();
    tactics.update(.1, [frame], 'easy');
    const choice = tactics.decide(frame, { project: p => [...p], route: (from, to) => [[...from], [...to]], safe: () => true, visible: () => true }, [frame]);
    assert.equal(choice.state, sees ? 'chase' : 'investigate');
    assert.deepEqual(choice.goal, observed.known);
  }
});

test('楼层、投影偏移、不完整路线及不安全路线不会成为拦截位置', () => {
  const invalid: ExtractionDefenseProbe[] = [
    { ...open, project: p => [p[0], 3, p[2]] },
    { ...open, project: p => [p[0] + 5, p[1], p[2]] },
    { ...open, project: () => [0, 0, 0] },
    { ...open, route: (_id, from) => [[...from]] },
    { ...open, route: () => [] },
    { ...open, safe: () => false },
  ];
  for (const probe of invalid) {
    const defense = new ExtractionDefense(), agents = [agent(0), agent(1)];
    for (let i = 0; i < 5; i++) defense.update(.5, true, center, 'standard', agents, probe);
    assert.equal(assigned(defense, agents).length, 0);
  }
});

test('实际可通行候选被选择，邻近NPC和其他槽位不能同时占同一点', () => {
  const defense = new ExtractionDefense(), agents = [agent(0), agent(1), agent(2, { position: [12, 0, 0], known: [15, 0, 0] })];
  defense.update(.5, true, center, 'standard', agents, {
    ...open,
    project: p => p[2] >= 0 ? [...p] : null,
    route: (id, from, to) => { assert.ok(to[2] >= 0); assert.notDeepEqual(to, agents[2].position); return open.route(id, from, to); },
  });
  assert.equal(assigned(defense, agents).length, 2);
  assert.equal(defense.goal(2), null);
});

test('抵达后保留分散槽位，读出的坐标不能修改内部状态，不反复做导航查询', () => {
  const defense = new ExtractionDefense(), a = agent(0);
  let routes = 0;
  const probe = { ...open, route: (id: number, from: EscapeVec3, to: EscapeVec3) => { routes++; return open.route(id, from, to); } };
  defense.update(.1, true, center, 'easy', [a], probe);
  const goal = defense.goal(0)!;
  const arrived = { ...a, position: [...goal] as EscapeVec3 };
  goal[0] = 999;
  for (let i = 0; i < 240; i++) defense.update(1 / 60, true, center, 'easy', [arrived], probe);
  assert.deepEqual(defense.goal(0), arrived.position);
  assert.equal(routes, 1);
});

test('受阻、倒下或技能开始及时退还槽位；重开清理旧位置', () => {
  const defense = new ExtractionDefense(), a = agent(0);
  defense.update(.1, true, center, 'easy', [a], open);
  defense.blocked(0);
  defense.update(.5, true, center, 'easy', [a], open);
  assert.equal(defense.goal(0), null);
  defense.update(5, true, center, 'easy', [a], open);
  assert.ok(defense.goal(0));
  defense.update(.01, true, center, 'easy', [{ ...a, busy: true }], open);
  assert.equal(defense.goal(0), null);
  defense.update(.5, true, center, 'easy', [a], open);
  assert.ok(defense.goal(0));
  defense.update(.01, true, center, 'easy', [{ ...a, active: false }], open);
  assert.equal(defense.goal(0), null);
  defense.update(.5, true, center, 'easy', [a], open);
  assert.ok(defense.goal(0));
  defense.reset();
  assert.equal(defense.goal(0), null);
});

test('查询预算有界，最近NPC无法规划时其他NPC仍能获得有效槽位', () => {
  const defense = new ExtractionDefense(), agents = Array.from({ length: 9 }, (_, id) => agent(id));
  let projects = 0, routes = 0;
  const probe = { ...open, project: (point: EscapeVec3) => { projects++; return open.project(point); }, route: (id: number, from: EscapeVec3, to: EscapeVec3) => { routes++; return id < 4 ? [] : open.route(id, from, to); } };
  for (let turn = 0; turn < 6; turn++) {
    projects = routes = 0;
    defense.update(.5, true, center, 'standard', agents, probe);
    assert.ok(projects <= RULES.projectBudget);
    assert.ok(routes <= RULES.routeBudget);
    const before = { projects, routes };
    defense.update(.01, true, center, 'standard', agents, probe);
    assert.deepEqual({ projects, routes }, before);
  }
  assert.equal(assigned(defense, agents).length, 2);
  assert.ok(assigned(defense, agents).every(a => a.id >= 4));
});
