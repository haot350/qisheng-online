import {joinPrimitives} from '@gltf-transform/functions';
import {Matrix3, Matrix4, Vector3} from 'three';

/** Static opaque draw batching, limited to each streaming unit. Transparent
 * primitives retain independent sorting. UV/color bytes and material objects
 * are kept; world transforms are baked once with measured float32 error. */
export function batchCombatMap(doc) {
  const groups = new Map(), materials = doc.getRoot().listMaterials();
  let before = 0, after = 0, maxPositionError = 0, mergedPrimitives = 0;
  for (const node of doc.getRoot().listNodes()) for (const p of node.getMesh()?.listPrimitives() ?? []) {
    before++;
    if (p.getMaterial()?.getAlphaMode() === 'BLEND' || p.listTargets().length || p.getMode() !== 4) { after++; continue; }
    // Match MapScenePreparer: preserve the accepted per-mesh shadow policy.
    const shadowCaster = !/(glass|leaf|leaves|grass|floor|road|ground|玻璃|叶片|灌木|草地|地坪|地面|道路|沥青|跑道|标线|铺装|步道|石板|细缝)/i.test((p.getMaterial()?.getName() ?? '') + ' ' + node.getName());
    const key = materials.indexOf(p.getMaterial()) + '|' + shadowCaster + '|' + p.listSemantics().sort().map(s => {
      const a = p.getAttribute(s);
      return `${s}:${a.getType()}:${['POSITION','NORMAL','TANGENT'].includes(s) ? 'FLOAT' : a.getComponentType() + ':' + a.getNormalized()}`;
    }).join('|');
    let group = groups.get(key); if (!group) groups.set(key, group = []);
    group.push({node, p, shadowCaster});
  }
  const vector = new Vector3(), element = [];
  for (const group of groups.values()) {
    after++;
    if (group.length < 2) continue;
    const provenance = [];
    for (const {node, p} of group) {
      const matrix = new Matrix4().fromArray(node.getWorldMatrix()), normal = new Matrix3().getNormalMatrix(matrix);
      const mirrored = matrix.determinant() < 0;
      provenance.push({name: node.getName(), ...node.getExtras(), triangles: p.getIndices().getCount() / 3});
      for (const semantic of ['POSITION', 'NORMAL', 'TANGENT']) {
        const a = p.getAttribute(semantic); if (!a) continue;
        const size = a.getElementSize(), array = new Float32Array(a.getCount() * size);
        for (let i = 0; i < a.getCount(); i++) {
          a.getElement(i, element); vector.fromArray(element);
          if (semantic === 'POSITION') vector.applyMatrix4(matrix);
          else if (semantic === 'NORMAL') vector.applyMatrix3(normal).normalize();
          else vector.transformDirection(matrix);
          vector.toArray(array, i * size);
          if (semantic === 'POSITION') maxPositionError = Math.max(maxPositionError, Math.abs(array[i*size]-vector.x), Math.abs(array[i*size+1]-vector.y), Math.abs(array[i*size+2]-vector.z));
          if (size === 4) array[i*size+3] = element[3] * (mirrored ? -1 : 1);
        }
        p.setAttribute(semantic, doc.createAccessor().setType(a.getType()).setNormalized(false).setArray(array).setBuffer(a.getBuffer()));
      }
      if (mirrored) {
        const index = p.getIndices(), copy = index.getArray().slice();
        for (let i=0;i<copy.length;i+=3) [copy[i],copy[i+2]]=[copy[i+2],copy[i]];
        p.setIndices(doc.createAccessor().setType('SCALAR').setArray(copy).setBuffer(index.getBuffer()));
      }
    }
    const merged = joinPrimitives(group.map(x => x.p));
    // Validate every triangle corner and all raw attributes after remapping.
    let offset = 0;
    const mergedIndices = merged.getIndices().getArray();
    for (const {p} of group) {
      const indices = p.getIndices().getArray();
      for (const semantic of p.listSemantics()) {
        const input = p.getAttribute(semantic), output = merged.getAttribute(semantic);
        const src = input.getArray(), dst = output.getArray(), size = input.getElementSize();
        for (let i=0;i<indices.length;i++) for(let j=0;j<size;j++) if (src[indices[i]*size+j] !== dst[mergedIndices[offset+i]*size+j]) throw Error('Batched triangle attribute changed: '+semantic);
      }
      offset += indices.length;
    }
    const parent = doc.getRoot().getDefaultScene();
    const mesh = doc.createMesh('batched_' + (merged.getMaterial()?.getName() ?? 'default') + (group[0].shadowCaster ? '' : '_ground')).addPrimitive(merged);
    parent.addChild(doc.createNode(mesh.getName()).setMesh(mesh).setExtras({visualBatchedSources: provenance}));
    for (const {node,p} of group) {node.getMesh().removePrimitive(p); if (!node.getMesh().listPrimitives().length) node.dispose();}
    mergedPrimitives += group.length - 1;
  }
  if (maxPositionError > 0.00002) throw Error('Static batching position tolerance exceeded: ' + maxPositionError);
  return {before, after, mergedPrimitives, maxPositionError};
}
