import type { Mode } from "./types";

export interface ModeCapabilities {
  photography: boolean;
  weapons: boolean;
  enemies: boolean;
  driving: boolean;
  timed: boolean;
  music: "story" | "combat" | "driving" | "running";
}

/** Rules stay in each mode; this describes which systems a session owns. */
export const MODE_CAPABILITIES: Readonly<
  Record<Mode, Readonly<ModeCapabilities>>
> = {
  story: Object.freeze({
    photography: true,
    weapons: false,
    enemies: false,
    driving: false,
    timed: false,
    music: "story",
  }),
  roam: Object.freeze({
    photography: true,
    weapons: false,
    enemies: false,
    driving: false,
    timed: false,
    music: "running",
  }),
  escape: Object.freeze({
    photography: false,
    weapons: true,
    enemies: true,
    driving: false,
    timed: true,
    music: "combat",
  }),
  dafei: Object.freeze({
    photography: false,
    weapons: false,
    enemies: true,
    driving: true,
    timed: true,
    music: "driving",
  }),
};

export function modeCapabilities(mode: Mode) {
  return MODE_CAPABILITIES[mode];
}
export function pausePolicy(session: "local" | "online") {
  return session === "online" ? ("personal" as const) : ("world" as const);
}

export interface ModeAudio {
  reset(): void;
  setEscapeMusic(music: "battle" | "run" | "off", phase: "search"): void;
  setMusicMode(mode: "driving"): void;
}

export function prepareModeAudio(
  audio: ModeAudio,
  mode: Mode,
  battle: "battle" | "run" | "off" = "battle",
) {
  audio.reset();
  const policy = modeCapabilities(mode).music;
  if (policy === "combat") audio.setEscapeMusic(battle, "search");
  else if (policy === "driving") audio.setMusicMode("driving");
  // Story owns its separate, single music slot. Roaming starts music only on running.
}
