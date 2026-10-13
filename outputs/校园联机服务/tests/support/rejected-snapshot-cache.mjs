// Isolated comparison only. Rejected by real Debian capacity measurements; not imported by production.
const scalar = (n) => Object.is(n, -0) ? '-0' : String(n);
/** Exact static rays shared only within one immutable snapshot projection batch.
 * Smoke and point radii are resolved by RecipientVisibility before these rays.
 * No actor, subject, visibility permission or previous simulation step is cached.
 */
export function snapshotQueries(world, maxEntries = 2048) {
 const rays = new Map();
 const stats = {hits: 0, misses: 0, bypasses: 0, entries: 0};
 const query = (kind, origin, direction, max) => {
  const values = [origin[0],origin[1],origin[2],direction[0],direction[1],direction[2],max];
  const cast = kind === 'physical' ? world.rayDistance : world.visionRayDistance;
  if (values.some(value => !Number.isFinite(value))) { stats.bypasses++; return cast.call(world, origin, direction, max); }
  const key = kind+'|'+values.map(scalar).join('|');
  const cached = rays.get(key);
  if (cached !== undefined) { stats.hits++; return cached; }
  stats.misses++; const value = cast.call(world, origin, direction, max);
  if (rays.size < maxEntries && Number.isFinite(value)) { rays.set(key,value); stats.entries = rays.size; } else stats.bypasses++;
  return value;
 };
 const projected = {visible: (a,b) => world.visible(a,b)};
 if (world.rayDistance) projected.rayDistance = (origin,direction,max) => query('physical',origin,direction,max);
 if (world.visionRayDistance) projected.visionRayDistance = (origin,direction,max) => query('vision',origin,direction,max);
 return {world:projected,stats};
}
