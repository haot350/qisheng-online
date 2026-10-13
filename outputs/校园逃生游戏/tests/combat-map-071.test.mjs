import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Document, NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Matrix4, Vector3} from 'three';
import {classifyCombatPrimitive, classifySmallFixtureTriangles, PROTECTED_MAP_HASHES, SOURCE_MANIFEST_HASH} from '../scripts/combat-map-classification-071.mjs';
import {batchCombatMap} from '../scripts/batch-combat-map-071.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const office = {sourceObject: 'B办公室轻量母版_12工位双入口_architecture_and_fixtures_025', floor: 1, room: '1层_B办公室', role: 'furniture', category: 'architecture_and_fixtures', collisionRole: 'room'};

test('opaque batching preserves transforms, every triangle attribute and provenance while transparent draws stay separate', () => {
  const doc = new Document(), scene = doc.createScene(), buffer = doc.createBuffer();
  doc.getRoot().setDefaultScene(scene);
  const opaque = doc.createMaterial('opaque'), glass = doc.createMaterial('glass').setAlphaMode('BLEND').setBaseColorFactor([1,1,1,.3]);
  const add = (material, x, mirror = false) => {
    const p = doc.createPrimitive().setMaterial(material)
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2])).setBuffer(buffer))
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,1,0,0,1,0,0,1])).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setNormalized(true).setArray(new Uint16Array([0,0,65535,0,0,65535])).setBuffer(buffer));
    const node = doc.createNode('source-'+x).setTranslation([x,0,0]).setScale([mirror?-1:1,1,1]).setMesh(doc.createMesh().addPrimitive(p)).setExtras({sourceObject:'wall-'+x});
    scene.addChild(node);
  };
  add(opaque,3); add(opaque,7,true); add(glass,10); add(glass,12);
  const result = batchCombatMap(doc);
  assert.equal(result.before,4); assert.equal(result.after,3); assert.equal(result.mergedPrimitives,1);
  const batch = scene.listChildren().find(n=>n.getExtras().visualBatchedSources);
  assert.equal(batch.getExtras().visualBatchedSources.length,2);
  const p = batch.getMesh().listPrimitives()[0];
  assert.equal(p.getMaterial(),opaque); assert.equal(p.getIndices().getCount(),6);
  assert.equal(p.getAttribute('TEXCOORD_0').getArray().constructor,Uint16Array);
  assert.equal(p.getAttribute('TEXCOORD_0').getNormalized(),true);
  assert.equal(scene.listChildren().filter(n=>n.getMesh()?.listPrimitives()[0].getMaterial()===glass).length,2);
  assert.ok(result.maxPositionError<=.00002);
});

test('only the reviewed source/material pair can be optional; furniture, unknowns and glazing remain structural', () => {
  assert.equal(classifyCombatPrimitive(office, 'web_陈设_纸张米白.005').residency, 'detail');
  for (const material of ['web_办公室B_浅灰文件柜.001', 'web_办公室B_上部半透明磨砂隔断.001', 'web_窗户_透明玻璃.005', 'web_树干', 'unknown']) {
    assert.equal(classifyCombatPrimitive(office, material).residency, 'structure');
  }
  for (const extra of [{...office, sourceObject: 'unknown'}, {...office, collisionRole: 'structure'}, {...office, room: undefined}, {...office, floor: undefined}]) {
    assert.equal(classifyCombatPrimitive(extra, 'web_陈设_纸张米白.005').residency, 'structure');
  }
});

test('small hardware classification joins seams and measures world dimensions; large and unknown metal cannot be stripped', () => {
  const extras = {...office, sourceObject: '教室轻量母版_36席_原窗另供_architecture_and_fixtures_017'};
  const triangle = [0,0,0, .06,0,0, 0,.05,0], indices = [0,1,2];
  assert.equal(classifySmallFixtureTriangles(extras, 'web_细部_香槟金属.001', triangle, indices, triangle).detailTriangles, 1);
  assert.equal(classifySmallFixtureTriangles({...extras, sourceObject: 'solid-door'}, 'web_细部_香槟金属.001', triangle, indices, triangle), null);
  assert.equal(classifySmallFixtureTriangles(extras, 'web_细部_香槟金属.001', triangle, indices, triangle.map(x => x * 20)).detailTriangles, 0);
  // Two tiny faces separated in the vertex array share a seam. The complete
  // 40cm strip must remain structure even if either disconnected face is small.
  const strip = [0,0,0, .2,0,0, .2,.05,0, .2,0,0, .4,0,0, .2,.05,0];
  assert.equal(classifySmallFixtureTriangles(extras, 'web_细部_香槟金属.001', strip, [0,1,2,3,4,5], strip).detailTriangles, 0);
});

test('visual derivation preserves original visual assets and all collision, navigation and vision hashes', async () => {
  const pinned = await fs.readFile(path.join(root, 'assets-source/map/v0.7.1-base/manifest.json'));
  assert.equal(sha(pinned), SOURCE_MANIFEST_HASH);
  const sources = JSON.parse(await fs.readFile(path.join(root, 'assets-source/map/v0.7.1-base/sources.json'), 'utf8'));
  for (const [url, hash] of Object.entries(sources)) assert.equal(sha(await fs.readFile(path.join(root, 'public', url))), hash, url);
  for (const [name, hash] of Object.entries(PROTECTED_MAP_HASHES)) assert.equal(sha(await fs.readFile(path.join(root, 'public/map', name))), hash, name);
});

test('actual derived GLBs conserve source triangles and all vertices lie within their advertised bounds', async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
  const manifestBytes = await fs.readFile(path.join(root, 'public/map/manifest.json'));
  const manifest = JSON.parse(manifestBytes), original = JSON.parse(await fs.readFile(path.join(root, 'assets-source/map/v0.7.1-base/manifest.json'), 'utf8'));
  const index = JSON.parse(await fs.readFile(path.join(root, 'public/map/resource-index.json'), 'utf8'));
  assert.equal(index.manifest.sha256, sha(manifestBytes));
  assert.equal(manifest.visualRevision, 'v0.7.1-structure-detail');
  let triangles = 0, optional = 0;
  const originals = new Set(original.chunks.map(c => c.url));
  for (const chunk of manifest.chunks) {
    assert.ok(['structure', 'detail'].includes(chunk.residency));
    assert.equal(chunk.combatOccluder, chunk.residency === 'structure');
    assert.ok(chunk.decodedGeometryBytes > 0);
    assert.ok(index.resources[chunk.url]);
    if (chunk.residency === 'detail') optional += chunk.triangles;
    const inputs = chunk.sourceChunks ?? (chunk.sourceChunk ? [chunk.sourceChunk] : []);
    if (!inputs.length) { triangles += chunk.triangles; continue; }
    for (const input of inputs) {
      assert.ok(originals.has('/map/' + input));
      assert.ok(!index.resources['/map/' + input], 'old interior GLB must not count toward current complete-map download');
    }
    const bytes = await fs.readFile(path.join(root, 'public', chunk.url));
    assert.equal(sha(bytes), index.resources[chunk.url].sha256);
    const doc = await io.readBinary(bytes), point = new Vector3();
    let actual = 0;
    for (const node of doc.getRoot().listNodes()) {
      const matrix = new Matrix4().fromArray(node.getWorldMatrix());
      for (const p of node.getMesh()?.listPrimitives() ?? []) {
        const position = p.getAttribute('POSITION'), temp = [];
        actual += (p.getIndices()?.getCount() ?? position.getCount()) / 3;
        for (let i = 0; i < position.getCount(); i++) {
          point.fromArray(position.getElement(i, temp)).applyMatrix4(matrix);
          for (let axis = 0; axis < 3; axis++) {
            assert.ok(point.getComponent(axis) >= chunk.bounds.min[axis] - 1e-6);
            assert.ok(point.getComponent(axis) <= chunk.bounds.max[axis] + 1e-6);
          }
        }
      }
    }
    assert.equal(actual, chunk.triangles, chunk.url); triangles += actual;
    assert.ok(bytes.length < 3_000_000, 'derived parse units must remain bounded');
  }
  assert.equal(triangles, original.chunks.reduce((n, c) => n + c.triangles, 0));
  assert.ok(optional > 250_000, 'reviewed detail is streamed separately');
});
