import {SITE_ORIGIN, type CampusFloor} from './site-config';
export type EnvironmentSettings = {
 hour: number;
 weather: 'clear' | 'overcast' | 'mist' | 'rain';
 /** Prefer a lower rendering cost; automatic quality protection also runs in normal mode. */
 smooth: boolean;
};

export type ViewState = {
 v: 1;
 zone: string;
 position: number[];
 target: number[];
 fov: number;
 environment: EnvironmentSettings;
 floor?: CampusFloor;
};

export const VIEW_ZONES = ['all', 'gate', 'admin', 'teaching', 'library', 'canteen', 'dorm', 'sports'] as const;
export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {hour: 14, weather: 'clear', smooth: false};
export const DEFAULT_VIEW: ViewState = {
 v: 1, zone: 'all', position: [180, 230, 155], target: [-40, 3, -96], fov: 40,
 environment: {...DEFAULT_ENVIRONMENT},
};

const bounded = (n: unknown, min: number, max: number): n is number =>
 typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const vector = (value: unknown, limits: number[][]): value is number[] =>
 Array.isArray(value) && value.length === 3 && value.every((n, i) => bounded(n, limits[i][0], limits[i][1]));

/** Reject untrusted URL data instead of allowing it to reach the camera or renderer. */
export function validateView(value: unknown): ViewState | null {
 if (!value || typeof value !== 'object') return null;
 const s = value as Record<string, unknown>, e = s.environment as Record<string, unknown> | undefined;
 if (s.v !== 1 || typeof s.zone !== 'string' || !VIEW_ZONES.some(zone => zone === s.zone) ||
     (s.floor !== undefined && (!Number.isInteger(s.floor) || !bounded(s.floor, 0, 4))) ||
     !vector(s.position, [[-2500, 2500], [2, 2000], [-2500, 2500]]) ||
     !vector(s.target, [[-210, 120], [0, 30], [-230, 40]]) || !bounded(s.fov, 20, 75) ||
     !e || !bounded(e.hour, 7, 18) || typeof e.weather !== 'string' || !['clear', 'overcast', 'mist', 'rain'].includes(e.weather) ||
     typeof e.smooth !== 'boolean') return null;
 const distance = Math.hypot(...s.position.map((n, i) => n - (s.target as number[])[i]));
 if (distance < 14.99 || distance > 2000.01 || s.position[1] <= s.target[1]) return null;
 return {
  v: 1, zone: s.zone, position: [...s.position], target: [...s.target], fov: s.fov,
  environment: {hour: e.hour, weather: e.weather as EnvironmentSettings['weather'], smooth: e.smooth},
  floor: s.zone === 'teaching' ? (s.floor ?? 0) as CampusFloor : 0,
 };
}

export function parseView(search: string): ViewState | null {
 try {
  const raw = new URLSearchParams(search).get('view');
  return raw && raw.length <= 4000 ? validateView(JSON.parse(raw)) : null;
 } catch { return null; }
}

export function viewUrl(view: ViewState, url: string): string {
 const safe = validateView(view);
 if (!safe) throw new Error('当前视角无法生成分享链接，请先恢复全景。');
 const result = new URL('/explore', SITE_ORIGIN);
 // Keep the original zone parameter useful to older links and viewer versions.
 result.searchParams.set('zone', safe.zone);
 result.searchParams.set('view', JSON.stringify(safe));
 return result.href;
}
