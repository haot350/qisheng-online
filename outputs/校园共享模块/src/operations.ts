/** Public operational controls. No authentication or renderer dependency. */
export const MODE_ENTRIES = ['story', 'roam', 'dafei', 'escape-solo', 'escape-coop', 'escape-tdm', 'escape-ffa'] as const;
export type ModeEntry = typeof MODE_ENTRIES[number];
export interface ModeAvailability { enabled: boolean; reason: string; }
export interface Announcement {
  id: string;
  revision: number;
  title: string;
  body: string;
  priority: 'normal' | 'important';
  audiences: ModeEntry[];
  startsAt: string;
  endsAt: string | null;
  publishedAt: string;
  link?: string | null;
}
export interface GameConfig {
  revision: number;
  serverTime: string;
  modes: Record<ModeEntry, ModeAvailability>;
  announcements: Announcement[];
}
export const MODE_UNAVAILABLE_MESSAGE = '该玩法暂时不可用，请稍后再试。';
export function isModeEntry(value: unknown): value is ModeEntry {
  return typeof value === 'string' && MODE_ENTRIES.includes(value as ModeEntry);
}
export function defaultGameConfig(now = Date.now()): GameConfig {
  return { revision: 0, serverTime: new Date(now).toISOString(), modes: Object.fromEntries(MODE_ENTRIES.map(entry => [entry, { enabled: true, reason: '' }])) as GameConfig['modes'], announcements: [] };
}
