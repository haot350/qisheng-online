export type RetentionState = 'checking'|'available'|'granted'|'denied'|'unsupported'|'error';
export type RetentionStorage = { persisted?:()=>Promise<boolean>; persist?:()=>Promise<boolean> };
export async function retentionStatus(storage?: RetentionStorage): Promise<RetentionState> {
  if (!storage?.persist || !storage.persisted) return 'unsupported';
  try { return await storage.persisted() ? 'granted' : 'available'; } catch { return 'error'; }
}
/** Only call from a player's explicit action, never at page startup. */
export async function requestRetention(storage?: RetentionStorage): Promise<RetentionState> {
  if (!storage?.persist) return 'unsupported';
  try { return await storage.persist() ? 'granted' : 'denied'; } catch { return 'error'; }
}
