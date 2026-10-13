import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {createApp} from '../dist/app.js';

async function setup() {
  const password = 'admin-edit-local-password', salt = 'admin-edit-test';
  const c = await createApp({dbPath: ':memory:', adminPasswordHash: salt + ':' + scryptSync(password, salt, 32).toString('hex')});
  const req = (method, url, payload?, headers = {}) => c.app.inject({method, url, payload, headers});
  const login = await req('POST', '/admin/login', {username: 'owner', password});
  const admin = {cookie: String(login.headers['set-cookie']).split(';')[0], 'x-csrf-token': login.json().csrf};
  return {...c, req, admin};
}

test('two release editors cannot silently replace a newer public summary', async () => {
  const f = await setup(); try {
    const created = await f.req('POST', '/admin/releases', {version: 'Preview 0.6.9', date: '2026-10-10', summary: '改善阅读与管理体验。', changes: ['调整：整理帮助入口。'], published: false}, f.admin);
    assert.equal(created.statusCode, 200, created.body);
    const old = (await f.req('GET', '/admin/releases', undefined, f.admin)).json().items[0];
    assert.equal(typeof old.revision, 'string');
    assert.equal((await f.req('POST', '/admin/releases', {...old, expectedRevision: old.revision, summary: '已审核的新版本摘要。'}, f.admin)).statusCode, 200);
    const stale = await f.req('POST', '/admin/releases', {...old, expectedRevision: old.revision, summary: '另一个窗口的旧内容。'}, f.admin);
    assert.equal(stale.statusCode, 409, stale.body);
    assert.equal(f.db.prepare('SELECT summary FROM releases WHERE id=?').get(old.id).summary, '已审核的新版本摘要。');
  } finally {await f.app.close();}
});

test('account revisions include credential changes without exposing credential hashes', async () => {
  const f = await setup(); try {
    const created = await f.req('POST', '/admin/accounts', {username: 'feedback-editor', name: '反馈处理员', password: 'local-editor-password', scopes: ['feedback']}, f.admin);
    assert.equal(created.statusCode, 200, created.body);
    const result = await f.req('GET', '/admin/accounts', undefined, f.admin), old = result.json().items.find(a => a.username === 'feedback-editor');
    assert.ok(!result.body.includes('password_hash')); assert.ok(!result.body.includes('local-editor-password'));
    const changed = await f.req('POST', '/admin/accounts', {id: old.id, expectedRevision: old.revision, password: 'another-editor-password'}, f.admin);
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal((await f.req('POST', '/admin/accounts', {...old, expectedRevision: old.revision, scopes: ['feedback', 'operations']}, f.admin)).statusCode, 409);
    assert.deepEqual(JSON.parse(f.db.prepare('SELECT scopes FROM administrators WHERE id=?').get(old.id).scopes), ['feedback']);
  } finally {await f.app.close();}
});

test('player editors preserve newer moderation and resolved feedback replies preserve resolution', async () => {
  const f = await setup(); try {
    const identity = (await f.req('POST', '/v1/identity/register', {nickname: '测试玩家'})).json();
    const old = (await f.req('GET', '/admin/players', undefined, f.admin)).json().items[0];
    assert.equal((await f.req('POST', '/admin/players/' + old.id, {restricted: true, expectedRevision: old.revision}, f.admin)).statusCode, 200);
    assert.equal((await f.req('POST', '/admin/players/' + old.id, {nickname: '另一名字', expectedRevision: old.revision}, f.admin)).statusCode, 409);
    assert.equal(f.db.prepare('SELECT restricted FROM players WHERE id=?').get(old.id).restricted, 1);
    const current = (await f.req('GET', '/admin/players', undefined, f.admin)).json().items[0];
    assert.equal((await f.req('POST', '/admin/players/' + old.id, {nickname: 'x', restricted: false, expectedRevision: current.revision}, f.admin)).statusCode, 400);
    assert.equal(f.db.prepare('SELECT restricted FROM players WHERE id=?').get(old.id).restricted, 1, 'invalid nickname must not commit a partial moderation update');
    const guest = (await f.req('POST', '/v1/feedback', {category: 'bug', title: '持续移动出现问题', message: '移动到门口时有停顿，希望检查。'})).json();
    const resolution = await f.req('POST', '/admin/feedback/' + guest.id + '/resolve', {requestId: 'resolution-local-069', kind: 'answer', summary: '已经核对，请按照新的说明操作。', effectiveAt: Date.now() - 1000}, f.admin);
    assert.equal(resolution.statusCode, 200, resolution.body);
    const detail = resolution.json();
    const reply = await f.req('POST', '/admin/feedback/' + guest.id, {reply: '有新的情况也可以继续补充。', expectedUpdatedAt: detail.updatedAt}, f.admin);
    assert.equal(reply.statusCode, 200, reply.body); assert.equal(reply.json().status, 'resolved');
    assert.equal(reply.json().resolution.summary, detail.resolution.summary);
    const audit = await f.req('GET', '/admin/audit?actor=owner', undefined, f.admin);
    assert.ok(audit.json().items.length > 0, 'audit username filter must find its named operator');
  } finally {await f.app.close();}
});
