import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {createApp, hash} from '../dist/app.js';

const password = 'operations-owner-password';
const ownerHash = 'ops-v093:' + scryptSync(password, 'ops-v093', 32).toString('hex');
async function setup() {
  let clock = Date.UTC(2026, 9, 18);
  const f = await createApp({dbPath: ':memory:', clock: () => clock, credentialSecret: 'ops-test', serviceSecret: 'ops-service-test', adminPasswordHash: ownerHash});
  const req = (method, url, payload?, headers = {}) => f.app.inject({method, url, payload, headers});
  const login = (await req('POST', '/admin/login', {username: 'owner', password})).json();
  const cookie = f.db.prepare('SELECT hash FROM admin_sessions').get();
  assert.ok(cookie);
  // A separate owner session avoids relying on cookie serialization in test clients.
  const ownerToken = 'owner-operation-session';
  f.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(hash(ownerToken), clock + 86400000, login.csrf, 'owner');
  const admin = {cookie: 'ranking_admin=' + ownerToken, 'x-csrf-token': login.csrf};
  const internal = {'x-service-token': 'ops-service-test'};
  const upsert = async (overrides = {}) => {
    const r = await req('POST', '/internal/multiplayer/rooms/upsert', {roomId: 'room-1', worker: 'w1', mode: 'pvp', variant: 'tdm', state: 'lobby', players: [{playerId: 'p1', nickname: '房内成员', connected: true, ready: false, loading: false, team: 'blue'}, {playerId: 'p2', nickname: '断线成员', connected: false, ready: false, loading: false, team: 'red'}], maxPlayers: 8, createdAt: clock, generation: 'generation-1', controlVersion: 1, ...overrides}, internal);
    assert.equal(r.statusCode, 200, r.body); return r.json();
  };
  const submit = async (runtime, changes = {}) => req('POST', '/admin/rooms/room-1', {action: 'close', reason: '定向验收操作', requestId: 'request-1', generation: runtime.generation, expectedRevision: runtime.revision, ...changes}, admin);
  return {...f, req, admin, internal, upsert, submit, advance: ms => {clock += ms;}, now: () => clock};
}

test('room views separate closed/history, connected and reserved; only fresh generation is actionable', async () => {
  const f = await setup(); try {
    await f.upsert(); await f.upsert({roomId: 'closed-room', state: 'closed', players: []});
    const current = (await f.req('GET', '/admin/rooms', undefined, f.admin)).json();
    assert.equal(current.total, 1); const room = current.items[0];
    assert.deepEqual([room.connected, room.reserved, room.occupied], [1, 1, 2]);
    assert.equal(room.players[0].playerId, 'p1'); assert.equal(room.actionable, true);
    assert.equal((await f.req('GET', '/admin/rooms?view=history', undefined, f.admin)).json().items[0].actionable, false);
    f.advance(30001);
    assert.equal((await f.submit(room)).statusCode, 409);
    assert.equal((await f.req('GET', '/admin/rooms', undefined, f.admin)).json().items[0].stale, true);
    f.advance(90000);
    assert.equal((await f.req('GET', '/admin/rooms', undefined, f.admin)).json().total, 0);
  } finally {await f.app.close();}
});

test('command claim and receipt report actual effect, dedupe requests and never feed old workers', async () => {
  const f = await setup(); try {
    const runtime = await f.upsert(), response = await f.submit(runtime);
    assert.equal(response.statusCode, 200, response.body); const id = response.json().commandId;
    assert.equal((await f.submit(runtime)).json().commandId, id);
    assert.equal(f.db.prepare('SELECT acked FROM room_commands WHERE id=?').get(id).acked, 1);
    assert.equal((await f.req('GET', '/admin/room-commands', undefined, f.admin)).json().items[0].state, 'queued');
    const path = '/internal/multiplayer/rooms/room-1/commands/' + id;
    assert.equal((await f.req('POST', path + '/ack', {generation: runtime.generation, state: 'executed'}, f.internal)).statusCode, 409);
    assert.equal((await f.req('POST', path + '/claim', runtime, f.internal)).json().execute, true);
    assert.equal((await f.req('POST', path + '/claim', runtime, f.internal)).json().execute, false);
    assert.equal((await f.req('POST', path + '/ack', {generation: runtime.generation, state: 'executed'}, f.internal)).json().state, 'executed');
    assert.equal((await f.req('POST', path + '/ack', {generation: runtime.generation, state: 'failed'}, f.internal)).json().state, 'executed');
    assert.equal((await f.req('GET', '/admin/room-commands', undefined, f.admin)).json().items[0].state, 'executed');
  } finally {await f.app.close();}
});

test('membership/revision and room generation changes invalidate commands without banning another player', async () => {
  const f = await setup(); try {
    const runtime = await f.upsert();
    assert.equal((await f.submit(runtime, {action: 'kick', playerId: 'other-player'})).statusCode, 409);
    const command = (await f.submit(runtime)).json();
    const next = await f.upsert({state: 'playing'});
    const path = '/internal/multiplayer/rooms/room-1/commands/' + command.commandId;
    assert.equal((await f.req('POST', path + '/claim', next, f.internal)).json().execute, false);
    assert.equal((await f.req('GET', '/admin/room-commands', undefined, f.admin)).json().items[0].state, 'noop');
    assert.equal((await f.submit(next, {requestId: 'other-request'})).statusCode, 200);
    await f.upsert({generation: 'generation-2'});
    assert.equal((await f.submit(next, {requestId: 'new-request'})).statusCode, 409);
    assert.equal(f.db.prepare('SELECT count(*) n FROM multiplayer_bans').get().n, 0);
  } finally {await f.app.close();}
});

test('sixty-second expiry rejects late execution and closed rooms cannot queue commands', async () => {
  const f = await setup(); try {
    const runtime = await f.upsert(); const command = (await f.submit(runtime)).json();
    f.advance(60001);
    const path = '/internal/multiplayer/rooms/room-1/commands/' + command.commandId;
    assert.equal((await f.req('POST', path + '/claim', runtime, f.internal)).json().execute, false);
    assert.equal((await f.req('GET', '/admin/room-commands', undefined, f.admin)).json().items[0].state, 'expired');
    const closed = await f.upsert({state: 'closed', players: []});
    assert.equal((await f.submit(closed, {requestId: 'closed-request'})).statusCode, 409);
  } finally {await f.app.close();}
});

test('legacy workers are read-only and cannot fetch commands during rolling upgrade or rollback', async () => {
  const f = await setup(); try {
    const runtime = await f.upsert(); await f.submit(runtime);
    assert.equal((await f.req('GET', '/internal/multiplayer/rooms/room-1/commands', undefined, f.internal)).json().commands.length, 0);
    assert.equal((await f.req('GET', '/internal/multiplayer/rooms/room-1/commands?controlVersion=1&generation='+runtime.generation, undefined, f.internal)).json().commands.length, 1);
    const legacy = await f.upsert({controlVersion: undefined, generation: undefined});
    assert.equal((await f.req('GET', '/admin/rooms', undefined, f.admin)).json().items[0].actionable, false);
    assert.equal((await f.submit(legacy, {requestId: 'legacy-request'})).statusCode, 409);
    assert.equal((await f.req('GET', '/internal/multiplayer/rooms/room-1/commands?controlVersion=1', undefined, f.internal)).json().commands.length, 0);
    assert.equal((await f.req('GET', '/internal/multiplayer/rooms/missing-room/commands?controlVersion=1', undefined, f.internal)).statusCode, 200);
  } finally {await f.app.close();}
});

test('temporary bans are created only for confirmed execution; missing receipts remain explicitly uncertain', async () => {
  const f = await setup(); try {
    f.db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run('p1', 'P10001', '房内成员', 'test-recovery', f.now());
    const runtime = await f.upsert();
    const response = await f.submit(runtime, {action: 'temp-ban', playerId: 'p1', minutes: 15});
    const path = '/internal/multiplayer/rooms/room-1/commands/'+response.json().commandId;
    assert.equal(f.db.prepare('SELECT count(*) n FROM multiplayer_bans').get().n, 0);
    assert.equal((await f.req('POST', path+'/claim', runtime, f.internal)).json().execute, true);
    await f.req('POST', path+'/ack', {generation: runtime.generation, state: 'executed'}, f.internal);
    assert.equal(f.db.prepare('SELECT expires FROM multiplayer_bans WHERE player_id=?').get('p1').expires, f.now()+15*60000);
    const second = (await f.submit(runtime, {requestId: 'receipt-missing'})).json();
    await f.req('POST', '/internal/multiplayer/rooms/room-1/commands/'+second.commandId+'/claim', runtime, f.internal);
    f.advance(60001);
    const result = (await f.req('GET', '/admin/room-commands', undefined, f.admin)).json().items.find(v => v.id === second.commandId);
    assert.equal(result.state, 'failed'); assert.match(result.outcome, /未收到最终结果/);
  } finally {await f.app.close();}
});

test('presence uses server tokens, de-duplicates accounts, expires sessions and stores aggregate data only', async () => {
  const f = await setup(); try {
    f.db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run('p1', 'P10001', 'PRIVATE-PLAYER-NAME', 'private-recovery-hash', f.now());
    f.db.prepare('INSERT INTO accounts(id,player_id,username,password_hash,recovery_hash,created,updated) VALUES(?,?,?,?,?,?,?)').run('a1', 'p1', 'private-account-name', 'private-hash', 'private-account-recovery', f.now(), f.now());
    f.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('test-session'), 'p1', f.now() + 86400000);
    const signed = {authorization: 'Bearer test-session'};
    const a = (await f.req('POST', '/v1/presence', {client: 'web', active: true}, signed)).json();
    const b = (await f.req('POST', '/v1/presence', {client: 'native', active: true}, signed)).json();
    const guest = (await f.req('POST', '/v1/presence', {client: 'web', active: true})).json();
    let summary = (await f.req('GET', '/admin/presence', undefined, f.admin)).json();
    assert.deepEqual([summary.activeAccounts, summary.guestSessions, summary.clientSessions], [1, 1, 3]);
    assert.equal(summary.recovering, true);
    assert.equal((await f.req('GET', '/admin/presence')).statusCode, 401);
    await f.req('POST', '/v1/presence', {...guest, client: 'web', active: false});
    summary = (await f.req('GET', '/admin/presence', undefined, f.admin)).json();
    assert.equal(summary.guestSessions, 0);
    assert.ok(!JSON.stringify(summary).includes('PRIVATE') && !JSON.stringify(summary).includes('private-account'));
    f.advance(90001);
    assert.equal((await f.req('GET', '/admin/presence', undefined, f.admin)).json().clientSessions, 0);
    const renewed = (await f.req('POST', '/v1/presence', {...a, client: 'web', active: true}, signed)).json();
    assert.notEqual(renewed.sessionId, a.sessionId);
    assert.ok(b.sessionId && b.sessionId !== a.sessionId);
    assert.equal(f.db.prepare('SELECT count(*) n FROM presence_minutes').get().n, 1);
    assert.equal(f.db.pragma('user_version', {simple: true}), 6);
  } finally {await f.app.close();}
});

test('stats and room permissions are separate; CSRF still blocks room mutations', async () => {
  const f = await setup(); try {
    f.db.prepare('INSERT INTO administrators VALUES(?,?,?,?,?,?,?,?)').run('stats-admin', 'stats-admin', '统计管理员', ownerHash, 0, '["stats"]', 1, f.now());
    f.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(hash('stats-session'), f.now() + 86400000, 'stats-csrf', 'stats-admin');
    const h = {cookie: 'ranking_admin=stats-session', 'x-csrf-token': 'stats-csrf'};
    assert.equal((await f.req('GET', '/admin/presence', undefined, h)).statusCode, 200);
    assert.equal((await f.req('GET', '/admin/rooms', undefined, h)).statusCode, 403);
    const runtime = await f.upsert();
    assert.equal((await f.req('POST', '/admin/rooms/room-1', {action: 'close', reason: '权限检查', requestId: 'permission-request', generation: runtime.generation, expectedRevision: runtime.revision}, {cookie: f.admin.cookie})).statusCode, 403);
    assert.equal((await f.req('POST', '/internal/multiplayer/rooms/room-1/commands/anything/claim', runtime)).statusCode, 403);
  } finally {await f.app.close();}
});
