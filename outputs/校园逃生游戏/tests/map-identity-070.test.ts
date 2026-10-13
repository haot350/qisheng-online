import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname) && existsSync(fileURLToPath(url) + '.ts'))
        return next(specifier + '.ts', context);
    }
    return next(specifier, context);
  },
});
const { localMapIdentity } = await import('../src/multiplayer/client.ts');
const { gameMapSession, loadGameMapBundle } = await import('../src/game-map.ts');
const { SimWorld } = await import('../src/multiplayer/shared/sim-world.ts');
const { sameMap } = await import('../src/multiplayer/shared/protocol.ts');
const digest = (bytes: ArrayBuffer) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');

test('real admission, indexed bytes and simulation include the same source-bound vision identity', async () => {
  const originalFetch = globalThis.fetch;
  const requested = new Map<string, number>();
  globalThis.fetch = async input => {
    const url = String(input);
    assert.ok(url.startsWith('/map/') || url.startsWith('/assets/map/'));
    requested.set(url, (requested.get(url) ?? 0) + 1);
    return new Response(readFileSync(new URL('../public' + url, import.meta.url)));
  };
  let world: Awaited<ReturnType<typeof SimWorld.create>> | undefined;
  try {
    const [admission, bundle] = await Promise.all([localMapIdentity(), loadGameMapBundle()]);
    assert.deepEqual(admission, bundle.identity);
    assert.ok(bundle.manifest.visionUrl && bundle.vision, 'actual deployment has an independent perception asset');
    assert.equal(admission.manifestHash, digest(bundle.manifestBytes));
    assert.equal(admission.collisionHash, digest(bundle.collision));
    assert.equal(admission.navigationHash, digest(bundle.navigation));
    assert.equal(admission.visionHash, digest(bundle.vision!));
    assert.equal(sameMap(admission, { ...bundle.identity, visionHash: 'outdated' }), false);
    for (const logical of [bundle.manifest.collisionUrl, bundle.manifest.navmeshUrl, bundle.manifest.visionUrl!])
      assert.equal(requested.get(bundle.index.resources[logical].url), 1, 'simulation reuses the validated admission map repository');

    world = await SimWorld.create(bundle.manifest, bundle.collision, new Uint8Array(bundle.navigation), bundle.vision);
    const header = new Uint32Array(bundle.vision!, 0, 2);
    const positions = new Float32Array(bundle.vision!, 8, header[0]);
    const indices = new Uint32Array(bundle.vision!, 8 + header[0] * 4, header[1]);
    let verified = false;
    for (let i = 0; i < indices.length && !verified; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
      const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      if (length < .001) continue;
      nx /= length; ny /= length; nz /= length;
      const middle: [number, number, number] = [(positions[a] + positions[b] + positions[c]) / 3, (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3, (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3];
      const from: [number, number, number] = [middle[0] + nx * .25, middle[1] + ny * .25, middle[2] + nz * .25];
      const direction: [number, number, number] = [-nx, -ny, -nz];
      const distance = world.visionRayDistance(from, direction, .5);
      assert.ok(Number.isFinite(distance) && distance <= .251, 'the actual simulation consumes the indexed foliage geometry');
      verified = true;
    }
    assert.equal(verified, true);
    const { index } = await gameMapSession.initialize();
    const key = bundle.manifest.visionUrl!, vision = index.resources[key];
    delete index.resources[key];
    try { await assert.rejects(localMapIdentity(), /校园资料不完整/); }
    finally { index.resources[key] = vision; }
  } finally {
    world?.dispose();
    globalThis.fetch = originalFetch;
  }
});
