/** Visual environment only; presets never change combat visibility or simulation. */
export const WEATHER_PRESETS = ['clear', 'overcast', 'light-rain'] as const;
export type WeatherPreset = typeof WEATHER_PRESETS[number];
export interface WeatherState {
  preset: WeatherPreset;
  seed: number;
  startedAtTick: number;
}
export interface WeatherVisualProfile {
  label: string;
  sky: number;
  sun: number;
  sunIntensity: number;
  ambientIntensity: number;
  rain: number;
  wetness: number;
}
export const WEATHER_VISUALS: Readonly<Record<WeatherPreset, Readonly<WeatherVisualProfile>>> = Object.freeze({
  clear: Object.freeze({label:'晴天',sky:0xccdce3,sun:0xffefd7,sunIntensity:2.7,ambientIntensity:2.6,rain:0,wetness:0}),
  overcast: Object.freeze({label:'阴天',sky:0xb8c4ce,sun:0xe5e9ef,sunIntensity:1.6,ambientIntensity:2.8,rain:0,wetness:0}),
  'light-rain': Object.freeze({label:'小雨',sky:0xaebdc8,sun:0xe1e8ee,sunIntensity:1.4,ambientIntensity:2.8,rain:0.32,wetness:0.45}),
});
export function isWeatherPreset(value: unknown): value is WeatherPreset {
  return typeof value === 'string' && (WEATHER_PRESETS as readonly string[]).includes(value);
}
export function weatherState(preset: unknown, seed: number, startedAtTick = 0): WeatherState {
  if (!isWeatherPreset(preset)) throw new Error('INVALID_WEATHER');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('INVALID_WEATHER_SEED');
  if (!Number.isSafeInteger(startedAtTick) || startedAtTick < 0) throw new Error('INVALID_WEATHER_TICK');
  return {preset,seed,startedAtTick};
}
