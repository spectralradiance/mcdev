// Display settings both backends understand: applied after accumulation, so changing them never restarts a render.

export type ToneMap = "clamp" | "reinhard" | "aces";

export const TONE_MAP_CODE: Record<ToneMap, number> = { clamp: 0, reinhard: 1, aces: 2 };

export interface DisplaySettings {
  /** Exposure in stops (a multiplier of 2^exposure). */
  exposure: number;
  toneMap: ToneMap;
}

export const defaultDisplay: DisplaySettings = { exposure: 0, toneMap: "reinhard" };
