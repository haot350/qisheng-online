/**
 * Derive visual streaming units from the accepted 0.7.0 GLBs. No Blender, physics,
 * navigation, texture compression, geometry simplification or requantization.
 * Run from any directory. Reruns read a pinned manifest and verify every input.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Document, NodeIO, Logger, PropertyType} from '@gltf-transform/core';
import {ALL_EXTENSIONS, EXTMeshoptCompression} from '@gltf-transform/extensions';
import {copyToDocument, prune, dedup, unpartition} from '@gltf-transform/functions';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';
import {Box3, Matrix4, Vector3} from 'three';
import {buildGameMapIndex} from './build-map-cache-index.mjs';
import {classifyCombatPrimitive, classifySmallFixtureTriangles, PROTECTED_MAP_HASHES, SOURCE_MANIFEST_HASH, VISUAL_REVISION} from './combat-map-classification-071.mjs';
import {batchCombatMap} from './batch-combat-map-071.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(PUBLIC, 'map');
const PINNED = path.join(ROOT, 'assets-source/map/v0.7.1-base');
const REPORT = path.join(ROOT, 'docs/v0.7.1');
const sha = value => createHash('sha256').update(value).digest('hex');
const arrayHash = a => sha(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const logger = new Logger(Logger.Verbosity.WARN);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder});
const vector = new Vector3();

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
await Promise.all([fs.mkdir(PINNED, {recursive: true}), fs.mkdir(REPORT, {recursive: true})]);
const pinnedManifest = path.join(PINNED, 'manifest.json');
if (!await fs.stat(pinnedManifest).catch(() => null)) {
  const bytes = await fs.readFile(path.join(OUT, 'manifest.json'));
  if (sha(bytes) !== SOURCE_MANIFEST_HASH) throw Error('Expected the accepted 0.7.0 manifest before first derivation.');
  await fs.writeFile(pinnedManifest, bytes, {flag: 'wx'});
}
const originalManifestBytes = await fs.readFile(pinnedManifest);
if (sha(originalManifestBytes) !== SOURCE_MANIFEST_HASH) throw Error('Pinned visual manifest changed; review required.');
const manifest = JSON.parse(originalManifestBytes);
const protectedBefore = {};
for (const [name, expected] of Object.entries(PROTECTED_MAP_HASHES)) {
  protectedBefore[name] = sha(await fs.readFile(path.join(OUT, name)));
  if (protectedBefore[name] !== expected) throw Error(`Protected ${name} identity changed; re-audit required.`);
}
const sources = {};
for (const chunk of manifest.chunks) sources[chunk.url] = sha(await fs.readFile(path.join(PUBLIC, chunk.url)));
const sourceRecord = path.join(PINNED, 'sources.json');
if (await fs.stat(sourceRecord).catch(() => null)) {
  const expected = JSON.parse(await fs.readFile(sourceRecord, 'utf8'));
  if (JSON.stringify(expected) !== JSON.stringify(sources)) throw Error('A pinned source GLB changed; re-audit required.');
} else await fs.writeFile(sourceRecord, JSON.stringify(sources, null, 2) + '\n', {flag: 'wx'});

const chunks = [], classification = [], outputs = [], batching = [], textureNames = new Map();
const structureCells = new Map();
let sourceTriangles = 0, sourceDraws = 0, generatedTriangles = 0;

function geometryStats(doc) {
  const bounds = new Box3(), accessors = new Set();
  let triangles = 0, draws = 0;
  for (const node of doc.getRoot().listNodes()) {
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const pos = p.getAttribute('POSITION');
      if (!pos) continue;
      draws++;
      triangles += (p.getIndices()?.getCount() ?? pos.getCount()) / 3;
      if (p.getIndices()) accessors.add(p.getIndices());
      for (const a of p.listAttributes()) accessors.add(a);
      const temp = [];
      for (let i = 0; i < pos.getCount(); i++) bounds.expandByPoint(vector.fromArray(pos.getElement(i, temp)).applyMatrix4(matrix));
    }
  }
  const textureResources = new Map();
  for (const t of doc.getRoot().listTextures()) {
    const image = t.getImage();
    if (!image) throw Error('Unexpected external map texture: ' + t.getName());
    const id = sha(image), size = t.getSize();
    const named = textureNames.get(t.getName());
    if (named && named !== id) throw Error('Named texture sharing would alias distinct images: ' + t.getName());
    textureNames.set(t.getName(), id);
    textureResources.set(id, {id, bytes: Math.ceil(size[0] * size[1] * 4 * 4 / 3)});
  }
  return {
    bounds: {min: bounds.min.toArray(), max: bounds.max.toArray()},
    center: bounds.getCenter(new Vector3()).toArray(), radius: bounds.getSize(new Vector3()).length() / 2,
    triangles, draws,
    decodedGeometryBytes: [...accessors].reduce((n, a) => n + a.getArray().byteLength, 0),
    textureResources: [...textureResources.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function subsetPrimitive(doc, primitive, sourceIndices) {
  const map = new Map(), oldVertices = [], remapped = [];
  for (const old of sourceIndices) {
    let index = map.get(old);
    if (index === undefined) { index = oldVertices.length; map.set(old, index); oldVertices.push(old); }
    remapped.push(index);
  }
  const buffer = doc.getRoot().listBuffers()[0];
  const p = primitive.clone();
  const IndexArray = oldVertices.length <= 65535 ? Uint16Array : Uint32Array;
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(IndexArray.from(remapped)).setBuffer(buffer));
  for (const semantic of primitive.listSemantics()) {
    const source = primitive.getAttribute(semantic), input = source.getArray(), width = source.getElementSize();
    const output = new input.constructor(oldVertices.length * width);
    for (let i = 0; i < oldVertices.length; i++) output.set(input.subarray(oldVertices[i] * width, (oldVertices[i] + 1) * width), i * width);
    // Raw quantized values and normalization are preserved exactly.
    p.setAttribute(semantic, doc.createAccessor().setType(source.getType()).setNormalized(source.getNormalized()).setArray(output).setBuffer(buffer));
  }
  return p;
}

function fingerprint(doc) {
  const items = [];
  for (const n of doc.getRoot().listNodes()) for (const p of n.getMesh()?.listPrimitives() ?? []) {
    items.push({name: n.getName(), matrix: n.getWorldMatrix(), count: p.getIndices()?.getCount(), material: p.getMaterial()?.getName(),
      attributes: p.listSemantics().map(s => [s, p.getAttribute(s).getType(), p.getAttribute(s).getNormalized(), arrayHash(p.getAttribute(s).getArray())])});
  }
  return items;
}

function assertRoundTrip(before, after, filename) {
  if (before.length !== after.length) throw Error('Primitive count changed: ' + filename);
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = after[i];
    if (a.name !== b.name || a.count !== b.count || a.material !== b.material || JSON.stringify(a.attributes) !== JSON.stringify(b.attributes)
      || a.matrix.some((v, j) => Math.abs(v - b.matrix[j]) > 1e-7)) throw Error('Lossless geometry/material check failed: ' + filename + ' ' + a.name);
  }
}

async function writeDerived(doc, meta, needsBatch = true) {
  // Sharing across imported floors compares complete material/texture content,
  // including sampler/UV transforms. Names alone never establish equivalence.
  if (needsBatch) {
    await doc.transform(dedup({keepUniqueNames: true, propertyTypes: [PropertyType.TEXTURE, PropertyType.MATERIAL]}));
    batching.push({...meta, ...batchCombatMap(doc)});
  }
  await doc.transform(prune({keepAttributes: true, keepExtras: false}), unpartition());
  const stats = geometryStats(doc), baseline = fingerprint(doc);
  const bytes = await io.writeBinary(doc), hash = sha(bytes), filename = `combat-071-${hash.slice(0, 24)}.glb`;
  if (bytes.length >= 3_000_000) {
    // Same-material batches span floors but do not become giant decode jobs.
    // Partition files by primitive first: draw count does not change. Only a
    // single primitive exceeding the encoded limit needs a triangle split.
    const nodes = doc.getRoot().getDefaultScene().listChildren().filter(n=>n.getMesh());
    let parts;
    if (nodes.length > 1) {
      const weight = node=>node.getMesh().listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()??0),0);
      const target = nodes.reduce((n,node)=>n+weight(node),0)/2;
      let at=0,total=0; while(at<nodes.length-1&&total<target)total+=weight(nodes[at++]);
      parts=[nodes.slice(0,at),nodes.slice(at)];
    } else {
      const node=nodes[0], primitives=node.getMesh().listPrimitives();
      if(primitives.length!==1)throw Error('Unexpected oversized multi-primitive node');
      const p=primitives[0],index=p.getIndices().getArray(),at=Math.floor(index.length/6)*3;
      if(at<3)throw Error('Single triangle or texture exceeds decode budget');
      parts=[index.subarray(0,at),index.subarray(at)].map((indices,i)=>[doc.createNode(node.getName()+'_slice'+i)
        .setMatrix(node.getWorldMatrix()).setMesh(doc.createMesh().addPrimitive(subsetPrimitive(doc,p,indices)))
        .setExtras({...node.getExtras(),visualBatchSlice:{start:i===0?0:at,count:indices.length}})]);
    }
    for(let i=0;i<parts.length;i++){
      const part=new Document().setLogger(logger);
      for(const extension of doc.getRoot().listExtensionsUsed())part.createExtension(extension.constructor).setRequired(extension.isRequired());
      part.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
      const scene=part.createScene('campus');part.getRoot().setDefaultScene(scene);
      const copied=copyToDocument(part,doc,parts[i]);for(const node of parts[i])scene.addChild(copied.get(node));
      await writeDerived(part,{...meta,cell:meta.cell+':part'+i},false);
    }
    return;
  }
  const roundTrip = await io.readBinary(bytes);
  assertRoundTrip(baseline, fingerprint(roundTrip), filename);
  const writtenStats = geometryStats(roundTrip);
  if (JSON.stringify(stats.textureResources) !== JSON.stringify(writtenStats.textureResources)) throw Error('Texture payload changed.');
  await fs.writeFile(path.join(OUT, filename), bytes);
  const {cell, sourceHashes, ...metadata} = meta;
  const chunk = {url: '/map/' + filename, kind: 'interior', ...metadata,
    combatOccluder: meta.residency === 'structure', ...writtenStats, bytes: bytes.length};
  chunks.push(chunk); generatedTriangles += chunk.triangles;
  outputs.push({sha256: hash, cell, sourceHashes, ...chunk});
}

for (const sourceChunk of manifest.chunks) {
  const sourceDoc = await io.read(path.join(PUBLIC, sourceChunk.url));
  sourceDoc.setLogger(logger);
  if (sourceDoc.getRoot().listAnimations().length || sourceDoc.getRoot().listSkins().length) throw Error('Unexpected animated source map.');
  const before = geometryStats(sourceDoc);
  sourceTriangles += before.triangles; sourceDraws += before.draws;
  if (sourceChunk.kind !== 'interior') {
    // The old name heuristic missed canteen doors, guardhouses and hedges. All
    // unclassified exterior content stays structural, keeping the accepted GLB bytes.
    const result = {...sourceChunk, ...before, residency: 'structure', combatOccluder: true};
    chunks.push(result); generatedTriangles += result.triangles;
    for (const node of sourceDoc.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      classification.push({sourceChunk: sourceChunk.url, sourceHash: sources[sourceChunk.url], sourceObject: node.getExtras().sourceObject ?? node.getName(),
        material: primitive.getMaterial()?.getName(), residency: 'structure', reason: 'conservative-exterior',
        triangles: (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3});
    }
    continue;
  }

  const groups = new Map();
  for (const node of [...sourceDoc.getRoot().listNodes()]) {
    const world = new Matrix4().fromArray(node.getWorldMatrix());
    const extras = node.getExtras();
    let primitiveNumber = 0;
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getMode() !== 4 || primitive.listTargets().length) throw Error('Unexpected non-static-triangle primitive.');
      const pos = primitive.getAttribute('POSITION'), material = primitive.getMaterial()?.getName() ?? '';
      const {residency, reason} = classifyCombatPrimitive(extras, material);
      const index = primitive.getIndices()?.getArray() ?? Uint32Array.from({length: pos.getCount()}, (_, i) => i);
      const worldPositions = new Float64Array(pos.getCount() * 3), temp = [];
      for (let i = 0; i < pos.getCount(); i++) vector.fromArray(pos.getElement(i, temp)).applyMatrix4(world).toArray(worldPositions, i * 3);
      const fixture = classifySmallFixtureTriangles(extras, material, pos.getArray(), index, worldPositions);
      const bins = new Map();
      for (let i = 0; i < index.length; i += 3) {
        let x = 0, z = 0;
        for (let j = 0; j < 3; j++) { x += worldPositions[index[i + j] * 3]; z += worldPositions[index[i + j] * 3 + 2]; }
        // Whole triangles are assigned exactly once. No clipping or altered topology.
        const triangleResidency = fixture?.detailMask[i / 3] ? 'detail' : residency;
        // Coordinates above are sums of three corners; use their centroid.
        // 24m cells keep room groups spatial while avoiding a draw per material
        // for every 8m sliver across a floor.
        const key = `${triangleResidency}_${Math.floor((x / 3) / 24)}_${Math.floor((z / 3) / 24)}`;
        let bin = bins.get(key); if (!bin) bins.set(key, bin = []);
        bin.push(index[i], index[i + 1], index[i + 2]);
      }
      if ([...bins.values()].reduce((sum, bin) => sum + bin.length, 0) !== index.length) throw Error('Partition lost triangle indices.');
      for (const [key, indices] of bins) {
        const [partResidency, ...cellParts] = key.split('_'), cell = cellParts.join('_');
        let group = groups.get(key); if (!group) groups.set(key, group = {residency: partResidency, cell, nodes: []});
        const mesh = sourceDoc.createMesh(`${node.getName()}_${primitiveNumber}_${key}`).addPrimitive(subsetPrimitive(sourceDoc, primitive, indices));
        const part = sourceDoc.createNode(`${node.getName()}_${primitiveNumber}_${key}`).setMatrix(node.getWorldMatrix()).setMesh(mesh)
          .setExtras({...extras, visualSourceChunk: path.basename(sourceChunk.url), visualSourceObject: extras.sourceObject ?? node.getName(), visualResidency: partResidency, visualCell: cell});
        group.nodes.push(part);
      }
      classification.push({sourceChunk: sourceChunk.url, sourceHash: sources[sourceChunk.url], sourceObject: extras.sourceObject ?? node.getName(),
        node: node.getName(), floor: extras.floor, room: extras.room, role: extras.role, category: extras.category, collisionRole: extras.collisionRole,
        material, residency: fixture?.detailTriangles ? 'mixed' : residency, reason: fixture?.detailTriangles ? 'reviewed-small-metal-components' : reason,
        triangles: index.length / 3, partitions: bins.size,
        ...(fixture ? {detailTriangles: fixture.detailTriangles, detailComponents: fixture.detailComponents, structureComponents: fixture.structureComponents,
          maxDetailDimensions: fixture.maxDetailDimensions, classificationMaskSha256: sha(fixture.detailMask), componentBounds: fixture.componentBounds} : {})});
      primitiveNumber++;
    }
  }

  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const doc = new Document().setLogger(logger);
    for (const extension of sourceDoc.getRoot().listExtensionsUsed()) doc.createExtension(extension.constructor).setRequired(extension.isRequired());
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method: EXTMeshoptCompression.EncoderMethod.QUANTIZE});
    const copied = copyToDocument(doc, sourceDoc, group.nodes), scene = doc.createScene('campus');
    doc.getRoot().setDefaultScene(scene);
    for (const node of group.nodes) scene.addChild(copied.get(node));
    if (group.residency === 'structure') {
      const key = `${sourceChunk.building}:${group.cell}`;
      let bucket = structureCells.get(key);
      if (!bucket) {
        const combined = new Document().setLogger(logger);
        for (const extension of sourceDoc.getRoot().listExtensionsUsed()) combined.createExtension(extension.constructor).setRequired(extension.isRequired());
        combined.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method: EXTMeshoptCompression.EncoderMethod.QUANTIZE});
        const combinedScene = combined.createScene('campus'); combined.getRoot().setDefaultScene(combinedScene);
        bucket = {doc: combined, scene: combinedScene, building: sourceChunk.building, cell: group.cell, sources: new Set()};
        structureCells.set(key, bucket);
      }
      const imported = copyToDocument(bucket.doc, doc, scene.listChildren());
      for (const node of scene.listChildren()) bucket.scene.addChild(imported.get(node));
      bucket.sources.add(sourceChunk.url);
    } else await writeDerived(doc, {floor: sourceChunk.floor, building: sourceChunk.building,
      residency: 'detail', sourceChunk: path.basename(sourceChunk.url), cell: group.cell,
      sourceHashes: {[sourceChunk.url]: sources[sourceChunk.url]}});
  }
  console.log(sourceChunk.url, '=>', groups.size, 'spatial structure/detail units');
}

for (const [, bucket] of [...structureCells].sort(([a],[b])=>a.localeCompare(b))) {
  const inputs = [...bucket.sources].sort();
  await writeDerived(bucket.doc, {building: bucket.building, residency: 'structure', cell: bucket.cell,
    sourceChunks: inputs.map(url=>path.basename(url)), sourceHashes: Object.fromEntries(inputs.map(url=>[url,sources[url]]))});
}

if (generatedTriangles !== sourceTriangles) throw Error(`Triangle conservation failed: ${sourceTriangles} -> ${generatedTriangles}`);
for (const [url, hash] of Object.entries(sources)) if (sha(await fs.readFile(path.join(PUBLIC, url))) !== hash) throw Error('Original visual GLB changed: ' + url);
for (const [name, hash] of Object.entries(protectedBefore)) if (sha(await fs.readFile(path.join(OUT, name))) !== hash) throw Error('Protected map asset changed: ' + name);

function totals(items) {
  const textures = new Map(items.flatMap(c => c.textureResources ?? []).map(t => [t.id, t]));
  return {files: items.length, bytes: items.reduce((n, c) => n + c.bytes, 0), triangles: items.reduce((n, c) => n + c.triangles, 0),
    draws: items.reduce((n, c) => n + c.draws, 0), decodedGeometryBytes: items.reduce((n, c) => n + c.decodedGeometryBytes, 0),
    uniqueTextures: textures.size, estimatedTextureBytes: [...textures.values()].reduce((n, t) => n + t.bytes, 0),
    maxFileBytes: Math.max(...items.map(c => c.bytes)), maxChunkTriangles: Math.max(...items.map(c => c.triangles))};
}
const next = {...manifest, visualRevision: VISUAL_REVISION, chunks};
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(next, null, 2) + '\n');
const index = await buildGameMapIndex(ROOT);
const report = {
  visualRevision: VISUAL_REVISION, spatialCellMetres: 24, sourceManifestSha256: SOURCE_MANIFEST_HASH, manifestSha256: index.manifestSha256,
  sourceBlenderSha256: manifest.sourceSha256, protectedHashes: protectedBefore,
  original: {files: manifest.chunks.length, bytes: manifest.chunks.reduce((n, c) => n + c.bytes, 0), triangles: sourceTriangles, draws: sourceDraws},
  result: totals(chunks), structure: totals(chunks.filter(c => c.residency === 'structure')), detail: totals(chunks.filter(c => c.residency === 'detail')),
  classificationRows: classification.length, losslessAttributeRoundTrips: outputs.length, batching,
  guarantees: ['Every source triangle assigned exactly once; no simplification, clipping, texture recompression. Opaque primitives batch within each spatial cell; world transforms bake to float32 with measured per-coordinate error <=0.00002m. Transparent primitives retain independent sorting.',
    'All original GLBs, collision, navigation and vision bytes preserved. Unknown objects default to structure.',
    'Shared image identities are content hashes; estimated texture bytes include RGBA mipmaps once per identity. Geometry estimate is decoded typed-array bytes, not measured total browser or GPU memory.'],
  limitations: ['Manifest draw counts are potential full-campus draws, not measured renderer calls. Spatial partitioning can increase total draw count while reducing the visible set.',
    'Only explicitly reviewed paper/book/print details and bounded classroom metal hardware are optional; larger metal pieces, windows, cabinets and dense foliage stay structural.',
    'Static metadata checks do not replace real-camera visual and performance acceptance.'],
  outputs,
};
await fs.writeFile(path.join(REPORT, 'map-derivation.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(REPORT, 'map-classification.json'), JSON.stringify({visualRevision: VISUAL_REVISION, sourceManifestSha256: SOURCE_MANIFEST_HASH, rows: classification}, null, 2) + '\n');
console.log(JSON.stringify({original: report.original, result: report.result, structure: report.structure, detail: report.detail, index}, null, 2));
