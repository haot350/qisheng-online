import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionOperations, SessionScope, ResourceSlot } from '../src/session-flow.ts';
import { modeCapabilities, pausePolicy, prepareModeAudio } from '../src/mode-policy.ts';

test('cancelled start cannot clear a new operation or publish to a new engine', () => {
  const flow = new SessionOperations<object>(), first = {}, second = {};
  const old = flow.begin(first)!;
  assert.equal(flow.begin(first), null);
  flow.cancel();
  const current = flow.begin(second)!;
  assert.equal(flow.current(old, first), false);
  assert.equal(flow.finish(old, second), false);
  assert.equal(flow.busy, true);
  assert.equal(flow.finish(current, first), false);
  assert.equal(flow.finish(current, second), true);
  assert.equal(flow.busy, false);
});

test('scene closes in reverse ownership order and releases late results once', async () => {
  const scope = new SessionScope(), released: string[] = [];
  scope.own(() => released.push('world'));
  scope.own(() => { assert(scope.signal.aborted); released.push('input'); });
  const late = Promise.resolve().then(() => scope.own(() => released.push('late')));
  scope.close(); scope.close();
  const release = await late; release();
  assert.deepEqual(released, ['input', 'world', 'late']);
});

test('old preparation release cannot clear the successor lease', () => {
  const slot = new ResourceSlot(), counts = [0, 0];
  const old = slot.replace(() => counts[0]++);
  slot.replace(() => counts[1]++);
  old(); assert.deepEqual(counts, [1, 0]);
  slot.clear(); slot.clear(); assert.deepEqual(counts, [1, 1]);
});

test('photography, weapons and pause ownership do not leak across modes', () => {
  assert(modeCapabilities('story').photography);
  assert(modeCapabilities('roam').photography);
  assert.equal(modeCapabilities('story').weapons, false);
  assert.equal(modeCapabilities('dafei').photography, false);
  assert.equal(modeCapabilities('escape').photography, false);
  assert.equal(modeCapabilities('roam').timed, false);
  assert.equal(pausePolicy('online'), 'personal');
  assert.equal(pausePolicy('local'), 'world');
});

test('story/roam preparation never starts combat or running music', () => {
  const events: string[] = [], audio = { reset: () => events.push('reset'), setEscapeMusic: (music: string) => events.push(music), setMusicMode: (mode: string) => events.push(mode) };
  for (const mode of ['story', 'roam', 'escape', 'dafei'] as const) prepareModeAudio(audio, mode);
  assert.deepEqual(events, ['reset', 'reset', 'reset', 'battle', 'reset', 'driving']);
});
