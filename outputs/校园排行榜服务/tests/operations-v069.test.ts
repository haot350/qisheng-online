import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {createApp} from '../dist/app.js';
import {DAFEI_RULE_VERSION} from '../dist/shared.js';

async function setup() {
  let time = Date.UTC(2026, 9, 10);
  const salt = 'operations-test', password = 'test-operations-password';
  const c = await createApp({dbPath: ':memory:', clock: () => time, adminPasswordHash: salt + ':' + scryptSync(password, salt, 32).toString('hex'), serviceSecret: 'operations-service-secret'});
  const req = (method, url, payload?, headers = {}) => c.app.inject({method, url, payload, headers});
  const login = async (username = 'owner') => {
    const r = await req('POST', '/admin/login', {username, password});
    assert.equal(r.statusCode, 200, r.body);
    return {cookie: String(r.headers['set-cookie']).split(';')[0], 'x-csrf-token': r.json().csrf};
  };
  const admin = await login(), internal = {'x-service-token': 'operations-service-secret'};
  const config = async () => (await req('GET', '/v1/game-config')).json();
  const close = async entry => req('POST', '/admin/game-config/modes', {expectedRevision: (await config()).revision, modes: {[entry]: {enabled: false, reason: '正在调整，请稍后再试。'}}}, admin);
  return {...c, req, login, admin, internal, config, close, now: () => time, advance: n => time += n};
}

test('seven modes migrate open and change atomically with revision, CSRF and isolated permission', async () => {
  const f = await setup(); try {
    assert.equal(f.db.pragma('user_version', {simple: true}), 5);
    const initial = await f.config();
    assert.equal(Object.keys(initial.modes).length, 7);
    assert.ok(Object.values(initial.modes).every((m: any) => m.enabled));
    assert.deepEqual(initial.announcements, []);
    assert.equal((await f.req('GET', '/v1/game-config')).headers['cache-control'], 'no-store');
    const change = {expectedRevision: 0, modes: {story: {enabled: false, reason: ''}}};
    assert.equal((await f.req('POST', '/admin/game-config/modes', change, {cookie: f.admin.cookie})).statusCode, 403);
    assert.equal((await f.req('POST', '/admin/game-config/modes', change, f.admin)).statusCode, 200);
    assert.equal((await f.req('POST', '/admin/game-config/modes', change, f.admin)).statusCode, 409);
    const next = await f.config(); assert.equal(next.revision, 1); assert.equal(next.modes.story.enabled, false); assert.equal(next.modes.dafei.enabled, true);
    await f.req('POST', '/admin/accounts', {username: 'feedback', name: '反馈处理员', password: 'test-operations-password', scopes: ['feedback']}, f.admin);
    const limited = await f.login('feedback');
    assert.equal((await f.req('GET', '/admin/game-config', undefined, limited)).statusCode, 403);
    assert.equal((await f.req('POST', '/admin/game-config/modes', {...change, expectedRevision: 1}, limited)).statusCode, 403);
    const overview = (await f.req('GET', '/admin/overview', undefined, limited)).json();
    assert.ok('feedback' in overview); for (const key of ['players', 'todayViews', 'databaseBytes', 'disabledModes', 'rooms', 'review']) assert.ok(!(key in overview));
    assert.equal(f.db.prepare("SELECT count(*) n FROM audit WHERE action='mode-availability-update'").get().n, 1);
  } finally {await f.app.close();}
});

test('announcement scheduling, priority, audiences, withdraw and private drafts never enter public responses', async () => {
  const f = await setup(); try {
    const save = async b => f.req('POST', '/admin/announcements', {expectedRevision: (await f.config()).revision, title: '校园维护通知', body: '请稍后再来体验。', audiences: [], priority: 'normal', ...b}, f.admin);
    const start = new Date(f.now()).toISOString(), future = new Date(f.now() + 60000).toISOString();
    assert.equal((await save({status: 'draft', body: 'PRIVATE-DRAFT-TEST'})).statusCode, 200);
    assert.equal((await save({status: 'published', startsAt: future, endsAt: new Date(f.now() + 120000).toISOString(), audiences: ['escape-tdm']})).statusCode, 200);
    assert.equal((await f.config()).announcements.length, 0);
    const published = await save({status: 'published', startsAt: start, priority: 'important', link: '/?help=1'});
    assert.equal(published.statusCode, 200, published.body);
    const pub = await f.config(); assert.equal(pub.announcements.length, 1); assert.equal(pub.announcements[0].priority, 'important'); assert.ok(!JSON.stringify(pub).includes('PRIVATE-DRAFT'));
    const id = pub.announcements[0].id;
    f.advance(60000); assert.equal((await f.config()).announcements.length, 2);
    f.advance(60000); assert.equal((await f.config()).announcements.length, 1);
    assert.equal((await save({id, status: 'withdrawn'})).statusCode, 200); assert.equal((await f.config()).announcements.length, 0);
    for (const link of ['https://evil.invalid', '//evil.invalid', '/admin', '/api/v1/identity', '/\\evil.invalid']) assert.equal((await save({status: 'draft', link})).statusCode, 400);
    assert.equal((await save({endsAt: new Date(f.now() - 1000).toISOString()})).statusCode, 400);
    assert.equal((await save({audiences: ['not-a-mode']})).statusCode, 400);
  } finally {await f.app.close();}
});

test('internal gate is loopback service-only and deployment maintenance never changes operational flags', async () => {
  const f = await setup(); try {
    await f.close('escape-ffa');
    const url = '/internal/operations/gate?entry=escape-ffa';
    assert.equal((await f.req('GET', url)).statusCode, 403);
    assert.equal((await f.req('GET', url, undefined, {...f.internal, 'x-forwarded-for': '127.0.0.1'})).statusCode, 403);
    assert.equal((await f.app.inject({url, headers: f.internal, remoteAddress: '203.0.113.1'})).statusCode, 403);
    const result = await f.req('GET', url, undefined, f.internal); assert.equal(result.statusCode, 200); assert.equal(result.json().enabled, false);
    for (const enabled of [true, false]) await f.req('POST', '/internal/multiplayer/maintenance', {enabled}, f.internal);
    assert.equal((await f.config()).modes['escape-ffa'].enabled, false);
  } finally {await f.app.close();}
});

test('new tickets and old unconsumed tickets enforce actual room variant while existing results remain writable', async () => {
  const f = await setup(); try {
    const player = (await f.req('POST', '/v1/identity/register', {nickname: '开关测试玩家'})).json(), auth = {authorization: 'Bearer ' + player.token};
    const room = {roomId: 'known-ffa', worker: 'w1', mode: 'pvp', variant: 'ffa', state: 'playing', players: [], maxPlayers: 8, createdAt: f.now()};
    assert.equal((await f.req('POST', '/internal/multiplayer/rooms/upsert', room, f.internal)).statusCode, 200);
    const ticket = (await f.req('POST', '/v1/multiplayer/tickets', {mode: 'pvp', variant: 'ffa', roomId: room.roomId}, auth)).json();
    await f.close('escape-ffa');
    assert.equal((await f.req('POST', '/v1/multiplayer/tickets', {mode: 'pvp', variant: 'tdm', roomId: room.roomId}, auth)).json().error.code, 'MODE_DISABLED');
    const consume = await f.req('POST', '/internal/multiplayer/tickets/consume', {ticket: ticket.ticket, roomId: room.roomId, mode: 'pvp', variant: 'tdm'}, f.internal);
    assert.equal(consume.statusCode, 403); assert.equal(consume.json().error.code, 'MODE_DISABLED');
    assert.equal((await f.req('POST', '/v1/multiplayer/tickets', {mode: 'pvp', variant: 'tdm'}, auth)).statusCode, 200);
    const result = {resultId: 'finished-after-closure', roomId: room.roomId, mode: 'pvp', variant: 'ffa', ruleVersion: 'pvp-0.5.0', startedAt: f.now() - 10000, endedAt: f.now(), players: [{playerId: player.player.id, connectedSeconds: 10, score: 1, kills: 1, deaths: 0, won: true}]};
    assert.equal((await f.req('POST', '/internal/multiplayer/results', result, f.internal)).statusCode, 200);
  } finally {await f.app.close();}
});

test('client resolutions need independently verified game deployment; hand-entered release is insufficient', async () => {
  const f = await setup(); try {
    const feedback = (await f.req('POST', '/v1/feedback', {category: 'bug', title: '自动换弹问题', message: '联机中空仓后不能正常装填。'})).json();
    const release = (await f.req('POST', '/admin/releases', {version: 'Preview 0.6.9', date: '2026-10-10', summary: '修复联机装填并整理界面', changes: ['修复：联机自动装填。'], published: true}, f.admin)).json();
    const data = {requestId: 'resolve-new-client', kind: 'client', releaseId: release.id, summary: '已修复联机空仓装填。'};
    assert.equal((await f.req('POST', '/admin/feedback/' + feedback.id + '/resolve', data, f.admin)).statusCode, 400);
    const verified = {id: 'release-069-game', version: 'Preview 0.6.9', site: 'game', verified: true};
    assert.equal((await f.req('POST', '/internal/deployments/verified', verified)).statusCode, 403);
    assert.equal((await f.req('POST', '/internal/deployments/verified', {...verified, site: 'backend'}, f.internal)).statusCode, 200);
    assert.equal((await f.req('POST', '/admin/feedback/' + feedback.id + '/resolve', data, f.admin)).statusCode, 400);
    assert.equal((await f.req('POST', '/internal/deployments/verified', {...verified, id: 'verified-game'}, f.internal)).statusCode, 200);
    assert.equal((await f.req('POST', '/admin/feedback/' + feedback.id + '/resolve', data, f.admin)).statusCode, 200);
    const releases = (await f.req('GET', '/admin/releases', undefined, f.admin)).json(); assert.equal(releases.items[0].deployed, true);
    assert.equal((await f.req('POST', '/admin/releases', {id: release.id, version: 'Preview 0.9.9'}, f.admin)).statusCode, 400);
  } finally {await f.app.close();}
});

test('closing a solo mode stops new credentials but preserves issued match retry and result submission', async () => {
  const f = await setup(); try {
    const player = (await f.req('POST', '/v1/identity/register', {nickname: '单机比赛测试'})).json(), auth = {authorization: 'Bearer ' + player.token};
    const config = {mode: 'dafei', ruleVersion: DAFEI_RULE_VERSION, seed: 1, weapon: 'vehicle', roster: ['jiang', 'meng', 'xu', 'luan'], tasks: [], controls: 'keyboard', transmission: 'auto'};
    const request = {clientRunId: 'old-started-match', config}, issued = await f.req('POST', '/v1/runs', request, auth);
    assert.equal(issued.statusCode, 200, issued.body);
    await f.close('dafei');
    const blocked = await f.req('POST', '/v1/runs', {...request, clientRunId: 'brand-new-match'}, auth);
    assert.equal(blocked.statusCode, 403); assert.equal(blocked.json().error.code, 'MODE_DISABLED');
    assert.deepEqual((await f.req('POST', '/v1/runs', request, auth)).json(), issued.json());
    f.advance(300000);
    const run = issued.json(), result = await f.req('POST', '/v1/runs/' + run.runId + '/finalize', {credential: run.credential, eventCount: 0, summary: {won: true, elapsed: 300, score: 0, hits: 0, bestCombo: 0, damage: 0, controls: 'keyboard', transmission: 'auto'}}, auth);
    assert.equal(result.statusCode, 200, result.body); assert.equal(result.json().status, 'ranked');
  } finally {await f.app.close();}
});

test('workbench filters more than one hundred records and rejects stale edits without losing private text', async () => {
  const f = await setup(); try {
    for (let i = 0; i < 105; i++) f.db.prepare('INSERT INTO feedback(id,receipt_hash,category,title,message,diagnostics,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run('fixture-' + i, 'hash-' + i, 'bug', '教学楼问题' + i, '只有管理员可见的原文。', JSON.stringify({version: i < 100 ? '0.6.8' : '0.6.9', mode: 'coop'}), 'received', f.now(), f.now());
    let result = await f.req('GET', '/admin/feedback?status=all&search=教学楼&page=6', undefined, f.admin); assert.equal(result.statusCode, 200, result.body); assert.equal(result.json().total, 105); assert.equal(result.json().items.length, 5);
    result = await f.req('GET', '/admin/feedback?status=all&version=0.6.9&mode=coop&from=2026-10-10&to=2026-10-10', undefined, f.admin); assert.equal(result.json().total, 5);
    const item = result.json().items[0];
    assert.equal((await f.req('POST', '/admin/feedback/' + item.id, {expectedUpdatedAt: item.updatedAt, status: 'triaged', reply: '正在复核这条反馈。'}, f.admin)).statusCode, 200);
    assert.equal((await f.req('POST', '/admin/feedback/' + item.id, {expectedUpdatedAt: item.updatedAt, status: 'closed'}, f.admin)).statusCode, 409);
    const audit = (await f.req('GET', '/admin/audit?action=feedback-update&target=' + item.id, undefined, f.admin)).json(); assert.equal(audit.total, 1); assert.equal(audit.items[0].label, '更新反馈'); assert.equal(typeof audit.items[0].detail, 'object');
    assert.equal((await f.req('GET', '/v1/issues')).json().total, 0);
  } finally {await f.app.close();}
});
