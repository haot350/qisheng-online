import test from 'node:test';
import assert from 'node:assert/strict';
process.env.REALTIME_SERVICE_TOKEN ??= 'isolated-control-test-only';
delete process.env.REDIS_URL;
const {CampusRoom} = await import('../dist/modules/校园联机服务/src/room.js');

function fixture() {
  const room = new CampusRoom(), actions = [];
  room.roomId = 'moderation-unit'; room._listing = {metadata: {phase: 'lobby', occupancy: 1}};
  room.setMetadata = async m => {room._listing.metadata = m;};
  room.health = () => ({tickP95: 0, tickP99: 0, completeCycle: {p95: 0, p99: 0}, memoryBytes: 1, input: {maxAgeTicks: 0}, wire: {bufferedBytes: 0}});
  room.sim = {phase: 'lobby', options: {mode: 'pvp', variant: 'tdm'}, players: new Map([['p1', {state: {id: 'p1', nickname: '成员', connected: false, ready: false, loading: false, team: 'blue'}}]]), occupantCount: 1,
    removePlayer(id) {actions.push('remove'); this.players.delete(id); this.occupantCount = 0;}};
  room.reconnectSeats.set('p1', {reject() {actions.push('revoke-seat');}});
  return {room, actions};
}
test('real room handler claims before mutation, revokes reserved seat and reports executed', async () => {
  const f = fixture(), saved = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname; calls.push(path);
    if (path.endsWith('/upsert')) return new Response(JSON.stringify({revision: 1}));
    if (path.endsWith('/commands')) return new Response(JSON.stringify({maintenance: false, commands: [{id: 'command-1', action: 'kick', playerId: 'p1', generation: f.room.adminGeneration, revision: 1}]}));
    if (path.endsWith('/claim')) {assert.equal(f.actions.length, 0); return new Response(JSON.stringify({execute: true, expires: Date.now()+60000}));}
    if (path.endsWith('/ack')) {assert.deepEqual(f.actions, ['revoke-seat', 'remove']); assert.equal(JSON.parse(options.body).state, 'executed');}
    return new Response('{}');
  };
  try {assert.equal(await f.room.control(), true); assert.equal(f.room.sim.players.size, 0); assert.ok(calls.findIndex(v => v.endsWith('/claim')) < calls.findIndex(v => v.endsWith('/ack')));}
  finally {globalThis.fetch = saved; f.room.clock.stop();}
});
test('room state changing while command claim is in flight cancels mutation', async () => {
  const f = fixture(), saved = globalThis.fetch; let outcome;
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/upsert')) return new Response('{"revision":1}');
    if (path.endsWith('/commands')) return new Response(JSON.stringify({commands: [{id: 'command-1', action: 'kick', playerId: 'p1', generation: f.room.adminGeneration, revision: 1}]}));
    if (path.endsWith('/claim')) {f.room.sim.phase = 'playing'; return new Response(JSON.stringify({execute: true, expires: Date.now()+60000}));}
    if (path.endsWith('/ack')) outcome = JSON.parse(options.body).state;
    return new Response('{}');
  };
  try {assert.equal(await f.room.control(), true); assert.deepEqual(f.actions, []); assert.equal(outcome, 'noop');}
  finally {globalThis.fetch = saved; f.room.clock.stop();}
});
