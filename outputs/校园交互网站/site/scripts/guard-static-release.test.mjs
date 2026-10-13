import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStaticReleasePath} from './guard-static-release.mjs';

test('static releases reject environment files and private directories at every depth', () => {
  for (const relative of ['.env', '.env.production', 'assets/.env.local', '.git/config', 'story/.ssh/id_rsa', 'assets/.codex/config.toml', 'avatars/.agents/notes.md', 'node_modules/module/index.js', 'assets\\.ENV.test', 'story\\NODE_MODULES\\module.js']) {
    assert.throws(() => assertStaticReleasePath(relative), /Sensitive path/, relative);
  }
});

test('static releases reject databases, database sidecars and private key files', () => {
  for (const relative of ['campus.sqlite', 'data.sqlite3', 'assets/cache.db', 'story/state.sqlite-wal', 'story/state.sqlite3-shm', 'assets/cache.db-journal', 'assets/client.pem', 'avatars/client.KEY']) {
    assert.throws(() => assertStaticReleasePath(relative), /Sensitive path/, relative);
  }
});

test('static releases retain normal assets including filenames containing secret or key words', () => {
  for (const relative of ['index.html', '_headers', 'assets/game-keyboard.js', 'story/images/secret-garden.webp', 'images/key.webp', 'images/.environment.webp', 'images/database-building.webp', 'story/audio/childhood.mp3', 'avatars/v0.5.0/campus-a.glb', 'map/collision.bin']) {
    assert.doesNotThrow(() => assertStaticReleasePath(relative), relative);
  }
});
