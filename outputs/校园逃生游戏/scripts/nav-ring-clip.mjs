/**
 * Keep source geometry outside the sunken courtyard opening.
 * A 64-sided polygon tangent to the 18.55 m disk leaves the complete disk open
 * (maximum radial excess is 2.24 cm). Source winding and linear height survive.
 * Use only for the two VR courtyard ground/ring source objects.
 */
const CENTER_X = 44, CENTER_Z = -124, RADIUS = 18.55, SIDES = 64;
const EPSILON = 1e-9;
const PLANES = Array.from({length: SIDES}, (_, index) => {
  const angle = index * Math.PI * 2 / SIDES;
  return [Math.cos(angle), Math.sin(angle)];
});

function samePoint(a, b) {
  return a.every((coordinate, index) => Math.abs(coordinate - b[index]) <= EPSILON);
}

function cleanPolygon(vertices) {
  const clean = [];
  for (const vertex of vertices) {
    if (!clean.length || !samePoint(clean.at(-1), vertex)) clean.push(vertex);
  }
  if (clean.length > 1 && samePoint(clean[0], clean.at(-1))) clean.pop();
  return clean;
}

function clipHalfPlane(polygon, nx, nz, outside) {
  const result = [];
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const da = (a[0] - CENTER_X) * nx + (a[2] - CENTER_Z) * nz - RADIUS;
    const db = (b[0] - CENTER_X) * nx + (b[2] - CENTER_Z) * nz - RADIUS;
    // A boundary belongs to the remaining inner polygon, so a polygon lying
    // on one clipping plane is never emitted twice by successive planes.
    const aInside = outside ? da > EPSILON : da <= EPSILON;
    const bInside = outside ? db > EPSILON : db <= EPSILON;
    if (aInside) result.push(a);
    if (aInside !== bInside) {
      const t = Math.max(0, Math.min(1, da / (da - db)));
      result.push(a.map((coordinate, axis) => coordinate + (b[axis] - coordinate) * t));
    }
  }
  return cleanPolygon(result);
}

function triangulate(polygon, result) {
  for (let index = 1; index < polygon.length - 1; index++) {
    const a = polygon[0], b = polygon[index], c = polygon[index + 1];
    const ab = b.map((coordinate, axis) => coordinate - a[axis]);
    const ac = c.map((coordinate, axis) => coordinate - a[axis]);
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (cross.reduce((sum, coordinate) => sum + coordinate * coordinate, 0) <= EPSILON * EPSILON) continue;
    result.push([a.slice(), b.slice(), c.slice()]);
  }
}

/** @param {number[][]} triangle world-space [x,y,z] vertices
 *  @returns {number[][][]} non-overlapping triangles outside the opening */
export function clipCourtyardTriangle(triangle) {
  if (!Array.isArray(triangle) || triangle.length !== 3 || triangle.some(vertex => !Array.isArray(vertex) || vertex.length !== 3 || vertex.some(coordinate => !Number.isFinite(coordinate)))) {
    throw new TypeError('clipCourtyardTriangle requires three finite [x,y,z] vertices.');
  }
  const result = [];
  let remaining = triangle.map(vertex => vertex.slice());
  // Emit the outer part at each plane and carry only its inner part forward.
  // Those emitted pieces partition the source triangle without overlapping.
  for (const [nx, nz] of PLANES) {
    if (remaining.length < 3) break;
    triangulate(clipHalfPlane(remaining, nx, nz, true), result);
    remaining = clipHalfPlane(remaining, nx, nz, false);
  }
  return result;
}
