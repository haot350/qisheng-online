/** Preserve valid cross-platform optional lock records pruned by Windows npm. */
export function protectOptionalRecords(previous, next) {
  next.packages ??= {};
  for (const [key, entry] of Object.entries(previous.packages ?? {})) {
    if (key && entry.optional && entry.version && entry.resolved && !next.packages[key]) next.packages[key] = structuredClone(entry);
  }
  for (const [key, entry] of Object.entries(next.packages)) if (key && entry.optional && !entry.version && !entry.link) delete next.packages[key];
  return next;
}
