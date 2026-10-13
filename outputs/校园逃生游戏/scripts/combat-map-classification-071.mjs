/** Explicit visual-only detail allowlist. Unknown objects and materials are structure. */
export const VISUAL_REVISION = 'v0.7.1-structure-detail';
export const SOURCE_MANIFEST_HASH = '017d2b3eaa1061133cc75bcc839eab1c4c657a4c38a4e4b8bafc34d498f0fdf0';
export const PROTECTED_MAP_HASHES = Object.freeze({
  'collision.bin': '5772de798dfac4d8e440ac44fce6891e4729b4ac5eedf21abeb4e7372fe6063e',
  'navigation.bin': '5bcaf0904e92e79f1e15509155ce90d323918fc6eae5d6621eeff402d907d4ca',
  'vision.bin': '1fbb6d4422da57592b54e5fc48bcbcd0b09003b7953958c096217829db63382a',
});

// These are pinned existing paper, book covers, printed signs and chalk decals.
// Cabinet bodies/backs, desks, glazing, door leaves and all plants remain structure.
const OFFICE_DETAILS = new Map([
  ['025', 'web_陈设_纸张米白.005'],
  ['026', 'web_办公室B_书封0.001'],
  ['027', 'web_办公室B_书封1.001'],
  ['028', 'web_办公室B_书封2.001'],
  ['029', 'web_办公室B_书封3.001'],
  ['030', 'web_办公室B_书封4.001'],
  ['031', 'web_办公室B_打印纸淡灰排版.001'],
]);
const CLASSROOM_DETAILS = new Map([
  ['022', 'web_淡灰粉笔痕.001'],
  ['038', 'web_实拍纸面_公告栏资料.001'],
  ['039', 'web_通知纸_淡粉.001'],
  ['040', 'web_通知纸_淡蓝.001'],
]);

export function classifyCombatPrimitive(extras, materialName) {
  if (!Number.isInteger(extras.floor) || !extras.room || extras.role !== 'furniture'
    || extras.category !== 'architecture_and_fixtures' || extras.collisionRole !== 'room') {
    return {residency: 'structure', reason: 'conservative-structure'};
  }
  const office = /^(?:A办公室轻量母版_9工位|B办公室轻量母版_12工位双入口)_architecture_and_fixtures_(\d{3})$/.exec(extras.sourceObject ?? '');
  if (office && OFFICE_DETAILS.get(office[1]) === materialName) {
    return {residency: 'detail', reason: 'reviewed-office-paper-and-book-covers'};
  }
  const classroom = /^教室轻量母版_36席_原窗另供_architecture_and_fixtures_(\d{3})$/.exec(extras.sourceObject ?? '');
  if (classroom && CLASSROOM_DETAILS.get(classroom[1]) === materialName) {
    return {residency: 'detail', reason: 'reviewed-wall-paper-and-chalk'};
  }
  return {residency: 'structure', reason: 'conservative-structure'};
}

/** Reviewed classroom decorative metal only. Join normal/UV seams before
 * measuring components so a large sheet cannot masquerade as tiny triangles. */
export function classifySmallFixtureTriangles(extras, materialName, rawPositions, indices, worldPositions) {
  if (extras.sourceObject !== '教室轻量母版_36席_原窗另供_architecture_and_fixtures_017'
    || materialName !== 'web_细部_香槟金属.001' || extras.role !== 'furniture'
    || extras.category !== 'architecture_and_fixtures' || extras.collisionRole !== 'room'
    || !Number.isInteger(extras.floor) || !extras.room) return null;
  const count = rawPositions.length / 3, parent = Uint32Array.from({length: count}, (_, i) => i);
  const find = i => { while (i !== parent[i]) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const positions = new Map();
  for (let i = 0; i < count; i++) {
    const key = `${rawPositions[i * 3]},${rawPositions[i * 3 + 1]},${rawPositions[i * 3 + 2]}`;
    const previous = positions.get(key);
    if (previous !== undefined) union(i, previous); else positions.set(key, i);
  }
  for (let i = 0; i < indices.length; i += 3) { union(indices[i], indices[i + 1]); union(indices[i], indices[i + 2]); }
  const components = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const key = find(indices[i]);
    let component = components.get(key);
    if (!component) components.set(key, component = {triangles: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity]});
    component.triangles.push(i / 3);
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
      const value = worldPositions[indices[i + j] * 3 + k];
      component.min[k] = Math.min(component.min[k], value); component.max[k] = Math.max(component.max[k], value);
    }
  }
  const detailMask = new Uint8Array(indices.length / 3);
  let detailTriangles = 0, detailComponents = 0;
  const maxDetailDimensions = [0, 0, 0];
  const componentBounds = [];
  for (const component of components.values()) {
    const dimensions = component.min.map((value, i) => component.max[i] - value).sort((a, b) => b - a);
    // At most 25cm long and 10cm across: hardware/lettering, never an opaque
    // cabinet, door, partition, trunk or window assembly. Larger pieces stay.
    const detail = dimensions[0] <= .25 && dimensions[1] <= .1;
    componentBounds.push({residency: detail ? 'detail' : 'structure', triangles: component.triangles.length,
      bounds: {min: component.min, max: component.max}, dimensions});
    if (!detail) continue;
    detailComponents++; detailTriangles += component.triangles.length;
    dimensions.forEach((value, i) => maxDetailDimensions[i] = Math.max(maxDetailDimensions[i], value));
    for (const triangle of component.triangles) detailMask[triangle] = 1;
  }
  return {detailMask, detailTriangles, detailComponents, structureComponents: components.size - detailComponents, maxDetailDimensions, componentBounds};
}
